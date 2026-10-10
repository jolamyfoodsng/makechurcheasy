import {
  getDesktopConfig,
  readDesktopConfigCache,
  refreshDesktopConfig,
  type DesktopConfig,
} from "./desktopConfig";
import {
  fetchLatestPublishedRelease,
  type DownloadProgress,
  type UpdateInstallStatus,
} from "./updateService";
import { coerce, gt, gte, lt } from "semver";
import { getTrustedNowMs } from "./trustedClock";

export { getTrustedNowMs };

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
  /** Server-managed countdown start; null/absent on older APIs. */
  enforcementStartedAt?: string | null;
  /** When old versions get blocked, as computed by the server. */
  enforcementDeadlineAt?: string | null;
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

/** The last day of a forced-update countdown: shown in red, with a last-day notice. */
export const FINAL_DAY_HOURS = 24;

/**
 * The last half hour. From here on (and after the deadline) the update modal can
 * no longer be closed: the user has to update.
 */
export const LOCK_WINDOW_HOURS = 0.5;

/** Milestones (hours remaining) at which the overlay re-appears after dismiss */
const MILESTONES = [24, 12, 6, 1, 0.5];
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

export function getDownloadUrlForCurrentPlatform(settings: AppVersionSettings): string {
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
  const remainingMs = new Date(lockAt).getTime() - getTrustedNowMs();
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
    const settings = await reconcileWithPublishedRelease(mapDesktopConfigToAppSettings(config));
    cacheSettings(settings);
    return settings;
  } catch (err) {
    console.warn("[forcedUpdate] Fetch failed, trying cache:", err);
    const cachedConfig = readDesktopConfigCache();
    if (cachedConfig) {
      const settings = await reconcileWithPublishedRelease(mapDesktopConfigToAppSettings(cachedConfig));
      cacheSettings(settings);
      return settings;
    }
    const cachedSettings = getCachedSettings();
    return cachedSettings ? reconcileWithPublishedRelease(cachedSettings) : null;
  }
}

export async function refreshAppSettings(): Promise<AppVersionSettings | null> {
  try {
    const config = await refreshDesktopConfig();
    const settings = await reconcileWithPublishedRelease(mapDesktopConfigToAppSettings(config));
    cacheSettings(settings);
    return settings;
  } catch (err) {
    console.warn("[forcedUpdate] Refresh failed, trying cache:", err);
    const cachedConfig = readDesktopConfigCache();
    if (cachedConfig) {
      const settings = await reconcileWithPublishedRelease(mapDesktopConfigToAppSettings(cachedConfig));
      cacheSettings(settings);
      return settings;
    }
    const cachedSettings = getCachedSettings();
    return cachedSettings ? reconcileWithPublishedRelease(cachedSettings) : null;
  }
}

/**
 * Keep the admin policy aligned with a release that actually exists. The
 * admin version field is policy metadata; it must never create a phantom
 * installer or lock users above the newest published binary.
 */
