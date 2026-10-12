/**
 * Church Profile Sync — Web → Desktop
 *
 * Fetches the church profile from the web API and maps it to the
 * desktop's MVSettings localStorage. Called when the user opens
 * the Branding tab in Settings.
 *
 * Web is the source of truth. Each sync overwrites the local
 * branding fields with the web values.
 */

import { getSettings, updateSettings } from "../multiview/mvStore";
import { getSession, initAuthStore } from "./authService";
import { contactFromProfile } from "./churchProfileMapping";
import { applyInterfaceLanguagePreference } from "./interfaceLanguage";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheazy.com";

interface ChurchBranding {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  faviconUrl: string;
}

interface ChurchSpeaker {
  name: string;
  role: string;
  imageUrl?: string;
  isMain?: boolean;
}

interface ChurchProfile {
  churchName: string;
  tagline?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  socialMedia?: Record<string, string> | null;
  updatedAt?: string;
  branding: ChurchBranding;
  speakers: ChurchSpeaker[];
  presentationDefaults?: {
    language?: string;
  };
}

export interface SyncResult {
  success: boolean;
  message: string;
  profileFound: boolean;
}

export interface SyncOptions {
  /**
   * Skip the work (image downloads, settings writes) when the profile has not
   * changed since the last sync. Used by the background refresh.
   */
  onlyIfChanged?: boolean;
}

let _syncing = false;

/**
 * Fetch the church profile from the web API and update local settings.
 * Always overwrites local branding fields with the web values (web = source of truth).
 *
 * Tries the device-authenticated endpoint first, then falls back to
 * the regular userId-based endpoint.
 */
export async function syncChurchProfile(options: SyncOptions = {}): Promise<SyncResult> {
  if (_syncing) return { success: false, message: "Sync already in progress", profileFound: false };
  _syncing = true;

  try {
    // Ensure auth store has finished initializing before reading session
    await initAuthStore();

    const session = getSession();
    if (!session?.user?.id) {
      console.warn("[churchProfileSync] No session — skipping sync");
      return { success: false, message: "Not signed in. Please sign in first.", profileFound: false };
    }

    const userId = session.user.id;

    // Try device-authenticated endpoint first
    let profile: ChurchProfile | null = null;

    if (session.deviceId) {
      try {
        const res = await fetch(`${API_BASE}/api/device/church-profile`, {
          headers: {
            "X-User-Id": userId,
            "X-Device-Id": session.deviceId,
          },
        });


        if (res.ok) {
          profile = await res.json();
        }
      } catch (err) {
        console.warn("[churchProfileSync] Device endpoint failed, trying fallback:", err);
      }
    }

    // Fallback: regular userId-based endpoint (with device auth header)
    if (!profile) {
      try {
        const res = await fetch(`${API_BASE}/api/church-profile?userId=${encodeURIComponent(userId)}`, {
          headers: session.deviceId ? { "X-Device-Id": session.deviceId } : {},
        });


        if (res.ok) {
          profile = await res.json();
        }
      } catch (err) {
        console.warn("[churchProfileSync] Fallback endpoint also failed:", err);
      }
    }

    if (!profile) {
      console.warn("[churchProfileSync] No profile found from either endpoint");
      return { success: false, message: "No church profile found. Create one in the web dashboard first.", profileFound: false };
    }


    if (
      options.onlyIfChanged
      && profile.updatedAt
      && profile.updatedAt === getSettings().churchProfileUpdatedAt
    ) {
      return { success: true, message: "Profile is already up to date.", profileFound: true };
    }

    const contact = contactFromProfile(profile);
    const patch: Record<string, unknown> = {
      // Web is the source of truth, so overwrite even with empty values.
      churchName: profile.churchName || "",
      churchWebsite: contact.website,
      churchPhone: contact.phone,
      churchEmail: contact.email,
      churchTagline: contact.tagline,
      churchAddress: contact.address,
      churchCity: contact.city,
      churchCountry: contact.country,
      churchSocials: contact.socials,
      churchProfileUpdatedAt: profile.updatedAt || "",
      brandColor: profile.branding?.primaryColor || "",
      brandSecondaryColor: profile.branding?.secondaryColor || "",
      brandAccentColor: profile.branding?.accentColor || "",
      brandFontFamily: profile.branding?.fontFamily || "",
      brandFaviconUrl: profile.branding?.faviconUrl || "",
    };

    const syncedSpeakers = await Promise.all(
      (Array.isArray(profile.speakers) ? profile.speakers : []).map(async (speaker, index) => ({
        name: speaker.name,
        role: speaker.role,
        isMain: speaker.isMain,
        imageUrl: speaker.imageUrl
          ? await downloadImageToDisk(
            speaker.imageUrl,
            `speaker-${index + 1}-${speaker.name || "profile"}`,
          ) || speaker.imageUrl
          : "",
      })),
    );

    patch.pastorSpeakers = syncedSpeakers;
    patch.pastorNames = syncedSpeakers.map((speaker) => speaker.name).filter(Boolean).join("\n");
    patch.mainPastorName = syncedSpeakers.find((speaker) => speaker.isMain)?.name || "";

    if (profile.presentationDefaults?.language) {
      await applyInterfaceLanguagePreference(profile.presentationDefaults.language, {
        country: profile.country,
        broadcast: true,
      });
    }

    // Logo — download URL to disk via existing save_upload_file Tauri command
    patch.brandLogoPath = profile.branding?.logoUrl
      ? (await downloadImageToDisk(profile.branding.logoUrl, "church-logo")) || ""
      : "";

    if (Object.keys(patch).length > 0) {
      updateSettings(patch);
      return { success: true, message: "Profile synced successfully.", profileFound: true };
    } else {
      return { success: true, message: "Profile is already up to date.", profileFound: true };
    }
  } catch (err) {
    console.error("[churchProfileSync] Sync failed:", err);
    return { success: false, message: `Sync failed: ${err instanceof Error ? err.message : "Unknown error"}`, profileFound: false };
  } finally {
    _syncing = false;
  }
}

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_REFRESH_MIN_GAP_MS = 60 * 1000;
let _autoRefreshStarted = false;
let _lastAutoRefreshAt = 0;

