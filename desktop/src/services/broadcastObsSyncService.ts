/**
 * broadcastObsSyncService.ts — Connect and Sync Broadcast Profiles & Channels with OBS Studio.
 *
 * Ensures OBS WebSocket is connected first before applying stream service settings.
 * If disconnected, it proactively attempts to connect to OBS Studio and reports clear,
 * user-friendly progress and error messages without obscure technical jargon.
 */

import { dockObsClient } from "../dock/dockObsClient";
import { ADMIN_FEATURE_OFF_MESSAGES, isAdminFeatureEnabled } from "./desktopConfig";
import {
  type BroadcastChannel,
  type BroadcastPersonProfile,
  type BroadcastStoreState,
  buildObsStreamServiceSettings,
  setActiveChannelForProfile,
} from "./broadcastSettingsService";
import { reportMultistreamError, type ServerMultistreamQuota } from "./broadcastUsageService";
import { getDeviceApiBaseCandidates, getDeviceId, getDeviceSecret } from "./authService";
import {
  type DestinationStatus,
  destinationsFingerprint,
  getCachedCloudIngest,
  getMultistreamTarget,
  saveCachedCloudIngest,
  setMultistreamTarget,
} from "./multistreamState";

export interface ObsSyncResult {
  success: boolean;
  connectedFirst: boolean;
  message: string;
  /** Where OBS now sends the stream: one platform ("direct") or the cloud engine ("cloud"). */
  mode?: "direct" | "cloud";
  /** True when it worked but not fully as asked (e.g. multi-stream fell back to one destination). */
  warning?: boolean;
  /** Per-destination outcome of this sync. */
  destinations?: DestinationStatus[];
  errorCode?: string;
  quota?: Partial<ServerMultistreamQuota>;
}

const OBS_NOT_RUNNING =
  "Could not connect to OBS Studio. Please make sure OBS Studio is open on this computer with WebSocket enabled (in OBS: Tools → WebSocket Server Settings), then try again.";
const LIVE_SWITCH_BLOCKED =
  "You're live right now. Stop the stream before switching where it goes. (Turning destinations on or off for the profile that is live works without stopping.)";
const DEFAULT_INGEST_URL = "rtmps://live.cloudflare.com:443/live/";
const SYNC_TIMEOUT_MS = 20_000;

/** True while OBS is streaming. Clients without stream status (tests) count as not live. */
async function isObsLive(client: { getStreamStatus?: () => Promise<{ outputActive?: boolean } | null | undefined> }): Promise<boolean> {
  if (typeof client.getStreamStatus !== "function") return false;
  try {
    const status = await client.getStreamStatus();
    return Boolean(status?.outputActive);
  } catch {
    return false;
  }
}

/**
 * Proactively verifies or establishes connection to OBS Studio.
 * Returns true if connected, false otherwise.
 */
export async function ensureObsConnected(
  client = dockObsClient,
): Promise<{ connected: boolean; reconnected: boolean; error?: string }> {
  if (client.isConnected) {
    return { connected: true, reconnected: false };
  }

  try {
    await client.connect();
    return { connected: client.isConnected, reconnected: true };
  } catch (err: unknown) {
    const errorMsg = (err as { message?: string })?.message || "Connection refused";
    console.warn("[BroadcastObsSync] Failed to connect to OBS Studio WebSocket:", errorMsg);
    return { connected: false, reconnected: false, error: errorMsg };
  }
}

/**
 * Syncs a specific broadcast channel's stream key and server into OBS Studio.
 * Proactively connects to OBS first if not already connected.
 */
