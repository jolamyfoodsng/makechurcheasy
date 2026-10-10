/**
 * obsRegistry.ts — Persistent UUID tracking for every OBS object the app creates
 *
 * Stores sceneUuid, inputUuid, sceneItemId for all OBS objects created by
 * MakeChurchEasy. Uses IndexedDB for persistence across sessions.
 *
 * Why?
 *   - OBS identifies objects by UUID internally. Names can be renamed by the user.
 *   - After a restart, we need to find our objects even if they were renamed.
 *   - This registry lets us look up objects by their original slot/purpose.
 *
 * Naming convention:
 *   - All auto-created OBS objects are prefixed with "SS " for human clarity.
 *   - Each registered entry tracks `createdBy: "MakeChurchEasy"` and a timestamp.
 */

import { openDB, type IDBPDatabase } from "idb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisteredScene {
  /** Our internal slot name, e.g. "bible-overlay", "multiview-layout-3" */
  slot: string;
  /** OBS scene UUID (stable even after rename) */
  sceneUuid: string;
  /** Original scene name at creation time */
  sceneName: string;
  /** ISO timestamp when we created this */
  createdAt: string;
  createdBy: "MakeChurchEasy";
}

export interface RegisteredInput {
  /** Our internal slot name, e.g. "bible-browser-source", "mv-color-bg-3" */
  slot: string;
  /** OBS input UUID (stable even after rename) */
  inputUuid: string;
  /** Original input name at creation time */
  inputName: string;
  /** OBS input kind, e.g. "browser_source", "color_source_v3" */
  inputKind: string;
  /** ISO timestamp */
  createdAt: string;
  createdBy: "MakeChurchEasy";
}

export interface RegisteredSceneItem {
  /** Composite key: slot of the scene + slot of the input */
  slot: string;
  /** The scene this item lives in (slot reference) */
  sceneSlot: string;
  /** The input this item references (slot reference) */
  inputSlot: string;
  /** OBS scene item ID (integer, stable within the scene) */
  sceneItemId: number;
  /** The scene UUID it belongs to */
  sceneUuid: string;
  /** ISO timestamp */
  createdAt: string;
  createdBy: "MakeChurchEasy";
}

// ---------------------------------------------------------------------------
// IndexedDB setup
// ---------------------------------------------------------------------------

const DB_NAME = "sunday-switcher-obs-registry"; // legacy name — do not change (breaks existing user data)
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function ensureRegistryStores(db: IDBPDatabase | IDBDatabase): void {
  // Scenes store — keyed by slot
  if (!db.objectStoreNames.contains("scenes")) {
    const store = db.createObjectStore("scenes", { keyPath: "slot" });
    store.createIndex("sceneUuid", "sceneUuid", { unique: true });
  }
  // Inputs store — keyed by slot
  if (!db.objectStoreNames.contains("inputs")) {
    const store = db.createObjectStore("inputs", { keyPath: "slot" });
    store.createIndex("inputUuid", "inputUuid", { unique: true });
  }
  // Scene items store — keyed by slot
  if (!db.objectStoreNames.contains("sceneItems")) {
    const store = db.createObjectStore("sceneItems", { keyPath: "slot" });
    store.createIndex("sceneSlot", "sceneSlot");
    store.createIndex("inputSlot", "inputSlot");
  }
}

function getDb(): Promise<IDBPDatabase> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB is not available in this environment"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        ensureRegistryStores(db);
      },
    })
      .then(async (db) => {
        // Self-healing: if an older database was opened without object stores,
        // force a version bump so the upgrade callback runs and creates them.
        const missing =
          !db.objectStoreNames.contains("scenes") ||
          !db.objectStoreNames.contains("inputs") ||
          !db.objectStoreNames.contains("sceneItems");

        if (missing) {
          const nextVersion = Math.max(db.version + 1, DB_VERSION + 1);
          db.close();
          dbPromise = null;
          return openDB(DB_NAME, nextVersion, {
            upgrade(upgradeDb) {
              ensureRegistryStores(upgradeDb);
            },
          });
        }
        return db;
      })
      .catch((err) => {
        console.warn("[obsRegistry] Failed to initialize registry DB:", err);
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Scene registration
// ---------------------------------------------------------------------------

/**
 * Register a scene that MakeChurchEasy created.
 * Uses upsert — if the slot already exists, it updates the UUID.
 */
export async function registerScene(
  slot: string,
  sceneUuid: string,
  sceneName: string
): Promise<RegisteredScene> {
  const entry: RegisteredScene = {
    slot,
    sceneUuid,
    sceneName,
    createdAt: new Date().toISOString(),
    createdBy: "MakeChurchEasy",
  };
  try {
    const db = await getDb();
    if (db.objectStoreNames.contains("scenes")) {
      await db.put("scenes", entry);
    }
  } catch (err) {
    console.warn("[obsRegistry] registerScene failed:", err);
  }
  return entry;
}

/**
 * Get a registered scene by its slot name.
 */
export async function getSceneBySlot(slot: string): Promise<RegisteredScene | undefined> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains("scenes")) return undefined;
    return await db.get("scenes", slot);
  } catch (err) {
    console.warn("[obsRegistry] getSceneBySlot failed:", err);
    return undefined;
  }
}

