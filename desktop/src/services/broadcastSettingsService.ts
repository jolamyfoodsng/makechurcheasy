/**
 * broadcastSettingsService.ts — Manage broadcast destinations, profiles, and stream keys.
 *
 * Allows tying multiple social media channels (YouTube, Facebook, Kick, Twitch, etc.)
 * to a specific Person/Profile (e.g. "Senior Pastor", "Pastor Isaac (Guest)", "Youth Church")
 * with a friendly nickname for 1-click switching in Make Church Easy and OBS Studio.
 */

import { readNativeDockSetting, writeNativeDockSetting } from "./localDockSettings";
import { normalizePlanId } from "../lib/subscriptionSourceOfTruth";
import { overlayBridge } from "../dock/dockOverlayBridge";

export type BroadcastPlatform =
  | "youtube"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "kick"
  | "twitch"
  | "custom";

export interface BroadcastChannel {
  id: string;
  name: string;
  platform: BroadcastPlatform;
  streamKey: string;
  serverUrl: string;
  enabled: boolean;
}

export interface BroadcastPersonProfile {
  id: string;
  name: string; // Full label e.g. "Pastor Isaac (Guest Minister)"
  nickname: string; // Short label e.g. "Pst. Isaac"
  color: string; // Accent color hex
  channels: BroadcastChannel[];
  activeChannelId?: string; // Currently selected active channel for direct streaming
}

export interface BroadcastStoreState {
  profiles: BroadcastPersonProfile[];
  activeProfileId: string;
  multistreamMode: "direct" | "cloud"; // "direct" = apply directly to OBS, "cloud" = Cloudflare Multistream
  cloudflareIngestUrl?: string;
  cloudflareStreamKey?: string;
  updatedAt?: number;
}

export const BROADCAST_STORAGE_KEY = "ocs-dock-broadcast-profiles-v2";

export const PLATFORM_INFO: Record<
  BroadcastPlatform,
  { label: string; icon: string; defaultServer: string; color: string; serviceType: "rtmp_common" | "rtmp_custom"; obsServiceName?: string }
> = {
  youtube: {
    label: "YouTube Live",
    icon: "smart_display",
    defaultServer: "Primary YouTube ingest server",
    color: "#EF4444",
    serviceType: "rtmp_common",
    obsServiceName: "YouTube - RTMPS",
  },
  facebook: {
    label: "Facebook Live",
    icon: "facebook",
    defaultServer: "rtmps://live-api-s.facebook.com:443/rtmp/",
    color: "#3B82F6",
    serviceType: "rtmp_common",
    obsServiceName: "Facebook Live",
  },
  instagram: {
    label: "Instagram Live",
    icon: "camera",
    defaultServer: "rtmps://live-upload.instagram.com:443/rtmp/",
    color: "#EC4899",
    serviceType: "rtmp_custom",
  },
  tiktok: {
    label: "TikTok Live",
    icon: "music_video",
    defaultServer: "rtmp://live.tiktok.com/live/",
    color: "#06B6D4",
    serviceType: "rtmp_custom",
  },
  kick: {
    label: "Kick Stream",
    icon: "live_tv",
    defaultServer: "rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/",
    color: "#10B981",
    serviceType: "rtmp_custom",
  },
  twitch: {
    label: "Twitch",
    icon: "videocam",
    defaultServer: "auto",
    color: "#A855F7",
    serviceType: "rtmp_common",
    obsServiceName: "Twitch",
  },
  custom: {
    label: "Custom RTMP",
    icon: "cell_tower",
    defaultServer: "rtmp://custom.server.com/live",
    color: "#F59E0B",
    serviceType: "rtmp_custom",
  },
};

export interface PlatformKeyGuide {
  instructions: string;
  url?: string;
  actionLabel?: string;
}

