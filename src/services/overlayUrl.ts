/**
 * overlayUrl.ts — Overlay base URL for OBS browser sources
 *
 * In production, the Tauri app runs a tiny HTTP server on localhost
 * that serves overlay HTML files. OBS browser sources can't access
 * Tauri's internal protocol (tauri:// or https://tauri.localhost),
 * so we need a real localhost URL.
 *
 * In development (Vite dev server), we just use window.location.origin
 * since Vite already serves the public/ files.
 */

import { invoke } from "@tauri-apps/api/core";

let _cachedBaseUrl: string | null = null;
let _lastInvokeAttempt = 0;
const RETRY_COOLDOWN_MS = 2000;

function isLocalOverlayHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost";
}

export function toStoredOverlayAssetUrl(value: string | undefined): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("/uploads/")) return trimmed;
  if (trimmed.startsWith("uploads/")) return `/${trimmed}`;

  try {
    const parsed = new URL(trimmed);
    if (isLocalOverlayHost(parsed.hostname) && parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname;
    }
  } catch {
    // Fall through and return the original value.
  }

  return trimmed;
}

export function resolveOverlayAssetUrl(value: string | undefined): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("/uploads/")) return `${getOverlayBaseUrlSync()}${trimmed}`;
  if (trimmed.startsWith("uploads/")) return `${getOverlayBaseUrlSync()}/${trimmed}`;

  try {
    const parsed = new URL(trimmed);
    if (isLocalOverlayHost(parsed.hostname) && parsed.pathname.startsWith("/uploads/")) {
      return `${getOverlayBaseUrlSync()}${parsed.pathname}`;
    }
  } catch {
    // Not a valid URL — may be a filesystem path.
  }

  // Handle absolute filesystem paths (e.g. /Users/.../uploads/church-logo.png)
  // or file:// URLs by extracting the filename and serving via uploads endpoint.
  let candidate = trimmed;
  if (/^file:\/\//i.test(candidate)) {
    try {
      candidate = decodeURIComponent(candidate.replace(/^file:\/\//i, ""));
    } catch {
      candidate = candidate.replace(/^file:\/\//i, "");
    }
  }

  const fileName = candidate.split(/[\\/]/).pop()?.trim() ?? "";
  if (fileName) {
    return `${getOverlayBaseUrlSync()}/uploads/${encodeURIComponent(fileName)}`;
  }

  return trimmed;
}

/**
 * Get the base URL for overlay HTML files that OBS can access.
 *
 * - Production: http://127.0.0.1:<port> (served by Tauri's embedded HTTP server)
 * - Development: http://localhost:1420 (served by Vite)
 */
export async function getOverlayBaseUrl(): Promise<string> {
  if (_cachedBaseUrl) return _cachedBaseUrl;

  // Cooldown: don't hammer invoke on repeated failures
  const now = Date.now();
  if (now - _lastInvokeAttempt < RETRY_COOLDOWN_MS) {
    return _cachedBaseUrl || window.location.origin;
  }
  _lastInvokeAttempt = now;

  try {
    const port = await invoke<number>("get_overlay_port");
    if (port > 0) {
      _cachedBaseUrl = `http://127.0.0.1:${port}`;
      return _cachedBaseUrl;
    }
  } catch (err) {
    console.warn("[OverlayURL] Failed to get overlay port from Tauri:", err);
  }

  // Return fallback but do NOT cache it — retry on next call.
  // In production Tauri, window.location.origin is "tauri://localhost" which
  // is NOT the same as http://127.0.0.1:{port}, so caching it permanently
  // would break all relay POSTs.
  return window.location.origin;
}

/**
 * Synchronous getter — returns the cached base URL.
 * Returns window.location.origin if not yet resolved.
 * Call getOverlayBaseUrl() first to ensure it's initialized.
 */
export function getOverlayBaseUrlSync(): string {
  return _cachedBaseUrl || window.location.origin;
}

/**
 * Initialize the overlay URL cache. Call this once at app startup.
 */
export async function initOverlayUrl(): Promise<void> {
  await getOverlayBaseUrl();
}
