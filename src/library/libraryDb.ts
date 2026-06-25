/**
 * libraryDb.ts — IndexedDB storage for media items.
 *
 * Replaces localStorage to handle larger media libraries with thumbnails.
 * IndexedDB provides ~50MB+ storage and async operations.
 * All records are scoped to the current user via userId.
 */

import type { MediaItem } from "./libraryTypes";
import { getCurrentUserId } from "../services/db";

const DB_NAME = "obs-church-studio-media-library";
const STORE_NAME = "media";
const DB_VERSION = 2;

// ---------------------------------------------------------------------------
// IndexedDB Helpers
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
        // v2: Add userId index for cross-account isolation
        if (event.oldVersion < 2) {
          const tx = (event.target as IDBOpenDBRequest).transaction;
          if (tx) {
            const store = tx.objectStore(STORE_NAME);
            if (store && !store.indexNames.contains("userId")) {
              store.createIndex("userId", "userId", { unique: false });
            }
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        // Reset so the next call can retry instead of being permanently stuck
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = callback(store);

      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  });
}

// ---------------------------------------------------------------------------
// Migration: Move existing localStorage data to IndexedDB (one-time)
// ---------------------------------------------------------------------------

const MIGRATION_KEY = "obs-media-migrated";

async function migrateFromLocalStorageIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  // Set flag immediately to prevent duplicate migrations
  localStorage.setItem(MIGRATION_KEY, "1");

  try {
    const LEGACY_KEY = "obs-church-studio-media-library";
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;

    const items: MediaItem[] = JSON.parse(raw);
    if (items.length === 0) return;

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      for (const item of items) {
        store.put(item);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

  } catch (err) {
    console.warn("[libraryDb] Migration from localStorage failed:", err);
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Get all media items for the current user, sorted by createdAt descending */
export async function getAllMedia(): Promise<MediaItem[]> {
  // Fire migration in background - don't block on it
  migrateFromLocalStorageIfNeeded().catch(() => { });

  try {
    const db = await openDb();
    const uid = getCurrentUserId();
    const items = await new Promise<MediaItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      let request: IDBRequest;
      if (uid && store.indexNames.contains("userId")) {
        const idx = store.index("userId");
        request = idx.getAll(uid);
      } else {
        request = store.getAll();
      }
      request.onsuccess = () => resolve(request.result as MediaItem[]);
      request.onerror = () => reject(request.error);
    });

    return items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (err) {
    console.warn("[libraryDb] Failed to read media from IndexedDB:", err);
    return [];
  }
}

/** Save (create or update) a media item — auto-injects userId */
export async function saveMedia(item: MediaItem): Promise<void> {
  const uid = getCurrentUserId();
  const tagged = uid ? { ...item, userId: uid } : item;
  await withStore("readwrite", (store) => store.put(tagged));

  // Sync to dock (fire-and-forget, non-blocking)
  syncMediaToDock()
    .then(() => {
      import("../services/dockBridge").then((m) => m.dockBridge.sendLibraryUpdated());
    })
    .catch(() => { });

  // Push updated usage counts to the server immediately
  import("../services/usageSync").then((m) => m.triggerUsageSync()).catch(() => { });
}

/** Delete a media item by id */
export async function deleteMedia(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));

  // Sync to dock (fire-and-forget, non-blocking)
  void syncMediaToDock()
    .then(() => {
      import("../services/dockBridge").then((m) => m.dockBridge.sendLibraryUpdated());
    })
    .catch(() => { });

  // Push updated usage counts to the server immediately
  import("../services/usageSync").then((m) => m.triggerUsageSync()).catch(() => { });
}

/** Rename a media item */
export async function renameMedia(id: string, newName: string): Promise<void> {
  const items = await getAllMedia();
  const item = items.find((m) => m.id === id);
  if (item) {
    item.name = newName;
    await withStore("readwrite", (store) => store.put(item));

    // Sync to dock (fire-and-forget, non-blocking)
    void syncMediaToDock()
      .then(() => {
        import("../services/dockBridge").then((m) => m.dockBridge.sendLibraryUpdated());
      })
      .catch(() => { });
  }
}

/**
 * Sync all media items to a JSON file that the overlay server can serve
 * to the dock. Calls the Tauri `save_dock_data` command.
 */
export async function syncMediaToDock(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const media = await getAllMedia();
    await invoke("save_dock_data", {
      name: "dock-media-library",
      data: JSON.stringify(media),
    });
  } catch (err) {
    console.warn("[libraryDb] Failed to sync media to dock:", err);
  }
}

/** Clear all media items for the current user (scoped by userId) */
export async function clearAllMedia(): Promise<void> {
  const db = await openDb();
  const uid = getCurrentUserId();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (uid && store.indexNames.contains("userId")) {
      const idx = store.index("userId");
      const request = idx.openCursor(IDBKeyRange.only(uid));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } else {
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }
  });
}
