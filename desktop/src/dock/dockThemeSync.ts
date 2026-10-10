import type { BibleTheme } from "../bible/types";
import type { DockFullscreenQuickThemeSettings } from "./components/DockFullscreenThemeQuickSettings";
import type { DockBackgroundPreset } from "./dockConsoleTheme";
import { readDockPreference, saveDockPreference } from "../services/dockPreferenceStorage";
import { writeNativeDockSetting } from "../services/localDockSettings";
import { DOCK_BIBLE_PREFS_KEY } from "./dockBibleThemeResolution";
import { DOCK_WORSHIP_PREFS_KEY } from "./dockWorshipThemeResolution";
import { loadDockNotesPreferences, saveDockNotesPreferences, type DockNotesPreferences } from "./dockNotesStorage";

export const DOCK_THEME_SYNC_EVENT = "mce-dock-theme-synced";

export type DockThemeScope = "bible" | "worship" | "notes";
export type DockOverlayMode = "fullscreen" | "lower-third";

export interface DockThemeSyncPayload {
  sourceTab: DockThemeScope;
  sourceMode: DockOverlayMode;
  targetTabs: DockThemeScope[];
  targetModes: DockOverlayMode[];
  theme: BibleTheme | null;
  themeId: string | null;
  quickSettings: DockFullscreenQuickThemeSettings;
  backgroundPreset?: DockBackgroundPreset | null;
  timestamp: number;
}

/**
 * Synchronize theme and styling settings across Bible, Worship, and Notes tabs
 * and/or between Fullscreen and Lower-Third scenes.
 */
export async function syncThemeAcrossDock(payload: DockThemeSyncPayload): Promise<void> {
  const { targetTabs, targetModes, themeId, quickSettings, backgroundPreset } = payload;

  // 1. Sync Bible Preferences if targetTabs contains "bible"
  if (targetTabs.includes("bible")) {
    try {
      const currentBiblePrefs = readDockPreference<Record<string, unknown>>(DOCK_BIBLE_PREFS_KEY) ?? {};
      const nextBiblePrefs: Record<string, unknown> = { ...currentBiblePrefs };

      if (targetModes.includes("fullscreen")) {
        nextBiblePrefs.fullscreenQuickThemeSettings = quickSettings;
        if (themeId) nextBiblePrefs.fullscreenThemeId = themeId;
      }
      if (targetModes.includes("lower-third")) {
        nextBiblePrefs.lowerThirdQuickThemeSettings = quickSettings;
        if (themeId) nextBiblePrefs.lowerThirdThemeId = themeId;
      }
      if (backgroundPreset) {
        nextBiblePrefs.backgroundPreset = backgroundPreset;
      }
      await saveDockPreference(DOCK_BIBLE_PREFS_KEY, nextBiblePrefs);
    } catch (err) {
      console.warn("[dockThemeSync] Failed to sync Bible preferences:", err);
    }
  }

  // 2. Sync Worship Preferences if targetTabs contains "worship"
  if (targetTabs.includes("worship")) {
    try {
      const currentWorshipPrefs = readDockPreference<Record<string, unknown>>(DOCK_WORSHIP_PREFS_KEY) ?? {};
      const nextWorshipPrefs: Record<string, unknown> = {
        ...currentWorshipPrefs,
        updatedAt: new Date().toISOString(),
      };

      if (targetModes.includes("fullscreen")) {
        nextWorshipPrefs.fullscreenQuickThemeSettings = quickSettings;
        if (themeId) nextWorshipPrefs.fullscreenThemeId = themeId;
      }
      if (targetModes.includes("lower-third")) {
        nextWorshipPrefs.lowerThirdQuickThemeSettings = quickSettings;
        if (themeId) nextWorshipPrefs.lowerThirdThemeId = themeId;
      }
      if (backgroundPreset) {
        nextWorshipPrefs.backgroundPreset = backgroundPreset;
      }
      await saveDockPreference(DOCK_WORSHIP_PREFS_KEY, nextWorshipPrefs);
    } catch (err) {
      console.warn("[dockThemeSync] Failed to sync Worship preferences:", err);
    }
  }

  // 3. Sync Notes Preferences if targetTabs contains "notes"
  if (targetTabs.includes("notes")) {
    try {
      const currentNotesPrefs = loadDockNotesPreferences();
      const nextNotesPrefs: DockNotesPreferences = {
        ...currentNotesPrefs,
        updatedAt: new Date().toISOString(),
      };

      if (targetModes.includes("fullscreen")) {
        nextNotesPrefs.fullscreenQuickSettings = quickSettings;
        if (themeId) nextNotesPrefs.fullscreenThemeId = themeId;
      }
      if (targetModes.includes("lower-third")) {
        nextNotesPrefs.lowerThirdQuickSettings = quickSettings;
        if (themeId) nextNotesPrefs.lowerThirdThemeId = themeId;
      }
      saveDockNotesPreferences(nextNotesPrefs);
    } catch (err) {
      console.warn("[dockThemeSync] Failed to sync Notes preferences:", err);
    }
  }

  // 4. Sync BackgroundPickerCard settings for all targets
  const bgType = backgroundPreset ?? quickSettings.backgroundType ?? "color";
  for (const tab of targetTabs) {
    for (const mode of targetModes) {
      const scopeKey = `${tab}:${mode}`;
      try {
        void writeNativeDockSetting(`dtb-bg-picker-bg-type:${scopeKey}`, bgType);
      } catch {
        // ignore background storage sync error
      }
    }
  }

  // 5. Broadcast to all mounted tabs in this window
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DOCK_THEME_SYNC_EVENT, { detail: payload }));
  }
}
