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

import { updateSettings } from "../multiview/mvStore";
import { getSession, initAuthStore } from "./authService";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

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
  isMain?: boolean;
}

interface ChurchProfile {
  churchName: string;
  branding: ChurchBranding;
  speakers: ChurchSpeaker[];
}

export interface SyncResult {
  success: boolean;
  message: string;
  profileFound: boolean;
}

let _syncing = false;

/**
 * Fetch the church profile from the web API and update local settings.
 * Always overwrites local branding fields with the web values (web = source of truth).
 *
 * Tries the device-authenticated endpoint first, then falls back to
 * the regular userId-based endpoint.
 */
export async function syncChurchProfile(): Promise<SyncResult> {
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


    const patch: Record<string, unknown> = {};

    // Church name — always overwrite from web
    if (profile.churchName) {
      patch.churchName = profile.churchName;
    }

    // Brand colors — always overwrite from web
    if (profile.branding?.primaryColor) {
      patch.brandColor = profile.branding.primaryColor;
    }
    if (profile.branding?.secondaryColor) {
      patch.brandSecondaryColor = profile.branding.secondaryColor;
    }
    if (profile.branding?.accentColor) {
      patch.brandAccentColor = profile.branding.accentColor;
    }
    if (profile.branding?.fontFamily) {
      patch.brandFontFamily = profile.branding.fontFamily;
    }
    if (profile.branding?.faviconUrl !== undefined) {
      patch.brandFaviconUrl = profile.branding.faviconUrl;
    }

    // Speakers — always overwrite from web
    if (profile.speakers?.length) {
      patch.pastorSpeakers = profile.speakers.map((s) => ({ name: s.name, role: s.role, isMain: s.isMain }));
      const mainSpeaker = profile.speakers.find((s) => s.isMain);
      patch.mainPastorName = mainSpeaker?.name ?? "";
    }

    // Logo — download URL to disk via existing save_upload_file Tauri command
    if (profile.branding?.logoUrl) {
      const localPath = await downloadLogoToDisk(profile.branding.logoUrl);
      if (localPath) {
        patch.brandLogoPath = localPath;
      }
    }

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

/**
 * Download a logo from a URL and save it to the app's uploads directory
 * using the existing save_upload_file Tauri command.
 * Returns the absolute file path on disk, or null on failure.
 */
async function downloadLogoToDisk(url: string): Promise<string | null> {
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

    // Derive filename from URL, default to church-logo.png
    const urlPath = new URL(absoluteUrl).pathname;
    const ext = urlPath.split(".").pop()?.split("?")[0] || "png";
    const fileName = `church-logo.${ext}`;

    const { invoke } = await import("@tauri-apps/api/core");
    const savedPath: string = await invoke("save_upload_file", {
      fileName,
      fileData: Array.from(data),
    });

    return savedPath || null;
  } catch (err) {
    console.warn("[churchProfileSync] Logo download failed:", err);
    return null;
  }
}
