import assert from "node:assert/strict";
import test from "node:test";
import {
  DAY_MS,
  DEFAULT_LADDERS,
  DEFAULT_OFFER_SETTINGS,
  buildRungButtons,
  closesAtAfterFreeClaim,
  decideNextAction,
  describeRung,
  isHoldoutUser,
  isOfferActionable,
  mergeLadders,
  offerCodeFor,
  qualifiesAsLightUse,
  rungKind,
  sanitizeLadder,
  sanitizeRung,
  sanitizeSettings,
  type DecisionInput,
  type OfferLadder,
  type OfferRecordLite,
} from "./offerLadderLogic.ts";

const NOW = new Date("2026-10-10T04:15:00.000Z");
const days = (n: number) => n * DAY_MS;
const iso = (ms: number) => new Date(ms).toISOString();

const winback = DEFAULT_LADDERS.find((l) => l.id === "post_trial_winback") as OfferLadder;
const rescue = DEFAULT_LADDERS.find((l) => l.id === "light_use_rescue") as OfferLadder;

const settings = { ...DEFAULT_OFFER_SETTINGS, enabled: true };

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    ladder: winback,
    settings,
    now: NOW,
    anchorAt: new Date(NOW.getTime() - days(3)),
    offers: [],
    journeyState: null,
    otherOpenOffer: false,
    offersLast90Days: 0,
    freeDaysGranted: 0,
    weeklyBudgetExhausted: false,
    ...overrides,
  };
}

function offer(rungIndex: number, status: OfferRecordLite["status"], closesAtMs: number): OfferRecordLite {
  return { rungIndex, status, closesAt: iso(closesAtMs), issuedAt: iso(closesAtMs - days(5)) };
}

test("every default rung offers something and every code is checkout-safe", () => {
  for (const ladder of DEFAULT_LADDERS) {
    assert.ok(ladder.rungs.length > 0);
    ladder.rungs.forEach((r, index) => {
      assert.ok(r.trialExtensionDays > 0 || r.freeDays > 0 || r.percentOff > 0, `${ladder.id}/${r.id} offers nothing`);
      assert.match(offerCodeFor(ladder, index), /^[A-Z0-9_-]+$/);
    });
  }
});

test("free time is always Basic and percent discounts default to Basic", () => {
  for (const ladder of DEFAULT_LADDERS) {
    for (const r of ladder.rungs) assert.deepEqual(r.plans, ["basic"]);
  }
});

test("rung kinds and descriptions", () => {
  assert.equal(rungKind(rescue.rungs[0]), "trial_extension");
  assert.equal(describeRung(rescue.rungs[0]), "+21 days on your trial");
  assert.equal(rungKind(winback.rungs[0]), "percent_off");
  assert.equal(describeRung(winback.rungs[0]), "50% off for 1 month");
  assert.equal(rungKind(winback.rungs[1]), "free_period");
  assert.equal(describeRung(winback.rungs[1]), "14 days of Basic free, then 50% off for 2 months");
  assert.equal(describeRung(winback.rungs[3]), "30 days of Basic free");
});

test("first rung waits until the anchor plus its wait days", () => {
  const tooEarly = decideNextAction(input({ anchorAt: new Date(NOW.getTime() - days(1)) }));
  assert.equal(tooEarly.action, "wait");
  const ready = decideNextAction(input({ anchorAt: new Date(NOW.getTime() - days(2)) }));
  assert.deepEqual(ready, { action: "issue", rungIndex: 0 });
});

test("an open offer blocks the next one", () => {
  const decision = decideNextAction(input({ offers: [offer(0, "seen", NOW.getTime() + days(2))] }));
  assert.equal(decision.action, "wait");
  assert.equal((decision as { reason: string }).reason, "open_offer");
});

test("an ignored offer is followed by the next rung only after the wait", () => {
  const closed = NOW.getTime() - days(4);
  const waiting = decideNextAction(input({ offers: [offer(0, "expired", closed)] }));
  assert.equal(waiting.action, "wait"); // rung 2 waits 10 days after rung 1 closed
  const ready = decideNextAction(input({ offers: [offer(0, "issued", NOW.getTime() - days(11))] }));
  assert.deepEqual(ready, { action: "issue", rungIndex: 1 });
});

