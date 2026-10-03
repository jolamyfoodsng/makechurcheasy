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

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

let _cachedBaseUrl: string | null = null;
let _overrideBaseUrl: string | null = null;
let _devDockBaseUrl: string | null = null;
let _lanDockBaseUrl: string | null = null;
let _lastInvokeAttempt = 0;
const RETRY_COOLDOWN_MS = 2000;
const DEFAULT_TAURI_OVERLAY_BASE_URL = "http://127.0.0.1:45678";
const DEV_VITE_PORT = "1420";
export const DEV_DOCK_BASE_URL_READY_EVENT = "mce-dev-dock-base-url-ready";
export const DOCK_BASE_URL_READY_EVENT = "mce-dock-base-url-ready";

function isLocalOverlayHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === "127.0.0.1" || normalized === "localhost") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  return false;
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "tauri:" || "__TAURI_INTERNALS__" in window;
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

export function setOverlayBaseUrlOverride(baseUrl: string | null): void {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  _overrideBaseUrl = trimmed || null;
}

/**
 * Get the base URL for overlay HTML files that OBS can access.
 *
 * - Production: http://127.0.0.1:<port> (served by Tauri's embedded HTTP server)
 * - Development: http://localhost:1420 (served by Vite)
 */
export async function getOverlayBaseUrl(): Promise<string> {
  if (_overrideBaseUrl) return _overrideBaseUrl;
  if (_cachedBaseUrl) return _cachedBaseUrl;

  // In Vite dev mode (port 1420), try to resolve the actual overlay server
  // URL from Tauri before falling back to the Vite origin. Uploaded assets
  // are only served by Tauri's overlay HTTP server, not by Vite.
  if (typeof window !== "undefined" && window.location?.origin) {
    const { protocol, hostname, port } = window.location;
    const isHttpLocalOrigin =
      (protocol === "http:" || protocol === "https:")
      && (hostname === "localhost" || hostname === "127.0.0.1");
    if (isHttpLocalOrigin && !isTauriRuntime()) {
      // OBS loads the dock in a normal Chromium/CEF page from the local
      // overlay server. There is no Tauri IPC bridge in that context, and the
      // page origin is already the correct asset server.
      _cachedBaseUrl = window.location.origin;
      return _cachedBaseUrl;
    }
    if (isHttpLocalOrigin && port === DEV_VITE_PORT) {
      const viteFallback = (): string => {
        _cachedBaseUrl = window.location.origin;
        return _cachedBaseUrl;
      };
      try {
        const tauriPort = await invoke<number>("get_overlay_port");
        if (tauriPort > 0) {
          _cachedBaseUrl = `http://127.0.0.1:${tauriPort}`;
          return _cachedBaseUrl;
        }
      } catch {
        return viteFallback();
      }
    }

  }

  // Cooldown: don't hammer invoke on repeated failures
  const now = Date.now();
  if (now - _lastInvokeAttempt < RETRY_COOLDOWN_MS) {
    return getOverlayBaseUrlSync();
  }
  _lastInvokeAttempt = now;

  try {
    if (!isTauriRuntime()) return getOverlayBaseUrlSync();
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
  if (_overrideBaseUrl) return _overrideBaseUrl;
  if (_cachedBaseUrl) return _cachedBaseUrl;
  if (typeof window !== "undefined" && window.location?.origin) {
    const { protocol, hostname } = window.location;
    const isHttpLocalOrigin =
      (protocol === "http:" || protocol === "https:")
      && (hostname === "localhost" || hostname === "127.0.0.1");
    if (isHttpLocalOrigin) {
      return window.location.origin;
    }
    if (protocol === "tauri:") {
      return DEFAULT_TAURI_OVERLAY_BASE_URL;
    }
  }
  return DEFAULT_TAURI_OVERLAY_BASE_URL;
}

interface LanOverlayInfo {
  ip: string;
  port: number;
  baseUrl: string;
}

export async function resolveLanOverlayBaseUrl(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const info = await invoke<LanOverlayInfo>("get_lan_overlay_info", { targetHost: null });
    if (info?.baseUrl && typeof info.baseUrl === "string") {
      const trimmed = info.baseUrl.trim().replace(/\/+$/, "");
      if (trimmed) {
        _lanDockBaseUrl = trimmed;
        _cachedBaseUrl = trimmed;
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(DOCK_BASE_URL_READY_EVENT, { detail: trimmed }));
        }
        return trimmed;
      }
    }
  } catch (err) {
    console.warn("[OverlayURL] Could not resolve host LAN IP from Tauri:", err);
  }
  return null;
}

/**
 * Canonical static Dock base URL.
 * Always 100% static: http://127.0.0.1:45678 in production.
 * - Never changes when moving networks, routers, or connecting to hotspots.
 * - Two laptops on the same Wi-Fi each use their own 127.0.0.1, so they never interfere.
 * - Solves the macOS `localhost` IPv6 bug (ERR_CONNECTION_REFUSED).
 */
export function getDockBaseUrl(): string {
  if (_overrideBaseUrl) return _overrideBaseUrl;
  return DEFAULT_TAURI_OVERLAY_BASE_URL;
}

export function useDockBaseUrl(): string {
  return getDockBaseUrl();
}

/**
 * Dynamic LAN base URL for when OBS is running on a secondary laptop on the same Wi-Fi.
 */
export function useLanDockBaseUrl(): string | null {
  const [lanUrl, setLanUrl] = useState<string | null>(_lanDockBaseUrl);

  useEffect(() => {
    if (_lanDockBaseUrl) {
      setLanUrl(_lanDockBaseUrl);
    }
    if (isTauriRuntime() && !_lanDockBaseUrl) {
      void resolveLanOverlayBaseUrl().then((resolved) => {
        if (resolved) setLanUrl(resolved);
      });
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) setLanUrl(detail);
    };

    window.addEventListener(DOCK_BASE_URL_READY_EVENT, handler);
    return () => {
      window.removeEventListener(DOCK_BASE_URL_READY_EVENT, handler);
    };
  }, []);

  return lanUrl;
}

/**
 * Initialize the overlay URL cache. Call this once at app startup.
 */
export async function initOverlayUrl(): Promise<void> {
  if (import.meta.env.DEV && isTauriRuntime()) {
    try {
      _devDockBaseUrl = await invoke<string>("get_dev_dock_base_url");
      window.dispatchEvent(new Event(DEV_DOCK_BASE_URL_READY_EVENT));
      window.dispatchEvent(new CustomEvent(DOCK_BASE_URL_READY_EVENT, { detail: _devDockBaseUrl }));
    } catch {
      // A pure browser Vite session does not have Tauri IPC; use its origin.
    }
  } else if (isTauriRuntime()) {
    await resolveLanOverlayBaseUrl();
  }
  await getOverlayBaseUrl();
}
