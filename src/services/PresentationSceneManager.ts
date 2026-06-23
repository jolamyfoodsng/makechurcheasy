/**
 * PresentationSceneManager.ts — Centralized scene manager for the new single-scene architecture.
 *
 * Architecture:
 * - ONE main scene: "MCE Presentation"
 * - Program scene reference at the bottom of MCE Presentation (z-index 0)
 * - Multiple sources inside MCE Presentation:
 *   - MCE Bible (browser source)
 *   - MCE Worship (browser source)
 *   - MCE Media (browser source)
 *   - MCE Announcements (browser source)
 *   - MCE Lower Third (browser source)
 *   - Background sources for each module
 *
 * Only the active source should be visible at any time.
 * When Bible is presented: Bible = visible, others = hidden
 * When Worship is presented: Worship = visible, others = hidden
 * When Media is presented: Media = visible, others = hidden
 *
 * Preview/Program workflow:
 * - MCE Presentation is set as the Preview scene in OBS
 * - User switches Preview → Program when ready to go live
 */

import { obsService } from "./obsService";
import { getOverlayBaseUrlSync } from "./overlayUrl";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PRESENTATION_SCENE_NAME = "MCE Presentation";
/** Source name for the user's program scene reference at the bottom of MCE Presentation */
export const PROGRAM_SCENE_SOURCE_NAME = "MCE Program Scene Reference";

/** Source names for each module */
export const SOURCE_NAMES = {
  BIBLE: "MCE Bible",
  WORSHIP: "MCE Worship",
  MEDIA: "MCE Media",
  ANNOUNCEMENTS: "MCE Announcements",
  LOWER_THIRD: "MCE Lower Third",
} as const;

/** Background source names */
export const BG_SOURCE_NAMES = {
  BIBLE: "MCE Bible BG",
  WORSHIP: "MCE Worship BG",
  MEDIA: "MCE Media BG",
  ANNOUNCEMENTS: "MCE Announcements BG",
  LOWER_THIRD: "MCE Lower Third BG",
} as const;

/** Fullscreen source names */
export const FULLSCREEN_SOURCE_NAMES = {
  BIBLE: "MCE Browser - Bible",
  WORSHIP: "MCE Browser - Worship",
  COUNTDOWN: "MCE Browser - Countdown",
} as const;

/** Fullscreen background source names */
export const FULLSCREEN_BG_SOURCE_NAMES = {
  BIBLE: "MCE BG - Bible",
  WORSHIP: "MCE BG - Worship",
  COUNTDOWN: "MCE BG - Countdown",
} as const;

/** Source types */
export type SourceType = keyof typeof SOURCE_NAMES;

/** Module type for identifying which module to show/hide */
export type ModuleType = "bible" | "worship" | "media" | "announcements" | "lower-third" | "fullscreen-bible" | "fullscreen-worship" | "fullscreen-countdown";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface SourceInfo {
  sceneItemId: number;
  sceneUuid: string;
}

interface SceneState {
  sceneUuid: string | null;
  sources: Map<string, SourceInfo>;
  bgSources: Map<string, SourceInfo>;
}

