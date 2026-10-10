import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolvePlatformRtmpUrl,
  syncCloudflareLiveOutputs,
} from "./broadcastStreamService";

type Call = { url: string; method: string; body?: any };

function mockCloudflare(handler: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = { url: String(url), method: init?.method || "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const { status = 200, body } = handler(call);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const ok = (result: unknown) => ({ body: { success: true, result } });

describe("broadcastStreamService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CLOUDFLARE_STREAM_API_TOKEN;
  });

  it("resolves platform addresses, including OBS-style labels", () => {
    expect(resolvePlatformRtmpUrl("youtube")).toBe("rtmps://a.rtmps.youtube.com:443/live2");
    expect(resolvePlatformRtmpUrl("youtube", "Primary YouTube ingest server")).toBe("rtmps://a.rtmps.youtube.com:443/live2");
    expect(resolvePlatformRtmpUrl("youtube", "Backup YouTube ingest server")).toBe("rtmps://b.rtmps.youtube.com:443/live2?backup=1");
    expect(resolvePlatformRtmpUrl("facebook")).toBe("rtmps://live-api-s.facebook.com:443/rtmp/");
    expect(resolvePlatformRtmpUrl("twitch", "auto")).toBe("rtmp://live.twitch.tv/app/");
    expect(resolvePlatformRtmpUrl("custom", "rtmp://ingest.mychurch.tv/live")).toBe("rtmp://ingest.mychurch.tv/live");
    expect(resolvePlatformRtmpUrl("custom")).toBe("");
  });

  it("reports a missing engine token", async () => {
    const res = await syncCloudflareLiveOutputs({
      inputName: "MCE · u1 · p1",
      channels: [{ id: "c1", name: "YT", platform: "youtube", streamKey: "key-1", enabled: true }],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("MISSING_TOKEN");
  });

  it("rejects when no destination has a key", async () => {
    process.env.CLOUDFLARE_STREAM_API_TOKEN = "test-token";
    const res = await syncCloudflareLiveOutputs({
      inputName: "MCE · u1 · p1",
      channels: [
        { id: "c1", name: "YT", platform: "youtube", streamKey: "", enabled: true },
        { id: "c2", name: "FB", platform: "facebook", streamKey: "fb-key", enabled: false },
      ],
    });
    expect(res.error).toBe("NO_ACTIVE_CHANNELS");
  });

  it("creates a private input for a new profile and never lists other inputs", async () => {
    process.env.CLOUDFLARE_STREAM_API_TOKEN = "test-token";
    const calls = mockCloudflare((call) => {
      if (call.method === "POST" && call.url.endsWith("/live_inputs")) {
        return ok({ uid: "in-new", rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: "ingest-key" } });
      }
      if (call.method === "GET" && call.url.endsWith("/outputs")) return ok([]);
      if (call.method === "POST" && call.url.endsWith("/outputs")) return ok({ uid: "o" });
      return { status: 404, body: { success: false } };
    });

    const res = await syncCloudflareLiveOutputs({
      inputName: "MCE · u1 · p1",
      liveInputId: null,
      channels: [
        { id: "yt", name: "YouTube", platform: "youtube", streamKey: "yt-key", serverUrl: "auto", enabled: true },
        { id: "fb", name: "Facebook", platform: "facebook", streamKey: "fb-key", enabled: true },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.liveInputId).toBe("in-new");
    expect(res.streamKey).toBe("ingest-key");
    expect(res.results?.map((r) => r.ok)).toEqual([true, true]);
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/live_inputs"))).toBe(false);
    expect(calls.filter((c) => c.method === "POST" && c.url.endsWith("/outputs"))).toHaveLength(2);
  });

  it("reuses the stored input, removes stale outputs and reports a rejected destination", async () => {
    process.env.CLOUDFLARE_STREAM_API_TOKEN = "test-token";
    const calls = mockCloudflare((call) => {
      if (call.method === "GET" && call.url.endsWith("/live_inputs/in-1")) {
        return ok({ uid: "in-1", rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: "k1" } });
      }
      if (call.method === "GET" && call.url.endsWith("/outputs")) {
        return ok([
          { uid: "keep", url: "rtmps://a.rtmps.youtube.com:443/live2", streamKey: "yt-key", enabled: true },
          { uid: "old", url: "rtmp://live.twitch.tv/app/", streamKey: "old-key", enabled: true },
        ]);
      }
      if (call.method === "DELETE") return ok(null);
      if (call.method === "POST" && call.url.endsWith("/outputs")) {
        return { status: 400, body: { success: false, errors: [{ code: 10000, message: "Invalid url" }] } };
      }
      return { status: 404, body: { success: false } };
    });

    const res = await syncCloudflareLiveOutputs({
      inputName: "MCE · u1 · p1",
      liveInputId: "in-1",
      channels: [
        { id: "yt", name: "YouTube", platform: "youtube", streamKey: "yt-key", enabled: true },
        { id: "fb", name: "Facebook", platform: "facebook", streamKey: "fb-key", enabled: true },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.liveInputId).toBe("in-1");
    expect(res.results).toEqual([
      { id: "yt", name: "YouTube", platform: "youtube", ok: true },
      { id: "fb", name: "Facebook", platform: "facebook", ok: false, reason: "Rejected: Invalid url" },
    ]);
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/outputs/old"))).toBe(true);
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/outputs/keep"))).toBe(false);
  });

  it("recreates the input when the stored one was deleted on Cloudflare", async () => {
    process.env.CLOUDFLARE_STREAM_API_TOKEN = "test-token";
    mockCloudflare((call) => {
      if (call.method === "GET" && call.url.endsWith("/live_inputs/gone")) return { status: 404, body: { success: false } };
      if (call.method === "POST" && call.url.endsWith("/live_inputs")) {
        return ok({ uid: "in-2", rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: "k2" } });
      }
      if (call.method === "GET" && call.url.endsWith("/outputs")) return ok([]);
      return ok({ uid: "o" });
    });

    const res = await syncCloudflareLiveOutputs({
      inputName: "MCE · u1 · p1",
      liveInputId: "gone",
      channels: [{ id: "yt", name: "YouTube", platform: "youtube", streamKey: "yt-key", enabled: true }],
    });
    expect(res.success).toBe(true);
    expect(res.liveInputId).toBe("in-2");
  });

  it("asks for a server address on custom destinations without one", async () => {
    process.env.CLOUDFLARE_STREAM_API_TOKEN = "test-token";
    mockCloudflare((call) => {
      if (call.method === "GET" && call.url.endsWith("/live_inputs/in-1")) return ok({ uid: "in-1", rtmps: { streamKey: "k1" } });
      if (call.method === "GET" && call.url.endsWith("/outputs")) return ok([]);
      return ok({ uid: "o" });
    });
    const res = await syncCloudflareLiveOutputs({
      inputName: "x",
      liveInputId: "in-1",
      channels: [
        { id: "yt", name: "YouTube", platform: "youtube", streamKey: "yt-key", enabled: true },
        { id: "c", name: "Website", platform: "custom", streamKey: "abc", enabled: true },
      ],
    });
    expect(res.success).toBe(true);
    expect(res.results?.[1]).toMatchObject({ id: "c", ok: false });
  });
});
