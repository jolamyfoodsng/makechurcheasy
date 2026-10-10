/**
 * versionGate.ts — Server-side version enforcement
 *
 * Blocks desktop app versions below the admin-configured minimum from
 * accessing protected API endpoints. The minimum version is read from
 * the PLATFORM_SETTINGS collection in MongoDB (managed via the admin UI)
 * and cached in memory for 60 seconds to avoid a DB hit on every request.
 *
 * The desktop app sends its version in the X-App-Version header.
 * Browsers (web frontend) don't send this header — they are not gated.
 */

import { getPlatformSettings } from "./platformSettings";

// ── In-memory cache ──

let cachedMinVersion: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Fetch the minimum supported version from the database.
 * Cached in memory to avoid a DB call on every request.
 */
export async function getMinimumVersion(): Promise<string> {
  const now = Date.now();
  if (cachedMinVersion !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedMinVersion;
  }
  try {
    const settings = await getPlatformSettings();
    cachedMinVersion = settings.appUpdates.minimumSupportedVersion || "";
    cacheTimestamp = now;
    return cachedMinVersion;
  } catch {
    // If DB is unreachable, return last cached value (or empty = no floor)
    return cachedMinVersion ?? "";
  }
}

function parseVersion(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isBelowMinimum(version: string, minimum: string): boolean {
  if (!minimum) return false; // Empty string = no floor enforced
  const [a, b, c] = parseVersion(version);
  const [mA, mB, mC] = parseVersion(minimum);
  if (a !== mA) return a < mA;
  if (b !== mB) return b < mB;
  return c < mC;
}

export interface EnforcementWindow {
  /** ms epoch when the policy started, or null when unknown */
  startedAtMs: number | null;
  /** ms epoch when old versions get blocked */
  deadlineAtMs: number | null;
  graceHours: number;
  /** true once the grace period is over (or there never was one) */
  expired: boolean;
}

/**
 * The forced-update countdown. Old versions keep working until the deadline
 * (enforcementStartedAt + gracePeriodHours); after that they are blocked.
 * With no grace period, or no usable start time, enforcement is immediate.
 */
export function getEnforcementWindow(
  appUpdates: {
    enforcementStartedAt?: string | null;
    policyPublishedAt?: string | null;
    gracePeriodHours?: number | null;
  },
  now: number = Date.now(),
): EnforcementWindow {
  const graceHours = Math.max(0, Number(appUpdates.gracePeriodHours) || 0);
  const parsed = Date.parse(
    String(appUpdates.enforcementStartedAt || appUpdates.policyPublishedAt || ""),
  );
  const startedAtMs = Number.isFinite(parsed) && parsed > 86_400_000 ? parsed : null;
  if (graceHours <= 0 || startedAtMs === null) {
    return { startedAtMs, deadlineAtMs: startedAtMs, graceHours, expired: true };
  }
  const deadlineAtMs = startedAtMs + graceHours * 3_600_000;
  return { startedAtMs, deadlineAtMs, graceHours, expired: now >= deadlineAtMs };
}

/**
 * The minimum version that is being enforced RIGHT NOW (force updates on and
 * the grace period over), or "" when nothing should be blocked yet.
 */
export async function getActiveMinimumVersion(): Promise<string> {
  try {
    const settings = await getPlatformSettings();
    const { appUpdates } = settings;
    if (!appUpdates.forceUpdatesEnabled) return "";
    if (!appUpdates.minimumSupportedVersion) return "";
    return getEnforcementWindow(appUpdates).expired
      ? appUpdates.minimumSupportedVersion
      : "";
  } catch {
    return "";
  }
}

/**
 * Desktop clients can explicitly defer an update when an operator needs to
 * keep the installed version running. This never bypasses maintenance mode
 * or account/license checks; it only skips the version floor.
 */
export function shouldDeferDesktopUpdate(request: Request): boolean {
  const header =
    request.headers.get("x-mce-update-policy") ||
    request.headers.get("x-mce-skip-update-gate");
  const normalizedHeader = String(header || "").trim().toLowerCase();
  if (["defer", "skip", "true", "1", "yes"].includes(normalizedHeader)) return true;

  const policy = new URL(request.url).searchParams.get("updatePolicy");
  return String(policy || "").trim().toLowerCase() === "defer";
}

/**
 * Check the X-App-Version header against the minimum version.
 *
 * Returns null if the request is allowed (no header = browser, or version is OK).
 * Returns a 403 Response if the version is too old AND force-updates are enabled.
 */
export async function checkVersionGate(request: Request): Promise<Response | null> {
  if (shouldDeferDesktopUpdate(request)) return null;
  const version = request.headers.get("x-app-version");
  if (!version) return null; // No header = web browser or unknown client — pass through

  let forceUpdatesEnabled = false;
  let minimum = "";
  let graceExpired = true;
  try {
    const settings = await getPlatformSettings();
    forceUpdatesEnabled = settings.appUpdates.forceUpdatesEnabled;
    minimum = settings.appUpdates.minimumSupportedVersion || "";
    graceExpired = getEnforcementWindow(settings.appUpdates).expired;
    cachedMinVersion = minimum;
    cacheTimestamp = Date.now();
  } catch {
    return null; // If settings unavailable, don't block
  }

  if (!forceUpdatesEnabled) return null; // Force-updates off — skip the gate
  if (!minimum) return null; // No floor configured — allow through
  // Inside the grace period old versions keep working; the app itself shows
  // the countdown. The block starts at the deadline.
  if (!graceExpired) return null;

  if (isBelowMinimum(version, minimum)) {
    return Response.json(
      {
        error: "VERSION_TOO_OLD",
        minimumVersion: minimum,
        message: `This version (v${version}) is no longer supported. Please update to v${minimum} or later.`,
      },
      { status: 403 }
    );
  }
  return null; // Version is OK
}

export { isBelowMinimum, parseVersion };
