import { getDefaultOBSUrl } from "./desktopConfig";

export function normalizeOBSWebSocketUrl(value?: string | null, fallback = getDefaultOBSUrl()): string {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  if (/^\d{2,5}$/.test(raw)) {
    return `ws://localhost:${raw}`;
  }

  if (/^wss?:\/\//i.test(raw)) {
    return raw;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return raw;
  }

  return `ws://${raw}`;
}

