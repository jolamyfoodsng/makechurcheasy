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
 * and cached locally for offline fallback. The verification itself hits an existing
 * authenticated endpoint (/api/device/profile).
 */

import { getUserScopedKey } from "./userScopedStorage";
import { getDesktopConfig } from "./desktopConfig";
import { getDeviceId, getDeviceSecret } from "./authService";

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

export type GracePeriodTier = "normal" | "warning" | "critical" | "locked";

export interface GracePeriodState {
  tier: GracePeriodTier;
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
}

export type Listener = (state: GracePeriodState) => void;

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.makechurcheasy.creatorstudioslabs.stream";

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
  daysOffline: 0,
  daysUntilNextTier: null,
  verifying: false,
  lastError: null,
  enabled: true,
};
let _listeners: Set<Listener> = new Set();
let _periodicTimer: number | null = null;
let _initialized = false;

function computeDaysOffline(): number {
  const lastVerified = readTimestamp(VERIFICATIONTimestamp_KEY);
  if (!lastVerified) return 0;
  const msOffline = Date.now() - lastVerified;
  return Math.floor(msOffline / (1000 * 60 * 60 * 24));
}

function computeTier(daysOffline: number, settings: VerificationSettings): GracePeriodTier {
  if (!settings.enabled) return "normal";
  if (daysOffline >= settings.maxOfflineDays) return "locked";
  if (daysOffline >= settings.criticalDays) return "critical";
  if (daysOffline >= settings.warningDays) return "warning";
  return "normal";
}

function computeDaysUntilNextTier(daysOffline: number, settings: VerificationSettings): number | null {
  if (!settings.enabled) return null;
  if (daysOffline < settings.warningDays) return settings.warningDays - daysOffline;
  if (daysOffline < settings.criticalDays) return settings.criticalDays - daysOffline;
  if (daysOffline < settings.maxOfflineDays) return settings.maxOfflineDays - daysOffline;
  return null; // already at max
}

function recomputeState(): GracePeriodState {
  const daysOffline = computeDaysOffline();
  const tier = computeTier(daysOffline, _settings);
  const daysUntilNextTier = computeDaysUntilNextTier(daysOffline, _settings);

  _state = {
    ..._state,
    tier,
    daysOffline,
    daysUntilNextTier,
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
    const url = `${API_BASE}/api/device/profile${deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ""}`;
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
  _listeners.clear();
  _initialized = false;
}
