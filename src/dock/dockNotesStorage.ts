import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";
import { DEFAULT_THEME_SETTINGS, type BibleTheme } from "../bible/types";
import { themeSupportsBibleOverlayMode } from "../bible/themeVariantSupport";
import type { DockFullscreenQuickThemeSettings } from "./components/DockFullscreenThemeQuickSettings";
import { normalizeCompareThemeSettings } from "./compareThemeConfig";
import { loadDockFavoriteBibleThemes } from "./dockThemeData";
import { getUserScopedKey } from "../services/userScopedStorage";

export type DockNotesOverlayMode = "fullscreen" | "lower-third";

export interface DockNote {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  sourceId?: string;
}

export interface DockNotesPreferences {
  overlayMode?: DockNotesOverlayMode;
  fullscreenThemeId?: string;
  lowerThirdThemeId?: string;
  fullscreenQuickSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickSettings?: DockFullscreenQuickThemeSettings | null;
  updatedAt?: string;
}

export interface DockNotesPresentationSettings {
  overlayMode: DockNotesOverlayMode;
  theme: BibleTheme;
  themeId: string;
  themeSettings: Record<string, unknown> | null;
}

export const DOCK_NOTES_KEY = "ocs-dock-notes-v1";
export const DOCK_NOTES_PREFS_KEY = "ocs-dock-notes-preferences";
export const DOCK_NOTES_UPDATED_EVENT = "mce-dock-notes-updated";
export const DOCK_NOTES_BROADCAST_CHANNEL = "mce-dock-notes-storage";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isDockNotesOverlayMode(value: unknown): value is DockNotesOverlayMode {
  return value === "fullscreen" || value === "lower-third";
}

function notifyDockNotesUpdated(notes: DockNote[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOCK_NOTES_UPDATED_EVENT, { detail: { notes } }));
  try {
    const bc = new BroadcastChannel(DOCK_NOTES_BROADCAST_CHANNEL);
    bc.postMessage({ type: "notes-updated", notes });
    bc.close();
  } catch {
    // BroadcastChannel is not available in every embedded browser context.
  }
}