export async function syncChannelToObs(
  channel: BroadcastChannel,
  profileNickname?: string,
  client = dockObsClient,
  profileId?: string,
): Promise<ObsSyncResult> {
  if (!channel.streamKey.trim()) {
    return {
      success: false,
      connectedFirst: false,
      message: `Stream key for "${channel.name}" is empty. Please enter your stream key first.`,
    };
  }

  const connResult = await ensureObsConnected(client);
  if (!connResult.connected) {
    return {
      success: false,
      connectedFirst: false,
      message:
        "Could not connect to OBS Studio. Please make sure OBS Studio is open on this computer with WebSocket enabled (in OBS: Tools → WebSocket Server Settings), then try again.",
    };
  }

  if (await isObsLive(client)) {
    const current = getMultistreamTarget();
    const alreadyThere = current?.mode === "direct" && current.channelIds.length === 1 && current.channelIds[0] === channel.id;
    return alreadyThere
      ? { success: true, connectedFirst: connResult.reconnected, mode: "direct", message: `Already live on ${channel.name}.` }
      : { success: false, connectedFirst: connResult.reconnected, errorCode: "LIVE", message: LIVE_SWITCH_BLOCKED };
  }

  try {
    const payload = buildObsStreamServiceSettings(channel);
    await client.setStreamServiceSettings(
      payload.streamServiceType,
      payload.streamServiceSettings,
    );

    if (profileId) {
      try {
        setActiveChannelForProfile(profileId, channel.id);
      } catch {
        // Ignored
      }
    }

    setMultistreamTarget({
      mode: "direct",
      profileId: profileId || "",
      profileName: profileNickname || channel.name,
      channelIds: [channel.id],
      destinations: [{ id: channel.id, name: channel.name, platform: channel.platform, ok: true }],
      syncedAt: Date.now(),
    });

    const targetLabel = profileNickname
      ? `${profileNickname} (${channel.name})`
      : channel.name;

    return {
      success: true,
      connectedFirst: connResult.reconnected,
      mode: "direct",
      message: connResult.reconnected
        ? `Connected to OBS! Stream settings updated for ${targetLabel}.`
        : `Synced stream settings to OBS for ${targetLabel}!`,
    };
  } catch (err: unknown) {
    console.error("[BroadcastObsSync] Failed to set stream service in OBS:", err);
    return {
      success: false,
      connectedFirst: connResult.reconnected,
      message:
        "Connected to OBS, but could not update stream settings. Please check OBS settings and try again.",
    };
  }
}

/** Destinations that will receive the broadcast: switched on and with a stream key. */
export function getDeliveryChannels(profile: BroadcastPersonProfile): BroadcastChannel[] {
  return profile.channels.filter((ch) => ch.enabled !== false && ch.streamKey.trim());
}

function pickPrimaryChannel(profile: BroadcastPersonProfile, channels: BroadcastChannel[]): BroadcastChannel {
  return channels.find((ch) => ch.id === profile.activeChannelId)
    || channels.find((ch) => ch.platform === "youtube")
    || channels[0];
}

type CloudSyncResponse = {
  status: number;
  data: {
    success?: boolean;
    error?: string;
    message?: string;
    ingestUrl?: string;
    streamKey?: string;
    outputsCount?: number;
    results?: DestinationStatus[];
    quota?: Partial<ServerMultistreamQuota>;
  } | null;
};

/** Ask the cloud broadcasting engine (through the Make Church Easy API) to restream this profile. */
async function requestCloudSync(profile: BroadcastPersonProfile, channels: BroadcastChannel[]): Promise<CloudSyncResponse | null> {
  const deviceId = getDeviceId();
  if (!deviceId) return { status: 401, data: { success: false, error: "NOT_SIGNED_IN" } };
  const secret = getDeviceSecret();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
    ...(secret ? { "X-Device-Secret": secret } : {}),
  };
  const payload = JSON.stringify({
    profileId: profile.id,
    profileName: profile.nickname || profile.name,
    channels: channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      platform: ch.platform,
      streamKey: ch.streamKey.trim(),
      serverUrl: ch.serverUrl,
      enabled: true,
    })),
  });

  let last: CloudSyncResponse | null = null;
  for (const apiBase of getDeviceApiBaseCandidates()) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
    try {
      const res = await fetch(`${apiBase}/api/broadcast/sync`, {
        method: "POST",
        headers,
        credentials: "omit",
        signal: controller.signal,
        body: payload,
      });
      const data = (await res.json().catch(() => null)) as CloudSyncResponse["data"];
      last = { status: res.status, data };
      // A real answer (success, or a decision such as plan/hours) — don't ask another server.
      if (res.status < 500 && res.status !== 404) return last;
    } catch {
      // Network problem: try the next configured API endpoint.
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return last;
}

function fallbackReason(code: string | undefined, serverMessage?: string): string {
  switch (code) {
    case "PLAN_REQUIRED":
      return "Multi-streaming is included in Basic, Growth and Pro plans.";
    case "QUOTA_EXHAUSTED":
      return serverMessage || "This month's multi-stream hours are used up.";
    case "NOT_SIGNED_IN":
      return "Sign in to Make Church Easy to multi-stream.";
    case "STREAM_NOT_ENABLED":
    case "MISSING_TOKEN":
      return "Multi-streaming is not available right now.";
    default:
      return "The cloud broadcasting engine could not be reached.";
  }
}

