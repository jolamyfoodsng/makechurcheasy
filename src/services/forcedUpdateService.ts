/**
 * forcedUpdateService.ts — Client-side forced update enforcement
 *
 * Design:
 *   1. Server sends the instruction (forceUpdatesEnabled, emergencyLock, etc.)
 *   2. Client stores the instruction locally (localStorage) on first detection
 *   3. From that point, enforcement is LOCAL — countdown continues offline
 *   4. Only updating the app (version >= required) clears the lock
 *
 * Anti-bypass: once a countdown record exists in localStorage, it persists
 * across internet loss, account change, logout, and app restart.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface AppVersionSettings {
  forceUpdatesEnabled: boolean;
  emergencyLock: boolean;
  emergencyLockDelay: number; // hours (0 = immediate, 24/48/72 = delayed)
  minimumSupportedVersion: string;
  gracePeriodHours: number;
  updateMessage: string;
  latestVersion: string;
}

export type LockType = "forced-update" | "emergency-lock";

/** What's stored in localStorage — the local source of truth */
export interface ForcedUpdateRecord {
  /** ISO timestamp when the countdown started */
  startedAt: string;
  /** Which type of lock triggered this */
  lockType: LockType;
  /** The version the user must update to */
  requiredVersion: string;
  /** Hours from startedAt until full lock */
  gracePeriodHours: number;
}

export interface ForcedUpdateState {
  /** Whether the app should fully block (no close button) */
  blocked: boolean;
  /** Whether a forced update is active (countdown or blocked) */
  active: boolean;
  /** The lock type */
  lockType: LockType | null;
  /** The version the user must update to */
  requiredVersion: string;
  /** Hours remaining until full lock (null = not in countdown) */
  hoursRemaining: number | null;
  /** Total grace period hours (for live countdown computation) */
  gracePeriodHours: number | null;
  /** ISO timestamp when the countdown started */
  startedAt: string | null;
  /** Custom update message from admin */
  updateMessage: string;
  /** Whether we're still loading settings */
  loading: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.makechurcheasy.creatorstudioslabs.stream";

const SETTINGS_CACHE_KEY = "ocs-forced-update-settings-v2";
const RECORD_KEY = "ocs-forced-update-record-v1";
const DISMISS_KEY = "ocs-forced-update-dismiss-v1";
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Milestones (hours remaining) at which the overlay re-appears after dismiss */
const MILESTONES = [24, 12, 6, 1];
/** Minimum hours between re-shows (cooldown) */
const RE_SHOW_COOLDOWN_HOURS = 4;

// ── Version parsing ────────────────────────────────────────────────────────

function parseVersionParts(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isBelowVersion(current: string, target: string): boolean {
  const [a, b, c] = parseVersionParts(current);
  const [tA, tB, tC] = parseVersionParts(target);
  if (a !== tA) return a < tA;
  if (b !== tB) return b < tB;
  return c < tC;
}

function isVersionAtOrAbove(current: string, target: string): boolean {
  return !isBelowVersion(current, target);
}

// ── Local record persistence (the anti-bypass core) ────────────────────────

function getRecord(): ForcedUpdateRecord | null {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ForcedUpdateRecord;
  } catch {
    return null;
  }
}

function setRecord(record: ForcedUpdateRecord): void {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    // non-critical
  }
}

function clearRecord(): void {
  try {
    localStorage.removeItem(RECORD_KEY);
  } catch {
    // non-critical
  }
}

// ── Dismiss tracking (controls when overlay re-appears) ────────────────────

interface DismissInfo {
  /** Timestamp when the user dismissed the overlay */
  dismissedAt: number;
  /** The hoursRemaining at the time of dismissal */
  hoursRemainingAtDismiss: number;
}

function getDismissInfo(): DismissInfo | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DismissInfo;
  } catch {
    return null;
  }
}

function setDismissInfo(info: DismissInfo): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(info));
  } catch {
    // non-critical
  }
}

function clearDismissInfo(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    // non-critical
  }
}

