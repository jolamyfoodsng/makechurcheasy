/**
 * libraryDb.ts — IndexedDB storage for media items.
 *
 * Replaces localStorage to handle larger media libraries with thumbnails.
 * IndexedDB provides ~50MB+ storage and async operations.
 * All records are scoped to the current user via userId.
 */

import type { MediaItem } from "./libraryTypes";
import { getCurrentUserId } from "../services/db";
import { getOverlayBaseUrl } from "../services/overlayUrl";
import { isInternalDockUploadFile } from "../dock/internalMediaAssets";

const DB_NAME = "obs-church-studio-media-library";
const STORE_NAME = "media";
const DB_VERSION = 2;
const MEDIA_UPLOAD_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp",
  "mp4", "m4v", "webm", "mov", "avi", "mkv", "wmv", "flv",
]);
const INTERNAL_UPLOAD_PREFIXES = ["dock_theme_bg_", "dock_theme_box_bg_", "dock_theme_logo_"];

function getUploadMediaType(fileName: string): MediaItem["type"] | null {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (!MEDIA_UPLOAD_EXTENSIONS.has(extension)) return null;
  return ["mp4", "m4v", "webm", "mov", "avi", "mkv", "wmv", "flv"].includes(extension)
    ? "video"
    : "image";
}

function isInternalUploadFile(fileName: string): boolean {
  const normalized = fileName.split(/[\\/]/).pop()?.toLowerCase() || "";
  return isInternalDockUploadFile(fileName)
    || INTERNAL_UPLOAD_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function normalizeManagedUploadFileName(fileName: string | undefined): string | null {
  const candidate = String(fileName || "").trim();
  if (!candidate || candidate === "." || candidate === "..") return null;
  if (candidate.includes("/") || candidate.includes("\\") || candidate.includes("\0")) return null;
  if (isInternalUploadFile(candidate)) return null;
  return candidate;
}

/**
 * Return the exact basename for a user-uploaded file managed by MCE.
 * Only files in the root uploads folder are eligible here; generated template
 * assets and arbitrary local paths must never be removed by a media delete.
 */
export function getManagedUploadFileName(
  item: Pick<MediaItem, "diskFileName" | "filePath" | "source">,
): string | null {
  if (item.source === "template-cloudflare") return null;

  if (item.diskFileName?.trim()) {
    return normalizeManagedUploadFileName(item.diskFileName);
  }

  const normalizedPath = String(item.filePath || "").trim().replace(/\\/g, "/");
  const match = normalizedPath.match(/(?:^|\/)uploads\/([^/]+)$/i);
  return normalizeManagedUploadFileName(match?.[1]);
}

/** Delete a user-uploaded media file from the shared uploads folder. */
export async function deleteUploadedMediaFile(fileName: string): Promise<void> {
  const safeName = normalizeManagedUploadFileName(fileName);
  if (!safeName) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_upload_file", { fileName: safeName });
    return;
  } catch {
    // The OBS dock runs outside Tauri. Use the shared overlay server there.
  }

  const baseUrl = await getOverlayBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/delete-upload?fileName=${encodeURIComponent(safeName)}`,
    { method: "DELETE", cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Could not delete uploaded media (${response.status})`);
  }
}

function getUploadDisplayName(fileName: string): string {
  return fileName.replace(/^media_\d{10,13}_/, "");
}