/**
 * Keeps the local church details in step with the website while the app stays
 * open: checks every few minutes and whenever the window comes back to the
 * front. A profile that has not changed costs one small request and nothing
 * else. Safe to call more than once.
 */
export function startChurchProfileAutoRefresh(): void {
  if (_autoRefreshStarted || typeof window === "undefined") return;
  _autoRefreshStarted = true;

  const run = () => {
    const now = Date.now();
    if (now - _lastAutoRefreshAt < AUTO_REFRESH_MIN_GAP_MS) return;
    _lastAutoRefreshAt = now;
    void syncChurchProfile({ onlyIfChanged: true }).catch(() => { /* best-effort */ });
  };

  window.setInterval(run, AUTO_REFRESH_INTERVAL_MS);
  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
}

/**
 * Download an image from a URL and save it to the app's uploads directory
 * using the existing save_upload_file Tauri command.
 * Returns the absolute file path on disk, or null on failure.
 */
async function downloadImageToDisk(url: string, fileStem: string): Promise<string | null> {
  try {
    // Handle relative URLs (e.g. /uploads/logo-xxx.jpeg) by prepending the API base
    const absoluteUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
    const res = await fetch(absoluteUrl);
    if (!res.ok) {
      console.warn("[churchProfileSync] Logo download HTTP", res.status);
      return null;
    }

    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Derive filename from URL, default to png when no extension is present.
    const urlPath = new URL(absoluteUrl).pathname;
    const ext = urlPath.split(".").pop()?.split("?")[0] || "png";
    const safeStem = fileStem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "image";
    const fileName = `${safeStem}.${ext}`;

    const { invoke } = await import("@tauri-apps/api/core");
    const savedPath: string = await invoke("save_upload_file", {
      fileName,
      fileData: Array.from(data),
    });

    return savedPath || null;
  } catch (err) {
    console.warn("[churchProfileSync] Image download failed:", err);
    return null;
  }
}
