/**
 * usageSync.ts — Syncs local IndexedDB resource counts to the server.
 *
 * Runs on a periodic interval so the server's /api/user/entitlements
 * endpoint always has fresh usage data for entitlement enforcement.
 *
 * The sync is fire-and-forget: failures are logged but never block the UI.
 */

import { getSession } from "./authService";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let _syncTimer: ReturnType<typeof setInterval> | null = null;
let _syncing = false;

/**
 * Count resources from IndexedDB and POST to the server.
 * Uses dynamic imports to avoid loading db modules when not needed.
 */
async function syncUsageToServer(): Promise<void> {
  if (_syncing) return;
  _syncing = true;

  try {
    const session = getSession();
    if (!session?.deviceId) return;

    // Count resources — each DB is wrapped individually so one failure
    // doesn't prevent the others from syncing.
    let songs = 0;
    let images = 0;
    let videos = 0;
    let themes = 0;
    let lowerThirds = 0;
    let bibleVersions = 0;

    try {
      const worshipDb = await import("../worship/worshipDb");
      songs = (await worshipDb.getAllSongs()).filter((s: any) => !s.archived).length;
    } catch (err) {
      console.warn("[usageSync] Failed to count songs:", err);
    }

    try {
      const libraryDb = await import("../library/libraryDb");
      const allMedia = await libraryDb.getAllMedia();
      images = allMedia.filter((m: any) => m.type === "image").length;
      videos = allMedia.filter((m: any) => m.type === "video").length;
    } catch (err) {
      console.warn("[usageSync] Failed to count media:", err);
    }

    try {
      const bibleDb = await import("../bible/bibleDb");
      const allThemes = await bibleDb.getCustomThemes();
      themes = allThemes.filter((t: any) => t.templateType === "fullscreen").length;
      lowerThirds = allThemes.filter(
        (t: any) => t.templateType === "lower-third" || t.templateType === "side-by-side"
      ).length;
      bibleVersions = (await bibleDb.getInstalledTranslations()).length;
    } catch (err) {
      console.warn("[usageSync] Failed to count bible resources:", err);
    }

    // Devices: count from server-known devices (1 per registration)
    const devices = 0;

    const payload = {
      songs,
      images,
      videos,
      themes,
      lowerThirds,
      devices,
      bibleVersions,
      lastSyncedAt: new Date().toISOString(),
    };

    // Determine API base URL
    const apiBase = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

    const res = await fetch(`${apiBase}/api/user/usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": session.deviceId,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn("[usageSync] Failed to sync usage:", res.status);
    }
  } catch (err) {
    console.warn("[usageSync] Sync error:", err);
  } finally {
    _syncing = false;
  }
}

/**
 * Start periodic usage sync. Safe to call multiple times.
 */
export function startUsageSync(): void {
  if (_syncTimer) return;

  // Initial sync after a short delay (let the app settle)
  setTimeout(() => {
    void syncUsageToServer();
  }, 10_000);

  // Periodic sync
  _syncTimer = setInterval(() => {
    void syncUsageToServer();
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop periodic usage sync.
 */
export function stopUsageSync(): void {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
}

/**
 * Trigger an immediate sync (e.g., after creating/deleting a resource).
 */
export function triggerUsageSync(): void {
  void syncUsageToServer();
}
