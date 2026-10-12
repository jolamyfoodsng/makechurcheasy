import { describe, expect, it } from "vitest";
import {
  capPlanForOffline,
  evaluateOfflineEntitlement,
  resolveEntitledUntilMs,
  RENEWAL_GRACE_DAYS,
} from "./offlineEntitlement";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-12T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("resolveEntitledUntilMs", () => {
  it("uses entitledUntil from newer servers, including null for no end date", () => {
    expect(resolveEntitledUntilMs({ plan: "basic", entitledUntil: iso(NOW + DAY) })).toBe(NOW + DAY);
    expect(resolveEntitledUntilMs({ plan: "basic", entitledUntil: null, subscriptionEndsAt: iso(NOW) })).toBe(null);
  });

  it("falls back to trial end, then period end (+ grace when it renews)", () => {
    expect(resolveEntitledUntilMs({ plan: "growth", trialActive: true, trialEndsAt: iso(NOW + 3 * DAY) })).toBe(NOW + 3 * DAY);
    expect(resolveEntitledUntilMs({ plan: "basic", subscriptionEndsAt: iso(NOW) })).toBe(NOW);
    expect(resolveEntitledUntilMs({ plan: "basic", subscriptionEndsAt: iso(NOW), renewalDate: iso(NOW) })).toBe(NOW + RENEWAL_GRACE_DAYS * DAY);
  });

  it("is null on the Free plan", () => {
    expect(resolveEntitledUntilMs({ plan: "free", entitledUntil: iso(NOW) })).toBe(null);
  });
});

describe("evaluateOfflineEntitlement", () => {
  const paid = { plan: "basic", entitledUntil: iso(NOW + 30 * DAY) };

  it("under 14 days offline: nothing to do", () => {
    const s = evaluateOfflineEntitlement(paid, NOW - 13 * DAY, NOW);
    expect(s.syncDue).toBe(false);
    expect(s.paidPaused).toBe(false);
    expect(capPlanForOffline("basic", s)).toBe("basic");
  });

  it("14 days offline: ask to sync, paid still works", () => {
    const s = evaluateOfflineEntitlement(paid, NOW - 14 * DAY, NOW);
    expect(s.syncDue).toBe(true);
    expect(s.paidPaused).toBe(false);
    expect(s.daysUntilPause).toBe(7);
    expect(capPlanForOffline("basic", s)).toBe("basic");
  });

  it("21 days offline: paid features pause (Free) but nothing locks", () => {
    const s = evaluateOfflineEntitlement(paid, NOW - 21 * DAY, NOW);
    expect(s.paidPaused).toBe(true);
    expect(capPlanForOffline("basic", s)).toBe("free");
    expect(capPlanForOffline("free", s)).toBe("free");
  });

  it("the moment the paid period ends, the plan is Free, even right after a sync", () => {
    const ended = { plan: "basic", entitledUntil: iso(NOW - 1000) };
    const s = evaluateOfflineEntitlement(ended, NOW - DAY, NOW);
    expect(s.entitlementEnded).toBe(true);
    expect(capPlanForOffline("growth", s)).toBe("free");
  });

  it("never synced: no prompt, no pause", () => {
    const s = evaluateOfflineEntitlement(paid, 0, NOW);
    expect(s.syncDue).toBe(false);
    expect(s.paidPaused).toBe(false);
  });
});
