/**
 * Multi-View Store — IndexedDB persistence via `idb`
 *
 * Stores layouts, assets, OBS mappings, and media library locally.
 * All operations are async and return clean TypeScript types.
 * User-owned records are scoped by userId.
 *
 * Database: "sunday-mv" v3
 * Object stores:
 *   layouts       — MVLayout objects (key: id) — templates have no userId
 *   assets        — MVAsset objects (key: id)
 *   mappings      — ObsMapping objects (key: layoutId)
 *   media-library — MediaItem objects (key: id) — uploaded images/videos references
 */

import { openDB, type IDBPDatabase } from "idb";
import type {
  MVLayout,
  MVAsset,
  ObsMapping,
  LayoutId,
  AssetId,
} from "./types";
import { getCurrentUserId } from "../services/db";

// ---------------------------------------------------------------------------
// Media Library — persisted references to uploaded images/videos
// ---------------------------------------------------------------------------

export interface MediaItem {
  id: string;
  /** Display name */
  name: string;
  /** "image" | "video" */
  mediaType: "image" | "video";
  /** Absolute file path on disk (for OBS & re-use) */
  filePath: string;
  /** Data URL or blob URL for in-app preview */
  previewSrc: string;
  /** Small thumbnail data URL */
  thumbnail?: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** ISO timestamp */
  createdAt: string;
  /** Tags / categories */
  tags: string[];
}

