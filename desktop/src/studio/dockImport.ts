/**
 * dockImport.ts — bring the Dock's worship songs and notes into the Studio by themselves.
 *
 * Notes written in the OBS Dock live in the Dock's own browser storage, but the Dock also keeps a copy on disk
 * (the app's Dock settings, and uploads/dock-notes.json). The songs the Dock shows are written from the desktop's
 * own song library (uploads/dock-worship-songs.json), so a computer that has none yet (a fresh install, or a new
 * computer) picks them up from that file. Nothing here ever deletes or empties anything.
 */
import { DOCK_NOTES_KEY, loadDockNotes, saveDockNotes, type DockNote } from "../dock/dockNotesStorage";
import { readNativeDockSetting } from "../services/localDockSettings";
import { getAllSongs, saveSongsBatch } from "../worship/worshipDb";
import type { Song } from "../worship/types";

function asNotes(value: unknown): DockNote[] {
  return Array.isArray(value)
    ? value.filter((n): n is DockNote => Boolean(n && typeof n === "object" && typeof (n as DockNote).id === "string" && typeof (n as DockNote).title === "string" && typeof (n as DockNote).content === "string"))
    : [];
}

async function readJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`, { cache: "no-store" });
    return res.ok ? await res.json() : undefined;
  } catch {
    return undefined;
  }
}

/** Adds any Dock note this computer does not have (a newer copy of a note wins). Returns how many were added or updated. */
export async function bringInDockNotes(base: string): Promise<number> {
  const mine = loadDockNotes();
  const incoming: DockNote[] = [
    ...asNotes(readNativeDockSetting<unknown>(DOCK_NOTES_KEY)),
    ...(base ? asNotes(await readJson(`${base}/uploads/dock-notes.json`)) : []),
  ];
  if (incoming.length === 0) return 0;
  const byId = new Map(mine.map((n) => [n.id, n]));
  let changed = 0;
  for (const note of incoming) {
    const have = byId.get(note.id);
    if (!have) {
      byId.set(note.id, note);
      changed += 1;
    } else if ((note.updatedAt ?? 0) > (have.updatedAt ?? 0)) {
      byId.set(note.id, note);
      changed += 1;
    }
  }
  if (changed > 0) saveDockNotes([...byId.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
  return changed;
}

/** Only when this computer has no songs yet: read the Dock's song file. Returns how many were added. */
export async function bringInDockSongs(base: string): Promise<number> {
  if (!base) return 0;
  const have = await getAllSongs();
  if (have.length > 0) return 0;
  const raw = await readJson(`${base}/uploads/dock-worship-songs.json`);
  if (!Array.isArray(raw) || raw.length === 0) return 0;
  const songs = raw.filter((s): s is Song => Boolean(s && typeof s === "object" && typeof (s as Song).id === "string"));
  if (songs.length === 0) return 0;
  await saveSongsBatch(songs);
  return songs.length;
}
