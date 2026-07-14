import { getUserScopedKey } from "../services/userScopedStorage";

export interface ProjectionSettings {
  sceneMode: "auto-duplicate" | "reference" | "no-clone";
  tickerLayerPriority: "ticker-above" | "content-above";
  restoreOriginalScene: boolean;
  presentationOnly: boolean;
}

export const PROJECTION_SETTINGS_KEY = "ocs-dock-projection-settings";
export const DOCK_PROJECTION_SETTINGS_UPDATED_EVENT = "dock:projection-settings-updated";

export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
  sceneMode: "auto-duplicate",
  tickerLayerPriority: "ticker-above",
  restoreOriginalScene: false,
  presentationOnly: true,
};

export function normalizeProjectionSettings(
  value: Partial<ProjectionSettings> | null | undefined,
): ProjectionSettings {
  const sceneMode = value?.sceneMode;

  return {
    sceneMode:
      sceneMode === "reference" || sceneMode === "no-clone" || sceneMode === "auto-duplicate"
        ? sceneMode
        : DEFAULT_PROJECTION_SETTINGS.sceneMode,
    tickerLayerPriority: DEFAULT_PROJECTION_SETTINGS.tickerLayerPriority,
    restoreOriginalScene: value?.restoreOriginalScene === true,
    // Lower thirds are always routed through the presentation scene.
    presentationOnly: true,
  };
}

export function loadProjectionSettings(): ProjectionSettings {
  try {
    const raw = localStorage.getItem(getUserScopedKey(PROJECTION_SETTINGS_KEY));
    if (!raw) return { ...DEFAULT_PROJECTION_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ProjectionSettings>;
    return normalizeProjectionSettings(parsed);
  } catch {
    return { ...DEFAULT_PROJECTION_SETTINGS };
  }
}

export function saveProjectionSettings(next: ProjectionSettings): ProjectionSettings {
  const normalized = normalizeProjectionSettings(next);
  try {
    localStorage.setItem(getUserScopedKey(PROJECTION_SETTINGS_KEY), JSON.stringify(normalized));
  } catch {
    // ignore OBS CEF storage failures
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<ProjectionSettings>(DOCK_PROJECTION_SETTINGS_UPDATED_EVENT, {
        detail: normalized,
      }),
    );
  }

  return normalized;
}
