/**
 * Ministry Store — Centralized read-only accessor for ministry data
 *
 * Reads from MVSettings localStorage (the single source of truth).
 * Falls back to fetching from the web API when localStorage is empty
 * (e.g. OBS dock context where localStorage isn't shared with the desktop app).
 * Subscribes to MV_SETTINGS_UPDATED_EVENT to stay current.
 *
 * Used by:
 *  - DockLowerThirdEditor (speaker dropdown, auto-populate)
 *  - runtimeBranding (logo fallback)
 *  - dockObsClient (speaker context)
 *  - SpeakerModule (preview values)
 */

import type { MVSettings, SpeakerProfileSetting } from "../multiview/mvStore";
import { MV_SETTINGS_UPDATED_EVENT } from "../multiview/mvStore";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

export interface MinistryData {
  churchName: string;
  mainPastorName: string;
  mainPastorRole: string;
  speakers: SpeakerProfileSetting[];
  logoPath: string;
  brandColor: string;
}

const EMPTY: MinistryData = {
  churchName: "",
  mainPastorName: "",
  mainPastorRole: "",
  speakers: [],
  logoPath: "",
  brandColor: "#6A34DE",
};

let _cache: MinistryData | null = null;

function readFromStorage(): MinistryData {
  try {
    const raw = localStorage.getItem("mv-settings");
    if (!raw) return EMPTY;
    const s: MVSettings = JSON.parse(raw);

    // Resolve speakers: try structured array first, fall back to legacy pastorNames string
    let speakers = Array.isArray(s.pastorSpeakers)
      ? s.pastorSpeakers.filter((sp) => sp && typeof sp.name === "string" && sp.name.trim())
      : [];
    if (speakers.length === 0 && typeof s.pastorNames === "string" && s.pastorNames.trim()) {
      speakers = s.pastorNames
        .split(/\r?\n|,/)
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => ({ name: n, role: "" }));
    }

    const mainSpeaker = speakers.find((sp) => sp.isMain);
    return {
      churchName: s.churchName || "",
      mainPastorName: s.mainPastorName || mainSpeaker?.name || "",
      mainPastorRole: mainSpeaker?.role || "",
      speakers,
      logoPath: s.brandLogoPath || "",
      brandColor: s.brandColor || "#6A34DE",
    };
  } catch {
    return EMPTY;
  }
}

function refreshCache(): void {
  _cache = readFromStorage();
}

/** Get the current ministry data. Reads from cache if available. */
export function getMinistryData(): MinistryData {
  if (!_cache) refreshCache();
  return _cache!;
}

/** Force-refresh the cache (e.g. after settings change). */
export function refreshMinistry(): void {
  refreshCache();
}

/** Find a speaker by name (case-insensitive). */
export function findSpeakerByName(name: string): SpeakerProfileSetting | undefined {
  const key = name.trim().toLowerCase();
  return getMinistryData().speakers.find(
    (sp) => sp.name.trim().toLowerCase() === key,
  );
}

/** Get the main (designated) pastor. */
export function getMainPastor(): SpeakerProfileSetting | undefined {
  const data = getMinistryData();
  return data.speakers.find((sp) => sp.isMain);
}

/**
 * Build a name→role lookup map for all speakers.
 * Useful for resolving speaker names to their roles in theme values.
 */
export function buildSpeakerRoleMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const sp of getMinistryData().speakers) {
    if (sp.name.trim()) {
      map.set(sp.name.trim().toLowerCase(), sp.role || "");
    }
  }
  return map;
}

/**
 * Fetch ministry data from the local overlay server JSON files.
 * syncSpeakersToDock() writes speakers to /uploads/dock-speakers.json
 * syncBrandingToDock() writes branding to /uploads/dock-branding.json
 * Works in both Tauri and OBS dock contexts (no auth required).
 */
