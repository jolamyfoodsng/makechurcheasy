/**
 * bibleDb.ts — IndexedDB persistence for the Bible module
 *
 * Stores: favorites, history, custom themes, user settings, downloaded translations.
 * User-owned stores (favorites, history, themes, settings) are scoped by userId.
 * Translations are shared reference data — NOT user-scoped.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { BiblePassage, BibleTheme, SlideConfig } from "./types";
import type { InstalledBible, RawBibleData } from "./types";
import { DEFAULT_SLIDE_CONFIG, DEFAULT_THEME_SETTINGS } from "./types";
import { syncFavoriteBibleThemesToDock } from "../services/favoriteThemes";
import { trackThemeCreated } from "../services/tracking";
import { serializeBibleThemesForDock } from "../services/dockBibleThemeAssets";
import { resolveOverlayAssetUrl, toStoredOverlayAssetUrl } from "../services/overlayUrl";
import { getCurrentUserId } from "../services/db";
import { getDeviceId } from "../services/authService";

const DB_NAME = "sunday-switcher-bible"; // legacy name — do not change (breaks existing user data)
const DB_VERSION = 4;
const CUSTOM_THEMES_STORAGE_KEY = "ocs-bible-custom-themes";

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://web-tayo-akosiles-projects.vercel.app";

function getCustomThemesStorageKey(): string {
  const uid = getCurrentUserId();
  return uid ? `${CUSTOM_THEMES_STORAGE_KEY}:${uid}` : CUSTOM_THEMES_STORAGE_KEY;
}

// ── MongoDB API sync helpers ─────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const deviceId = getDeviceId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(deviceId ? { "X-Device-Id": deviceId } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API ${res.status}`);
  }

  return res.json();
}

async function pushThemeToAPI(theme: BibleTheme): Promise<void> {
  await apiFetch("/api/themes", {
    method: "POST",
    body: JSON.stringify({
      theme: {
        themeId: theme.id,
        name: theme.name,
        description: theme.description,
        source: theme.source || "custom",
        templateType: theme.templateType,
        category: theme.category,
        categories: theme.categories,
        settings: theme.settings,
        preview: theme.preview,
        hidden: theme.hidden,
        createdAt: theme.createdAt,
        updatedAt: theme.updatedAt,
      },
    }),
  });
}

async function deleteThemeFromAPI(themeId: string): Promise<void> {
  await apiFetch(`/api/themes?themeId=${encodeURIComponent(themeId)}`, {
    method: "DELETE",
  });
}

async function fetchThemesFromAPI(): Promise<BibleTheme[]> {
  const data = await apiFetch<{ themes: Array<Record<string, unknown>> }>("/api/themes");
  return (data.themes || []).map((doc) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = {
      id: doc.themeId,
      name: doc.name,
      description: doc.description,
      source: "custom",
      templateType: doc.templateType,
      category: doc.category,
      categories: doc.categories,
      settings: doc.settings,
      preview: doc.preview,
      hidden: doc.hidden,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
    return normalizeTheme(raw as BibleTheme);
  });
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function normalizeTheme(theme: BibleTheme): BibleTheme {
  return {
    ...theme,
    settings: {
      ...DEFAULT_THEME_SETTINGS,
      ...theme.settings,
      backgroundImage: resolveOverlayAssetUrl(theme.settings?.backgroundImage),
      backgroundVideo: resolveOverlayAssetUrl(theme.settings?.backgroundVideo),
      boxBackgroundImage: resolveOverlayAssetUrl(theme.settings?.boxBackgroundImage),
      logoUrl: resolveOverlayAssetUrl(theme.settings?.logoUrl),
    },
  };
}

function prepareThemeForStorage(theme: BibleTheme): BibleTheme {
  return {
    ...theme,
    settings: {
      ...DEFAULT_THEME_SETTINGS,
      ...theme.settings,
      backgroundImage: toStoredOverlayAssetUrl(theme.settings?.backgroundImage),
      backgroundVideo: toStoredOverlayAssetUrl(theme.settings?.backgroundVideo),
      boxBackgroundImage: toStoredOverlayAssetUrl(theme.settings?.boxBackgroundImage),
      logoUrl: toStoredOverlayAssetUrl(theme.settings?.logoUrl),
    },
  };
}

function sortCustomThemesNewestFirst(themes: BibleTheme[]): BibleTheme[] {
  return [...themes].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function readCustomThemesFromLocalStorage(): BibleTheme[] {
  if (typeof window === "undefined") return [];
  try {
    const scopedKey = getCustomThemesStorageKey();
    const raw = localStorage.getItem(scopedKey);
    if (!raw) {
      // Migrate from old unscoped key if it exists
      if (scopedKey !== CUSTOM_THEMES_STORAGE_KEY) {
        const legacy = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
        if (legacy) {
          localStorage.removeItem(CUSTOM_THEMES_STORAGE_KEY);
          localStorage.setItem(scopedKey, legacy);
          const parsed: unknown = JSON.parse(legacy);
          if (!Array.isArray(parsed)) return [];
          return sortCustomThemesNewestFirst(parsed
            .filter((theme): theme is BibleTheme => !!theme && typeof theme === "object" && "id" in theme)
            .map((theme) => normalizeTheme(theme)));
        }
      }
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortCustomThemesNewestFirst(parsed
      .filter((theme): theme is BibleTheme => !!theme && typeof theme === "object" && "id" in theme)
      .map((theme) => normalizeTheme(theme)));
  } catch {
    return [];
  }
}

function writeCustomThemesToLocalStorage(themes: BibleTheme[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(
      getCustomThemesStorageKey(),
      JSON.stringify(sortCustomThemesNewestFirst(themes.map((theme) => prepareThemeForStorage(theme))))
    );
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      console.warn("[bibleDb] localStorage quota exceeded for custom themes. IndexedDB is primary storage.");
    } else {
      console.warn("[bibleDb] Failed to mirror custom themes to localStorage:", err);
    }
    return false;
  }
}

function upsertCustomThemeInLocalStorage(theme: BibleTheme): boolean {
  const themes = readCustomThemesFromLocalStorage();
  const index = themes.findIndex((item) => item.id === theme.id);
  const nextTheme = normalizeTheme(theme);
  if (index >= 0) {
    themes[index] = nextTheme;
  } else {
    themes.push(nextTheme);
  }
  return writeCustomThemesToLocalStorage(themes);
}

function removeCustomThemeFromLocalStorage(id: string): boolean {
  const themes = readCustomThemesFromLocalStorage().filter((theme) => theme.id !== id);
  return writeCustomThemesToLocalStorage(themes);
}

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // ── v1 stores ──
        if (oldVersion < 1) {
          // Favorites store
          if (!db.objectStoreNames.contains("favorites")) {
            db.createObjectStore("favorites", { keyPath: "reference" });
          }
          // History store (keyed by timestamp)
          if (!db.objectStoreNames.contains("history")) {
            const store = db.createObjectStore("history", {
              keyPath: "id",
              autoIncrement: true,
            });
            store.createIndex("timestamp", "timestamp");
          }
          // Custom themes
          if (!db.objectStoreNames.contains("themes")) {
            db.createObjectStore("themes", { keyPath: "id" });
          }
          // Settings (single row, key = "settings")
          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings");
          }
        }

        // ── v2: downloaded translations ──
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("translations")) {
            db.createObjectStore("translations", { keyPath: "abbr" });
          }
        }

        // ── v3: Add userId index to user-owned stores for cross-account isolation ──
        if (oldVersion < 3) {
          const userStores = ["favorites", "history", "themes"];
          for (const storeName of userStores) {
            if (db.objectStoreNames.contains(storeName)) {
              const store = transaction.objectStore(storeName) as unknown as IDBObjectStore;
              if (!store.indexNames.contains("userId")) {
                store.createIndex("userId", "userId", { unique: false });
              }
            }
          }
          // Settings uses manual key — no index needed (key will be userId-prefixed)
        }
        // Safety: ensure userId indexes exist even if v3 upgrade partially failed
        {
          const userStores = ["favorites", "history", "themes"];
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
// Favorites
// ---------------------------------------------------------------------------

export async function getFavorites(): Promise<BiblePassage[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  if (uid) {
    return db.getAllFromIndex("favorites", "userId", uid) as Promise<BiblePassage[]>;
  }
  return db.getAll("favorites");
}

export async function addFavorite(passage: BiblePassage): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  const tagged = uid ? { ...passage, userId: uid } : passage;
  await db.put("favorites", tagged);
}

export async function removeFavorite(reference: string): Promise<void> {
  const db = await getDb();
  await db.delete("favorites", reference);
}

export async function isFavorite(reference: string): Promise<boolean> {
  const db = await getDb();
  const item = await db.get("favorites", reference);
  return !!item;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  id?: number;
  passage: BiblePassage;
  timestamp: number;
}

export async function getHistory(limit = 100): Promise<HistoryEntry[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  const entries: HistoryEntry[] = [];
  const tx = db.transaction("history", "readonly");

  if (uid) {
    const idx = tx.store.index("userId");
    let cursor = await idx.openCursor(IDBKeyRange.only(uid), "prev");
    while (cursor && entries.length < limit) {
      entries.push(cursor.value);
      cursor = await cursor.continue();
    }
  } else {
    const index = tx.store.index("timestamp");
    let cursor = await index.openCursor(null, "prev");
    while (cursor && entries.length < limit) {
      entries.push(cursor.value);
      cursor = await cursor.continue();
    }
  }

  return entries;
}

export async function addToHistory(passage: BiblePassage): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  await db.add("history", {
    passage,
    timestamp: Date.now(),
    ...(uid ? { userId: uid } : {}),
  });
}

export async function clearHistory(): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  if (uid) {
    const tx = db.transaction("history", "readwrite");
    const idx = tx.store.index("userId");
    let cursor = await idx.openCursor(IDBKeyRange.only(uid));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } else {
    await db.clear("history");
  }
}

// ---------------------------------------------------------------------------
// Custom Themes
// ---------------------------------------------------------------------------

export async function getCustomThemes(): Promise<BibleTheme[]> {
  // Try MongoDB API first (source of truth) — requires device auth
  if (!getDeviceId()) {
    // No deviceId available yet; skip API and use local storage
    return getCustomThemesFromIndexedDB();
  }
  try {
    const apiThemes = await fetchThemesFromAPI();
    // Update local cache in background
    (async () => {
      try {
        const db = await getDb();
        const uid = getCurrentUserId();
        for (const theme of apiThemes) {
          const tagged = uid ? { ...prepareThemeForStorage(theme), userId: uid } : prepareThemeForStorage(theme);
          await db.put("themes", tagged);
        }
        writeCustomThemesToLocalStorage(apiThemes);
      } catch { /* cache update is best-effort */ }
    })();
    return apiThemes;
  } catch (err) {
    console.warn("[bibleDb] API fetch failed, falling back to IndexedDB:", err);
  }

  return getCustomThemesFromIndexedDB();
}

