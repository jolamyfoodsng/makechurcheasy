import type { PresentationSessionSettings } from "../presentation/types";

export interface PresentationSettings extends PresentationSessionSettings {}

const STORAGE_KEY = "presentation-settings";
const FRIENDLY_TOKEN_BASE = "mce-service";

function createToken(sequence = 0): string {
  if (sequence <= 0) return FRIENDLY_TOKEN_BASE;
  return `${FRIENDLY_TOKEN_BASE}-${String(sequence).padStart(2, "0")}`;
}

function parseFriendlyTokenSequence(value: string): number {
  if (value === FRIENDLY_TOKEN_BASE) return 0;
  const match = value.match(new RegExp(`^${FRIENDLY_TOKEN_BASE}-(\\d+)$`));
  return match ? Math.max(0, Number(match[1])) : 0;
}

function normalizeToken(value: string | undefined): string {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return createToken();
  if (!trimmed.startsWith("mce-")) return createToken();
  return trimmed
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "") || createToken();
}

function normalizeDate(value: string | undefined, fallback: string): string {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizePresentationLink(value: string | undefined, publicToken: string): string {
  const trimmed = String(value || "").trim();
  if (trimmed) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        const pathToken = parsed.pathname.match(/^\/p\/([^/]+)$/i)?.[1];
        const queryToken = parsed.searchParams.get("sessionId");
        if (pathToken === encodeURIComponent(publicToken) || queryToken === publicToken) {
          return trimmed;
        }
        return buildPresentationLink(publicToken, parsed.origin);
      }
    } catch {
      // Fall through to the current-origin fallback.
    }
  }
  return buildPresentationLink(publicToken);
}

function isLocalHttpOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol.startsWith("http");
  } catch {
    return false;
  }
}

function getFallbackOrigin(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1";
  }

  if (isLocalHttpOrigin(window.location.origin)) {
    return window.location.origin.replace(/\/$/, "");
  }

  return "http://127.0.0.1";
}

function coerceSettings(saved?: Partial<PresentationSettings> | null): PresentationSettings {
  const now = new Date().toISOString();
  const publicToken = normalizeToken(saved?.publicToken || saved?.sessionId);
  const createdAt = normalizeDate(saved?.createdAt, now);
  const updatedAt = normalizeDate(saved?.updatedAt, createdAt);

  return {
    sessionId: publicToken,
    publicToken,
    presentationLink: normalizePresentationLink(saved?.presentationLink, publicToken),
    connectedViewers: Number.isFinite(saved?.connectedViewers)
      ? Math.max(0, Math.floor(Number(saved?.connectedViewers)))
      : 0,
    status: saved?.status === "ended" ? "ended" : "active",
    createdAt,
    updatedAt,
  };
}

export function buildPresentationLink(publicToken: string, origin = getFallbackOrigin()): string {
  const cleanOrigin = origin.replace(/\/$/, "");
  return `${cleanOrigin}/p/${encodeURIComponent(publicToken)}`;
}

export function getPresentationSettings(): PresentationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return coerceSettings();
    }
    return coerceSettings(JSON.parse(raw) as Partial<PresentationSettings>);
  } catch {
    return coerceSettings();
  }
}

export function savePresentationSettings(settings: PresentationSettings): void {
  try {
    const normalized = coerceSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore localStorage failures.
  }
}

export function updatePresentationSettings(
  patch: Partial<PresentationSettings>,
): PresentationSettings {
  const current = getPresentationSettings();
  const updated = coerceSettings({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  savePresentationSettings(updated);
  return updated;
}

export function regenerateSession(): PresentationSettings {
  const current = getPresentationSettings();
  const now = new Date().toISOString();
  const nextToken = createToken(parseFriendlyTokenSequence(current.publicToken || current.sessionId) + 1);
  const updated = coerceSettings({
    ...current,
    sessionId: nextToken,
    publicToken: nextToken,
    connectedViewers: 0,
    status: "active",
    updatedAt: now,
  });
  savePresentationSettings(updated);
  return updated;
}
