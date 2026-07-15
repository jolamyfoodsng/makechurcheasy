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
const DEFAULT_TAURI_OVERLAY_BASE_URL = "http://127.0.0.1:45678";
const DEV_VITE_PORT = "1420";

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

  if (typeof window !== "undefined" && window.location?.origin) {
    const { protocol, hostname, port, origin } = window.location;
    const isHttpLocalOrigin =
      (protocol === "http:" || protocol === "https:")
      && (hostname === "localhost" || hostname === "127.0.0.1");
    if (isHttpLocalOrigin && port === DEV_VITE_PORT) {
      _cachedBaseUrl = origin;
      return _cachedBaseUrl;
    }
  }

  // Cooldown: don't hammer invoke on repeated failures
  const now = Date.now();
  if (now - _lastInvokeAttempt < RETRY_COOLDOWN_MS) {
    return getOverlayBaseUrlSync();
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

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 750);
    try {
      const response = await fetch(`${DEFAULT_TAURI_OVERLAY_BASE_URL}/mce-bible-overlay.html`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        _cachedBaseUrl = DEFAULT_TAURI_OVERLAY_BASE_URL;
        return _cachedBaseUrl;
      }
    } finally {
      window.clearTimeout(timeout);
    }
  } catch {
    // Fall through to origin fallback for pure browser development.
  }

  // Last-resort fallback:
  // - Vite dev page should keep using its own origin.
  // - Desktop/Tauri should never emit a bare localhost origin into OBS
  //   because that produces broken browser-source URLs such as
  //   http://localhost/mce-bible-overlay.html with no port.
  return getOverlayBaseUrlSync();
}

/**
 * Synchronous getter — returns the cached base URL.
 * Returns window.location.origin if not yet resolved.
 * Call getOverlayBaseUrl() first to ensure it's initialized.
 */
export function getOverlayBaseUrlSync(): string {
  if (_cachedBaseUrl) return _cachedBaseUrl;
  if (typeof window !== "undefined" && window.location?.origin) {
    const { protocol, hostname, port } = window.location;
    const isHttpLocalOrigin =
      (protocol === "http:" || protocol === "https:")
      && (hostname === "localhost" || hostname === "127.0.0.1");
    if (isHttpLocalOrigin) {
      if (port === DEV_VITE_PORT) {
        return window.location.origin;
      }
      return DEFAULT_TAURI_OVERLAY_BASE_URL;
    }
    if (protocol === "tauri:") {
      return DEFAULT_TAURI_OVERLAY_BASE_URL;
    }
  }
  return DEFAULT_TAURI_OVERLAY_BASE_URL;
}

/**
 * Initialize the overlay URL cache. Call this once at app startup.
 */
export async function initOverlayUrl(): Promise<void> {
  await getOverlayBaseUrl();
}