export const PLATFORM_KEY_GUIDES: Record<BroadcastPlatform, PlatformKeyGuide> = {
  youtube: {
    instructions: "In YouTube Studio, click 'Create' > 'Go live' > open the 'Stream' tab, and copy your Stream key under Stream settings.",
    url: "https://studio.youtube.com/channel/live/livestreaming",
    actionLabel: "Open YouTube Live Studio",
  },
  facebook: {
    instructions: "In Facebook Live Producer, choose 'Streaming software' as your video source, and copy the Stream key under Stream setup.",
    url: "https://www.facebook.com/live/producer",
    actionLabel: "Open Facebook Live Producer",
  },
  instagram: {
    instructions: "On Instagram web, click 'Create' (+) > 'Live video', set your title and audience, then copy the provided Stream Key.",
    url: "https://www.instagram.com",
    actionLabel: "Open Instagram",
  },
  tiktok: {
    instructions: "In TikTok Live Studio or Creator Center, create a live broadcast and copy the Server URL and Stream key.",
    url: "https://www.tiktok.com/live/creators",
    actionLabel: "Open TikTok Live Center",
  },
  kick: {
    instructions: "In your Kick Creator Dashboard, navigate to Settings > Stream Key and copy your private stream key.",
    url: "https://kick.com/dashboard/settings/stream",
    actionLabel: "Open Kick Stream Settings",
  },
  twitch: {
    instructions: "In your Twitch Creator Dashboard, navigate to Settings > Stream and copy your Primary Stream Key.",
    url: "https://dashboard.twitch.tv/settings/stream",
    actionLabel: "Open Twitch Stream Settings",
  },
  custom: {
    instructions: "Copy the RTMP server address and stream key provided by your media host, CDN, or custom streaming provider.",
  },
};

export const DEFAULT_PROFILES: BroadcastPersonProfile[] = [
  {
    id: "profile-senior-pastor",
    name: "Senior Pastor (Sunday Service)",
    nickname: "Senior Pastor",
    color: "#F59E0B",
    channels: [
      {
        id: "ch-senior-yt",
        name: "Church Main YouTube",
        platform: "youtube",
        streamKey: "",
        serverUrl: "Primary YouTube ingest server",
        enabled: true,
      },
      {
        id: "ch-senior-fb",
        name: "Church Facebook Page",
        platform: "facebook",
        streamKey: "",
        serverUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
        enabled: true,
      },
    ],
  },
  {
    id: "profile-guest-minister",
    name: "Pastor Isaac (Guest Minister)",
    nickname: "Pst. Isaac",
    color: "#3B82F6",
    channels: [
      {
        id: "ch-guest-yt",
        name: "Pastor Isaac YouTube Channel",
        platform: "youtube",
        streamKey: "",
        serverUrl: "Primary YouTube ingest server",
        enabled: true,
      },
    ],
  },
  {
    id: "profile-youth-ministry",
    name: "Youth Church (Wednesday)",
    nickname: "Youth Church",
    color: "#10B981",
    channels: [
      {
        id: "ch-youth-yt",
        name: "Youth Live YouTube",
        platform: "youtube",
        streamKey: "",
        serverUrl: "Primary YouTube ingest server",
        enabled: true,
      },
      {
        id: "ch-youth-kick",
        name: "Youth Stream on Kick",
        platform: "kick",
        streamKey: "",
        serverUrl: "rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/",
        enabled: true,
      },
    ],
  },
];

export const DEFAULT_BROADCAST_STATE: BroadcastStoreState = {
  profiles: DEFAULT_PROFILES,
  activeProfileId: "profile-senior-pastor",
  multistreamMode: "direct",
  cloudflareIngestUrl: "rtmps://live.cloudflare.com:443/live/",
  cloudflareStreamKey: "",
};

// In-memory subscribers
const subscribers = new Set<(state: BroadcastStoreState) => void>();

function cleanProfileLabel(text: string): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

function sanitizeProfiles(profiles: BroadcastPersonProfile[]): BroadcastPersonProfile[] {
  return profiles.map((p) => ({
    ...p,
    name: cleanProfileLabel(p.name),
    nickname: cleanProfileLabel(p.nickname),
    channels: p.channels.map((ch) => ({
      ...ch,
      name: cleanProfileLabel(ch.name),
    })),
  }));
}

