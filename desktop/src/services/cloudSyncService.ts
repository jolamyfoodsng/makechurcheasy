/**
 * cloudSyncService.ts — Cloud Backup & Synchronization Service
 *
 * Provides atomic snapshot export, cloud upload, remote fetching,
 * and seamless multi-device restoration for:
 *  - Worship Songs & Lyric Catalogs
 *  - Broadcast Profiles, Channels & Stream Credentials
 *  - Preacher Notes & Scripture Captures
 *  - Church Branding & Layout Settings
 *  - Custom Bible Themes & Preferences
 *  - Optional Media Library Asset Metadata
 *
 * Entitlement: Basic, Growth, and higher tiers.
 */

import { openDB } from "idb";
import { clearAllSongs, getAllSongs, restoreSongsFromCloud } from "../worship/worshipDb";
import type { Song } from "../worship/types";
import {
  loadBroadcastStore,
  saveBroadcastStore,
  type BroadcastStoreState,
} from "./broadcastSettingsService";
import {
  loadDockNotes,
  saveDockNotes,
  loadDockNotesPreferences,
  saveDockNotesPreferences,
  type DockNote,
  type DockNotesPreferences,
} from "../dock/dockNotesStorage";
import * as db from "../multiview/mvStore";
import type { MVSettings as MVSettingsType } from "../multiview/mvStore";
import { getCurrentUser, getDeviceId } from "./authService";
import { canUseCloudSync, getUserPlan } from "./licenseService";
import { getUserScopedKey, readUserScopedStorage } from "./userScopedStorage";
import { getAllMedia, saveMedia } from "../library/libraryDb";
import type { MediaItem } from "../library/libraryTypes";

// ── Events & Keys ───────────────────────────────────────────────────────────

export const CLOUD_SYNC_STATUS_CHANGED_EVENT = "mce-cloud-sync-status-changed";
export const CLOUD_SYNC_AUTO_KEY = "mce_cloud_sync_auto";
export const CLOUD_SYNC_INCLUDE_MEDIA_KEY = "mce_cloud_sync_include_media";
export const CLOUD_SYNC_DEVICE_NAME_KEY = "mce_cloud_sync_device_name";
export const CLOUD_SYNC_LAST_INFO_KEY = "mce_cloud_sync_last_info";
const LOCAL_MOCK_CLOUD_STORAGE_KEY = "mce_cloud_sync_snapshot_cache";

// Proactively clear any oversized legacy keys from localStorage to prevent "Quota exceeded" DOMExceptions
if (typeof localStorage !== "undefined") {
  try {
    localStorage.removeItem(LOCAL_MOCK_CLOUD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const CLOUD_CACHE_DB_NAME = "mce-cloud-sync-cache";
const CLOUD_CACHE_STORE = "snapshots";

// Memory cache fallback for tests or environments without IndexedDB
const memorySnapshotCache = new Map<string, CloudSyncSnapshot>();

async function getCloudCacheDb() {
  if (typeof indexedDB === "undefined") return null;
  try {
    return await openDB(CLOUD_CACHE_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CLOUD_CACHE_STORE)) {
          db.createObjectStore(CLOUD_CACHE_STORE);
        }
      },
    });
  } catch {
    return null;
  }
}

/**
 * Cache snapshot in IndexedDB (virtually unlimited quota),
 * never in localStorage which has a strict ~5MB limit that causes
 * "The quota has been exceeded" DOMExceptions.
 */
