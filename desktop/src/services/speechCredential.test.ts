import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./authService", () => ({
  getDeviceApiBaseCandidates: () => ["https://api.example.test"],
  getDeviceId: () => "dev-1",
  getDeviceSecret: () => "secret-1",
}));

import { getSpeechCredential, SpeechAccessDeniedError } from "./speechCredential";

const respond = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

describe("getSpeechCredential (release behaviour)", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ASSEMBLYAI_API_KEYS", "leaked-dev-key");
    vi.stubEnv("VITE_CLOUDFLARE_STT_URL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks the API for a token and prefixes it; never uses a bundled key", async () => {
    const fetchMock = vi.fn(async () => respond({ allowed: true, streamingToken: "tok-1" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getSpeechCredential()).toBe("token:tok-1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/device/speech-to-scripture/check-access?deviceId=dev-1&issueToken=1");
    expect((init.headers as Record<string, string>)["X-Device-Secret"]).toBe("secret-1");
  });

  it("stops on a clear denial from the server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ allowed: false, reason: "daily_speech_limit" })));
    await expect(getSpeechCredential()).rejects.toMatchObject({
      name: "SpeechAccessDeniedError",
      reason: "daily_speech_limit",
    });
    await expect(getSpeechCredential()).rejects.toBeInstanceOf(SpeechAccessDeniedError);
  });

  it("falls back to the Cloudflare transcriber only on an outage, never on a denial", async () => {
    vi.stubEnv("VITE_CLOUDFLARE_STT_URL", "https://stt.example.test");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    expect(await getSpeechCredential()).toBe("https://stt.example.test");

    vi.stubGlobal("fetch", vi.fn(async () => respond({ allowed: false, reason: "insufficient_credits" })));
    await expect(getSpeechCredential()).rejects.toBeInstanceOf(SpeechAccessDeniedError);
  });
});

describe("getSpeechCredential (development)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("may use a key from .env on dev builds", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_ASSEMBLYAI_API_KEYS", "dev-key-1");
    expect(await getSpeechCredential()).toBe("dev-key-1");
  });
});