const _state: SceneState = {
  sceneUuid: null,
  sources: new Map(),
  bgSources: new Map(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCanvasSize(): Promise<{ width: number; height: number }> {
  try {
    const video = await obsService.getVideoSettings();
    return {
      width: Number(video.baseWidth) || 1920,
      height: Number(video.baseHeight) || 1080,
    };
  } catch {
    return { width: 1920, height: 1080 };
  }
}

// ---------------------------------------------------------------------------
// PresentationSceneManager
// ---------------------------------------------------------------------------

class PresentationSceneManager {
  /**
   * Ensure the MCE Presentation scene exists with all required sources.
   * Creates the scene if it doesn't exist, and ensures all sources are present.
   */
  async ensurePresentationScene(): Promise<{ sceneName: string; sceneUuid: string }> {
    this._assertConnected();
    const canvas = await getCanvasSize();

    // ── 1. Ensure the presentation scene exists ──
    let sceneUuid = _state.sceneUuid;

    if (!sceneUuid) {
      const scenes = await obsService.getSceneList();
      const existing = scenes.find((s) => s.sceneName === PRESENTATION_SCENE_NAME);
      if (existing) {
        sceneUuid = existing.sceneUuid;
        _state.sceneUuid = sceneUuid;
      } else {
        await obsService.createScene(PRESENTATION_SCENE_NAME);
        const updated = await obsService.getSceneList();
        const created = updated.find((s) => s.sceneName === PRESENTATION_SCENE_NAME);
        if (created) {
          sceneUuid = created.sceneUuid;
          _state.sceneUuid = sceneUuid;
        }
      }
    }

    if (!sceneUuid) {
      throw new Error(`Failed to ensure scene: ${PRESENTATION_SCENE_NAME}`);
    }

    // ── 2. Ensure all required sources exist ──
    await this.ensureAllSources(PRESENTATION_SCENE_NAME, canvas);

    // ── 3. Ensure program scene reference at bottom ──
    await this.ensureProgramSceneReference();

    return { sceneName: PRESENTATION_SCENE_NAME, sceneUuid };
  }

  /**
   * Ensure the user's program scene is referenced as a scene source at the bottom of MCE Presentation.
   * This acts as a background layer so when all overlays are hidden, the user sees their program scene.
   */
  async ensureProgramSceneReference(): Promise<void> {
    this._assertConnected();
    const sceneName = PRESENTATION_SCENE_NAME;

    // Get the current program scene name from OBS
    let programSceneName: string;
    try {
      const resp = await obsService.call("GetCurrentProgramScene") as { currentProgramSceneName: string };
      programSceneName = resp.currentProgramSceneName;
    } catch {
      console.warn("[PresentationScene] Could not get current program scene");
      return;
    }

    // Don't add MCE Presentation as a reference to itself
    if (programSceneName === sceneName) {
      return;
    }

    try {
      const resp = await obsService.call("GetSceneItemList", { sceneName });
      const items = (resp as { sceneItems: Array<{ sourceName: string; sceneItemId: number }> }).sceneItems ?? [];

      // Check if the program scene reference already exists
      const existing = items.find((item) => item.sourceName === programSceneName);
      if (existing) {
        return;
      }

      // Add the program scene as a scene source
      const sceneItemId = await obsService.createSceneItem(sceneName, programSceneName);

      // Move it to the bottom of the source stack (z-index 0)
      // By setting it to position 0 in the scene item order
      const canvas = await getCanvasSize();
      await obsService.setSceneItemTransform(sceneName, sceneItemId, {
        positionX: 0,
        positionY: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth: canvas.width,
        boundsHeight: canvas.height,
        boundsAlignment: 0,
        rotation: 0,
      });

      // Move to bottom by setting the item order to 0
      try {
        await obsService.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId,
          sceneItemIndex: 0,
        });
      } catch {
        // Best effort — scene might not support reordering
      }

    } catch (err) {
      console.warn("[PresentationScene] Failed to add program scene reference:", err);
    }
  }

  /**
   * Ensure all required sources exist in the presentation scene.
   */
  private async ensureAllSources(sceneName: string, canvas: { width: number; height: number }): Promise<void> {
    // Ensure each module's source exists
    for (const [key, sourceName] of Object.entries(SOURCE_NAMES)) {
      await this.ensureSource(sceneName, sourceName, "browser_source", canvas, key.toLowerCase());
    }

    // Ensure background sources exist
    for (const [key, bgSourceName] of Object.entries(BG_SOURCE_NAMES)) {
      await this.ensureBgSource(sceneName, bgSourceName, canvas, key.toLowerCase());
    }

    // Ensure fullscreen sources exist
    for (const [key, sourceName] of Object.entries(FULLSCREEN_SOURCE_NAMES)) {
      await this.ensureSource(sceneName, sourceName, "browser_source", canvas, `fullscreen-${key.toLowerCase()}`);
    }

    // Ensure fullscreen background sources exist
    for (const [key, bgSourceName] of Object.entries(FULLSCREEN_BG_SOURCE_NAMES)) {
      await this.ensureBgSource(sceneName, bgSourceName, canvas, `fullscreen-${key.toLowerCase()}`);
    }
  }

  /**
   * Ensure a browser source exists in the presentation scene.
   */
  private async ensureSource(
    sceneName: string,
    sourceName: string,
    inputKind: string,
    canvas: { width: number; height: number },
    _moduleKey: string
  ): Promise<void> {
    // Check if source already exists in scene
    try {
      const resp = await obsService.call("GetSceneItemList", { sceneName });
      const items = (resp as { sceneItems: Array<{ sourceName: string; sceneItemId: number }> }).sceneItems ?? [];
      const existing = items.find((item) => item.sourceName === sourceName);
      if (existing) {
        _state.sources.set(sourceName, {
          sceneItemId: existing.sceneItemId,
          sceneUuid: _state.sceneUuid ?? "",
        });
        return;
      }
    } catch { /* scene might be empty */ }

    // Create the source
    try {
      const overlayUrl = `${getOverlayBaseUrlSync()}/bible-overlay-fullscreen.html`;
      const sceneItemId = await obsService.createInput(
        sceneName,
        sourceName,
        inputKind,
        {
          url: overlayUrl,
          width: canvas.width,
          height: canvas.height,
          css: "",
          shutdown: false,
          restart_when_active: false,
        }
      );

      _state.sources.set(sourceName, {
        sceneItemId,
        sceneUuid: _state.sceneUuid ?? "",
      });

      // Stretch to fill canvas
      await obsService.setSceneItemTransform(sceneName, sceneItemId, {
        positionX: 0,
        positionY: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth: canvas.width,
        boundsHeight: canvas.height,
        boundsAlignment: 0,
        rotation: 0,
      });

      // Start hidden
      await this.setSourceEnabled(sceneName, sceneItemId, false);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("600")) {
        // Source exists globally — add to scene
        try {
          const sceneItemId = await obsService.createSceneItem(sceneName, sourceName);
          _state.sources.set(sourceName, {
            sceneItemId,
            sceneUuid: _state.sceneUuid ?? "",
          });
          await this.setSourceEnabled(sceneName, sceneItemId, false);
        } catch { /* ok */ }
      } else {
        console.warn(`[PresentationScene] Failed to create source: ${sourceName}`, err);
      }
    }
  }

  /**
   * Ensure a background source exists in the presentation scene.
   */
  private async ensureBgSource(
    sceneName: string,
    bgSourceName: string,
    canvas: { width: number; height: number },
    _moduleKey: string
  ): Promise<void> {
    // Check if BG source already exists in scene
    try {
      const resp = await obsService.call("GetSceneItemList", { sceneName });
      const items = (resp as { sceneItems: Array<{ sourceName: string; sceneItemId: number }> }).sceneItems ?? [];
      const existing = items.find((item) => item.sourceName === bgSourceName);
      if (existing) {
        _state.bgSources.set(bgSourceName, {
          sceneItemId: existing.sceneItemId,
          sceneUuid: _state.sceneUuid ?? "",
        });
        return;
      }
    } catch { /* scene might be empty */ }

    // Create a color source as background
    try {
      const defaultColor = 0xFF000000; // ABGR: fully opaque black
      const sceneItemId = await obsService.createInput(
        sceneName,
        bgSourceName,
        "color_source_v3",
        {
          color: defaultColor,
          width: canvas.width,
          height: canvas.height,
        }
      );

      _state.bgSources.set(bgSourceName, {
        sceneItemId,
        sceneUuid: _state.sceneUuid ?? "",
      });

      // Stretch to fill canvas
      await obsService.setSceneItemTransform(sceneName, sceneItemId, {
        positionX: 0,
        positionY: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth: canvas.width,
        boundsHeight: canvas.height,
        boundsAlignment: 0,
        rotation: 0,
      });

      // Start hidden
      await this.setSourceEnabled(sceneName, sceneItemId, false);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("600")) {
        // Source exists globally — add to scene
        try {
          const sceneItemId = await obsService.createSceneItem(sceneName, bgSourceName);
          _state.bgSources.set(bgSourceName, {
            sceneItemId,
            sceneUuid: _state.sceneUuid ?? "",
          });
          await this.setSourceEnabled(sceneName, sceneItemId, false);
        } catch { /* ok */ }
      } else {
        console.warn(`[PresentationScene] Failed to create BG source: ${bgSourceName}`, err);
      }
    }
  }

  /**
   * Enable or disable a scene item.
   */
  private async setSourceEnabled(sceneName: string, sceneItemId: number, enabled: boolean): Promise<void> {
    try {
      await obsService.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId,
        sceneItemEnabled: enabled,
      });
    } catch {
      // Best effort
    }
  }

  /**
   * Show a specific module's source and hide all others.
   * This is the core visibility management logic.
   */
  async showModule(module: ModuleType): Promise<void> {
    await this.ensurePresentationScene();
    const sceneName = PRESENTATION_SCENE_NAME;

    // Map module to source name
    const sourceName = this.getModuleName(module);
    if (!sourceName) {
      console.warn(`[PresentationScene] Unknown module: ${module}`);
      return;
    }

    // Hide all sources first
    await this.hideAllSources(sceneName);

    // Show the requested module's source
    const sourceInfo = _state.sources.get(sourceName);
    if (sourceInfo) {
      await this.setSourceEnabled(sceneName, sourceInfo.sceneItemId, true);
    }

    // Show the corresponding background source
    const bgSourceName = this.getBgModuleName(module);
    if (bgSourceName) {
      const bgInfo = _state.bgSources.get(bgSourceName);
      if (bgInfo) {
        await this.setSourceEnabled(sceneName, bgInfo.sceneItemId, true);
      }
    }
  }

  /**
   * Hide all sources in the presentation scene.
   */
  async hideAllSources(sceneName?: string): Promise<void> {
    const targetScene = sceneName || PRESENTATION_SCENE_NAME;

    // Hide all main sources
    for (const [, sourceInfo] of _state.sources) {
      await this.setSourceEnabled(targetScene, sourceInfo.sceneItemId, false);
    }

    // Hide all background sources
    for (const [, bgInfo] of _state.bgSources) {
      await this.setSourceEnabled(targetScene, bgInfo.sceneItemId, false);
    }
  }

  /**
   * Get the source name for a module.
   */
  private getModuleName(module: ModuleType): string | null {
    switch (module) {
      case "bible": return SOURCE_NAMES.BIBLE;
      case "worship": return SOURCE_NAMES.WORSHIP;
      case "media": return SOURCE_NAMES.MEDIA;
      case "announcements": return SOURCE_NAMES.ANNOUNCEMENTS;
      case "lower-third": return SOURCE_NAMES.LOWER_THIRD;
      case "fullscreen-bible": return FULLSCREEN_SOURCE_NAMES.BIBLE;
      case "fullscreen-worship": return FULLSCREEN_SOURCE_NAMES.WORSHIP;
      case "fullscreen-countdown": return FULLSCREEN_SOURCE_NAMES.COUNTDOWN;
      default: return null;
    }
  }

  /**
   * Get the background source name for a module.
   */
  private getBgModuleName(module: ModuleType): string | null {
    switch (module) {
      case "bible": return BG_SOURCE_NAMES.BIBLE;
      case "worship": return BG_SOURCE_NAMES.WORSHIP;
      case "media": return BG_SOURCE_NAMES.MEDIA;
      case "announcements": return BG_SOURCE_NAMES.ANNOUNCEMENTS;
      case "lower-third": return BG_SOURCE_NAMES.LOWER_THIRD;
      case "fullscreen-bible": return FULLSCREEN_BG_SOURCE_NAMES.BIBLE;
      case "fullscreen-worship": return FULLSCREEN_BG_SOURCE_NAMES.WORSHIP;
      case "fullscreen-countdown": return FULLSCREEN_BG_SOURCE_NAMES.COUNTDOWN;
      default: return null;
    }
  }

  /**
   * Update a browser source's CSS data for a specific module.
   */
  async updateModuleCss(module: ModuleType, css: string): Promise<void> {
    const sourceName = this.getModuleName(module);
    if (!sourceName) return;

    try {
      await obsService.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: { css },
      });
    } catch (err) {
      console.warn(`[PresentationScene] Failed to update CSS for ${module}:`, err);
    }
  }

  /**
   * Update a browser source's URL for a specific module.
   */
  async updateModuleUrl(module: ModuleType, url: string): Promise<void> {
    const sourceName = this.getModuleName(module);
    if (!sourceName) return;

    try {
      await obsService.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: { url },
      });
    } catch (err) {
      console.warn(`[PresentationScene] Failed to update URL for ${module}:`, err);
    }
  }

  /**
   * Update a background source's color for a specific module.
   */
  async updateModuleBgColor(module: ModuleType, color: number): Promise<void> {
    const bgSourceName = this.getBgModuleName(module);
    if (!bgSourceName) return;

    try {
      await obsService.call("SetInputSettings", {
        inputName: bgSourceName,
        inputSettings: { color },
      });
    } catch (err) {
      console.warn(`[PresentationScene] Failed to update BG color for ${module}:`, err);
    }
  }

  /**
   * Show the presentation scene in OBS (go live).
   */
  async showLive(): Promise<void> {
    await this.ensurePresentationScene();

    const studioMode = await obsService.getStudioModeEnabled();
    if (studioMode) {
      await obsService.setCurrentProgramScene(PRESENTATION_SCENE_NAME);
    } else {
      await obsService.setCurrentProgramScene(PRESENTATION_SCENE_NAME);
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

export const presentationSceneManager = new PresentationSceneManager();