async function reconcileWithPublishedRelease(
  settings: AppVersionSettings,
): Promise<AppVersionSettings> {
  // If running in a web browser context (e.g. OBS dock, remote web client),
  // native desktop binary updates cannot be applied and releases shouldn't be fetched.
  if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
    return settings;
  }
  try {
    const release = await fetchLatestPublishedRelease();
    return {
      ...settings,
      latestVersion: release.version || settings.latestVersion,
    };
  } catch {
    return settings;
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
      (!config.appUpdates.emergencyLock && config.security.maintenanceMode && config.security.maintenanceMessage?.trim())
        ? config.security.maintenanceMessage.trim()
        : config.appUpdates.emergencyLockMessage ??
      "MakeChurchEasy is temporarily unavailable due to emergency maintenance.",
    windowsDownloadUrl: config.appUpdates.windowsDownloadUrl ?? "",
    macDownloadUrl: config.appUpdates.macDownloadUrl ?? "",
    linuxDownloadUrl: config.appUpdates.linuxDownloadUrl ?? "",
    releaseNotesUrl: config.appUpdates.releaseNotesUrl ?? "",
    policyPublishedAt: config.appUpdates.policyPublishedAt ?? new Date(0).toISOString(),
    enforcementStartedAt: config.appUpdates.enforcementStartedAt ?? null,
    enforcementDeadlineAt: config.appUpdates.enforcementDeadlineAt ?? null,
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

function validIso(value?: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms > 86_400_000 ? new Date(ms).toISOString() : null;
}

/**
 * When the forced-update countdown started and when it ends. The server owns
 * both (so every computer shows the same deadline). Older APIs that send
 * neither fall back to "starts the first time this computer sees the policy".
 */
function resolveForcedUpdateWindow(
  settings: AppVersionSettings,
  graceHours: number,
): { startedAt: string; lockAt: string } {
  const startedAt =
    validIso(settings.enforcementStartedAt) ?? new Date(getTrustedNowMs()).toISOString();
  if (graceHours <= 0) return { startedAt, lockAt: startedAt };
  const lockAt =
    validIso(settings.enforcementDeadlineAt) ??
    new Date(new Date(startedAt).getTime() + graceHours * 3_600_000).toISOString();
  return { startedAt, lockAt };
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

    // The server is the authority on the deadline. If it tells us one, follow it
    // (this also repairs records made by older builds from the local clock).
    if (
      record.lockType === "forced-update" &&
      record.gracePeriodHours > 0 &&
      validIso(settings.enforcementStartedAt)
    ) {
      const win = resolveForcedUpdateWindow(settings, record.gracePeriodHours);
      if (win.startedAt !== record.startedAt || win.lockAt !== record.lockAt) {
        record = { ...record, startedAt: win.startedAt, lockAt: win.lockAt };
        setRecord(record);
      }
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
    const graceHours = Math.max(0, settings.gracePeriodHours || 0);
    const { startedAt, lockAt } = resolveForcedUpdateWindow(settings, graceHours);

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

// ── Live countdown ─────────────────────────────────────────────────────────

export interface LiveCountdown {
  /** Hours until the deadline; null when there is no countdown. */
  hoursRemaining: number | null;
  /** Whole days left, rounded up (7, 6, 5 ...); null when there is no countdown. */
  daysLeft: number | null;
  /** The deadline has passed. */
  expired: boolean;
  /** Within the last 24 hours (or already expired). */
  finalDay: boolean;
  /**
   * The update modal must not be closable. True in the last 30 minutes and after
   * the deadline, and always for a hard lock with no grace period.
   */
  modalLocked: boolean;
}

/**
 * Evaluate the countdown against the clock right now. Components call this on
 * a timer so the banner, the final-day modal lock and the expiry all flip on
 * time without waiting for the next settings poll.
 */
export function getLiveCountdown(
  state: Pick<ForcedUpdateState, "active" | "blocked" | "lockAt" | "gracePeriodHours" | "hoursRemaining">,
  nowMs: number = getTrustedNowMs(),
): LiveCountdown {
  if (!state.active) {
    return { hoursRemaining: null, daysLeft: null, expired: false, finalDay: false, modalLocked: false };
  }
  if (state.blocked || state.gracePeriodHours === null) {
    return { hoursRemaining: state.blocked ? 0 : null, daysLeft: state.blocked ? 0 : null, expired: state.blocked, finalDay: true, modalLocked: true };
  }
  const hours = state.lockAt
    ? Math.max(0, (new Date(state.lockAt).getTime() - nowMs) / 3_600_000)
    : state.hoursRemaining ?? 0;
  const expired = hours <= 0;
  const finalDay = hours <= FINAL_DAY_HOURS;
  return {
    hoursRemaining: hours,
    daysLeft: Math.ceil(hours / 24),
    expired,
    finalDay,
    modalLocked: expired || hours <= LOCK_WINDOW_HOURS,
  };
}

/** "6 days left", "23h 10m left", "42m left". Used by the top-right chip. */
export function formatTimeLeft(hours: number): string {
  if (hours <= 0) return "Update required";
  if (hours > FINAL_DAY_HOURS) {
    const days = Math.ceil(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} left`;
  }
  if (hours >= 1) {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
  }
  return `${Math.max(1, Math.ceil(hours * 60))}m left`;
}

// ── Opening the right download ─────────────────────────────────────────────

export const DEFAULT_DOWNLOAD_URL = "https://makechurcheazy.com/download";

/**
 * Open the installer page for this computer in the system browser. Falls back
 * to the general download page when the admin has not set a link for this
 * platform, so "Update now" always goes somewhere useful.
 */
export async function openUpdateDownload(url?: string | null): Promise<void> {
  const target = (url || "").trim() || DEFAULT_DOWNLOAD_URL;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(target);
  } catch {
    window.open(target, "_blank", "noopener,noreferrer");
  }
}

// ── Shared state (so the top strip and the modal agree) ────────────────────

let publishedState: ForcedUpdateState | null = null;
const stateListeners = new Set<() => void>();

/** The app shell publishes the latest evaluated state here. */
export function publishForcedUpdateState(state: ForcedUpdateState): void {
  publishedState = state;
  stateListeners.forEach((listener) => listener());
}

export function subscribeForcedUpdateState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function getPublishedForcedUpdateState(): ForcedUpdateState | null {
  return publishedState;
}

// ── Installing the update from the releases repo ───────────────────────────

/**
 * Download the newest published release and install it, inside the app. Throws
 * an Error with a message that is fine to show the user. It never sends the
 * user to a website.
 */
export async function installLatestUpdate(
  onProgress?: (progress: DownloadProgress) => void,
  onStatusChange?: (status: UpdateInstallStatus) => void,
): Promise<void> {
  if (import.meta.env.DEV) {
    throw new Error(
      "Updates can't be installed from a development build. Use the installed app to test this.",
    );
  }
  const { checkForUpdate, downloadAndInstallVerifiedUpdate } = await import("./updateService");
  const result = await checkForUpdate();
  if (!result.available || !result.update) {
    throw new Error(
      result.error
        ? `Couldn't get the update: ${result.error}`
        : "The new version isn't published yet. Please try again in a few minutes.",
    );
  }
  await downloadAndInstallVerifiedUpdate(result.update, onProgress, onStatusChange);
}

// ── Open the update modal on request (clicking the countdown) ──────────────

let modalRequests = 0;
const modalListeners = new Set<() => void>();

export function requestForcedUpdateModal(): void {
  modalRequests += 1;
  modalListeners.forEach((listener) => listener());
}

export function subscribeForcedUpdateModalRequests(listener: () => void): () => void {
  modalListeners.add(listener);
  return () => {
    modalListeners.delete(listener);
  };
}

export function getForcedUpdateModalRequestCount(): number {
  return modalRequests;
}