export function loadBroadcastStore(): BroadcastStoreState {
  try {
    let local: BroadcastStoreState | null = null;
    let native: BroadcastStoreState | null = null;

    // 1. Check native dock settings first (authoritative cross-process SQLite source)
    try {
      const nativeCandidate = readNativeDockSetting<BroadcastStoreState>(BROADCAST_STORAGE_KEY);
      if (nativeCandidate && Array.isArray(nativeCandidate.profiles) && nativeCandidate.profiles.length > 0) {
        native = nativeCandidate;
      }
    } catch {
      // ignore
    }

    // 2. Check localStorage in current browser runtime
    if (typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem(BROADCAST_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as BroadcastStoreState;
          if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
            local = parsed;
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }

    // Choose the freshest source of truth:
    let chosen: BroadcastStoreState | null = null;
    if (native && local) {
      const nativeTime = native.updatedAt || 0;
      const localTime = local.updatedAt || 0;
      // If native is newer or equal, or local has no timestamp, native (SQLite) wins!
      if (nativeTime >= localTime || !localTime) {
        chosen = native;
      } else {
        chosen = local;
      }
    } else {
      chosen = native || local;
    }

    if (!chosen || !Array.isArray(chosen.profiles) || chosen.profiles.length === 0) {
      return DEFAULT_BROADCAST_STATE;
    }

    // Ensure localStorage in this runtime is updated with the chosen authoritative state
    if (typeof localStorage !== "undefined" && chosen === native) {
      try {
        localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(chosen));
      } catch {
        // ignore
      }
    }

    const cleanedProfiles = sanitizeProfiles(chosen.profiles);
    return {
      profiles: cleanedProfiles,
      activeProfileId: chosen.activeProfileId || cleanedProfiles[0]?.id || "profile-senior-pastor",
      multistreamMode: chosen.multistreamMode || "direct",
      cloudflareIngestUrl: chosen.cloudflareIngestUrl || "rtmps://live.cloudflare.com:443/live/",
      cloudflareStreamKey: chosen.cloudflareStreamKey || "",
      updatedAt: chosen.updatedAt,
    };
  } catch {
    return DEFAULT_BROADCAST_STATE;
  }
}

export function saveBroadcastStore(state: BroadcastStoreState): void {
  try {
    const toSave: BroadcastStoreState = {
      ...state,
      updatedAt: Date.now(),
    };

    // 1. Write synchronously to localStorage for immediate reload durability in current runtime
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(toSave));
      } catch (e) {
        console.warn("[BroadcastSettings] Failed to save to localStorage:", e);
      }
    }

    // 2. Write to native dock settings for cross-process sync in SQLite
    writeNativeDockSetting(BROADCAST_STORAGE_KEY, toSave);

    // 3. Notify in-memory subscribers in this window
    for (const callback of subscribers) {
      try {
        callback(toSave);
      } catch {
        // ignore subscriber errors
      }
    }

    // 4. INSTANT REAL-TIME SYNC VIA LOCAL WEBSOCKET RELAY (overlayBridge)
    // Transmits to OBS Dock (or desktop app) in < 2ms!
    try {
      overlayBridge.publish({
        channel: "broadcast-settings",
        type: "store-updated",
        payload: toSave,
      });
    } catch {
      // ignore bridge errors
    }

    // 5. Also notify via custom window event for any same-origin components
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("mce-broadcast-store-updated", { detail: toSave }));
      } catch {
        // ignore
      }
    }

    // Trigger debounced cloud auto-sync if enabled
    import("./cloudSyncService").then((m) => m.triggerDebouncedAutoSync()).catch(() => { });
  } catch (err) {
    console.error("[BroadcastSettings] Failed to save store:", err);
  }
}

/**
 * Actively re-hydrates native dock settings from SQLite (/api/dock-settings)
 * and notifies all subscribers if changed.
 */
export async function syncBroadcastStoreFromNative(): Promise<BroadcastStoreState> {
  try {
    const { hydrateNativeDockSettings } = await import("./localDockSettings");
    await hydrateNativeDockSettings();
  } catch {
    // ignore
  }
  const updated = loadBroadcastStore();
  for (const callback of subscribers) {
    try {
      callback(updated);
    } catch {
      // ignore
    }
  }
  return updated;
}

