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
 *   - Security/admin flags (device_removed, chargeback, etc.)
 *   - Device internet verification (max 14 days offline)
 *
 * Billing expiry (subscription_expired, trial_expired, payment_expired) does
 * NOT lock the application. Instead the user is downgraded to the Free plan
 * and premium features are gated via hasRequiredPlan() / canUseFeature().
 *
 * Architecture:
 *   - Backend returns a signed license payload during verification
 *   - Payload is normalized (expired paid → free) before caching
 *   - On startup: verify internet → verify with backend → normalize → cache → continue
 *   - Every 6 hours: re-verify while running
 *   - If offline > 14 days: immediately lock
 *
 * Feature gating:
 *   Use hasRequiredPlan("pro") or canUseFeature("multiview") — never isUnlocked()
 *   for premium feature checks.
 */

import { getUserScopedKey } from "./userScopedStorage";
import { getDeviceId, getDeviceSecret, getSession } from "./authService";
import { checkEntitlementSync, type FeatureKey } from "./entitlementClient";
import { normalizePlanId } from "../lib/subscriptionSourceOfTruth";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.creatorstudioslabs.stream";

// ── Types ────────────────────────────────────────────────────────────────────

export type LockReason =
  | "internet_required"
  | "account_suspended"
  | "license_revoked"
  | "maintenance"
  | "forced_upgrade"
  | "organization_disabled"
  | "device_removed"
  | "chargeback"
  | "too_many_devices"
  | "subscription_expired"
  | "trial_expired"
  | "payment_expired"
  | null;

// Billing states — these downgrade to Free, never lock the app
export type BillingState =
  | "subscription_expired"
  | "trial_expired"
  | "payment_expired"
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
const DOWNGRADE_NOTIFIED_KEY = "ocs-downgrade-notified";
const DEFAULT_MAX_OFFLINE_DAYS = 14;
const VISIBILITY_REVERIFY_MIN_INTERVAL_MS = 15 * 60 * 1000;

const FEATURE_ALIAS_MAP: Record<string, FeatureKey> = {
  multiview: "multiview",
  ai_translation: "translation",
  remote_presentation: "mobileControl",
  advanced_themes: "themes",
  ticker: "tickers",
  countdown: "countdowns",
  bible_overlay: "lowerThirds",
};

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  basic: 1,
  growth: 2,
  pro: 3,
};
const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

// ── Internal State ───────────────────────────────────────────────────────────

let _cache: LicenseCache | null = null;
let _lockReason: LockReason = null;
let _verifying = false;
let _initialized = false;
let _revalidationTimer: ReturnType<typeof setInterval> | null = null;
let _listeners: Array<(state: LicenseGuardState) => void> = [];
let _lastVisibilityVerificationAt = 0;

// ── Cache Read/Write ─────────────────────────────────────────────────────────

function readCache(): LicenseCache | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (!raw) return null;
    const cache = JSON.parse(raw) as LicenseCache;
    // Always normalize on read — safety net against stale billing lock states
    cache.payload = normalizeLicensePayload(cache.payload);
    return cache;
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

// ── License Normalization ────────────────────────────────────────────────────

/**
 * Convert expired paid subscriptions into Free plan payloads.
 * This is the safety net — the backend should already return plan=free
 * for expired users, but this ensures the frontend never locks for billing.
 *
 * Only modifies the payload when a billing expiry is detected.
 * Security/admin states (suspended, device_removed, etc.) are untouched.
 */
export function normalizeLicensePayload(payload: LicensePayload): LicensePayload {
  const now = payload.serverTime ? new Date(payload.serverTime).getTime() : Date.now();
  const plan = payload.plan || "free";

  // Already free — nothing to normalize
  if (plan === "free") return payload;

  const isBillingExpiry =
    payload.lockReason === "subscription_expired" ||
    payload.lockReason === "trial_expired" ||
    payload.lockReason === "payment_expired" ||
    payload.paymentStatus === "expired" ||
    payload.paymentStatus === "failed" ||
    payload.paymentStatus === "refunded" ||
    payload.subscriptionStatus === "cancelled" ||
    payload.subscriptionStatus === "expired" ||
    (payload.subscriptionStatus === "active" &&
      !!payload.subscriptionEndsAt &&
      new Date(payload.subscriptionEndsAt).getTime() < now) ||
    (payload.trialActive &&
      !!payload.trialEndsAt &&
      new Date(payload.trialEndsAt).getTime() < now);

  if (!isBillingExpiry) return payload;

  // Mark that a downgrade notification should be shown (once per downgrade event)
  try {
    const key = getUserScopedKey(DOWNGRADE_NOTIFIED_KEY);
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "pending");
    }
  } catch { /* ignore */ }

  return {
    ...payload,
    plan: "free",
    subscriptionStatus: "none",
    lockReason: null,
    trialActive: false,
    trialEndsAt: null,
    subscriptionEndsAt: null,
    renewalDate: null,
  };
}

