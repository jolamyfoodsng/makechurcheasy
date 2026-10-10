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
import { relaunch, exit } from "@tauri-apps/plugin-process";
import { open } from "@tauri-apps/plugin-shell";
import { writeFile } from "@tauri-apps/plugin-fs";
import { tempDir, join } from "@tauri-apps/api/path";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getDesktopConfig, readDesktopConfigCache } from "./desktopConfig";
import { coerce, lt } from "semver";

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

export type UpdateInstallStatus = "downloading" | "installing" | "relaunching";

/**
 * An update whose bytes are already on disk / in memory and verified.
 * `install()` is the only step that interrupts the operator, so callers can
 * run it right away ("Update now"), when the user clicks "Restart now", or
 * when the app is being quit.
 */
export interface PreparedUpdate {
  version: string;
  source: "signed" | "installer";
  install: (options?: {
    /** Restart MakeChurchEasy after installing (default true). */
    relaunch?: boolean;
    onStatusChange?: (status: UpdateInstallStatus) => void;
  }) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

function normalizeVersion(v: string): string | null {
  return coerce(v)?.version ?? null;
}

function isBelowVersionFloor(version: string, floor: string): boolean {
  if (!floor) return false; // Empty string = no floor enforced
  const normalizedVersion = normalizeVersion(version);
  const normalizedFloor = normalizeVersion(floor);
  if (!normalizedVersion || !normalizedFloor) return false;
  return lt(normalizedVersion, normalizedFloor);
}

/**
 * Fetch the minimum version from the server and check if the running
 * app is below it. Returns floor info if blocked, null if OK or on failure.
 */
export async function fetchVersionFloor(): Promise<{
  blocked: boolean;
  currentVersion: string;
  minimumVersion: string;
  gracePeriodHours: number;
} | null> {
  try {
    const config = await getDesktopConfig().catch(() => readDesktopConfigCache());
    if (!config?.appUpdates.forceUpdatesEnabled) return null;

    const floor = config.appUpdates.minimumSupportedVersion || "";
    if (!floor) return null; // No floor configured

    const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
    if (isBelowVersionFloor(currentVersion, floor)) {
      return {
        blocked: true,
        currentVersion,
        minimumVersion: floor,
        gracePeriodHours: config.appUpdates.gracePeriodHours ?? 0,
      };
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
    // Skip update checks in dev mode — the updater endpoint is not
    // available and the plugin throws "relative URL without a base".
    if (import.meta.env.DEV) {
      return { available: false };
    }

    // Add auth headers for private repo access (no-op if token not set)
    const headers = getUpdaterHeaders();
    const update = await check(headers ? { headers } : undefined);

    if (update) {
      // Tauri trusts the endpoint's manifest, but the manifest may be stale
      // or may advertise a version that was never published. Reconcile it
      // with the source release before exposing it to the UI.
      try {
        const release = await fetchLatestPublishedRelease();
        if (!isUpdateFromPublishedRelease(update, release)) {
          console.warn(
            `[updater] Ignoring unverified update v${update.version}; published release is v${release.version}`,
          );
          return {
            available: false,
            error: `Updater manifest v${update.version} does not match the published release v${release.version}`,
          };
        }
      } catch (validationError: any) {
        console.warn("[updater] Could not validate update manifest:", validationError);
        return {
          available: false,
          error: validationError?.message || "Could not verify the published update.",
        };
      }

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

    // No update available — still return cached date for version age computation
    const cached = getCachedUpdateInfo();
    return {
      available: false,
      date: cached?.date,
    };
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
 * Download (but do not install) a signed Tauri update. The returned
 * PreparedUpdate installs it later without downloading again.
 */
export async function downloadSignedUpdate(
  update: Update,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<PreparedUpdate> {
  // Pass auth headers for private repo binary downloads
  const headers = getUpdaterHeaders();

  let totalContentLength = 0;
  let totalDownloaded = 0;

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

  return {
    version: update.version,
    source: "signed",
    install: async ({ relaunch: shouldRelaunch = true, onStatusChange } = {}) => {
      onStatusChange?.("installing");
      // Windows (passive NSIS/MSI) quits this process inside install().
      await update.install();
      if (!shouldRelaunch) return;
      onStatusChange?.("relaunching");
      // Brief pause so the user sees "Restarting..."
      await wait(800);
      await relaunch();
    },
  };
}

/**
 * Download and install an update with progress tracking, then relaunch.
 * Kept for the blocking (forced) update screens.
 */
export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: DownloadProgress) => void,
  onStatusChange?: (status: UpdateInstallStatus) => void,
): Promise<void> {
  onStatusChange?.("downloading");
  const prepared = await downloadSignedUpdate(update, onProgress);
  await prepared.install({ relaunch: true, onStatusChange });
}

// ── Published release source ──

export const LATEST_MANIFEST_URL = "https://github.com/jolamyfoodsng/makechurcheasy-releases/releases/latest/download/latest.json";
export const RELEASES_API = "https://api.github.com/repos/jolamyfoodsng/makechurcheasy-releases/releases/latest";

export interface PublishedReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface PublishedRelease {
  tag_name: string;
  version: string;
  assets: PublishedReleaseAsset[];
}

let publishedReleaseCache: { release: PublishedRelease; expiresAt: number } | null = null;
const PUBLISHED_RELEASE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function clearPublishedReleaseCache(): void {
  publishedReleaseCache = null;
}

/**
 * Read the latest real, published release from the source repository.
 * This is the version authority used to validate signed updater metadata and
 * to choose the installer fallback.
 *
 * In native Tauri: First checks latest.json (via tauriFetch, no CORS), then falls back to GitHub REST API.
 * In browser: Directly checks GitHub REST API (which includes CORS headers; latest.json S3 redirect does not).
 * Cached in-memory for 5 minutes to avoid rate limiting.
 */
export async function fetchLatestPublishedRelease(): Promise<PublishedRelease> {
  if (publishedReleaseCache && Date.now() < publishedReleaseCache.expiresAt) {
    return publishedReleaseCache.release;
  }

  const isNativeTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  // 1. Try public latest.json manifest directly (only via tauriFetch to avoid CORS errors in browser)
  if (isNativeTauri) {
    try {
      const manifestRes = await tauriFetch(LATEST_MANIFEST_URL);
      if (manifestRes.ok) {
        const manifest = (await manifestRes.json()) as {
          version?: string;
          notes?: string;
          pub_date?: string;
          platforms?: Record<string, { url?: string; signature?: string }>;
        };
        const version = normalizeVersion(manifest.version || "");
        if (version) {
          const assets: PublishedReleaseAsset[] = Object.values(manifest.platforms || {}).map((p) => {
            const url = p.url || "";
            const name = url.split("/").pop() || "";
            return { name, browser_download_url: url };
          });
          const result: PublishedRelease = {
            tag_name: `v${version}`,
            version,
            assets,
          };
          publishedReleaseCache = { release: result, expiresAt: Date.now() + PUBLISHED_RELEASE_CACHE_TTL_MS };
          return result;
        }
      }
    } catch (err) {
      console.warn("[updater] Could not fetch latest.json manifest via Tauri, falling back to GitHub API:", err);
    }
  }

  // 2. Fallback to GitHub REST API (supports CORS for browser contexts)
  let response: Response;
  const headers = getUpdaterHeaders();
  if (isNativeTauri) {
    try {
      response = await tauriFetch(RELEASES_API, headers ? { headers } : undefined);
    } catch {
      response = await fetch(RELEASES_API, headers ? { headers } : undefined);
    }
  } else {
    response = await fetch(RELEASES_API, headers ? { headers } : undefined);
  }
  if (!response.ok) throw new Error(`Failed to fetch release info (${response.status})`);

  const release = (await response.json()) as {
    tag_name?: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: PublishedReleaseAsset[];
  };
  const tagName = String(release.tag_name || "");
  const version = normalizeVersion(tagName);

  if (!version || release.draft || release.prerelease) {
    throw new Error("No valid published MakeChurchEasy release is available");
  }

  const result: PublishedRelease = {
    tag_name: tagName,
    version,
    assets: release.assets ?? [],
  };
  publishedReleaseCache = { release: result, expiresAt: Date.now() + PUBLISHED_RELEASE_CACHE_TTL_MS };
  return result;
}

/**
 * A signed update is safe to use only when its advertised version is the
 * currently published version from the source repository. A stale or dummy
 * latest.json is therefore rejected before any bytes are downloaded.
 */
export function isUpdateFromPublishedRelease(
  update: Pick<Update, "version">,
  release: Pick<PublishedRelease, "version">,
): boolean {
  return normalizeVersion(update.version) === release.version;
}

type Platform = "windows" | "macos" | "linux";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Mac") || ua.includes("Macintosh")) return "macos";
  return "linux";
}

const PLATFORM_EXTENSIONS: Record<Platform, string[]> = {
  windows: [".msi", ".exe"],
  macos: [".dmg", ".app.tar.gz"],
  linux: [".AppImage", ".deb"],
};

export function findPlatformAsset(assets: PublishedReleaseAsset[], platform: Platform): PublishedReleaseAsset | null {
  for (const ext of PLATFORM_EXTENSIONS[platform]) {
    const asset = assets.find((a) => a.name?.toLowerCase().endsWith(ext));
    if (asset) return asset;
  }
  return null;
}

/**
 * Download an installer from a URL to a temp file without running it.
 * `install()` opens the installer with the OS and quits this app so the
 * installer can replace it.
 */
export async function downloadInstallerFromUrl(
  url: string,
  onProgress?: (progress: DownloadProgress) => void,
  version = "",
): Promise<PreparedUpdate> {
  const parsedUrl = new URL(url);
  const fallbackName = `MakeChurchEasy-${Date.now()}.installer`;
  const filename = decodeURIComponent(parsedUrl.pathname.split("/").pop() || fallbackName)
    .replace(/[^a-zA-Z0-9._-]/g, "_") || fallbackName;

  const response = await tauriFetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);

  const contentLength = Number(response.headers.get("content-length")) || 0;
  let downloaded = 0;
  let buffer: ArrayBuffer;

  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloaded += value.length;
      onProgress?.({ contentLength, downloaded });
    }

    const merged = new Uint8Array(downloaded);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    buffer = merged.buffer;
  } else {
    buffer = await response.arrayBuffer();
    downloaded = buffer.byteLength;
    onProgress?.({ contentLength: contentLength || downloaded, downloaded });
  }

