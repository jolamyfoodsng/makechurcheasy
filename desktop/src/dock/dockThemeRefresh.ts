/**
 * Keeps the Dock in step with theme edits made in the app.
 *
 * A theme keeps its id when it is edited, and the Dock used to match the selected theme
 * by id only, so a bold / colour / background change never reached it. When the app tells
 * the Dock its themes changed, DockPage loads the fresh list and announces it here; each
 * tab swaps in the new copy of the theme it has selected (when the content really changed).
 */
import type { BibleTheme } from "../bible/types";
import { themeSupportsBibleOverlayMode } from "../bible/themeVariantSupport";

export const DOCK_THEMES_REFRESHED_EVENT = "dock:themes-refreshed";

export interface DockThemesRefreshedDetail {
  themes: BibleTheme[];
}

type OverlayMode = "fullscreen" | "lower-third";

/** Small stable hash of everything that changes how a theme looks. */
export function themeContentSignature(theme: BibleTheme | null | undefined): string {
  if (!theme) return "";
  let json = "";
  try {
    json = JSON.stringify({
      n: theme.name,
      t: theme.templateType,
      s: theme.settings,
      v: theme.variants,
      r: theme.rawTemplate,
      u: (theme as { updatedAt?: unknown }).updatedAt ?? null,
    });
  } catch {
    return `${theme.id}:unhashable:${Date.now()}`;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${json.length}:${(h >>> 0).toString(16)}`;
}

/** The fresh copy of `current` when the same theme was edited (same id, different content). */
export function findRefreshedTheme(
  current: BibleTheme | null | undefined,
  fresh: ReadonlyArray<BibleTheme>,
  mode: OverlayMode,
): BibleTheme | null {
  if (!current) return null;
  const candidate = fresh.find((theme) => theme.id === current.id && themeSupportsBibleOverlayMode(theme, mode));
  if (!candidate) return null;
  return themeContentSignature(candidate) === themeContentSignature(current) ? null : candidate;
}

/** True for ready-made / editor-built layer themes: their look lives in a layout, not in quick settings. */
export function themeUsesLayout(theme: BibleTheme | null | undefined, mode: OverlayMode): boolean {
  if (!theme) return false;
  const variant = mode === "lower-third" ? theme.variants?.lowerThird : theme.variants?.fullscreen;
  const layout = variant?.settings?.layout ?? theme.settings?.layout;
  return Boolean(layout && layout.format === mode);
}

export function announceDockThemesRefreshed(themes: BibleTheme[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DockThemesRefreshedDetail>(DOCK_THEMES_REFRESHED_EVENT, { detail: { themes } }));
}
