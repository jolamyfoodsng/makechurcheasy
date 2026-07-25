/**
 * favoriteThemes.ts — Shared favorite-theme persistence
 *
 * Stores three sets of favorite theme IDs in localStorage:
 *   - "ocs-fav-bible-themes"   → Bible overlay themes (BibleTheme ids)
 *   - "ocs-fav-worship-themes" → Worship lower-third themes (LowerThirdTheme ids)
 *   - "ocs-fav-obs-themes"     → OBS lower-third themes (all_themes.json ids)
 *
 * Both Bible fullscreen and worship fullscreen share the same Bible theme pool,
 * so they share one favorites list.
 */

import { canonicalizeLowerThirdThemeId } from "../lowerthirds/themes";
import { serializeBibleThemesForDock } from "./dockBibleThemeAssets";
import { getByKey, putRecord, STORES, getCurrentUserId } from "./db";

// ---------------------------------------------------------------------------
// Storage keys — scoped to userId for cross-account isolation
// ---------------------------------------------------------------------------

const BIBLE_FAVS_KEY = "ocs-fav-bible-themes";
const WORSHIP_LT_FAVS_KEY = "ocs-fav-worship-lt-themes";
const OBS_FAVS_KEY = "ocs-fav-obs-themes";
const TICKER_FAVS_KEY = "ocs-fav-ticker-themes";
const BIBLE_DB_KEY = "favorite-themes:bible";
const WORSHIP_LT_DB_KEY = "favorite-themes:worship-lt";
const OBS_DB_KEY = "favorite-themes:obs";
const TICKER_DB_KEY = "favorite-themes:tickers";
export const FAVORITE_THEMES_UPDATED_EVENT = "favorite-themes-updated";

function scopedLocalStorageKey(base: string): string {
  const uid = getCurrentUserId();
  return uid ? `${base}:${uid}` : base;
}

function scopedDbKey(base: string): string {
  const uid = getCurrentUserId();
  return uid ? `${base}:${uid}` : base;
}

let bibleFavoritesCache = readSet(scopedLocalStorageKey(BIBLE_FAVS_KEY));
let worshipLtFavoritesCache = normalizeLtFavorites(readSet(scopedLocalStorageKey(WORSHIP_LT_FAVS_KEY)));
let obsFavoritesCache = readSet(scopedLocalStorageKey(OBS_FAVS_KEY));
let tickerFavoritesCache = readSet(scopedLocalStorageKey(TICKER_FAVS_KEY));
let hydrationPromise: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Reset — called on logout to prevent cross-user data leakage
// ---------------------------------------------------------------------------

export function resetFavoriteThemeCaches(): void {
  bibleFavoritesCache = new Set();
  worshipLtFavoritesCache = new Set();
  obsFavoritesCache = new Set();
  tickerFavoritesCache = new Set();
  hydrationPromise = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
    return true;
  } catch (err) {
    console.warn(`[favoriteThemes] Failed to persist favorites for ${key}:`, err);
    return false;
  }
}

function normalizeLtFavorites(set: Set<string>): Set<string> {
  const normalized = new Set<string>();
  for (const themeId of set) {
    normalized.add(canonicalizeLowerThirdThemeId(themeId));
  }
  return normalized;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function canSyncDockData(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function mergeSets(...sets: Array<Set<string>>): Set<string> {
  const merged = new Set<string>();
  for (const set of sets) {
    for (const value of set) {
      if (typeof value === "string" && value.trim()) {
        merged.add(value);
      }
    }
  }
  return merged;
}

function emitFavoritesUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FAVORITE_THEMES_UPDATED_EVENT));
}

