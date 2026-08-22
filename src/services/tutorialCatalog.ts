import { getEnvConfig } from "./envConfig";
import { readUserScopedStorage, writeUserScopedStorage } from "./userScopedStorage";

export type TutorialRelease = "current" | "legacy";

export interface TutorialVideo {
  videoId: string;
  title: string;
  description: string;
  youtubeUrl: string;
  thumbnailUrl?: string;
  duration?: string;
  tags: string[];
  release: TutorialRelease;
  featured: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface TutorialPlaylist {
  playlistId: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  category: string;
  tags: string[];
  featured: boolean;
  enabled: boolean;
  sortOrder: number;
  videos: TutorialVideo[];
  updatedAt?: string;
}

interface TutorialCatalogCache {
  ts: number;
  playlists: TutorialPlaylist[];
}

export type TutorialProgressStatus = "started" | "completed";

export interface TutorialProgressEntry {
  status: TutorialProgressStatus;
  updatedAt: string;
}

export type TutorialProgress = Record<string, TutorialProgressEntry>;

const CATALOG_CACHE_KEY = "mce.tutorial-catalog.v1";
const PROGRESS_KEY = "ocs-tutorial-progress-v1";
const CACHE_TTL_MS = 2 * 60 * 1000;
const STALE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let memoryCache: TutorialCatalogCache | null = null;
let inFlight: Promise<TutorialPlaylist[]> | null = null;

function apiBaseUrl(): string {
  const config = getEnvConfig();
  return (config.apiBaseUrl || config.authApiUrl || "").replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, maxLength = 4_000): string {
  return typeof value === "string" ? value.slice(0, maxLength).trim() : "";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((tag) => asString(tag, 48)).filter(Boolean).slice(0, 20)
    : [];
}

function normalizeVideo(value: unknown): TutorialVideo | null {
  if (!isRecord(value)) return null;
  const videoId = asString(value.videoId, 120);
  const title = asString(value.title, 180);
  const youtubeUrl = asString(value.youtubeUrl, 1_000);
  if (!videoId || !title || !youtubeUrl) return null;

  return {
    videoId,
    title,
    description: asString(value.description, 1_200),
    youtubeUrl,
    thumbnailUrl: asString(value.thumbnailUrl, 1_000) || undefined,
    duration: asString(value.duration, 40) || undefined,
    tags: asTags(value.tags),
    release: value.release === "legacy" ? "legacy" : "current",
    featured: asBoolean(value.featured, false),
    enabled: asBoolean(value.enabled, true),
    sortOrder: asNumber(value.sortOrder),
  };
}

export function normalizeTutorialCatalog(value: unknown): TutorialPlaylist[] {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.playlists)
      ? value.playlists
      : [];

  return entries
    .map((entry): TutorialPlaylist | null => {
      if (!isRecord(entry)) return null;
      const playlistId = asString(entry.playlistId, 120);
      const title = asString(entry.title, 180);
      if (!playlistId || !title) return null;

      return {
        playlistId,
        title,
        description: asString(entry.description, 1_200),
        thumbnailUrl: asString(entry.thumbnailUrl, 1_000) || undefined,
        category: asString(entry.category, 80) || "General",
        tags: asTags(entry.tags),
        featured: asBoolean(entry.featured, false),
        enabled: asBoolean(entry.enabled, true),
        sortOrder: asNumber(entry.sortOrder),
        videos: (Array.isArray(entry.videos) ? entry.videos : [])
          .map(normalizeVideo)
          .filter((video): video is TutorialVideo => !!video)
          .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title)),
        updatedAt: asString(entry.updatedAt, 100) || undefined,
      };
    })
    .filter((playlist): playlist is TutorialPlaylist => !!playlist)
    .filter((playlist) => playlist.enabled)
    .sort((left, right) => Number(right.featured) - Number(left.featured) || left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));
}