  const tmpDir = await tempDir();
  const filePath = await join(tmpDir, filename);
  await writeFile(filePath, new Uint8Array(buffer));

  return {
    version,
    source: "installer",
    install: async ({ onStatusChange } = {}) => {
      onStatusChange?.("installing");
      await open(filePath);
      onStatusChange?.("relaunching");
      await wait(800);
      // The installer replaces the app, so this process must quit either way.
      await exit(0);
    },
  };
}

/**
 * Download an installer from an admin-configured URL, launch it with the
 * operating system, and exit this app so the installer can replace it.
 */
export async function downloadAndInstallFromUrl(
  url: string,
  onProgress?: (progress: DownloadProgress) => void,
  onStatusChange?: (status: UpdateInstallStatus) => void,
): Promise<void> {
  onStatusChange?.("downloading");
  const prepared = await downloadInstallerFromUrl(url, onProgress);
  await prepared.install({ onStatusChange });
}

/**
 * Download and install an update directly from GitHub Releases.
 * Used as a fallback when the Tauri auto-updater has no signed binary
 * for the current platform.
 *
 * Downloads the platform installer to a temp file and opens it with
 * the OS default handler (MSI installer, DMG, AppImage, etc.).
 * The app exits after launching the installer so files can be replaced.
 */
export async function downloadAndInstallFromGitHub(
  onProgress?: (progress: DownloadProgress) => void,
  onStatusChange?: (status: "downloading" | "installing" | "relaunching") => void
): Promise<void> {
  // 1. Fetch the latest real release from the source repository
  const release = await fetchLatestPublishedRelease();

  // 2. Detect platform and find matching installer asset
  const platform = detectPlatform();
  const asset = findPlatformAsset(release.assets ?? [], platform);
  if (!asset) throw new Error(`No installer available for ${platform}`);
  onStatusChange?.("downloading");
  const prepared = await downloadInstallerFromUrl(asset.browser_download_url, onProgress, release.version);
  await prepared.install({ onStatusChange });
}

