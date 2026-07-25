export const DOCK_COUNTDOWN_SOURCE_NAME = "MCE Countdown";
export const DOCK_COUNTDOWN_BG_SOURCE_NAME = "MCE Countdown BG";
export const DOCK_COUNTDOWN_DEDICATED_SCENE_NAME = "MCE Countdown Scene";
export const DOCK_PRESENTATION_SCENE_NAME = "MCE Presentation";

export function resolveCountdownTargetScene(sceneName?: string | null): string {
  const trimmed = sceneName?.trim() ?? "";
  if (!trimmed) {
    return DOCK_PRESENTATION_SCENE_NAME;
  }

  if (trimmed === DOCK_COUNTDOWN_SOURCE_NAME) {
    return DOCK_COUNTDOWN_DEDICATED_SCENE_NAME;
  }

  return trimmed;
}
