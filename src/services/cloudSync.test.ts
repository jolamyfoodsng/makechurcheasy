/**
 * cloudSync.test.ts — Tests for cloud sync server-side logic patterns.
 *
 * Tests the entitlement check, data filtering, and backup/restore
 * logic that runs on the server side (API routes).
 */

import { describe, it, expect } from "vitest";

// ── Entitlement check (mirrors API route logic) ──

const ENTITLEMENTS = {
  free: { cloudSync: false, cloudStorageGB: 0 },
  basic: { cloudSync: false, cloudStorageGB: 1 },
  starter: { cloudSync: false, cloudStorageGB: 5 },
  growth: { cloudSync: true, cloudStorageGB: 20 },
  pro: { cloudSync: true, cloudStorageGB: 200 },
};

function checkCloudEntitlement(plan: string): { allowed: boolean; error?: string } {
  const ent = ENTITLEMENTS[plan as keyof typeof ENTITLEMENTS];
  if (!ent?.cloudSync) {
    return { allowed: false, error: "Cloud sync requires Growth plan or higher" };
  }
  return { allowed: true };
}

// ── Data filtering (mirrors restore route logic) ──

function filterBackupData(
  data: Record<string, unknown[]>,
  categories?: string[]
): Record<string, unknown[]> {
  if (!Array.isArray(categories) || categories.length === 0) return data;
  const filtered: Record<string, unknown[]> = {};
  for (const cat of categories) {
    if (data[cat]) filtered[cat] = data[cat];
  }
  return filtered;
}

// ── Record counting (mirrors backup route logic) ──

function countRecords(data: Record<string, unknown[]>): number {
  return Object.values(data).reduce(
    (sum, val) => sum + (Array.isArray(val) ? val.length : 0),
    0
  );
}

// ── Tests ──

describe("Cloud sync entitlement checks", () => {
  it("blocks free plan", () => {
    const result = checkCloudEntitlement("free");
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("Growth");
  });

  it("blocks basic plan", () => {
    expect(checkCloudEntitlement("basic").allowed).toBe(false);
  });

  it("blocks starter plan", () => {
    expect(checkCloudEntitlement("starter").allowed).toBe(false);
  });

  it("allows growth plan", () => {
    expect(checkCloudEntitlement("growth").allowed).toBe(true);
  });

  it("allows pro plan", () => {
    expect(checkCloudEntitlement("pro").allowed).toBe(true);
  });
});

describe("Backup data filtering", () => {
  const sampleData = {
    songs: [{ id: 1 }, { id: 2 }],
    media: [{ id: 3 }],
    themes: [{ id: 4 }, { id: 5 }],
  };

  it("returns all data when no categories specified", () => {
    const result = filterBackupData(sampleData);
    expect(Object.keys(result)).toHaveLength(3);
    expect(result.songs).toHaveLength(2);
  });

  it("filters to specific categories", () => {
    const result = filterBackupData(sampleData, ["songs"]);
    expect(result.songs).toHaveLength(2);
    expect(result.media).toBeUndefined();
    expect(result.themes).toBeUndefined();
  });

  it("handles multiple categories", () => {
    const result = filterBackupData(sampleData, ["songs", "themes"]);
    expect(result.songs).toHaveLength(2);
    expect(result.themes).toHaveLength(2);
    expect(result.media).toBeUndefined();
  });

  it("skips non-existent categories", () => {
    const result = filterBackupData(sampleData, ["songs", "nonexistent"]);
    expect(result.songs).toHaveLength(2);
    expect(result.nonexistent).toBeUndefined();
  });

  it("returns all data for empty categories array (no filter)", () => {
    const result = filterBackupData(sampleData, []);
    expect(Object.keys(result)).toHaveLength(3);
  });
});

describe("Record counting", () => {
  it("counts records across categories", () => {
    const data = {
      songs: [{ id: 1 }, { id: 2 }],
      media: [{ id: 3 }],
      themes: [],
    };
    expect(countRecords(data)).toBe(3);
  });

  it("returns 0 for empty data", () => {
    expect(countRecords({})).toBe(0);
  });

  it("handles non-array values gracefully", () => {
    const data = { songs: [{ id: 1 }], config: "not-an-array" as any };
    expect(countRecords(data)).toBe(1);
  });
});