async function readSetFromDb(key: string): Promise<Set<string>> {
  try {
    const stored = await getByKey<unknown>(STORES.APP_SETTINGS, key);
    if (!Array.isArray(stored)) return new Set();
    return new Set(stored.filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  } catch {
    return new Set();
  }
}

async function writeSetToDb(key: string, set: Set<string>): Promise<void> {
  try {
    await putRecord(STORES.APP_SETTINGS, [...set], key);
  } catch {
    // Best-effort mirror only.
  }
}

function setBibleFavoritesCache(next: Set<string>, emit = true): void {
  bibleFavoritesCache = new Set(next);
  writeSet(scopedLocalStorageKey(BIBLE_FAVS_KEY), bibleFavoritesCache);
  if (emit) emitFavoritesUpdated();
}

function setWorshipLtFavoritesCache(next: Set<string>, emit = true): void {
  worshipLtFavoritesCache = normalizeLtFavorites(next);
  writeSet(scopedLocalStorageKey(WORSHIP_LT_FAVS_KEY), worshipLtFavoritesCache);
  if (emit) emitFavoritesUpdated();
}

function setObsFavoritesCache(next: Set<string>, emit = true): void {
  obsFavoritesCache = new Set(next);
  writeSet(scopedLocalStorageKey(OBS_FAVS_KEY), obsFavoritesCache);
  if (emit) emitFavoritesUpdated();
}

function setTickerFavoritesCache(next: Set<string>, emit = true): void {
  tickerFavoritesCache = new Set(next);
  writeSet(scopedLocalStorageKey(TICKER_FAVS_KEY), tickerFavoritesCache);
  if (emit) emitFavoritesUpdated();
}

function ensureHydrationStarted(): void {
  if (hydrationPromise) return;
  hydrationPromise = hydrateFavoriteThemes().catch(() => { });
}

export async function hydrateFavoriteThemes(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const [persistedBible, persistedLt, persistedObs, persistedTicker] = await Promise.all([
      readSetFromDb(scopedDbKey(BIBLE_DB_KEY)),
      readSetFromDb(scopedDbKey(WORSHIP_LT_DB_KEY)),
      readSetFromDb(scopedDbKey(OBS_DB_KEY)),
      readSetFromDb(scopedDbKey(TICKER_DB_KEY)),
    ]);

    const mergedBible = mergeSets(bibleFavoritesCache, persistedBible);
    const mergedLt = normalizeLtFavorites(mergeSets(worshipLtFavoritesCache, persistedLt));
    const mergedObs = mergeSets(obsFavoritesCache, persistedObs);
    const mergedTicker = mergeSets(tickerFavoritesCache, persistedTicker);

    const bibleChanged = !setsEqual(bibleFavoritesCache, mergedBible);
    const ltChanged = !setsEqual(worshipLtFavoritesCache, mergedLt);
    const obsChanged = !setsEqual(obsFavoritesCache, mergedObs);
    const tickerChanged = !setsEqual(tickerFavoritesCache, mergedTicker);

    if (bibleChanged) {
      setBibleFavoritesCache(mergedBible, false);
    }
    if (ltChanged) {
      setWorshipLtFavoritesCache(mergedLt, false);
    }
    if (obsChanged) {
      setObsFavoritesCache(mergedObs, false);
    }
    if (tickerChanged) {
      setTickerFavoritesCache(mergedTicker, false);
    }

    await Promise.all([
      writeSetToDb(scopedDbKey(BIBLE_DB_KEY), mergedBible),
      writeSetToDb(scopedDbKey(WORSHIP_LT_DB_KEY), mergedLt),
      writeSetToDb(scopedDbKey(OBS_DB_KEY), mergedObs),
      writeSetToDb(scopedDbKey(TICKER_DB_KEY), mergedTicker),
    ]);

    if (bibleChanged || ltChanged || obsChanged || tickerChanged) {
      emitFavoritesUpdated();
    }
  })();

  return hydrationPromise;
}

// ---------------------------------------------------------------------------
// Bible themes (fullscreen overlays — shared by Bible & Worship fullscreen)
// ---------------------------------------------------------------------------

export function getBibleFavorites(): Set<string> {
  ensureHydrationStarted();
  const favorites = new Set(bibleFavoritesCache);
  if (favorites.size > 0) {
    syncBibleFavoritesToDock(favorites).catch(() => { });
    syncFavoriteBibleThemesToDock(favorites).catch(() => { });
  }
  return favorites;
}