async function getCustomThemesFromIndexedDB(): Promise<BibleTheme[]> {
  try {
    const db = await getDb();
    const uid = getCurrentUserId();
    let raw: BibleTheme[];
    if (uid) {
      raw = await db.getAllFromIndex("themes", "userId", uid) as BibleTheme[];
    } else {
      raw = await db.getAll("themes") as BibleTheme[];
    }
    const themes = sortCustomThemesNewestFirst(raw.map((theme) => normalizeTheme(theme)));
    try {
      const existing = readCustomThemesFromLocalStorage();
      if (existing.length === 0 && themes.length > 0) {
        writeCustomThemesToLocalStorage(themes);
      }
    } catch {
      // Ignore mirror errors - IndexedDB is primary storage
    }
    return themes;
  } catch (err) {
    console.warn("[bibleDb] Failed to load custom themes from IndexedDB, falling back to localStorage:", err);
    return readCustomThemesFromLocalStorage();
  }
}

export async function saveCustomTheme(theme: BibleTheme): Promise<void> {
  const normalizedTheme = prepareThemeForStorage(theme);
  const uid = getCurrentUserId();
  const tagged = uid ? { ...normalizedTheme, userId: uid } : normalizedTheme;

  // Push to MongoDB API (source of truth) — skip if not authenticated
  if (getDeviceId()) {
    try {
      await pushThemeToAPI(tagged);
    } catch (err) {
      console.warn("[bibleDb] API push failed, saving locally only:", err);
    }
  }

  // Always update local cache
  let savedToDb = false;
  try {
    const db = await getDb();
    await db.put("themes", tagged);
    savedToDb = true;
  } catch (err) {
    console.warn("[bibleDb] Failed to save custom theme to IndexedDB, falling back to localStorage:", err);
  }

  const savedToLocalStorage = upsertCustomThemeInLocalStorage(tagged);
  if (!savedToDb && !savedToLocalStorage) {
    throw new Error("Failed to save custom theme");
  }

  trackThemeCreated(theme.source || "custom");

  syncCustomThemesToDock().catch((err) => {
    console.warn("[bibleDb] Failed to sync custom themes to dock:", err);
  });
  syncFavoriteBibleThemesToDock().catch((err) => {
    console.warn("[bibleDb] Failed to sync favorite Bible themes to dock:", err);
  });

  // Push updated usage counts to the server immediately
  import("../services/usageSync").then((m) => m.triggerUsageSync()).catch(() => { });
}