async function fetchFromOverlayServer(): Promise<MinistryData | null> {
  try {
    const [speakersRes, brandingRes] = await Promise.all([
      fetch(`/uploads/dock-speakers.json?_=${Date.now()}`, { cache: "no-store" }),
      fetch(`/uploads/dock-branding.json?_=${Date.now()}`, { cache: "no-store" }),
    ]);

    if (!speakersRes.ok && !brandingRes.ok) return null;

    let speakers: SpeakerProfileSetting[] = [];
    if (speakersRes.ok) {
      const raw = await speakersRes.json();
      if (Array.isArray(raw)) {
        speakers = raw
          .filter((s: unknown): s is SpeakerProfileSetting =>
            s !== null && typeof s === "object" && "name" in s &&
            typeof (s as Record<string, unknown>).name === "string" &&
            String((s as Record<string, unknown>).name).trim() !== "",
          )
          .map((s: SpeakerProfileSetting) => ({
            name: s.name.trim(),
            role: (s.role || "").trim(),
            isMain: s.isMain,
          }));
      }
    }

    let churchName = "";
    let logoPath = "";
    let brandColor = "#6A34DE";
    if (brandingRes.ok) {
      const branding = await brandingRes.json();
      if (branding && typeof branding === "object") {
        churchName = branding.churchName || "";
        brandColor = branding.brandColor || "#6A34DE";
        const logoFileName = branding.brandLogoFileName || "";
        if (logoFileName) logoPath = `/uploads/${encodeURIComponent(logoFileName)}`;
      }
    }

    const mainSpeaker = speakers.find((sp) => sp.isMain);
    return {
      churchName,
      mainPastorName: mainSpeaker?.name || "",
      mainPastorRole: mainSpeaker?.role || "",
      speakers,
      logoPath,
      brandColor,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch church profile from the web API using deviceId.
 * Used as a last resort when overlay server data isn't available.
 */
async function fetchFromWebApi(): Promise<MinistryData | null> {
  try {
    const params = new URLSearchParams(window.location.search);
    const deviceId = params.get("deviceId");
    if (!deviceId) return null;

    const res = await fetch(`${API_BASE}/api/device/church-profile`, {
      headers: { "X-Device-Id": deviceId },
    });
    if (!res.ok) return null;

    const profile = await res.json();
    if (!profile) return null;

    const speakers: SpeakerProfileSetting[] = Array.isArray(profile.speakers)
      ? profile.speakers
        .filter((s: { name?: string }) => s && typeof s.name === "string" && s.name.trim())
        .map((s: { name: string; role?: string; isMain?: boolean }) => ({
          name: s.name.trim(),
          role: (s.role || "").trim(),
          isMain: s.isMain,
        }))
      : [];

    const mainSpeaker = speakers.find((s) => s.isMain);
    return {
      churchName: profile.churchName || "",
      mainPastorName: mainSpeaker?.name || "",
      mainPastorRole: mainSpeaker?.role || "",
      speakers,
      logoPath: profile.branding?.logoUrl || "",
      brandColor: profile.branding?.primaryColor || "#6A34DE",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch ministry data, trying the overlay server first (no auth needed),
 * then falling back to the web API.
 */
export async function fetchFromApi(): Promise<MinistryData | null> {
  const fromOverlay = await fetchFromOverlayServer();
  if (fromOverlay && fromOverlay.speakers.length > 0) return fromOverlay;
  return fetchFromWebApi();
}

/**
 * Ensure ministry data is available. Reads from localStorage first,
 * then falls back to API fetch (for OBS dock context).
 * Returns true if data was fetched from API (caller should re-read).
 */
export async function ensureMinistryData(): Promise<boolean> {
  const current = getMinistryData();
  if (current.speakers.length > 0) return false;

  const fromApi = await fetchFromApi();
  if (fromApi && fromApi.speakers.length > 0) {
    _cache = fromApi;
    return true;
  }
  return false;
}

// ── Auto-refresh on settings changes ──

if (typeof window !== "undefined") {
  window.addEventListener(MV_SETTINGS_UPDATED_EVENT, () => {
    refreshCache();
  });
}