// Set up instant cross-process synchronization listener via overlayBridge
let bridgeSubscribed = false;
export function initBroadcastCrossProcessSync(): void {
  if (bridgeSubscribed || typeof window === "undefined") return;
  bridgeSubscribed = true;
  try {
    overlayBridge.connect();
    overlayBridge.subscribe((packet) => {
      if (packet.channel === "broadcast-settings" && packet.type === "store-updated" && packet.payload) {
        const incoming = packet.payload as BroadcastStoreState;
        if (incoming && Array.isArray(incoming.profiles) && incoming.profiles.length > 0) {
          const cleaned: BroadcastStoreState = {
            ...incoming,
            profiles: sanitizeProfiles(incoming.profiles),
          };
          if (typeof localStorage !== "undefined") {
            try {
              localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(cleaned));
            } catch {
              // ignore
            }
          }
          writeNativeDockSetting(BROADCAST_STORAGE_KEY, cleaned);
          for (const callback of subscribers) {
            try {
              callback(cleaned);
            } catch {
              // ignore
            }
          }
        }
      }
    });
  } catch (err) {
    console.warn("[BroadcastSettings] Could not initialize bridge sync:", err);
  }
}

// Auto-initialize when running in browser
if (typeof window !== "undefined") {
  initBroadcastCrossProcessSync();
}

export function subscribeBroadcastStore(callback: (state: BroadcastStoreState) => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function getActiveProfile(state: BroadcastStoreState): BroadcastPersonProfile | undefined {
  return state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
}

export function setActiveProfileId(profileId: string): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    activeProfileId: profileId,
  };
  saveBroadcastStore(next);
  return next;
}

export function setMultistreamMode(mode: "direct" | "cloud"): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    multistreamMode: mode,
  };
  saveBroadcastStore(next);
  return next;
}

export function updateCloudBroadcastSettings(settings: {
  cloudflareIngestUrl?: string;
  cloudflareStreamKey?: string;
  multistreamMode?: "direct" | "cloud";
}): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    multistreamMode:
      settings.multistreamMode !== undefined
        ? settings.multistreamMode
        : settings.cloudflareStreamKey
        ? "cloud"
        : current.multistreamMode,
    cloudflareIngestUrl:
      settings.cloudflareIngestUrl !== undefined
        ? settings.cloudflareIngestUrl
        : current.cloudflareIngestUrl,
    cloudflareStreamKey:
      settings.cloudflareStreamKey !== undefined
        ? settings.cloudflareStreamKey
        : current.cloudflareStreamKey,
  };
  saveBroadcastStore(next);
  return next;
}

export function addPersonProfile(name: string, nickname: string, color?: string): BroadcastPersonProfile {
  const current = loadBroadcastStore();
  const newProfile: BroadcastPersonProfile = {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    nickname: nickname.trim() || name.trim(),
    color: color || "#F59E0B",
    channels: [],
  };
  const next: BroadcastStoreState = {
    ...current,
    profiles: [...current.profiles, newProfile],
    activeProfileId: newProfile.id,
  };
  saveBroadcastStore(next);
  return newProfile;
}

export function updatePersonProfile(
  profileId: string,
  patch: Partial<Omit<BroadcastPersonProfile, "id" | "channels">>,
): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    profiles: current.profiles.map((p) => (p.id === profileId ? { ...p, ...patch } : p)),
  };
  saveBroadcastStore(next);
  return next;
}

export function setActiveChannelForProfile(
  profileId: string,
  channelId: string,
): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    profiles: current.profiles.map((p) =>
      p.id === profileId ? { ...p, activeChannelId: channelId } : p
    ),
  };
  saveBroadcastStore(next);
  return next;
}

export function deletePersonProfile(profileId: string): BroadcastStoreState {
  const current = loadBroadcastStore();
  const remaining = current.profiles.filter((p) => p.id !== profileId);
  if (remaining.length === 0) {
    // Preserve at least default profiles
    remaining.push(...DEFAULT_PROFILES);
  }
  const next: BroadcastStoreState = {
    ...current,
    profiles: remaining,
    activeProfileId: current.activeProfileId === profileId ? remaining[0].id : current.activeProfileId,
  };
  saveBroadcastStore(next);
  return next;
}

