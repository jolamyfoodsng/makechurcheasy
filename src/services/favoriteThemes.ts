/**
 * favoriteThemes.ts — Shared favorite-theme persistence
 *
 * Stores favorite theme IDs in the desktop-native Dock settings database:
 *   - "ocs-fav-bible-themes"   → Bible overlay themes (BibleTheme ids)
 *   - "ocs-fav-worship-themes" → Worship lower-third themes (LowerThirdTheme ids)
 *   - "ocs-fav-obs-themes"     → OBS lower-third themes (all_themes.json ids)
 *
 * Both Bible fullscreen and worship fullscreen share the same Bible theme pool,
 * so they share one favorites list.
 */

import { canonicalizeLowerThirdThemeId } from "../lowerthirds/themes";
import { serializeBibleThemesForDock } from "./dockBibleThemeAssets";
import {
  getNativeDockSettingsScope,
  hydrateNativeDockSettings,
  readNativeDockSetting,
  writeNativeDockSetting,
} from "./localDockSettings";

// ---------------------------------------------------------------------------
// Storage keys — scoped to userId for cross-account isolation
// ---------------------------------------------------------------------------

const BIBLE_FAVS_KEY = "ocs-fav-bible-themes";
const WORSHIP_LT_FAVS_KEY = "ocs-fav-worship-lt-themes";
const OBS_FAVS_KEY = "ocs-fav-obs-themes";
const TICKER_FAVS_KEY = "ocs-fav-ticker-themes";
export const FAVORITE_THEMES_UPDATED_EVENT = "favorite-themes-updated";

function scopedLocalStorageKey(base: string): string {
  return base;
}

let bibleFavoritesCacheKey = scopedLocalStorageKey(BIBLE_FAVS_KEY);
let worshipLtFavoritesCacheKey = scopedLocalStorageKey(WORSHIP_LT_FAVS_KEY);
let obsFavoritesCacheKey = scopedLocalStorageKey(OBS_FAVS_KEY);
let tickerFavoritesCacheKey = scopedLocalStorageKey(TICKER_FAVS_KEY);
let bibleFavoritesCache = readSet(bibleFavoritesCacheKey);
let worshipLtFavoritesCache = normalizeLtFavorites(readSet(worshipLtFavoritesCacheKey));
let obsFavoritesCache = readSet(obsFavoritesCacheKey);
let tickerFavoritesCache = readSet(tickerFavoritesCacheKey);
let hydrationPromise: Promise<void> | null = null;
let hydrationScopeToken: string | null = null;

// ---------------------------------------------------------------------------
// Reset — called on logout to prevent cross-user data leakage
// ---------------------------------------------------------------------------

export function resetFavoriteThemeCaches(): void {
  bibleFavoritesCacheKey = scopedLocalStorageKey(BIBLE_FAVS_KEY);
  worshipLtFavoritesCacheKey = scopedLocalStorageKey(WORSHIP_LT_FAVS_KEY);
  obsFavoritesCacheKey = scopedLocalStorageKey(OBS_FAVS_KEY);
  tickerFavoritesCacheKey = scopedLocalStorageKey(TICKER_FAVS_KEY);
  bibleFavoritesCache = new Set();
  worshipLtFavoritesCache = new Set();
  obsFavoritesCache = new Set();
  tickerFavoritesCache = new Set();
  hydrationPromise = null;
  hydrationScopeToken = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSet(key: string): Set<string> {
  try {
    const legacyKey = key === BIBLE_FAVS_KEY
      ? "favorite-themes:bible"
      : key === WORSHIP_LT_FAVS_KEY
        ? "favorite-themes:worship-lt"
        : key === OBS_FAVS_KEY
          ? "favorite-themes:obs"
          : key === TICKER_FAVS_KEY
            ? "favorite-themes:tickers"
            : "";
    const stored = readNativeDockSetting<unknown>(key) ?? (legacyKey ? readNativeDockSetting<unknown>(legacyKey) : undefined);
    if (stored === undefined || stored === null) return new Set();
    const arr: unknown = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>): boolean {
  writeNativeDockSetting(key, [...set]);
  return true;
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

function refreshBibleFavoritesCache(): Set<string> {
  const key = scopedLocalStorageKey(BIBLE_FAVS_KEY);
  const stored = readSet(key);
  bibleFavoritesCacheKey = key;
  bibleFavoritesCache = stored;
  return new Set(bibleFavoritesCache);
}

function refreshWorshipLtFavoritesCache(): Set<string> {
  const key = scopedLocalStorageKey(WORSHIP_LT_FAVS_KEY);
  const stored = normalizeLtFavorites(readSet(key));
  worshipLtFavoritesCacheKey = key;
  worshipLtFavoritesCache = stored;
  return new Set(worshipLtFavoritesCache);
}

function refreshObsFavoritesCache(): Set<string> {
  const key = scopedLocalStorageKey(OBS_FAVS_KEY);
  const stored = readSet(key);
  obsFavoritesCacheKey = key;
  obsFavoritesCache = stored;
  return new Set(obsFavoritesCache);
}

function refreshTickerFavoritesCache(): Set<string> {
  const key = scopedLocalStorageKey(TICKER_FAVS_KEY);
  const stored = readSet(key);
  tickerFavoritesCacheKey = key;
  tickerFavoritesCache = stored;
  return new Set(tickerFavoritesCache);
}

function refreshAllFavoriteCaches(): void {
  refreshBibleFavoritesCache();
  refreshWorshipLtFavoritesCache();
  refreshObsFavoritesCache();
  refreshTickerFavoritesCache();
}

function currentHydrationScopeToken(): string {
  return getNativeDockSettingsScope();
}

function emitFavoritesUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FAVORITE_THEMES_UPDATED_EVENT));
  void import("./dockBridge")
    .then(({ dockBridge }) => dockBridge.sendFavoriteThemesUpdated())
    .catch(() => { });
}

