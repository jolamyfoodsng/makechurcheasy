/**
 * multistreamState.ts — What OBS is currently pointed at, shared by the app and the OBS dock.
 *
 * - "target": the last successful sync (direct to one platform, or through the cloud engine),
 *   with a per-destination outcome so the UI can show exactly where the stream will go.
 * - "ingest cache": the last working cloud ingest per profile, used only when the engine
 *   can't be reached and the profile's destinations haven't changed since.
 *
 * Stream keys are never stored here in plain text; destinations are compared with a hash.
 */

import { readNativeDockSetting, writeNativeDockSetting } from "./localDockSettings";
import type { BroadcastChannel } from "./broadcastSettingsService";

export interface DestinationStatus {
  id: string;
  name: string;
  platform: string;
  ok: boolean;
  reason?: string;
}

export interface MultistreamTarget {
  mode: "direct" | "cloud";
  profileId: string;
  profileName: string;
  /** Destinations actually receiving the stream. */
  channelIds: string[];
  destinations: DestinationStatus[];
  /** Hash of the profile's switched-on destinations at sync time. */
  fingerprint?: string;
  /** Why fewer destinations than asked (e.g. plan / hours). */
  note?: string;
  syncedAt: number;
}

export interface CachedCloudIngest {
  fingerprint: string;
  ingestUrl: string;
  streamKey: string;
  savedAt: number;
}

export const MULTISTREAM_TARGET_KEY = "ocs-dock-multistream-target-v1";
export const MULTISTREAM_INGEST_CACHE_KEY = "ocs-dock-multistream-ingest-v1";
export const MULTISTREAM_TARGET_EVENT = "mce-multistream-target-updated";
const INGEST_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function hash(value: string): string {
  // FNV-1a — enough to notice a changed key without keeping the key itself.
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Order-independent fingerprint of the destinations that will receive the stream. */
export function destinationsFingerprint(channels: Pick<BroadcastChannel, "id" | "platform" | "serverUrl" | "streamKey">[]): string {
  return hash(
    channels
      .map((ch) => `${ch.id}|${ch.platform}|${(ch.serverUrl || "").trim()}|${ch.streamKey.trim()}`)
      .sort()
      .join("\n"),
  );
}

function readJson<T>(key: string): T | null {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    }
  } catch {
    // fall through to native settings
  }
  try {
    return (readNativeDockSetting<T>(key) as T | undefined) ?? null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
  try {
    writeNativeDockSetting(key, value);
  } catch {
    // ignore
  }
}

export function getMultistreamTarget(): MultistreamTarget | null {
  const target = readJson<MultistreamTarget>(MULTISTREAM_TARGET_KEY);
  return target && typeof target.profileId === "string" ? target : null;
}

export function setMultistreamTarget(target: MultistreamTarget): void {
  writeJson(MULTISTREAM_TARGET_KEY, target);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(MULTISTREAM_TARGET_EVENT, { detail: target }));
    } catch {
      // ignore
    }
  }
}

export function subscribeMultistreamTarget(callback: (target: MultistreamTarget | null) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onEvent = (e: Event) => callback((e as CustomEvent<MultistreamTarget>).detail ?? getMultistreamTarget());
  const onStorage = (e: StorageEvent) => {
    if (e.key === MULTISTREAM_TARGET_KEY) callback(getMultistreamTarget());
  };
  window.addEventListener(MULTISTREAM_TARGET_EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MULTISTREAM_TARGET_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}

/** True when OBS is set to restream this profile through the cloud engine. */
export function isCloudTargetFor(profileId: string | undefined, target = getMultistreamTarget()): boolean {
  return Boolean(profileId && target && target.mode === "cloud" && target.profileId === profileId);
}

/**
 * "applied" — OBS matches the profile's current destinations.
 * "changed" — destinations were edited/switched since the last sync.
 * "none" — this profile was never sent to OBS.
 */
export function getTargetFreshness(
  profileId: string | undefined,
  deliveryChannels: Pick<BroadcastChannel, "id" | "platform" | "serverUrl" | "streamKey">[],
  target = getMultistreamTarget(),
): "applied" | "changed" | "none" {
  if (!profileId || !target || target.profileId !== profileId) return "none";
  if (!target.fingerprint) return "applied";
  return target.fingerprint === destinationsFingerprint(deliveryChannels) ? "applied" : "changed";
}

export function getCachedCloudIngest(profileId: string, fingerprint: string): CachedCloudIngest | null {
  const all = readJson<Record<string, CachedCloudIngest>>(MULTISTREAM_INGEST_CACHE_KEY) || {};
  const entry = all[profileId];
  if (!entry || entry.fingerprint !== fingerprint) return null;
  if (Date.now() - entry.savedAt > INGEST_CACHE_MAX_AGE_MS) return null;
  return entry;
}

export function saveCachedCloudIngest(profileId: string, entry: CachedCloudIngest): void {
  const all = readJson<Record<string, CachedCloudIngest>>(MULTISTREAM_INGEST_CACHE_KEY) || {};
  all[profileId] = entry;
  writeJson(MULTISTREAM_INGEST_CACHE_KEY, all);
}
