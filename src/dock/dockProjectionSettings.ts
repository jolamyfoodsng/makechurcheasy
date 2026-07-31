import { getUserScopedKey } from "../services/userScopedStorage";

export interface ProjectionSettings {
  sceneMode: "auto-duplicate" | "no-clone";
  tickerLayerPriority: "ticker-above" | "content-above";
  restoreOriginalScene: boolean;
  presentationOnly: boolean;
  hideOtherMceSourcesOnSend: boolean;
}

const PROJECTION_SETTINGS_KEY = "ocs-dock-projection-settings";
const PROJECTION_SETTINGS_VERSION = 2;

const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
  sceneMode: "no-clone",
  tickerLayerPriority: "content-above",
  restoreOriginalScene: false,
  presentationOnly: false,
  hideOtherMceSourcesOnSend: false,
};

type StoredProjectionSettings = Partial<ProjectionSettings> & {
  programBackgroundOptIn?: boolean;
  settingsVersion?: number;
};

function normalizeSceneMode(value: unknown, stored?: StoredProjectionSettings): ProjectionSettings["sceneMode"] {
  if (value === "no-clone") return "no-clone";
  if (value === "reference") return "auto-duplicate";
  if (value === "auto-duplicate") {
    if (stored?.programBackgroundOptIn === true || Number(stored?.settingsVersion) >= PROJECTION_SETTINGS_VERSION) {
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
      ...DEFAULT_PROJECTION_SETTINGS,
      ...parsed,
      sceneMode: normalizeSceneMode(parsed.sceneMode, parsed),
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