/**
 * Determine if the overlay should re-show after the user dismissed it.
 *
 * Rules:
 *   - If blocked (time expired), always show (no dismiss possible)
 *   - On first detection (no dismiss yet), show immediately
 *   - After dismiss, re-show when a milestone is crossed (24h → 12h → 6h → 1h)
 *   - After dismiss, re-show after 4-hour cooldown even without milestone
 *   - Clear dismiss info when countdown ends or version is updated
 */
export function shouldReshowOverlay(hoursRemaining: number | null): boolean {
  if (hoursRemaining === null) return false;

  const dismiss = getDismissInfo();
  if (!dismiss) return true; // never dismissed — show

  const hoursSinceDismiss = (Date.now() - dismiss.dismissedAt) / (60 * 60 * 1000);

  // Cooldown: don't re-show within 4 hours of dismiss
  if (hoursSinceDismiss < RE_SHOW_COOLDOWN_HOURS) return false;

  // Check if we've crossed a milestone since the last dismiss
  const prevHours = dismiss.hoursRemainingAtDismiss;
  for (const milestone of MILESTONES) {
    if (prevHours > milestone && hoursRemaining <= milestone) {
      return true; // crossed this milestone
    }
  }

  // Cooldown expired but no milestone — re-show anyway (nag mode)
  if (hoursSinceDismiss >= RE_SHOW_COOLDOWN_HOURS) return true;

  return false;
}

/**
 * Record that the user dismissed the overlay.
 */
export function recordOverlayDismiss(hoursRemaining: number): void {
  setDismissInfo({
    dismissedAt: Date.now(),
    hoursRemainingAtDismiss: hoursRemaining,
  });
}

// ── Settings cache (for offline fallback) ──────────────────────────────────

interface SettingsCache {
  settings: AppVersionSettings;
  fetchedAt: number;
}

function cacheSettings(settings: AppVersionSettings): void {
  try {
    localStorage.setItem(
      SETTINGS_CACHE_KEY,
      JSON.stringify({ settings, fetchedAt: Date.now() })
    );
  } catch {
    // non-critical
  }
}

function getCachedSettings(): AppVersionSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const cache: SettingsCache = JSON.parse(raw);
    if (Date.now() - cache.fetchedAt > SETTINGS_CACHE_TTL_MS) return null;
    return cache.settings;
  } catch {
    return null;
  }
}

// ── Remaining time computation ─────────────────────────────────────────────

