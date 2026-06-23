/**
 * storage.test.ts — Tests for storage tracking server-side logic patterns.
 *
 * Tests quota enforcement, usage calculation, and plan-based storage limits.
 */

import { describe, it, expect } from "vitest";

// ── Storage quota logic (mirrors API route) ──

const GB = 1024 * 1024 * 1024;

const STORAGE_QUOTAS: Record<string, number> = {
  free: 0,
  basic: 1,
  starter: 5,
  growth: 20,
  pro: 200,
};

function getStorageQuota(plan: string): number {
  const gb = STORAGE_QUOTAS[plan] ?? 0;
  return gb === -1 ? -1 : gb * GB;
}

function checkStorageQuota(
  plan: string,
  usedBytes: number
): { allowed: boolean; quotaBytes: number; overBy?: number } {
  const quotaBytes = getStorageQuota(plan);
  if (quotaBytes === -1) return { allowed: true, quotaBytes: -1 };
  if (quotaBytes === 0) return { allowed: false, quotaBytes: 0 };
  if (usedBytes > quotaBytes) {
    return { allowed: false, quotaBytes, overBy: usedBytes - quotaBytes };
  }
  return { allowed: true, quotaBytes };
}

function formatBytes(bytes: number): { gb: number; display: string } {
  const gb = Number((bytes / GB).toFixed(2));
  return { gb, display: `${gb} GB` };
}

function getPercentUsed(usedBytes: number, quotaBytes: number): number {
  if (quotaBytes <= 0) return 0;
  return Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
}

// ── Tests ──

describe("Storage quota by plan", () => {
  it("free tier has 0 GB quota", () => {
    expect(getStorageQuota("free")).toBe(0);
  });

  it("basic tier has 1 GB quota", () => {
    expect(getStorageQuota("basic")).toBe(1 * GB);
  });

  it("starter tier has 5 GB quota", () => {
    expect(getStorageQuota("starter")).toBe(5 * GB);
  });

  it("growth tier has 20 GB quota", () => {
    expect(getStorageQuota("growth")).toBe(20 * GB);
  });

  it("pro tier has 200 GB quota", () => {
    expect(getStorageQuota("pro")).toBe(200 * GB);
  });
});

describe("Storage quota enforcement", () => {
  it("allows usage under quota", () => {
    const result = checkStorageQuota("growth", 10 * GB);
    expect(result.allowed).toBe(true);
  });

  it("allows usage at exactly quota", () => {
    const result = checkStorageQuota("growth", 20 * GB);
    expect(result.allowed).toBe(true);
  });

  it("blocks usage over quota", () => {
    const result = checkStorageQuota("growth", 21 * GB);
    expect(result.allowed).toBe(false);
    expect(result.overBy).toBe(1 * GB);
  });

  it("allows pro tier within 200 GB quota", () => {
    const result = checkStorageQuota("pro", 100 * GB);
    expect(result.allowed).toBe(true);
  });

  it("blocks pro tier over 200 GB quota", () => {
    const result = checkStorageQuota("pro", 201 * GB);
    expect(result.allowed).toBe(false);
    expect(result.overBy).toBe(1 * GB);
  });

  it("blocks any usage on free tier", () => {
    const result = checkStorageQuota("free", 1);
    expect(result.allowed).toBe(false);
  });

  it("reports correct overBy amount", () => {
    const result = checkStorageQuota("basic", 2 * GB);
    expect(result.overBy).toBe(1 * GB);
  });
});

describe("Byte formatting", () => {
  it("formats bytes to GB", () => {
    expect(formatBytes(GB).gb).toBe(1);
    expect(formatBytes(5 * GB).gb).toBe(5);
    expect(formatBytes(0).gb).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    const result = formatBytes(1.5 * GB);
    expect(result.gb).toBe(1.5);
    expect(result.display).toBe("1.5 GB");
  });
});

describe("Percent used calculation", () => {
  it("calculates correct percentage", () => {
    expect(getPercentUsed(10 * GB, 20 * GB)).toBe(50);
    expect(getPercentUsed(20 * GB, 20 * GB)).toBe(100);
    expect(getPercentUsed(0, 20 * GB)).toBe(0);
  });

  it("caps at 100%", () => {
    expect(getPercentUsed(30 * GB, 20 * GB)).toBe(100);
  });

  it("returns 0 for unlimited quota", () => {
    expect(getPercentUsed(999 * GB, -1)).toBe(0);
  });

  it("returns 0 for zero quota", () => {
    expect(getPercentUsed(100, 0)).toBe(0);
  });
});
