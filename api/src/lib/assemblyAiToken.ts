/**
 * assemblyAiToken.ts — mints short-lived AssemblyAI streaming tokens.
 *
 * The real AssemblyAI API key lives only on the server (ASSEMBLYAI_API_KEY).
 * The desktop asks the API for a token after the plan / credit / daily-limit
 * checks pass, then opens the realtime WebSocket with `?token=...`. A token
 * extracted from the app is useless a minute later; the key is never shipped.
 */

const TOKEN_ENDPOINT = "https://streaming.assemblyai.com/v3/token";

/** How long the token can be used to START a session. */
export const TOKEN_TTL_SECONDS = 60;
/** How long a session opened with the token may last (AssemblyAI maximum is 3 hours). */
export const MAX_SESSION_SECONDS = 3 * 60 * 60;

export interface StreamingToken {
  token: string;
  expiresInSeconds: number;
}

export function buildTokenUrl(ttlSeconds = TOKEN_TTL_SECONDS, maxSessionSeconds = MAX_SESSION_SECONDS): string {
  const params = new URLSearchParams({
    expires_in_seconds: String(ttlSeconds),
    max_session_duration_seconds: String(maxSessionSeconds),
  });
  return `${TOKEN_ENDPOINT}?${params.toString()}`;
}

/** Returns null when the key is not configured or AssemblyAI refuses / is unreachable. */
export async function mintStreamingToken(
  apiKey: string | undefined = process.env.ASSEMBLYAI_API_KEY,
  fetchImpl: typeof fetch = fetch,
): Promise<StreamingToken | null> {
  const key = apiKey?.trim();
  if (!key) {
    console.error("[assemblyAiToken] ASSEMBLYAI_API_KEY is not set on the server.");
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    // A token must never be served from a fetch cache (Next.js caches GETs by default).
    const init: RequestInit & { cache: "no-store" } = {
      method: "GET",
      headers: { Authorization: key },
      signal: controller.signal,
      cache: "no-store",
    };
    const res = await fetchImpl(buildTokenUrl(), init);
    if (!res.ok) {
      console.error("[assemblyAiToken] AssemblyAI token request failed:", res.status);
      return null;
    }
    const data = (await res.json()) as { token?: unknown; expires_in_seconds?: unknown };
    if (typeof data.token !== "string" || !data.token) return null;
    return {
      token: data.token,
      expiresInSeconds: typeof data.expires_in_seconds === "number" ? data.expires_in_seconds : TOKEN_TTL_SECONDS,
    };
  } catch (err) {
    console.error("[assemblyAiToken] AssemblyAI token request error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
