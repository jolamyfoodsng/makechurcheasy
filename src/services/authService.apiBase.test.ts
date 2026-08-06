import { describe, expect, it } from "vitest";
import { resolveDeviceApiBaseCandidates } from "./authService";

describe("auth service device API base selection", () => {
  it("uses only production when the session was paired on production", () => {
    expect(resolveDeviceApiBaseCandidates("https://api.creatorstudioslabs.stream")).toEqual([
      "https://api.creatorstudioslabs.stream",
    ]);
  });

  it("keeps an explicit local API isolated from production", () => {
    expect(resolveDeviceApiBaseCandidates("http://localhost:3004")).toEqual([
      "http://localhost:3004",
    ]);
  });

  it("normalizes trailing slashes before comparing API bases", () => {
    expect(resolveDeviceApiBaseCandidates("https://api.creatorstudioslabs.stream/")).toEqual([
      "https://api.creatorstudioslabs.stream",
    ]);
  });
});
