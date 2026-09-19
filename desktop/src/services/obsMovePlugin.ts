import { invoke } from "@tauri-apps/api/core";
import { obsService } from "./obsService";

export const MOVE_PLUGIN_VERSION = "3.2.1";
export const MCE_OBS_BRIDGE_VERSION = "1.0.0";
export const MOVE_TRANSITION_RELEASE_URL = `https://github.com/exeldro/obs-move-transition/releases/tag/${MOVE_PLUGIN_VERSION}`;

export interface ObsMovePluginStatus {
  installed: boolean;
  bundled: boolean;
  version: string | null;
  installPath: string | null;
  bridgeInstalled: boolean;
  bridgeBundled: boolean;
  bridgeVersion: string | null;
  bridgeInstallPath: string | null;
  platform: string;
  restartRequired: boolean;
  message: string;
}

export async function getObsMovePluginStatus(): Promise<ObsMovePluginStatus> {
  try {
    return await invoke<ObsMovePluginStatus>("get_obs_move_plugin_status");
  } catch {
    return {
      installed: false,
      bundled: false,
      version: null,
      installPath: null,
      bridgeInstalled: false,
      bridgeBundled: false,
      bridgeVersion: null,
      bridgeInstallPath: null,
      platform: "Browser",
      restartRequired: false,
      message: "Move Transition status is available in the desktop app.",
    };
  }
}

/**
 * The file can be installed while OBS is open, but OBS only exposes the
 * plugin's source kinds after the next OBS process starts.
 */
export async function isMovePluginLoaded(): Promise<boolean> {
  if (!obsService.isConnected) return false;

  try {
    const transitionResponse = await obsService.call("GetTransitionKindList", {});
    const transitionKinds = Array.isArray(transitionResponse?.transitionKinds)
      ? transitionResponse.transitionKinds.map((kind: unknown) => String(kind).toLowerCase())
      : [];
    if (transitionKinds.some((kind: string) => kind === "move_transition" || kind.includes("move-transition"))) {
      return true;
    }

    const filterResponse = await obsService.call("GetSourceFilterKindList", {});
    const filterKinds = Array.isArray(filterResponse?.sourceFilterKinds)
      ? filterResponse.sourceFilterKinds.map((kind: unknown) => String(kind).toLowerCase())
      : [];
    return filterKinds.some((kind: string) => kind.startsWith("move_") || kind.includes("move-transition"));
  } catch {
    return false;
  }
}

export async function isMceBridgeLoaded(): Promise<boolean> {
  if (!obsService.isConnected) return false;

  try {
    const response = await obsService.call("GetInputKindList", {});
    const inputKinds = Array.isArray(response?.inputKinds)
      ? response.inputKinds.map((kind: unknown) => String(kind).toLowerCase())
      : [];
    return inputKinds.includes("mce_move_bridge");
  } catch {
    return false;
  }
}

/**
 * Ask the native bridge to create a private Move Transition source and make it
 * the active OBS transition. The temporary bridge source is removed again by
 * the caller after OBS has run its source-create callback.
 */
export async function ensureMoveTransition(): Promise<boolean> {
  if (!obsService.isConnected || !(await isMceBridgeLoaded())) return false;

  const currentScene = await obsService.call("GetCurrentProgramScene", {}) as {
    currentProgramSceneName?: string;
    sceneName?: string;
  };
  const sceneName = (currentScene.currentProgramSceneName || currentScene.sceneName || "").trim();
  if (!sceneName) return false;

  const inputName = `MCE Move Bridge ${Date.now()}`;
  try {
    await obsService.call("CreateInput", {
      sceneName,
      inputName,
      inputKind: "mce_move_bridge",
      inputSettings: {
        transition_id: "move_transition",
        transition_name: "MCE Move Transition",
        duration_ms: 300,
      },
      sceneItemEnabled: false,
    });

    // CreateInput only succeeds when the bridge source callback successfully
    // created and selected Move Transition. The frontend transition getter is
    // intentionally not used as the success signal because OBS may apply the
    // frontend change through its queued UI connection.
    return true;
  } catch {
    return false;
  } finally {
    await obsService.call("RemoveInput", { inputName }).catch(() => undefined);
  }
}

export async function installObsMovePlugin(): Promise<ObsMovePluginStatus> {
  return invoke<ObsMovePluginStatus>("install_obs_move_plugin");
}
