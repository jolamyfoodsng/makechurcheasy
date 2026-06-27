/**
 * worshipDb.ts — IndexedDB persistence for the Worship module
 *
 * Stores songs and setlists locally using idb.
 * All records are scoped to the current user via userId.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Song } from "./types";
import { getCurrentUserId } from "../services/db";

const DB_NAME = "obs-church-studio-worship";
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase> | null = null;

function isSongArchived(song: Song): boolean {
  return Boolean(song.archived || song.archivedAt);
}

function sortSongs(songs: Song[]): Song[] {
  return songs.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function sortArchivedSongs(songs: Song[]): Song[] {
  return songs.sort((a, b) => {
    const aTime = new Date(a.archivedAt || a.updatedAt).getTime();
    const bTime = new Date(b.archivedAt || b.updatedAt).getTime();
    return bTime - aTime;
  });
}

function notifySongsChanged(): void {
  syncSongsToDock()
    .then(() => {
      import("../services/dockBridge").then((m) => m.dockBridge.sendLibraryUpdated());
    })
    .catch(() => { });

  // Push updated usage counts to the server immediately
  import("../services/usageSync").then((m) => m.triggerUsageSync()).catch(() => { });
}

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        // Always ensure the songs store exists. The migrateFromLegacyDatabases()
        // helper may have opened this DB at version 1 without an upgrade
        // function, creating an empty DB. Use contains() checks instead of
        // oldVersion gates so the store is created regardless.
        if (!db.objectStoreNames.contains("songs")) {
          const store = db.createObjectStore("songs", { keyPath: "id" });
          store.createIndex("title", "metadata.title");
          store.createIndex("updatedAt", "updatedAt");
        }
        // Ensure userId index exists on the songs store
        if (db.objectStoreNames.contains("songs")) {
          const store = transaction.objectStore("songs") as unknown as IDBObjectStore;
          if (!store.indexNames.contains("userId")) {
            store.createIndex("userId", "userId", { unique: false });
          }
        }
      },
    }).then((db) => {
      // Safety check: if the songs store is missing (e.g. the upgrade handler
      // didn't run because the DB was already at the current version), force
      // a version bump so the upgrade handler re-runs.
      if (!db.objectStoreNames.contains("songs")) {
        db.close();
        dbPromise = null;
        // Re-open with a higher version to guarantee the upgrade handler fires
        return openDB(DB_NAME, DB_VERSION + 1, {
          upgrade(db, _oldVersion, _newVersion, transaction) {
            if (!db.objectStoreNames.contains("songs")) {
              const store = db.createObjectStore("songs", { keyPath: "id" });
              store.createIndex("title", "metadata.title");
              store.createIndex("updatedAt", "updatedAt");
            }
            if (db.objectStoreNames.contains("songs")) {
              const store = transaction.objectStore("songs") as unknown as IDBObjectStore;
              if (!store.indexNames.contains("userId")) {
                store.createIndex("userId", "userId", { unique: false });
              }
            }
          },
        });
      }
      return db;
    }).catch((err) => {
      // Reset so the next call can retry instead of being permanently stuck
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Song CRUD
// ---------------------------------------------------------------------------

/** Get all songs for the current user, sorted by updatedAt descending */
export async function getAllSongs(): Promise<Song[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  let all: Song[];
  if (uid) {
    all = await db.getAllFromIndex("songs", "userId", uid) as Song[];
  } else {
    all = await db.getAll("songs") as Song[];
  }
  return sortSongs(all.filter((song) => !isSongArchived(song)));
}

/** Get archived songs for the current user, newest archived first */
export async function getArchivedSongs(): Promise<Song[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  let all: Song[];
  if (uid) {
    all = await db.getAllFromIndex("songs", "userId", uid) as Song[];
  } else {
    all = await db.getAll("songs") as Song[];
  }
  return sortArchivedSongs(all.filter((song) => isSongArchived(song)));
}

/** Get a single song by id */
export async function getSong(id: string): Promise<Song | undefined> {
  const db = await getDb();
  return db.get("songs", id) as Promise<Song | undefined>;
}

/** Create or update a song — auto-injects userId for the current user */
export async function saveSong(song: Song): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  const tagged = uid ? { ...song, userId: uid } : song;
  await db.put("songs", tagged);
  notifySongsChanged();
}

/** Archive a song by id so it is removed from active views without being deleted */
export async function archiveSong(id: string): Promise<void> {
  const db = await getDb();
  const existing = (await db.get("songs", id)) as Song | undefined;
  if (!existing || isSongArchived(existing)) return;

  await db.put("songs", {
    ...existing,
    archived: true,
    archivedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  notifySongsChanged();
}

/** Restore an archived song back into the active worship library */
export async function restoreSong(id: string): Promise<void> {
  const db = await getDb();
  const existing = (await db.get("songs", id)) as Song | undefined;
  if (!existing || !isSongArchived(existing)) return;

  await db.put("songs", {
    ...existing,
    archived: false,
    archivedAt: null,
    updatedAt: new Date().toISOString(),
  });
  notifySongsChanged();
}

/** Backwards-compatible alias: song removal now archives instead of deleting */
export async function deleteSong(id: string): Promise<void> {
  await archiveSong(id);
}

/** Remove all songs for the current user (scoped by userId) */
export async function clearAllSongs(): Promise<void> {
  const db = await getDb();
  const uid = getCurrentUserId();
  if (uid) {
    const tx = db.transaction("songs", "readwrite");
    const idx = tx.store.index("userId");
    let cursor = await idx.openCursor(IDBKeyRange.only(uid));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } else {
    const tx = db.transaction("songs", "readwrite");
    await tx.objectStore("songs").clear();
    await tx.done;
  }
  notifySongsChanged();
}

/** Count total songs */
export async function countSongs(): Promise<number> {
  return (await getAllSongs()).length;
}

/**
 * Sync songs to a JSON file that the overlay server can serve to the dock.
 * Calls the Tauri `save_dock_data` command so the dock at
 * http://127.0.0.1:<port>/uploads/dock-worship-songs.json can read them.
 *
 * Enforces the user's plan song limit via the entitlement server:
 * only writes up to the allowed number of songs so the dock never
 * receives the full unfiltered list.
 *
 * Skips the write if no user is authenticated yet (prevents wiping
 * the JSON file on startup before auth completes).
 */
export async function syncSongsToDock(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const { getCurrentUser } = await import("../services/authService");
    const { checkEntitlementSync } = await import("../services/entitlementClient");

    const user = getCurrentUser();
    if (!user) {
      // No user authenticated yet — don't wipe the existing JSON file
      return;
    }

    const allSongs = await getAllSongs();
    const { allowed, limit } = checkEntitlementSync("songs", user.plan, allSongs.length);
    // If allowed (under limit or unlimited), write all songs; otherwise slice
    const songs = allowed ? allSongs : allSongs.slice(0, Math.max(0, limit));
    await invoke("save_dock_data", {
      name: "dock-worship-songs",
      data: JSON.stringify(songs),
    });
  } catch (err) {
    console.warn("[worshipDb] Failed to sync songs to dock:", err);
  }
}