function setBibleFavoritesCache(next: Set<string>, emit = true): void {
  bibleFavoritesCacheKey = scopedLocalStorageKey(BIBLE_FAVS_KEY);
  bibleFavoritesCache = new Set(next);
  writeSet(bibleFavoritesCacheKey, bibleFavoritesCache);
  if (emit) emitFavoritesUpdated();
}

function setWorshipLtFavoritesCache(next: Set<string>, emit = true): void {
  worshipLtFavoritesCacheKey = scopedLocalStorageKey(WORSHIP_LT_FAVS_KEY);
  worshipLtFavoritesCache = normalizeLtFavorites(next);
  writeSet(worshipLtFavoritesCacheKey, worshipLtFavoritesCache);
  if (emit) emitFavoritesUpdated();
}

function setObsFavoritesCache(next: Set<string>, emit = true): void {
  obsFavoritesCacheKey = scopedLocalStorageKey(OBS_FAVS_KEY);
  obsFavoritesCache = new Set(next);
  writeSet(obsFavoritesCacheKey, obsFavoritesCache);
  if (emit) emitFavoritesUpdated();
}

function setTickerFavoritesCache(next: Set<string>, emit = true): void {
  tickerFavoritesCacheKey = scopedLocalStorageKey(TICKER_FAVS_KEY);
  tickerFavoritesCache = new Set(next);
  writeSet(tickerFavoritesCacheKey, tickerFavoritesCache);
  if (emit) emitFavoritesUpdated();
}

function ensureHydrationStarted(): void {
  if (hydrationPromise && hydrationScopeToken === currentHydrationScopeToken()) return;
  hydrationPromise = hydrateFavoriteThemes().catch(() => { });
}

