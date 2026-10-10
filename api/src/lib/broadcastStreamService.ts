/**
 * broadcastStreamService.ts — Cloud broadcasting engine (Cloudflare Stream Live Inputs + Outputs).
 *
 * OBS streams once to a private ingest (a Cloudflare "live input"), and the engine
 * restreams it to every destination (YouTube, Facebook, …) as "live outputs".
 *
 * Every church profile gets its OWN live input. Inputs are never shared between
 * accounts or profiles: the caller passes the id it stored for this profile, and a
 * new input is created only when there is none (or it was deleted on Cloudflare).
 */

export type BroadcastPlatformId = "youtube" | "facebook" | "instagram" | "tiktok" | "kick" | "twitch" | "custom";

export interface BroadcastChannelPayload {
  id: string;
  name: string;
  platform: BroadcastPlatformId;
  streamKey: string;
  serverUrl?: string;
  enabled: boolean;
}

export interface DestinationResult {
  id: string;
  name: string;
  platform: string;
  ok: boolean;
  reason?: string;
}

export interface CloudBroadcastSyncResult {
  success: boolean;
  /** False when the engine itself is unavailable (not configured / not enabled / unreachable). */
  streamEnabled: boolean;
  ingestUrl?: string;
  streamKey?: string;
  liveInputId?: string;
  outputsCount?: number;
  /** Human labels of destinations that are set up, e.g. "Main YouTube (youtube)". */
  destinations?: string[];
  /** Per-destination outcome, keyed by the channel id sent by the app. */
  results?: DestinationResult[];
  message: string;
  error?: string;
}

export interface SyncLiveOutputsParams {
  /** Name stored on the live input, e.g. "MCE · <userId> · <profileId>". */
  inputName: string;
  /** Live input previously created for this profile, if any. */
  liveInputId?: string | null;
  channels: BroadcastChannelPayload[];
}

const DEFAULT_INGEST_URL = "rtmps://live.cloudflare.com:443/live/";
const CF_TIMEOUT_MS = 12_000;

function getAccountId(): string {
  return (
    process.env.CLOUDFLARE_STREAM_ACCOUNT_ID ||
    process.env.R2_ACCOUNT_ID ||
    "5d9285b368f0d67b286dbef11874db16"
  );
}

function getApiToken(): string {
  return process.env.CLOUDFLARE_STREAM_API_TOKEN || "";
}

function isRtmpUrl(value: string): boolean {
  return /^rtmps?:\/\//i.test(value);
}

/**
 * Resolve the RTMP(S) address for a destination.
 * The app may send OBS-style labels ("Primary YouTube ingest server", "auto") instead of URLs.
 */
export function resolvePlatformRtmpUrl(platform: string, serverUrl?: string): string {
  const input = String(serverUrl || "").trim();
  if (isRtmpUrl(input)) return input;
  const lower = input.toLowerCase();

  switch (platform) {
    case "youtube":
      if (lower.includes("backup")) return "rtmps://b.rtmps.youtube.com:443/live2?backup=1";
      return "rtmps://a.rtmps.youtube.com:443/live2";
    case "facebook":
      return "rtmps://live-api-s.facebook.com:443/rtmp/";
    case "instagram":
      return "rtmps://live-upload.instagram.com:443/rtmp/";
    case "tiktok":
      return "rtmps://live-api.tiktok.com:443/live/";
    case "twitch":
      return "rtmp://live.twitch.tv/app/";
    case "kick":
      return "rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/";
    default:
      return "";
  }
}

type CfEnvelope<T> = { success?: boolean; result?: T; errors?: Array<{ code?: number; message?: string }>; messages?: Array<{ message?: string }> };

type CfLiveInput = { uid: string; rtmps?: { url?: string; streamKey?: string }; meta?: { name?: string } };
type CfOutput = { uid: string; url?: string; streamKey?: string; enabled?: boolean };

class CloudflareError extends Error {
  constructor(public status: number, public body: CfEnvelope<unknown> | null) {
    super(body?.errors?.[0]?.message || `Cloudflare request failed (${status})`);
  }
  get notEnabled(): boolean {
    return Boolean(
      this.body?.errors?.some((e) => e.code === 10002) ||
      this.body?.messages?.some((m) => m.message?.toLowerCase().includes("not enabled")),
    );
  }
}

async function cf<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CF_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${getAccountId()}/stream/live_inputs${path}`, {
      method: init.method || "GET",
      headers: { Authorization: `Bearer ${getApiToken().trim()}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
    if (!res.ok || !body?.success) throw new CloudflareError(res.status, body);
    return body.result as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch this profile's live input, or create one. Never falls back to another input. */
async function ensureLiveInput(inputName: string, liveInputId?: string | null): Promise<CfLiveInput> {
  if (liveInputId) {
    try {
      const existing = await cf<CfLiveInput>(`/${encodeURIComponent(liveInputId)}`);
      if (existing?.uid) return existing;
    } catch (err) {
      // 404 → it was deleted on Cloudflare; create a fresh one below. Anything else is a real failure.
      if (!(err instanceof CloudflareError) || err.status !== 404) throw err;
    }
  }
  const created = await cf<CfLiveInput>("", {
    method: "POST",
    body: { meta: { name: inputName.slice(0, 120) }, recording: { mode: "off" } },
  });
  if (created?.uid && !created.rtmps?.streamKey) {
    return cf<CfLiveInput>(`/${encodeURIComponent(created.uid)}`);
  }
  return created;
}

