/**
 * internetVerificationService.ts — Internet Verification Grace Period
 *
 * Lightweight license/account verification. NOT an update checker.
 *
 * Tracks time since last successful server contact and applies progressive
 * grace periods:
 *   <warningDays  → normal operation (no UI)
 *   warningDays–criticalDays → dismissible warning banner
 *   criticalDays–maxOfflineDays → modal on launch
 *   >maxOfflineDays → full lock screen
 *
 * Settings are consumed from the desktop config (platform settings → Security section)
 * and cached locally for offline fallback. The verification itself hits the
 * desktop bootstrap endpoint (/api/device/bootstrap).
 */

import { getUserScopedKey } from "./userScopedStorage";
import { getDesktopConfig } from "./desktopConfig";
import { getDeviceId, getDeviceSecret, getStoredUser } from "./authService";
import { getEffectivePlan, isInTrial } from "./licenseService";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VerificationSettings {
  /** Master switch — when false, all grace period UI is suppressed */
  enabled: boolean;
  /** Days offline before dismissible warning banner appears */
  warningDays: number;
  /** Days offline before modal blocks launch */
  criticalDays: number;
  /** Days offline before full lock screen */
  maxOfflineDays: number;
  /** Hours between periodic verification attempts */
  verificationIntervalHours: number;
}

export type GracePeriodTier = "normal" | "warning" | "critical" | "required" | "locked";
export type VerificationPlanScope = "trial" | "free" | "basic" | "premium";

export interface GracePeriodState {
  tier: GracePeriodTier;
  planScope: VerificationPlanScope;
  /** Full days since last successful verification */
  daysOffline: number;
  /** Days remaining before next tier threshold (null if already at max) */
  daysUntilNextTier: number | null;
  /** Whether verification is currently in progress */
  verifying: boolean;
  /** Last verification error message (null if last attempt succeeded or none yet) */
  lastError: string | null;
  /** Whether the system is enabled */
  enabled: boolean;
  /** Whether the current modal can be dismissed */
  modalDismissible: boolean;
  /** Day threshold when internet becomes required */
  requiredDays: number | null;
}

export type Listener = (state: GracePeriodState) => void;

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.creatorstudioslabs.stream";

const SETTINGS_KEY = "ocs-internet-verification-settings";
const SETTINGS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const VERIFICATIONTimestamp_KEY = "ocs-internet-verification-last";
const BANNER_DISMISSED_KEY = "ocs-internet-verification-banner-dismissed";
const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

/** Default settings — used as offline fallback when backend is unreachable */
const DEFAULT_SETTINGS: VerificationSettings = {
  enabled: true,
  warningDays: 14,
  criticalDays: 21,
  maxOfflineDays: 28,
  verificationIntervalHours: 4,
};

interface VerificationPolicy extends VerificationSettings {
  criticalDays: number;
  requiredDays: number;
  lockDays: number | null;
  planScope: VerificationPlanScope;
}

// ── Storage helpers ──────────────────────────────────────────────────────────

function getUserKey(key: string): string {
  return getUserScopedKey(key);
}

function readTimestamp(key: string): number | null {
  try {
    const raw = localStorage.getItem(getUserKey(key));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeTimestamp(key: string, ts: number): void {
  try {
    localStorage.setItem(getUserKey(key), String(ts));
  } catch {
    // storage full or unavailable
  }
}

// ── Settings cache ───────────────────────────────────────────────────────────

interface SettingsCache {
  settings: VerificationSettings;
  fetchedAt: number;
}

function cacheSettings(settings: VerificationSettings): void {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ settings, fetchedAt: Date.now() } satisfies SettingsCache)
    );
  } catch { /* non-critical */ }
}

function getCachedSettings(): VerificationSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const cache: SettingsCache = JSON.parse(raw);
    if (Date.now() - cache.fetchedAt > SETTINGS_CACHE_TTL_MS) return null;
    return cache.settings;
  } catch {
    return null;
  }
}

/**
 * Read cached settings without TTL check — used as offline fallback
 * when the TTL-expired fetch also fails.
 */
function getCachedSettingsStale(): VerificationSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const cache: SettingsCache = JSON.parse(raw);
    return cache.settings;
  } catch {
    return null;
  }
}

// ── Settings fetch ───────────────────────────────────────────────────────────

let _settingsPromise: Promise<VerificationSettings> | null = null;

/**
 * Fetch verification settings from the desktop config (platform settings).
 * Falls back to cache on network error.
 */
export async function fetchVerificationSettings(): Promise<VerificationSettings> {
  if (_settingsPromise) return _settingsPromise;
  _settingsPromise = doFetchSettings().finally(() => { _settingsPromise = null; });
  return _settingsPromise;
}

