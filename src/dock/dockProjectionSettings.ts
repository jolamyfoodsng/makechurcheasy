import { getUserScopedKey } from "../services/userScopedStorage";

export interface ProjectionSettings {
  sceneMode: "auto-duplicate" | "no-clone";
  tickerLayerPriority: "ticker-above" | "content-above";
  restoreOriginalScene: boolean;
  presentationOnly: boolean;
  /** Hide other sources created by MCE when a presentation source is sent. */
  presentationSourceVisibility: "active-only" | "keep-visible";
  /** Decide whether lower thirds may leave the first MCE source visible. */
  lowerThirdSourceVisibility: "keep-first" | "active-only";
}

const PROJECTION_SETTINGS_KEY = "ocs-dock-projection-settings";
const PROJECTION_SETTINGS_VERSION = 3;

const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
  sceneMode: "no-clone",
  tickerLayerPriority: "content-above",
  restoreOriginalScene: false,
  presentationOnly: false,
  presentationSourceVisibility: "active-only",
  lowerThirdSourceVisibility: "keep-first",
};

type StoredProjectionSettings = Partial<ProjectionSettings> & {
  programBackgroundOptIn?: boolean;
  settingsVersion?: number;
};

function normalizeSceneMode(value: unknown, stored?: StoredProjectionSettings): ProjectionSettings["sceneMode"] {
  if (value === "no-clone") return "no-clone";
  if (value === "reference") return "auto-duplicate";
  if (value === "auto-duplicate") {
    if (stored?.programBackgroundOptIn === true || Number(stored?.settingsVersion) >= 2) {
      return "auto-duplicate";
    }
    return DEFAULT_PROJECTION_SETTINGS.sceneMode;
  }
  return DEFAULT_PROJECTION_SETTINGS.sceneMode;
}

export function loadProjectionSettings(): ProjectionSettings {
  try {
    const raw = localStorage.getItem(getUserScopedKey(PROJECTION_SETTINGS_KEY));
    if (!raw) return { ...DEFAULT_PROJECTION_SETTINGS };
    const parsed = JSON.parse(raw) as StoredProjectionSettings;
    return {
      sceneMode: normalizeSceneMode(parsed.sceneMode, parsed),
      tickerLayerPriority: parsed.tickerLayerPriority === "ticker-above"
        ? "ticker-above"
        : DEFAULT_PROJECTION_SETTINGS.tickerLayerPriority,
      restoreOriginalScene: parsed.restoreOriginalScene === true,
      presentationOnly: parsed.presentationOnly === true,
      presentationSourceVisibility: parsed.presentationSourceVisibility === "keep-visible"
        ? "keep-visible"
        : DEFAULT_PROJECTION_SETTINGS.presentationSourceVisibility,
      lowerThirdSourceVisibility: parsed.lowerThirdSourceVisibility === "active-only"
        ? "active-only"
        : DEFAULT_PROJECTION_SETTINGS.lowerThirdSourceVisibility,
    };
  } catch {
    return { ...DEFAULT_PROJECTION_SETTINGS };
  }
}

export function saveProjectionSettings(next: ProjectionSettings): void {
  try {
    localStorage.setItem(getUserScopedKey(PROJECTION_SETTINGS_KEY), JSON.stringify({
      ...next,
      settingsVersion: PROJECTION_SETTINGS_VERSION,
      programBackgroundOptIn: next.sceneMode === "auto-duplicate",
    }));
  } catch {
    // ignore OBS CEF storage failures
  }
}
