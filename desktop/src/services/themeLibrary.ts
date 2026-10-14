/**
 * themeLibrary.ts — which ready-made themes a person has "added".
 *
 * A new account starts with just three ready-made themes (`NEW_USER_THEME_IDS`) on the Themes
 * page and in the Dock. The rest of the ready-made themes sit in a Theme Library and show up
 * once the person adds them. Accounts that were already in use when this arrived keep every
 * theme (`mode: "all"`), so nothing disappears after an update.
 *
 * The choice lives in one small file next to the other Dock data (`dock-theme-library`). The
 * app writes it; the Dock, a different origin inside OBS, reads it over HTTP. A missing file
 * means "everything", which is the behaviour from before the library existed.
 */

import { NEW_USER_THEME_IDS } from "../themes/layout/presetThemes";

export type ThemeLibraryMode = "all" | "curated";

export interface ThemeLibrary {
  /** `all`: every ready-made theme is in My Themes. `curated`: the defaults plus `added`. */
  mode: ThemeLibraryMode;
  /** Ready-made theme ids added from the library (curated mode only). */
  added: string[];
}

const LIBRARY_FILE = "dock-theme-library";
const LIBRARY_URL = `/uploads/${LIBRARY_FILE}.json`;
const ONBOARDING_KEY = "mce-onboarding-complete";

export const DEFAULT_THEME_LIBRARY: ThemeLibrary = { mode: "curated", added: [] };

/** Reads whatever was stored; anything unexpected gives `null` (treated as "everything"). */
export function parseThemeLibrary(raw: unknown): ThemeLibrary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.mode !== "all" && record.mode !== "curated") return null;
  const added = Array.isArray(record.added)
    ? record.added.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  return { mode: record.mode, added: [...new Set(added)] };
}

/** Is this ready-made theme in the person's My Themes? `null` (no file yet) means yes. */
export function isThemeInLibrary(library: ThemeLibrary | null, themeId: string): boolean {
  if (!library || library.mode === "all") return true;
  return NEW_USER_THEME_IDS.includes(themeId) || library.added.includes(themeId);
}

/** Ready-made theme ids that are NOT in My Themes (what the Dock must leave out). */
export function themeIdsOutsideLibrary(library: ThemeLibrary | null, readyMadeIds: Iterable<string>): Set<string> {
  const outside = new Set<string>();
  for (const id of readyMadeIds) {
    if (!isThemeInLibrary(library, id)) outside.add(id);
  }
  return outside;
}

export function withThemeAdded(library: ThemeLibrary, themeId: string): ThemeLibrary {
  if (library.mode === "all" || library.added.includes(themeId)) return library;
  return { ...library, added: [...library.added, themeId] };
}

/** The defaults cannot be removed (they are always there); everything else can go back. */
export function withThemeRemoved(library: ThemeLibrary, themeId: string): ThemeLibrary {
  if (library.mode === "all" || !library.added.includes(themeId)) return library;
  return { ...library, added: library.added.filter((id) => id !== themeId) };
}

/** First launch of a build that has the library: people who already finished onboarding keep everything. */
export function initialThemeLibrary(onboardingComplete: boolean): ThemeLibrary {
  return onboardingComplete ? { mode: "all", added: [] } : { ...DEFAULT_THEME_LIBRARY, added: [] };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function canUseNativeDockData(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Always reads the current value (no cache). `null` when nothing was written yet. */
export async function loadThemeLibrary(): Promise<ThemeLibrary | null> {
  try {
    if (canUseNativeDockData()) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("load_dock_data", { name: LIBRARY_FILE });
      return raw ? parseThemeLibrary(JSON.parse(raw)) : null;
    }
    const response = await fetch(LIBRARY_URL, { cache: "no-store" });
    if (!response.ok) return null;
    return parseThemeLibrary(await response.json());
  } catch {
    return null;
  }
}

async function saveThemeLibrary(library: ThemeLibrary): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_dock_data", { name: LIBRARY_FILE, data: JSON.stringify(library) });
  const { notifyDockThemesChanged } = await import("./favoriteThemes");
  notifyDockThemesChanged();
}

/**
 * Called when the app starts. Writes the library file the first time: a new account gets the
 * short list, an account that already finished onboarding keeps everything. Does nothing once
 * the file exists.
 */
export async function ensureThemeLibrary(): Promise<ThemeLibrary | null> {
  if (!canUseNativeDockData()) return loadThemeLibrary();
  const existing = await loadThemeLibrary();
  if (existing) return existing;
  let done = false;
  try {
    done = localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    done = false;
  }
  const created = initialThemeLibrary(done);
  await saveThemeLibrary(created);
  return created;
}

let writeQueue: Promise<unknown> = Promise.resolve();

function updateThemeLibrary(change: (current: ThemeLibrary) => ThemeLibrary): Promise<ThemeLibrary> {
  const run = async (): Promise<ThemeLibrary> => {
    const current = (await loadThemeLibrary()) ?? { mode: "all" as const, added: [] };
    if (!canUseNativeDockData()) return current;
    const next = change(current);
    if (next !== current) await saveThemeLibrary(next);
    return next;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  return result;
}

export function addThemeToLibrary(themeId: string): Promise<ThemeLibrary> {
  return updateThemeLibrary((current) => withThemeAdded(current, themeId));
}

export function removeThemeFromLibrary(themeId: string): Promise<ThemeLibrary> {
  return updateThemeLibrary((current) => withThemeRemoved(current, themeId));
}
