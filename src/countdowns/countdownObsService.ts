/**
 * countdownObsService.ts — Push countdown overlays to OBS
 *
 * Follows the same pattern as liveToolObsService.ts:
 * - Creates browser source in target scene
 * - Supports both preview and program (live) targets
 * - Hides/shows sources as needed
 */

import { obsService } from "../services/obsService";
import { getOverlayBaseUrl } from "../services/overlayUrl";
import type { CountdownConfig, CountdownOverlayPayload } from "./types";

const COUNTDOWN_SOURCE = "MCE Countdown";
const PREVIEW_COUNTDOWN_SOURCE = "MCE Preview Countdown";

function getSourceName(live: boolean): string {
  return live ? COUNTDOWN_SOURCE : PREVIEW_COUNTDOWN_SOURCE;
}

async function getTargetScene(live: boolean): Promise<string> {
  if (live) {
    return obsService.getCurrentProgramScene();
  }

  try {
    const studioMode = await obsService.getStudioModeEnabled();
    if (!studioMode) {
      await obsService.setStudioModeEnabled(true);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    return await obsService.getCurrentPreviewScene();
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Could not prepare OBS Preview.");
  }
}

async function hideSource(sceneName: string, sourceName: string): Promise<void> {
  try {
    const items = await obsService.getSceneItemList(sceneName);
    const item = items.find((candidate) => candidate.sourceName === sourceName);
    if (!item) return;
    await obsService.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId: item.sceneItemId,
      sceneItemEnabled: false,
    });
  } catch {
    // Best-effort cleanup.
  }
}

async function ensureCountdownSource(
  sceneName: string,
  sourceName: string,
  url: string,
): Promise<void> {
  const inputs = await obsService.getInputList();
  const existingInput = inputs.find((input) => input.inputName === sourceName);

  const inputSettings = {
    url,
    width: 1920,
    height: 1080,
    css: "",
    shutdown: false,
    restart_when_active: false,
  };

  if (existingInput) {
    await obsService.setInputSettings(sourceName, inputSettings);
  }

  let sceneItems = await obsService.getSceneItemList(sceneName);
  let sceneItem = sceneItems.find((item) => item.sourceName === sourceName);

  if (!sceneItem) {
    if (existingInput) {
      const sceneItemId = await obsService.createSceneItem(sceneName, sourceName);
      sceneItem = { sourceName, sceneItemId, inputKind: "browser_source" };
    } else {
      const sceneItemId = await obsService.createInput(
        sceneName,
        sourceName,
        "browser_source",
        inputSettings,
      );
      sceneItem = { sourceName, sceneItemId, inputKind: "browser_source" };
    }
  }

  const video = await obsService.getVideoSettings();
  await obsService.setSceneItemTransform(sceneName, sceneItem.sceneItemId, {
    positionX: 0,
    positionY: 0,
    boundsType: "OBS_BOUNDS_STRETCH",
    boundsWidth: video.baseWidth,
    boundsHeight: video.baseHeight,
    boundsAlignment: 0,
  });

  // Move to top
  sceneItems = await obsService.getSceneItemList(sceneName);
  const topIndex = Math.max(0, sceneItems.length - 1);
  await obsService.setSceneItemIndex(sceneName, sceneItem.sceneItemId, topIndex);

  await obsService.call("SetSceneItemEnabled", {
    sceneName,
    sceneItemId: sceneItem.sceneItemId,
    sceneItemEnabled: true,
  });
}

/**
 * Send a countdown configuration to OBS as a browser source overlay.
 */
export async function sendCountdownToObs(
  config: CountdownConfig,
  live: boolean,
): Promise<void> {
  if (!obsService.isConnected) {
    throw new Error("OBS is not connected.");
  }

  const sourceName = getSourceName(live);
  const sceneName = await getTargetScene(live);
  if (!sceneName) throw new Error("Could not determine OBS target scene.");

  // Hide any existing countdown source first
  await hideSource(sceneName, sourceName);

  const baseUrl = await getOverlayBaseUrl();
  const payload: CountdownOverlayPayload = {
    config,
    baseUrl,
    timestamp: Date.now(),
  };

  const url = `${baseUrl}/countdown-overlay.html#data=${encodeURIComponent(JSON.stringify(payload))}`;
  await ensureCountdownSource(sceneName, sourceName, url);
}

/**
 * Hide the countdown overlay in OBS.
 */
export async function hideCountdownInObs(live: boolean): Promise<void> {
  if (!obsService.isConnected) return;
  const sourceName = getSourceName(live);
  try {
    const sceneName = await getTargetScene(live);
    if (!sceneName) return;
    await hideSource(sceneName, sourceName);
  } catch {
    // Best-effort.
  }
}

/**
 * Hide countdown in both preview and program scenes.
 */
export async function hideAllCountdowns(): Promise<void> {
  await hideCountdownInObs(false);
  await hideCountdownInObs(true);
}
