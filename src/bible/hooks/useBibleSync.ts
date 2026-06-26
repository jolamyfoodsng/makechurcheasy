/**
 * useBibleSync — React hook for Bible OBS synchronization
 *
 * Per OBS_SYNC_ARCHITECTURE.md:
 *   - OBS is the source of truth
 *   - Detect if Bible scene already exists
 *   - Detect active Fullscreen and Lower Third outputs
 *   - Restore correct UI state after refresh
 *
 * This hook provides:
 * - Whether the Bible overlay exists in OBS
 * - Whether Fullscreen or Lower Third is active
 * - Current theme in use
 * - Ability to refresh sync state
 */

import { useState, useEffect, useCallback } from "react";
import { obsSyncService } from "../../services/obsSyncService";
import { obsService } from "../../services/obsService";
import type { BibleTemplateType } from "../types";

export interface BibleSyncState {
  /** Whether the Bible browser source exists in OBS */
  existsInOBS: boolean;
  /** The OBS scene name containing the Bible source */
  obsSceneName: string | null;
  /** Whether Fullscreen mode is active */
  isFullscreenActive: boolean;
  /** Whether Lower Third mode is active */
  isLowerThirdActive: boolean;
  /** Current template type in OBS */
  activeTemplateType: BibleTemplateType | null;
  /** Current sync status */
  syncStatus: "idle" | "checking" | "synced" | "error";
  /** Error message if sync failed */
  error: string | null;
  /** ISO timestamp of last sync */
  lastSyncedAt: string | null;
}

interface UseBibleSyncOptions {
  /** Whether to auto-check on mount */
  autoCheck?: boolean;
}

/**
 * Hook that returns sync state for the Bible module.
 *
 * @example
 * ```tsx
 * const { syncState, refresh } = useBibleSync();
 *
 * if (syncState.existsInOBS) {
 *   // Show "Update In OBS" and "Remove From OBS"
 *   // Also show whether Fullscreen or Lower Third is active
 * } else {
 *   // Show "Push To OBS"
 * }
 * ```
 */
export function useBibleSync(options: UseBibleSyncOptions = {}): {
  syncState: BibleSyncState;
  refresh: () => Promise<void>;
} {
  const { autoCheck = true } = options;

  const [syncState, setSyncState] = useState<BibleSyncState>({
    existsInOBS: false,
    obsSceneName: null,
    isFullscreenActive: false,
    isLowerThirdActive: false,
    activeTemplateType: null,
    syncStatus: "idle",
    error: null,
    lastSyncedAt: null,
  });

  const checkSync = useCallback(async () => {
    if (!obsService.isConnected) {
      setSyncState({
        existsInOBS: false,
        obsSceneName: null,
        isFullscreenActive: false,
        isLowerThirdActive: false,
        activeTemplateType: null,
        syncStatus: "idle",
        error: null,
        lastSyncedAt: null,
      });
      return;
    }

    setSyncState(prev => ({ ...prev, syncStatus: "checking", error: null }));

    try {
      // Check if Bible resources exist in OBS
      const hasResources = await obsSyncService.hasModuleResources("bible");
      const resources = await obsSyncService.getModuleResources("bible");

      // Find the main Bible scene
      const mainScene = resources.find(r =>
        r.type === "scene" && (
          r.obsName === "MCE Presentation" ||
          r.obsName === "MCE Bible"
        )
      );

      // Detect template type from browser source URL
      let activeTemplateType: BibleTemplateType | null = null;
      let isFullscreenActive = false;
      let isLowerThirdActive = false;

      if (mainScene) {
        try {
          // Get scene items to find the Bible browser source
          const sceneItems = await obsService.getSceneItemList(mainScene.obsName);
          const bibleItem = sceneItems.find(item =>
            item.sourceName === "MCE Bible" ||
            item.sourceName.includes("Bible")
          );

          if (bibleItem) {
            // Get input settings to check URL
            const inputSettings = await obsService.call("GetInputSettings", {
              inputName: bibleItem.sourceName,
            }) as { inputSettings: { url?: string } };

            const url = inputSettings.inputSettings?.url || "";
            if (url.includes("bible-overlay-fullscreen")) {
              activeTemplateType = "fullscreen";
              isFullscreenActive = true;
            } else if (url.includes("bible-overlay-lower-third")) {
              activeTemplateType = "lower-third";
              isLowerThirdActive = true;
            }
          }
        } catch {
          // Can't determine template type, that's ok
        }
      }

      setSyncState({
        existsInOBS: hasResources,
        obsSceneName: mainScene?.obsName ?? null,
        isFullscreenActive,
        isLowerThirdActive,
        activeTemplateType,
        syncStatus: "synced",
        error: null,
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (err) {
      setSyncState(prev => ({
        ...prev,
        syncStatus: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  // Auto-check on mount
  useEffect(() => {
    if (autoCheck && obsService.isConnected) {
      checkSync();
    }
  }, [autoCheck, checkSync]);

  // Re-check when sync service runs
  useEffect(() => {
    const unsubscribe = obsSyncService.onSync(() => {
      if (obsService.isConnected) {
        checkSync();
      }
    });
    return unsubscribe;
  }, [checkSync]);

  return { syncState, refresh: checkSync };
}
