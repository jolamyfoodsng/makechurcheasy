/**
 * Auto-generate sequential song titles (Song001, Song002, ...).
 * Persists the counter in localStorage so it survives reloads.
 */

import { getUserScopedKey } from "../services/userScopedStorage";

const STORAGE_KEY = "ocs-song-title-counter-v1";

function readCounter(): number {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

function writeCounter(value: number): void {
  try {
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), String(value));
  } catch {
    // ignore
  }
}

/**
 * Returns the next auto-generated title and increments the counter.
 * Format: "Song001", "Song002", ..., "Song999", "Song1000", ...
 */
export function nextAutoSongTitle(): string {
  const counter = readCounter() + 1;
  writeCounter(counter);
  const padded = counter < 100 ? String(counter).padStart(3, "0") : String(counter);
  return `Song${padded}`;
}

/**
 * Peeks at the next title without incrementing the counter.
 */
export function peekNextSongTitle(): string {
  const counter = readCounter() + 1;
  const padded = counter < 100 ? String(counter).padStart(3, "0") : String(counter);
  return `Song${padded}`;
}