test("a redeemed offer closes the journey", () => {
  const decision = decideNextAction(input({ offers: [offer(0, "redeemed", NOW.getTime() - days(1))] }));
  assert.deepEqual(decision, { action: "close", reason: "redeemed" });
});

test("after the last rung the ladder sunsets", () => {
  const offers = winback.rungs.map((_, i) => offer(i, "expired", NOW.getTime() - days(200 - i)));
  assert.deepEqual(decideNextAction(input({ offers })), { action: "sunset" });
});

test("holdout, closed and sunset journeys are never issued offers", () => {
  for (const journeyState of ["holdout", "closed", "sunset"] as const) {
    assert.equal(decideNextAction(input({ journeyState })).action, "blocked");
  }
});

test("only one open offer across ladders, and a 90-day frequency cap", () => {
  assert.equal(decideNextAction(input({ otherOpenOffer: true })).action, "wait");
  const capped = decideNextAction(input({ offersLast90Days: settings.maxOffersPer90Days }));
  assert.equal((capped as { reason: string }).reason, "frequency_cap");
});

test("free-day cap skips a combo rung rather than quietly changing it", () => {
  const offers = [offer(0, "expired", NOW.getTime() - days(20))];
  const decision = decideNextAction(input({ offers, freeDaysGranted: 50 }));
  assert.deepEqual(decision, { action: "skip_rung", rungIndex: 1, reason: "free_days_cap" });
});

test("free-day cap skips a free-only rung", () => {
  const offers = [0, 1, 2].map((i) => offer(i, "expired", NOW.getTime() - days(100 - i * 10)));
  const decision = decideNextAction(input({ offers, freeDaysGranted: 45 }));
  assert.deepEqual(decision, { action: "skip_rung", rungIndex: 3, reason: "free_days_cap" });
});

test("weekly free budget makes free rungs wait but never blocks discounts", () => {
  const free = decideNextAction(input({
    offers: [offer(0, "expired", NOW.getTime() - days(20))],
    weeklyBudgetExhausted: true,
  }));
  assert.equal((free as { reason: string }).reason, "free_budget");
  const discount = decideNextAction(input({ weeklyBudgetExhausted: true }));
  assert.equal(discount.action, "issue");
});

test("light use: one use day, idle for five days, trial still running", () => {
  const trialEndsAt = iso(NOW.getTime() + days(10));
  const lastUseAt = iso(NOW.getTime() - days(6));
  assert.equal(qualifiesAsLightUse({ trialEndsAt, useDays: 1, lastUseAt }, rescue, NOW), true);
  assert.equal(qualifiesAsLightUse({ trialEndsAt, useDays: 3, lastUseAt }, rescue, NOW), false);
  assert.equal(qualifiesAsLightUse({ trialEndsAt, useDays: 0, lastUseAt: null }, rescue, NOW), false);
  assert.equal(qualifiesAsLightUse({ trialEndsAt, useDays: 1, lastUseAt: iso(NOW.getTime() - days(2)) }, rescue, NOW), false);
  assert.equal(qualifiesAsLightUse({ trialEndsAt: iso(NOW.getTime() - days(1)), useDays: 1, lastUseAt }, rescue, NOW), false);
});

test("holdout is stable and roughly the requested share", () => {
  assert.equal(isHoldoutUser("abc", 0), false);
  assert.equal(isHoldoutUser("abc", 10), isHoldoutUser("abc", 10));
  let held = 0;
  for (let i = 0; i < 5000; i++) if (isHoldoutUser(`user-${i}`, 10)) held++;
  assert.ok(held > 350 && held < 650, `held ${held} of 5000`);
});

