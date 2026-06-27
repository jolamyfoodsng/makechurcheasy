/**
 * licenseGuard.ts — Central License & Subscription Enforcement
 *
 * SINGLE SOURCE OF TRUTH for whether the application is allowed to run.
 *
 * Every protected feature must check licenseGuard.isUnlocked() instead of
 * implementing its own subscription/trial/account logic. If any validation
 * fails, the application enters a full-screen lock state.
 *
 * Validation checks:
 *   - Account status (active vs suspended)
 *   - Subscription status (active vs cancelled vs expired)
 *   - Trial status (active vs expired)
 *   - Payment status (paid vs expired)
 *   - Device internet verification (max 14 days offline)
 *
 * Architecture:
 *   - Backend returns a signed license payload during verification
 *   - Payload is cached in localStorage (user-scoped, signed)
 *   - On startup: verify internet → verify with backend → cache → continue
 *   - Every 6 hours: re-verify while running
 *   - If offline > 14 days: immediately lock
 *
 * No page should contain logic like `if (trialExpired)`.
 * Instead: `if (!licenseGuard.isUnlocked()) { showLockScreen(); }`
 */

import { getUserScopedKey } from "./userScopedStorage";
import { getDeviceId, getDeviceSecret, getSession } from "./authService";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

// ── Types ────────────────────────────────────────────────────────────────────

export type LockReason =
  | "subscription_expired"
  | "trial_expired"
  | "internet_required"
  | "payment_expired"
  | "account_suspended"
  | "license_revoked"
  | "maintenance"
  | "forced_upgrade"
  | "organization_disabled"
  | "device_removed"
  | "chargeback"
  | "too_many_devices"
  | null;

export type AccountStatus = "active" | "suspended" | "banned";
export type SubscriptionStatus = "active" | "cancelled" | "expired" | "none";
export type PaymentStatus = "paid" | "expired" | "failed" | "refunded";

export interface LicensePayload {
  accountStatus: AccountStatus;
  subscriptionStatus: SubscriptionStatus;
  plan: string;
  trialActive: boolean;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  renewalDate: string | null;
  paymentStatus: PaymentStatus;
  internetVerificationDays: number;
  verificationIntervalHours: number;
  lastVerifiedAt: string;
  serverTime: string;
  lockReason: LockReason;
  // Future extensibility
  maintenanceMode?: boolean;
  forceUpgradeRequired?: boolean;
  forceUpgradeVersion?: string;
  organizationDisabled?: boolean;
  deviceRemoved?: boolean;
  chargeback?: boolean;
  tooManyDevices?: boolean;
}

export interface LicenseCache {
  payload: LicensePayload;
  cachedAt: number;
}

export interface LicenseGuardState {
  unlocked: boolean;
  lockReason: LockReason;
  payload: LicensePayload | null;
  verifying: boolean;
  lastVerifiedAt: number | null;
  daysOffline: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ocs-license-cache";
const DEFAULT_MAX_OFFLINE_DAYS = 14;
const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

// ── Internal State ───────────────────────────────────────────────────────────

let _cache: LicenseCache | null = null;
let _lockReason: LockReason = null;
let _verifying = false;
let _initialized = false;
let _revalidationTimer: ReturnType<typeof setInterval> | null = null;
let _listeners: Array<(state: LicenseGuardState) => void> = [];

// ── Cache Read/Write ─────────────────────────────────────────────────────────

function readCache(): LicenseCache | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (!raw) return null;
    return JSON.parse(raw) as LicenseCache;
  } catch {
    return null;
  }
}

function writeCache(cache: LicenseCache): void {
  try {
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(cache));
  } catch {
    // Storage full or unavailable
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(getUserScopedKey(STORAGE_KEY));
  } catch {
    // ignore
  }
}

// ── Subscription ─────────────────────────────────────────────────────────────

type Unsubscribe = () => void;

function emit(): void {
  const state = getState();
  for (const listener of _listeners) {
    try {
      listener(state);
    } catch {
      // Listener error — don't break the chain
    }
  }
}

// ── Internet Detection ───────────────────────────────────────────────────────

async function checkInternet(): Promise<boolean> {
  try {
    // Use a lightweight HEAD request to the API server
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_BASE}/api/health`, {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

// ── Backend Verification ─────────────────────────────────────────────────────

async function fetchLicenseFromBackend(): Promise<LicensePayload | null> {
  const session = getSession();
  const deviceId = getDeviceId();
  if (!session?.user?.id || !deviceId) return null;

  try {
    const res = await fetch(
      `${API_BASE}/api/device/license?deviceId=${encodeURIComponent(deviceId)}`,
      {
        headers: {
          "X-App-Version": APP_VERSION,
          "X-Device-Secret": getDeviceSecret() || "",
        },
      },
    );

    if (!res.ok) {
      console.warn(`[licenseGuard] Backend returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data?.license ?? null;
  } catch (err) {
    console.warn("[licenseGuard] Backend fetch failed:", err);
    return null;
  }
}

