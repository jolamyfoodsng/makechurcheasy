import type { BibleTheme } from "../bible/types";
import { getBibleFavorites, getWorshipLTFavorites, getObsFavorites, hydrateFavoriteThemes } from "../services/favoriteThemes";
import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";

function mergeIdSets(...sets: Array<Iterable<string>>): Set<string> {
  const merged = new Set<string>();
  for (const values of sets) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        merged.add(value);
      }
    }
  }
  return merged;
}

async function loadJsonArray<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

async function loadJsonObjectArray(url: string, key: string): Promise<string[]> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)[key])) {
      return (data as Record<string, string[]>)[key];
    }
    return [];
  } catch {
    return [];
  }
}

export async function loadDockBibleFavorites(): Promise<Set<string>> {
  await hydrateFavoriteThemes().catch(() => { });
  const local = getBibleFavorites();
  const remote = await loadJsonArray<string>("/uploads/dock-bible-favorites.json");
  return mergeIdSets(local, remote);
}

export async function loadDockLTFavorites(): Promise<Set<string>> {
  await hydrateFavoriteThemes().catch(() => { });
  const localWorship = getWorshipLTFavorites();
  const localObs = getObsFavorites();
  const remoteLt = await loadJsonArray<string>("/uploads/dock-lt-favorites.json");
  const remoteObs = await loadJsonObjectArray("/uploads/dock-obs-favorites.json", "favoriteThemes");
  const merged = mergeIdSets(localWorship, localObs, remoteLt, remoteObs);
  return merged;
}

export async function loadDockCustomBibleThemes(): Promise<BibleTheme[]> {
  try {
    const { getCustomThemes } = await import("../bible/bibleDb");
    const localThemes = await getCustomThemes();
    if (localThemes.length > 0) return localThemes;
  } catch {
    // Fall back to dock JSON data below.
  }

  return loadJsonArray<BibleTheme>("/uploads/dock-bible-themes.json");
}

export async function loadDockFavoriteBibleThemes(): Promise<BibleTheme[]> {
  const remoteFavorites = await loadJsonArray<BibleTheme>("/uploads/dock-bible-favorite-themes.json");
  // Load both fullscreen and lower-third favorites — themes are now unified
  const [fullscreenFavoriteIds, lowerThirdFavoriteIds] = await Promise.all([
    loadDockBibleFavorites(),
    loadDockLTFavorites(),
  ]);
  const allFavoriteIds = new Set([...fullscreenFavoriteIds, ...lowerThirdFavoriteIds]);
  const customThemes = await loadDockCustomBibleThemes();
  const builtinIds = new Set(BUILTIN_THEMES.map((theme) => theme.id));
  const uniqueCustom = customThemes.filter((theme) => !builtinIds.has(theme.id));
  // Built-in themes: only show if favorited. Custom themes: always show.
  const favoritedBuiltins = BUILTIN_THEMES.filter((theme) => allFavoriteIds.has(theme.id));
  const localThemes = [...favoritedBuiltins, ...uniqueCustom];
  const remoteById = new Map(remoteFavorites.map((theme) => [theme.id, theme]));
  const localById = new Map(localThemes.map((theme) => [theme.id, theme]));
  // Merge by ID — deduplicates so each theme appears once regardless of templateType
  const merged = new Map<string, BibleTheme>([...localById, ...remoteById]);
  const values = [...merged.values()];
  console.log("[loadDockFavoriteBibleThemes]", {
    favoriteIdsCount: allFavoriteIds.size,
    customThemesCount: customThemes.length,
    uniqueCustomCount: uniqueCustom.length,
    favoritedBuiltinsCount: favoritedBuiltins.length,
    remoteCount: remoteFavorites.length,
    mergedCount: values.length,
    themeNames: values.map((t) => t.name),
  });
  return values;
}