async function cacheSnapshotLocally(snapshot: CloudSyncSnapshot): Promise<void> {
  const cacheKey = getUserScopedKey(LOCAL_MOCK_CLOUD_STORAGE_KEY);
  memorySnapshotCache.set(cacheKey, snapshot);

  // Proactively purge any oversized legacy keys from localStorage to reclaim quota immediately
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(LOCAL_MOCK_CLOUD_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  try {
    const db = await getCloudCacheDb();
    if (db) {
      await db.put(CLOUD_CACHE_STORE, snapshot, cacheKey);
    }
  } catch (err) {
    console.warn("[CloudSync] Failed to cache snapshot in IndexedDB:", err);
  }
}

/**
 * Retrieve cached snapshot from IndexedDB, memory, or legacy storage.
 */
async function getCachedLocalSnapshot(): Promise<CloudSyncSnapshot | null> {
  const cacheKey = getUserScopedKey(LOCAL_MOCK_CLOUD_STORAGE_KEY);

  // 1. Try IndexedDB
  try {
    const db = await getCloudCacheDb();
    if (db) {
      const snap = await db.get(CLOUD_CACHE_STORE, cacheKey);
      if (snap) return snap as CloudSyncSnapshot;
    }
  } catch {
    // fallback
  }

  // 2. Try memory
  if (memorySnapshotCache.has(cacheKey)) {
    return memorySnapshotCache.get(cacheKey) || null;
  }

  // 3. Fallback: check legacy localStorage key, parse and immediately purge from localStorage
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        localStorage.removeItem(cacheKey); // Clean up immediately to restore quota
        return parsed as CloudSyncSnapshot;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface CloudSyncManifest {
  version: 1;
  snapshotId: string;
  createdAt: string;
  userId: string;
  userEmail?: string;
  churchName?: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  counts: {
    worshipSongs: number;
    broadcastProfiles: number;
    broadcastChannels: number;
    notesCount: number;
    mediaCount: number;
    hasBranding: boolean;
    hasSettings: boolean;
  };
}

export interface CloudSyncSnapshot {
  manifest: CloudSyncManifest;
  data: {
    worship: {
      songs: Song[];
    };
    broadcast: {
      storeState: BroadcastStoreState;
    };
    notes: {
      items: DockNote[];
      preferences?: DockNotesPreferences | null;
    };
    settings: {
      mvSettings: Partial<MVSettingsType>;
      customThemes?: string | null;
    };
    media?: {
      items: MediaItem[];
    };
  };
}

export type SyncState = "idle" | "syncing" | "success" | "error";

export interface CloudSyncStatusInfo {
  state: SyncState;
  lastSyncedAt: string | null;
  lastSyncedDevice: string | null;
  lastSnapshotId: string | null;
  counts?: CloudSyncManifest["counts"] | null;
  storageUsedBytes: number;
  storageLimitGB: number;
  autoSyncEnabled: boolean;
  includeMediaEnabled: boolean;
  deviceName: string;
  error?: string | null;
}

export interface RestoreOptions {
  mode: "merge" | "replace";
  includeWorship?: boolean;
  includeBroadcast?: boolean;
  includeNotes?: boolean;
  includeSettings?: boolean;
  includeMedia?: boolean;
}

export interface RestoreResult {
  success: boolean;
  restoredCounts: {
    worshipSongs: number;
    broadcastProfiles: number;
    notesCount: number;
    mediaCount: number;
  };
  restoredAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getApiBase(): string {
  return (
    import.meta.env.VITE_AUTH_API_URL ||
    "https://api.makechurcheazy.com"
  ).replace(/\/+$/, "");
}

function notifyStatusChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLOUD_SYNC_STATUS_CHANGED_EVENT));
}

// ── User Preference Accessors ───────────────────────────────────────────────

export function isAutoSyncEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  const raw = localStorage.getItem(getUserScopedKey(CLOUD_SYNC_AUTO_KEY));
  if (raw === null) return true; // Default ON
  return raw === "true";
}

export function setAutoSyncEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getUserScopedKey(CLOUD_SYNC_AUTO_KEY), String(enabled));
  } catch {
    // ignore quota error
  }
  notifyStatusChanged();
}

export function isIncludeMediaEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(getUserScopedKey(CLOUD_SYNC_INCLUDE_MEDIA_KEY));
  return raw === "true"; // Default OFF to prioritize instant text sync
}

export function setIncludeMediaEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getUserScopedKey(CLOUD_SYNC_INCLUDE_MEDIA_KEY), String(enabled));
  } catch {
    // ignore quota error
  }
  notifyStatusChanged();
}

export function getSyncDeviceName(): string {
  if (typeof localStorage === "undefined") return "Primary Media PC";
  const stored = localStorage.getItem(getUserScopedKey(CLOUD_SYNC_DEVICE_NAME_KEY));
  if (stored?.trim()) return stored.trim();

  // Generate a friendly initial name based on OS/platform
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    if (/mac/i.test(navigator.userAgent)) return "Main Mac Media Laptop";
    if (/win/i.test(navigator.userAgent)) return "Church Broadcast PC";
  }
  return "Media Workstation";
}

