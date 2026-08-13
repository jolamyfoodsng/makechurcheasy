/**
 * entitlementClient.test.ts — Verify the entitlement client works correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock fetch to simulate server responses
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock licenseService to avoid its internal dependencies
vi.mock("./licenseService", () => ({
  getEffectivePlan: vi.fn((user: { plan?: string } | null) => {
    if (!user) return "free";
    return user.plan || "free";
  }),
}));

import {
  checkEntitlement,
  checkEntitlementSync,
  getFeatureLimit,
  getEntitlementConfig,
} from "./entitlementClient";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("checkEntitlement (async — server)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns allowed=true when under limit", async () => {
    const result = await checkEntitlement("songs", "basic", 5);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.current).toBe(5);
  });

  it("returns allowed=false when at limit", async () => {
    const result = await checkEntitlement("songs", "free", 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Songs limit reached");
  });

  it("returns allowed=true for basic plan under songs limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: true, limit: 100, current: 5 }),
    });

    const result = await checkEntitlement("songs", "basic", 5);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
  });

  it("returns allowed=true for boolean feature when enabled", async () => {
    const result = await checkEntitlement("multiview", "growth");
    expect(result.allowed).toBe(true);
  });

  it("returns allowed=false for boolean feature when disabled", async () => {
    const result = await checkEntitlement("multiview", "free");
    expect(result.allowed).toBe(false);
    expect(result.requiredPlan).toBe("basic");
  });

  it("allows Basic to use four of five multiview templates", async () => {
    const result = await checkEntitlement("multiviewTemplates", "basic", 4);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(1);
  });

  it("blocks Basic when the fifth multiview template is already used", async () => {
    const result = await checkEntitlement("multiviewTemplates", "basic", 5);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(5);
    expect(result.requiredPlan).toBe("growth");
  });

  it("falls back to local config when server is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await checkEntitlement("songs", "free", 2);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(3);
  });

  it("falls back when server returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await checkEntitlement("images", "basic", 10);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
  });

  it("defaults to free plan when plan is undefined", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: false, limit: 3, current: 3 }),
    });

    const result = await checkEntitlement("songs", undefined, 3);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(3);
  });
});

describe("checkEntitlementSync (local fallback)", () => {
  it("returns allowed=true for free plan under limit", () => {
    const result = checkEntitlementSync("songs", "free", 1);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(3);
  });

  it("returns allowed=false for free plan at limit", () => {
    const result = checkEntitlementSync("songs", "free", 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Songs limit reached");
  });

  it("returns allowed=true for basic plan under songs limit", () => {
    const result = checkEntitlementSync("songs", "basic", 5);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
  });

  it("returns allowed=false for disabled boolean feature", () => {
    const result = checkEntitlementSync("multiview", "free");
    expect(result.allowed).toBe(false);
    expect(result.requiredPlan).toBe("basic");
  });

  it("allows Basic multiview but keeps Growth-only Dock features locked", () => {
    expect(checkEntitlementSync("multiview", "basic").allowed).toBe(true);
    expect(checkEntitlementSync("tickers", "basic").allowed).toBe(false);
    expect(checkEntitlementSync("lowerThirds", "basic").allowed).toBe(false);
    expect(checkEntitlementSync("countdowns", "basic").allowed).toBe(false);
  });

  it("enforces the five-template Basic limit and Growth unlimited access", () => {
    expect(checkEntitlementSync("multiviewTemplates", "free", 0).allowed).toBe(false);
    expect(checkEntitlementSync("multiviewTemplates", "basic", 4).allowed).toBe(true);
    expect(checkEntitlementSync("multiviewTemplates", "basic", 5).allowed).toBe(false);
    expect(checkEntitlementSync("multiviewTemplates", "growth", 500).allowed).toBe(true);
  });

  it("returns allowed=true for enabled boolean feature", () => {
    const result = checkEntitlementSync("multiview", "pro");
    expect(result.allowed).toBe(true);
  });

  it("defaults to free plan for null/undefined", () => {
    const result = checkEntitlementSync("songs", null as unknown as string, 3);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(3);
  });
});

describe("getFeatureLimit", () => {
  it("returns 3 for free plan songs", () => {
    expect(getFeatureLimit("songs", "free")).toBe(3);
  });

  it("returns 100 for basic plan songs", () => {
    expect(getFeatureLimit("songs", "basic")).toBe(100);
  });

  it("returns -1 for growth plan songs (unlimited)", () => {
    expect(getFeatureLimit("songs", "growth")).toBe(-1);
  });

  it("returns 0 for disabled boolean feature", () => {
    expect(getFeatureLimit("multiview", "free")).toBe(0);
  });

  it("returns -1 for enabled boolean feature", () => {
    expect(getFeatureLimit("multiview", "growth")).toBe(-1);
  });

  it("returns 3 for free plan images", () => {
    expect(getFeatureLimit("images", "free")).toBe(3);
  });

  it("returns -1 for growth plan everything", () => {
    expect(getFeatureLimit("songs", "growth")).toBe(-1);
    expect(getFeatureLimit("images", "growth")).toBe(-1);
    expect(getFeatureLimit("videos", "growth")).toBe(-1);
  });
});

describe("getEntitlementConfig", () => {
  it("returns plan config from server when available", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plans: { free: { songs: 3 }, basic: { songs: 30 } },
      }),
    });

    const config = await getEntitlementConfig();
    expect(config).toHaveProperty("free");
  });

  it("falls back to embedded config when server unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const config = await getEntitlementConfig();
    expect(config).toHaveProperty("free");
    expect(config.free.songs).toBe(3);
  });
});