export function addChannelToProfile(
  profileId: string,
  channelData: Omit<BroadcastChannel, "id">,
): BroadcastChannel {
  const current = loadBroadcastStore();
  const newChannel: BroadcastChannel = {
    id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: channelData.name.trim(),
    platform: channelData.platform,
    streamKey: channelData.streamKey.trim(),
    serverUrl: channelData.serverUrl.trim() || PLATFORM_INFO[channelData.platform].defaultServer,
    enabled: channelData.enabled ?? true,
  };

  const next: BroadcastStoreState = {
    ...current,
    profiles: current.profiles.map((p) => {
      if (p.id !== profileId) return p;
      return {
        ...p,
        channels: [...p.channels, newChannel],
      };
    }),
  };
  saveBroadcastStore(next);
  return newChannel;
}

export function updateChannel(
  profileId: string,
  channelId: string,
  patch: Partial<Omit<BroadcastChannel, "id">>,
): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    profiles: current.profiles.map((p) => {
      if (p.id !== profileId) return p;
      return {
        ...p,
        channels: p.channels.map((ch) => (ch.id === channelId ? { ...ch, ...patch } : ch)),
      };
    }),
  };
  saveBroadcastStore(next);
  return next;
}

export function deleteChannel(profileId: string, channelId: string): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    profiles: current.profiles.map((p) => {
      if (p.id !== profileId) return p;
      return {
        ...p,
        channels: p.channels.filter((ch) => ch.id !== channelId),
      };
    }),
  };
  saveBroadcastStore(next);
  return next;
}

export function toggleChannelEnabled(profileId: string, channelId: string): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    profiles: current.profiles.map((p) => {
      if (p.id !== profileId) return p;
      return {
        ...p,
        channels: p.channels.map((ch) => (ch.id === channelId ? { ...ch, enabled: !ch.enabled } : ch)),
      };
    }),
  };
  saveBroadcastStore(next);
  return next;
}

export function moveChannel(
  profileId: string,
  channelId: string,
  direction: "up" | "down",
): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    profiles: current.profiles.map((p) => {
      if (p.id !== profileId) return p;
      const idx = p.channels.findIndex((c) => c.id === channelId);
      if (idx === -1) return p;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= p.channels.length) return p;
      const newChannels = [...p.channels];
      const [moved] = newChannels.splice(idx, 1);
      newChannels.splice(targetIdx, 0, moved);
      return {
        ...p,
        channels: newChannels,
      };
    }),
  };
  saveBroadcastStore(next);
  return next;
}

export function reorderChannels(profileId: string, channelIds: string[]): BroadcastStoreState {
  const current = loadBroadcastStore();
  const next: BroadcastStoreState = {
    ...current,
    profiles: current.profiles.map((p) => {
      if (p.id !== profileId) return p;
      const channelMap = new Map(p.channels.map((c) => [c.id, c]));
      const ordered: BroadcastChannel[] = [];
      for (const id of channelIds) {
        const ch = channelMap.get(id);
        if (ch) {
          ordered.push(ch);
          channelMap.delete(id);
        }
      }
      for (const ch of channelMap.values()) {
        ordered.push(ch);
      }
      return {
        ...p,
        channels: ordered,
      };
    }),
  };
  saveBroadcastStore(next);
  return next;
}

/**
 * Resolves the actual RTMP/RTMPS ingest URL required by the OBS streaming engine.
 * OBS dropdowns display human names like "Primary YouTube ingest server", but OBS's
 * RTMP streaming network engine requires the real URL scheme (e.g. rtmps://a.rtmps.youtube.com:443/live2).
 * Sending a raw string without a protocol scheme causes OBS to fail with "RTMP URL: No :// in url!"
 * and "Invalid Path or Connection URL".
 */