// ── License Evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate a license payload and determine the lock reason.
 * Returns null if the license is valid (unlocked).
 *
 * Checks are ordered by severity — the first failure wins.
 * The backend can also force a lock via lockReason.
 */
function evaluateLicense(payload: LicensePayload): LockReason {
  // Use serverTime to prevent client clock manipulation bypass.
  // Falls back to Date.now() if serverTime is missing (backward compat).
  const now = payload.serverTime ? new Date(payload.serverTime).getTime() : Date.now();

  // 1. Backend-forced lock (maintenance, forced upgrade, etc.)
  if (payload.lockReason) return payload.lockReason;

  // 2. Future extensibility flags
  if (payload.maintenanceMode) return "maintenance";
  if (payload.forceUpgradeRequired) return "forced_upgrade";
  if (payload.organizationDisabled) return "organization_disabled";
  if (payload.deviceRemoved) return "device_removed";
  if (payload.chargeback) return "chargeback";
  if (payload.tooManyDevices) return "too_many_devices";

  // 3. Account status
  if (payload.accountStatus === "suspended" || payload.accountStatus === "banned") {
    return "account_suspended";
  }

  // 4. Payment status (check before subscription — payment failure means subscription is invalid)
  if (payload.paymentStatus === "expired" || payload.paymentStatus === "failed" || payload.paymentStatus === "refunded") {
    return "payment_expired";
  }

  // 5. Subscription status
  if (payload.subscriptionStatus === "cancelled") {
    return "subscription_expired";
  }

  if (payload.subscriptionStatus === "active" && payload.subscriptionEndsAt) {
    if (new Date(payload.subscriptionEndsAt).getTime() < now) {
      return "subscription_expired";
    }
  }

  // 6. Trial status
  if (payload.trialActive && payload.trialEndsAt) {
    if (new Date(payload.trialEndsAt).getTime() < now) {
      return "trial_expired";
    }
  }

  // 7. Trial-only users: if trial ended and no active subscription, lock
  if (!payload.trialActive && payload.subscriptionStatus !== "active") {
    // No trial, no subscription — only free plan users reach here.
    // Free users with an active account are allowed (no lock).
    // This is intentional: the free tier should work without subscription.
  }

  return null; // All checks passed
}

/**
 * Evaluate offline validity based on the cached payload.
 * Returns "internet_required" if offline window expired, null otherwise.
 *
 * Uses cachedAt (local wall-clock when cache was written) plus the server
 * time from the payload to avoid relying solely on the client clock for
 * the offline-day calculation.
 */
function evaluateOfflineValidity(cached: LicenseCache): LockReason {
  const elapsed = Date.now() - cached.cachedAt;
  const daysOffline = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  const maxOfflineDays = cached.payload.internetVerificationDays || DEFAULT_MAX_OFFLINE_DAYS;

  if (daysOffline >= maxOfflineDays) {
    return "internet_required";
  }

  return null;
}

// ── Core State Management ────────────────────────────────────────────────────

function computeState(): void {
  const cached = _cache;
  if (!cached) {
    // No cache — not verified yet, allow during initialization
    _lockReason = null;
    return;
  }

  // First check offline validity
  const offlineReason = evaluateOfflineValidity(cached);
  if (offlineReason) {
    _lockReason = offlineReason;
    return;
  }

  // Then check the payload itself
  _lockReason = evaluateLicense(cached.payload);
}