/**
 * Point OBS at the right place for a speaker/minister profile.
 *
 * - One destination → OBS streams straight to that platform (no cloud hop).
 * - Several destinations → OBS streams once to Make Church Easy's cloud broadcasting engine, which
 *   restreams to every destination. Each profile has its own private ingest; destinations are
 *   re-sent on every sync so the engine always matches what is on screen. While live, the
 *   destinations of the profile that is live can be changed without stopping.
 * - If multi-streaming isn't possible (plan, hours, sign-in, engine down without a saved setup),
 *   OBS is pointed at the main destination only and the result says so (warning).
 */
export async function syncProfileToObs(
  profile: BroadcastPersonProfile,
  client = dockObsClient,
  _storeState?: BroadcastStoreState,
): Promise<ObsSyncResult> {
  const deliveryChannels = getDeliveryChannels(profile);
  const label = profile.nickname || profile.name;

  if (deliveryChannels.length === 0) {
    const withKeys = profile.channels.filter((ch) => ch.streamKey.trim());
    if (withKeys.length > 0) {
      return { success: false, connectedFirst: false, errorCode: "NO_ACTIVE_CHANNELS", message: `All destinations for ${label} are switched off. Turn on at least one destination.` };
    }
    const firstChannel = profile.channels[0];
    if (firstChannel) {
      return { success: false, connectedFirst: false, errorCode: "NO_STREAM_KEY", message: `Stream key for "${firstChannel.name}" is empty. Please enter your stream key first.` };
    }
    return { success: false, connectedFirst: false, errorCode: "NO_CHANNELS", message: `No broadcast channels saved for ${label}. Please add a channel first.` };
  }

  const fingerprint = destinationsFingerprint(deliveryChannels);
  const telemetryChannels = deliveryChannels.map((ch) => ({ name: ch.name, platform: ch.platform }));

  const goDirect = async (note?: string, errorCode?: string, quota?: Partial<ServerMultistreamQuota>): Promise<ObsSyncResult> => {
    const primary = pickPrimaryChannel(profile, deliveryChannels);
    const res = await syncChannelToObs(primary, label, client, profile.id);
    const destinations: DestinationStatus[] = deliveryChannels.map((ch) => ch.id === primary.id
      ? { id: ch.id, name: ch.name, platform: ch.platform, ok: res.success, ...(res.success ? {} : { reason: "OBS could not be updated." }) }
      : { id: ch.id, name: ch.name, platform: ch.platform, ok: false, reason: note || "Not included in this broadcast." });
    if (res.success) {
      setMultistreamTarget({
        mode: "direct",
        profileId: profile.id,
        profileName: label,
        channelIds: [primary.id],
        destinations,
        fingerprint,
        note,
        syncedAt: Date.now(),
      });
    }
    if (!note) return { ...res, mode: "direct", destinations };
    return {
      ...res,
      mode: "direct",
      warning: res.success,
      errorCode: res.success ? errorCode : res.errorCode,
      quota,
      destinations,
      message: res.success ? `${note} OBS will stream to ${primary.name} only.` : res.message,
    };
  };

  // 1. One destination: stream straight to it.
  if (deliveryChannels.length === 1) {
    return goDirect();
  }

  // Admin switched multistream off: stream to the main destination only.
  if (!isAdminFeatureEnabled("multistream")) {
    return goDirect(ADMIN_FEATURE_OFF_MESSAGES.multistream, "MULTISTREAM_DISABLED");
  }

  // 2. Several destinations: OBS must be reachable before anything is set up.
  const connResult = await ensureObsConnected(client);
  if (!connResult.connected) {
    void reportMultistreamError({ stage: "obs_connect", code: "OBS_CONNECT_FAILED", message: "Could not connect to OBS while preparing multi-streaming.", profileName: label, channels: telemetryChannels });
    return { success: false, connectedFirst: false, errorCode: "OBS_NOT_CONNECTED", message: OBS_NOT_RUNNING };
  }

  // While live, only the profile already going through the cloud engine can be updated in place.
  const live = await isObsLive(client);
  const current = getMultistreamTarget();
  const liveCloudSameProfile = live && current?.mode === "cloud" && current.profileId === profile.id;
  if (live && !liveCloudSameProfile) {
    return { success: false, connectedFirst: connResult.reconnected, errorCode: "LIVE", message: LIVE_SWITCH_BLOCKED };
  }

  const response = await requestCloudSync(profile, deliveryChannels);
  const data = response?.data || null;

  const applyCloud = async (
    ingestUrl: string,
    streamKey: string,
    destinations: DestinationStatus[],
    message: string,
    warning = false,
    quota?: Partial<ServerMultistreamQuota>,
  ): Promise<ObsSyncResult> => {
    if (!liveCloudSameProfile) {
      try {
        await client.setStreamServiceSettings("rtmp_custom", { server: ingestUrl, key: streamKey, use_auth: false });
      } catch (err) {
        console.error("[BroadcastObsSync] Failed to set cloud stream service in OBS:", err);
        return { success: false, connectedFirst: connResult.reconnected, errorCode: "OBS_UPDATE_FAILED", destinations, message: "Connected to OBS, but could not update stream settings. Please check OBS settings and try again." };
      }
    }
    setMultistreamTarget({
      mode: "cloud",
      profileId: profile.id,
      profileName: label,
      channelIds: destinations.filter((d) => d.ok).map((d) => d.id),
      destinations,
      fingerprint,
      syncedAt: Date.now(),
    });
    return { success: true, connectedFirst: connResult.reconnected, mode: "cloud", warning, destinations, quota, message };
  };

  // 2a. Engine is ready.
  if (data?.success && data.streamKey) {
    const ingestUrl = data.ingestUrl || DEFAULT_INGEST_URL;
    saveCachedCloudIngest(profile.id, { fingerprint, ingestUrl, streamKey: data.streamKey, savedAt: Date.now() });
    const results: DestinationStatus[] = deliveryChannels.map((ch) => {
      const r = data.results?.find((x) => x.id === ch.id);
      return r
        ? { id: ch.id, name: ch.name, platform: ch.platform, ok: r.ok, ...(r.reason ? { reason: r.reason } : {}) }
        : { id: ch.id, name: ch.name, platform: ch.platform, ok: true };
    });
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      void reportMultistreamError({ stage: "cloud_outputs", code: "SOME_DESTINATIONS_FAILED", message: `${failed.length} destination(s) could not be added.`, profileName: label, channels: failed.map((f) => ({ name: f.name, platform: f.platform })) });
    }
    const prefix = liveCloudSameProfile ? "Destinations updated while live" : `Multi-streaming ready for ${label}`;
    const message = failed.length === 0
      ? `${prefix}: ${ok.length} destinations (${ok.map((r) => r.name).join(", ")}).`
      : `${prefix}: ${ok.length} of ${results.length} destinations. Not included: ${failed.map((f) => f.name).join(", ")}.`;
    return applyCloud(ingestUrl, data.streamKey, results, message, failed.length > 0, data.quota);
  }

  const code = data?.error || (response ? `HTTP_${response.status}` : "SYNC_REQUEST_FAILED");
  void reportMultistreamError({ stage: "cloud_setup", code, message: "Could not prepare the selected destinations for multi-streaming.", profileName: label, channels: telemetryChannels });

  // Live and the engine said no: leave OBS alone, the current broadcast keeps going.
  if (liveCloudSameProfile) {
    return { success: false, connectedFirst: connResult.reconnected, errorCode: code, quota: data?.quota, message: `${data?.message || fallbackReason(code)} Your live stream is unchanged.` };
  }

  // 2b. Problems with the destinations themselves: tell the user, leave OBS alone.
  if (code === "NO_OUTPUTS" || code === "NO_ACTIVE_CHANNELS" || code === "TOO_MANY_PROFILES" || code === "INVALID_PAYLOAD") {
    const results: DestinationStatus[] = deliveryChannels.map((ch) => {
      const r = data?.results?.find((x) => x.id === ch.id);
      return { id: ch.id, name: ch.name, platform: ch.platform, ok: false, reason: r?.reason || "Could not be added." };
    });
    return { success: false, connectedFirst: connResult.reconnected, errorCode: code, destinations: results, message: data?.message || "None of the destinations could be added. Check the stream keys and server addresses." };
  }

  // 2c. Account decisions (plan / hours / sign-in / not available): main destination only.
  if (code === "PLAN_REQUIRED" || code === "QUOTA_EXHAUSTED" || code === "NOT_SIGNED_IN" || code === "STREAM_NOT_ENABLED" || code === "MISSING_TOKEN") {
    return goDirect(fallbackReason(code, data?.message), code, data?.quota);
  }

  // 2d. Engine unreachable: reuse this profile's last working setup if the destinations are unchanged.
  const cached = getCachedCloudIngest(profile.id, fingerprint);
  if (cached) {
    const results: DestinationStatus[] = deliveryChannels.map((ch) => ({ id: ch.id, name: ch.name, platform: ch.platform, ok: true }));
    return applyCloud(
      cached.ingestUrl,
      cached.streamKey,
      results,
      `Could not reach the cloud broadcasting engine, so the last working multi-stream setup for ${label} was used (${results.length} destinations).`,
      true,
    );
  }

  return goDirect(fallbackReason(code), code);
}