function readCatalogCache(): TutorialCatalogCache | null {
  if (memoryCache) return memoryCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TutorialCatalogCache;
    if (!parsed || typeof parsed.ts !== "number") return null;
    memoryCache = { ts: parsed.ts, playlists: normalizeTutorialCatalog(parsed.playlists) };
    return memoryCache;
  } catch {
    return null;
  }
}

function writeCatalogCache(playlists: TutorialPlaylist[]): void {
  const cache = { ts: Date.now(), playlists };
  memoryCache = cache;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // The live catalogue still works when storage is unavailable.
  }
}

function isFresh(cache: TutorialCatalogCache | null): boolean {
  return !!cache && Date.now() - cache.ts < CACHE_TTL_MS;
}

function isUsableStale(cache: TutorialCatalogCache | null): boolean {
  return !!cache && Date.now() - cache.ts < STALE_TTL_MS;
}

export async function fetchTutorialCatalog(options: { force?: boolean } = {}): Promise<TutorialPlaylist[]> {
  const cache = readCatalogCache();
  if (!options.force && cache && isFresh(cache)) return cache.playlists;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const base = apiBaseUrl();
      if (!base) return cache?.playlists ?? [];
      const response = await fetch(`${base}/api/tutorials`, { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error(`Tutorial catalogue request failed: ${response.status}`);
      const body = await response.json() as { playlists?: unknown };
      const playlists = normalizeTutorialCatalog(body.playlists);
      writeCatalogCache(playlists);
      return playlists;
    } catch (error) {
      console.warn("[tutorialCatalog] Failed to refresh tutorials:", error);
      return cache && isUsableStale(cache) ? cache.playlists : [];
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function getCachedTutorialCatalog(): TutorialPlaylist[] {
  return readCatalogCache()?.playlists ?? [];
}

function normalizeProgress(value: unknown): TutorialProgress {
  if (!isRecord(value)) return {};
  const next: TutorialProgress = {};
  for (const [videoId, entry] of Object.entries(value)) {
    if (!isRecord(entry) || !videoId.trim()) continue;
    const status = entry.status === "completed" ? "completed" : entry.status === "started" ? "started" : null;
    const updatedAt = asString(entry.updatedAt, 100);
    if (!status || !updatedAt) continue;
    next[videoId] = { status, updatedAt };
  }
  return next;
}

export function getTutorialProgress(): TutorialProgress {
  try {
    const raw = readUserScopedStorage(PROGRESS_KEY);
    return raw ? normalizeProgress(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveTutorialProgress(progress: TutorialProgress): TutorialProgress {
  const normalized = normalizeProgress(progress);
  writeUserScopedStorage(PROGRESS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function setTutorialProgressStatus(
  current: TutorialProgress,
  videoId: string,
  status: TutorialProgressStatus,
): TutorialProgress {
  const next = {
    ...current,
    [videoId]: { status, updatedAt: new Date().toISOString() },
  } satisfies TutorialProgress;
  return saveTutorialProgress(next);
}

export function getCurrentTutorialVideos(playlist: TutorialPlaylist): TutorialVideo[] {
  return playlist.videos.filter((video) => video.enabled && video.release === "current");
}

export function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    let videoId = "";
    if (host === "youtu.be") videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      videoId = parsed.searchParams.get("v") || "";
      if (!videoId) {
        const segments = parsed.pathname.split("/").filter(Boolean);
        const embedIndex = segments.findIndex((segment) => segment === "embed" || segment === "shorts" || segment === "live");
        videoId = embedIndex >= 0 ? segments[embedIndex + 1] || "" : "";
      }
    }
    if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
  } catch {
    return null;
  }
}

export function getTutorialProgressSummary(playlist: TutorialPlaylist, progress: TutorialProgress): { completed: number; total: number } {
  const videos = getCurrentTutorialVideos(playlist);
  return {
    completed: videos.filter((video) => progress[video.videoId]?.status === "completed").length,
    total: videos.length,
  };
}