test("sanitizing keeps rungs honest", () => {
  const fallback = winback.rungs[0];
  const clamped = sanitizeRung({ percentOff: 500, discountMonths: 99, openDays: 0, waitDays: -4 }, fallback);
  assert.equal(clamped.percentOff, 90);
  assert.equal(clamped.discountMonths, 12);
  assert.equal(clamped.openDays, 1);
  assert.equal(clamped.waitDays, 0);

  const exclusive = sanitizeRung({ trialExtensionDays: 14, freeDays: 30, percentOff: 50 }, fallback);
  assert.equal(exclusive.trialExtensionDays, 14);
  assert.equal(exclusive.freeDays, 0);
  assert.equal(exclusive.percentOff, 0);

  const empty = sanitizeRung({ trialExtensionDays: 0, freeDays: 0, percentOff: 0 }, fallback);
  assert.equal(empty.percentOff, fallback.percentOff);

  assert.deepEqual(sanitizeRung({ plans: ["growth", "nonsense" as never] }, fallback).plans, ["growth"]);
});

test("settings are clamped and ladders merge by id", () => {
  const s = sanitizeSettings({ holdoutPercent: 99, maxOffersPer90Days: 0 });
  assert.equal(s.holdoutPercent, 50);
  assert.equal(s.maxOffersPer90Days, 1);
  assert.equal(sanitizeSettings(null).enabled, false);
  assert.equal(sanitizeSettings({ maxNewOffersPerRun: 0 }).maxNewOffersPerRun, 1);
  assert.equal(sanitizeSettings(null).maxNewOffersPerRun, 100);

  const merged = mergeLadders([{ id: "post_trial_winback", enabled: true }, { id: "unknown", enabled: true }]);
  assert.equal(merged.length, DEFAULT_LADDERS.length);
  assert.equal(merged.find((l) => l.id === "post_trial_winback")?.enabled, true);
  assert.equal(merged.find((l) => l.id === "light_use_rescue")?.enabled, false);
});

test("buttons: free kinds claim, discounts go to checkout, combos offer both", () => {
  const percent = buildRungButtons(winback, 0);
  assert.equal(percent.length, 1);
  assert.match(percent[0].url, /^\/subscription\/plans\?promo=COMEBACK-R1&plan=basic&billing=monthly$/);

  const combo = buildRungButtons(winback, 1);
  assert.equal(combo.length, 2);
  assert.match(combo[0].url, /^\/offers\/claim\?ladder=post_trial_winback&rung=r2$/);
  assert.match(combo[1].url, /promo=COMEBACK-R2/);

  const freeOnly = buildRungButtons(winback, 3);
  assert.equal(freeOnly.length, 1);
  assert.match(freeOnly[0].url, /^\/offers\/claim\?/);
});

test("actionable offers: open ones, and claimed ones that still carry a discount", () => {
  const future = iso(NOW.getTime() + days(1));
  const past = iso(NOW.getTime() - days(1));
  assert.equal(isOfferActionable({ status: "issued", closesAt: future, percentOff: 0 }, NOW), true);
  assert.equal(isOfferActionable({ status: "issued", closesAt: past, percentOff: 0 }, NOW), false);
  assert.equal(isOfferActionable({ status: "claimed", closesAt: future, percentOff: 50 }, NOW), true);
  assert.equal(isOfferActionable({ status: "claimed", closesAt: future, percentOff: 0 }, NOW), false);
  assert.equal(isOfferActionable({ status: "redeemed", closesAt: future, percentOff: 50 }, NOW), false);
});

test("a free period with a discount stays open a week after the free time ends", () => {
  const freeUntil = new Date(NOW.getTime() + days(14));
  assert.equal(closesAtAfterFreeClaim(freeUntil, false), freeUntil.toISOString());
  assert.equal(closesAtAfterFreeClaim(freeUntil, true), iso(freeUntil.getTime() + days(7)));
});

test("rung ids stay positional whatever the admin sends", () => {
  const ladder = sanitizeLadder(
    { rungs: [{ id: "x" }, { id: "x" }, { id: "weird id" }] as never },
    winback,
  );
  assert.deepEqual(ladder.rungs.map((r) => r.id), ["r1", "r2", "r3"]);
});