const DB_NAME = "sunday-mv";
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // v1 stores
        if (!db.objectStoreNames.contains("layouts")) {
          const layouts = db.createObjectStore("layouts", { keyPath: "id" });
          layouts.createIndex("updatedAt", "updatedAt");
          layouts.createIndex("isTemplate", "isTemplate");
        }
        if (!db.objectStoreNames.contains("assets")) {
          const assets = db.createObjectStore("assets", { keyPath: "id" });
          assets.createIndex("type", "type");
          assets.createIndex("folder", "folder");
        }
        if (!db.objectStoreNames.contains("mappings")) {
          db.createObjectStore("mappings", { keyPath: "layoutId" });
        }
        // v2 stores
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("media-library")) {
            const media = db.createObjectStore("media-library", { keyPath: "id" });
            media.createIndex("mediaType", "mediaType");
            media.createIndex("createdAt", "createdAt");
          }
        }
        // v3: Add userId index to all stores for cross-account isolation
        if (oldVersion < 3) {
          const userStores = ["layouts", "assets", "mappings", "media-library"];
          for (const storeName of userStores) {
            if (db.objectStoreNames.contains(storeName)) {
              const store = transaction.objectStore(storeName) as unknown as IDBObjectStore;
              if (!store.indexNames.contains("userId")) {
                store.createIndex("userId", "userId", { unique: false });
              }
            }
          }
        }
        // Safety: ensure userId indexes exist even if v3 upgrade partially failed
        {
          const userStores = ["layouts", "assets", "mappings", "media-library"];
          for (const storeName of userStores) {
            if (db.objectStoreNames.contains(storeName)) {
              const store = transaction.objectStore(storeName) as unknown as IDBObjectStore;
              if (!store.indexNames.contains("userId")) {
                store.createIndex("userId", "userId", { unique: false });
              }
            }
          }
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

export async function getAllLayouts(): Promise<MVLayout[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  if (uid) {
    // Get user's layouts + templates (which have no userId)
    const userLayouts = await db.getAllFromIndex("layouts", "userId", uid) as MVLayout[];
    const all = await db.getAll("layouts") as MVLayout[];
    const templates = all.filter((l) => l.isTemplate && !l.userId);
    // Merge, deduplicating by id
    const seen = new Set(userLayouts.map((l) => l.id));
    return [...userLayouts, ...templates.filter((t) => !seen.has(t.id))];
  }
  return db.getAll("layouts");
}

export async function getUserLayouts(): Promise<MVLayout[]> {
  const all = await getAllLayouts();
  return all.filter((l) => !l.isTemplate).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export async function getTemplateLayouts(): Promise<MVLayout[]> {
  const all = await getAllLayouts();
  return all.filter((l) => l.isTemplate).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export async function getLayout(id: LayoutId): Promise<MVLayout | undefined> {
  const db = await getDb();
  return db.get("layouts", id);
}

export async function saveLayout(layout: MVLayout): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  layout.updatedAt = new Date().toISOString();
  const tagged = uid && !layout.isTemplate ? { ...layout, userId: uid } : layout;
  await db.put("layouts", tagged);
  syncLayoutsToDock().catch(() => { });
}

export async function deleteLayout(id: LayoutId): Promise<void> {
  const db = await getDb();
  await db.delete("layouts", id);
  // Also delete mapping if exists
  await db.delete("mappings", id).catch(() => { });
  syncLayoutsToDock().catch(() => { });
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function getAllAssets(): Promise<MVAsset[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  if (uid) {
    return db.getAllFromIndex("assets", "userId", uid) as Promise<MVAsset[]>;
  }
  return db.getAll("assets");
}

export async function getAsset(id: AssetId): Promise<MVAsset | undefined> {
  const db = await getDb();
  return db.get("assets", id);
}

export async function saveAsset(asset: MVAsset): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  const tagged = uid ? { ...asset, userId: uid } : asset;
  await db.put("assets", tagged);
}

export async function deleteAsset(id: AssetId): Promise<void> {
  const db = await getDb();
  await db.delete("assets", id);
}

// ---------------------------------------------------------------------------
// OBS Mappings
// ---------------------------------------------------------------------------

export async function getMapping(layoutId: LayoutId): Promise<ObsMapping | undefined> {
  const db = await getDb();
  return db.get("mappings", layoutId);
}

export async function saveMapping(mapping: ObsMapping): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  const tagged = uid ? { ...mapping, userId: uid } : mapping;
  await db.put("mappings", tagged);
}

// ---------------------------------------------------------------------------
// Bulk / Seed
// ---------------------------------------------------------------------------

export async function seedTemplates(templates: MVLayout[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("layouts", "readwrite");
  for (const t of templates) {
    const existing = await tx.store.get(t.id);
    if (!existing) {
      await tx.store.put(t);
    }
  }
  await tx.done;
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  const storeNames = ["layouts", "assets", "mappings", "media-library"];
  for (const name of storeNames) {
    try {
      if (uid && name !== "media-library") {
        // For user-owned stores, only clear current user's records
        const tx = db.transaction(name, "readwrite");
        const store = tx.store;
        if (store.indexNames.contains("userId")) {
          const idx = store.index("userId");
          let cursor = await idx.openCursor(IDBKeyRange.only(uid));
          while (cursor) {
            await cursor.delete();
            cursor = await cursor.continue();
          }
        }
        await tx.done;
      } else {
        const tx = db.transaction(name, "readwrite");
        await tx.objectStore(name).clear();
        await tx.done;
      }
    } catch {
      // Store may not exist yet
    }
  }
}

// ---------------------------------------------------------------------------
// Media Library
// ---------------------------------------------------------------------------

export async function getAllMedia(): Promise<MediaItem[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  if (uid) {
    return db.getAllFromIndex("media-library", "userId", uid) as Promise<MediaItem[]>;
  }
  return db.getAll("media-library");
}

export async function getMediaByType(mediaType: "image" | "video"): Promise<MediaItem[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  let all: MediaItem[];
  if (uid) {
    all = await db.getAllFromIndex("media-library", "userId", uid) as MediaItem[];
  } else {
    all = await db.getAll("media-library") as MediaItem[];
  }
  return all
    .filter((m) => m.mediaType === mediaType)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveMediaItem(item: MediaItem): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  const tagged = uid ? { ...item, userId: uid } : item;
  await db.put("media-library", tagged);
}

export async function deleteMediaItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("media-library", id);
}

/** Check if a media item with the given filePath already exists */
export async function findMediaByPath(filePath: string): Promise<MediaItem | undefined> {
  const all = await getAllMedia();
  return all.find((m) => m.filePath === filePath);
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

/** Export a layout as a JSON string (clean, portable) */
export function exportLayoutJSON(layout: MVLayout): string {
  const exportData = {
    _format: "sunday-mv-layout",
    _version: 2,
    _exportedAt: new Date().toISOString(),
    layout: {
      ...layout,
      // Strip runtime-only fields
      thumbnail: undefined,
    },
  };
  return JSON.stringify(exportData, null, 2);
}

/** Download a layout as a JSON file via browser download */
export function downloadLayoutJSON(layout: MVLayout): void {
  const json = exportLayoutJSON(layout);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${layout.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_layout.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Parse and validate an imported layout JSON string. Returns the layout or throws. */
export function parseImportedLayoutJSON(jsonString: string): MVLayout {
  const data = JSON.parse(jsonString);
  if (!data || data._format !== "sunday-mv-layout") {
    throw new Error("Invalid layout file format");
  }
  const layout = data.layout as MVLayout;
  if (!layout || !layout.id || !layout.regions || !layout.canvas) {
    throw new Error("Incomplete layout data");
  }
  return layout;
}

/** Import a layout from a File object. Saves to IndexedDB and returns the layout. */
export async function importLayoutFromFile(file: File): Promise<MVLayout> {
  const text = await file.text();
  const layout = parseImportedLayoutJSON(text);
  // Assign a fresh ID and timestamps so it doesn't clash with existing layouts
  const { nanoid } = await import("nanoid");
  layout.id = nanoid(12) as LayoutId;
  layout.name = `${layout.name} (Imported)`;
  layout.createdAt = new Date().toISOString();
  layout.updatedAt = new Date().toISOString();
  layout.isTemplate = false;
  await saveLayout(layout);
  return layout;
}

/** Prompt user to pick a JSON file and import it */
export function promptImportLayout(): Promise<MVLayout> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error("No file selected")); return; }
      try {
        const layout = await importLayoutFromFile(file);
        resolve(layout);
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}

// ---------------------------------------------------------------------------
// Auto-Save Recovery
// ---------------------------------------------------------------------------

const RECOVERY_KEY = "mv-recovery-layout";

function getRecoveryStorageKey(): string {
  const uid = getCurrentUserId();
  return uid ? `${RECOVERY_KEY}:${uid}` : RECOVERY_KEY;
}

/** Save a recovery snapshot to localStorage (fast, synchronous fallback) */
export function saveRecoverySnapshot(layout: MVLayout): void {
  try {
    const data = JSON.stringify({
      layout,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem(getRecoveryStorageKey(), data);
  } catch { /* localStorage full or unavailable — silently fail */ }
}

/** Get the recovery snapshot if one exists */
export function getRecoverySnapshot(): { layout: MVLayout; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(getRecoveryStorageKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.layout?.id) return null;
    return data;
  } catch { return null; }
}

/** Clear the recovery snapshot (e.g. after a successful save) */
export function clearRecoverySnapshot(): void {
  try { localStorage.removeItem(getRecoveryStorageKey()); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// First-run detection
// ---------------------------------------------------------------------------

const ONBOARDING_KEY = "mv-onboarding-complete";

function getOnboardingStorageKey(): string {
  const uid = getCurrentUserId();
  return uid ? `${ONBOARDING_KEY}:${uid}` : ONBOARDING_KEY;
}

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(getOnboardingStorageKey()) === "true";
}

export function markOnboardingComplete(): void {
  localStorage.setItem(getOnboardingStorageKey(), "true");
}

// ---------------------------------------------------------------------------
// App Settings — persisted to localStorage for instant access, scoped by userId
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "mv-settings";
export const MV_SETTINGS_UPDATED_EVENT = "mv-settings-updated";

function getSettingsStorageKey(): string {
  const uid = getCurrentUserId();
  return uid ? `${SETTINGS_KEY}:${uid}` : SETTINGS_KEY;
}

export interface SpeakerProfileSetting {
  name: string;
  role: string;
  isMain?: boolean;
}

export interface BrandLogoAssetSetting {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export interface SermonPointSetting {
  id: string;
  text: string;
  type: "quote" | "point";
  attribution?: string;
}

export interface MVSettings {
  // ── OBS Connection ──
  obsUrl: string;
  obsPassword: string;
  obsAutoReconnect: boolean;
  streamingPlatform: "youtube" | "twitch" | "custom";

  // ── Appearance ──
  theme: "dark" | "light" | "system";
  highContrast: boolean;

  // ── Service Hub Defaults ──
  lowerThirdDefaultDurationSec: number;
  defaultBibleOverlayMode: "fullscreen" | "lower-third";
  defaultSpeakerSize: string;
  defaultTickerScrollSpeed: number;
  brandColor: string;
  brandSecondaryColor: string;
  brandAccentColor: string;
  brandFontFamily: string;
  brandFaviconUrl: string;
  churchName: string;
  mainPastorName: string;
  pastorNames: string;
  pastorSpeakers: SpeakerProfileSetting[];
  brandLogoPath: string;
  brandLogoAssets: BrandLogoAssetSetting[];
  churchProfileOnboardingCompleted: boolean;

  // ── Sermon Notes ──
  sermonTitle: string;
  sermonSeries: string;
  sermonSpeaker: string;
  sermonPoints: SermonPointSetting[];
}

export const DEFAULT_SETTINGS: MVSettings = {
  obsUrl: "ws://localhost:4455",
  obsPassword: "",
  obsAutoReconnect: true,
  streamingPlatform: "custom",

  theme: "dark",
  highContrast: false,

  lowerThirdDefaultDurationSec: 10,
  defaultBibleOverlayMode: "fullscreen",
  defaultSpeakerSize: "xl",
  defaultTickerScrollSpeed: 2,
  brandColor: "#6A34DE",
  brandSecondaryColor: "",
  brandAccentColor: "#F59E0B",
  brandFontFamily: "Inter",
  brandFaviconUrl: "",
  churchName: "",
  mainPastorName: "",
  pastorNames: "",
  pastorSpeakers: [],
  brandLogoPath: "",
  brandLogoAssets: [],
  churchProfileOnboardingCompleted: false,

  sermonTitle: "",
  sermonSeries: "",
  sermonSpeaker: "",
  sermonPoints: [],
};

export function getSettings(): MVSettings {
  try {
    const scopedKey = getSettingsStorageKey();
    const raw = localStorage.getItem(scopedKey);
    if (!raw) {
      // Migrate from old unscoped key if it exists
      if (scopedKey !== SETTINGS_KEY) {
        const legacy = localStorage.getItem(SETTINGS_KEY);
        if (legacy) {
          localStorage.removeItem(SETTINGS_KEY);
          localStorage.setItem(scopedKey, legacy);
          const saved = JSON.parse(legacy) as Partial<MVSettings>;
          return { ...DEFAULT_SETTINGS, ...saved, obsPassword: "" };
        }
      }
      return { ...DEFAULT_SETTINGS };
    }
    const saved = JSON.parse(raw) as Partial<MVSettings>;
    // Merge with defaults so new keys always have a value
    return { ...DEFAULT_SETTINGS, ...saved, obsPassword: "" };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: MVSettings): void {
  try {
    localStorage.setItem(getSettingsStorageKey(), JSON.stringify(settings));
  } catch { /* localStorage full — silently fail */ }
}

function notifySettingsUpdated(settings: MVSettings): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MVSettings>(MV_SETTINGS_UPDATED_EVENT, { detail: settings }));
}

export function updateSettings(patch: Partial<MVSettings>): MVSettings {
  const current = getSettings();
  const updated = { ...current, ...patch, obsPassword: "" };
  saveSettings(updated);
  notifySettingsUpdated(updated);

  // Sync speaker profiles to dock data file (fire-and-forget)
  if (patch.pastorSpeakers) {
    syncSpeakersToDock(updated.pastorSpeakers).catch(() => { });
  }

  // Sync sermon data to dock data file (fire-and-forget)
  if (patch.sermonTitle !== undefined || patch.sermonPoints !== undefined || patch.sermonSpeaker !== undefined || patch.sermonSeries !== undefined) {
    syncSermonToDock(updated).catch(() => { });
  }

  // Sync branding settings to dock data file (fire-and-forget)
  if (
    patch.brandLogoPath !== undefined ||
    patch.brandLogoAssets !== undefined ||
    patch.brandColor !== undefined ||
    patch.brandSecondaryColor !== undefined ||
    patch.churchName !== undefined ||
    patch.mainPastorName !== undefined
  ) {
    syncBrandingToDock(updated).catch(() => { });
  }

  return updated;
}

/**
 * Sync multiview layouts to a JSON file the overlay server can serve to the dock.
 * Mirrors the pattern used by worshipDb.syncSongsToDock().
 */
export async function syncLayoutsToDock(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const layouts = await getAllLayouts();
    // Export as summaries (lightweight) for the dock to consume
    const summaries = layouts.map((l) => ({
      id: l.id,
      name: l.name,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      regionCount: l.regions.length,
    }));
    await invoke("save_dock_data", {
      name: "dock-mv-layouts",
      data: JSON.stringify(summaries),
    });
  } catch (err) {
    console.warn("[mvStore] Failed to sync layouts to dock:", err);
  }
}

/**
 * Sync speaker profiles to a JSON file the overlay server can serve to the dock.
 * Mirrors the pattern used by worshipDb.syncSongsToDock().
 */
export async function syncSpeakersToDock(speakers: SpeakerProfileSetting[]): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", {
      name: "dock-speakers",
      data: JSON.stringify(speakers),
    });
  } catch (err) {
    console.warn("[mvStore] Failed to sync speakers to dock:", err);
  }
}

