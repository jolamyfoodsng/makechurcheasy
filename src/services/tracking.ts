/**
 * tracking.ts — Backend event tracking for the desktop app.
 *
 * Sends usage events to the web backend (MongoDB) for admin analytics.
 * This is separate from the Cloudflare analytics (anonymous telemetry).
 * This tracks per-user actions for the admin dashboard.
 *
 * Privacy: Only sends event name, userId, and non-sensitive metadata.
 * Never sends Bible content, lyrics, transcript text, or personal info.
 */

import {
  getDeviceId,
  getDeviceSecret,
  getSession,
  getSessionApiBase,
} from "./authService";

const FIRST_PRESENTATION_KEY = "mce_first_presentation_done";
const FIRST_APP_OPEN_KEY = "mce_first_app_open_done";

let trialActivationAttempted = false;

function isFirstPresentationDone(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(FIRST_PRESENTATION_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function markFirstPresentationDone(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(FIRST_PRESENTATION_KEY, "true");
    }
  } catch {}
}

/**
 * Background async capture and upload of OBS screenshot on first presentation.
 * Silently catches errors — never interrupts presentation or blocks UI.
 */
async function captureAndUploadFirstPresentationScreenshot(
  type: "bible" | "worship" | "media",
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    // Settle delay for OBS to render overlay frame
    await new Promise((r) => setTimeout(r, 650));
    const { dockObsClient } = await import("../dock/dockObsClient");
    const screenshot = await dockObsClient.captureScreenshot();
    if (!screenshot) return;

    const session = getSession();
    const userId =
      session?.user?.id ||
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("mce-dock-auth-user-id") ||
          localStorage.getItem("mce_auth_user_id")
        : null) ||
      null;
    const deviceId =
      getDeviceId() ||
      session?.deviceId ||
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("mce-device-id")
        : null) ||
      null;
    const deviceSecret = getDeviceSecret() || session?.deviceSecret || null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (deviceId) headers["X-Device-Id"] = deviceId;
    if (deviceSecret) headers["X-Device-Secret"] = deviceSecret;

    const apiBase = getSessionApiBase();
    if (!apiBase) return;

    await fetch(`${apiBase}/api/tracking/first-presentation-screenshot`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        screenshot,
        type,
        details,
        userId,
      }),
    });
  } catch (err) {
    console.warn("[tracking] First presentation screenshot capture error:", err);
  }
}

// ── Core ───────────────────────────────────────────────────────────────────

