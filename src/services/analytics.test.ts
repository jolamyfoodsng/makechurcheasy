/**
 * analytics.test.ts — Tests for analytics server-side logic patterns.
 *
 * Tests event filtering, aggregation, and entitlement gating
 * that runs on the server side.
 */

import { describe, it, expect } from "vitest";

// ── Entitlement check (mirrors API route logic) ──

const ENTITLEMENTS = {
  free: { advancedAnalytics: false },
  basic: { advancedAnalytics: false },
  starter: { advancedAnalytics: false },
  growth: { advancedAnalytics: true },
  pro: { advancedAnalytics: true },
};

function checkAnalyticsEntitlement(plan: string): { allowed: boolean; error?: string } {
  const ent = ENTITLEMENTS[plan as keyof typeof ENTITLEMENTS];
  if (!ent?.advancedAnalytics) {
    return { allowed: false, error: "Advanced analytics requires Growth plan or higher" };
  }
  return { allowed: true };
}

// ── Aggregation logic (mirrors server aggregation) ──

interface AnalyticsEvent {
  userId: string;
  event: string;
  createdAt: string;
}

function aggregateEvents(events: AnalyticsEvent[], days: number): { event: string; count: number }[] {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  const filtered = events.filter((e) => e.createdAt >= sinceStr);
  const counts = new Map<string, number>();
  for (const e of filtered) {
    counts.set(e.event, (counts.get(e.event) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Event validation ──

function validateEvent(event: string): { valid: boolean; error?: string } {
  if (!event || typeof event !== "string") {
    return { valid: false, error: "event is required" };
  }
  if (event.length > 100) {
    return { valid: false, error: "event name too long" };
  }
  return { valid: true };
}

// ── Tests ──

describe("Analytics entitlement checks", () => {
  it("blocks free, basic, and starter", () => {
    for (const tier of ["free", "basic", "starter"]) {
      expect(checkAnalyticsEntitlement(tier).allowed).toBe(false);
    }
  });

  it("allows growth and pro", () => {
    for (const tier of ["growth", "pro"]) {
      expect(checkAnalyticsEntitlement(tier).allowed).toBe(true);
    }
  });
});

describe("Event aggregation", () => {
  const now = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  const events: AnalyticsEvent[] = [
    { userId: "u1", event: "song_created", createdAt: daysAgo(1) },
    { userId: "u1", event: "song_created", createdAt: daysAgo(2) },
    { userId: "u1", event: "media_uploaded", createdAt: daysAgo(3) },
    { userId: "u1", event: "song_created", createdAt: daysAgo(40) }, // outside window
  ];

  it("aggregates events within the time window", () => {
    const result = aggregateEvents(events, 30);
    expect(result).toHaveLength(2);
    expect(result[0].event).toBe("song_created");
    expect(result[0].count).toBe(2);
    expect(result[1].event).toBe("media_uploaded");
    expect(result[1].count).toBe(1);
  });

  it("excludes events outside the time window", () => {
    const result = aggregateEvents(events, 30);
    const songCount = result.find((r) => r.event === "song_created");
    expect(songCount?.count).toBe(2); // not 3 (40 days ago excluded)
  });

  it("returns empty array for no events", () => {
    expect(aggregateEvents([], 30)).toHaveLength(0);
  });

  it("sorts by count descending", () => {
    const result = aggregateEvents(events, 30);
    expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
  });
});

describe("Event validation", () => {
  it("accepts valid event names", () => {
    expect(validateEvent("song_created").valid).toBe(true);
    expect(validateEvent("media_uploaded").valid).toBe(true);
  });

  it("rejects empty events", () => {
    expect(validateEvent("").valid).toBe(false);
  });

  it("rejects events over 100 chars", () => {
    expect(validateEvent("a".repeat(101)).valid).toBe(false);
  });

  it("accepts events at exactly 100 chars", () => {
    expect(validateEvent("a".repeat(100)).valid).toBe(true);
  });
});
