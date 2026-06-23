/**
 * apiAccess.test.ts — Tests for API access control logic.
 *
 * Validates API key authentication patterns, rate limiting,
 * entitlement gating for apiAccess feature, and key lifecycle.
 */

import { describe, it, expect } from "vitest";

// ── Inline logic (mirrors apiKeyAuth.ts patterns) ──

interface ApiKeyDoc {
  _id?: string;
  userId: string;
  keyHash: string;
  keyName: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number; // requests per day
  requestCount: number;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  revokedAt?: string;
  status: "active" | "revoked" | "expired";
}

/** Check if an API key is valid. */
function validateApiKey(key: ApiKeyDoc, now: Date): { valid: boolean; reason?: string } {
  if (key.status === "revoked") {
    return { valid: false, reason: "Key has been revoked" };
  }
  if (key.status === "expired") {
    return { valid: false, reason: "Key has expired" };
  }
  if (key.expiresAt && new Date(key.expiresAt).getTime() < now.getTime()) {
    return { valid: false, reason: "Key has expired" };
  }
  return { valid: true };
}

/** Check rate limit. */
function checkRateLimit(key: ApiKeyDoc): { allowed: boolean; remaining: number; reason?: string } {
  const remaining = Math.max(0, key.rateLimit - key.requestCount);
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, reason: "Rate limit exceeded" };
  }
  return { allowed: true, remaining };
}

/** Check if a key has the required scope. */
function hasScope(key: ApiKeyDoc, requiredScope: string): boolean {
  if (key.scopes.includes("*")) return true;
  return key.scopes.includes(requiredScope);
}

/** Extract key prefix from a raw API key. */
function extractKeyPrefix(rawKey: string): string {
  return rawKey.substring(0, 12);
}

/** Check if a scope is valid for the given entitlement tier. */
function isScopeAllowedForPlan(
  plan: string,
  scope: string,
): boolean {
  const PLAN_SCOPES: Record<string, string[]> = {
    free: [],
    basic: [],
    starter: [],
    growth: [],
    pro: ["*", "read", "write", "songs", "media", "themes", "bible", "cloud-sync"],
  };

  const allowedScopes = PLAN_SCOPES[plan] || [];
  return allowedScopes.includes("*") || allowedScopes.includes(scope);
}

// ── Tests ──

