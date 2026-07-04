/**
 * worshipDb.ts — IndexedDB persistence for the Worship module
 *
 * Stores songs and setlists locally using idb.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Song } from "./types";

const DB_NAME = "obs-church-studio-worship";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains("songs")) {
            const store = db.createObjectStore("songs", { keyPath: "id" });
            store.createIndex("title", "metadata.title");
            store.createIndex("updatedAt", "updatedAt");
          }
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Song CRUD
// ---------------------------------------------------------------------------

/** Get all songs, sorted by updatedAt descending */
export async function getAllSongs(): Promise<Song[]> {
  const db = await getDb();
  const all = await db.getAll("songs");
  return (all as Song[]).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Get a single song by id */
export async function getSong(id: string): Promise<Song | undefined> {
  const db = await getDb();
  return db.get("songs", id) as Promise<Song | undefined>;
}

/** Create or update a song */
export async function saveSong(song: Song): Promise<void> {
  const db = await getDb();
  await db.put("songs", song);
  // Sync to dock (fire-and-forget)
  syncSongsToDock()
    .then(() => {
      import("../services/dockBridge").then((m) => m.dockBridge.sendLibraryUpdated());
    })
    .catch(() => {});
}

/** Delete a song by id */
export async function deleteSong(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("songs", id);
  // Sync to dock (fire-and-forget)
  syncSongsToDock()
    .then(() => {
      import("../services/dockBridge").then((m) => m.dockBridge.sendLibraryUpdated());
    })
    .catch(() => {});
}

/** Count total songs */
export async function countSongs(): Promise<number> {
  const db = await getDb();
  return db.count("songs");
}

/**
 * Sync all songs to a JSON file that the overlay server can serve to the dock.
 * Calls the Tauri `save_dock_data` command so the dock at
 * http://127.0.0.1:<port>/uploads/dock-worship-songs.json can read them.
 */
export async function syncSongsToDock(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const songs = await getAllSongs();
    await invoke("save_dock_data", {
      name: "dock-worship-songs",
      data: JSON.stringify(songs),
    });
  } catch (err) {
    console.warn("[worshipDb] Failed to sync songs to dock:", err);
  }
}