/** Download the published platform installer without running it. */
export async function downloadInstallerFromGitHub(
  onProgress?: (progress: DownloadProgress) => void,
): Promise<PreparedUpdate> {
  const release = await fetchLatestPublishedRelease();
  const platform = detectPlatform();
  const asset = findPlatformAsset(release.assets ?? [], platform);
  if (!asset) throw new Error(`No installer available for ${platform}`);
  return downloadInstallerFromUrl(asset.browser_download_url, onProgress, release.version);
}

/**
 * Download a verified update without installing it. The signed updater is
 * used when its manifest matches the real published release; otherwise (or
 * when the signed download fails) the published installer is downloaded.
 */
export async function downloadVerifiedUpdate(
  update: Update | undefined,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<PreparedUpdate> {
  if (update) {
    try {
      const release = await fetchLatestPublishedRelease();
      if (isUpdateFromPublishedRelease(update, release)) {
        try {
          return await downloadSignedUpdate(update, onProgress);
        } catch (error) {
          console.warn("[updater] Signed update download failed; using published installer:", error);
        }
      } else {
        console.warn(
          `[updater] Ignoring stale update manifest v${update.version}; published release is v${release.version}`,
        );
      }
      await update.close().catch(() => undefined);
    } catch (error) {
      console.warn("[updater] Could not validate signed update; using published installer:", error);
      await update.close().catch(() => undefined);
    }
  }

  return downloadInstallerFromGitHub(onProgress);
}

/**
 * Install a signed updater result only after it has been reconciled with the
 * real published release. If the manifest is stale, mismatched, or its URL is
 * broken, use the verified GitHub installer instead.
 */
export async function downloadAndInstallVerifiedUpdate(
  update: Update | undefined,
  onProgress?: (progress: DownloadProgress) => void,
  onStatusChange?: (status: UpdateInstallStatus) => void,
): Promise<void> {
  onStatusChange?.("downloading");
  const prepared = await downloadVerifiedUpdate(update, onProgress);
  await prepared.install({ relaunch: true, onStatusChange });
}
