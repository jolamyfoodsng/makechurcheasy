/**
 * worshipDb.ts — IndexedDB persistence for the Worship module
 *
 * Stores songs and setlists locally using idb.
 * All records are scoped to the current user via userId.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Song } from "./types";
import { clearStore, getAll, getByKey, getCurrentUserId, putRecord, STORES } from "../services/db";

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

function songUpdatedTime(song: Song): number {
  return new Date(song.updatedAt || song.createdAt || 0).getTime();
}

function mergeSongs(...groups: Song[][]): Song[] {
  const merged = new Map<string, Song>();
  for (const group of groups) {
    for (const song of group) {
      if (!song?.id) continue;
      const current = merged.get(song.id);
      if (!current || songUpdatedTime(song) >= songUpdatedTime(current)) {
        merged.set(song.id, song);
      }
    }
  }
  return Array.from(merged.values());
}

async function readSongsFromLegacyDb(): Promise<Song[]> {
  const db = await getDb();
  const uid = getCurrentUserId();
  if (uid) {
    return await db.getAllFromIndex("songs", "userId", uid) as Song[];
  }
  return await db.getAll("songs") as Song[];
}

async function readSongsFromCentralDb(): Promise<Song[]> {
  try {
    return await getAll<Song>(STORES.WORSHIP_SONGS);
  } catch {
    return [];
  }
}

async function backfillSongsToStores(songs: Song[], legacySongs: Song[], centralSongs: Song[]): Promise<void> {
  if (songs.length === 0) return;
  try {
    const db = await getDb();
    const uid = getCurrentUserId();
    const legacyIds = new Set(legacySongs.map((song) => song.id));
    const centralIds = new Set(centralSongs.map((song) => song.id));
    await Promise.all(songs.map(async (song) => {
      const tagged = uid ? { ...song, userId: uid } : song;
      if (!legacyIds.has(song.id)) {
        await db.put("songs", tagged);
      }
      if (!centralIds.has(song.id)) {
        await putRecord(STORES.WORSHIP_SONGS, tagged);
      }
    }));
  } catch (err) {
    console.warn("[worshipDb] Failed to backfill songs:", err);
  }
}

async function readMergedSongs(): Promise<Song[]> {
  const [legacySongs, centralSongs] = await Promise.all([
    readSongsFromLegacyDb().catch(() => []),
    readSongsFromCentralDb(),
  ]);
  const merged = mergeSongs(legacySongs, centralSongs);
  backfillSongsToStores(merged, legacySongs, centralSongs).catch(() => { });
  return merged;
}

async function writeSongToCentralDb(song: Song): Promise<void> {
  try {
    await putRecord(STORES.WORSHIP_SONGS, song);
  } catch (err) {
    console.warn("[worshipDb] Failed to mirror song to central IndexedDB:", err);
  }
}

export interface SaveSongOptions {
  notify?: boolean;
}

export interface SaveSongsBatchOptions extends SaveSongOptions {
  onProgress?: (saved: number, total: number) => void;
}

async function assertCanCreateSongs(additionalCount: number): Promise<void> {
  if (additionalCount <= 0) return;

  const [{ getCurrentUser }, { getEffectivePlan }, { checkEntitlementSync }] = await Promise.all([
    import("../services/authService"),
    import("../services/licenseService"),
    import("../services/entitlementClient"),
  ]);

  const user = getCurrentUser();
  if (!user) return;

  const plan = getEffectivePlan(user);
  const currentCount = (await getAllSongs()).length;
  const result = checkEntitlementSync("songs", plan, currentCount);
  const limit = result.limit;

  if (limit === -1 || limit === Infinity) return;
  if (currentCount + additionalCount <= limit) return;

  throw new Error(
    `Song limit reached. Your ${plan} plan allows up to ${limit} songs. Upgrade to add more.`,
  );
}

async function assertCanBulkImportSongs(): Promise<void> {
  const [{ getCurrentUser }, { getEffectivePlan }, { checkEntitlementSync }] = await Promise.all([
    import("../services/authService"),
    import("../services/licenseService"),
    import("../services/entitlementClient"),
  ]);

  const user = getCurrentUser();
  if (!user) return;

  const plan = getEffectivePlan(user);
  const result = checkEntitlementSync("massImport", plan);
  if (result.allowed) return;

  throw new Error(
    result.reason || "Bulk import requires Growth plan or an active free trial.",
  );
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
  const all = await readMergedSongs();
  return sortSongs(all.filter((song) => !isSongArchived(song)));
}

/** Get archived songs for the current user, newest archived first */
export async function getArchivedSongs(): Promise<Song[]> {
  const all = await readMergedSongs();
  return sortArchivedSongs(all.filter((song) => isSongArchived(song)));
}

