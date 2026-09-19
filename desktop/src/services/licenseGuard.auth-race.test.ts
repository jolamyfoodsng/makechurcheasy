import { describe, expect, it, vi } from "vitest";

vi.mock("./authService", () => ({
  getDeviceApiBaseCandidates: () => ["https://api.creatorstudioslabs.stream"],
  getDeviceId: () => null,
  getDeviceSecret: () => null,
  getSession: () => null,
  rememberSessionApiBase: vi.fn(),
}));

import { getState, verify } from "./licenseGuard";

describe("license guard before desktop pairing", () => {
  it("does not turn a missing session into a removed-device lock", async () => {
    await expect(verify()).resolves.toBe(true);
    expect(getState().lockReason).toBeNull();
  });
});