/**
 * Sync branding settings (logo, color, church name) to a JSON file the
 * overlay server can serve to the dock.  The dock page (different origin)
 * fetches /uploads/dock-branding.json to display the church logo in
 * lower-third overlays.
 */
export async function syncBrandingToDock(settings: MVSettings): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    // Extract just the filename from the absolute path — the dock resolves
    // it via the overlay server at /uploads/<filename>
    const logoFileName = settings.brandLogoPath
      ? (settings.brandLogoPath.split(/[\\/]/).pop()?.trim() ?? "")
      : "";
    await invoke("save_dock_data", {
      name: "dock-branding",
      data: JSON.stringify({
        brandLogoPath: settings.brandLogoPath,
        brandLogoFileName: logoFileName,
        brandLogoAssets: settings.brandLogoAssets.map((asset) => ({
          ...asset,
          fileName: asset.path ? (asset.path.split(/[\\/]/).pop()?.trim() ?? "") : "",
        })),
        brandColor: settings.brandColor,
        brandSecondaryColor: settings.brandSecondaryColor,
        brandAccentColor: settings.brandAccentColor,
        brandFontFamily: settings.brandFontFamily,
        brandFaviconUrl: settings.brandFaviconUrl,
        churchName: settings.churchName,
        mainPastorName: settings.mainPastorName,
      }),
    });
  } catch (err) {
    console.warn("[mvStore] Failed to sync branding to dock:", err);
  }
}

/**
 * Sync sermon notes to a JSON file the overlay server can serve to the dock.
 * This allows the dock (even in OBS CEF) to read the latest sermon data.
 */
export async function syncSermonToDock(settings: MVSettings): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", {
      name: "dock-sermon",
      data: JSON.stringify({
        title: settings.sermonTitle,
        series: settings.sermonSeries,
        speaker: settings.sermonSpeaker,
        points: settings.sermonPoints,
      }),
    });
  } catch (err) {
    console.warn("[mvStore] Failed to sync sermon to dock:", err);
  }
}
