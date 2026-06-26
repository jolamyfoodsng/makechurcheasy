/**
 * useOBSSync — React hook for OBS synchronization state
 *
 * Provides modules with:
 * - Current sync status
 * - Module-specific resource state
 * - Ability to trigger sync
 * - Auto-sync on mount and when OBS connects
 *
 * Per OBS_SYNC_ARCHITECTURE.md:
 *   - Modules should subscribe to synchronized state
 *   - UI should always reflect actual OBS state
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  obsSyncService,
  type SyncStatus,
  type OBSModuleState,
  type VerseCastResource,
  type SyncResult,
} from "../services/obsSyncService";
import { obsService } from "../services/obsService";

export interface UseOBSSyncReturn {
  /** Current global sync status */
  syncStatus: SyncStatus;
  /** Module-specific state (if module prop provided) */
  moduleState: OBSModuleState | undefined;
  /** Whether resources exist in OBS */
  hasResources: boolean;
  /** Resources found for this module */
  resources: VerseCastResource[];
  /** Last sync result */
  lastSyncResult: SyncResult | null;
  /** Trigger a manual sync */
  sync: () => Promise<SyncResult>;
  /** Validate a specific resource exists in OBS */
  validateResource: (name: string, type: "scene" | "input") => Promise<{ valid: boolean; exists: boolean }>;
  /** Whether OBS is connected */
  isOBSConnected: boolean;
}

interface UseOBSSyncOptions {
  /** Module to get state for */
  module?: VerseCastResource["module"];
  /** Whether to auto-sync on mount (default: true) */
  autoSync?: boolean;
  /** Whether to sync when OBS connects (default: true) */
  syncOnConnect?: boolean;
}

export function useOBSSync(options: UseOBSSyncOptions = {}): UseOBSSyncReturn {
  const { module, autoSync = true, syncOnConnect = true } = options;

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(obsSyncService.syncStatus);
  const [moduleState, setModuleState] = useState<OBSModuleState | undefined>(
    module ? obsSyncService.getModuleState(module) : undefined
  );
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(
    obsSyncService.lastSyncResult
  );
  const [isOBSConnected, setIsOBSConnected] = useState(obsService.isConnected);

  const autoSyncDone = useRef(false);

  // Subscribe to sync results
  useEffect(() => {
    const unsubscribe = obsSyncService.onSync((result) => {
      setLastSyncResult(result);
      setSyncStatus(obsSyncService.syncStatus);
      if (module) {
        setModuleState(result.modules[module]);
      }
    });
    return unsubscribe;
  }, [module]);

  // Subscribe to OBS connection status
  useEffect(() => {
    const unsubscribe = obsService.onStatusChange((status) => {
      setIsOBSConnected(status === "connected");
      if (syncOnConnect && status === "connected") {
        obsSyncService.sync("obs-connect").catch(console.error);
      }
    });
    setIsOBSConnected(obsService.isConnected);
    return unsubscribe;
  }, [syncOnConnect]);

  // Auto-sync on mount
  useEffect(() => {
    if (autoSync && !autoSyncDone.current && obsService.isConnected) {
      autoSyncDone.current = true;
      obsSyncService.sync("mount").catch(console.error);
    }
  }, [autoSync]);

  const sync = useCallback(async () => {
    return obsSyncService.sync("manual");
  }, []);

  const validateResource = useCallback(async (name: string, type: "scene" | "input") => {
    return obsSyncService.validateResource(name, type);
  }, []);

  return {
    syncStatus,
    moduleState,
    hasResources: moduleState?.hasResources ?? false,
    resources: moduleState?.resources ?? [],
    lastSyncResult,
    sync,
    validateResource,
    isOBSConnected,
  };
}

/**
 * useOBSSyncOnMount — Lightweight hook that triggers sync when a module mounts.
 * Use this in modules that need to ensure OBS state is fresh when opened.
 */
export function useOBSSyncOnMount(module: VerseCastResource["module"]): void {
  useEffect(() => {
    if (obsService.isConnected) {
      obsSyncService.sync(`module:${module}`).catch(console.error);
    }
  }, [module]);
}