/**
 * Get a registered scene by its UUID.
 */
export async function getSceneByUuid(sceneUuid: string): Promise<RegisteredScene | undefined> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains("scenes")) return undefined;
    return await db.getFromIndex("scenes", "sceneUuid", sceneUuid);
  } catch (err) {
    console.warn("[obsRegistry] getSceneByUuid failed:", err);
    return undefined;
  }
}

/**
 * Get all registered scenes.
 */
export async function getAllScenes(): Promise<RegisteredScene[]> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains("scenes")) return [];
    return await db.getAll("scenes");
  } catch (err) {
    console.warn("[obsRegistry] getAllScenes failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Input registration
// ---------------------------------------------------------------------------

/**
 * Register an input (source) that MakeChurchEasy created.
 */
export async function registerInput(
  slot: string,
  inputUuid: string,
  inputName: string,
  inputKind: string
): Promise<RegisteredInput> {
  const entry: RegisteredInput = {
    slot,
    inputUuid,
    inputName,
    inputKind,
    createdAt: new Date().toISOString(),
    createdBy: "MakeChurchEasy",
  };
  try {
    const db = await getDb();
    if (db.objectStoreNames.contains("inputs")) {
      await db.put("inputs", entry);
    }
  } catch (err) {
    console.warn("[obsRegistry] registerInput failed:", err);
  }
  return entry;
}

/**
 * Get a registered input by its slot name.
 */
export async function getInputBySlot(slot: string): Promise<RegisteredInput | undefined> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains("inputs")) return undefined;
    return await db.get("inputs", slot);
  } catch (err) {
    console.warn("[obsRegistry] getInputBySlot failed:", err);
    return undefined;
  }
}

/**
 * Get a registered input by its UUID.
 */
export async function getInputByUuid(inputUuid: string): Promise<RegisteredInput | undefined> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains("inputs")) return undefined;
    return await db.getFromIndex("inputs", "inputUuid", inputUuid);
  } catch (err) {
    console.warn("[obsRegistry] getInputByUuid failed:", err);
    return undefined;
  }
}

/**
 * Get all registered inputs.
 */
export async function getAllInputs(): Promise<RegisteredInput[]> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains("inputs")) return [];
    return await db.getAll("inputs");
  } catch (err) {
    console.warn("[obsRegistry] getAllInputs failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Scene item registration
// ---------------------------------------------------------------------------

/**
 * Register a scene item (the link between a scene and an input).
 */
export async function registerSceneItem(
  slot: string,
  sceneSlot: string,
  inputSlot: string,
  sceneItemId: number,
  sceneUuid: string
): Promise<RegisteredSceneItem> {
  const entry: RegisteredSceneItem = {
    slot,
    sceneSlot,
    inputSlot,
    sceneItemId,
    sceneUuid,
    createdAt: new Date().toISOString(),
    createdBy: "MakeChurchEasy",
  };
  try {
    const db = await getDb();
    if (db.objectStoreNames.contains("sceneItems")) {
      await db.put("sceneItems", entry);
    }
  } catch (err) {
    console.warn("[obsRegistry] registerSceneItem failed:", err);
  }
  return entry;
}

/**
 * Get a registered scene item by its slot name.
 */
export async function getSceneItemBySlot(slot: string): Promise<RegisteredSceneItem | undefined> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains("sceneItems")) return undefined;
    return await db.get("sceneItems", slot);
  } catch (err) {
    console.warn("[obsRegistry] getSceneItemBySlot failed:", err);
    return undefined;
  }
}

/**
 * Get all scene items belonging to a scene slot.
 */
export async function getSceneItemsBySceneSlot(sceneSlot: string): Promise<RegisteredSceneItem[]> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains("sceneItems")) return [];
    return await db.getAllFromIndex("sceneItems", "sceneSlot", sceneSlot);
  } catch (err) {
    console.warn("[obsRegistry] getSceneItemsBySceneSlot failed:", err);
    return [];
  }
}

/**
 * Get all registered scene items.
 */
