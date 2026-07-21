import {
  getDesktopConfig,
  readDesktopConfigCache,
  refreshDesktopConfig,
  type DesktopConfig,
} from "./desktopConfig";
import { coerce, gt, gte, lt } from "semver";

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
  maintenanceMode: boolean;
  emergencyLockDelay: number; // hours (0 = immediate, 24/48/72 = delayed)
  minimumSupportedVersion: string;
  gracePeriodHours: number;
  updateMessage: string;
  latestVersion: string;
  emergencyLockMessage: string;
  windowsDownloadUrl: string;
  macDownloadUrl: string;
  linuxDownloadUrl: string;
  releaseNotesUrl: string;
  policyPublishedAt: string;
  emergencyLockEnabledAt: string | null;
  emergencyLockEffectiveAt: string | null;
}

export type LockType = "forced-update" | "emergency-lock";

/** What's stored in localStorage — the local source of truth */
export interface ForcedUpdateRecord {
  /** Signature of the current enforcement policy */
  policyKey: string;
  /** ISO timestamp when the countdown started */
  startedAt: string;
  /** ISO timestamp when access becomes restricted */
  lockAt: string | null;
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
  /** ISO timestamp when the app becomes blocked */
  lockAt: string | null;
  /** Custom update message from admin */
  updateMessage: string;
  /** Current app version */
  currentVersion: string;
  /** Manual download URL for the current platform */
  downloadUrl: string;
  /** Release notes URL configured by admin */
  releaseNotesUrl: string;
  /** Whether we're still loading settings */
  loading: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SETTINGS_CACHE_KEY = "ocs-forced-update-settings-v2";
const RECORD_KEY = "ocs-forced-update-record-v1";
const DISMISS_KEY = "ocs-forced-update-dismiss-v1";
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Milestones (hours remaining) at which the overlay re-appears after dismiss */
const MILESTONES = [24, 12, 6, 1];
/** Minimum hours between re-shows (cooldown) */
const RE_SHOW_COOLDOWN_HOURS = 4;

// ── Version parsing ────────────────────────────────────────────────────────

function normalizeVersion(v: string): string | null {
  return coerce(v)?.version ?? null;
}

function isBelowVersion(current: string, target: string): boolean {
  const currentVersion = normalizeVersion(current);
  const targetVersion = normalizeVersion(target);
  if (!currentVersion || !targetVersion) return false;
  return lt(currentVersion, targetVersion);
}

function isVersionAtOrAbove(current: string, target: string): boolean {
  const currentVersion = normalizeVersion(current);
  const targetVersion = normalizeVersion(target);
  if (!currentVersion || !targetVersion) return false;
  return gte(currentVersion, targetVersion);
}

function isNewerVersion(current: string, target: string): boolean {
  const currentVersion = normalizeVersion(current);
  const targetVersion = normalizeVersion(target);
  if (!currentVersion || !targetVersion) return false;
  return gt(targetVersion, currentVersion);
}

function getCurrentVersion(currentVersion?: string): string {
  return currentVersion || (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0");
}

function detectPlatform(): "windows" | "mac" | "linux" {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Mac") || ua.includes("Macintosh")) return "mac";
  return "linux";
}

function getDownloadUrlForCurrentPlatform(settings: AppVersionSettings): string {
  const platform = detectPlatform();
  if (platform === "windows") return settings.windowsDownloadUrl || "";
  if (platform === "mac") return settings.macDownloadUrl || "";
  return settings.linuxDownloadUrl || "";
}

function buildEnforcementPolicyKey(settings: AppVersionSettings): string {
  return JSON.stringify({
    forceUpdatesEnabled: settings.forceUpdatesEnabled,
    minimumSupportedVersion: settings.minimumSupportedVersion,
    gracePeriodHours: settings.gracePeriodHours,
    emergencyLock: settings.emergencyLock,
    emergencyLockDelay: settings.emergencyLockDelay,
    maintenanceMode: settings.maintenanceMode,
    emergencyLockEnabledAt: settings.emergencyLockEnabledAt,
    emergencyLockEffectiveAt: settings.emergencyLockEffectiveAt,
  });
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

  // Milestones ALWAYS override cooldown — if the user dismissed at 7h and
  // the 6h milestone is crossed 30 minutes later, re-show immediately.
  const prevHours = dismiss.hoursRemainingAtDismiss;
  for (const milestone of MILESTONES) {
    if (prevHours > milestone && hoursRemaining <= milestone) {
      return true; // crossed this milestone
    }
  }

  const hoursSinceDismiss = (Date.now() - dismiss.dismissedAt) / (60 * 60 * 1000);

  // Cooldown: don't re-show within 4 hours of dismiss (unless milestone crossed above)
  if (hoursSinceDismiss < RE_SHOW_COOLDOWN_HOURS) return false;

  // Cooldown expired but no milestone — re-show anyway (nag mode)
  return true;
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

function computeRemainingHours(lockAt: string | null): number {
  if (!lockAt) return 0;
  const remainingMs = new Date(lockAt).getTime() - Date.now();
  return Math.max(0, remainingMs / (60 * 60 * 1000));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch app version settings from the backend.
 * Falls back to cache on network error.
 */
export async function fetchAppSettings(): Promise<AppVersionSettings | null> {
  try {
    const config = await getDesktopConfig();
    const settings = mapDesktopConfigToAppSettings(config);
    cacheSettings(settings);
    return settings;
  } catch (err) {
    console.warn("[forcedUpdate] Fetch failed, trying cache:", err);
    const cachedConfig = readDesktopConfigCache();
    if (cachedConfig) {
      const settings = mapDesktopConfigToAppSettings(cachedConfig);
      cacheSettings(settings);
      return settings;
    }
    return getCachedSettings();
  }
}

export async function refreshAppSettings(): Promise<AppVersionSettings | null> {
  try {
    const config = await refreshDesktopConfig();
    const settings = mapDesktopConfigToAppSettings(config);
    cacheSettings(settings);
    return settings;
  } catch (err) {
    console.warn("[forcedUpdate] Refresh failed, trying cache:", err);
    const cachedConfig = readDesktopConfigCache();
    if (cachedConfig) {
      const settings = mapDesktopConfigToAppSettings(cachedConfig);
      cacheSettings(settings);
      return settings;
    }
    return getCachedSettings();
  }
}

function mapDesktopConfigToAppSettings(config: DesktopConfig): AppVersionSettings {
  return {
    forceUpdatesEnabled: config.appUpdates.forceUpdatesEnabled ?? false,
    emergencyLock: config.appUpdates.emergencyLock ?? false,
    maintenanceMode: config.security.maintenanceMode ?? false,
    emergencyLockDelay: config.appUpdates.emergencyLockDelay ?? 0,
    minimumSupportedVersion: config.appUpdates.minimumSupportedVersion ?? "",
    gracePeriodHours: config.appUpdates.gracePeriodHours ?? 0,
    updateMessage: config.appUpdates.updateMessage ?? "A newer version is required.",
    latestVersion:
      config.appUpdates.latestVersion ??
      config.appUpdates.minimumSupportedVersion ??
      "",
    emergencyLockMessage:
      config.appUpdates.emergencyLockMessage ??
      "MakeChurchEasy is temporarily unavailable due to emergency maintenance.",
    windowsDownloadUrl: config.appUpdates.windowsDownloadUrl ?? "",
    macDownloadUrl: config.appUpdates.macDownloadUrl ?? "",
    linuxDownloadUrl: config.appUpdates.linuxDownloadUrl ?? "",
    releaseNotesUrl: config.appUpdates.releaseNotesUrl ?? "",
    policyPublishedAt: config.appUpdates.policyPublishedAt ?? new Date(0).toISOString(),
    emergencyLockEnabledAt: config.appUpdates.emergencyLockEnabledAt ?? null,
    emergencyLockEffectiveAt: config.appUpdates.emergencyLockEffectiveAt ?? null,
  };
}

export interface PolicyUpdateNotice {
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string;
  releaseNotesUrl: string;
  message: string;
}

export function getPolicyUpdateNotice(
  settings: AppVersionSettings | null,
  currentVersion?: string,
): PolicyUpdateNotice | null {
  if (!settings) return null;
  const version = getCurrentVersion(currentVersion);
  if (!settings.latestVersion || !isNewerVersion(version, settings.latestVersion)) return null;
  if (settings.minimumSupportedVersion && isBelowVersion(version, settings.minimumSupportedVersion)) return null;

  return {
    latestVersion: settings.latestVersion,
    currentVersion: version,
    downloadUrl: getDownloadUrlForCurrentPlatform(settings),
    releaseNotesUrl: settings.releaseNotesUrl,
    message: settings.updateMessage || `A newer version of MakeChurchEasy (v${settings.latestVersion}) is available.`,
  };
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
  const ver = getCurrentVersion(currentVersion);

  const base: ForcedUpdateState = {
    blocked: false,
    active: false,
    lockType: null,
    requiredVersion: "",
    hoursRemaining: null,
    gracePeriodHours: null,
    startedAt: null,
    lockAt: null,
    updateMessage: "",
    currentVersion: ver,
    downloadUrl: "",
    releaseNotesUrl: "",
    loading: !settings,
  };

  if (!settings) return base;
  const downloadUrl = getDownloadUrlForCurrentPlatform(settings);
  const policyKey = buildEnforcementPolicyKey(settings);

  // ── Step 1: Check existing local record (anti-bypass) ──
  let record = getRecord();
  if (record && record.policyKey !== policyKey) {
    clearRecord();
    clearDismissInfo();
    record = null;
  }

  if (record) {
    if (record.lockType === "forced-update" && isVersionAtOrAbove(ver, record.requiredVersion)) {
      clearRecord();
      clearDismissInfo();
      return {
        ...base,
        updateMessage: settings.updateMessage,
        releaseNotesUrl: settings.releaseNotesUrl,
        downloadUrl,
        loading: false,
      };
    }

    const serverStillLocking =
      (record.lockType === "emergency-lock" && (settings.emergencyLock || settings.maintenanceMode)) ||
      (record.lockType === "forced-update" &&
        settings.forceUpdatesEnabled &&
        isBelowVersion(ver, settings.minimumSupportedVersion));

    if (!serverStillLocking) {
      clearRecord();
      clearDismissInfo();
      return {
        ...base,
        updateMessage: settings.updateMessage,
        releaseNotesUrl: settings.releaseNotesUrl,
        downloadUrl,
        loading: false,
      };
    }

    const hoursRemaining =
      record.lockAt && record.gracePeriodHours > 0
        ? computeRemainingHours(record.lockAt)
        : 0;
    const blocked = !record.lockAt || hoursRemaining <= 0;

    return {
      blocked,
      active: true,
      lockType: record.lockType,
      requiredVersion: record.requiredVersion,
      hoursRemaining: record.gracePeriodHours > 0 ? hoursRemaining : null,
      gracePeriodHours: record.gracePeriodHours > 0 ? record.gracePeriodHours : null,
      startedAt: record.startedAt,
      lockAt: record.lockAt,
      updateMessage:
        record.lockType === "emergency-lock"
          ? settings.emergencyLockMessage
          : settings.updateMessage,
      currentVersion: ver,
      downloadUrl,
      releaseNotesUrl: settings.releaseNotesUrl,
      loading: false,
    };
  }

  // ── Step 2: No local record — check if server wants to trigger one ──

  // Emergency lock
  if (settings.emergencyLock || settings.maintenanceMode) {
    const startedAt =
      settings.emergencyLockEnabledAt ||
      settings.policyPublishedAt ||
      new Date().toISOString();
    const delayHours = Math.max(0, settings.emergencyLockDelay || 0);
    const lockAt =
      settings.emergencyLockEffectiveAt ||
      (delayHours > 0
        ? new Date(new Date(startedAt).getTime() + delayHours * 60 * 60 * 1000).toISOString()
        : startedAt);
    setRecord({
      policyKey,
      startedAt,
      lockAt,
      lockType: "emergency-lock",
      requiredVersion: settings.minimumSupportedVersion || settings.latestVersion,
      gracePeriodHours: delayHours,
    });

    const hoursRemaining = delayHours > 0 ? computeRemainingHours(lockAt) : 0;

    return {
      blocked: hoursRemaining <= 0,
      active: true,
      lockType: "emergency-lock",
      requiredVersion: settings.minimumSupportedVersion || settings.latestVersion,
      hoursRemaining: delayHours > 0 ? hoursRemaining : null,
      gracePeriodHours: delayHours > 0 ? delayHours : null,
      startedAt,
      lockAt,
      updateMessage:
        settings.emergencyLockMessage ||
        "MakeChurchEasy is temporarily unavailable due to emergency maintenance.",
      currentVersion: ver,
      downloadUrl,
      releaseNotesUrl: settings.releaseNotesUrl,
      loading: false,
    };
  }

  // Forced updates (version gate)
  if (settings.forceUpdatesEnabled && isBelowVersion(ver, settings.minimumSupportedVersion)) {
    const startedAt = new Date().toISOString();
    const graceHours = Math.max(0, settings.gracePeriodHours || 0);
    const lockAt =
      graceHours > 0
        ? new Date(new Date(startedAt).getTime() + graceHours * 60 * 60 * 1000).toISOString()
        : startedAt;

    setRecord({
      policyKey,
      startedAt,
      lockAt,
      lockType: "forced-update",
      requiredVersion: settings.minimumSupportedVersion,
      gracePeriodHours: graceHours,
    });

    const hoursRemaining = graceHours > 0 ? computeRemainingHours(lockAt) : 0;

    return {
      blocked: hoursRemaining <= 0,
      active: true,
      lockType: "forced-update",
      requiredVersion: settings.minimumSupportedVersion,
      hoursRemaining: graceHours > 0 ? hoursRemaining : null,
      gracePeriodHours: graceHours > 0 ? graceHours : null,
      startedAt,
      lockAt,
      updateMessage: settings.updateMessage,
      currentVersion: ver,
      downloadUrl,
      releaseNotesUrl: settings.releaseNotesUrl,
      loading: false,
    };
  }

  // ── Step 3: No lock needed — clear any stale record if version is current ──
  // Don't clear if the server just temporarily disabled force updates.
  // Only clear if there's a record AND the version satisfies it.
  // (Already handled in Step 1 above.)

  return {
    ...base,
    updateMessage: settings.updateMessage,
    currentVersion: ver,
    downloadUrl,
    releaseNotesUrl: settings.releaseNotesUrl,
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
