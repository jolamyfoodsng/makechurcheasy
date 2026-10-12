import { describe, expect, it } from "vitest";
import { computeEntitledUntil, RENEWAL_GRACE_DAYS } from "./entitledUntil";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-12T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const base = {
  effectivePlan: "basic",
  trialActive: false,
  trialEndsAt: null,
  subscriptionStatus: "active" as const,
  subscriptionEndsAt: iso(NOW + 10 * DAY),
  renewalDate: null,
};

describe("computeEntitledUntil", () => {
  it("is null on Free and for admins", () => {
    expect(computeEntitledUntil({ ...base, effectivePlan: "free" }, NOW)).toBe(null);
    expect(computeEntitledUntil({ ...base, role: "admin" }, NOW)).toBe(null);
  });

  it("is the period end for a cancelling subscription, + grace when it renews", () => {
    expect(computeEntitledUntil(base, NOW)).toBe(iso(NOW + 10 * DAY));
    expect(computeEntitledUntil({ ...base, renewalDate: iso(NOW + 10 * DAY) }, NOW)).toBe(iso(NOW + (10 + RENEWAL_GRACE_DAYS) * DAY));
  });

  it("uses the trial end during a trial", () => {
    expect(computeEntitledUntil({ ...base, subscriptionStatus: "none", subscriptionEndsAt: null, trialActive: true, trialEndsAt: iso(NOW + 5 * DAY) }, NOW)).toBe(iso(NOW + 5 * DAY));
  });

  it("takes the latest end among grants, and null when one has no end", () => {
    const amb = { active: true, expiresAt: iso(NOW + 40 * DAY) };
    expect(computeEntitledUntil({ ...base, ambassador: amb }, NOW)).toBe(iso(NOW + 40 * DAY));
    expect(computeEntitledUntil({ ...base, ambassador: { active: true, expiresAt: null } }, NOW)).toBe(null);
    expect(computeEntitledUntil({ ...base, subscriptionEndsAt: null }, NOW)).toBe(null);
  });

  it("ignores grants that already ended", () => {
    expect(computeEntitledUntil({ ...base, adminTemporaryPlan: { active: true, expiresAt: iso(NOW - DAY) } }, NOW)).toBe(iso(NOW + 10 * DAY));
  });
});
