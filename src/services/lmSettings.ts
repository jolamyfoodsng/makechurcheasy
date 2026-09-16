import { readNativeDockSetting, writeNativeDockSetting } from "./localDockSettings";
import { getSettings } from "../multiview/mvStore";
export type LmOverlayMode = "fullscreen" | "lower-third";
const LM_DOCK_SETTINGS_KEY = "ocs-lm-dock-settings";

export interface LmDockSettings {
  autoNavigate: boolean;
  translation: string;
  overlayMode: LmOverlayMode;
  autoScroll: boolean;
  autoPushQueue: boolean;
  autoPushSuggestions: boolean;
  autoPushDedupWindow: number;
  pushScene: "ai" | "main";
  suggestionLifetime: number;
}

export const DEFAULT_LM_SETTINGS: LmDockSettings = {
  autoNavigate: false,
  translation: "KJV",
  overlayMode: "fullscreen",
  autoScroll: true,
  autoPushQueue: true,
  autoPushSuggestions: false,
  autoPushDedupWindow: 15,
  pushScene: "ai",
  suggestionLifetime: 20,
};

export function normalizeLmOverlayMode(value: unknown, fallback: LmOverlayMode = "fullscreen"): LmOverlayMode {
  return value === "fullscreen" || value === "lower-third" ? value : fallback;
}

export function loadLmSettings(): LmDockSettings {
  const globalDefaults = getSettings();
  const fallbackOverlayMode = normalizeLmOverlayMode(globalDefaults.defaultBibleOverlayMode);
  try {
    const raw = readNativeDockSetting<unknown>(LM_DOCK_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_LM_SETTINGS, overlayMode: fallbackOverlayMode };
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const merged = { ...DEFAULT_LM_SETTINGS, ...parsed };
    const autoPushDedupWindow = Number(merged.autoPushDedupWindow);
    const suggestionLifetime = Number(merged.suggestionLifetime);
    return {
      ...merged,
      translation: typeof merged.translation === "string" && merged.translation.trim() ? merged.translation.trim().toUpperCase() : "KJV",
      pushScene: merged.pushScene === "main" ? "main" : "ai",
      overlayMode: normalizeLmOverlayMode(merged.overlayMode, fallbackOverlayMode),
      autoPushQueue: merged.autoPushQueue === true,
      autoPushSuggestions: merged.autoPushSuggestions === true,
      autoPushDedupWindow: Number.isFinite(autoPushDedupWindow)
        ? Math.max(0, autoPushDedupWindow)
        : DEFAULT_LM_SETTINGS.autoPushDedupWindow,
      suggestionLifetime: Number.isFinite(suggestionLifetime)
        ? Math.max(5, Math.min(120, suggestionLifetime))
        : DEFAULT_LM_SETTINGS.suggestionLifetime,
    };
  } catch {
    return { ...DEFAULT_LM_SETTINGS, overlayMode: fallbackOverlayMode };
  }
}

export function saveLmSettings(settings: LmDockSettings): void {
  writeNativeDockSetting(LM_DOCK_SETTINGS_KEY, settings);
}