describe("API access — key validation", () => {
  const now = new Date("2026-04-15T12:00:00Z");

  it("validates active key", () => {
    const key: ApiKeyDoc = {
      _id: "k1",
      userId: "u1",
      keyHash: "abc123",
      keyName: "Test Key",
      keyPrefix: "mce_live_ab",
      scopes: ["*"],
      rateLimit: 1000,
      requestCount: 0,
      createdAt: "2026-04-01T00:00:00Z",
      status: "active",
    };
    expect(validateApiKey(key, now).valid).toBe(true);
  });

  it("rejects revoked key", () => {
    const key: ApiKeyDoc = {
      _id: "k1",
      userId: "u1",
      keyHash: "abc123",
      keyName: "Test Key",
      keyPrefix: "mce_live_ab",
      scopes: ["*"],
      rateLimit: 1000,
      requestCount: 0,
      createdAt: "2026-04-01T00:00:00Z",
      status: "revoked",
      revokedAt: "2026-04-10T00:00:00Z",
    };
    const result = validateApiKey(key, now);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("revoked");
  });

  it("rejects expired key", () => {
    const key: ApiKeyDoc = {
      _id: "k1",
      userId: "u1",
      keyHash: "abc123",
      keyName: "Test Key",
      keyPrefix: "mce_live_ab",
      scopes: ["*"],
      rateLimit: 1000,
      requestCount: 0,
      createdAt: "2026-04-01T00:00:00Z",
      expiresAt: "2026-04-10T00:00:00Z",
      status: "active",
    };
    const result = validateApiKey(key, now);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("rejects key with expired status even if expiresAt is future", () => {
    const key: ApiKeyDoc = {
      _id: "k1",
      userId: "u1",
      keyHash: "abc123",
      keyName: "Test Key",
      keyPrefix: "mce_live_ab",
      scopes: ["*"],
      rateLimit: 1000,
      requestCount: 0,
      createdAt: "2026-04-01T00:00:00Z",
      status: "expired",
    };
    expect(validateApiKey(key, now).valid).toBe(false);
  });
});

describe("API access — rate limiting", () => {
  it("allows when under limit", () => {
    const key: ApiKeyDoc = {
      _id: "k1", userId: "u1", keyHash: "", keyName: "", keyPrefix: "",
      scopes: ["*"], rateLimit: 1000, requestCount: 500, createdAt: "", status: "active",
    };
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(500);
  });

  it("allows at exactly limit - 1", () => {
    const key: ApiKeyDoc = {
      _id: "k1", userId: "u1", keyHash: "", keyName: "", keyPrefix: "",
      scopes: ["*"], rateLimit: 1000, requestCount: 999, createdAt: "", status: "active",
    };
    expect(checkRateLimit(key).allowed).toBe(true);
    expect(checkRateLimit(key).remaining).toBe(1);
  });

  it("blocks at exactly limit", () => {
    const key: ApiKeyDoc = {
      _id: "k1", userId: "u1", keyHash: "", keyName: "", keyPrefix: "",
      scopes: ["*"], rateLimit: 1000, requestCount: 1000, createdAt: "", status: "active",
    };
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("allows fresh key with 0 requests", () => {
    const key: ApiKeyDoc = {
      _id: "k1", userId: "u1", keyHash: "", keyName: "", keyPrefix: "",
      scopes: ["*"], rateLimit: 1000, requestCount: 0, createdAt: "", status: "active",
    };
    expect(checkRateLimit(key).allowed).toBe(true);
    expect(checkRateLimit(key).remaining).toBe(1000);
  });
});

describe("API access — scope checking", () => {
  it("wildcard scope allows everything", () => {
    const key: ApiKeyDoc = {
      _id: "k1", userId: "u1", keyHash: "", keyName: "", keyPrefix: "",
      scopes: ["*"], rateLimit: 1000, requestCount: 0, createdAt: "", status: "active",
    };
    expect(hasScope(key, "songs")).toBe(true);
    expect(hasScope(key, "anything")).toBe(true);
  });

  it("specific scope allows matching", () => {
    const key: ApiKeyDoc = {
      _id: "k1", userId: "u1", keyHash: "", keyName: "", keyPrefix: "",
      scopes: ["read", "songs"], rateLimit: 1000, requestCount: 0, createdAt: "", status: "active",
    };
    expect(hasScope(key, "read")).toBe(true);
    expect(hasScope(key, "songs")).toBe(true);
    expect(hasScope(key, "write")).toBe(false);
  });

  it("empty scopes allow nothing", () => {
    const key: ApiKeyDoc = {
      _id: "k1", userId: "u1", keyHash: "", keyName: "", keyPrefix: "",
      scopes: [], rateLimit: 1000, requestCount: 0, createdAt: "", status: "active",
    };
    expect(hasScope(key, "read")).toBe(false);
  });
});

describe("API access — key prefix extraction", () => {
  it("extracts first 12 characters", () => {
    expect(extractKeyPrefix("mce_live_abcdefgh1234")).toBe("mce_live_abc");
  });

  it("handles short keys", () => {
    expect(extractKeyPrefix("short")).toBe("short");
  });
});

describe("API access — plan-gated scopes", () => {
  it("pro plan allows all scopes", () => {
    expect(isScopeAllowedForPlan("pro", "read")).toBe(true);
    expect(isScopeAllowedForPlan("pro", "write")).toBe(true);
    expect(isScopeAllowedForPlan("pro", "songs")).toBe(true);
    expect(isScopeAllowedForPlan("pro", "anything")).toBe(true);
  });

  it("free plan allows no scopes", () => {
    expect(isScopeAllowedForPlan("free", "read")).toBe(false);
    expect(isScopeAllowedForPlan("free", "songs")).toBe(false);
  });

  it("basic plan allows no scopes", () => {
    expect(isScopeAllowedForPlan("basic", "read")).toBe(false);
  });

  it("growth plan allows no scopes", () => {
    expect(isScopeAllowedForPlan("growth", "read")).toBe(false);
  });

  it("unknown plan allows no scopes", () => {
    expect(isScopeAllowedForPlan("unknown", "read")).toBe(false);
  });
});