async function doFetchSettings(): Promise<VerificationSettings> {
  try {
    const config = await getDesktopConfig();

    const settings: VerificationSettings = {
      enabled: config.security.internetVerificationEnabled,
      warningDays: Math.max(1, Math.floor(config.security.maxOfflineDays * 0.5)),
      criticalDays: Math.max(2, Math.floor(config.security.maxOfflineDays * 0.75)),
      maxOfflineDays: config.security.maxOfflineDays,
      verificationIntervalHours: config.security.verificationIntervalHours,
    };

    cacheSettings(settings);
    return settings;
  } catch {
    // Network error — try cache, then stale cache, then defaults
    return getCachedSettings() || getCachedSettingsStale() || DEFAULT_SETTINGS;
  }
}

// ── Core state ───────────────────────────────────────────────────────────────

let _settings: VerificationSettings = DEFAULT_SETTINGS;
let _state: GracePeriodState = {
  tier: "normal",
  planScope: "premium",
  daysOffline: 0,
  daysUntilNextTier: null,
  verifying: false,
  lastError: null,
  enabled: true,
  modalDismissible: true,
  requiredDays: null,
};
let _listeners: Set<Listener> = new Set();
let _periodicTimer: number | null = null;
let _initialized = false;
let _onlineHandler: (() => void) | null = null;
let _visibilityHandler: (() => void) | null = null;

function computeDaysOffline(): number {
  const lastVerified = readTimestamp(VERIFICATIONTimestamp_KEY);
  if (!lastVerified) return 0;
  const msOffline = Date.now() - lastVerified;
  return Math.floor(msOffline / (1000 * 60 * 60 * 24));
}

function getVerificationPolicy(settings: VerificationSettings): VerificationPolicy {
  const user = getStoredUser();

  if (user && isInTrial(user)) {
    return {
      ...settings,
      planScope: "trial",
      warningDays: 10,
      criticalDays: 13,
      requiredDays: 14,
      maxOfflineDays: 15,
      lockDays: null,
    };
  }

  const plan = user ? getEffectivePlan(user) : "free";
  switch (plan) {
    case "free":
      return {
        ...settings,
        planScope: "free",
        warningDays: 5,
        criticalDays: 6,
        requiredDays: 7,
        maxOfflineDays: 7,
        lockDays: null,
      };
    case "basic":
      return {
        ...settings,
        planScope: "basic",
        warningDays: 14,
        criticalDays: 18,
        requiredDays: 21,
        maxOfflineDays: 21,
        lockDays: null,
      };
    default:
      return {
        ...settings,
        planScope: "premium",
        warningDays: Math.max(1, settings.warningDays),
        criticalDays: Math.max(settings.warningDays + 1, settings.criticalDays),
        requiredDays: Math.max(settings.criticalDays + 1, settings.maxOfflineDays),
        maxOfflineDays: settings.maxOfflineDays,
        lockDays: null,
      };
  }
}

function computeTier(daysOffline: number, policy: VerificationPolicy): GracePeriodTier {
  if (!policy.enabled) return "normal";
  if (daysOffline < policy.warningDays) return "normal";
  if (daysOffline < policy.criticalDays) return "warning";
  if (daysOffline < policy.requiredDays) return "critical";
  if (policy.lockDays !== null && daysOffline >= policy.lockDays) return "locked";
  return "required";
}

function computeDaysUntilNextTier(daysOffline: number, policy: VerificationPolicy): number | null {
  if (!policy.enabled) return null;
  if (daysOffline < policy.warningDays) return policy.warningDays - daysOffline;
  if (daysOffline < policy.criticalDays) return policy.criticalDays - daysOffline;
  if (daysOffline < policy.requiredDays) return policy.requiredDays - daysOffline;
  if (policy.lockDays !== null && daysOffline < policy.lockDays) return policy.lockDays - daysOffline;
  return null;
}

function isModalDismissible(tier: GracePeriodTier): boolean {
  return tier === "critical";
}

function recomputeState(): GracePeriodState {
  const daysOffline = computeDaysOffline();
  const policy = getVerificationPolicy(_settings);
  const tier = computeTier(daysOffline, policy);
  const daysUntilNextTier = computeDaysUntilNextTier(daysOffline, policy);

  _state = {
    ..._state,
    tier,
    planScope: policy.planScope,
    daysOffline,
    daysUntilNextTier,
    modalDismissible: isModalDismissible(tier),
    requiredDays: policy.requiredDays,
    enabled: _settings.enabled,
  };
  return _state;
}