export function toggleBibleFavorite(themeId: string): Set<string> {
  const set = new Set(bibleFavoritesCache);
  if (set.has(themeId)) {
    set.delete(themeId);
  } else {
    set.add(themeId);
  }
  setBibleFavoritesCache(set);
  writeSetToDb(scopedDbKey(BIBLE_DB_KEY), set).catch(() => { });
  syncBibleFavoritesToDock(set).catch(() => { });
  syncFavoriteBibleThemesToDock(set).catch(() => { });
  return new Set(set);
}

export function addBibleFavorite(themeId: string): Set<string> {
  const set = new Set(bibleFavoritesCache);
  if (!set.has(themeId)) {
    set.add(themeId);
    setBibleFavoritesCache(set);
    writeSetToDb(scopedDbKey(BIBLE_DB_KEY), set).catch(() => { });
    syncBibleFavoritesToDock(set).catch(() => { });
    syncFavoriteBibleThemesToDock(set).catch(() => { });
  }
  return new Set(set);
}

export function isBibleFavorite(themeId: string): boolean {
  ensureHydrationStarted();
  return bibleFavoritesCache.has(themeId);
}

// ---------------------------------------------------------------------------
// Worship lower-third themes
// ---------------------------------------------------------------------------

export function getWorshipLTFavorites(): Set<string> {
  ensureHydrationStarted();
  const normalized = new Set(worshipLtFavoritesCache);
  if (normalized.size > 0) {
    syncLTFavoritesToDock(normalized).catch(() => { });
  }
  return normalized;
}

export function toggleWorshipLTFavorite(themeId: string): Set<string> {
  const canonicalThemeId = canonicalizeLowerThirdThemeId(themeId);
  const set = new Set(worshipLtFavoritesCache);
  if (set.has(canonicalThemeId)) {
    set.delete(canonicalThemeId);
  } else {
    set.add(canonicalThemeId);
  }
  setWorshipLtFavoritesCache(set);
  writeSetToDb(scopedDbKey(WORSHIP_LT_DB_KEY), set).catch(() => { });

  // Fire-and-forget sync to dock JSON file so the dock (different origin) can read it
  syncLTFavoritesToDock(set).catch(() => { });

  return new Set(set);
}

export function isWorshipLTFavorite(themeId: string): boolean {
  ensureHydrationStarted();
  return worshipLtFavoritesCache.has(canonicalizeLowerThirdThemeId(themeId));
}

// ---------------------------------------------------------------------------
// OBS lower-third themes (from all_themes.json)
// ---------------------------------------------------------------------------

export function getObsFavorites(): Set<string> {
  ensureHydrationStarted();
  const favorites = new Set(obsFavoritesCache);
  if (favorites.size > 0) {
    syncObsFavoritesToDock(favorites).catch(() => { });
  }
  return favorites;
}

export function toggleObsFavorite(themeId: string): Set<string> {
  const set = new Set(obsFavoritesCache);
  if (set.has(themeId)) {
    set.delete(themeId);
  } else {
    set.add(themeId);
  }
  setObsFavoritesCache(set);
  writeSetToDb(scopedDbKey(OBS_DB_KEY), set).catch(() => { });
  syncObsFavoritesToDock(set).catch(() => { });
  return new Set(set);
}

export function isObsFavorite(themeId: string): boolean {
  ensureHydrationStarted();
  return obsFavoritesCache.has(themeId);
}

// ---------------------------------------------------------------------------
// Ticker favorites
// ---------------------------------------------------------------------------

export function getTickerFavorites(): Set<string> {
  ensureHydrationStarted();
  return new Set(tickerFavoritesCache);
}

export function toggleTickerFavorite(tickerId: string): Set<string> {
  const set = new Set(tickerFavoritesCache);
  if (set.has(tickerId)) {
    set.delete(tickerId);
  } else {
    set.add(tickerId);
  }
  setTickerFavoritesCache(set);
  writeSetToDb(scopedDbKey(TICKER_DB_KEY), set).catch(() => { });
  syncTickerFavoritesToDock(set).catch(() => { });
  return new Set(set);
}

