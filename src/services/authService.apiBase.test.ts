import { describe, expect, it } from "vitest";
import {
  formatPairingCodeForDisplay,
  normalizePairingCode,
  resolveDeviceApiBaseCandidates,
  resolvePairingApiBaseCandidates,
} from "./authService";

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

describe("pairing code normalization", () => {
  it("accepts spaces, hyphens, lowercase text, and copied Unicode spacing", () => {
    expect(normalizePairingCode("r 5 h n\u00a0u-l b d")).toBe("R5HNULBD");
  });

  it("formats the canonical code only for display", () => {
    expect(formatPairingCodeForDisplay("R5HNULBD")).toBe("R5HN-ULBD");
  });

  it("tries the dashboard proxy only for pairing redemption", () => {
    expect(resolvePairingApiBaseCandidates("https://api.creatorstudioslabs.stream")).toEqual([
      "https://api.creatorstudioslabs.stream",
      "https://makechurcheazy.com",
    ]);
  });

  it("keeps local pairing traffic local", () => {
    expect(resolvePairingApiBaseCandidates("http://localhost:3004")).toEqual([
      "http://localhost:3004",
      "http://localhost:4000",
    ]);
  });
});