export async function getAllSceneItems(): Promise<RegisteredSceneItem[]> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains("sceneItems")) return [];
    return await db.getAll("sceneItems");
  } catch (err) {
    console.warn("[obsRegistry] getAllSceneItems failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Find all registered objects for a given slot prefix.
 * E.g. findBySlot("bible") returns all scenes, inputs, items whose slot starts with "bible".
 */
export async function findBySlot(slotPrefix: string): Promise<{
  scenes: RegisteredScene[];
  inputs: RegisteredInput[];
  sceneItems: RegisteredSceneItem[];
}> {
  const [scenes, inputs, sceneItems] = await Promise.all([
    getAllScenes(),
    getAllInputs(),
    getAllSceneItems(),
  ]);

  return {
    scenes: scenes.filter((s) => s.slot.startsWith(slotPrefix)),
    inputs: inputs.filter((i) => i.slot.startsWith(slotPrefix)),
    sceneItems: sceneItems.filter((si) => si.slot.startsWith(slotPrefix)),
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Remove all registry entries for a given slot prefix.
 * Call this when tearing down a layout or feature.
 */
export async function cleanupBySlot(slotPrefix: string): Promise<void> {
  try {
    const db = await getDb();
    const stores = (["scenes", "inputs", "sceneItems"] as const).filter((s) =>
      db.objectStoreNames.contains(s)
    );
    if (stores.length === 0) return;

    const [scenes, inputs, sceneItems] = await Promise.all([
      getAllScenes(),
      getAllInputs(),
      getAllSceneItems(),
    ]);

    const tx = db.transaction(stores, "readwrite");

    if (db.objectStoreNames.contains("scenes")) {
      for (const s of scenes) {
        if (s.slot.startsWith(slotPrefix)) {
          await tx.objectStore("scenes").delete(s.slot);
        }
      }
    }
    if (db.objectStoreNames.contains("inputs")) {
      for (const i of inputs) {
        if (i.slot.startsWith(slotPrefix)) {
          await tx.objectStore("inputs").delete(i.slot);
        }
      }
    }
    if (db.objectStoreNames.contains("sceneItems")) {
      for (const si of sceneItems) {
        if (si.slot.startsWith(slotPrefix)) {
          await tx.objectStore("sceneItems").delete(si.slot);
        }
      }
    }

    await tx.done;
  } catch (err) {
    console.warn("[obsRegistry] cleanupBySlot failed:", err);
  }
}

/**
 * Remove a single scene, its inputs, and its scene items by scene slot.
 */
export async function cleanupLayout(sceneSlot: string): Promise<void> {
  try {
    const db = await getDb();
    const stores = (["scenes", "inputs", "sceneItems"] as const).filter((s) =>
      db.objectStoreNames.contains(s)
    );
    if (stores.length === 0) return;

    // Find scene items for this scene
    const sceneItems = await getSceneItemsBySceneSlot(sceneSlot);
    const inputSlots = new Set(sceneItems.map((si) => si.inputSlot));

    const tx = db.transaction(stores, "readwrite");

    // Remove scene items
    if (db.objectStoreNames.contains("sceneItems")) {
      for (const si of sceneItems) {
        await tx.objectStore("sceneItems").delete(si.slot);
      }
    }

    // Remove inputs that were exclusive to this scene
    if (db.objectStoreNames.contains("inputs")) {
      const allItems = await getAllSceneItems();
      for (const inputSlot of inputSlots) {
        const otherRefs = allItems.filter(
          (si) => si.inputSlot === inputSlot && si.sceneSlot !== sceneSlot
        );
        if (otherRefs.length === 0) {
          await tx.objectStore("inputs").delete(inputSlot);
        }
      }
    }

    // Remove scene
    if (db.objectStoreNames.contains("scenes")) {
      await tx.objectStore("scenes").delete(sceneSlot);
    }

    await tx.done;
  } catch (err) {
    console.warn("[obsRegistry] cleanupLayout failed:", err);
  }
}

/**
 * Clear the entire registry. Use with caution!
 */
export async function clearRegistry(): Promise<void> {
  try {
    const db = await getDb();
    const stores = (["scenes", "inputs", "sceneItems"] as const).filter((s) =>
      db.objectStoreNames.contains(s)
    );
    if (stores.length === 0) return;

    const tx = db.transaction(stores, "readwrite");
    for (const storeName of stores) {
      await tx.objectStore(storeName).clear();
    }
    await tx.done;
  } catch (err) {
    console.warn("[obsRegistry] clearRegistry failed:", err);
  }
}

/**
 * Get a summary of the registry for debugging.
 */
export async function getRegistrySummary(): Promise<{
  sceneCount: number;
  inputCount: number;
  sceneItemCount: number;
  scenes: RegisteredScene[];
  inputs: RegisteredInput[];
  sceneItems: RegisteredSceneItem[];
}> {
  const [scenes, inputs, sceneItems] = await Promise.all([
    getAllScenes(),
    getAllInputs(),
    getAllSceneItems(),
  ]);

  return {
    sceneCount: scenes.length,
    inputCount: inputs.length,
    sceneItemCount: sceneItems.length,
    scenes,
    inputs,
    sceneItems,
  };
}