export function isTickerFavorite(tickerId: string): boolean {
  ensureHydrationStarted();
  return tickerFavoritesCache.has(tickerId);
}

// ---------------------------------------------------------------------------
// Sort helper — favorites first, then the rest
// ---------------------------------------------------------------------------

export function sortWithFavorites<T extends { id: string }>(
  items: T[],
  favorites: Set<string>,
): T[] {
  const favs: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (favorites.has(item.id)) {
      favs.push(item);
    } else {
      rest.push(item);
    }
  }
  return [...favs, ...rest];
}

// ---------------------------------------------------------------------------
// Dock sync — write favorites to a JSON file so the dock (different origin)
// can fetch them via the overlay HTTP server.
// ---------------------------------------------------------------------------

/**
 * Sync LT favorites to a dock-accessible JSON file.
 * Called automatically when favorites change.
 */
export async function syncLTFavoritesToDock(favorites?: Set<string>): Promise<void> {
  try {
    if (!canSyncDockData()) return;
    const favs = favorites ?? getWorshipLTFavorites();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", {
      name: "dock-lt-favorites",
      data: JSON.stringify([...favs]),
    });
  } catch (err) {
    console.warn("[favoriteThemes] Failed to sync LT favorites to dock:", err);
  }
}

export async function syncBibleFavoritesToDock(favorites?: Set<string>): Promise<void> {
  try {
    if (!canSyncDockData()) return;
    const favs = favorites ?? getBibleFavorites();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", {
      name: "dock-bible-favorites",
      data: JSON.stringify([...favs]),
    });
  } catch (err) {
    console.warn("[favoriteThemes] Failed to sync Bible favorites to dock:", err);
  }
}

export async function syncFavoriteBibleThemesToDock(favorites?: Set<string>): Promise<void> {
  try {
    if (!canSyncDockData()) return;
    const favs = favorites ?? getBibleFavorites();
    const [{ BUILTIN_THEMES }, { getCustomThemes }] = await Promise.all([
      import("../bible/themes/builtinThemes"),
      import("../bible/bibleDb"),
    ]);
    const customThemes = await getCustomThemes();
    const builtinIds = new Set(BUILTIN_THEMES.map((theme) => theme.id));
    const uniqueCustom = customThemes.filter((theme) => !builtinIds.has(theme.id));
    const favoriteThemes = [...BUILTIN_THEMES, ...uniqueCustom].filter((theme) => favs.has(theme.id));
    const serializedFavoriteThemes = await serializeBibleThemesForDock(favoriteThemes);

    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", {
      name: "dock-bible-favorite-themes",
      data: JSON.stringify(serializedFavoriteThemes),
    });
  } catch (err) {
    console.warn("[favoriteThemes] Failed to sync favorite Bible themes to dock:", err);
  }
}

/**
 * Sync OBS favorite theme IDs to a dock-accessible JSON file.
 * Called automatically when OBS favorites change.
 */
export async function syncObsFavoritesToDock(favorites?: Set<string>): Promise<void> {
  try {
    if (!canSyncDockData()) {
      console.warn("[favoriteThemes] syncObsFavoritesToDock: canSyncDockData() is false");
      return;
    }
    const favs = favorites ?? getObsFavorites();
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = JSON.stringify({ favoriteThemes: [...favs] });
    await invoke("save_dock_data", {
      name: "dock-obs-favorites",
      data: payload,
    });
  } catch (err) {
    console.warn("[favoriteThemes] Failed to sync OBS favorites to dock:", err);
  }
}

/**
 * Sync ticker favorite IDs to a dock-accessible JSON file.
 * Called automatically when ticker favorites change.
 */
export async function syncTickerFavoritesToDock(favorites?: Set<string>): Promise<void> {
  try {
    if (!canSyncDockData()) return;
    const favs = favorites ?? getTickerFavorites();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", {
      name: "dock-ticker-favorites",
      data: JSON.stringify({ favoriteTickers: [...favs] }),
    });
  } catch (err) {
    console.warn("[favoriteThemes] Failed to sync ticker favorites to dock:", err);
  }
}
