/**
 * Auto-generate sequential titles (Title 1, Title 2, ...).
 * Persists the counters in localStorage so they survive reloads.
 */

import { getUserScopedKey } from "../services/userScopedStorage";

const STORAGE_KEY = "ocs-song-title-counter-v1";
const NOTE_STORAGE_KEY = "ocs-note-title-counter-v1";

function readCounter(key: string): number {
  try {
    const raw = localStorage.getItem(getUserScopedKey(key));
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

function writeCounter(key: string, value: number): void {
  try {
    localStorage.setItem(getUserScopedKey(key), String(value));
  } catch {
    // ignore
  }
}

/**
 * Returns the next auto-generated song title and increments the counter.
 * Format: "Title 1", "Title 2", ...
 */
export function nextAutoSongTitle(): string {
  const counter = readCounter(STORAGE_KEY) + 1;
  writeCounter(STORAGE_KEY, counter);
  return `Title ${counter}`;
}

/**
 * Peeks at the next song title without incrementing the counter.
 */
export function peekNextSongTitle(): string {
  const counter = readCounter(STORAGE_KEY) + 1;
  return `Title ${counter}`;
}

/**
 * Returns the next auto-generated note title and increments the counter.
 * Format: "Title 1", "Title 2", ...
 */
export function nextAutoNoteTitle(): string {
  const counter = readCounter(NOTE_STORAGE_KEY) + 1;
  writeCounter(NOTE_STORAGE_KEY, counter);
  return `Title ${counter}`;
}

/**
 * Peeks at the next note title without incrementing the counter.
 */
export function peekNextNoteTitle(): string {
  const counter = readCounter(NOTE_STORAGE_KEY) + 1;
  return `Title ${counter}`;
}

/**
 * Checks if a title is a dummy/auto-generated placeholder like
 * "Title 1", "Title", "Song001", "Song 1", or empty.
 */
export function isDummyTitle(title?: string | null): boolean {
  if (!title) return true;
  const trimmed = title.trim();
  if (!trimmed) return true;
  return /^(title|song)(\s*|\s*0*)\d*$/i.test(trimmed);
}
