/**
 * speechCredential.ts — what the desktop uses to open the live speech stream.
 *
 * Release builds do NOT contain an AssemblyAI API key. Each time listening starts
 * (and on every reconnect) the app asks the MakeChurchEazy API for a one-minute
 * token. The API checks the plan, credits and daily limits first, so a cracked
 * app can't get speech access it hasn't earned, and a token pulled out of the
 * app is useless seconds later.
 *
 * The credential string is handed to the native streamer:
 *   "token:<token>"  → sent as the `token` URL parameter
 *   anything else    → treated as a raw API key (local development only)
 *   "https://…"      → a Cloudflare transcription endpoint
 */

import { getDeviceApiBaseCandidates, getDeviceId, getDeviceSecret } from "./authService";

const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

export const SPEECH_TOKEN_PREFIX = "token:";

/** The server said this account may not use speech right now (limit, plan, credits…). */
export class SpeechAccessDeniedError extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message || speechDeniedMessage(reason));
    this.name = "SpeechAccessDeniedError";
    this.reason = reason;
  }
}

export function speechDeniedMessage(reason: string): string {
  switch (reason) {
    case "daily_speech_limit":
      return "You've reached today's Verse AI limit. It resets tomorrow.";
    case "weekly_speech_limit":
      return "You've reached this week's Verse AI limit.";
    case "insufficient_credits":
    case "TRANSCRIPTION_CREDITS_EXHAUSTED":
      return "You're out of credits for Verse AI.";
    case "feature_not_available":
      return "Verse AI isn't included in your plan.";
    case "feature_disabled":
      return "Verse AI is paused for maintenance. Please try again later.";
    case "subscription_expired":
    case "trial_expired":
      return "Your plan has ended, so Verse AI is unavailable.";
    case "account_suspended":
      return "This account is restricted.";
    case "device_not_found":
    case "device_revoked":
      return "This computer is no longer connected to your account. Please sign in again.";
    default:
      return "Verse AI isn't available right now.";
  }
}

interface CheckAccessResponse {
  allowed?: boolean;
  reason?: string;
  message?: string;
  streamingToken?: string;
}

/** Local development may use a key from .env. Release builds never contain it. */
function developmentKey(): string {
  if (!import.meta.env.DEV) return "";
  // Written as a plain `import.meta.env.NAME` so the production build's define
  // (vite.config.ts) replaces it with an empty string and the key is never compiled in.
  const keys = String(import.meta.env.VITE_ASSEMBLYAI_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return keys.length ? keys[Math.floor(Math.random() * keys.length)] : "";
}

async function requestToken(): Promise<string> {
  const deviceId = getDeviceId();
  if (!deviceId) throw new SpeechAccessDeniedError("device_not_found");

  let lastError: unknown = null;
  for (const apiBase of getDeviceApiBaseCandidates()) {
    try {
      const res = await fetch(
        `${apiBase.replace(/\/+$/, "")}/api/device/speech-to-scripture/check-access?deviceId=${encodeURIComponent(deviceId)}&issueToken=1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-App-Version": APP_VERSION,
            "X-Device-Secret": getDeviceSecret() || "",
          },
          cache: "no-store",
        },
      );
      const data = (await res.json().catch(() => ({}))) as CheckAccessResponse;

      if (data.allowed && typeof data.streamingToken === "string" && data.streamingToken) {
        return `${SPEECH_TOKEN_PREFIX}${data.streamingToken}`;
      }
      // A clear "no" from the server is final; only outages are retried / fall back.
      if (data.allowed === false && data.reason && data.reason !== "server_error") {
        throw new SpeechAccessDeniedError(data.reason, data.message);
      }
      lastError = new Error(data.message || `Speech service unavailable (${res.status})`);
    } catch (err) {
      if (err instanceof SpeechAccessDeniedError) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not reach the speech service.");
}

/** Credential string for `start_assemblyai_stream`. Throws if speech isn't available. */
export async function getSpeechCredential(): Promise<string> {
  const devKey = developmentKey();
  if (devKey) return devKey;

  try {
    return await requestToken();
  } catch (err) {
    if (err instanceof SpeechAccessDeniedError) throw err;
    // Service outage: fall back to the Cloudflare transcriber when one is configured.
    const cloudflare = String(import.meta.env.VITE_CLOUDFLARE_STT_URL ?? "").trim();
    if (cloudflare) {
      console.warn("[speechCredential] Token request failed; using the Cloudflare transcriber.", err);
      return cloudflare;
    }
    throw err;
  }
}