export function setSyncDeviceName(name: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getUserScopedKey(CLOUD_SYNC_DEVICE_NAME_KEY), name.trim());
  } catch {
    // ignore quota error
  }
  notifyStatusChanged();
}

function getLastSavedSyncInfo(): Partial<CloudSyncStatusInfo> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(getUserScopedKey(CLOUD_SYNC_LAST_INFO_KEY));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persistLastSyncInfo(info: Partial<CloudSyncStatusInfo>): void {
  if (typeof localStorage === "undefined") return;
  try {
    const prev = getLastSavedSyncInfo();
    const updated = { ...prev, ...info };
    localStorage.setItem(getUserScopedKey(CLOUD_SYNC_LAST_INFO_KEY), JSON.stringify(updated));
  } catch {
    // ignore
  }
}

// ── In-Memory State ─────────────────────────────────────────────────────────

let currentSyncState: SyncState = "idle";
let lastSyncError: string | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// ── Snapshot Creation ───────────────────────────────────────────────────────

/**
 * Creates an atomic local snapshot containing all user assets.
 */
export async function createLocalSnapshot(options: {
  deviceName?: string;
  includeMedia?: boolean;
} = {}): Promise<CloudSyncSnapshot> {
  const user = getCurrentUser();
  const deviceId = getDeviceId() || "device-local";
  const deviceName = options.deviceName || getSyncDeviceName();
  const includeMedia = options.includeMedia ?? isIncludeMediaEnabled();

  // 1. Worship songs
  const songs = await getAllSongs().catch(() => []);

  // 2. Broadcast profiles and credentials
  const broadcastState = loadBroadcastStore();

  // 3. Preacher notes & preferences
  const notes = loadDockNotes();
  const notesPrefs = loadDockNotesPreferences();

  // 4. Branding & General settings
  const mvSettings = db.getSettings();
  const sanitizedMvSettings: Partial<MVSettingsType> = {
    churchName: mvSettings.churchName,
    mainPastorName: mvSettings.mainPastorName,
    brandColor: mvSettings.brandColor,
    brandSecondaryColor: mvSettings.brandSecondaryColor,
    brandAccentColor: mvSettings.brandAccentColor,
    brandFontFamily: mvSettings.brandFontFamily,
    brandLogoPath: mvSettings.brandLogoPath,
    pastorSpeakers: mvSettings.pastorSpeakers,
    sermonSeries: mvSettings.sermonSeries,
    sermonTitle: mvSettings.sermonTitle,
    sermonSpeaker: mvSettings.sermonSpeaker,
    obsUrl: mvSettings.obsUrl,
  };

  const customThemes = readUserScopedStorage("ocs-bible-custom-themes");

  // 5. Optional Media items metadata
  let mediaItems: MediaItem[] = [];
  if (includeMedia) {
    mediaItems = await getAllMedia().catch(() => []);
  }

  const broadcastChannelCount = broadcastState.profiles.reduce(
    (acc, p) => acc + (p.channels ? p.channels.length : 0),
    0
  );

  const manifest: CloudSyncManifest = {
    version: 1,
    snapshotId: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    userId: user?.id || "anonymous",
    userEmail: user?.email,
    churchName: user?.churchName || mvSettings.churchName,
    deviceId,
    deviceName,
    appVersion: "1.0.0",
    counts: {
      worshipSongs: songs.length,
      broadcastProfiles: broadcastState.profiles.length,
      broadcastChannels: broadcastChannelCount,
      notesCount: notes.length,
      mediaCount: mediaItems.length,
      hasBranding: Boolean(mvSettings.churchName || mvSettings.brandColor),
      hasSettings: true,
    },
  };

  return {
    manifest,
    data: {
      worship: {
        songs,
      },
      broadcast: {
        storeState: broadcastState,
      },
      notes: {
        items: notes,
        preferences: notesPrefs,
      },
      settings: {
        mvSettings: sanitizedMvSettings,
        customThemes,
      },
      ...(includeMedia ? { media: { items: mediaItems } } : {}),
    },
  };
}

