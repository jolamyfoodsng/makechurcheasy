import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";
import type { BibleTheme } from "../bible/types";
import { themeSupportsBibleOverlayMode } from "../bible/themeVariantSupport";
import type { DockFullscreenQuickThemeSettings } from "./components/DockFullscreenThemeQuickSettings";
import { loadDockFavoriteBibleThemes } from "./dockThemeData";
import { getUserScopedKey } from "../services/userScopedStorage";

export type DockNotesOverlayMode = "fullscreen" | "lower-third";

export interface DockNote {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
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

export function appendTextToDockNotes(text: string, title?: string): { note: DockNote; notes: DockNote[] } | null {
  const cleanText = text.trim();
  if (!cleanText) return null;

  const noteTitle = title ?? new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const notes = loadDockNotes();
  const now = Date.now();
  const existingIndex = notes.findIndex((note) => note.title === noteTitle);

  if (existingIndex >= 0) {
    const existing = notes[existingIndex];
    const note: DockNote = {
      ...existing,
      content: existing.content ? `${existing.content}\n\n${cleanText}` : cleanText,
      updatedAt: now,
    };
    const next = [...notes];
    next[existingIndex] = note;
    saveDockNotes(next);
    return { note, notes: next };
  }

  const note: DockNote = {
    id: createId("note"),
    title: noteTitle,
    content: cleanText,
    updatedAt: now,
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
    const fallbackTheme = getFallbackDockNotesTheme(overlayMode, preferredThemeId);
    return {
      overlayMode,
      theme: fallbackTheme,
      themeId: preferredThemeId ?? fallbackTheme.id,
      themeSettings: quickSettings as unknown as Record<string, unknown>,
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
