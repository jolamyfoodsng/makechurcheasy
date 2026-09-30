/**
 * dockWorshipThemeResolution.ts — Resolves active Worship themes and presentation settings
 * based on saved Dock Worship preferences, favorites, and quick settings.
 */

import type { BibleTheme } from "../bible/types";
import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";
import { themeSupportsBibleOverlayMode } from "../bible/themeVariantSupport";
import { readDockPreference } from "../services/dockPreferenceStorage";
import { loadDockFavoriteBibleThemes } from "./dockThemeData";
import type { DockFullscreenQuickThemeSettings } from "./components/DockFullscreenThemeQuickSettings";

export const DOCK_WORSHIP_PREFS_KEY = "ocs-dock-worship-preferences";

export interface DockWorshipPreferences {
  [key: string]: unknown;
  overlayMode?: "fullscreen" | "lower-third";
  fullscreenThemeId?: string;
  lowerThirdThemeId?: string;
  fullscreenQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  updatedAt?: string;
}

export interface DockWorshipPresentationSettings {
  overlayMode: "fullscreen" | "lower-third";
  theme: BibleTheme;
  themeId: string;
  themeSettings: Record<string, unknown> | null;
}

export function loadDockWorshipPreferences(): DockWorshipPreferences {
  return readDockPreference<DockWorshipPreferences>(DOCK_WORSHIP_PREFS_KEY) ?? {};
}

export function getFallbackDockWorshipTheme(
  overlayMode: "fullscreen" | "lower-third",
  preferredThemeId?: string,
): BibleTheme {
  const preferred = BUILTIN_THEMES.find(
    (theme) => theme.id === preferredThemeId && themeSupportsBibleOverlayMode(theme, overlayMode),
  );
  if (preferred) return preferred;

  return (
    BUILTIN_THEMES.find((theme) => themeSupportsBibleOverlayMode(theme, overlayMode)) ??
    BUILTIN_THEMES[0]
  );
}

export function getDockWorshipThemeForMode(
  theme: BibleTheme,
  overlayMode: "fullscreen" | "lower-third",
): BibleTheme {
  const variant =
    overlayMode === "lower-third"
      ? theme.variants?.lowerThird
      : theme.variants?.fullscreen;
  return variant
    ? { ...theme, settings: variant.settings, rawTemplate: variant.rawTemplate }
    : theme;
}

export function applyQuickThemeSettingsToWorship(
  theme: BibleTheme,
  quickSettings: DockFullscreenQuickThemeSettings | null,
): BibleTheme {
  if (!quickSettings) return theme;
  return {
    ...theme,
    settings: {
      ...theme.settings,
      fontSize: quickSettings.fontSize,
      autoFontScale: true,
      fontFamily: quickSettings.fontFamily,
      refFontSize: quickSettings.refFontSize,
      fontColor: quickSettings.fontColor,
      refFontColor: quickSettings.refFontColor,
      refPosition: quickSettings.refPosition,
      refAnchor: quickSettings.refAnchor ?? "normal",
      refTextTransform: quickSettings.refTextTransform,
      refLetterSpacing: quickSettings.refLetterSpacing,
      refOpacity: quickSettings.refOpacity,
      refTextAlign: quickSettings.refTextAlign,
      refSpacing: quickSettings.refSpacing,
      fullscreenShadeColor: quickSettings.fullscreenShadeColor,
      fullscreenShadeOpacity: quickSettings.fullscreenShadeOpacity,
      ...(quickSettings.backgroundColor ? { backgroundColor: quickSettings.backgroundColor } : {}),
      ...(quickSettings.backgroundPattern ? { backgroundPattern: quickSettings.backgroundPattern } : {}),
      ...(quickSettings.backgroundImage ? { backgroundImage: quickSettings.backgroundImage } : {}),
      ...(quickSettings.backgroundVideo ? { backgroundVideo: quickSettings.backgroundVideo } : {}),
    },
  };
}

export async function resolveDockWorshipPresentationSettings(
  fallbackOverlayMode: "fullscreen" | "lower-third" = "lower-third",
  options: { forceOverlayMode?: boolean } = {},
): Promise<DockWorshipPresentationSettings> {
  const prefs = loadDockWorshipPreferences();
  const overlayMode =
    options.forceOverlayMode ||
    (prefs.overlayMode !== "fullscreen" && prefs.overlayMode !== "lower-third")
      ? fallbackOverlayMode
      : prefs.overlayMode;
  const preferredThemeId =
    overlayMode === "fullscreen" ? prefs.fullscreenThemeId : prefs.lowerThirdThemeId;
  const quickSettings =
    overlayMode === "fullscreen"
      ? prefs.fullscreenQuickThemeSettings
      : prefs.lowerThirdQuickThemeSettings;

  let baseTheme: BibleTheme;
  try {
    const allFavorites = await loadDockFavoriteBibleThemes();
    const stored = allFavorites.find(
      (theme) => theme.id === preferredThemeId && themeSupportsBibleOverlayMode(theme, overlayMode),
    );
    baseTheme = stored ?? getFallbackDockWorshipTheme(overlayMode, preferredThemeId);
  } catch {
    baseTheme = getFallbackDockWorshipTheme(overlayMode, preferredThemeId);
  }

  const variantTheme = getDockWorshipThemeForMode(baseTheme, overlayMode);
  const theme = quickSettings
    ? applyQuickThemeSettingsToWorship(variantTheme, quickSettings)
    : variantTheme;

  return {
    overlayMode,
    theme,
    themeId: preferredThemeId ?? theme.id,
    themeSettings: theme.settings as unknown as Record<string, unknown>,
  };
}