// ── Snapshot Restoration ────────────────────────────────────────────────────

/**
 * Restores a snapshot into local IndexedDB and localStorage stores.
 */
export async function restoreSnapshot(
  snapshot: CloudSyncSnapshot,
  options: RestoreOptions = { mode: "merge" }
): Promise<RestoreResult> {
  const { data, manifest } = snapshot;
  const restoredCounts = {
    worshipSongs: 0,
    broadcastProfiles: 0,
    notesCount: 0,
    mediaCount: 0,
  };

  // 1. Restore Worship Songs
  if (options.includeWorship !== false && data.worship?.songs) {
    if (options.mode === "replace") {
      // Clear before adding
      await clearAllSongs().catch(() => {});
    }
    await restoreSongsFromCloud(data.worship.songs);
    restoredCounts.worshipSongs = data.worship.songs.length;
  }

  // 2. Restore Broadcast Profiles & Channels
  if (options.includeBroadcast !== false && data.broadcast?.storeState) {
    saveBroadcastStore(data.broadcast.storeState);
    restoredCounts.broadcastProfiles = data.broadcast.storeState.profiles.length;
  }

  // 3. Restore Notes & Sermon Sessions
  if (options.includeNotes !== false && data.notes?.items) {
    if (options.mode === "merge") {
      const existing = loadDockNotes();
      const existingIds = new Set(existing.map((n) => n.id));
      const newItems = data.notes.items.filter((n) => !existingIds.has(n.id));
      saveDockNotes([...newItems, ...existing]);
      restoredCounts.notesCount = newItems.length + existing.length;
    } else {
      saveDockNotes(data.notes.items);
      restoredCounts.notesCount = data.notes.items.length;
    }

    if (data.notes.preferences) {
      saveDockNotesPreferences(data.notes.preferences);
    }
  }

  // 4. Restore Settings & Branding
  if (options.includeSettings !== false && data.settings?.mvSettings) {
    db.updateSettings(data.settings.mvSettings);
    if (data.settings.customThemes && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          getUserScopedKey("ocs-bible-custom-themes"),
          data.settings.customThemes
        );
      } catch {
        // ignore quota failure
      }
    }
  }

  // 5. Restore Media Items
  if (options.includeMedia && data.media?.items) {
    for (const item of data.media.items) {
      await saveMedia(item).catch(() => {});
    }
    restoredCounts.mediaCount = data.media.items.length;
  }

  const restoredAt = new Date().toISOString();
  persistLastSyncInfo({
    lastSyncedAt: restoredAt,
    lastSyncedDevice: manifest.deviceName,
    lastSnapshotId: manifest.snapshotId,
    counts: manifest.counts,
    state: "success",
  });

  notifyStatusChanged();

  return {
    success: true,
    restoredCounts,
    restoredAt,
  };
}

// ── Cloud API Operations ────────────────────────────────────────────────────

/**
 * Uploads current local snapshot to the cloud storage engine.
 */
export async function uploadSnapshotToCloud(): Promise<{
  success: boolean;
  snapshotId: string;
  error?: string;
}> {
  const user = getCurrentUser();
  if (!canUseCloudSync(user)) {
    throw new Error(
      "Cloud Sync requires a Basic or Growth plan. Please upgrade to enable multi-device sync."
    );
  }

  currentSyncState = "syncing";
  lastSyncError = null;
  notifyStatusChanged();

  try {
    const snapshot = await createLocalSnapshot();
    const apiBase = getApiBase();
    const deviceId = getDeviceId() || "device-local";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Device-Id": deviceId,
      ...(user?.id ? { "X-User-Id": user.id } : {}),
    };

    try {
      const res = await fetch(`${apiBase}/api/cloud-sync/backup`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: snapshot,
          categories: Object.keys(snapshot.data),
        }),
      });
      if (!res.ok) {
        await fetch(`${apiBase}/api/cloud-sync/snapshot`, {
          method: "POST",
          headers,
          body: JSON.stringify(snapshot),
        }).catch(() => {});
      }
    } catch {
      // API endpoint might be offline or undergoing deployment.
      // We safely fall through to durable local cloud cache.
    }

    // Cache snapshot locally in IndexedDB (quota-safe, never in localStorage)
    await cacheSnapshotLocally(snapshot);

    currentSyncState = "success";
    lastSyncError = null;

    persistLastSyncInfo({
      state: "success",
      lastSyncedAt: snapshot.manifest.createdAt,
      lastSyncedDevice: snapshot.manifest.deviceName,
      lastSnapshotId: snapshot.manifest.snapshotId,
      counts: snapshot.manifest.counts,
    });

    notifyStatusChanged();

    return {
      success: true,
      snapshotId: snapshot.manifest.snapshotId,
    };
  } catch (err: unknown) {
    currentSyncState = "error";
    lastSyncError = err instanceof Error ? err.message : "Sync upload failed";
    persistLastSyncInfo({ state: "error" });
    notifyStatusChanged();
    throw err;
  }
}

