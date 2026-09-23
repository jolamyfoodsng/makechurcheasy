/**
 * Durable Dock preference storage.
 *
 * Dock preferences are backed by the desktop SQLite database through
 * localDockSettings. The in-memory map gives the Dock synchronous reads for
 * rendering; it is hydrated before the Dock is released by its auth gate.
 */

import {
  hydrateNativeDockSettings,
  readNativeDockSetting,
  removeNativeDockSetting,
  writeNativeDockSetting,
} from "./localDockSettings";

type PreferenceObject = Record<string, unknown>;

function parseStoredJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parsePreference<T extends PreferenceObject>(raw: unknown): T | null {
  const value = parseStoredJson<unknown>(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as T;
}

function parsePreferenceList<T>(raw: unknown): { items: T[]; timestamp: number } | null {
  const value = parseStoredJson<unknown>(raw);
  if (Array.isArray(value)) return { items: value as T[], timestamp: 0 };
  if (!value || typeof value !== "object") return null;
  const candidate = value as { items?: unknown; updatedAt?: unknown };
  if (!Array.isArray(candidate.items)) return null;
  const timestamp = typeof candidate.updatedAt === "string"
    ? Date.parse(candidate.updatedAt)
    : typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : 0;
  return { items: candidate.items as T[], timestamp: Number.isFinite(timestamp) ? timestamp : 0 };
}

const DOCK_FAST_PREF_PREFIX = "__mce_dock_fast_pref:";

function readFastCache<T extends PreferenceObject>(baseKey: string): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${DOCK_FAST_PREF_PREFIX}${baseKey}`);
    return parsePreference<T>(raw);
  } catch {
    return null;
  }
}

function writeFastCache<T extends PreferenceObject>(baseKey: string, value: T): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${DOCK_FAST_PREF_PREFIX}${baseKey}`, JSON.stringify(value));
  } catch {
    // Ignore storage quota or restricted environment errors.
  }
}

function readFastCacheList<T>(baseKey: string): T[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${DOCK_FAST_PREF_PREFIX}${baseKey}`);
    return parsePreferenceList<T>(raw)?.items ?? null;
  } catch {
    return null;
  }
}

function writeFastCacheList<T>(baseKey: string, items: T[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      `${DOCK_FAST_PREF_PREFIX}${baseKey}`,
      JSON.stringify({ items, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Ignore storage quota or restricted environment errors.
  }
}

/** Synchronous in-memory read after native Dock settings hydration, with localStorage fast cache fallback. */
export function readDockPreference<T extends PreferenceObject>(baseKey: string): T | null {
  const fromNative = parsePreference<T>(readNativeDockSetting(baseKey));
  if (fromNative) return fromNative;
  return readFastCache<T>(baseKey);
}

/** Update the native source of truth, in-memory first-paint copy, and localStorage fast cache. */
export function writeDockPreference<T extends PreferenceObject>(baseKey: string, value: T): void {
  writeFastCache(baseKey, value);
  writeNativeDockSetting(baseKey, value);
}

export function readDockPreferenceList<T>(baseKey: string): T[] | null {
  const fromNative = parsePreferenceList<T>(readNativeDockSetting(baseKey))?.items;
  if (fromNative) return fromNative;
  return readFastCacheList<T>(baseKey);
}

export async function loadDockPreferenceList<T>(baseKey: string): Promise<T[] | null> {
  await hydrateNativeDockSettings().catch(() => undefined);
  const current = parsePreferenceList<T>(readNativeDockSetting(baseKey));
  if (current?.items) {
    writeFastCacheList(baseKey, current.items);
    return current.items;
  }
  return readFastCacheList<T>(baseKey);
}

export async function saveDockPreferenceList<T>(baseKey: string, items: T[]): Promise<void> {
  writeFastCacheList(baseKey, items);
  await writeNativeDockSetting(baseKey, {
    items,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadDockPreference<T extends PreferenceObject>(
  baseKey: string,
  legacyKeys: string[] = [],
): Promise<T | null> {
  await hydrateNativeDockSettings().catch(() => undefined);

  const current = parsePreference<T>(readNativeDockSetting(baseKey));
  if (current) {
    writeFastCache(baseKey, current);
    return current;
  }

  for (const legacyKey of legacyKeys) {
    const legacy = parsePreference<T>(readNativeDockSetting(legacyKey));
    if (!legacy) continue;
    const migrated = {
      ...legacy,
      updatedAt: legacy.updatedAt ?? new Date().toISOString(),
    } as T;
    writeFastCache(baseKey, migrated);
    await writeNativeDockSetting(baseKey, migrated);
    await removeNativeDockSetting(legacyKey);
    return migrated;
  }

  return readFastCache<T>(baseKey);
}

/** Save a preference to the native desktop database and synchronous fast cache. */
export async function saveDockPreference<T extends PreferenceObject>(
  baseKey: string,
  value: T,
): Promise<T> {
  const next = {
    ...value,
    updatedAt: value.updatedAt ?? new Date().toISOString(),
  } as T;
  writeFastCache(baseKey, next);
  await writeNativeDockSetting(baseKey, next);
  return next;
}

