/**
 * favoriteThemes.ts — Shared favorite-theme persistence
 *
 * Stores two sets of favorite theme IDs in localStorage:
 *   - "ocs-fav-bible-themes"   → Bible overlay themes (BibleTheme ids)
 *   - "ocs-fav-worship-themes" → Worship lower-third themes (LowerThirdTheme ids)
 *
 * Both Bible fullscreen and worship fullscreen share the same Bible theme pool,
 * so they share one favorites list.
 */

import { canonicalizeLowerThirdThemeId } from "../lowerthirds/themes";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const BIBLE_FAVS_KEY = "ocs-fav-bible-themes";
const WORSHIP_LT_FAVS_KEY = "ocs-fav-worship-lt-themes";

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

function writeSet(key: string, set: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...set]));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Bible themes (fullscreen overlays — shared by Bible & Worship fullscreen)
// ---------------------------------------------------------------------------

export function getBibleFavorites(): Set<string> {
  return readSet(BIBLE_FAVS_KEY);
}

export function toggleBibleFavorite(themeId: string): Set<string> {
  const set = readSet(BIBLE_FAVS_KEY);
  if (set.has(themeId)) {
    set.delete(themeId);
  } else {
    set.add(themeId);
  }
  writeSet(BIBLE_FAVS_KEY, set);
  return set;
}

export function isBibleFavorite(themeId: string): boolean {
  return readSet(BIBLE_FAVS_KEY).has(themeId);
}

// ---------------------------------------------------------------------------
// Worship lower-third themes
// ---------------------------------------------------------------------------

export function getWorshipLTFavorites(): Set<string> {
  const raw = readSet(WORSHIP_LT_FAVS_KEY);
  const normalized = new Set<string>();
  for (const themeId of raw) {
    normalized.add(canonicalizeLowerThirdThemeId(themeId));
  }
  if (!setsEqual(raw, normalized)) {
    writeSet(WORSHIP_LT_FAVS_KEY, normalized);
  }
  return normalized;
}

export function toggleWorshipLTFavorite(themeId: string): Set<string> {
  const canonicalThemeId = canonicalizeLowerThirdThemeId(themeId);
  const set = getWorshipLTFavorites();
  if (set.has(canonicalThemeId)) {
    set.delete(canonicalThemeId);
  } else {
    set.add(canonicalThemeId);
  }
  writeSet(WORSHIP_LT_FAVS_KEY, set);

  // Fire-and-forget sync to dock JSON file so the dock (different origin) can read it
  syncLTFavoritesToDock(set).catch(() => {});

  return set;
}

export function isWorshipLTFavorite(themeId: string): boolean {
  return getWorshipLTFavorites().has(canonicalizeLowerThirdThemeId(themeId));
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