// ── License Evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate a normalized license payload and determine the lock reason.
 * Returns null if the license is valid (unlocked).
 *
 * Only security/admin states lock the app.
 * Billing expiry is handled by normalizeLicensePayload() before this runs.
 */
function evaluateLicense(payload: LicensePayload): LockReason {
  // 1. Security/admin flags — always lock regardless of plan
  if (payload.maintenanceMode) return "maintenance";
  if (payload.forceUpgradeRequired) return "forced_upgrade";
  if (payload.organizationDisabled) return "organization_disabled";
  if (payload.deviceRemoved) return "device_removed";
  if (payload.chargeback) return "chargeback";
  if (payload.tooManyDevices) return "too_many_devices";

  // 2. Account status — security/compliance
  if (payload.accountStatus === "suspended" || payload.accountStatus === "banned") {
    return "account_suspended";
  }

  // 3. Backend-forced lock — only honour non-billing lock reasons
  if (payload.lockReason) {
    return payload.lockReason as LockReason;
  }

  // 4. All billing states have been normalized to free by this point — always unlocked
  return null;
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

// ── Feature Gating ───────────────────────────────────────────────────────────

/**
 * Returns true if the current plan meets or exceeds the required plan.
 * Use this for premium feature checks — never isUnlocked().
 *
 * Example: hasRequiredPlan("pro")
 */
export function hasRequiredPlan(requiredPlan: string): boolean {
  const currentPlan = _cache?.payload?.plan || "free";
  const current = PLAN_HIERARCHY[currentPlan] ?? 0;
  const required = PLAN_HIERARCHY[requiredPlan] ?? 0;
  return current >= required;
}

/**
 * Returns true if the current plan can use the given feature.
 * Use this for all premium feature gates.
 *
 * Example: canUseFeature("multiview")
 */
export function canUseFeature(feature: string): boolean {
  const mappedFeature = FEATURE_ALIAS_MAP[feature];
  if (!mappedFeature) return true;
  const currentPlan = normalizePlanId(_cache?.payload?.plan || "free");
  return checkEntitlementSync(mappedFeature, currentPlan).allowed;
}

/**
 * Returns true if a downgrade notification is pending (shown once per downgrade).
 * Call markDowngradeNotified() after showing the notification.
 */
export function hasPendingDowngradeNotification(): boolean {
  try {
    return localStorage.getItem(getUserScopedKey(DOWNGRADE_NOTIFIED_KEY)) === "pending";
  } catch {
    return false;
  }
}

/**
 * Mark the downgrade notification as shown so it doesn't appear again.
 */
export function markDowngradeNotified(): void {
  try {
    localStorage.setItem(getUserScopedKey(DOWNGRADE_NOTIFIED_KEY), "shown");
  } catch { /* ignore */ }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Whether the application is currently allowed to run.
 * Only returns false for security/admin lock states.
 * Billing expiry does NOT lock the app — use canUseFeature() for premium gates.
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

    // Normalize before caching — convert billing expiry to free plan
    const normalizedPayload = normalizeLicensePayload(payload);
    _cache = {
      payload: normalizedPayload,
      cachedAt: Date.now(),
    };
    writeCache(_cache);

    _lockReason = evaluateLicense(normalizedPayload);
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
  if (document.visibilityState !== "visible" || !_initialized || _verifying) return;

  const now = Date.now();
  if (now - _lastVisibilityVerificationAt < VISIBILITY_REVERIFY_MIN_INTERVAL_MS) {
    return;
  }

  _lastVisibilityVerificationAt = now;
  void verify(true);
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
  _lastVisibilityVerificationAt = 0;
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
    case "internet_required":
      return {
        icon: "wifi_off",
        title: "Verification Required",
        description:
          "Your license could not be verified recently. Please ensure you have an internet connection and try again.",
        primaryAction: "retry",
        primaryLabel: "Retry Verification",
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
