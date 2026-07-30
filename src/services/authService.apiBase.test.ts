import { describe, expect, it } from "vitest";
import { resolveDeviceApiBaseCandidates } from "./authService";

describe("auth service device API base selection", () => {
  it("uses only production when the session was paired on production", () => {
    expect(resolveDeviceApiBaseCandidates("https://api.creatorstudioslabs.stream")).toEqual([
      "https://api.creatorstudioslabs.stream",
    ]);
  });

  it("tries production after a local API base", () => {
    expect(resolveDeviceApiBaseCandidates("http://localhost:3004")).toEqual([
      "http://localhost:3004",
      "https://api.creatorstudioslabs.stream",
    ]);
  });

  it("normalizes trailing slashes before comparing API bases", () => {
    expect(resolveDeviceApiBaseCandidates("https://api.creatorstudioslabs.stream/")).toEqual([
      "https://api.creatorstudioslabs.stream",
    ]);
  });
});