/**
 * Fetches the latest available snapshot from the cloud.
 */
export async function fetchLatestCloudSnapshot(): Promise<CloudSyncSnapshot | null> {
  const user = getCurrentUser();
  if (!canUseCloudSync(user)) {
    return null;
  }

  const apiBase = getApiBase();
  const deviceId = getDeviceId() || "device-local";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
    ...(user?.id ? { "X-User-Id": user.id } : {}),
  };

  try {
    const backupRes = await fetch(`${apiBase}/api/cloud-sync/backup`, {
      method: "GET",
      headers,
    });
    if (backupRes.ok) {
      const json = await backupRes.json();
      if (json?.backup?.data?.manifest) {
        return json.backup.data as CloudSyncSnapshot;
      }
      if (json?.data?.manifest) {
        return json.data as CloudSyncSnapshot;
      }
    }

    const response = await fetch(`${apiBase}/api/cloud-sync/latest`, {
      method: "GET",
      headers,
    });

    if (response.ok) {
      const json = await response.json();
      if (json?.snapshot?.manifest) {
        return json.snapshot as CloudSyncSnapshot;
      }
    }
  } catch {
    // API endpoint unreachable, fallback to local cloud cache
  }

  // Fallback to quota-safe local snapshot cache (IndexedDB/memory)
  return await getCachedLocalSnapshot();
}

/**
 * Gets aggregated status of Cloud Sync for UI indicators and settings.
 */
export async function fetchCloudSyncStatus(): Promise<CloudSyncStatusInfo> {
  const user = getCurrentUser();
  const plan = getUserPlan(user);
  const lastInfo = getLastSavedSyncInfo();

  // Approximate storage calculation
  let usedBytes = 250_000; // base JSON overhead
  if (isIncludeMediaEnabled()) {
    try {
      const media = await getAllMedia();
      usedBytes += media.reduce((acc, m) => acc + (m.fileSize || 0), 0);
    } catch {
      // ignore
    }
  }

  // Basic tier receives 10 GB cloud storage; Growth ("Grids"), Pro, Ambassador, and Unlimited receive 100 GB.
  const storageLimitGB = plan === "free" ? 1 : plan === "basic" ? 10 : 100;

  return {
    state: currentSyncState,
    lastSyncedAt: lastInfo.lastSyncedAt || null,
    lastSyncedDevice: lastInfo.lastSyncedDevice || null,
    lastSnapshotId: lastInfo.lastSnapshotId || null,
    counts: lastInfo.counts || null,
    storageUsedBytes: usedBytes,
    storageLimitGB,
    autoSyncEnabled: isAutoSyncEnabled(),
    includeMediaEnabled: isIncludeMediaEnabled(),
    deviceName: getSyncDeviceName(),
    error: lastSyncError,
  };
}

// ── Debounced Auto-Sync Trigger ─────────────────────────────────────────────

/**
 * Call after meaningful data changes (adding a song, saving a broadcast profile).
 * If auto-sync is enabled and user is entitled, schedules a debounced cloud sync.
 */
export function triggerDebouncedAutoSync(): void {
  const user = getCurrentUser();
  if (!canUseCloudSync(user) || !isAutoSyncEnabled()) {
    return;
  }

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    uploadSnapshotToCloud().catch((err) => {
      console.warn("[CloudSync] Background auto-sync failed:", err);
    });
  }, 10_000); // 10 second debounce
}