function destinationKey(url: string, streamKey: string): string {
  return `${url.trim()}:::${streamKey.trim()}`;
}

/**
 * Make the engine match the given destinations exactly for one profile:
 * create/reuse its live input, add missing outputs, remove outputs that are no longer wanted.
 */
export async function syncCloudflareLiveOutputs(params: SyncLiveOutputsParams): Promise<CloudBroadcastSyncResult> {
  if (!getApiToken().trim()) {
    return {
      success: false,
      streamEnabled: false,
      message: "The cloud broadcasting engine is not configured on the server.",
      error: "MISSING_TOKEN",
    };
  }

  const wanted = params.channels.filter((ch) => ch.enabled !== false && String(ch.streamKey || "").trim());
  if (wanted.length === 0) {
    return { success: false, streamEnabled: true, message: "No destinations with a stream key were sent.", error: "NO_ACTIVE_CHANNELS" };
  }

  const results: DestinationResult[] = [];
  const targets: Array<{ ch: BroadcastChannelPayload; url: string; key: string }> = [];
  const seen = new Set<string>();
  for (const ch of wanted) {
    const url = resolvePlatformRtmpUrl(ch.platform, ch.serverUrl);
    const key = ch.streamKey.trim();
    const base = { id: ch.id, name: ch.name, platform: ch.platform };
    if (!url) {
      results.push({ ...base, ok: false, reason: "Add the server address (RTMP URL) for this destination." });
      continue;
    }
    const k = destinationKey(url, key);
    if (seen.has(k)) {
      results.push({ ...base, ok: false, reason: "Same stream key as another destination." });
      continue;
    }
    seen.add(k);
    targets.push({ ch, url, key });
  }

  let input: CfLiveInput;
  try {
    input = await ensureLiveInput(params.inputName, params.liveInputId);
  } catch (err) {
    if (err instanceof CloudflareError && err.notEnabled) {
      return { success: false, streamEnabled: false, message: "The cloud broadcasting engine is not activated yet.", error: "STREAM_NOT_ENABLED" };
    }
    console.error("[broadcastStreamService] Could not prepare live input:", err instanceof Error ? err.message : err);
    return { success: false, streamEnabled: false, message: "The cloud broadcasting engine could not be reached.", error: "ENGINE_UNAVAILABLE" };
  }

  const ingestUrl = input.rtmps?.url || DEFAULT_INGEST_URL;
  const streamKey = input.rtmps?.streamKey;
  if (!input.uid || !streamKey) {
    return { success: false, streamEnabled: false, message: "The cloud broadcasting engine did not return an ingest key.", error: "NO_STREAM_KEY" };
  }

  try {
    const outputsPath = `/${encodeURIComponent(input.uid)}/outputs`;
    const existing = (await cf<CfOutput[]>(outputsPath)) || [];
    const wantedKeys = new Set(targets.map((t) => destinationKey(t.url, t.key)));
    const kept = new Map<string, CfOutput>();
    const toDelete: CfOutput[] = [];
    for (const out of existing) {
      const k = destinationKey(String(out.url || ""), String(out.streamKey || ""));
      if (wantedKeys.has(k) && !kept.has(k)) kept.set(k, out);
      else if (out.uid) toDelete.push(out);
    }

    await Promise.all(toDelete.map((out) => cf(`${outputsPath}/${encodeURIComponent(out.uid)}`, { method: "DELETE" }).catch(() => null)));

    const setupResults = await Promise.all(targets.map(async ({ ch, url, key }): Promise<DestinationResult> => {
      const base = { id: ch.id, name: ch.name, platform: ch.platform };
      const current = kept.get(destinationKey(url, key));
      try {
        if (current) {
          if (current.enabled === false) {
            await cf(`${outputsPath}/${encodeURIComponent(current.uid)}`, { method: "PUT", body: { enabled: true } });
          }
          return { ...base, ok: true };
        }
        await cf(outputsPath, { method: "POST", body: { url, streamKey: key, enabled: true } });
        return { ...base, ok: true };
      } catch (err) {
        const reason = err instanceof CloudflareError && err.body?.errors?.[0]?.message
          ? `Rejected: ${err.body.errors[0].message}`
          : "Could not be added. Check the server address and stream key.";
        return { ...base, ok: false, reason };
      }
    }));
    results.push(...setupResults);
  } catch (err) {
    console.error("[broadcastStreamService] Could not update destinations:", err instanceof Error ? err.message : err);
    return { success: false, streamEnabled: false, liveInputId: input.uid, message: "The cloud broadcasting engine could not be reached.", error: "ENGINE_UNAVAILABLE" };
  }

  // Keep the app's order.
  const ordered = wanted.map((ch) => results.find((r) => r.id === ch.id)!).filter(Boolean);
  const ok = ordered.filter((r) => r.ok);
  if (ok.length === 0) {
    return {
      success: false,
      streamEnabled: true,
      liveInputId: input.uid,
      results: ordered,
      message: "None of the destinations could be added. Check the stream keys and server addresses.",
      error: "NO_OUTPUTS",
    };
  }

  return {
    success: true,
    streamEnabled: true,
    ingestUrl,
    streamKey,
    liveInputId: input.uid,
    outputsCount: ok.length,
    destinations: ok.map((r) => `${r.name} (${r.platform})`),
    results: ordered,
    message: `Cloud broadcasting engine ready for ${ok.length} destination${ok.length === 1 ? "" : "s"}.`,
  };
}
