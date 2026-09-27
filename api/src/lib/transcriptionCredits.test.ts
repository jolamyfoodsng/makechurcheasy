import assert from "node:assert/strict";
import test from "node:test";
import {
  secondsToCredits,
  creditsToSeconds,
  secondsToHours,
  formatDurationSummary,
  calculateTopupPricing,
  PLAN_INCLUDED_SECONDS,
  SECONDS_PER_CREDIT,
  CREDITS_PER_HOUR,
} from "./transcriptionCredits";

test("conversions between seconds, credits, and hours", () => {
  assert.equal(secondsToCredits(60), 1);
  assert.equal(secondsToCredits(30), 0.5);
  assert.equal(secondsToCredits(5), 0.083);
  assert.equal(secondsToCredits(600), 10);
  assert.equal(secondsToCredits(3600), 60);

  assert.equal(creditsToSeconds(1), 60);
  assert.equal(creditsToSeconds(10), 600);
  assert.equal(creditsToSeconds(60), 3600);

  assert.equal(secondsToHours(3600), 1);
  assert.equal(secondsToHours(18000), 5);
  assert.equal(secondsToHours(43200), 12);
  assert.equal(secondsToHours(108000), 30);
});

test("plan allowances correspond to specified hours and seconds", () => {
  // Basic: 12 hours = 720 credits = 43,200 seconds
  assert.equal(PLAN_INCLUDED_SECONDS.basic, 12 * 3600);
  assert.equal(PLAN_INCLUDED_SECONDS.basic / SECONDS_PER_CREDIT, 720);

  // Growth: 30 hours = 1,800 credits = 108,000 seconds
  assert.equal(PLAN_INCLUDED_SECONDS.growth, 30 * 3600);
  assert.equal(PLAN_INCLUDED_SECONDS.growth / SECONDS_PER_CREDIT, 1800);

  // Ambassador: 30 hours = 1,800 credits = 108,000 seconds default
  assert.equal(PLAN_INCLUDED_SECONDS.ambassador, 30 * 3600);
  assert.equal(PLAN_INCLUDED_SECONDS.ambassador / SECONDS_PER_CREDIT, 1800);

  // Free: 0 seconds
  assert.equal(PLAN_INCLUDED_SECONDS.free, 0);
});

test("formatDurationSummary formats various intervals cleanly", () => {
  assert.equal(formatDurationSummary(0), "0 min");
  assert.equal(formatDurationSummary(45), "45s");
  assert.equal(formatDurationSummary(125), "2m 5s");
  assert.equal(formatDurationSummary(3600), "1h");
  assert.equal(formatDurationSummary(43200), "12h");
  assert.equal(formatDurationSummary(43500), "12h 5m");
});

test("calculateTopupPricing returns valid packages and currency math", async () => {
  const result = await calculateTopupPricing("NGN");

  assert.equal(result.currency, "NGN");
  assert.ok(result.usdRate > 0);
  assert.equal(result.providerCostPerHourUSD, 0.027);
  assert.equal(result.profitPerHourNGN, 40);
  assert.ok(result.sellingPricePerHour > 40);

  assert.equal(result.packages.length, 5);
  const p1h = result.packages.find((p) => p.hours === 1);
  const p5h = result.packages.find((p) => p.hours === 5);
  const p10h = result.packages.find((p) => p.hours === 10);
  const p20h = result.packages.find((p) => p.hours === 20);
  const p50h = result.packages.find((p) => p.hours === 50);

  assert.ok(p1h && p5h && p10h && p20h && p50h);
  assert.equal(p1h.credits, 60);
  assert.equal(p5h.credits, 300);
  assert.equal(p10h.credits, 600);
  assert.equal(p20h.credits, 1200);
  assert.equal(p50h.credits, 3000);

  assert.equal(p1h.seconds, 3600);
  assert.equal(p5h.seconds, 18000);

  assert.ok(p1h.price > 0);
  assert.ok(p5h.price > 0);
  assert.ok(p5h.price <= p1h.price * 5);
  assert.ok(p10h.price <= p1h.price * 10);
});

test("deduction priority logic correctly splits included and purchased balances", () => {
  // Simulate the deduction algorithm
  function simulateDeduct(included: number, purchased: number, needed: number) {
    const deductIncluded = Math.min(included, needed);
    const remaining = needed - deductIncluded;
    const deductPurchased = Math.min(purchased, remaining);
    return {
      newIncluded: included - deductIncluded,
      newPurchased: purchased - deductPurchased,
      deductedTotal: deductIncluded + deductPurchased,
      source: deductIncluded > 0 && deductPurchased > 0 ? "split" : (deductIncluded > 0 ? "included" : "purchased"),
    };
  }

  // Case 1: User has 100 included, 0 purchased, needs 40s
  const r1 = simulateDeduct(100, 0, 40);
  assert.equal(r1.newIncluded, 60);
  assert.equal(r1.newPurchased, 0);
  assert.equal(r1.source, "included");

  // Case 2: User has 30 included, 120 purchased, needs 50s
  const r2 = simulateDeduct(30, 120, 50);
  assert.equal(r2.newIncluded, 0);
  assert.equal(r2.newPurchased, 100);
  assert.equal(r2.source, "split");

  // Case 3: User has 0 included, 100 purchased, needs 20s
  const r3 = simulateDeduct(0, 100, 20);
  assert.equal(r3.newIncluded, 0);
  assert.equal(r3.newPurchased, 80);
  assert.equal(r3.source, "purchased");
});
