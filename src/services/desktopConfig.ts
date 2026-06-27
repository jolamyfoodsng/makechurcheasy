/**
 * desktopConfig.ts — Fetches desktop-specific platform configuration from the API.
 *
 * Follows the same caching pattern as planConfig.ts:
 * - Serves from cache if fresh (5 min TTL)
 * - Stale-while-revalidate: serves cache, refreshes in background
 * - Falls back to DEFAULT_DESKTOP_CONFIG when offline
 * - Deduplicates concurrent fetches via module-level promise
 */

import { DEFAULT_DESKTOP_CONFIG, type DesktopConfig } from "./desktopConfigTypes";

// Re-export for backward compatibility
export type { DesktopConfig };
export { DEFAULT_DESKTOP_CONFIG };

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";
const CACHE_KEY = "mce_desktop_config";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Cache helpers ────────────────────────────────────────────────────────────

interface CacheEntry {
  config: DesktopConfig;
  fetchedAt: number;
}

function readCache(): DesktopConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS * 10) return null; // expired after 50 min
    return entry.config;
  } catch {
    return null;
  }
}

/**
 * Synchronous cache reader. Returns cached config or null.
 * Used by modules that need config synchronously (e.g., entitlement checks).
 */
export function readDesktopConfigCache(): DesktopConfig | null {
  return readCache();
}

function writeCache(config: DesktopConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ config, fetchedAt: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

// ── Fetch with cache ─────────────────────────────────────────────────────────

let inflight: Promise<DesktopConfig> | null = null;

/**
 * Returns the desktop config. Serves from cache if fresh, otherwise fetches.
 * Concurrent calls are deduplicated via a shared promise.
 */
export async function getDesktopConfig(): Promise<DesktopConfig> {
  const cached = readCache();
  if (cached) {
    refreshInBackground();
    return cached;
  }
  return fetchConfig();
}

async function fetchConfig(): Promise<DesktopConfig> {
  if (inflight) return inflight;
  inflight = doFetch().finally(() => { inflight = null; });
  return inflight;
}

async function doFetch(): Promise<DesktopConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/config/desktop`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.obs && data.storage) {
        writeCache(data);
        return data;
      }
    }
  } catch { /* fall through to default */ }
  return DEFAULT_DESKTOP_CONFIG;
}

function refreshInBackground(): void {
  if (inflight) return;
  inflight = doFetch().finally(() => { inflight = null; });
}

/**
 * Force-refresh: clears cache and fetches fresh data.
 */
export async function refreshDesktopConfig(): Promise<DesktopConfig> {
  localStorage.removeItem(CACHE_KEY);
  return fetchConfig();
}

// ── Sync helpers (read from cache only) ─────────────────────────────────────

/**
 * Synchronous helper to get the default OBS WebSocket URL.
 * Reads from cache; falls back to hardcoded port 4455 if config not yet loaded.
 */
export function getDefaultOBSUrl(): string {
  const cached = readCache();
  const port = cached?.obs.websocketPort ?? DEFAULT_DESKTOP_CONFIG.obs.websocketPort;
  return `ws://localhost:${port}`;
}

/**
 * Synchronous helper to get the default OBS canvas dimensions.
 * Falls back to 1920×1080 if config not yet loaded.
 */
export function getDefaultCanvasSize(): { width: number; height: number } {
  return { width: 1920, height: 1080 };
}

/**
 * Synchronous helper to get the default OBS FPS.
 */
export function getDefaultFPS(): number {
  return 30;
}

/**
 * Synchronous helper to get the default OBS port as a string.
 * Used by OnboardingPage where port is stored as string state.
 */
export function getDefaultOBSPort(): string {
  const cached = readCache();
  return String(cached?.obs.websocketPort ?? DEFAULT_DESKTOP_CONFIG.obs.websocketPort);
}

/**
 * Synchronous helper to get the image compression target size in bytes.
 */
export function getDefaultImageTargetBytes(): number {
  const cached = readCache();
  return cached?.storage.imageTargetSizeBytes ?? DEFAULT_DESKTOP_CONFIG.storage.imageTargetSizeBytes;
}

/**
 * Synchronous helper to get the video compression target size in bytes.
 */
export function getDefaultVideoTargetBytes(): number {
  const cached = readCache();
  return cached?.storage.videoTargetSizeBytes ?? DEFAULT_DESKTOP_CONFIG.storage.videoTargetSizeBytes;
}

/**
 * Synchronous helper to get the image max dimension (width/height cap).
 */
export function getDefaultImageMaxDimension(): number {
  const cached = readCache();
  return cached?.storage.imageMaxDimension ?? DEFAULT_DESKTOP_CONFIG.storage.imageMaxDimension;
}

/**
 * Synchronous helper to get the video max width.
 */
export function getDefaultVideoMaxWidth(): number {
  const cached = readCache();
  return cached?.storage.videoMaxWidth ?? DEFAULT_DESKTOP_CONFIG.storage.videoMaxWidth;
}

/**
 * Synchronous helper to get allowed image extensions.
 */
export function getDefaultImageExtensions(): string[] {
  const cached = readCache();
  return cached?.storage.allowedImageExtensions ?? DEFAULT_DESKTOP_CONFIG.storage.allowedImageExtensions;
}

/**
 * Synchronous helper to get allowed video extensions.
 */
export function getDefaultVideoExtensions(): string[] {
  const cached = readCache();
  return cached?.storage.allowedVideoExtensions ?? DEFAULT_DESKTOP_CONFIG.storage.allowedVideoExtensions;
}

/**
 * Synchronous helper to check if compression is enabled.
 */
export function isCompressionEnabled(): boolean {
  const cached = readCache();
  return cached?.storage.compressionEnabled ?? DEFAULT_DESKTOP_CONFIG.storage.compressionEnabled;
}

// ── Theme sync helpers ──────────────────────────────────────────────────────

/**
 * Synchronous helper to get Bible theme defaults from config.
 */
export function getDefaultBibleTheme() {
  const cached = readCache();
  return cached?.themes.bibleDefaults ?? DEFAULT_DESKTOP_CONFIG.themes.bibleDefaults;
}

/**
 * Synchronous helper to get Worship theme defaults from config.
 */
export function getDefaultWorshipTheme() {
  const cached = readCache();
  return cached?.themes.worshipDefaults ?? DEFAULT_DESKTOP_CONFIG.themes.worshipDefaults;
}

/**
 * Synchronous helper to get Lower Third theme defaults from config.
 */
export function getDefaultLowerThirdTheme() {
  const cached = readCache();
  return cached?.themes.lowerThirdDefaults ?? DEFAULT_DESKTOP_CONFIG.themes.lowerThirdDefaults;
}
