import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("./authService", () => ({
  getDeviceId: () => "device-1",
  getDeviceSecret: () => "secret-1",
  getDeviceApiBaseCandidates: () => ["https://api.test"],
}));

import {
  ensureObsConnected,
  syncChannelToObs,
  syncProfileToObs,
} from "./broadcastObsSyncService";
import type { BroadcastChannel, BroadcastPersonProfile } from "./broadcastSettingsService";
import { getMultistreamTarget } from "./multistreamState";

describe("broadcastObsSyncService", () => {
  const sampleChannel: BroadcastChannel = {
    id: "ch-yt-test",
    name: "Main Church YouTube",
    platform: "youtube",
    streamKey: "live_test_12345",
    serverUrl: "Primary YouTube ingest server",
    enabled: true,
  };

  const sampleProfile: BroadcastPersonProfile = {
    id: "prof-pastor",
    name: "Pastor David (Lead Pastor)",
    nickname: "Pastor David",
    color: "#6366F1",
    channels: [sampleChannel],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensureObsConnected returns connected immediately if client is already connected", async () => {
    const mockClient = {
      isConnected: true,
      connect: vi.fn(),
    } as any;

    const res = await ensureObsConnected(mockClient);
    expect(res.connected).toBe(true);
    expect(res.reconnected).toBe(false);
    expect(mockClient.connect).not.toHaveBeenCalled();
  });

  it("ensureObsConnected attempts connection when client is disconnected", async () => {
    let connected = false;
    const mockClient = {
      get isConnected() {
        return connected;
      },
      connect: vi.fn().mockImplementation(async () => {
        connected = true;
      }),
    } as any;

    const res = await ensureObsConnected(mockClient);
    expect(res.connected).toBe(true);
    expect(res.reconnected).toBe(true);
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it("syncChannelToObs returns error if streamKey is empty", async () => {
    const mockClient = {
      isConnected: true,
      setStreamServiceSettings: vi.fn(),
    } as any;

    const res = await syncChannelToObs({ ...sampleChannel, streamKey: "" }, "Pastor David", mockClient);
    expect(res.success).toBe(false);
    expect(res.message).toContain("empty");
    expect(mockClient.setStreamServiceSettings).not.toHaveBeenCalled();
  });

  it("syncChannelToObs connects first before syncing if disconnected", async () => {
    let connected = false;
    const mockClient = {
      get isConnected() {
        return connected;
      },
      connect: vi.fn().mockImplementation(async () => {
        connected = true;
      }),
      setStreamServiceSettings: vi.fn().mockResolvedValue(undefined),
    } as any;

    const res = await syncChannelToObs(sampleChannel, "Pastor David", mockClient);
    expect(mockClient.connect).toHaveBeenCalled();
    expect(mockClient.setStreamServiceSettings).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.connectedFirst).toBe(true);
    expect(res.message).toContain("Connected to OBS");
  });

  it("syncProfileToObs finds enabled channel and syncs to OBS", async () => {
    const mockClient = {
      isConnected: true,
      setStreamServiceSettings: vi.fn().mockResolvedValue(undefined),
    } as any;

    const res = await syncProfileToObs(sampleProfile, mockClient);
    expect(res.success).toBe(true);
    expect(res.connectedFirst).toBe(false);
    expect(mockClient.setStreamServiceSettings).toHaveBeenCalled();
    expect(res.message).toContain("Pastor David");
  });

  it("handles OBS connection failure gracefully with friendly message", async () => {
    const mockClient = {
      isConnected: false,
      connect: vi.fn().mockRejectedValue(new Error("Connection refused")),
      setStreamServiceSettings: vi.fn(),
    } as any;

    const res = await syncChannelToObs(sampleChannel, "Pastor David", mockClient);
    expect(res.success).toBe(false);
    expect(res.message).toContain("Could not connect to OBS Studio");
    expect(mockClient.setStreamServiceSettings).not.toHaveBeenCalled();
  });

  it("syncProfileToObs streams directly when profile has only 1 channel (bypassing cloud)", async () => {
    const mockClient = {
      isConnected: true,
      setStreamServiceSettings: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Single-channel profile should stream directly to YouTube, not cloud
    const res = await syncProfileToObs(sampleProfile, mockClient, {
      profiles: [sampleProfile],
      activeProfileId: sampleProfile.id,
      multistreamMode: "cloud",
      cloudflareIngestUrl: "rtmps://live.cloudflare.com:443/live/",
      cloudflareStreamKey: "cloud-key-live-123",
    });

    expect(res.success).toBe(true);
    expect(mockClient.setStreamServiceSettings).toHaveBeenCalledWith("rtmp_common", {
      service: "YouTube - RTMPS",
      server: "rtmps://a.rtmps.youtube.com:443/live2",
      key: "live_test_12345",
      bwtest: false,
    });
    expect(res.message).toContain("Pastor David (Main Church YouTube)");
  });

  describe("multi-stream (2+ destinations)", () => {
    const fb: BroadcastChannel = {
      id: "ch-fb-test",
      name: "Church Facebook",
      platform: "facebook",
      streamKey: "fb-live-key",
      serverUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
      enabled: true,
    };
    const multi: BroadcastPersonProfile = { ...sampleProfile, channels: [sampleChannel, fb] };
    const client = () => ({
      isConnected: true,
      getStreamStatus: vi.fn().mockResolvedValue({ outputActive: false }),
      setStreamServiceSettings: vi.fn().mockResolvedValue(undefined),
    }) as any;

    const reply = (status: number, body: unknown) =>
      vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }));

    beforeEach(() => {
      if (typeof localStorage !== "undefined") localStorage.clear();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("sends the profile to the cloud engine and points OBS at its private ingest", async () => {
      const fetchMock = reply(200, {
        success: true,
        ingestUrl: "rtmps://live.cloudflare.com:443/live/",
        streamKey: "profile-ingest-key",
        results: [
          { id: "ch-yt-test", ok: true },
          { id: "ch-fb-test", ok: true },
        ],
      });
      vi.stubGlobal("fetch", fetchMock);
      const c = client();

      const res = await syncProfileToObs(multi, c);

      expect(res.success).toBe(true);
      expect(res.mode).toBe("cloud");
      expect(c.setStreamServiceSettings).toHaveBeenCalledWith("rtmp_custom", {
        server: "rtmps://live.cloudflare.com:443/live/",
        key: "profile-ingest-key",
        use_auth: false,
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/broadcast/sync");
      const body = JSON.parse(String(init.body));
      expect(body.profileId).toBe("prof-pastor");
      expect(body.channels).toHaveLength(2);
      expect(init.headers["X-Device-Id"]).toBe("device-1");
      expect(getMultistreamTarget()).toMatchObject({ mode: "cloud", profileId: "prof-pastor", channelIds: ["ch-yt-test", "ch-fb-test"] });
    });

    it("reports a destination the engine rejected", async () => {
      vi.stubGlobal("fetch", reply(200, {
        success: true,
        streamKey: "k",
        results: [
          { id: "ch-yt-test", ok: true },
          { id: "ch-fb-test", ok: false, reason: "Rejected: Invalid stream key" },
        ],
      }));
      const res = await syncProfileToObs(multi, client());
      expect(res.success).toBe(true);
      expect(res.warning).toBe(true);
      expect(res.destinations?.find((d) => d.id === "ch-fb-test")).toMatchObject({ ok: false, reason: "Rejected: Invalid stream key" });
    });

    it("falls back to the main destination when the plan has no multi-stream hours left", async () => {
      vi.stubGlobal("fetch", reply(403, { success: false, error: "QUOTA_EXHAUSTED", message: "This month's 20 multi-stream hours are used up." }));
      const c = client();
      const res = await syncProfileToObs(multi, c);
      expect(res.success).toBe(true);
      expect(res.warning).toBe(true);
      expect(res.mode).toBe("direct");
      expect(res.message).toContain("Main Church YouTube only");
      expect(c.setStreamServiceSettings).toHaveBeenCalledWith("rtmp_common", expect.objectContaining({ key: "live_test_12345" }));
    });

    it("reuses the last working setup when the engine can't be reached and nothing changed", async () => {
      vi.stubGlobal("fetch", reply(200, { success: true, ingestUrl: "rtmps://ingest/", streamKey: "cached-key", results: [] }));
      await syncProfileToObs(multi, client());

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
      const c = client();
      const res = await syncProfileToObs(multi, c);
      expect(res.success).toBe(true);
      expect(res.mode).toBe("cloud");
      expect(c.setStreamServiceSettings).toHaveBeenCalledWith("rtmp_custom", { server: "rtmps://ingest/", key: "cached-key", use_auth: false });
    });

    it("does not reuse an old setup after the destinations changed", async () => {
      vi.stubGlobal("fetch", reply(200, { success: true, ingestUrl: "rtmps://ingest/", streamKey: "cached-key", results: [] }));
      await syncProfileToObs(multi, client());

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
      const changed = { ...multi, channels: [sampleChannel, { ...fb, streamKey: "new-fb-key" }] };
      const res = await syncProfileToObs(changed, client());
      expect(res.mode).toBe("direct");
      expect(res.warning).toBe(true);
    });

    it("updates destinations while live without touching OBS", async () => {
      vi.stubGlobal("fetch", reply(200, { success: true, streamKey: "k", results: [] }));
      await syncProfileToObs(multi, client());

      const live = client();
      live.getStreamStatus.mockResolvedValue({ outputActive: true });
      const res = await syncProfileToObs({ ...multi, channels: [sampleChannel, fb, { ...fb, id: "ch-tw", name: "Twitch", platform: "twitch", streamKey: "tw" }] }, live);
      expect(res.success).toBe(true);
      expect(res.message).toContain("while live");
      expect(live.setStreamServiceSettings).not.toHaveBeenCalled();
    });

    it("refuses to switch profiles while live", async () => {
      const live = client();
      live.getStreamStatus.mockResolvedValue({ outputActive: true });
      vi.stubGlobal("fetch", vi.fn());
      const res = await syncProfileToObs({ ...multi, id: "other-profile" }, live);
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe("LIVE");
      expect(live.setStreamServiceSettings).not.toHaveBeenCalled();
    });
  });
});