export async function hydrateFavoriteThemes(): Promise<void> {
  const scopeToken = currentHydrationScopeToken();
  if (hydrationPromise && hydrationScopeToken === scopeToken) return hydrationPromise;

  hydrationScopeToken = scopeToken;
  hydrationPromise = (async () => {
    await hydrateNativeDockSettings().catch(() => undefined);
    refreshAllFavoriteCaches();

    const mergedBible = new Set(bibleFavoritesCache);
    const mergedLt = normalizeLtFavorites(worshipLtFavoritesCache);
    const mergedObs = new Set(obsFavoritesCache);
    const mergedTicker = new Set(tickerFavoritesCache);

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
  const favorites = refreshBibleFavoritesCache();
  if (favorites.size > 0) {
    syncBibleFavoritesToDock(favorites).catch(() => { });
    syncFavoriteBibleThemesToDock(favorites).catch(() => { });
  }
  return favorites;
}

export function toggleBibleFavorite(themeId: string): Set<string> {
  const set = refreshBibleFavoritesCache();
  if (set.has(themeId)) {
    set.delete(themeId);
  } else {
    set.add(themeId);
  }
  setBibleFavoritesCache(set);
  syncBibleFavoritesToDock(set).catch(() => { });
  syncFavoriteBibleThemesToDock(set).catch(() => { });
  return new Set(set);
}

export function addBibleFavorite(themeId: string): Set<string> {
  const set = refreshBibleFavoritesCache();
  if (!set.has(themeId)) {
    set.add(themeId);
    setBibleFavoritesCache(set);
    syncBibleFavoritesToDock(set).catch(() => { });
    syncFavoriteBibleThemesToDock(set).catch(() => { });
  }
  return new Set(set);
}

export function isBibleFavorite(themeId: string): boolean {
  ensureHydrationStarted();
  return refreshBibleFavoritesCache().has(themeId);
}

// ---------------------------------------------------------------------------
// Worship lower-third themes
// ---------------------------------------------------------------------------

export function getWorshipLTFavorites(): Set<string> {
  ensureHydrationStarted();
  const normalized = refreshWorshipLtFavoritesCache();
  if (normalized.size > 0) {
    syncLTFavoritesToDock(normalized).catch(() => { });
  }
  return normalized;
}

export function toggleWorshipLTFavorite(themeId: string): Set<string> {
  const canonicalThemeId = canonicalizeLowerThirdThemeId(themeId);
  const set = refreshWorshipLtFavoritesCache();
  if (set.has(canonicalThemeId)) {
    set.delete(canonicalThemeId);
  } else {
    set.add(canonicalThemeId);
  }
  setWorshipLtFavoritesCache(set);
  // Fire-and-forget sync to dock JSON file so the dock (different origin) can read it
  syncLTFavoritesToDock(set).catch(() => { });

  return new Set(set);
}

export function isWorshipLTFavorite(themeId: string): boolean {
  ensureHydrationStarted();
  return refreshWorshipLtFavoritesCache().has(canonicalizeLowerThirdThemeId(themeId));
}

// ---------------------------------------------------------------------------
// OBS lower-third themes (from all_themes.json)
// ---------------------------------------------------------------------------

export function getObsFavorites(): Set<string> {
  ensureHydrationStarted();
  const favorites = refreshObsFavoritesCache();
  if (favorites.size > 0) {
    syncObsFavoritesToDock(favorites).catch(() => { });
  }
  return favorites;
}

export function toggleObsFavorite(themeId: string): Set<string> {
  const set = refreshObsFavoritesCache();
  if (set.has(themeId)) {
    set.delete(themeId);
  } else {
    set.add(themeId);
  }
  setObsFavoritesCache(set);
  syncObsFavoritesToDock(set).catch(() => { });
  return new Set(set);
}

export function setObsFavorite(themeId: string, added: boolean): Set<string> {
  const set = refreshObsFavoritesCache();
  const hadTheme = set.has(themeId);
  if (added) {
    set.add(themeId);
  } else {
    set.delete(themeId);
  }
  if (set.has(themeId) !== hadTheme) {
    setObsFavoritesCache(set);
    syncObsFavoritesToDock(set).catch(() => { });
  }
  return new Set(set);
}

export function isObsFavorite(themeId: string): boolean {
  ensureHydrationStarted();
  return refreshObsFavoritesCache().has(themeId);
}

// ---------------------------------------------------------------------------
// Ticker favorites
// ---------------------------------------------------------------------------

export function getTickerFavorites(): Set<string> {
  ensureHydrationStarted();
  return refreshTickerFavoritesCache();
}

export function toggleTickerFavorite(tickerId: string): Set<string> {
  const set = refreshTickerFavoritesCache();
  if (set.has(tickerId)) {
    set.delete(tickerId);
  } else {
    set.add(tickerId);
  }
  setTickerFavoritesCache(set);
  syncTickerFavoritesToDock(set).catch(() => { });
  return new Set(set);
}

export function setTickerFavorite(tickerId: string, added: boolean): Set<string> {
  const set = refreshTickerFavoritesCache();
  const hadTicker = set.has(tickerId);
  if (added) {
    set.add(tickerId);
  } else {
    set.delete(tickerId);
  }
  if (set.has(tickerId) !== hadTicker) {
    setTickerFavoritesCache(set);
    syncTickerFavoritesToDock(set).catch(() => { });
  }
  return new Set(set);
}

export function isTickerFavorite(tickerId: string): boolean {
  ensureHydrationStarted();
  return refreshTickerFavoritesCache().has(tickerId);
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
