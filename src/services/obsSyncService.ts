/**
 * obsSyncService.ts — Global OBS Synchronization Service
 *
 * Centralized service that manages all OBS discovery and state synchronization.
 * Per OBS_SYNC_ARCHITECTURE.md:
 *   - OBS is the single source of truth
 *   - Modules subscribe to synchronized state instead of duplicate scanning
 *   - Synchronization runs on every important lifecycle event
 *
 * Lifecycle triggers:
 *   - OBS connects / reconnects
 *   - Application starts / refreshes
 *   - A module is opened
 *   - After Push / Update / Clear operations
 */

import { obsService } from "./obsService";
import {
  getAllScenes as getAllRegisteredScenes,
  getAllInputs as getAllRegisteredInputs,
} from "./obsRegistry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

export interface VerseCastResource {
  /** Resource type */
  type: "scene" | "input" | "scene-item";
  /** OBS name */
  obsName: string;
  /** OBS UUID (stable across renames) */
  obsUuid: string;
  /** Registry slot */
  slot: string;
  /** Module that owns this resource */
  module: "bible" | "worship" | "multiview" | "ticker" | "lower-third" | "countdown" | "media" | "production" | "live-tools" | "pre-service";
  /** Resource version */
  version?: string;
  /** ISO timestamp when created */
  createdAt: string;
  /** ISO timestamp when last synced */
  lastSyncedAt: string;
}

export interface OBSModuleState {
  /** Module identifier */
  module: VerseCastResource["module"];
  /** Whether this module has resources in OBS */
  hasResources: boolean;
  /** List of resources found in OBS */
  resources: VerseCastResource[];
  /** Current sync status */
  syncStatus: SyncStatus;
  /** Error message if sync failed */
  error?: string;
  /** ISO timestamp of last successful sync */
  lastSyncedAt?: string;
}

export interface SyncResult {
  success: boolean;
  modules: Record<string, OBSModuleState>;
  totalResources: number;
  errors: string[];
  timestamp: string;
}

export type SyncListener = (result: SyncResult) => void;

// ---------------------------------------------------------------------------
// Resource Detection Patterns
// ---------------------------------------------------------------------------