export function getState(): LicenseGuardState {
  const cached = _cache;
  const lastVerified = cached
    ? new Date(cached.payload.lastVerifiedAt).getTime()
    : null;
  const daysOffline = lastVerified
    ? Math.floor((Date.now() - lastVerified) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    unlocked: _lockReason === null,
    lockReason: _lockReason,
    payload: cached?.payload ?? null,
    verifying: _verifying,
    lastVerifiedAt: lastVerified,
    daysOffline,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Whether the application is currently allowed to run.
 * Every protected feature should check this.
 */
export function isUnlocked(): boolean {
  return _lockReason === null;
}

/**
 * Get the current lock reason, or null if unlocked.
 */
export function getLockReason(): LockReason {
  return _lockReason;
}

/**
 * Get the cached license payload.
 */
export function getLicensePayload(): LicensePayload | null {
  return _cache?.payload ?? null;
}

/**
 * Get days the device has been offline.
 */
export function getDaysOffline(): number {
  const cached = _cache;
  if (!cached) return 0;
  const lastVerified = new Date(cached.payload.lastVerifiedAt).getTime();
  return Math.floor((Date.now() - lastVerified) / (1000 * 60 * 60 * 24));
}

/**
 * Subscribe to license state changes.
 */
export function subscribe(listener: (state: LicenseGuardState) => void): Unsubscribe {
  _listeners.push(listener);
  // Emit current state immediately
  try {
    listener(getState());
  } catch {
    // ignore
  }
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

// ── Verification Flow ────────────────────────────────────────────────────────

/**
 * Run the full verification flow:
 * 1. Check internet connectivity
 * 2. If online, fetch license from backend
 * 3. Cache the result
 * 4. Evaluate and update lock state
 *
 * Returns true if verification succeeded, false otherwise.
 */
export async function verify(allowOffline: boolean = false): Promise<boolean> {
  if (_verifying) return false;
  _verifying = true;
  emit();

  try {
    const online = await checkInternet();

    if (!online) {
      if (allowOffline) {
        // Offline but within grace period — keep existing cache
        if (_cache) {
          const offlineReason = evaluateOfflineValidity(_cache);
          _lockReason = offlineReason;
          emit();
          return _lockReason === null;
        }
        // No cache at all — must be online for first verification
        _lockReason = "internet_required";
        emit();
        return false;
      }
      // Not allowing offline — lock immediately
      _lockReason = "internet_required";
      emit();
      return false;
    }

    // Online — fetch from backend
    const payload = await fetchLicenseFromBackend();
    if (!payload) {
      // Backend unreachable or invalid response — keep existing cache if valid
      if (_cache) {
        const offlineReason = evaluateOfflineValidity(_cache);
        _lockReason = offlineReason;
        emit();
        return _lockReason === null;
      }
      // No cache and can't reach backend — don't lock, let the app proceed
      // (this is a transient failure, not a license issue)
      _lockReason = null;
      emit();
      return true;
    }

    // Success — cache and evaluate
    _cache = {
      payload,
      cachedAt: Date.now(),
    };
    writeCache(_cache);

    _lockReason = evaluateLicense(payload);
    emit();
    return _lockReason === null;
  } catch (err) {
    console.error("[licenseGuard] Verification error:", err);
    // On error, keep existing state
    return _lockReason === null;
  } finally {
    _verifying = false;
    emit();
  }
}

/**
 * Retry verification (called from lock screen "Retry" button).
 */
export async function retryVerification(): Promise<boolean> {
  return verify(false);
}

/**
 * Force an immediate re-verification against the backend.
 * Called after login/registration to ensure the license state reflects
 * the newly authenticated user's subscription.
 */
export async function reverifyOnAuth(): Promise<boolean> {
  // Reset initialized flag so initLicenseGuard can run again if needed
  // but the main purpose here is to force a fresh backend check.
  return verify(false);
}

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize the license guard. Called once on app startup.
 *
 * Startup sequence:
 * 1. Load cached license from localStorage
 * 2. Evaluate offline validity
 * 3. If online: verify with backend
 * 4. If offline: use cache if within 14-day window
 * 5. Start periodic revalidation (every 6 hours)
 */
export async function initLicenseGuard(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  // Load cached license
  _cache = readCache();

  // Evaluate initial state
  computeState();
  emit();

  // Start verification flow (non-blocking)
  const isOnline = await checkInternet();

  if (isOnline) {
    // Online — verify with backend
    await verify(true);
  } else {
    // Offline — check if within grace period
    if (_cache) {
      const offlineReason = evaluateOfflineValidity(_cache);
      _lockReason = offlineReason;
    } else {
      // No cache and offline — can't verify, but don't lock
      // (first launch without internet is handled by AuthGate)
      _lockReason = null;
    }
    emit();
  }

  // Start periodic revalidation
  startPeriodicVerification();
}

/**
 * Start the 6-hour periodic verification timer.
 * Also registers a visibilitychange listener (BUG 5) so the license is
 * re-verified when the user returns to the app after it was hidden.
 */
function startPeriodicVerification(): void {
  if (_revalidationTimer) return;

  const intervalHours = _cache?.payload?.verificationIntervalHours || 6;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  _revalidationTimer = setInterval(async () => {
    const online = await checkInternet();
    if (online) {
      await verify(true);
    } else {
      // Check offline validity
      if (_cache) {
        const offlineReason = evaluateOfflineValidity(_cache);
        if (offlineReason !== _lockReason) {
          _lockReason = offlineReason;
          emit();
        }
      }
    }
  }, intervalMs);

  // Re-verify when the user returns to the app (e.g. after sleep/switch)
  document.addEventListener("visibilitychange", _onVisibilityChange);
}

/**
 * Visibility change handler — re-verifies when tab becomes visible.
 */
function _onVisibilityChange(): void {
  if (document.visibilityState === "visible" && _initialized && !_verifying) {
    void verify(true);
  }
}

/**
 * Stop periodic verification (e.g. on logout).
 */
export function stopPeriodicVerification(): void {
  if (_revalidationTimer) {
    clearInterval(_revalidationTimer);
    _revalidationTimer = null;
  }
  document.removeEventListener("visibilitychange", _onVisibilityChange);
}

/**
 * Full reset — clear cache, stop timers, reset state.
 * Called on logout.
 */
export function resetLicenseGuard(): void {
  stopPeriodicVerification();
  _cache = null;
  _lockReason = null;
  _verifying = false;
  _initialized = false;
  clearCache();
  emit();
}

// ── React Hook ───────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";

/**
 * React hook for subscribing to license guard state.
 * Returns the current state and re-renders when it changes.
 */
export function useLicenseGuardState(): LicenseGuardState {
  const [state, setState] = useState<LicenseGuardState>(getState);

  useEffect(() => {
    return subscribe(setState);
  }, []);

  return state;
}

// ── Lock Screen Descriptions ─────────────────────────────────────────────────

export interface LockScreenConfig {
  icon: string;
  title: string;
  description: string;
  primaryAction: "retry" | "subscribe" | "contact_support";
  primaryLabel: string;
}

export function getLockScreenConfig(reason: LockReason, _payload: LicensePayload | null): LockScreenConfig {
  switch (reason) {
    case "subscription_expired":
      return {
        icon: "credit_card_off",
        title: "Subscription Required",
        description:
          "Your MakeChurchEasy subscription is no longer active. Renew your subscription to continue using the application.",
        primaryAction: "subscribe",
        primaryLabel: "Manage Subscription",
      };

    case "trial_expired":
      return {
        icon: "timer_off",
        title: "Free Trial Ended",
        description:
          "Your 14-day trial has expired. Subscribe to continue using MakeChurchEasy.",
        primaryAction: "subscribe",
        primaryLabel: "Choose a Plan",
      };

    case "internet_required":
      return {
        icon: "wifi_off",
        title: "Verification Required",
        description:
          "Your license could not be verified recently. Please ensure you have an internet connection and try again.",
        primaryAction: "retry",
        primaryLabel: "Retry Verification",
      };

    case "payment_expired":
      return {
        icon: "payment",
        title: "Payment Required",
        description:
          "Your payment method is no longer valid. Please update your payment information to continue using MakeChurchEasy.",
        primaryAction: "subscribe",
        primaryLabel: "Update Payment",
      };

    case "account_suspended":
      return {
        icon: "block",
        title: "Account Restricted",
        description:
          "Your account has been temporarily restricted. Please contact support for assistance.",
        primaryAction: "contact_support",
        primaryLabel: "Contact Support",
      };

    case "license_revoked":
      return {
        icon: "gpp_bad",
        title: "License Revoked",
        description:
          "Your license has been revoked. Please contact support for assistance.",
        primaryAction: "contact_support",
        primaryLabel: "Contact Support",
      };

    case "maintenance":
      return {
        icon: "build",
        title: "Scheduled Maintenance",
        description:
          "MakeChurchEasy is currently undergoing scheduled maintenance. Please try again shortly.",
        primaryAction: "retry",
        primaryLabel: "Retry",
      };

    case "forced_upgrade":
      return {
        icon: "system_update",
        title: "Update Required",
        description:
          "A mandatory update is required to continue using MakeChurchEasy. Please update to the latest version.",
        primaryAction: "retry",
        primaryLabel: "Check for Updates",
      };

    case "organization_disabled":
      return {
        icon: "business",
        title: "Organization Disabled",
        description:
          "Your organization's account has been disabled. Please contact your administrator.",
        primaryAction: "contact_support",
        primaryLabel: "Contact Support",
      };

    case "device_removed":
      return {
        icon: "devices_other",
        title: "Device Removed",
        description:
          "This device has been removed from your account. Please re-pair this device to continue.",
        primaryAction: "contact_support",
        primaryLabel: "Contact Support",
      };

    case "chargeback":
      return {
        icon: "report",
        title: "Payment Dispute",
        description:
          "A payment dispute has been filed for your account. Please resolve the dispute to continue using MakeChurchEasy.",
        primaryAction: "contact_support",
        primaryLabel: "Contact Support",
      };

    case "too_many_devices":
      return {
        icon: "devices",
        title: "Device Limit Reached",
        description:
          "You have reached the maximum number of devices for your plan. Please remove a device or upgrade your plan.",
        primaryAction: "subscribe",
        primaryLabel: "Manage Devices",
      };

    default:
      return {
        icon: "lock",
        title: "Access Restricted",
        description:
          "Your account requires attention. Please contact support for assistance.",
        primaryAction: "contact_support",
        primaryLabel: "Contact Support",
      };
  }
}
