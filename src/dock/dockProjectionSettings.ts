import { getUserScopedKey } from "../services/userScopedStorage";

export interface ProjectionSettings {
  sceneMode: "auto-duplicate" | "reference" | "no-clone";
  tickerLayerPriority: "ticker-above" | "content-above";
  restoreOriginalScene: boolean;
  presentationOnly: boolean;
  hideOtherMceSourcesOnSend: boolean;
}

const PROJECTION_SETTINGS_KEY = "ocs-dock-projection-settings";

const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
  sceneMode: "auto-duplicate",
  tickerLayerPriority: "content-above",
  restoreOriginalScene: false,
  presentationOnly: false,
  hideOtherMceSourcesOnSend: false,
};

export function loadProjectionSettings(): ProjectionSettings {
  try {
    const raw = localStorage.getItem(getUserScopedKey(PROJECTION_SETTINGS_KEY));
    if (!raw) return { ...DEFAULT_PROJECTION_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ProjectionSettings>;
    return { ...DEFAULT_PROJECTION_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_PROJECTION_SETTINGS };
  }
}

export function saveProjectionSettings(next: ProjectionSettings): void {
  try {
    localStorage.setItem(getUserScopedKey(PROJECTION_SETTINGS_KEY), JSON.stringify(next));
  } catch {
    // ignore OBS CEF storage failures
  }
}
