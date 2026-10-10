import type { BibleTheme } from "../bible/types";
import type { SavedBroadcastGraphic } from "../services/broadcastGraphicsStorage";
import type { LowerThirdTheme } from "../lowerthirds/types";
import type { TickerTheme } from "../data/tickerThemes";
import { getBibleFavorites, getWorshipLTFavorites, getObsFavorites, getTickerFavorites, hydrateFavoriteThemes } from "../services/favoriteThemes";
import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";
import { BIBLE_BUILTIN_THEMES } from "../bible/bibleThemes";

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
  if (local.size > 0) return local;
  const remote = await loadJsonArray<string>("/uploads/dock-bible-favorites.json");
  return mergeIdSets(local, remote);
}

export async function loadDockLTFavorites(): Promise<Set<string>> {
  await hydrateFavoriteThemes().catch(() => { });
  const localWorship = getWorshipLTFavorites();
  const localObs = getObsFavorites();
  const local = mergeIdSets(localWorship, localObs);
  if (local.size > 0) return local;
  const remoteLt = await loadJsonArray<string>("/uploads/dock-lt-favorites.json");
  const remoteObs = await loadJsonObjectArray("/uploads/dock-obs-favorites.json", "favoriteThemes");
  const merged = mergeIdSets(remoteLt, remoteObs);
  return merged;
}

export async function loadDockTickerFavorites(): Promise<Set<string>> {
  await hydrateFavoriteThemes().catch(() => { });
  const local = getTickerFavorites();
  if (local.size > 0) return local;
  const remote = await loadJsonObjectArray("/uploads/dock-ticker-favorites.json", "favoriteTickers");
  return mergeIdSets(local, remote);
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
  const allBuiltins = [
    ...BUILTIN_THEMES,
    ...BIBLE_BUILTIN_THEMES.filter((bt) => !BUILTIN_THEMES.some((t) => t.id === bt.id)),
  ];
  const builtinIds = new Set(allBuiltins.map((theme) => theme.id));
  const uniqueCustom = customThemes.filter((theme) => !builtinIds.has(theme.id));
  // Built-in themes: only show if favorited. Custom themes: always show.
  const favoritedBuiltins = allBuiltins.filter((theme) => allFavoriteIds.has(theme.id));
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

/**
 * Saved Broadcast Graphics marked "added to OBS". Same origin as the app → read its
 * storage directly; inside OBS → read the file the app writes on every save.
 */
export async function loadDockSavedGraphics(): Promise<Array<SavedBroadcastGraphic & { theme?: LowerThirdTheme }>> {
  try {
    const { loadSavedBroadcastGraphics, savedGraphicsForDock } = await import("../services/broadcastGraphicsStorage");
    if (loadSavedBroadcastGraphics().some((g) => g.isAddedToObs)) {
      // Same filtering as the Dock file: paused / hidden / other-plan graphics are left out.
      return await savedGraphicsForDock();
    }
  } catch {
    // Fall back to the dock JSON file below.
  }
  const remote = await loadJsonArray<SavedBroadcastGraphic & { theme?: LowerThirdTheme }>("/uploads/dock-saved-graphics.json");
  return remote.filter((g) => g && typeof g.id === "string" && typeof g.templateId === "string" && g.isAddedToObs !== false);
}

/**
 * Admin control of Broadcast Graphics for the Dock: graphics that are paused, hidden or not
 * on this user's plan (`blocked`) and the admin-published graphics (`packageThemes`).
 * Same origin as the app → read the app's downloaded catalog; inside OBS → read the file
 * the app writes whenever the catalog changes. With neither, nothing is blocked.
 */
export interface DockGraphicsPolicy {
  blocked: Set<string>;
  packageThemes: LowerThirdTheme[];
  /** Admin-uploaded tickers ("mce-ticker@1"), already in the app's HTML ticker shape. */
  packageTickers: TickerTheme[];
}

export async function loadDockGraphicsPolicy(): Promise<DockGraphicsPolicy> {
  try {
    const catalog = await import("../services/broadcastGraphicsCatalog");
    const local = catalog.getBroadcastGraphicsCatalog();
    if (local) {
      return {
        blocked: new Set(catalog.getBlockedGraphicThemeIds(local)),
        packageThemes: catalog.getPackageThemes(local),
        packageTickers: catalog.getPackageTickers(local),
      };
    }
  } catch {
    // Fall back to the dock JSON file below.
  }
  try {
    const res = await fetch("/uploads/dock-broadcast-graphics.json", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { blocked?: unknown; packageThemes?: unknown; packageTickers?: unknown };
      const blocked = Array.isArray(data.blocked) ? data.blocked.filter((id): id is string => typeof id === "string") : [];
      const packageThemes = Array.isArray(data.packageThemes)
        ? (data.packageThemes as LowerThirdTheme[]).filter((t) => t && typeof t.id === "string" && typeof t.html === "string")
        : [];
      const packageTickers = Array.isArray(data.packageTickers)
        ? (data.packageTickers as TickerTheme[]).filter((t) => t && typeof t.id === "string" && typeof t.html === "string")
        : [];
      return { blocked: new Set(blocked), packageThemes, packageTickers };
    }
  } catch {
    // No policy yet.
  }
  return { blocked: new Set(), packageThemes: [], packageTickers: [] };
}