/** Patterns used to identify VerseCast-managed resources in OBS */
const VERSECAST_PATTERNS = {
  /** Bible overlay scenes and inputs */
  bible: [
    /^MCE Bible$/i,
    /^MCE Bible BG$/i,
    /^MCE Bible:/i,
    /^MCE Presentation$/i,
  ],
  /** Worship overlay scenes and inputs */
  worship: [
    /^MCE Worship$/i,
    /^MCE Worship:/i,
  ],
  /** Multi-View scenes */
  multiview: [
    /^MV:/i,
    /^MCE MV:/i,
    /^VerseCast MV-/i,
  ],
  /** Ticker scenes and inputs */
  ticker: [
    /^⚡ MCE Ticker Overlay$/i,
    /^MCE Ticker/i,
  ],
  /** Lower Third scenes and inputs */
  "lower-third": [
    /^MCE LT:/i,
    /^MCE Lower Third/i,
    /^⚡ MCE Lower Third/i,
    /^MCE_BibleLT_/i,
    /^MCE_LT_/i,
    /^OCS LT:/i,
    /^VC_LT_/i,
    /^VC_BibleLT_/i,
    /^OCS_BibleLT_/i,
    /^MV_.*_LT:/i,
  ],
  /** Countdown / Pre-service scenes */
  countdown: [
    /^MCE Countdown/i,
    /^MCE Pre-Service/i,
    /^Pre-Service/i,
  ],
  /** Media scenes */
  media: [
    /^MCE Media/i,
  ],
  /** Production scenes */
  production: [
    /^MCE Production/i,
  ],
  /** Live Tools scenes */
  "live-tools": [
    /^MCE Live/i,
  ],
  /** Pre-service scenes */
  "pre-service": [
    /^MCE Pre/i,
    /^Pre-Service/i,
  ],
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class OBSSyncService {
  private _syncStatus: SyncStatus = "idle";
  private _lastSyncResult: SyncResult | null = null;
  private _listeners: Set<SyncListener> = new Set();
  private _moduleStates: Map<string, OBSModuleState> = new Map();
  private _syncLock = false;
  private _syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Debounce interval for sync requests (prevents rapid-fire scans) */
  private static SYNC_DEBOUNCE_MS = 500;

  constructor() {
    // Subscribe to OBS connection status changes
    obsService.onStatusChange((status) => {
      if (status === "connected") {
        console.log("[OBSSyncService] OBS connected — triggering sync");
        this.scheduleSync("connection");
      } else if (status === "disconnected" || status === "error") {
        console.log(`[OBSSyncService] OBS ${status} — clearing state`);
        this.clearState();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Current synchronization status */
  get syncStatus(): SyncStatus {
    return this._syncStatus;
  }

  /** Last sync result */
  get lastSyncResult(): SyncResult | null {
    return this._lastSyncResult;
  }

  /** Get state for a specific module */
  getModuleState(module: VerseCastResource["module"]): OBSModuleState | undefined {
    return this._moduleStates.get(module);
  }

  /** Get all module states */
  getAllModuleStates(): Map<string, OBSModuleState> {
    return new Map(this._moduleStates);
  }

  /**
   * Subscribe to sync results. Returns unsubscribe function.
   */
  onSync(listener: SyncListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Trigger a full synchronization.
   * @param reason - Why sync was triggered (for logging)
   */
  async sync(reason: string = "manual"): Promise<SyncResult> {
    if (this._syncLock) {
      console.log(`[OBSSyncService] Sync already in progress — skipping (reason: ${reason})`);
      return this._lastSyncResult ?? this.emptyResult();
    }

    this._syncLock = true;
    this.setSyncStatus("syncing");

    const errors: string[] = [];
    const moduleStates: Record<string, OBSModuleState> = {};
    let totalResources = 0;

    try {
      if (!obsService.isConnected) {
        throw new Error("OBS not connected");
      }

      console.log(`[OBSSyncService] Starting sync (reason: ${reason})`);

      // 1. Get all scenes and inputs from OBS
      const [obsScenes, obsInputs] = await Promise.all([
        obsService.getSceneList(),
        obsService.getInputList(),
      ]);

      // 2. Get all registered resources from our registry
      const [registeredScenes, registeredInputs] = await Promise.all([
        getAllRegisteredScenes(),
        getAllRegisteredInputs(),
      ]);

      // 4. Detect VerseCast resources by pattern matching
      const detectedResources: VerseCastResource[] = [];

      // Scan scenes
      for (const scene of obsScenes) {
        const module = this.detectModule(scene.sceneName, "scene");
        if (module) {
          const registered = registeredScenes.find(r => r.sceneUuid === scene.sceneUuid);
          detectedResources.push({
            type: "scene",
            obsName: scene.sceneName,
            obsUuid: scene.sceneUuid,
            slot: registered?.slot ?? `detected:${scene.sceneName}`,
            module,
            createdAt: registered?.createdAt ?? new Date().toISOString(),
            lastSyncedAt: new Date().toISOString(),
          });
        }
      }

      // Scan inputs
      for (const input of obsInputs) {
        const module = this.detectModule(input.inputName, "input");
        if (module) {
          const registered = registeredInputs.find(r => r.inputUuid === input.inputUuid);
          detectedResources.push({
            type: "input",
            obsName: input.inputName,
            obsUuid: input.inputUuid,
            slot: registered?.slot ?? `detected:${input.inputName}`,
            module,
            createdAt: registered?.createdAt ?? new Date().toISOString(),
            lastSyncedAt: new Date().toISOString(),
          });
        }
      }

      // 5. Group resources by module
      for (const module of Object.keys(VERSECAST_PATTERNS) as VerseCastResource["module"][]) {
        const resources = detectedResources.filter(r => r.module === module);
        moduleStates[module] = {
          module,
          hasResources: resources.length > 0,
          resources,
          syncStatus: "synced",
          lastSyncedAt: new Date().toISOString(),
        };
        totalResources += resources.length;
      }

      // 6. Update internal state
      for (const [module, state] of Object.entries(moduleStates)) {
        this._moduleStates.set(module, state);
      }

      const result: SyncResult = {
        success: true,
        modules: moduleStates,
        totalResources,
        errors,
        timestamp: new Date().toISOString(),
      };

      this._lastSyncResult = result;
      this.setSyncStatus("synced");
      this.notifyListeners(result);

      console.log(`[OBSSyncService] Sync complete — ${totalResources} resources found across ${Object.keys(moduleStates).length} modules`);

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(errorMsg);
      console.error(`[OBSSyncService] Sync failed:`, errorMsg);

      const result: SyncResult = {
        success: false,
        modules: moduleStates,
        totalResources,
        errors,
        timestamp: new Date().toISOString(),
      };

      this._lastSyncResult = result;
      this.setSyncStatus("error");
      this.notifyListeners(result);

      return result;
    } finally {
      this._syncLock = false;
    }
  }

  /**
   * Check if a specific resource exists in OBS.
   * @param name - OBS resource name
   * @param type - Resource type
   * @returns The OBS object if found, null otherwise
   */
  async findResource(
    name: string,
    type: "scene" | "input"
  ): Promise<{ exists: boolean; obsName: string; obsUuid: string } | null> {
    if (!obsService.isConnected) return null;

    try {
      if (type === "scene") {
        const scenes = await obsService.getSceneList();
        const found = scenes.find(s => s.sceneName === name);
        return found ? { exists: true, obsName: found.sceneName, obsUuid: found.sceneUuid } : null;
      } else {
        const inputs = await obsService.getInputList();
        const found = inputs.find(i => i.inputName === name);
        return found ? { exists: true, obsName: found.inputName, obsUuid: found.inputUuid } : null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Check if any VerseCast resources exist for a module.
   * This is the primary way modules should check OBS state.
   */
  async hasModuleResources(module: VerseCastResource["module"]): Promise<boolean> {
    // Try cached state first
    const cached = this._moduleStates.get(module);
    if (cached && cached.syncStatus === "synced") {
      return cached.hasResources;
    }

    // Fall back to fresh scan
    const result = await this.sync(`check:${module}`);
    return result.modules[module]?.hasResources ?? false;
  }

  /**
   * Get all resources for a specific module from OBS.
   */
  async getModuleResources(module: VerseCastResource["module"]): Promise<VerseCastResource[]> {
    // Try cached state first
    const cached = this._moduleStates.get(module);
    if (cached && cached.syncStatus === "synced") {
      return cached.resources;
    }

    // Fall back to fresh scan
    const result = await this.sync(`resources:${module}`);
    return result.modules[module]?.resources ?? [];
  }

  /**
   * Validate that a resource still exists in OBS.
   * Used before operations that depend on existing resources.
   */
  async validateResource(
    name: string,
    type: "scene" | "input"
  ): Promise<{ valid: boolean; exists: boolean }> {
    if (!obsService.isConnected) {
      return { valid: false, exists: false };
    }

    const resource = await this.findResource(name, type);
    return {
      valid: true,
      exists: resource !== null,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Detect which module a resource belongs to based on naming patterns.
   */
  private detectModule(
    name: string,
    _type: "scene" | "input"
  ): VerseCastResource["module"] | null {
    for (const [module, patterns] of Object.entries(VERSECAST_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(name)) {
          return module as VerseCastResource["module"];
        }
      }
    }
    return null;
  }

  /**
   * Schedule a debounced sync.
   */
  private scheduleSync(reason: string): void {
    if (this._syncDebounceTimer) {
      clearTimeout(this._syncDebounceTimer);
    }
    this._syncDebounceTimer = setTimeout(() => {
      this._syncDebounceTimer = null;
      this.sync(reason).catch(err => {
        console.error("[OBSSyncService] Scheduled sync failed:", err);
      });
    }, OBSSyncService.SYNC_DEBOUNCE_MS);
  }

  /**
   * Clear all cached state.
   */
  private clearState(): void {
    this._moduleStates.clear();
    this._lastSyncResult = null;
    this.setSyncStatus("idle");
  }

  /**
   * Update sync status and notify if changed.
   */
  private setSyncStatus(status: SyncStatus): void {
    if (this._syncStatus !== status) {
      this._syncStatus = status;
    }
  }

  /**
   * Notify all listeners of a sync result.
   */
  private notifyListeners(result: SyncResult): void {
    for (const listener of this._listeners) {
      try {
        listener(result);
      } catch (err) {
        console.error("[OBSSyncService] Listener error:", err);
      }
    }
  }

  /**
   * Create an empty sync result.
   */
  private emptyResult(): SyncResult {
    return {
      success: false,
      modules: {},
      totalResources: 0,
      errors: ["No previous sync"],
      timestamp: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

export const obsSyncService = new OBSSyncService();