/**
 * Send a tracking event to the backend. Fire-and-forget.
 * Silently fails — never blocks or errors in the UI.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  const session = getSession();
  const userId =
    session?.user?.id ||
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("mce-dock-auth-user-id") ||
        localStorage.getItem("mce_auth_user_id")
      : null) ||
    null;
  const deviceId =
    getDeviceId() ||
    session?.deviceId ||
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("mce-device-id")
      : null) ||
    null;
  const deviceSecret = getDeviceSecret() || session?.deviceSecret || null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (deviceId) headers["X-Device-Id"] = deviceId;
  if (deviceSecret) headers["X-Device-Secret"] = deviceSecret;

  const apiBase = getSessionApiBase();
  if (!apiBase) return;

  void fetch(`${apiBase}/api/tracking/event`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event,
      userId,
      properties: properties || {},
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => {
    // Tracking should never break the app
  });
}

function activateTrial(
  event: "obs_connected" | "first_use_started" | "first_presentation" | "first_use",
): void {
  if (event === "first_presentation" && isFirstPresentationDone()) {
    return;
  }
  if (trialActivationAttempted) return;
  const session = getSession();
  const deviceId =
    getDeviceId() ||
    session?.deviceId ||
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("mce-device-id")
      : null) ||
    null;
  const userId =
    session?.user?.id ||
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("mce-dock-auth-user-id") ||
        localStorage.getItem("mce_auth_user_id")
      : null);
  if (!userId || !deviceId) return;
  trialActivationAttempted = true;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
  };
  const deviceSecret = getDeviceSecret() || session?.deviceSecret;
  if (deviceSecret) headers["X-Device-Secret"] = deviceSecret;

  const apiBase = getSessionApiBase();
  if (!apiBase) return;

  void fetch(`${apiBase}/api/trial/activate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {
    // Trial activation is retried by the next app session if the request fails.
    trialActivationAttempted = false;
  });
}

// ── Auth Events ────────────────────────────────────────────────────────────

export function trackSignup(method: string = "unknown"): void {
  trackEvent("user_signup", { method });
}

export function trackLogin(method: string = "unknown"): void {
  trackEvent("user_login", { method });
}

export function trackDevicePaired(): void {
  trackEvent("device_paired");
}

// ── Bible Events ───────────────────────────────────────────────────────────

export function trackBibleSearch(version?: string): void {
  trackEvent("bible_search", { version });
}

export function trackBiblePresent(
  params?:
    | string
    | {
        ref?: string;
        translation?: string;
        overlayMode?: "fullscreen" | "lower-third";
        book?: string;
        chapter?: number;
        verse?: number;
        verseRange?: string;
      },
): void {
  const isObject = typeof params === "object" && params !== null;
  const ref = isObject ? params.ref : params;
  const translation = isObject ? params.translation : undefined;
  const overlayMode = isObject ? params.overlayMode : undefined;
  const book = isObject ? params.book : undefined;
  const chapter = isObject ? params.chapter : undefined;
  const verse = isObject ? params.verse : undefined;
  const verseRange = isObject ? params.verseRange : undefined;

  trackEvent("bible_present", {
    hasRef: Boolean(ref),
    ref: ref || "",
    translation: translation || "",
    overlayMode: overlayMode || "fullscreen",
    book: book || "",
    chapter: chapter || undefined,
    verse: verse || undefined,
    verseRange: verseRange || "",
  });

  if (!isFirstPresentationDone()) {
    activateTrial("first_presentation");
    markFirstPresentationDone();
    void captureAndUploadFirstPresentationScreenshot("bible", {
      ref: ref || "",
      translation: translation || "",
      overlayMode: overlayMode || "fullscreen",
    });
  }
}

// ── Worship Events ─────────────────────────────────────────────────────────

export function trackWorshipSongCreated(): void {
  trackEvent("worship_song_created");
}

export function trackWorshipSongImported(): void {
  trackEvent("worship_song_imported");
}

export function trackWorshipSongPresented(
  params?:
    | string
    | {
        songTitle?: string;
        overlayMode?: "fullscreen" | "lower-third";
        hasLyrics?: boolean;
      },
): void {
  const isObject = typeof params === "object" && params !== null;
  const songTitle = isObject
    ? params.songTitle
    : typeof params === "string"
      ? params
      : undefined;
  const overlayMode = isObject ? params.overlayMode : undefined;
  const hasLyrics = isObject ? params.hasLyrics : true;

  trackEvent("worship_song_presented", {
    songTitle: songTitle || "",
    overlayMode: overlayMode || "fullscreen",
    hasLyrics: Boolean(hasLyrics),
  });

  if (!isFirstPresentationDone()) {
    activateTrial("first_presentation");
    markFirstPresentationDone();
    void captureAndUploadFirstPresentationScreenshot("worship", {
      songTitle: songTitle || "",
      overlayMode: overlayMode || "fullscreen",
    });
  }
}

// ── Media Events ───────────────────────────────────────────────────────────

export function trackMediaUploaded(type: string = "unknown"): void {
  trackEvent("media_uploaded", { type });
}

export function trackMediaPresented(
  params?:
    | string
    | {
        type?: string;
        mediaName?: string;
      },
): void {
  const isObject = typeof params === "object" && params !== null;
  const type = isObject
    ? params.type
    : typeof params === "string"
      ? params
      : "unknown";
  const mediaName = isObject ? params.mediaName : undefined;

  trackEvent("media_presented", {
    type: type || "unknown",
    mediaName: mediaName || "",
  });

  if (!isFirstPresentationDone()) {
    activateTrial("first_presentation");
    markFirstPresentationDone();
    void captureAndUploadFirstPresentationScreenshot("media", {
      type: type || "unknown",
      mediaName: mediaName || "",
    });
  }
}

// ── Mode Switch Events ─────────────────────────────────────────────────────

export function trackOverlayModeSwitched(
  module: "bible" | "worship" | "notes" | "sermon" | string,
  mode: "fullscreen" | "lower-third",
): void {
  trackEvent("overlay_mode_switched", { module, mode });
}

// ── Voice / Transcription Events ───────────────────────────────────────────

export function trackVoiceSessionStarted(): void {
  trackEvent("voice_session_started");
}

export function trackVoiceSessionCompleted(durationSeconds: number): void {
  trackEvent("voice_session_completed", { durationSeconds });
}

export function trackTranscriptCreated(wordCount: number): void {
  trackEvent("transcript_created", { wordCount });
}

export function trackTranscriptExported(format: string): void {
  trackEvent("transcript_exported", { format });
}

export function trackTranslationGenerated(
  wordCount: number,
  targetLang?: string,
): void {
  trackEvent("translation_generated", { wordCount, targetLang });
  activateTrial("first_use");
}

// ── Theme Events ───────────────────────────────────────────────────────────

export function trackThemeCreated(type: string): void {
  trackEvent("theme_created", { type });
}

export function trackThemeApplied(type: string): void {
  trackEvent("theme_applied", { type });
}

// ── App Lifecycle ──────────────────────────────────────────────────────────

export function trackFirstAppOpen(properties?: Record<string, unknown>): void {
  try {
    if (typeof localStorage !== "undefined") {
      if (localStorage.getItem(FIRST_APP_OPEN_KEY) === "true") return;
      localStorage.setItem(FIRST_APP_OPEN_KEY, "true");
    }
  } catch {}
  trackEvent("first_app_open", properties);
}

export function trackAppStarted(extraProps?: Record<string, unknown>): void {
  trackFirstAppOpen(extraProps);
  trackEvent("app_started", extraProps);
}

export function trackAppClosed(sessionDurationSeconds: number): void {
  trackEvent("app_closed", { sessionDurationSeconds });
}

export function trackObsConnected(): void {
  trackEvent("obs_connected");
  activateTrial("obs_connected");
}

export function trackFirstUseStarted(): void {
  trackEvent("first_use_started");
  activateTrial("first_use_started");
}

export function trackStsPushToLive(): void {
  trackEvent("sts_push_to_live");
  activateTrial("first_use");
}
