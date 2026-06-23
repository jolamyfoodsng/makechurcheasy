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

import { getSession } from "./authService";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://web-tayo-akosiles-projects.vercel.app";

// ── Core ───────────────────────────────────────────────────────────────────

/**
 * Send a tracking event to the backend. Fire-and-forget.
 * Silently fails — never blocks or errors in the UI.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  // Skip tracking in local/dev contexts — Vercel API blocks CORS from localhost/127.0.0.1
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return;

  const session = getSession();
  const userId = session?.user?.id || null;

  void fetch(`${API_BASE}/api/tracking/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export function trackBiblePresent(ref?: string): void {
  // Don't send the verse text, just that something was presented
  trackEvent("bible_present", { hasRef: !!ref });
}

// ── Worship Events ─────────────────────────────────────────────────────────

export function trackWorshipSongCreated(): void {
  trackEvent("worship_song_created");
}

export function trackWorshipSongImported(): void {
  trackEvent("worship_song_imported");
}

export function trackWorshipSongPresented(): void {
  trackEvent("worship_song_presented");
}

// ── Media Events ───────────────────────────────────────────────────────────

export function trackMediaUploaded(type: string = "unknown"): void {
  trackEvent("media_uploaded", { type });
}

export function trackMediaPresented(type: string = "unknown"): void {
  trackEvent("media_presented", { type });
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

export function trackTranslationGenerated(wordCount: number, targetLang?: string): void {
  trackEvent("translation_generated", { wordCount, targetLang });
}

// ── Theme Events ───────────────────────────────────────────────────────────

export function trackThemeCreated(type: string): void {
  trackEvent("theme_created", { type });
}

export function trackThemeApplied(type: string): void {
  trackEvent("theme_applied", { type });
}

// ── App Lifecycle ──────────────────────────────────────────────────────────

export function trackAppStarted(): void {
  trackEvent("app_started");
}

export function trackAppClosed(sessionDurationSeconds: number): void {
  trackEvent("app_closed", { sessionDurationSeconds });
}

export function trackObsConnected(): void {
  trackEvent("obs_connected");
}
