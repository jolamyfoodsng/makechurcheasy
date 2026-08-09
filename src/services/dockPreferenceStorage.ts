/**
 * Durable persistence for dock presentation preferences.
 *
 * The dock is also loaded as a standalone browser document inside OBS. Keep
 * localStorage for instant startup and backwards compatibility, but mirror
 * the actual presentation preferences into the existing central IndexedDB
 * app_settings store. This makes an app update or a transient auth race
 * unable to replace a user's saved style with the production defaults.
 */

import { getByKey, putRecord, STORES } from "./db";
import {
  getUserScopedKey,
  readUserScopedStorage,
  writeUserScopedStorage,
} from "./userScopedStorage";

type PreferenceObject = Record<string, unknown>;

interface Candidate<T extends PreferenceObject> {
  key: string;
  value: T;
  timestamp: number;
  rank: number;
}

interface ListCandidate<T> {
  key: string;
  items: T[];
  timestamp: number;
  rank: number;
}

const durableWriteQueues = new Map<string, Promise<void>>();

function parsePreference<T extends PreferenceObject>(raw: unknown): T | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as T;
}

function parseStoredJson<T extends PreferenceObject>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return parsePreference<T>(JSON.parse(raw));
  } catch {
    return null;
  }
}

function preferenceTimestamp(value: PreferenceObject): number {
  const updatedAt = value.updatedAt;
  if (typeof updatedAt === "string") {
    const timestamp = Date.parse(updatedAt);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0;
}

function uniqueKeys(keys: string[]): string[] {
  return Array.from(new Set(keys.filter(Boolean)));
}

function parsePreferenceList<T>(raw: unknown): { items: T[]; timestamp: number } | null {
  if (Array.isArray(raw)) return { items: raw as T[], timestamp: 0 };
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { items?: unknown; updatedAt?: unknown };
  if (!Array.isArray(value.items)) return null;
  let timestamp = 0;
  if (typeof value.updatedAt === "string") {
    const parsed = Date.parse(value.updatedAt);
    if (Number.isFinite(parsed)) timestamp = parsed;
  } else if (typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)) {
    timestamp = value.updatedAt;
  }
  return { items: value.items as T[], timestamp };
}

function isNewer<T extends PreferenceObject>(candidate: Candidate<T>, current: Candidate<T>): boolean {
  const candidateHasTimestamp = candidate.timestamp > 0;
  const currentHasTimestamp = current.timestamp > 0;
  if (candidateHasTimestamp !== currentHasTimestamp) return candidateHasTimestamp;
  if (candidate.timestamp !== current.timestamp) return candidate.timestamp > current.timestamp;
  return candidate.rank > current.rank;
}

function queueDurableWrite(key: string, value: unknown): Promise<void> {
  const previous = durableWriteQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => putRecord(STORES.APP_SETTINGS, value, key));
  durableWriteQueues.set(key, next);
  next.then(
    () => {
      if (durableWriteQueues.get(key) === next) durableWriteQueues.delete(key);
    },
    () => {
      if (durableWriteQueues.get(key) === next) durableWriteQueues.delete(key);
    },
  );
  return next;
}

/** Synchronous localStorage read used for first-paint hydration. */
export function readDockPreference<T extends PreferenceObject>(baseKey: string): T | null {
  return parseStoredJson<T>(readUserScopedStorage(baseKey));
}

/** Synchronous localStorage write retained as the fast fallback. */
export function writeDockPreference<T extends PreferenceObject>(baseKey: string, value: T): void {
  try {
    writeUserScopedStorage(baseKey, JSON.stringify(value));
  } catch {
    // Ignore malformed values and embedded-browser storage failures.
  }
}

/** Synchronous read for picker-local style lists. */
export function readDockPreferenceList<T>(baseKey: string): T[] | null {
  const raw = readUserScopedStorage(baseKey);
  if (!raw) return null;
  try {
    return parsePreferenceList<T>(JSON.parse(raw))?.items ?? null;
  } catch {
    return null;
  }
}