/** Get a single song by id */
export async function getSong(id: string): Promise<Song | undefined> {
  const db = await getDb();
  const legacy = await db.get("songs", id) as Song | undefined;
  const central = await getByKey<Song>(STORES.WORSHIP_SONGS, id).catch(() => undefined);
  const [song] = mergeSongs(legacy ? [legacy] : [], central ? [central] : []);
  if (song) {
    backfillSongsToStores([song], legacy ? [legacy] : [], central ? [central] : []).catch(() => { });
  }
  return song;
}

/** Create or update a song — auto-injects userId for the current user */
export async function saveSong(song: Song, options: SaveSongOptions = {}): Promise<void> {
  const db = await getDb();
  const existing = await db.get("songs", song.id) as Song | undefined;
  if (!existing && !isSongArchived(song)) {
    await assertCanCreateSongs(1);
  }

  const uid = getCurrentUserId();
  const tagged = uid ? { ...song, userId: uid } : song;
  await db.put("songs", tagged);
  await writeSongToCentralDb(tagged);
  if (options.notify !== false) {
    notifySongsChanged();
  }
}

/** Create or update many songs in one transaction, then notify once. */
export async function saveSongsBatch(songs: Song[], options: SaveSongsBatchOptions = {}): Promise<void> {
  if (songs.length === 0) return;

  await assertCanBulkImportSongs();
  await assertCanCreateSongs(songs.filter((song) => !isSongArchived(song)).length);

  const db = await getDb();
  const uid = getCurrentUserId();
  const tx = db.transaction("songs", "readwrite");
  const taggedSongs: Song[] = [];

  for (let i = 0; i < songs.length; i += 1) {
    const song = songs[i];
    const tagged = uid ? { ...song, userId: uid } : song;
    taggedSongs.push(tagged);
    await tx.store.put(tagged);
    options.onProgress?.(i + 1, songs.length);
  }

  await tx.done;
  await Promise.all(taggedSongs.map((song) => writeSongToCentralDb(song)));

  if (options.notify !== false) {
    notifySongsChanged();
  }
}

/** Archive a song by id so it is removed from active views without being deleted */
export async function archiveSong(id: string): Promise<void> {
  const db = await getDb();
  const existing = await getSong(id);
  if (!existing || isSongArchived(existing)) return;
  const updatedAt = new Date().toISOString();
  const archived = {
    ...existing,
    archived: true,
    archivedAt: updatedAt,
    updatedAt,
  };

  await db.put("songs", archived);
  await writeSongToCentralDb(archived);
  notifySongsChanged();
}

/** Restore an archived song back into the active worship library */
export async function restoreSong(id: string): Promise<void> {
  const db = await getDb();
  const existing = await getSong(id);
  if (!existing || !isSongArchived(existing)) return;
  const restored = {
    ...existing,
    archived: false,
    archivedAt: null,
    updatedAt: new Date().toISOString(),
  };

  await db.put("songs", restored);
  await writeSongToCentralDb(restored);
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
  await clearStore(STORES.WORSHIP_SONGS).catch((err) => {
    console.warn("[worshipDb] Failed to clear central song store:", err);
  });
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
    const { getEffectivePlan } = await import("../services/licenseService");

    const user = getCurrentUser();
    if (!user) {
      // No user authenticated yet — don't wipe the existing JSON file
      return;
    }

    const allSongs = await getAllSongs();
    const { allowed, limit } = checkEntitlementSync("songs", getEffectivePlan(user), allSongs.length);
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
