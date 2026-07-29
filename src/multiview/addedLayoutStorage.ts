import { getUserScopedKey } from "../services/userScopedStorage";

export const MULTIVIEW_ADDED_LAYOUTS_KEY = "mvg-added-ids";
export const MULTIVIEW_ADDED_LAYOUTS_DOCK_DATA_NAME = "mv-added-ids";
export const MULTIVIEW_ADDED_LAYOUTS_DOCK_DATA_URL = "/uploads/mv-added-ids.json";
export const MULTIVIEW_ADDED_LAYOUTS_CHANGED_EVENT = "mce:multiview-added-layouts-changed";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface SaveLocalOptions {
  emit?: boolean;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseAddedLayoutIds(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const ids = parsed
      .map(normalizeId)
      .filter((value): value is string => Boolean(value));
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function normalizeAddedLayoutIds(ids: Iterable<unknown>): string[] {
  const normalized = new Set<string>();
  for (const id of ids) {
    const value = normalizeId(id);
    if (value) normalized.add(value);
  }
  return [...normalized];
}

export function mergeAddedLayoutIds(...sources: Array<Iterable<unknown> | null | undefined>): Set<string> {
  const merged = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const id of normalizeAddedLayoutIds(source)) {
      merged.add(id);
    }
  }
  return merged;
}

export function serializeAddedLayoutIds(ids: Iterable<unknown>): string {
  return JSON.stringify(normalizeAddedLayoutIds(ids));
}

export function areAddedLayoutIdsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

export function getAddedLayoutLocalStorageKeys(): string[] {
  const keys = [MULTIVIEW_ADDED_LAYOUTS_KEY];
  try {
    const scopedKey = getUserScopedKey(MULTIVIEW_ADDED_LAYOUTS_KEY);
    if (scopedKey !== MULTIVIEW_ADDED_LAYOUTS_KEY) keys.push(scopedKey);
  } catch {
    // If auth state is unavailable, the unscoped key is still usable.
  }
  return keys;
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof globalThis === "undefined") return null;
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadLocalAddedLayoutIds(): Set<string> {
  const storage = getLocalStorage();
  if (!storage) return new Set();

  const sets: Set<string>[] = [];
  for (const key of getAddedLayoutLocalStorageKeys()) {
    try {
      sets.push(parseAddedLayoutIds(storage.getItem(key)));
    } catch {
      // Ignore unavailable/corrupt storage entries.
    }
  }

  const merged = mergeAddedLayoutIds(...sets);
  if (merged.size > 0) {
    saveLocalAddedLayoutIds(merged, { emit: false });
  }
  return merged;
}

export function saveLocalAddedLayoutIds(ids: Iterable<unknown>, options: SaveLocalOptions = {}): Set<string> {
  const normalized = new Set(normalizeAddedLayoutIds(ids));
  const storage = getLocalStorage();
  if (storage) {
    const raw = serializeAddedLayoutIds(normalized);
    for (const key of getAddedLayoutLocalStorageKeys()) {
      try {
        storage.setItem(key, raw);
      } catch {
        // Best-effort cache only.
      }
    }
  }

  if (options.emit !== false) {
    emitAddedLayoutIdsChanged(normalized);
  }
  return normalized;
}

export function emitAddedLayoutIdsChanged(ids: Iterable<unknown>): void {
  if (typeof window === "undefined") return;
  const detail = { ids: normalizeAddedLayoutIds(ids) };
  window.dispatchEvent(new CustomEvent(MULTIVIEW_ADDED_LAYOUTS_CHANGED_EVENT, { detail }));
}

function canUseTauriInvoke(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loadAddedLayoutIdsFromDockData(fetchImpl: FetchLike = fetch): Promise<Set<string>> {
  if (canUseTauriInvoke()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("load_dock_data", {
        name: MULTIVIEW_ADDED_LAYOUTS_DOCK_DATA_NAME,
      });
      const parsed = parseAddedLayoutIds(raw);
      if (parsed.size > 0) return parsed;
    } catch {
      // Non-Tauri contexts and early startup fall through to HTTP.
    }
  }

  try {
    const response = await fetchImpl(`${MULTIVIEW_ADDED_LAYOUTS_DOCK_DATA_URL}?_=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return new Set();
    const raw = await response.text();
    return parseAddedLayoutIds(raw);
  } catch {
    return new Set();
  }
}

export async function saveAddedLayoutIdsToDockData(ids: Iterable<unknown>, fetchImpl: FetchLike = fetch): Promise<boolean> {
  const data = serializeAddedLayoutIds(ids);

  if (canUseTauriInvoke()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_dock_data", {
        name: MULTIVIEW_ADDED_LAYOUTS_DOCK_DATA_NAME,
        data,
      });
      return true;
    } catch {
      // Fall through to HTTP so OBS dock/dev server contexts still work.
    }
  }

  try {
    const response = await fetchImpl("/api/save-dock-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: MULTIVIEW_ADDED_LAYOUTS_DOCK_DATA_NAME,
        data,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