/** Durable read/write for saved local style presets. */
export async function loadDockPreferenceList<T>(baseKey: string): Promise<T[] | null> {
  const localRaw = readUserScopedStorage(baseKey);
  let winner: ListCandidate<T> | null = null;
  if (localRaw) {
    try {
      const parsed = parsePreferenceList<T>(JSON.parse(localRaw));
      if (parsed) winner = { key: "localStorage", ...parsed, rank: 100 };
    } catch {
      // Ignore malformed local data and continue with IndexedDB.
    }
  }

  const scopedKey = getUserScopedKey(baseKey);
  const currentRaw = await getByKey<unknown>(STORES.APP_SETTINGS, scopedKey).catch(() => undefined);
  const currentParsed = parsePreferenceList<T>(currentRaw);
  const hasScopedLocalValue = scopedKey !== baseKey && (() => {
    try {
      return localStorage.getItem(scopedKey) !== null;
    } catch {
      return false;
    }
  })();
  const databaseKeys = currentParsed || hasScopedLocalValue ? [] : uniqueKeys([baseKey]);
  for (const [index, key] of databaseKeys.entries()) {
    try {
      const parsed = parsePreferenceList<T>(await getByKey<unknown>(STORES.APP_SETTINGS, key));
      if (!parsed) continue;
      const candidate: ListCandidate<T> = { key, ...parsed, rank: 80 - index };
      if (!winner || candidate.timestamp > winner.timestamp || (
        candidate.timestamp === winner.timestamp && candidate.rank > winner.rank
      )) {
        winner = candidate;
      }
    } catch {
      // Keep the localStorage copy available when IndexedDB is unavailable.
    }
  }

  if (currentParsed) {
    const currentCandidate: ListCandidate<T> = {
      key: scopedKey,
      ...currentParsed,
      rank: 80,
    };
    if (!winner || currentCandidate.timestamp > winner.timestamp || (
      currentCandidate.timestamp === winner.timestamp && currentCandidate.rank > winner.rank
    )) {
      winner = currentCandidate;
    }
  }

  if (!winner) return null;
  const record = { items: winner.items, updatedAt: new Date().toISOString() };
  writeUserScopedStorage(baseKey, JSON.stringify(record));
  if (winner.key !== scopedKey || winner.key === "localStorage") {
    try {
      await queueDurableWrite(scopedKey, record);
    } catch {
      // Best effort; the local copy was repaired above.
    }
  }
  return winner.items;
}

export async function saveDockPreferenceList<T>(baseKey: string, items: T[]): Promise<void> {
  const record = { items, updatedAt: new Date().toISOString() };
  writeUserScopedStorage(baseKey, JSON.stringify(record));
  try {
    await queueDurableWrite(getUserScopedKey(baseKey), record);
  } catch {
    // Keep localStorage as the fallback in embedded browser contexts.
  }
}

/**
 * Read the newest preference from localStorage or IndexedDB and repair the
 * other copy. `legacyKeys` lets Worship recover its older app-settings key.
 */
export async function loadDockPreference<T extends PreferenceObject>(
  baseKey: string,
  legacyKeys: string[] = [],
): Promise<T | null> {
  const localValue = readDockPreference<T>(baseKey);
  let winner: Candidate<T> | null = localValue
    ? { key: "localStorage", value: localValue, timestamp: preferenceTimestamp(localValue), rank: 100 }
    : null;

  const scopedKey = getUserScopedKey(baseKey);
  const currentDatabaseCandidate = await getByKey<unknown>(STORES.APP_SETTINGS, scopedKey)
    .then((raw) => {
      const value = parsePreference<T>(raw);
      return value
        ? {
            key: scopedKey,
            value,
            timestamp: preferenceTimestamp(value),
            rank: 90,
          } satisfies Candidate<T>
        : null;
    })
    .catch(() => null);

  // Once a current user-scoped record exists, never let an old unscoped
  // record from another account win by having a newer timestamp. Only use
  // legacy keys while migrating a user with no current scoped record yet.
  const hasScopedLocalValue = scopedKey !== baseKey && (() => {
    try {
      return localStorage.getItem(scopedKey) !== null;
    } catch {
      return false;
    }
  })();
  const databaseKeys = currentDatabaseCandidate
    ? []
    : uniqueKeys([
        ...(hasScopedLocalValue ? [] : [baseKey]),
        ...legacyKeys.flatMap((key) => hasScopedLocalValue
          ? [getUserScopedKey(key)]
          : [getUserScopedKey(key), key]),
      ]);

  const databaseCandidates = await Promise.all(databaseKeys.map(async (key, index) => {
    try {
      const raw = await getByKey<unknown>(STORES.APP_SETTINGS, key);
      const value = parsePreference<T>(raw);
      if (!value) return null;
      return {
        key,
        value,
        timestamp: preferenceTimestamp(value),
        rank: 80 - index,
      } satisfies Candidate<T>;
    } catch {
      return null;
    }
  }));

  if (currentDatabaseCandidate) databaseCandidates.unshift(currentDatabaseCandidate);
  for (const candidate of databaseCandidates) {
    if (candidate && (!winner || isNewer(candidate, winner))) winner = candidate;
  }

  if (!winner) return null;

  // Repair localStorage immediately so the overlay's synchronous readers and
  // older builds continue to see the same value.
  writeDockPreference(baseKey, winner.value);

  // Migrate local/legacy data into the current user-scoped IndexedDB key.
  // This is best-effort: localStorage remains the fallback if IndexedDB is
  // disabled or unavailable in an embedded browser.
  if (winner.key !== scopedKey || winner.key === "localStorage") {
    try {
      await queueDurableWrite(scopedKey, winner.value);
    } catch {
      // Ignore IndexedDB failures; the repaired local copy is still usable.
    }
  }

  return winner.value;
}

/** Save a preference to both fast storage and the durable app-settings store. */
export async function saveDockPreference<T extends PreferenceObject>(
  baseKey: string,
  value: T,
): Promise<T> {
  const next = {
    ...value,
    updatedAt: value.updatedAt ?? new Date().toISOString(),
  } as T;
  writeDockPreference(baseKey, next);

  try {
    await queueDurableWrite(getUserScopedKey(baseKey), next);
  } catch {
    // Keep localStorage as a working fallback for OBS browser contexts.
  }
  return next;
}
