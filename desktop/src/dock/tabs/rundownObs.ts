/**
 * rundownObs.ts — OBS helpers for pushing rundown timers to the Dock's
 * countdown browser sources (same sources/scenes the Countdown tab uses).
 */

import { dockObsClient } from "../dockObsClient";
import type { DockSceneRoute } from "../dockSceneRouting";
import {
  DOCK_COUNTDOWN_BG_SOURCE_NAME,
  DOCK_COUNTDOWN_SOURCE_NAME,
  DOCK_PRESENTATION_SCENE_NAME,
  resolveCountdownTargetScene,
} from "./dockCountdownScene";

export interface RundownObsTarget {
  sceneName: string;
  contentSourceName: string;
  backgroundSourceName: string;
}

export function resolveRundownTargets(sceneRoute: DockSceneRoute, designSceneName?: string): RundownObsTarget[] {
  const hasRoute = sceneRoute.enabled && sceneRoute.targets.length > 0;
  const fallback: RundownObsTarget = {
    sceneName: resolveCountdownTargetScene(hasRoute ? undefined : designSceneName),
    contentSourceName: DOCK_COUNTDOWN_SOURCE_NAME,
    backgroundSourceName: DOCK_COUNTDOWN_BG_SOURCE_NAME,
  };
  if (!hasRoute) return [fallback];

  const selected = sceneRoute.targets.map((target) => ({
    sceneName: target.sceneName,
    contentSourceName: dockObsClient.getSceneRouteSourceName("countdown", target.sceneName),
    backgroundSourceName: dockObsClient.getSceneRouteSourceName("countdown", target.sceneName, "Background"),
  }));
  return sceneRoute.syncPresentation ? [...selected, fallback] : selected;
}

type SceneItem = { sceneItemId: number; sourceName: string };

async function ensureScene(sceneName: string): Promise<void> {
  const scenes = (await dockObsClient.call("GetSceneList", {})) as { scenes: Array<{ sceneName: string }> };
  if (!scenes.scenes.some((s) => s.sceneName === sceneName)) {
    await dockObsClient.call("CreateScene", { sceneName });
  }
}

export async function ensureRundownSource(
  sourceName: string,
  url: string,
  sceneName: string,
  opts?: { setTransform?: boolean },
): Promise<void> {
  await ensureScene(sceneName);
  const inputSettings = { url, width: 1920, height: 1080, shutdown: false, restart_when_active: false };

  const inputs = (await dockObsClient.call("GetInputList", { inputKind: "browser_source" })) as { inputs: Array<{ inputName: string }> };
  const existing = inputs.inputs.find((i) => i.inputName === sourceName);
  if (existing) {
    await dockObsClient.call("SetInputSettings", { inputName: sourceName, inputSettings });
  } else {
    await dockObsClient.call("CreateInput", { sceneName, inputName: sourceName, inputKind: "browser_source", inputSettings });
  }

  const items = (await dockObsClient.call("GetSceneItemList", { sceneName })) as { sceneItems: SceneItem[] };
  let item = items.sceneItems.find((i) => i.sourceName === sourceName);
  if (!item && existing) {
    const added = (await dockObsClient.call("CreateSceneItem", { sceneName, sourceName, sceneItemEnabled: true })) as { sceneItemId: number };
    item = { sceneItemId: added.sceneItemId, sourceName };
  }
  if (!item) return;

  await dockObsClient.call("SetSceneItemEnabled", { sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: true });

  if (opts?.setTransform) {
    const vs = (await dockObsClient.call("GetVideoSettings", {})) as { baseWidth: number; baseHeight: number };
    await dockObsClient.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId: item.sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth: vs.baseWidth,
        boundsHeight: vs.baseHeight,
        boundsAlignment: 0,
      },
    });
  }

  await dockObsClient.ensureTickerAboveSource(sceneName, sourceName).catch(() => { });
}

export async function hideRundownSource(sourceName: string, sceneName: string): Promise<void> {
  const items = (await dockObsClient.call("GetSceneItemList", { sceneName })) as { sceneItems: SceneItem[] };
  const item = items.sceneItems.find((i) => i.sourceName === sourceName);
  if (item) {
    await dockObsClient.call("SetSceneItemEnabled", { sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: false });
  }
}

export function targetsIncludePresentationContent(targets: RundownObsTarget[]): boolean {
  return targets.some(
    (t) => t.sceneName === DOCK_PRESENTATION_SCENE_NAME && t.contentSourceName === DOCK_COUNTDOWN_SOURCE_NAME,
  );
}

export async function applyPresentationVisibility(): Promise<void> {
  await dockObsClient.applyMcePresentationSourceVisibility(DOCK_COUNTDOWN_SOURCE_NAME);
}
