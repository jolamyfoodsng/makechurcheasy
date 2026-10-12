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
import { contactFromProfile, socialsFromProfile } from "./churchProfileMapping";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheazy.com";

export interface MinistryData {
  churchName: string;
  mainPastorName: string;
  mainPastorRole: string;
  speakers: SpeakerProfileSetting[];
  logoPath: string;
  brandColor: string;
  /** Details from the website church profile. Empty when the church has not filled them in. */
  website?: string;
  phone?: string;
  email?: string;
  tagline?: string;
  address?: string;
  city?: string;
  /** Social links by lower-third icon key (facebook, instagram, youtube, x, tiktok, whatsapp, telegram, threads). */
  socials?: Record<string, string>;
}

/** Fired (on window) when church details were loaded from the web and changed. */
export const MINISTRY_DATA_UPDATED_EVENT = "mce-ministry-updated";

const EMPTY: MinistryData = {
  churchName: "",
  mainPastorName: "",
  mainPastorRole: "",
  speakers: [],
  logoPath: "",
  brandColor: "#6A34DE",
  website: "",
  phone: "",
  email: "",
  tagline: "",
  address: "",
  city: "",
  socials: {},
};

let _cache: MinistryData | null = null;

// ── What the church details used to be ──
// A lower-third box that was filled in from the church profile still holds the
// old value after the profile changes. Remembering the last few values lets a
// box that was never edited by hand follow the profile.

const LAST_KEY = "mce-ministry-last";
const HISTORY_KEY = "mce-ministry-history";
const HISTORY_MAX = 6;

/** The parts of the church details that end up as lower-third text. */
function churchFingerprint(d: MinistryData): string {
  return JSON.stringify([
    d.churchName, d.mainPastorName, d.mainPastorRole,
    d.website ?? "", d.phone ?? "", d.email ?? "", d.tagline ?? "", d.address ?? "", d.city ?? "",
    d.socials ?? {},
  ]);
}

function hasChurchContent(d: MinistryData): boolean {
  return Boolean(
    d.churchName || d.mainPastorName || d.website || d.phone || d.email || d.tagline || d.address ||
    (d.socials && Object.keys(d.socials).length > 0),
  );
}

function snapshotOf(d: MinistryData): MinistryData {
  return { ...d, speakers: [], logoPath: "" };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable or full: history is best-effort
  }
}

/** Earlier church details (newest first), for refreshing boxes that still hold an old value. */
export function getMinistryHistory(): MinistryData[] {
  const list = readJson<MinistryData[]>(HISTORY_KEY);
  return Array.isArray(list) ? list : [];
}

/**
 * Makes `next` the current church details. When they differ from what was
 * current before, the old details are kept in the history.
 * Returns true when the church details changed.
 */
function commitMinistry(next: MinistryData): boolean {
  if (!hasChurchContent(next)) {
    // Nothing to remember (for example an OBS dock with no data yet).
    _cache = next;
    return false;
  }
  const last = _cache && hasChurchContent(_cache) ? _cache : readJson<MinistryData>(LAST_KEY);
  const changed = !last || churchFingerprint(last) !== churchFingerprint(next);
  if (last && changed && hasChurchContent(last)) {
    const key = churchFingerprint(last);
    const history = getMinistryHistory().filter((h) => churchFingerprint(h) !== key);
    history.unshift(snapshotOf(last));
    writeJson(HISTORY_KEY, history.slice(0, HISTORY_MAX));
  }
  if (changed) writeJson(LAST_KEY, snapshotOf(next));
  _cache = next;
  return changed;
}

function readFromStorage(): MinistryData {
  try {
    const raw = localStorage.getItem("mv-settings");
    if (!raw) return EMPTY;
    const s: MVSettings = JSON.parse(raw);

    // Resolve speakers: try structured array first, fall back to legacy pastorNames string
    let speakers = Array.isArray(s.pastorSpeakers)
      ? s.pastorSpeakers
        .filter((sp) => sp && typeof sp.name === "string" && sp.name.trim())
        .map((sp) => ({
          name: sp.name.trim(),
          role: (sp.role || "").trim(),
          imageUrl: (sp.imageUrl || "").trim(),
          isMain: sp.isMain,
        }))
      : [];
    if (speakers.length === 0 && typeof s.pastorNames === "string" && s.pastorNames.trim()) {
      speakers = s.pastorNames
        .split(/\r?\n|,/)
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => ({ name: n, role: "", imageUrl: "", isMain: false }));
    }

    const mainSpeaker = speakers.find((sp) => sp.isMain);
    return {
      churchName: s.churchName || "",
      mainPastorName: s.mainPastorName || mainSpeaker?.name || "",
      mainPastorRole: mainSpeaker?.role || "",
      speakers,
      logoPath: s.brandLogoPath || "",
      brandColor: s.brandColor || "#6A34DE",
      website: s.churchWebsite || "",
      phone: s.churchPhone || "",
      email: s.churchEmail || "",
      tagline: s.churchTagline || "",
      address: s.churchAddress || "",
      city: s.churchCity || "",
      socials: s.churchSocials && typeof s.churchSocials === "object" ? s.churchSocials : {},
    };
  } catch {
    return EMPTY;
  }
}

/** True in the desktop app, which keeps the church details in its settings; false in the OBS dock. */
function hasStorageSettings(): boolean {
  try {
    return localStorage.getItem("mv-settings") !== null;
  } catch {
    return false;
  }
}