function computeRemainingHours(startedAt: string, gracePeriodHours: number): number {
  const startMs = new Date(startedAt).getTime();
  const endMs = startMs + gracePeriodHours * 60 * 60 * 1000;
  const remainingMs = endMs - Date.now();
  return Math.max(0, remainingMs / (60 * 60 * 1000));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch app version settings from the backend.
 * Falls back to cache on network error.
 */
export async function fetchAppSettings(): Promise<AppVersionSettings | null> {
  try {
    // In dev mode the local API server may not be running — use cached
    // settings to avoid a noisy "Load failed" on every startup.
    if (import.meta.env.DEV) {
      return getCachedSettings();
    }

    const res = await fetch(`${API_BASE}/api/app/version`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const settings: AppVersionSettings = await res.json();
    cacheSettings(settings);
    return settings;
  } catch (err) {
    console.warn("[forcedUpdate] Fetch failed, trying cache:", err);
    return getCachedSettings();
  }
}

/**
 * Compute the forced update state.
 *
 * This is the core enforcement function. It:
 *   1. Checks if there's an existing local record (anti-bypass)
 *   2. If no record, checks server settings to decide if one should be created
 *   3. If a record exists, computes remaining time from local clock
 *   4. Clears the record only when the user has updated to the required version
 */
export function getForcedUpdateState(
  settings: AppVersionSettings | null,
  currentVersion?: string
): ForcedUpdateState {
  const ver = currentVersion || (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0");

  const base: ForcedUpdateState = {
    blocked: false,
    active: false,
    lockType: null,
    requiredVersion: "",
    hoursRemaining: null,
    gracePeriodHours: null,
    startedAt: null,
    updateMessage: "",
    loading: !settings,
  };

  if (!settings) return base;

  // ── Step 1: Check existing local record (anti-bypass) ──
  const record = getRecord();
  if (record) {
    // If user has updated to the required version, clear the record
    if (isVersionAtOrAbove(ver, record.requiredVersion)) {
      clearRecord();
      clearDismissInfo();
      return {
        ...base,
        updateMessage: settings.updateMessage,
      };
    }

    // If the server has turned off the lock that created this record, clear the stale record
    const serverStillLocking =
      (record.lockType === "emergency-lock" && settings.emergencyLock) ||
      (record.lockType === "forced-update" && settings.forceUpdatesEnabled &&
        (isBelowVersion(ver, settings.minimumSupportedVersion) || isBelowVersion(ver, settings.latestVersion)));

    if (!serverStillLocking) {
      clearRecord();
      clearDismissInfo();
      return {
        ...base,
        updateMessage: settings.updateMessage,
      };
    }

    // Record exists and user hasn't updated — enforce it
    const hoursRemaining = computeRemainingHours(record.startedAt, record.gracePeriodHours);
    const blocked = hoursRemaining <= 0;

    return {
      blocked,
      active: true,
      lockType: record.lockType,
      requiredVersion: record.requiredVersion,
      hoursRemaining,
      gracePeriodHours: record.gracePeriodHours,
      startedAt: record.startedAt,
      updateMessage: settings.updateMessage,
      loading: false,
    };
  }

  // ── Step 2: No local record — check if server wants to trigger one ──

  // Emergency lock
  if (settings.emergencyLock) {
    const delayHours = settings.emergencyLockDelay || 0;
    const now = new Date().toISOString();
    const requiredVersion = settings.latestVersion || settings.minimumSupportedVersion;

    // If delay is 0, immediate block (but still store the record for persistence)
    setRecord({
      startedAt: now,
      lockType: "emergency-lock",
      requiredVersion,
      gracePeriodHours: delayHours,
    });

    const hoursRemaining = delayHours > 0 ? delayHours : 0;

    return {
      blocked: hoursRemaining <= 0,
      active: true,
      lockType: "emergency-lock",
      requiredVersion,
      hoursRemaining,
      gracePeriodHours: delayHours,
      startedAt: now,
      updateMessage: settings.updateMessage || "Emergency update required. Please contact your administrator.",
      loading: false,
    };
  }

  // Forced updates (version gate)
  if (settings.forceUpdatesEnabled) {
    const belowMinimum = isBelowVersion(ver, settings.minimumSupportedVersion);
    const belowLatest = isBelowVersion(ver, settings.latestVersion);
    const requiredVersion = settings.latestVersion;

    if (belowMinimum || belowLatest) {
      const now = new Date().toISOString();
      const graceHours = belowMinimum ? 0 : settings.gracePeriodHours;

      setRecord({
        startedAt: now,
        lockType: "forced-update",
        requiredVersion,
        gracePeriodHours: graceHours,
      });

      const hoursRemaining = graceHours > 0
        ? computeRemainingHours(now, graceHours)
        : 0;

      return {
        blocked: hoursRemaining <= 0,
        active: true,
        lockType: "forced-update",
        requiredVersion,
        hoursRemaining,
        gracePeriodHours: graceHours,
        startedAt: now,
        updateMessage: settings.updateMessage,
        loading: false,
      };
    }
  }

  // ── Step 3: No lock needed — clear any stale record if version is current ──
  // Don't clear if the server just temporarily disabled force updates.
  // Only clear if there's a record AND the version satisfies it.
  // (Already handled in Step 1 above.)

  return {
    ...base,
    updateMessage: settings.updateMessage,
    loading: false,
  };
}

/**
 * Clear the forced update record.
 * Only call this after a successful app update that bumps the version.
 */
export function clearForcedUpdateRecord(): void {
  clearRecord();
}
