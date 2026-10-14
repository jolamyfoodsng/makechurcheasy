import { describe, expect, it, vi } from "vitest";
import { buildTokenUrl, mintStreamingToken } from "./assemblyAiToken";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe("mintStreamingToken", () => {
  it("requests a short-lived token with the server key and returns it", async () => {
    const fetchImpl = vi.fn(async () => ok({ token: "tok123", expires_in_seconds: 60 }));
    const result = await mintStreamingToken("secret-key", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ token: "tok123", expiresInSeconds: 60 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(buildTokenUrl());
    expect(url).toContain("expires_in_seconds=60");
    expect((init.headers as Record<string, string>).Authorization).toBe("secret-key");
  });

  it("returns null without a key and never calls out", async () => {
    const fetchImpl = vi.fn();
    expect(await mintStreamingToken("  ", fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when AssemblyAI rejects, errors, or sends no token", async () => {
    expect(await mintStreamingToken("k", (async () => ({ ok: false, status: 401 }) as Response) as unknown as typeof fetch)).toBeNull();
    expect(await mintStreamingToken("k", (async () => { throw new Error("boom"); }) as unknown as typeof fetch)).toBeNull();
    expect(await mintStreamingToken("k", (async () => ok({})) as unknown as typeof fetch)).toBeNull();
  });
});