function refreshCache(): void {
  // The OBS dock has no settings of its own: keep what it fetched from the web.
  if (!hasStorageSettings() && _cache && hasChurchContent(_cache)) return;
  commitMinistry(readFromStorage());
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
            imageUrl: (s.imageUrl || "").trim(),
            isMain: s.isMain,
          }));
      }
    }

    let churchName = "";
    let logoPath = "";
    let brandColor = "#6A34DE";
    let contact = contactFromProfile(null);
    if (brandingRes.ok) {
      const branding = await brandingRes.json();
      if (branding && typeof branding === "object") {
        churchName = branding.churchName || "";
        brandColor = branding.brandColor || "#6A34DE";
        const logoFileName = branding.brandLogoFileName || "";
        if (logoFileName) logoPath = `/uploads/${encodeURIComponent(logoFileName)}`;
        const info = branding.churchInfo;
        if (info && typeof info === "object") {
          // dock-branding.json already holds icon keys, so map the links straight through.
          contact = { ...contactFromProfile(info), socials: socialsFromProfile(info.socials) };
        }
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
      website: contact.website,
      phone: contact.phone,
      email: contact.email,
      tagline: contact.tagline,
      address: contact.address,
      city: contact.city,
      socials: contact.socials,
    };
  } catch {
    return null;
  }
}

async function getDockDeviceId(): Promise<string | null> {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("deviceId")?.trim();
    if (fromUrl) return fromUrl;
  } catch {
    // ignore URL parsing failures
  }

  try {
    const res = await fetch("/api/auth/status", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const fromSession = data.deviceId != null ? String(data.deviceId).trim() : "";
    return fromSession || null;
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
    const deviceId = await getDockDeviceId();
    if (!deviceId) return null;

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/device/church-profile`, {
        headers: { "X-Device-Id": deviceId },
        cache: "no-store",
        signal: controller?.signal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res.ok) return null;

    const profile = await res.json();
    if (!profile) return null;

    const speakers: SpeakerProfileSetting[] = Array.isArray(profile.speakers)
      ? profile.speakers
        .filter((s: { name?: string }) => s && typeof s.name === "string" && s.name.trim())
        .map((s: { name: string; role?: string; imageUrl?: string; isMain?: boolean }) => ({
          name: s.name.trim(),
          role: (s.role || "").trim(),
          imageUrl: typeof s.imageUrl === "string" ? s.imageUrl.trim() : "",
          isMain: s.isMain,
        }))
      : [];

    const mainSpeaker = speakers.find((s) => s.isMain);
    const contact = contactFromProfile(profile);
    return {
      churchName: profile.churchName || "",
      mainPastorName: mainSpeaker?.name || "",
      mainPastorRole: mainSpeaker?.role || "",
      speakers,
      logoPath: profile.branding?.logoUrl || "",
      brandColor: profile.branding?.primaryColor || "#6A34DE",
      website: contact.website,
      phone: contact.phone,
      email: contact.email,
      tagline: contact.tagline,
      address: contact.address,
      city: contact.city,
      socials: contact.socials,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch ministry data from the overlay server (no auth needed, works offline)
 * and the web API. The website is the newest source for the church details, so
 * it wins when it answers; the overlay copy supplies the downloaded logo path.
 */
export async function fetchFromApi(): Promise<MinistryData | null> {
  const [overlay, web] = await Promise.all([fetchFromOverlayServer(), fetchFromWebApi()]);
  if (!overlay) return web;
  if (!web) return overlay;
  return {
    ...web,
    logoPath: overlay.logoPath || web.logoPath,
    brandColor: overlay.brandColor || web.brandColor,
  };
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
    commitMinistry(fromApi);
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

// ── Church details for graphics (church name, pastor, website, phone, socials …) ──

let _lastRefreshAt = 0;
let _refreshRequest: Promise<boolean> | null = null;
/** The dock asks again at most this often; a forced refresh ignores it. */
const REFRESH_MIN_INTERVAL_MS = 60_000;

/**
 * Brings the church details up to date for graphics.
 *
 * The desktop app keeps its own copy (churchProfileSync); this is for the OBS
 * dock, which has none, so it asks the overlay server and the website. It can
 * be called as often as you like: lookups are spaced out and share one request.
 * Resolves true when the details changed, so the caller can read them again
 * (a MINISTRY_DATA_UPDATED_EVENT is fired as well). Never throws.
 */
export function refreshChurchInfo(options: { force?: boolean } = {}): Promise<boolean> {
  // The desktop app has its own copy in settings, kept current by churchProfileSync.
  if (hasChurchContent(readFromStorage())) return Promise.resolve(false);
  if (_refreshRequest) return _refreshRequest;
  if (!options.force && Date.now() - _lastRefreshAt < REFRESH_MIN_INTERVAL_MS) return Promise.resolve(false);
  _lastRefreshAt = Date.now();

  _refreshRequest = (async () => {
    try {
      const fetched = await fetchFromApi();
      if (!fetched) return false;
      if (!hasChurchContent(fetched) && fetched.speakers.length === 0) return false;
      const changed = commitMinistry(fetched);
      if (changed && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(MINISTRY_DATA_UPDATED_EVENT));
      }
      return changed;
    } catch {
      return false;
    } finally {
      _refreshRequest = null;
    }
  })();
  return _refreshRequest;
}

/** Same as refreshChurchInfo(); kept for existing callers. */
export function ensureChurchInfo(): Promise<boolean> {
  return refreshChurchInfo();
}
