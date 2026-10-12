/**
 * dockThemeAvailability.ts — which themes the Dock offers.
 *
 * Every theme on the Themes page (the user's own and the ready-made ones) is in
 * the Dock's Bible, Worship and Notes tabs by default. There is nothing to switch
 * on. The only choice is to HIDE a theme, and that choice is stored here as an
 * "opt-out". Other ready-made themes (the lower-third library) keep their own
 * rules: favourites + category.
 *
 * The opt-outs live in one small file the app writes next to the other Dock data
 * (`dock-theme-optout`). The Dock, a different origin inside OBS, reads it over
 * HTTP; the app reads it through the native command.
 */

import type { BibleTheme } from "../bible/types";

export type DockThemeArea = "bible" | "worship" | "notes";

export const DOCK_THEME_AREAS: readonly DockThemeArea[] = ["bible", "worship", "notes"];

/** themeId → the areas it is switched OFF for. A theme that is not listed is on everywhere. */
export type DockThemeOptOuts = Record<string, DockThemeArea[]>;

const OPTOUT_FILE = "dock-theme-optout";
const OPTOUT_URL = `/uploads/${OPTOUT_FILE}.json`;

/** Reads whatever was stored; anything unexpected is ignored rather than thrown. */
export function parseDockThemeOptOuts(raw: unknown): DockThemeOptOuts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: DockThemeOptOuts = {};
  for (const [themeId, areas] of Object.entries(raw as Record<string, unknown>)) {
    if (!themeId || !Array.isArray(areas)) continue;
    const valid = DOCK_THEME_AREAS.filter((area) => areas.includes(area));
    if (valid.length > 0) result[themeId] = valid;
  }
  return result;
}

export function isThemeOptedOut(
  optOuts: DockThemeOptOuts,
  themeId: string,
  area: DockThemeArea,
): boolean {
  return optOuts[themeId]?.includes(area) ?? false;
}

/** Returns a copy of `optOuts` with one theme switched on or off for one area. */
export function withThemeAreaVisible(
  optOuts: DockThemeOptOuts,
  themeId: string,
  area: DockThemeArea,
  visible: boolean,
): DockThemeOptOuts {
  const current = new Set(optOuts[themeId] ?? []);
  if (visible) current.delete(area);
  else current.add(area);
  const next: DockThemeOptOuts = { ...optOuts };
  const areas = DOCK_THEME_AREAS.filter((candidate) => current.has(candidate));
  if (areas.length > 0) next[themeId] = areas;
  else delete next[themeId];
  return next;
}

/** True when the theme is switched off in every Dock area, i.e. hidden from the Dock. */
export function isThemeHiddenFromDock(optOuts: DockThemeOptOuts, themeId: string): boolean {
  return DOCK_THEME_AREAS.every((area) => isThemeOptedOut(optOuts, themeId, area));
}

/** Returns a copy of `optOuts` with one theme hidden from, or shown again in, the whole Dock. */
export function withThemeHidden(
  optOuts: DockThemeOptOuts,
  themeId: string,
  hidden: boolean,
): DockThemeOptOuts {
  let next = optOuts;
  for (const area of DOCK_THEME_AREAS) {
    next = withThemeAreaVisible(next, themeId, area, !hidden);
  }
  return next;
}

/** Which Dock area a Background picker belongs to (its storage scope). */
export function dockAreaFromScope(scope: string | undefined): DockThemeArea | null {
  return scope === "bible" || scope === "worship" || scope === "notes" ? scope : null;
}

function themeCategories(theme: BibleTheme): string[] {
  const categories = theme.categories?.length ? theme.categories : theme.category ? [theme.category] : [];
  return categories.map((category) => category.toLowerCase());
}

export interface DockThemeFilterOptions {
  /** Where the picker is. `null` (an unknown picker) applies no opt-outs. */
  area: DockThemeArea | null;
  /** The category rule the picker already had; it applies to themes that are not on the Themes page. */
  allowedCategories?: ReadonlyArray<string>;
  optOuts: DockThemeOptOuts;
  /** Ready-made themes listed on the Themes page: offered like the user's own, whatever their category. */
  alwaysShownIds?: ReadonlySet<string>;
}

/**
 * Should this theme be offered in the picker?
 *
 * - The user's own themes (`source: "custom"`) and the ready-made themes on the
 *   Themes page always are, unless hidden for this area. Their category is
 *   ignored: it used to default to "Bible only", which hid every new theme from
 *   Worship and Notes.
 * - Any other theme (a lower-third library template someone favourited) still
 *   follows the picker's categories.
 */
export function isThemeAvailableInDockArea(theme: BibleTheme, options: DockThemeFilterOptions): boolean {
  if (theme.source === "custom" || options.alwaysShownIds?.has(theme.id)) {
    return !(options.area && isThemeOptedOut(options.optOuts, theme.id, options.area));
  }
  const allowed = new Set((options.allowedCategories ?? []).map((category) => category.toLowerCase()));
  if (allowed.size === 0) return true;
  return themeCategories(theme).some((category) => allowed.has(category));
}

export function filterThemesForDockArea(themes: BibleTheme[], options: DockThemeFilterOptions): BibleTheme[] {
  return themes.filter((theme) => isThemeAvailableInDockArea(theme, options));
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function canUseNativeDockData(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Always reads the current value (no cache), so a Dock that reloads sees the latest. */
export async function loadDockThemeOptOuts(): Promise<DockThemeOptOuts> {
  try {
    if (canUseNativeDockData()) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("load_dock_data", { name: OPTOUT_FILE });
      return raw ? parseDockThemeOptOuts(JSON.parse(raw)) : {};
    }
    const response = await fetch(OPTOUT_URL, { cache: "no-store" });
    if (!response.ok) return {};
    return parseDockThemeOptOuts(await response.json());
  } catch {
    return {};
  }
}

let writeQueue: Promise<unknown> = Promise.resolve();

/** Read the stored opt-outs, change them, save them and tell open Docks. Writes run one at a time. */
function updateOptOuts(change: (current: DockThemeOptOuts) => DockThemeOptOuts): Promise<DockThemeOptOuts> {
  const run = async (): Promise<DockThemeOptOuts> => {
    const current = await loadDockThemeOptOuts();
    // Only the app can write; the Dock in OBS is read-only here.
    if (!canUseNativeDockData()) return current;
    const next = change(current);
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_dock_data", { name: OPTOUT_FILE, data: JSON.stringify(next) });
    const { notifyDockThemesChanged } = await import("./favoriteThemes");
    notifyDockThemesChanged();
    return next;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  return result;
}

/** Hide one theme from the whole Dock (Bible, Worship and Notes), or bring it back. */
export function setThemeHiddenFromDock(themeId: string, hidden: boolean): Promise<DockThemeOptOuts> {
  return updateOptOuts((current) => withThemeHidden(current, themeId, hidden));
}

/** Switch one theme off or on for a single Dock area. */
export function setThemeDockAreaVisible(
  themeId: string,
  area: DockThemeArea,
  visible: boolean,
): Promise<DockThemeOptOuts> {
  return updateOptOuts((current) => withThemeAreaVisible(current, themeId, area, visible));
}