export function resolveObsServerUrl(platform: BroadcastPlatform, serverInput?: string): string {
  const input = (serverInput || "").trim();

  if (platform === "youtube") {
    if (
      !input ||
      input === "auto" ||
      input === "Primary YouTube ingest server" ||
      input.toLowerCase() === "primary"
    ) {
      return "rtmps://a.rtmps.youtube.com:443/live2";
    }
    if (
      input === "Backup YouTube ingest server (legacy RTMP)" ||
      (input.includes("legacy") && input.toLowerCase().includes("backup"))
    ) {
      return "rtmp://b.rtmp.youtube.com/live2?backup=1";
    }
    if (
      input === "Primary YouTube ingest server (legacy RTMP)" ||
      input.toLowerCase().includes("legacy")
    ) {
      return "rtmp://a.rtmp.youtube.com/live2";
    }
    if (
      input === "Backup YouTube ingest server" ||
      input.toLowerCase().includes("backup")
    ) {
      return "rtmps://b.rtmps.youtube.com:443/live2?backup=1";
    }
    if (input.includes("://")) {
      return input;
    }
    return "rtmps://a.rtmps.youtube.com:443/live2";
  }

  if (platform === "facebook") {
    if (!input || input === "default" || input === "auto") {
      return "rtmps://live-api-s.facebook.com:443/rtmp/";
    }
    return input;
  }

  if (platform === "twitch") {
    if (!input || input === "auto") {
      return "auto";
    }
    return input;
  }

  if (!input) {
    return PLATFORM_INFO[platform]?.defaultServer || "";
  }

  return input;
}

/**
 * Builds the OBS WebSocket SetStreamServiceSettings payload for a specific channel.
 */
export function buildObsStreamServiceSettings(channel: BroadcastChannel): {
  streamServiceType: string;
  streamServiceSettings: Record<string, unknown>;
} {
  const info = PLATFORM_INFO[channel.platform];
  const resolvedServer = resolveObsServerUrl(channel.platform, channel.serverUrl);

  if (info.serviceType === "rtmp_common") {
    return {
      streamServiceType: "rtmp_common",
      streamServiceSettings: {
        service: info.obsServiceName || "YouTube - RTMPS",
        server: resolvedServer,
        key: channel.streamKey,
        bwtest: false,
      },
    };
  }

  // Custom RTMP (e.g. Kick, Instagram, TikTok, Custom RTMP)
  return {
    streamServiceType: "rtmp_custom",
    streamServiceSettings: {
      server: resolvedServer,
      key: channel.streamKey,
      use_auth: false,
    },
  };
}

export interface MultistreamPlanAllocation {
  plan: string;
  hours: number;
  allowed: boolean;
  label: string;
  description: string;
}

/**
 * Returns the multistream hour allowance for a given subscription tier.
 * Free: 0 hrs (blocked)
 * Basic: 10 hrs / month
 * Growth: 20 hrs / month
 * Third tier (Pro / Unlimited): 40 hrs / month
 */
export function getMultistreamPlanAllocation(planName?: string | null): MultistreamPlanAllocation {
  const raw = String(planName || "free").trim().toLowerCase();
  if (raw === "pro" || raw === "unlimited" || raw === "ambassador" || raw === "church_pro" || raw === "church pro") {
    return {
      plan: raw,
      hours: 40,
      allowed: true,
      label: "Pro Plan (40 hrs/mo)",
      description: "Your Pro plan includes 40 hours of simultaneous multi-platform broadcasting per month.",
    };
  }

  const normalized = normalizePlanId(planName || "free");
  if (normalized === "free") {
    return {
      plan: "free",
      hours: 0,
      allowed: false,
      label: "Free Plan (No Access)",
      description: "Cloud multi-streaming is disabled. Upgrade to Basic (10 hrs), Growth (20 hrs), or Pro (40 hrs) to broadcast to multiple platforms simultaneously.",
    };
  }
  if (normalized === "basic") {
    return {
      plan: "basic",
      hours: 10,
      allowed: true,
      label: "Basic Plan (10 hrs/mo)",
      description: "Your Basic plan includes 10 hours of simultaneous multi-platform broadcasting per month.",
    };
  }
  return {
    plan: "growth",
    hours: 20,
    allowed: true,
    label: "Growth Plan (20 hrs/mo)",
    description: "Your Growth plan includes 20 hours of simultaneous multi-platform broadcasting per month.",
  };
}
