/**
 * updateService.ts — Tauri native auto-updater
 *
 * Uses @tauri-apps/plugin-updater to:
 *   1. Check for updates against GitHub Releases (latest.json)
 *   2. Download the update binary with progress tracking
 *   3. Install the update and relaunch the app
 *
 * The updater config (pubkey, endpoint) lives in tauri.conf.json.
 * Signing key is set via TAURI_SIGNING_PRIVATE_KEY at build time.
 */

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// ── Private-repo auth ──
// For private GitHub repos, a fine-grained PAT with contents:read is injected
// at build time via VITE_UPDATER_TOKEN. This token is used for both the
// manifest fetch (check) and the binary download (downloadAndInstall).
// Create the token at: https://github.com/settings/tokens?type=beta
// Then add it as a repository secret named UPDATER_GITHUB_TOKEN.

function getUpdaterHeaders(): Record<string, string> | undefined {
  const token = (import.meta as any).env?.VITE_UPDATER_TOKEN as string | undefined;
  if (token) return { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" };
  return undefined;
}

// ── Types ──

export type { Update } from "@tauri-apps/plugin-updater";

export interface UpdateCheckResult {
  available: boolean;
  update?: Update;
  version?: string;
  currentVersion?: string;
  notes?: string;
  date?: string;
  error?: string;
}

export interface DownloadProgress {
  /** Total bytes to download (0 if unknown) */
  contentLength: number;
  /** Bytes downloaded so far */
  downloaded: number;
}

// ── Version Age / Forced Update ──

/** How old (in days) the current version can be before forced update */
const FORCE_UPDATE_DAYS = 21;
/** Show persistent (non-dismissible) update prompt after this many days */
const PERSISTENT_UPDATE_DAYS = 14;

export interface VersionAgeInfo {
  /** Days since the current version was released */
  daysOld: number;
  /** Whether the user MUST update (app locks after this) */
  forceUpdate: boolean;
  /** Whether the update prompt should be persistent (not dismissible) */
  persistent: boolean;
}

// ── Version Floor ──
// The minimum version is fetched from the server (admin-configured in MongoDB).
// No hardcoded constants — the server is the single source of truth.

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.makechurcheasy.creatorstudioslabs.stream";

function parseVersionParts(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isBelowVersionFloor(version: string, floor: string): boolean {
  if (!floor) return false; // Empty string = no floor enforced
  const [a, b, c] = parseVersionParts(version);
  const [fA, fB, fC] = parseVersionParts(floor);
  if (a !== fA) return a < fA;
  if (b !== fB) return b < fB;
  return c < fC;
}

/**
 * Fetch the minimum version from the server and check if the running
 * app is below it. Returns floor info if blocked, null if OK or on failure.
 */
export async function fetchVersionFloor(): Promise<{
  blocked: boolean;
  currentVersion: string;
  minimumVersion: string;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/api/app/version`);
    if (!res.ok) return null;
    const data = await res.json() as { minimumSupportedVersion?: string };
    const floor = data.minimumSupportedVersion || "";
    if (!floor) return null; // No floor configured

    const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
    if (isBelowVersionFloor(currentVersion, floor)) {
      return { blocked: true, currentVersion, minimumVersion: floor };
    }
    return null;
  } catch {
    // If fetch fails, don't block — let the forced update check handle it
    return null;
  }
}

// ── Offline fallback: cache last-known release date ──
// When the user is offline or hasn't updated in a while, we need a fallback
// to still compute version age and enforce the 21-day forced update.

const CACHE_KEY = "ocs-update-cache-v1";

interface UpdateCache {
  /** ISO date string from latest.json (the release pub_date) */
  date: string;
  /** The latest version tag at the time of caching */
  version: string;
}

function cacheUpdateInfo(date: string, version: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ date, version }));
  } catch {
    // localStorage unavailable — non-critical
  }
}

function getCachedUpdateInfo(): UpdateCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UpdateCache;
  } catch {
    return null;
  }
}

/**
 * Calculate how old the current version is based on the update check result.
 * Uses the release date from latest.json (returned by the updater).
 *
 * When the live check fails (offline) or returns no date, falls back to the
 * last-cached release date so the 21-day forced update still works offline.
 */
export function getVersionAge(
  updateResult: UpdateCheckResult,
  currentVersion?: string
): VersionAgeInfo {
  let date = updateResult.date;

  // Fallback: use cached date when live check has no date
  // (offline, or current version is already the latest so updater returns no date)
  if (!date) {
    const cached = getCachedUpdateInfo();
    if (cached?.date) {
      // Only use cache if versions match — avoid showing stale age for a
      // different version (e.g. user updated but cache still has old date)
      if (!currentVersion || cached.version === currentVersion) {
        date = cached.date;
      }
    }
  }

  if (!date) {
    return { daysOld: 0, forceUpdate: false, persistent: false };
  }

  const releaseDate = new Date(date);
  const now = new Date();
  const daysOld = Math.floor((now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    daysOld,
    forceUpdate: daysOld >= FORCE_UPDATE_DAYS,
    persistent: daysOld >= PERSISTENT_UPDATE_DAYS,
  };
}

// ── Check ──

/**
 * Check GitHub Releases for a newer version.
 * Returns the Update object if one is available.
 *
 * For private repos, the VITE_UPDATER_TOKEN env var (set at build time)
 * is sent as an Authorization header so the updater can access the
 * release manifest and download the update binary.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    // Add auth headers for private repo access (no-op if token not set)
    const headers = getUpdaterHeaders();
    const update = await check(headers ? { headers } : undefined);

    if (update) {

      // Cache the release date so we can compute version age even when offline
      if (update.date) {
        cacheUpdateInfo(update.date, update.version);
      }

      return {
        available: true,
        update,
        version: update.version,
        currentVersion: update.currentVersion,
        notes: update.body ?? undefined,
        date: update.date ?? undefined,
      };
    }

    return { available: false };
  } catch (err: any) {
    console.warn("[updater] Update check failed:", err);

    // When offline, fall back to cached data so the 21-day forced update
    // still works even without an internet connection
    const cached = getCachedUpdateInfo();
    if (cached) {
      return {
        available: false,
        date: cached.date,
        error: err?.message || String(err),
      };
    }

    return {
      available: false,
      error: err?.message || String(err),
    };
  }
}

// ── Download & Install ──

/**
 * Download and install an update with progress tracking.
 * After install completes, relaunches the app automatically.
 *
 * @param update - The Update object from checkForUpdate()
 * @param onProgress - Called with download progress updates
 * @param onStatusChange - Called when status changes (downloading → installing → relaunching)
 */
export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: DownloadProgress) => void,
  onStatusChange?: (status: "downloading" | "installing" | "relaunching") => void
): Promise<void> {
  onStatusChange?.("downloading");

  // Pass auth headers for private repo binary downloads
  const headers = getUpdaterHeaders();

  // Track cumulative download progress
  let totalContentLength = 0;
  let totalDownloaded = 0;

  // Download the update binary with progress tracking
  await update.download((event) => {
    switch (event.event) {
      case "Started":
        totalContentLength = event.data.contentLength ?? 0;
        totalDownloaded = 0;
        onProgress?.({ contentLength: totalContentLength, downloaded: 0 });
        break;

      case "Progress":
        totalDownloaded += event.data.chunkLength ?? 0;
        onProgress?.({ contentLength: totalContentLength, downloaded: totalDownloaded });
        break;

      case "Finished":
        break;
    }
  }, headers ? { headers } : undefined);

  onStatusChange?.("installing");

  // Install the downloaded update
  await update.install();

  onStatusChange?.("relaunching");

  // Brief pause so the user sees "Relaunching..."
  await new Promise((r) => setTimeout(r, 800));
  await relaunch();
}