function getUploadCreatedAt(fileName: string, fallback: string): string {
  const match = fileName.match(/^media_(\d{10,13})_/);
  if (!match) return fallback;
  const raw = Number(match[1]);
  const timestamp = match[1].length <= 10 ? raw * 1000 : raw;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

/**
 * Dock uploads are written from an OBS browser origin, so that origin has a
 * separate IndexedDB database from the main desktop window. The uploads
 * folder is the shared physical source of truth; discover its media files so
 * every surface can reconcile the same library.
 */
interface UploadedMediaDiscovery {
  items: MediaItem[];
  listingAvailable: boolean;
}

async function discoverUploadedMedia(): Promise<UploadedMediaDiscovery> {
  try {
    const baseUrl = await getOverlayBaseUrl();
    const [uploadsResponse, directoryResponse] = await Promise.all([
      fetch(`${baseUrl}/api/uploads`, { cache: "no-store" }),
      fetch(`${baseUrl}/api/uploads-dir`, { cache: "no-store" }),
    ]);
    if (!uploadsResponse.ok) return { items: [], listingAvailable: false };

    const files = await uploadsResponse.json();
    if (!Array.isArray(files)) return { items: [], listingAvailable: false };
    const directoryPayload = directoryResponse.ok
      ? await directoryResponse.json() as { path?: string }
      : {};
    const directory = typeof directoryPayload.path === "string"
      ? directoryPayload.path.trim()
      : "";
    const separator = directory.includes("\\") ? "\\" : "/";

    const discoveredAt = Date.now();
    const items = files
      .filter((value): value is string => typeof value === "string")
      .filter((fileName) => Boolean(getUploadMediaType(fileName)) && !isInternalUploadFile(fileName))
      .map((fileName, index) => {
        const type = getUploadMediaType(fileName)!;
        const fallbackCreatedAt = new Date(discoveredAt - index).toISOString();
        return {
          id: `upload:${fileName}`,
          name: getUploadDisplayName(fileName),
          type,
          url: `${baseUrl}/uploads/${encodeURIComponent(fileName)}`,
          ...(directory ? { filePath: `${directory}${separator}${fileName}` } : {}),
          diskFileName: fileName,
          createdAt: getUploadCreatedAt(fileName, fallbackCreatedAt),
          source: "local" as const,
        } satisfies MediaItem;
      });
    return { items, listingAvailable: true };
  } catch (error) {
    console.warn("[libraryDb] Failed to discover shared uploads:", error);
    return { items: [], listingAvailable: false };
  }
}

function mergeMediaItems(
  stored: MediaItem[],
  discovered: MediaItem[],
  listingAvailable: boolean,
): MediaItem[] {
  const result: MediaItem[] = [];
  const seen = new Set<string>();
  const discoveredFileNames = new Set(discovered.map((item) => item.diskFileName).filter(Boolean));
  const reconciledStored = listingAvailable
    ? stored.filter((item) => (
      !item.diskFileName
      || !getManagedUploadFileName(item)
      || discoveredFileNames.has(item.diskFileName)
    ))
    : stored;
  for (const item of [...reconciledStored, ...discovered]) {
    const key = item.diskFileName || item.filePath || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

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

  let storedItems: MediaItem[] = [];
  try {
    const db = await openDb();
    const uid = getCurrentUserId();
    storedItems = await new Promise<MediaItem[]>((resolve, reject) => {
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
  } catch (err) {
    console.warn("[libraryDb] Failed to read media from IndexedDB:", err);
  }

  // Dock uploads can be created from a separate browser origin and therefore
  // do not necessarily have an IndexedDB record in this window. Reconcile the
  // shared uploads folder on every read so the desktop library, Dock, and
  // mobile companion all see the same media inventory.
  const discovered = await discoverUploadedMedia();
  return mergeMediaItems(storedItems, discovered.items, discovered.listingAvailable);
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
  const items = await getAllMedia();
  const target = items.find((item) => item.id === id);
  const uploadFileName = target
    ? getManagedUploadFileName(target)
    : id.startsWith("upload:")
      ? normalizeManagedUploadFileName(id.slice("upload:".length))
      : null;
  if (uploadFileName) {
    await deleteUploadedMediaFile(uploadFileName);
  }

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
  const items = await getAllMedia();
  await Promise.all(
    items.flatMap((item) => {
      const fileName = getManagedUploadFileName(item);
      return fileName ? [deleteUploadedMediaFile(fileName)] : [];
    }),
  );

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