export async function deleteCustomTheme(id: string): Promise<void> {
  // Delete from MongoDB API (source of truth) — skip if not authenticated
  if (getDeviceId()) {
    try {
      await deleteThemeFromAPI(id);
    } catch (err) {
      console.warn("[bibleDb] API delete failed, removing locally only:", err);
    }
  }

  // Always remove from local cache
  let deletedFromDb = false;
  try {
    const db = await getDb();
    await db.delete("themes", id);
    deletedFromDb = true;
  } catch (err) {
    console.warn("[bibleDb] Failed to delete custom theme from IndexedDB, falling back to localStorage:", err);
  }

  const deletedFromLocalStorage = removeCustomThemeFromLocalStorage(id);
  if (!deletedFromDb && !deletedFromLocalStorage) {
    throw new Error("Failed to delete custom theme");
  }

  syncCustomThemesToDock().catch((err) => {
    console.warn("[bibleDb] Failed to sync custom themes to dock:", err);
  });
  syncFavoriteBibleThemesToDock().catch((err) => {
    console.warn("[bibleDb] Failed to sync favorite Bible themes to dock:", err);
  });

  // Push updated usage counts to the server immediately
  import("../services/usageSync").then((m) => m.triggerUsageSync()).catch(() => { });
}

export async function syncCustomThemesToDock(themes?: BibleTheme[]): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const payload = await serializeBibleThemesForDock(themes ?? await getCustomThemes());
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", {
      name: "dock-bible-themes",
      data: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[bibleDb] Failed to sync custom themes to dock:", err);
  }
}

