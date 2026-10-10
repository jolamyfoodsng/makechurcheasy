import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILES,
  PLATFORM_KEY_GUIDES,
  addChannelToProfile,
  addPersonProfile,
  buildObsStreamServiceSettings,
  deleteChannel,
  deletePersonProfile,
  getActiveProfile,
  getMultistreamPlanAllocation,
  loadBroadcastStore,
  moveChannel,
  reorderChannels,
  resolveObsServerUrl,
  saveBroadcastStore,
  setActiveProfileId,
  setMultistreamMode,
  toggleChannelEnabled,
  updateChannel,
  updateCloudBroadcastSettings,
  updatePersonProfile,
} from "./broadcastSettingsService";
import { canUseMultistream, getMultistreamHoursLimit } from "./licenseService";

describe("broadcastSettingsService", () => {
  beforeEach(() => {
    // Reset to defaults before each test
    saveBroadcastStore({
      profiles: DEFAULT_PROFILES,
      activeProfileId: "profile-senior-pastor",
      multistreamMode: "direct",
      cloudflareIngestUrl: "rtmps://live.cloudflare.com:443/live/",
      cloudflareStreamKey: "",
    });
  });

  it("loads default profiles with nickname and channels", () => {
    const store = loadBroadcastStore();
    expect(store.profiles.length).toBeGreaterThanOrEqual(3);

    const pastor = store.profiles.find((p) => p.id === "profile-senior-pastor");
    expect(pastor).toBeDefined();
    expect(pastor?.nickname).toBe("Senior Pastor");
    expect(pastor?.channels.length).toBe(2);
    expect(pastor?.channels[0].platform).toBe("youtube");
    expect(pastor?.channels[0].serverUrl).toBe("Primary YouTube ingest server");
    expect(pastor?.channels[1].platform).toBe("facebook");
  });

  it("allows switching active profile to a different person/minister", () => {
    const updated = setActiveProfileId("profile-guest-minister");
    expect(updated.activeProfileId).toBe("profile-guest-minister");

    const active = getActiveProfile(updated);
    expect(active?.nickname).toBe("Pst. Isaac");
    expect(active?.name).toBe("Pastor Isaac (Guest Minister)");
  });

  it("adds a new person profile with custom nickname and channels", () => {
    const newPerson = addPersonProfile("Revival Guest (Bishop David)", "Bishop David", "#8B5CF6");
    expect(newPerson.name).toBe("Revival Guest (Bishop David)");
    expect(newPerson.nickname).toBe("Bishop David");
    expect(newPerson.color).toBe("#8B5CF6");

    const store = loadBroadcastStore();
    expect(store.activeProfileId).toBe(newPerson.id);
    expect(store.profiles.some((p) => p.id === newPerson.id)).toBe(true);

    // Add channels tied to this new person
    const chYt = addChannelToProfile(newPerson.id, {
      name: "Bishop David YouTube",
      platform: "youtube",
      streamKey: "yt-key-12345",
      serverUrl: "auto",
      enabled: true,
    });
    expect(chYt.id).toBeDefined();

    const chFb = addChannelToProfile(newPerson.id, {
      name: "Bishop David Facebook Live",
      platform: "facebook",
      streamKey: "fb-key-67890",
      serverUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
      enabled: true,
    });
    expect(chFb.id).toBeDefined();

    const refreshed = loadBroadcastStore();
    const person = refreshed.profiles.find((p) => p.id === newPerson.id);
    expect(person?.channels.length).toBe(2);
    expect(person?.channels[0].name).toBe("Bishop David YouTube");
    expect(person?.channels[1].name).toBe("Bishop David Facebook Live");

    // Clean up created profile
    deletePersonProfile(newPerson.id);
    expect(loadBroadcastStore().profiles.some((p) => p.id === newPerson.id)).toBe(false);
  });

  it("allows updating person profile nickname, updating channels, and deleting channels", () => {
    updatePersonProfile("profile-guest-minister", {
      nickname: "Dr. Isaac (Special)",
    });

    const store = loadBroadcastStore();
    const updated = store.profiles.find((p) => p.id === "profile-guest-minister");
    expect(updated?.nickname).toBe("Dr. Isaac (Special)");

    // Update channel name and key
    const channelId = updated?.channels[0].id;
    if (channelId) {
      updateChannel("profile-guest-minister", channelId, {
        name: "Pastor Isaac YouTube Updated",
        streamKey: "new-key-999",
      });
      const afterUpdate = loadBroadcastStore().profiles.find((p) => p.id === "profile-guest-minister");
      expect(afterUpdate?.channels[0].name).toBe("Pastor Isaac YouTube Updated");
      expect(afterUpdate?.channels[0].streamKey).toBe("new-key-999");

      // Toggle channel enabled status
      toggleChannelEnabled("profile-guest-minister", channelId);
      const afterToggle = loadBroadcastStore().profiles.find((p) => p.id === "profile-guest-minister");
      expect(afterToggle?.channels[0].enabled).toBe(false);

      // Delete channel
      deleteChannel("profile-guest-minister", channelId);
      const afterDelete = loadBroadcastStore().profiles.find((p) => p.id === "profile-guest-minister");
      expect(afterDelete?.channels.length).toBe(0);
    }
  });

  it("builds correct OBS stream service payload for common and custom RTMP", () => {
    const ytPayload = buildObsStreamServiceSettings({
      id: "ch-1",
      name: "Main YT",
      platform: "youtube",
      streamKey: "live-yt-secret-key",
      serverUrl: "auto",
      enabled: true,
    });

    expect(ytPayload.streamServiceType).toBe("rtmp_common");
    expect(ytPayload.streamServiceSettings.service).toBe("YouTube - RTMPS");
    expect(ytPayload.streamServiceSettings.server).toBe("rtmps://a.rtmps.youtube.com:443/live2");
    expect(ytPayload.streamServiceSettings.key).toBe("live-yt-secret-key");

    const kickPayload = buildObsStreamServiceSettings({
      id: "ch-2",
      name: "Kick Live",
      platform: "kick",
      streamKey: "kick-secret-key",
      serverUrl: "rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/",
      enabled: true,
    });

    expect(kickPayload.streamServiceType).toBe("rtmp_custom");
    expect(kickPayload.streamServiceSettings.server).toBe(
      "rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/",
    );
    expect(kickPayload.streamServiceSettings.key).toBe("kick-secret-key");
  });

  it("getMultistreamPlanAllocation correctly maps hours: Free (0), Basic (10), Growth (20), Pro (40)", () => {
    const free = getMultistreamPlanAllocation("free");
    expect(free.hours).toBe(0);
    expect(free.allowed).toBe(false);

    const basic = getMultistreamPlanAllocation("basic");
    expect(basic.hours).toBe(10);
    expect(basic.allowed).toBe(true);

    const growth = getMultistreamPlanAllocation("growth");
    expect(growth.hours).toBe(20);
    expect(growth.allowed).toBe(true);

    const pro = getMultistreamPlanAllocation("pro");
    expect(pro.hours).toBe(40);
    expect(pro.allowed).toBe(true);

    const unlimited = getMultistreamPlanAllocation("unlimited");
    expect(unlimited.hours).toBe(40);
    expect(unlimited.allowed).toBe(true);
  });

  it("updates multistreamMode and cloud settings", () => {
    const updated = setMultistreamMode("cloud");
    expect(updated.multistreamMode).toBe("cloud");
    expect(loadBroadcastStore().multistreamMode).toBe("cloud");

    const cloudUpdated = updateCloudBroadcastSettings({
      cloudflareStreamKey: "secret-cloud-stream-key",
    });
    expect(cloudUpdated.cloudflareStreamKey).toBe("secret-cloud-stream-key");
    expect(loadBroadcastStore().cloudflareStreamKey).toBe("secret-cloud-stream-key");
  });

  it("checks licenseService canUseMultistream and getMultistreamHoursLimit", () => {
    // Null user defaults to free (0 hours, not allowed)
    expect(canUseMultistream(null)).toBe(false);
    expect(getMultistreamHoursLimit(null)).toBe(0);

    // Free user
    expect(canUseMultistream({ id: "u-1", email: "free@church.org", plan: "free" } as any)).toBe(false);
    expect(getMultistreamHoursLimit({ id: "u-1", email: "free@church.org", plan: "free" } as any)).toBe(0);

    // Basic user (10 hours)
    expect(canUseMultistream({ id: "u-2", email: "basic@church.org", plan: "basic" } as any)).toBe(true);
    expect(getMultistreamHoursLimit({ id: "u-2", email: "basic@church.org", plan: "basic" } as any)).toBe(10);

    // Growth user (20 hours)
    expect(canUseMultistream({ id: "u-3", email: "growth@church.org", plan: "growth" } as any)).toBe(true);
    expect(getMultistreamHoursLimit({ id: "u-3", email: "growth@church.org", plan: "growth" } as any)).toBe(20);
  });

  it("provides stream key guides with instructions and URLs for each supported platform", () => {
    expect(PLATFORM_KEY_GUIDES.youtube.url).toBe("https://studio.youtube.com/channel/live/livestreaming");
    expect(PLATFORM_KEY_GUIDES.youtube.instructions).toContain("YouTube Studio");
    expect(PLATFORM_KEY_GUIDES.facebook.url).toBe("https://www.facebook.com/live/producer");
    expect(PLATFORM_KEY_GUIDES.facebook.instructions).toContain("Facebook Live Producer");
    expect(PLATFORM_KEY_GUIDES.instagram.url).toBeDefined();
    expect(PLATFORM_KEY_GUIDES.tiktok.url).toBeDefined();
    expect(PLATFORM_KEY_GUIDES.kick.url).toBeDefined();
    expect(PLATFORM_KEY_GUIDES.twitch.url).toBeDefined();
    expect(PLATFORM_KEY_GUIDES.custom.instructions).toBeDefined();
  });

  it("resolveObsServerUrl properly maps friendly UI labels to valid RTMP/RTMPS URLs for OBS", () => {
    // YouTube
    expect(resolveObsServerUrl("youtube", "Primary YouTube ingest server")).toBe(
      "rtmps://a.rtmps.youtube.com:443/live2",
    );
    expect(resolveObsServerUrl("youtube", "auto")).toBe(
      "rtmps://a.rtmps.youtube.com:443/live2",
    );
    expect(resolveObsServerUrl("youtube", "")).toBe(
      "rtmps://a.rtmps.youtube.com:443/live2",
    );
    expect(resolveObsServerUrl("youtube", "Backup YouTube ingest server")).toBe(
      "rtmps://b.rtmps.youtube.com:443/live2?backup=1",
    );
    expect(
      resolveObsServerUrl("youtube", "Primary YouTube ingest server (legacy RTMP)"),
    ).toBe("rtmp://a.rtmp.youtube.com/live2");
    expect(
      resolveObsServerUrl("youtube", "Backup YouTube ingest server (legacy RTMP)"),
    ).toBe("rtmp://b.rtmp.youtube.com/live2?backup=1");
    // Direct URL copied from YouTube Studio
    expect(resolveObsServerUrl("youtube", "rtmp://a.rtmp.youtube.com/live2")).toBe(
      "rtmp://a.rtmp.youtube.com/live2",
    );

    // Facebook
    expect(resolveObsServerUrl("facebook", "auto")).toBe(
      "rtmps://live-api-s.facebook.com:443/rtmp/",
    );
    expect(resolveObsServerUrl("facebook", "default")).toBe(
      "rtmps://live-api-s.facebook.com:443/rtmp/",
    );
    expect(resolveObsServerUrl("facebook", "")).toBe(
      "rtmps://live-api-s.facebook.com:443/rtmp/",
    );

    // Twitch
    expect(resolveObsServerUrl("twitch", "auto")).toBe("auto");

    // Custom
    expect(
      resolveObsServerUrl("custom", "rtmp://custom.server.com/live"),
    ).toBe("rtmp://custom.server.com/live");
  });

  it("prefers fresh native SQLite store over stale browser localStorage on reload", () => {
    // Simulate stale localStorage in browser with 2 channels
    const staleState = {
      profiles: DEFAULT_PROFILES,
      activeProfileId: "profile-senior-pastor",
      multistreamMode: "direct" as const,
      cloudflareIngestUrl: "rtmps://live.cloudflare.com:443/live/",
      cloudflareStreamKey: "",
      updatedAt: 1000,
    };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("ocs-dock-broadcast-profiles-v2", JSON.stringify(staleState));
    }

    // Now save an updated state (e.g. channel deleted) with newer timestamp
    const singleChannelProfile = [
      {
        ...DEFAULT_PROFILES[0],
        channels: [DEFAULT_PROFILES[0].channels[0]], // only 1 channel
      },
    ];
    saveBroadcastStore({
      profiles: singleChannelProfile,
      activeProfileId: "profile-senior-pastor",
      multistreamMode: "direct",
      cloudflareIngestUrl: "rtmps://live.cloudflare.com:443/live/",
      cloudflareStreamKey: "",
    });

    // On reload / load, loadBroadcastStore must pick the fresh store with 1 channel
    const reloaded = loadBroadcastStore();
    expect(reloaded.profiles[0].channels.length).toBe(1);
  });

  it("supports moving and reordering channels within a profile", () => {
    // Senior Pastor starts with 2 channels: ch-senior-yt, ch-senior-fb
    const profile = DEFAULT_PROFILES[0];
    const initialFirst = profile.channels[0].id;
    const initialSecond = profile.channels[1].id;

    // Move second channel up
    const moved = moveChannel("profile-senior-pastor", initialSecond, "up");
    const activeProf = moved.profiles.find((p) => p.id === "profile-senior-pastor");
    expect(activeProf?.channels[0].id).toBe(initialSecond);
    expect(activeProf?.channels[1].id).toBe(initialFirst);

    // Reorder channels back
    const reordered = reorderChannels("profile-senior-pastor", [initialFirst, initialSecond]);
    const restoredProf = reordered.profiles.find((p) => p.id === "profile-senior-pastor");
    expect(restoredProf?.channels[0].id).toBe(initialFirst);
    expect(restoredProf?.channels[1].id).toBe(initialSecond);
  });
});