function formatSavedNoteTitle(now: number, text: string): string {
  const firstLine = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  const preview = firstLine
    ? firstLine.replace(/\s+/g, " ").slice(0, 44)
    : "Saved note";
  const time = new Date(now).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${preview} · ${time}`;
}

function backgroundTypeFromQuickSettings(
  quickSettings: DockFullscreenQuickThemeSettings,
): NonNullable<DockFullscreenQuickThemeSettings["backgroundType"]> {
  if (quickSettings.backgroundType) return quickSettings.backgroundType;
  if (quickSettings.backgroundVideo) return "video";
  if (quickSettings.backgroundImage) return "image";
  if (quickSettings.backgroundPattern) return "pattern";
  if (quickSettings.backgroundColor && quickSettings.backgroundColor !== "transparent") return "color";
  return "theme";
}

function applyQuickSettingsToNotesTheme(
  theme: BibleTheme,
  quickSettings: DockFullscreenQuickThemeSettings | null | undefined,
): BibleTheme {
  if (!quickSettings) return theme;

  const bgType = backgroundTypeFromQuickSettings(quickSettings);
  const useThemeBg = bgType === "theme";
  const useNoBg = bgType === "off";
  const useColorBg = bgType === "color";
  const useCustomBg = bgType !== "theme" && bgType !== "off";
  const effectiveShadeOpacity =
    useCustomBg && quickSettings.fullscreenShadeOpacity >= 1
      ? 0.42
      : quickSettings.fullscreenShadeOpacity;
  const compareSettings = normalizeCompareThemeSettings(quickSettings as Record<string, unknown>);

  return {
    ...theme,
    settings: {
      ...theme.settings,
      fontSize: quickSettings.fontSize ?? theme.settings.fontSize,
      fontFamily: quickSettings.fontFamily ?? theme.settings.fontFamily,
      refFontSize: quickSettings.refFontSize ?? theme.settings.refFontSize,
      refFontWeight: quickSettings.refFontWeight ?? theme.settings.refFontWeight,
      fontColor: quickSettings.fontColor ?? theme.settings.fontColor,
      refFontColor: quickSettings.refFontColor ?? theme.settings.refFontColor,
      fullscreenShadeColor: quickSettings.fullscreenShadeColor ?? theme.settings.fullscreenShadeColor,
      fullscreenShadeOpacity: effectiveShadeOpacity ?? theme.settings.fullscreenShadeOpacity,
      fullscreenShadeEnabled: (effectiveShadeOpacity ?? theme.settings.fullscreenShadeOpacity) > 0,
      textAlign: quickSettings.textAlign ?? theme.settings.textAlign,
      lineHeight: quickSettings.lineHeight ?? theme.settings.lineHeight,
      fontWeight: quickSettings.fontWeight ?? theme.settings.fontWeight,
      fontStyle: quickSettings.fontStyle ?? theme.settings.fontStyle,
      textTransform: quickSettings.textTransform ?? theme.settings.textTransform,
      textShadow: quickSettings.textShadow ?? theme.settings.textShadow,
      animation: quickSettings.animation ?? theme.settings.animation,
      animationDuration: quickSettings.animationDuration ?? theme.settings.animationDuration,
      backgroundPattern: useNoBg
        ? ""
        : useThemeBg
          ? (theme.settings.backgroundPattern ?? "")
          : (quickSettings.backgroundPattern ?? ""),
      backgroundImage: useNoBg
        ? ""
        : useThemeBg
          ? (theme.settings.backgroundImage ?? "")
          : (quickSettings.backgroundImage ?? ""),
      backgroundImageFilePath: useNoBg
        ? ""
        : useThemeBg
          ? (theme.settings.backgroundImageFilePath ?? "")
          : (quickSettings.backgroundImageFilePath ?? ""),
      backgroundVideo: useNoBg
        ? ""
        : useThemeBg
          ? (theme.settings.backgroundVideo ?? "")
          : (quickSettings.backgroundVideo ?? ""),
      backgroundVideoFilePath: useNoBg
        ? ""
        : useThemeBg
          ? (theme.settings.backgroundVideoFilePath ?? "")
          : (quickSettings.backgroundVideoFilePath ?? ""),
      backgroundOpacity: useNoBg
        ? 0
        : useThemeBg
          ? (theme.settings.backgroundOpacity ?? 1)
          : (quickSettings.backgroundOpacity ?? 1),
      backgroundColor: useNoBg
        ? "transparent"
        : useThemeBg
          ? (theme.settings.backgroundColor || DEFAULT_THEME_SETTINGS.backgroundColor)
          : useColorBg
            ? (quickSettings.backgroundColor || DEFAULT_THEME_SETTINGS.backgroundColor)
            : (quickSettings.backgroundColor || "transparent"),
      backgroundColorEnd: useNoBg
        ? "transparent"
        : useThemeBg
          ? (theme.settings.backgroundColorEnd || "")
          : useColorBg
            ? (quickSettings.backgroundColorEnd || "")
            : (quickSettings.backgroundColorEnd || ""),
      bgGradientAngle: useThemeBg
        ? (theme.settings.bgGradientAngle ?? DEFAULT_THEME_SETTINGS.bgGradientAngle)
        : (quickSettings.bgGradientAngle ?? DEFAULT_THEME_SETTINGS.bgGradientAngle),
      boxBackground: useNoBg ? "transparent" : (theme.settings.boxBackground || DEFAULT_THEME_SETTINGS.boxBackground),
      referenceBackgroundEnabled: quickSettings.referenceBackgroundEnabled ?? theme.settings.referenceBackgroundEnabled,
      referenceBackgroundColor: quickSettings.referenceBackgroundColor ?? theme.settings.referenceBackgroundColor,
      referenceBackgroundStyle: quickSettings.referenceBackgroundStyle ?? theme.settings.referenceBackgroundStyle,
      referenceBackgroundRadius: quickSettings.referenceBackgroundRadius ?? theme.settings.referenceBackgroundRadius,
      refPosition: quickSettings.refPosition ?? theme.settings.refPosition,
      refTextTransform: quickSettings.refTextTransform ?? theme.settings.refTextTransform,
      refLetterSpacing: quickSettings.refLetterSpacing ?? theme.settings.refLetterSpacing,
      refOpacity: quickSettings.refOpacity ?? theme.settings.refOpacity,
      refTextAlign: quickSettings.refTextAlign ?? theme.settings.refTextAlign,
      refSpacing: quickSettings.refSpacing ?? theme.settings.refSpacing,
      lowerThirdPosition: quickSettings.lowerThirdPosition ?? theme.settings.lowerThirdPosition,
      lowerThirdSize: quickSettings.lowerThirdSize ?? theme.settings.lowerThirdSize,
      lowerThirdWidthPreset: quickSettings.lowerThirdWidthPreset ?? theme.settings.lowerThirdWidthPreset,
      lowerThirdOffsetX: quickSettings.lowerThirdOffsetX ?? theme.settings.lowerThirdOffsetX,
      lowerThirdCaptionPosition: quickSettings.lowerThirdCaptionPosition ?? theme.settings.lowerThirdCaptionPosition,
      lowerThirdEdge: quickSettings.lowerThirdEdge ?? theme.settings.lowerThirdEdge,
      lowerThirdCardPadding: quickSettings.lowerThirdCardPadding ?? theme.settings.lowerThirdCardPadding,
      lowerThirdPaddingLinked: quickSettings.lowerThirdPaddingLinked ?? theme.settings.lowerThirdPaddingLinked,
      lowerThirdCardRadius: quickSettings.lowerThirdCardRadius ?? theme.settings.lowerThirdCardRadius,
      lowerThirdTextDirection: quickSettings.lowerThirdTextDirection ?? theme.settings.lowerThirdTextDirection,
      ...compareSettings,
    },
  };
}

export function loadDockNotes(): DockNote[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(getUserScopedKey(DOCK_NOTES_KEY));
  const parsed = safeJsonParse<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed as DockNote[] : [];
}

export function saveDockNotes(items: DockNote[], notify = true): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getUserScopedKey(DOCK_NOTES_KEY), JSON.stringify(items));
    if (notify) notifyDockNotesUpdated(items);
  } catch {
    // Ignore storage failures inside OBS/browser dock contexts.
  }
}

export function appendTextToDockNotes(
  text: string,
  title?: string,
  options: { sourceId?: string } = {},
): { note: DockNote; notes: DockNote[] } | null {
  const cleanText = text.trim();
  if (!cleanText) return null;

  const notes = loadDockNotes();
  const now = Date.now();
  const sourceId = options.sourceId?.trim();
  if (sourceId) {
    const existingSourceNote = notes.find((note) => note.sourceId === sourceId);
    if (existingSourceNote) return { note: existingSourceNote, notes };
  }

  const noteTitle = title ?? formatSavedNoteTitle(now, cleanText);
  const existingIndex = notes.findIndex((note) => note.title === noteTitle);

  if (existingIndex >= 0) {
    const existing = notes[existingIndex];
    const note: DockNote = {
      ...existing,
      sourceId: existing.sourceId ?? sourceId,
      content: existing.content ? `${existing.content}\n\n${cleanText}` : cleanText,
      updatedAt: now,
    };
    const next = [note, ...notes.filter((_, index) => index !== existingIndex)];
    saveDockNotes(next);
    return { note, notes: next };
  }

  const note: DockNote = {
    id: createId("note"),
    title: noteTitle,
    content: cleanText,
    updatedAt: now,
    ...(sourceId ? { sourceId } : {}),
  };
  const next = [note, ...notes];
  saveDockNotes(next);
  return { note, notes: next };
}

export function loadDockNotesPreferences(): DockNotesPreferences {
  if (typeof localStorage === "undefined") return {};
  const raw = localStorage.getItem(getUserScopedKey(DOCK_NOTES_PREFS_KEY));
  const parsed = safeJsonParse<unknown>(raw, {});
  return parsed && typeof parsed === "object" ? parsed as DockNotesPreferences : {};
}

export function saveDockNotesPreferences(prefs: DockNotesPreferences): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getUserScopedKey(DOCK_NOTES_PREFS_KEY), JSON.stringify({
      ...prefs,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Ignore storage failures inside OBS/browser dock contexts.
  }
}

export function readDockNotesOverlayMode(fallback: DockNotesOverlayMode = "fullscreen"): DockNotesOverlayMode {
  const mode = loadDockNotesPreferences().overlayMode;
  return isDockNotesOverlayMode(mode) ? mode : fallback;
}

export function getDockNotesThemeForMode(theme: BibleTheme, overlayMode: DockNotesOverlayMode): BibleTheme {
  const variant = overlayMode === "lower-third"
    ? theme.variants?.lowerThird
    : theme.variants?.fullscreen;
  return variant
    ? { ...theme, settings: variant.settings, rawTemplate: variant.rawTemplate }
    : theme;
}

export function getFallbackDockNotesTheme(
  overlayMode: DockNotesOverlayMode,
  preferredThemeId?: string,
): BibleTheme {
  const preferred = BUILTIN_THEMES.find(
    (theme) => theme.id === preferredThemeId && themeSupportsBibleOverlayMode(theme, overlayMode),
  );
  if (preferred) return preferred;

  return BUILTIN_THEMES.find((theme) => themeSupportsBibleOverlayMode(theme, overlayMode))
    ?? BUILTIN_THEMES[0];
}

export async function resolveDockNotesTheme(
  overlayMode: DockNotesOverlayMode,
  prefs: DockNotesPreferences = loadDockNotesPreferences(),
): Promise<BibleTheme> {
  const preferredThemeId = overlayMode === "fullscreen"
    ? prefs.fullscreenThemeId
    : prefs.lowerThirdThemeId;

  try {
    const allFavorites = await loadDockFavoriteBibleThemes();
    const stored = allFavorites.find(
      (theme) => theme.id === preferredThemeId && themeSupportsBibleOverlayMode(theme, overlayMode),
    );
    if (stored) return stored;
  } catch {
    // Fall through to built-in fallback.
  }

  return getFallbackDockNotesTheme(overlayMode, preferredThemeId);
}

export async function resolveDockNotesPresentationSettings(
  fallbackOverlayMode: DockNotesOverlayMode = "fullscreen",
  options: { forceOverlayMode?: boolean } = {},
): Promise<DockNotesPresentationSettings> {
  const prefs = loadDockNotesPreferences();
  const overlayMode = options.forceOverlayMode || !isDockNotesOverlayMode(prefs.overlayMode)
    ? fallbackOverlayMode
    : prefs.overlayMode;
  const preferredThemeId = overlayMode === "fullscreen"
    ? prefs.fullscreenThemeId
    : prefs.lowerThirdThemeId;
  const quickSettings = overlayMode === "fullscreen"
    ? prefs.fullscreenQuickSettings
    : prefs.lowerThirdQuickSettings;

  if (quickSettings) {
    const resolvedTheme = await resolveDockNotesTheme(overlayMode, prefs);
    const baseTheme = getDockNotesThemeForMode(resolvedTheme, overlayMode);
    const theme = applyQuickSettingsToNotesTheme(baseTheme, quickSettings);
    return {
      overlayMode,
      theme,
      themeId: preferredThemeId ?? theme.id,
      themeSettings: theme.settings as unknown as Record<string, unknown>,
    };
  }

  const theme = await resolveDockNotesTheme(overlayMode, prefs);
  const effectiveTheme = getDockNotesThemeForMode(theme, overlayMode);
  const themeSettings = effectiveTheme.settings ?? null;

  return {
    overlayMode,
    theme: effectiveTheme,
    themeId: effectiveTheme.id,
    themeSettings: themeSettings as unknown as Record<string, unknown> | null,
  };
}