export async function syncInstalledTranslationsToDock(): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const installed = await getInstalledTranslations();

    await invoke("save_dock_data", {
      name: "dock-bible-translations",
      data: JSON.stringify(installed.map((entry) => ({
        id: entry.id,
        abbr: entry.abbr,
        name: entry.name,
        language: entry.language,
        downloadedAt: entry.downloadedAt,
        filesize: entry.filesize,
      }))),
    });

    for (const entry of installed) {
      const full = await getInstalledTranslation(entry.abbr);
      if (!full?.data) continue;
      await invoke("save_dock_data", {
        name: `dock-bible-translation-${entry.abbr.toLowerCase()}`,
        data: JSON.stringify(full.data),
      });
    }
  } catch (err) {
    console.warn("[bibleDb] Failed to sync installed translations to dock:", err);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface BibleSettings {
  defaultTranslation: string;
  slideConfig: SlideConfig;
  activeThemeId: string;
  lastBook: string;
  lastChapter: number;
  lastVerse: number;
  /** UI colour mode: 'dark' | 'light' | 'system' */
  colorMode: "dark" | "light" | "system";
  /** Auto-send verse on double-click */
  autoSendOnDoubleClick: boolean;
  /** Font scale factor for UI (1 = default) */
  uiFontScale: number;
  /** Reduce motion / animations in the app UI */
  reduceMotion: boolean;
  /** High-contrast borders and text */
  highContrast: boolean;
}

const DEFAULT_SETTINGS: BibleSettings = {
  defaultTranslation: "KJV",
  slideConfig: DEFAULT_SLIDE_CONFIG,
  activeThemeId: "classic-dark",
  lastBook: "John",
  lastChapter: 3,
  lastVerse: 1,
  colorMode: "dark",
  autoSendOnDoubleClick: true,
  uiFontScale: 1,
  reduceMotion: false,
  highContrast: false,
};

export async function getBibleSettings(): Promise<BibleSettings> {
  const db = await getDb();
  const uid = getCurrentUserId();
  const key = uid ? `${uid}_settings` : "settings";
  const settings = await db.get("settings", key);
  if (settings) return settings;
  // Fallback: try unscoped key for migration
  if (uid) {
    const legacy = await db.get("settings", "settings");
    if (legacy) {
      await db.put("settings", { ...legacy, userId: uid }, key);
      return legacy;
    }
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveBibleSettings(
  settings: Partial<BibleSettings>
): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  const key = uid ? `${uid}_settings` : "settings";
  const current = await getBibleSettings();
  await db.put("settings", { ...current, ...settings }, key);
}

// ---------------------------------------------------------------------------
// Downloaded Translations
// ---------------------------------------------------------------------------

/**
 * Get all installed / downloaded translations (metadata only — no data field).
 */
export async function getInstalledTranslations(): Promise<Omit<InstalledBible, "data">[]> {
  const db = await getDb();
  const all: InstalledBible[] = await db.getAll("translations");
  // Strip the heavy data field for listing
  return all.map(({ data: _data, ...meta }) => meta);
}

/**
 * Get a specific installed translation including its full data.
 */
export async function getInstalledTranslation(
  abbr: string
): Promise<InstalledBible | undefined> {
  const db = await getDb();
  return db.get("translations", abbr);
}

/**
 * Get only the Bible data for an installed translation (for loading into memory).
 */
export async function getTranslationData(
  abbr: string
): Promise<RawBibleData | undefined> {
  const bible = await getInstalledTranslation(abbr);
  return bible?.data;
}

/**
 * Save a fully downloaded + parsed Bible into IndexedDB.
 */
export async function saveInstalledTranslation(
  bible: InstalledBible
): Promise<void> {
  const db = await getDb();
  await db.put("translations", bible);
  syncInstalledTranslationsToDock().catch((err) => {
    console.warn("[bibleDb] Failed to sync installed translations after save:", err);
  });
}

/**
 * Delete a downloaded translation.
 */
export async function deleteInstalledTranslation(
  abbr: string
): Promise<void> {
  const db = await getDb();
  await db.delete("translations", abbr);
  syncInstalledTranslationsToDock().catch((err) => {
    console.warn("[bibleDb] Failed to sync installed translations after delete:", err);
  });
}

/**
 * Check if a translation is already installed.
 */
export async function isTranslationInstalled(
  abbr: string
): Promise<boolean> {
  const db = await getDb();
  const item = await db.get("translations", abbr);
  return !!item;
}

// ---------------------------------------------------------------------------
// First-Run Detection
// ---------------------------------------------------------------------------

/**
 * Returns true if this is the very first time the app is running
 * (no translations have ever been downloaded).
 */
export async function isFirstRun(): Promise<boolean> {
  const db = await getDb();
  const count = await db.count("translations");
  return count === 0;
}
