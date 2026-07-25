/**
 * useMVSync — React hook for Multi-View OBS synchronization
 *
 * Per OBS_SYNC_ARCHITECTURE.md:
 *   - OBS is the source of truth
 *   - Sync on every important lifecycle event
 *   - UI should always reflect actual OBS state
 *
 * This hook provides:
 * - Current sync status for a specific layout
 * - Whether the layout exists in OBS
 * - The OBS scene name if it exists
 * - Ability to refresh sync state
 */

import { useState, useEffect, useCallback } from "react";
import { obsSyncService, type VerseCastResource } from "../../services/obsSyncService";
import { obsService } from "../../services/obsService";
import type { MVLayout, LayoutId } from "../types";
import { getMapping } from "../mvStore";

export interface MVSyncState {
  /** Whether this layout exists in OBS */
  existsInOBS: boolean;
  /** The OBS scene name if it exists */
  obsSceneName: string | null;
  /** The OBS scene UUID if it exists */
  obsSceneUuid: string | null;
  /** Current sync status */
  syncStatus: "idle" | "checking" | "synced" | "error";
  /** Error message if sync failed */
  error: string | null;
  /** ISO timestamp of last sync */
  lastSyncedAt: string | null;
}

interface UseMVSyncOptions {
  /** Layout to check sync state for */
  layout?: MVLayout;
  /** Layout ID (alternative to providing full layout) */
  layoutId?: LayoutId;
  /** Whether to auto-check on mount */
  autoCheck?: boolean;
}

/**
 * Hook that returns sync state for a Multi-View layout.
 *
 * @example
 * ```tsx
 * const { syncState, refresh } = useMVSync({ layout });
 *
 * // Determine button state
 * if (syncState.existsInOBS) {
 *   // Show "Update In OBS" and "Remove From OBS"
 * } else {
 *   // Show "Push To OBS"
 * }
 * ```
 */
export function useMVSync(options: UseMVSyncOptions = {}): {
  syncState: MVSyncState;
  refresh: () => Promise<void>;
} {
  const { layout, layoutId, autoCheck = true } = options;

  const [syncState, setSyncState] = useState<MVSyncState>({
    existsInOBS: false,
    obsSceneName: null,
    obsSceneUuid: null,
    syncStatus: "idle",
    error: null,
    lastSyncedAt: null,
  });

  const checkSync = useCallback(async () => {
    if (!obsService.isConnected) {
      setSyncState({
        existsInOBS: false,
        obsSceneName: null,
        obsSceneUuid: null,
        syncStatus: "idle",
        error: null,
        lastSyncedAt: null,
      });
      return;
    }

    setSyncState(prev => ({ ...prev, syncStatus: "checking", error: null }));

    try {
      // Determine the expected scene name
      let sceneName: string | null = null;

      if (layout) {
        // Use layout name to construct expected scene name
        sceneName = `MV: ${layout.name || "Untitled"}`;
      } else if (layoutId) {
        // Look up mapping from store
        const mapping = await getMapping(layoutId);
        if (mapping?.obsSceneName) {
          sceneName = mapping.obsSceneName;
        }
      }

      if (!sceneName) {
        setSyncState({
          existsInOBS: false,
          obsSceneName: null,
          obsSceneUuid: null,
          syncStatus: "synced",
          error: null,
          lastSyncedAt: new Date().toISOString(),
        });
        return;
      }

      // Check if scene exists in OBS
      const result = await obsSyncService.findResource(sceneName, "scene");

      setSyncState({
        existsInOBS: result?.exists ?? false,
        obsSceneName: result?.obsName ?? null,
        obsSceneUuid: result?.obsUuid ?? null,
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
  }, [layout, layoutId]);

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

/**
 * useMVSyncAll — Hook that returns sync state for all layouts.
 * Used by the Multi-View dashboard to show sync status for each layout.
 */
export function useMVSyncAll(): {
  layoutSyncStates: Map<string, MVSyncState>;
  refreshAll: () => Promise<void>;
} {
  const [layoutSyncStates, setLayoutSyncStates] = useState<Map<string, MVSyncState>>(new Map());

  const checkAllSyncs = useCallback(async () => {
    if (!obsService.isConnected) {
      setLayoutSyncStates(new Map());
      return;
    }

    try {
      // Get all resources from sync service
      const resources = await obsSyncService.getModuleResources("multiview");

      // Group by scene name
      const sceneMap = new Map<string, VerseCastResource>();
      for (const resource of resources) {
        if (resource.type === "scene") {
          sceneMap.set(resource.obsName, resource);
        }
      }

      // Update states
      const newStates = new Map<string, MVSyncState>();
      for (const [sceneName, resource] of sceneMap) {
        // We don't have layoutId directly, but we can store by scene name
        // The actual layoutId mapping would come from the store
        newStates.set(sceneName, {
          existsInOBS: true,
          obsSceneName: resource.obsName,
          obsSceneUuid: resource.obsUuid,
          syncStatus: "synced",
          error: null,
          lastSyncedAt: resource.lastSyncedAt,
        });
      }

      setLayoutSyncStates(newStates);
    } catch (err) {
      console.error("[useMVSyncAll] Failed to check sync states:", err);
    }
  }, []);

  // Auto-check on mount and when sync happens
  useEffect(() => {
    if (obsService.isConnected) {
      checkAllSyncs();
    }

    const unsubscribe = obsSyncService.onSync(() => {
      if (obsService.isConnected) {
        checkAllSyncs();
      }
    });

    return unsubscribe;
  }, [checkAllSyncs]);

  return { layoutSyncStates, refreshAll: checkAllSyncs };
}
