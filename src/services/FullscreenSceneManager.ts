/**
 * FullscreenSceneManager.ts — Centralized scene manager for fullscreen presentation content.
 *
 * Architecture (updated):
 * All fullscreen modules now use the single "MCE Presentation" scene.
 * The fullscreen browser sources are added to MCE Presentation alongside
 * the overlay sources. When fullscreen is active, only the fullscreen
 * source is visible; when overlay is active, only the overlay source is visible.
 *
 * This file now delegates to PresentationSceneManager for scene management.
 * It only handles fullscreen-specific content updates and scene switching.
 */

import { obsService } from "./obsService";
import {
  PRESENTATION_SCENE_NAME,
  presentationSceneManager,
  FULLSCREEN_SOURCE_NAMES,
} from "./PresentationSceneManager";

// ---------------------------------------------------------------------------
// Scene definitions (updated: all use MCE Presentation)
// ---------------------------------------------------------------------------

export interface FullscreenSceneDef {
  /** Unique key used internally (e.g. "bible", "worship", "countdown") */
  key: string;
  /** OBS scene name — always MCE Presentation */
  sceneName: string;
  /** OBS browser source name inside MCE Presentation */
  browserSourceName: string;
  /** Overlay HTML file (e.g. "bible-overlay-fullscreen.html") */
  overlayFile: string;
}

export const FULLSCREEN_SCENES: Record<string, FullscreenSceneDef> = {
  bible: {
    key: "bible",
    sceneName: PRESENTATION_SCENE_NAME,
    browserSourceName: FULLSCREEN_SOURCE_NAMES.BIBLE,
    overlayFile: "bible-overlay-fullscreen.html",
  },
  worship: {
    key: "worship",
    sceneName: PRESENTATION_SCENE_NAME,
    browserSourceName: FULLSCREEN_SOURCE_NAMES.WORSHIP,
    overlayFile: "bible-overlay-fullscreen.html",
  },
  countdown: {
    key: "countdown",
    sceneName: PRESENTATION_SCENE_NAME,
    browserSourceName: FULLSCREEN_SOURCE_NAMES.COUNTDOWN,
    overlayFile: "pre-service-countdown.html",
  },
  welcome: {
    key: "welcome",
    sceneName: PRESENTATION_SCENE_NAME,
    browserSourceName: FULLSCREEN_SOURCE_NAMES.COUNTDOWN, // reuse countdown source for welcome
    overlayFile: "bible-overlay-fullscreen.html",
  },
  sermon: {
    key: "sermon",
    sceneName: PRESENTATION_SCENE_NAME,
    browserSourceName: FULLSCREEN_SOURCE_NAMES.BIBLE, // reuse bible source for sermon
    overlayFile: "bible-overlay-fullscreen.html",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOverlayDataCss(
  packet: Record<string, unknown>,
  customCss = ""
): string {
  const encodedPacket = encodeURIComponent(JSON.stringify(packet));
  const overlayCss = `:root { --overlay-data: "${encodedPacket}"; }`;
  return customCss ? `${overlayCss}\n${customCss}` : overlayCss;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

class FullscreenSceneManager {
  /**
   * Ensure a fullscreen scene exists with its browser source.
   * Now delegates to PresentationSceneManager for scene/source management.
   * Returns the scene name and browser source item ID.
   */
  async ensureScene(def: FullscreenSceneDef): Promise<{
    sceneName: string;
    sceneUuid: string;
    browserItemId: number;
  }> {
    this._assertConnected();

    // Ensure the presentation scene exists (this creates all sources)
    await presentationSceneManager.ensurePresentationScene();

    // Get the browser source item ID from PresentationSceneManager
    const sourceInfo = (presentationSceneManager as any)._state?.sources?.get(def.browserSourceName);
    const sceneUuid = (presentationSceneManager as any)._state?.sceneUuid ?? "";

    if (!sourceInfo) {
      throw new Error(`Fullscreen source not found: ${def.browserSourceName}`);
    }

    return {
      sceneName: PRESENTATION_SCENE_NAME,
      sceneUuid,
      browserItemId: sourceInfo.sceneItemId,
    };
  }

  /**
   * Show a fullscreen scene in OBS.
   *
   * Studio Mode ON  → sets as Preview Scene
   * Studio Mode OFF → switches to Program Scene
   *
   * This does NOT trigger a transition to Program — the OBS operator
   * handles that manually in Studio Mode.
   */
  async showScene(def: FullscreenSceneDef): Promise<void> {
    await this.ensureScene(def);

    const studioMode = await obsService.getStudioModeEnabled();

    if (studioMode) {
      await obsService.setCurrentPreviewScene(def.sceneName);
    } else {
      await obsService.setCurrentProgramScene(def.sceneName);
    }
  }

  /**
   * Update the browser source content inside a fullscreen scene
   * without switching scenes. Used for verse-by-verse updates.
   */
  async updateContent(
    def: FullscreenSceneDef,
    packet: Record<string, unknown>,
    customCss?: string
  ): Promise<void> {
    await this.ensureScene(def);

    const overlayCss = buildOverlayDataCss(packet, customCss || "");

    await obsService.call("SetInputSettings", {
      inputName: def.browserSourceName,
      inputSettings: { css: overlayCss },
    });
  }

  /**
   * Clear/hide a fullscreen scene by transitioning away from it.
   * Does NOT destroy the scene — it persists for reuse.
   *
   * If the scene is currently active (preview or program),
   * switches back to the previous scene or the first available scene.
   */
  async hideScene(_def: FullscreenSceneDef): Promise<void> {
    const studioMode = await obsService.getStudioModeEnabled();
    const scenes = await obsService.getSceneList();

    // Find a non-MCE scene to switch to (backward-compat: also skip old VC scenes)
    const fallbackScene = scenes.find(
      (s) => !s.sceneName.startsWith("MCE ") && !s.sceneName.startsWith("MCE_") && !s.sceneName.startsWith("VC ") && !s.sceneName.startsWith("VC_")
    );

    if (!fallbackScene) return;

    if (studioMode) {
      await obsService.setCurrentPreviewScene(fallbackScene.sceneName);
    } else {
      await obsService.setCurrentProgramScene(fallbackScene.sceneName);
    }

  }

  /**
   * Check if a fullscreen scene is currently active in Preview or Program.
   */
  async isActive(def: FullscreenSceneDef): Promise<boolean> {
    try {
      const scenes = await obsService.getSceneList();
      const exists = scenes.some((s) => s.sceneName === def.sceneName);
      if (!exists) return false;

      const studioMode = await obsService.getStudioModeEnabled();

      if (studioMode) {
        const preview = await obsService.getCurrentPreviewScene();
        return preview === def.sceneName;
      } else {
        const program = await obsService.getCurrentProgramScene();
        return program === def.sceneName;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get the current active fullscreen scene key, or null.
   */
  async getActiveSceneKey(): Promise<string | null> {
    try {
      const studioMode = await obsService.getStudioModeEnabled();
      let currentScene: string;

      if (studioMode) {
        currentScene = await obsService.getCurrentPreviewScene();
      } else {
        currentScene = await obsService.getCurrentProgramScene();
      }

      for (const [key, def] of Object.entries(FULLSCREEN_SCENES)) {
        if (def.sceneName === currentScene) {
          return key;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private _assertConnected(): void {
    if (!obsService.isConnected) {
      throw new Error("OBS is not connected");
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const fullscreenSceneManager = new FullscreenSceneManager();