function notify(): void {
  const state = { ..._state };
  for (const listener of _listeners) {
    try { listener(state); } catch { /* listener error — don't break */ }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the verification system.
 * Fetches settings, records current time if no previous verification exists,
 * and starts periodic verification.
 *
 * Call once at app startup (after auth is confirmed).
 */
export async function initVerification(): Promise<GracePeriodState> {
  if (_initialized) return _state;
  _initialized = true;

  // Fetch settings from backend (cached)
  _settings = await fetchVerificationSettings();

  // If no previous verification timestamp exists, record now
  // (first launch — user hasn't been verified yet, but we don't want to
  // immediately lock them out)
  if (readTimestamp(VERIFICATIONTimestamp_KEY) === null) {
    writeTimestamp(VERIFICATIONTimestamp_KEY, Date.now());
  }

  recomputeState();
  notify();

  // Attempt initial verification in background
  void verify();

  // Start periodic verification
  startPeriodicVerification();
  startConnectivityListeners();

  return _state;
}

/**
 * Get current grace period state (synchronous).
 */
export function getGracePeriodState(): GracePeriodState {
  return { ..._state };
}

/**
 * Subscribe to state changes. Returns unsubscribe function.
 */
export function onGracePeriodChange(listener: Listener): () => void {
  _listeners.add(listener);
  // Emit current state immediately
  try { listener({ ..._state }); } catch { /* ignore */ }
  return () => { _listeners.delete(listener); };
}

/**
 * Attempt verification by hitting the server.
 * On success: updates lastSuccessfulVerification, recomputes tier.
 * On failure: records error, tier remains unchanged.
 */
export async function verify(): Promise<boolean> {
  if (_state.verifying) return false;

  _state = { ..._state, verifying: true, lastError: null };
  notify();

  try {
    const deviceId = getDeviceId();
    const deviceSecret = getDeviceSecret();
    const url = `${API_BASE}/api/device/bootstrap${deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ""}`;
    const res = await fetch(url, {
      headers: {
        "X-App-Version": APP_VERSION,
        ...(deviceSecret ? { "X-Device-Secret": deviceSecret } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Verification failed (HTTP ${res.status})`);
    }

    // Also refresh settings while we're online
    _settings = await fetchVerificationSettings();

    // Record successful verification
    writeTimestamp(VERIFICATIONTimestamp_KEY, Date.now());

    // Clear banner dismissed state since we're now verified
    try {
      localStorage.removeItem(getUserKey(BANNER_DISMISSED_KEY));
    } catch { /* ignore */ }

    recomputeState();
    _state = { ..._state, verifying: false, lastError: null };
    notify();
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification failed";
    _state = { ..._state, verifying: false, lastError: msg };
    notify();
    return false;
  }
}

/**
 * Dismiss the warning banner (tier "warning").
 * Stores the dismissal so the banner doesn't reappear until next launch.
 */
export function dismissWarningBanner(): void {
  writeTimestamp(BANNER_DISMISSED_KEY, Date.now());
}

/**
 * Check if the warning banner has been dismissed this session.
 */
export function isWarningBannerDismissed(): boolean {
  return readTimestamp(BANNER_DISMISSED_KEY) !== null;
}

/**
 * Manual retry — same as verify() but exposed with a different name for clarity.
 */
export async function retryVerification(): Promise<boolean> {
  return verify();
}

// ── Periodic verification ────────────────────────────────────────────────────

function startPeriodicVerification(): void {
  if (_periodicTimer !== null) return;
  const intervalMs = (_settings.verificationIntervalHours || 4) * 60 * 60 * 1000;
  _periodicTimer = window.setInterval(() => {
    void verify();
  }, intervalMs);
}

function startConnectivityListeners(): void {
  if (_onlineHandler || _visibilityHandler) return;

  _onlineHandler = () => {
    void verify();
  };
  _visibilityHandler = () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void verify();
    }
  };

  window.addEventListener("online", _onlineHandler);
  document.addEventListener("visibilitychange", _visibilityHandler);
}

function stopConnectivityListeners(): void {
  if (_onlineHandler) {
    window.removeEventListener("online", _onlineHandler);
    _onlineHandler = null;
  }
  if (_visibilityHandler) {
    document.removeEventListener("visibilitychange", _visibilityHandler);
    _visibilityHandler = null;
  }
}

function stopPeriodicVerification(): void {
  if (_periodicTimer !== null) {
    window.clearInterval(_periodicTimer);
    _periodicTimer = null;
  }
}

/**
 * Tear down the verification system.
 */
export function destroyVerification(): void {
  stopPeriodicVerification();
  stopConnectivityListeners();
  _listeners.clear();
  _initialized = false;
}
