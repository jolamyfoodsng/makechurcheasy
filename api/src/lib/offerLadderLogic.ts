/**
 * Pure rules for win-back offer ladders.
 *
 * Nothing in this file touches the database, the network or the clock (the
 * caller passes `now`), so every rule can be unit-tested. The database side
 * lives in offerJourneys.ts.
 *
 * Vocabulary:
 *  - Ladder: ordered rungs for one situation (for example "free trial ended").
 *  - Rung: what is offered, how long it stays open, and how long to wait
 *    after the previous offer closed before this one opens.
 *  - Offer: one rung issued to one user.
 *  - Journey: one user's position on one ladder.
 *
 * Free time is always the Basic plan (see FREE_PERIOD_PLAN).
 */
import { createHash } from "node:crypto";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The plan a free period grants. Growth costs real money (voice AI), Basic does not. */
export const FREE_PERIOD_PLAN = "basic" as const;

/** After a free period that also carries a discount, the discount stays valid this long. */
export const DISCOUNT_AFTER_FREE_DAYS = 7;

export type OfferKind = "percent_off" | "free_period" | "trial_extension";
export type OfferPlan = "basic" | "growth";
export type OfferBillingCycle = "monthly" | "yearly";
export type LadderTrigger = "light_use_trial" | "trial_expired";
export type OfferStatus =
  | "issued"
  | "seen"
  | "clicked"
  | "claimed"
  | "redeemed"
  | "expired"
  | "suppressed"
  | "superseded";
export type JourneyState = "open" | "closed" | "sunset" | "holdout";

export interface OfferRung {
  id: string;
  label: string;
  /** Days to wait after the previous offer closed (or after the ladder's anchor for rung 1). */
  waitDays: number;
  /** Days the offer stays open once issued. */
  openDays: number;
  /** Extra days added to an active trial. Exclusive with freeDays and percentOff. */
  trialExtensionDays: number;
  /** Days of the Basic plan with no card. */
  freeDays: number;
  /** Percent off, 0 for none. */
  percentOff: number;
  /** Months the percent-off lasts (monthly billing). */
  discountMonths: number;
  plans: OfferPlan[];
  billingCycle: OfferBillingCycle;
  emailEnabled: boolean;
  emailSubject: string;
  /** Headline for the pop-up and the email. */
  title: string;
  /** Body text for the pop-up and the email. */
  message: string;
  ctaLabel: string;
}

export interface OfferLadder {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: LadderTrigger;
  /** Prefix of the generated discount codes, e.g. COMEBACK gives COMEBACK-R1. */
  codePrefix: string;
  /** light_use_trial only: most days with real use that still counts as light use. */
  lightUseMaxDays: number;
  /** light_use_trial only: days without use before the user counts as idle. */
  idleDays: number;
  rungs: OfferRung[];
}

export interface OfferSettings {
  /** Global kill switch. Nothing is issued while this is false. */
  enabled: boolean;
  /** Percent of eligible users held back with no offers, to measure what the offers add. */
  holdoutPercent: number;
  /** Most free days (free periods plus trial extensions) one user may ever receive. */
  maxFreeDaysPerUser: number;
  /** Most offers one user may be issued in any 90 days. */
  maxOffersPer90Days: number;
  /** Most free-time offers (free periods and trial extensions) issued to all users in a rolling 7 days. 0 means no limit. */
  weeklyFreeGrantBudget: number;
  /** Most offer emails one user may receive in any 7 days. */
  maxEmailsPer7Days: number;
  /** Most new offers one daily run may issue, so turning a ladder on never floods thousands of people at once. */
  maxNewOffersPerRun: number;
}

export const DEFAULT_OFFER_SETTINGS: OfferSettings = {
  enabled: false,
  holdoutPercent: 10,
  maxFreeDaysPerUser: 60,
  maxOffersPer90Days: 5,
  weeklyFreeGrantBudget: 0,
  maxEmailsPer7Days: 1,
  maxNewOffersPerRun: 100,
};

function rung(partial: Partial<OfferRung> & Pick<OfferRung, "id" | "label" | "title" | "message" | "ctaLabel" | "emailSubject">): OfferRung {
  return {
    waitDays: 0,
    openDays: 7,
    trialExtensionDays: 0,
    freeDays: 0,
    percentOff: 0,
    discountMonths: 1,
    plans: ["basic"],
    billingCycle: "monthly",
    emailEnabled: true,
    ...partial,
  };
}

export const DEFAULT_LADDERS: OfferLadder[] = [
  {
    id: "light_use_rescue",
    name: "Light-use trial rescue",
    description:
      "Someone tried the app on one day, then went quiet during their trial. Offer extra trial days, once.",
    enabled: false,
    trigger: "light_use_trial",
    codePrefix: "RESCUE",
    lightUseMaxDays: 1,
    idleDays: 5,
    rungs: [
      rung({
        id: "r1",
        label: "+21 trial days",
        waitDays: 0,
        openDays: 7,
        trialExtensionDays: 21,
        title: "Take 3 more weeks to try it",
        message:
          "You tried MakeChurchEasy, but didn't get much time with it. We've added 21 more days so your team can try it on a real service.",
        ctaLabel: "Add 21 days to my trial",
        emailSubject: "3 more weeks to try MakeChurchEasy",
      }),
    ],
  },
  {
    id: "post_trial_winback",
    name: "After the free trial",
    description:
      "Free trial ended and the church is still on Free. Each unused offer is followed by a better one, then the ladder stops.",
    enabled: false,
    trigger: "trial_expired",
    codePrefix: "COMEBACK",
    lightUseMaxDays: 1,
    idleDays: 5,
    rungs: [
      rung({
        id: "r1",
        label: "Half price, first month",
        waitDays: 2,
        openDays: 5,
        percentOff: 50,
        discountMonths: 1,
        title: "Keep Basic for half price",
        message:
          "Your free trial has ended, but your church's setup is still here. Take 50% off your first month of Basic and keep presenting without interruption.",
        ctaLabel: "Get 50% off",
        emailSubject: "Your first month of Basic is half price",
      }),
      rung({
        id: "r2",
        label: "14 days free, then half price",
        waitDays: 10,
        openDays: 7,
        freeDays: 14,
        percentOff: 50,
        discountMonths: 2,
        title: "14 days of Basic, on us",
        message:
          "Come back and use Basic free for 14 days, no card needed. If you decide to keep it, you'll get 50% off your first 2 months.",
        ctaLabel: "Start 14 free days",
        emailSubject: "14 days of Basic, on us",
      }),
      rung({
        id: "r3",
        label: "Half price, 3 months",
        waitDays: 21,
        openDays: 7,
        percentOff: 50,
        discountMonths: 3,
        title: "50% off Basic for 3 months",
        message:
          "Services come around every week. Take half off Basic for your next 3 months and get your team presenting with ease again.",
        ctaLabel: "Claim 50% off",
        emailSubject: "50% off Basic for 3 months",
      }),
      rung({
        id: "r4",
        label: "30 days free",
        waitDays: 30,
        openDays: 10,
        freeDays: 30,
        title: "A free month of Basic, from us",
        message: "We'd love to see you back. Use Basic free for 30 days, no card needed.",
        ctaLabel: "Start my free month",
        emailSubject: "A free month of Basic is waiting",
      }),
      rung({
        id: "r5",
        label: "Last call",
        waitDays: 45,
        openDays: 7,
        percentOff: 50,
        discountMonths: 2,
        title: "Last call: 50% off for 2 months",
        message:
          "This is our final offer for now: 50% off Basic for 2 months. After it ends, we won't send more offers.",
        ctaLabel: "Claim 50% off",
        emailSubject: "Last call: 50% off Basic for 2 months",
      }),
    ],
  },
];

// ── Rung helpers ───────────────────────────────────────────────────────────

export function rungKind(r: Pick<OfferRung, "trialExtensionDays" | "freeDays" | "percentOff">): OfferKind {
  if (r.trialExtensionDays > 0) return "trial_extension";
  if (r.freeDays > 0) return "free_period";
  return "percent_off";
}

/** True when claiming this rung means a grant (no payment), not a discount at checkout. */
export function rungNeedsClaim(r: Pick<OfferRung, "trialExtensionDays" | "freeDays" | "percentOff">): boolean {
  return rungKind(r) !== "percent_off";
}

export function describeRung(
  r: Pick<OfferRung, "trialExtensionDays" | "freeDays" | "percentOff" | "discountMonths">,
): string {
  const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;
  if (r.trialExtensionDays > 0) return `+${r.trialExtensionDays} days on your trial`;
  const discount = r.percentOff > 0 ? `${r.percentOff}% off for ${months(r.discountMonths)}` : "";
  if (r.freeDays > 0) {
    const free = `${r.freeDays} days of Basic free`;
    return discount ? `${free}, then ${discount}` : free;
  }
  return discount || "No offer";
}

/** Code for a percent-off rung, e.g. COMEBACK-R2. Always matches normalizeDiscountCode. */
export function offerCodeFor(ladder: Pick<OfferLadder, "codePrefix">, rungIndex: number): string {
  const prefix = String(ladder.codePrefix || "OFFER").toUpperCase().replace(/[^A-Z0-9_-]/g, "") || "OFFER";
  return `${prefix}-R${rungIndex + 1}`;
}

export function claimPath(ladderId: string, rungId: string): string {
  return `/offers/claim?ladder=${encodeURIComponent(ladderId)}&rung=${encodeURIComponent(rungId)}`;
}

export function plansPath(code: string, plan: OfferPlan, billingCycle: OfferBillingCycle): string {
  return `/subscription/plans?promo=${encodeURIComponent(code)}&plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billingCycle)}`;
}

export interface RungButton {
  id: string;
  label: string;
  url: string;
  style: "primary" | "secondary" | "link";
}

/** The pop-up buttons for a rung: a claim button for free kinds, a checkout button for discounts. */
export function buildRungButtons(ladder: OfferLadder, rungIndex: number): RungButton[] {
  const r = ladder.rungs[rungIndex];
  if (!r) return [];
  const buttons: RungButton[] = [];
  if (rungNeedsClaim(r)) {
    buttons.push({ id: "claim", label: r.ctaLabel, url: claimPath(ladder.id, r.id), style: "primary" });
    if (r.percentOff > 0) {
      buttons.push({
        id: "subscribe",
        label: `Or subscribe at ${r.percentOff}% off`,
        url: plansPath(offerCodeFor(ladder, rungIndex), r.plans[0] || "basic", r.billingCycle),
        style: "secondary",
      });
    }
  } else {
    buttons.push({
      id: "subscribe",
      label: r.ctaLabel,
      url: plansPath(offerCodeFor(ladder, rungIndex), r.plans[0] || "basic", r.billingCycle),
      style: "primary",
    });
  }
  return buttons;
}

// ── Sanitising admin input ─────────────────────────────────────────────────

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function text(value: unknown, fallback: string, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  return (s || fallback).slice(0, max);
}

function slug(value: unknown, fallback: string): string {
  const s = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (s || fallback).slice(0, 40);
}

export function sanitizeRung(raw: Partial<OfferRung> | null | undefined, fallback: OfferRung): OfferRung {
  const r = raw || {};
  let trialExtensionDays = num(r.trialExtensionDays, fallback.trialExtensionDays, 0, 60);
  let freeDays = num(r.freeDays, fallback.freeDays, 0, 90);
  let percentOff = num(r.percentOff, fallback.percentOff, 0, 90);
  // A trial extension is its own kind of offer; it cannot be combined.
  if (trialExtensionDays > 0) {
    freeDays = 0;
    percentOff = 0;
  }
  // A rung must offer something; fall back rather than store an empty offer.
  if (trialExtensionDays === 0 && freeDays === 0 && percentOff === 0) {
    trialExtensionDays = fallback.trialExtensionDays;
    freeDays = fallback.freeDays;
    percentOff = fallback.percentOff;
  }
  const plans = (Array.isArray(r.plans) ? r.plans : fallback.plans).filter(
    (p): p is OfferPlan => p === "basic" || p === "growth",
  );
  return {
    id: slug(r.id, fallback.id),
    label: text(r.label, fallback.label, 80),
    waitDays: num(r.waitDays, fallback.waitDays, 0, 365),
    openDays: num(r.openDays, fallback.openDays, 1, 60),
    trialExtensionDays,
    freeDays,
    percentOff,
    discountMonths: num(r.discountMonths, fallback.discountMonths, 1, 12),
    plans: plans.length > 0 ? Array.from(new Set(plans)) : fallback.plans,
    billingCycle: r.billingCycle === "yearly" ? "yearly" : r.billingCycle === "monthly" ? "monthly" : fallback.billingCycle,
    emailEnabled: typeof r.emailEnabled === "boolean" ? r.emailEnabled : fallback.emailEnabled,
    emailSubject: text(r.emailSubject, fallback.emailSubject, 120),
    title: text(r.title, fallback.title, 120),
    message: text(r.message, fallback.message, 600),
    ctaLabel: text(r.ctaLabel, fallback.ctaLabel, 40),
  };
}

export function sanitizeLadder(raw: Partial<OfferLadder> | null | undefined, fallback: OfferLadder): OfferLadder {
  const l = raw || {};
  const inputRungs = Array.isArray(l.rungs) ? l.rungs.slice(0, 10) : null;
  let rungs: OfferRung[];
  if (inputRungs && inputRungs.length > 0) {
    rungs = inputRungs.map((candidate, index) => {
      const base = fallback.rungs[index] || fallback.rungs[fallback.rungs.length - 1];
      // Rung ids are positional (r1, r2, ...): they identify the rung's pop-up,
      // code and issued offers, so they must never be renamed or reordered.
      return { ...sanitizeRung(candidate, base), id: `r${index + 1}` };
    });
  } else {
    rungs = fallback.rungs;
  }
  return {
    id: fallback.id,
    name: text(l.name, fallback.name, 80),
    description: text(l.description, fallback.description, 300),
    enabled: typeof l.enabled === "boolean" ? l.enabled : fallback.enabled,
    trigger: fallback.trigger,
    codePrefix: fallback.codePrefix,
    lightUseMaxDays: num(l.lightUseMaxDays, fallback.lightUseMaxDays, 1, 10),
    idleDays: num(l.idleDays, fallback.idleDays, 1, 30),
    rungs,
  };
}

export function sanitizeSettings(raw: Partial<OfferSettings> | null | undefined): OfferSettings {
  const s = raw || {};
  const d = DEFAULT_OFFER_SETTINGS;
  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : d.enabled,
    holdoutPercent: num(s.holdoutPercent, d.holdoutPercent, 0, 50),
    maxFreeDaysPerUser: num(s.maxFreeDaysPerUser, d.maxFreeDaysPerUser, 0, 365),
    maxOffersPer90Days: num(s.maxOffersPer90Days, d.maxOffersPer90Days, 1, 20),
    weeklyFreeGrantBudget: num(s.weeklyFreeGrantBudget, d.weeklyFreeGrantBudget, 0, 100_000),
    maxEmailsPer7Days: num(s.maxEmailsPer7Days, d.maxEmailsPer7Days, 1, 7),
    maxNewOffersPerRun: num(s.maxNewOffersPerRun, d.maxNewOffersPerRun, 1, 5000),
  };
}

/** Stored ladders override the built-in ones by id. Ladders the code does not know are ignored. */
export function mergeLadders(stored: Array<Partial<OfferLadder>> | null | undefined): OfferLadder[] {
  const byId = new Map((stored || []).map((ladder) => [String(ladder.id || ""), ladder]));
  return DEFAULT_LADDERS.map((fallback) => sanitizeLadder(byId.get(fallback.id), fallback));
}

// ── Holdout ────────────────────────────────────────────────────────────────

/** Stable per user: the same user is always in or out of the holdout. */
export function isHoldoutUser(userId: string, percent: number, salt = "offer-holdout-v1"): boolean {
  if (percent <= 0) return false;
  const digest = createHash("sha256").update(`${salt}:${userId}`).digest();
  const bucket = digest.readUInt32BE(0) % 100;
  return bucket < percent;
}

// ── Trigger: light use during a trial ──────────────────────────────────────

export interface TrialUseSummary {
  trialEndsAt: string | null;
  /** Distinct calendar days with a real use event since the trial started. */
  useDays: number;
  lastUseAt: string | null;
}

export function qualifiesAsLightUse(
  summary: TrialUseSummary,
  ladder: Pick<OfferLadder, "lightUseMaxDays" | "idleDays">,
  now: Date,
): boolean {
  if (!summary.trialEndsAt || new Date(summary.trialEndsAt).getTime() <= now.getTime()) return false;
  if (summary.useDays < 1 || summary.useDays > ladder.lightUseMaxDays) return false;
  if (!summary.lastUseAt) return false;
  const idleMs = now.getTime() - new Date(summary.lastUseAt).getTime();
  return idleMs >= ladder.idleDays * DAY_MS;
}

// ── The decision ───────────────────────────────────────────────────────────

export interface OfferRecordLite {
  rungIndex: number;
  status: OfferStatus;
  /** When the offer stops being open or occupying (ISO). */
  closesAt: string;
  issuedAt: string;
}

const OCCUPYING: ReadonlySet<OfferStatus> = new Set(["issued", "seen", "clicked", "claimed"]);

export type JourneyDecision =
  | { action: "issue"; rungIndex: number }
  | { action: "skip_rung"; rungIndex: number; reason: string }
  | { action: "wait"; reason: string; until?: string }
  | { action: "close"; reason: "redeemed" }
  | { action: "sunset" }
  | { action: "blocked"; reason: string };

export interface DecisionInput {
  ladder: OfferLadder;
  settings: OfferSettings;
  now: Date;
  /** Anchor for rung 1's wait (trial end date for the post-trial ladder). Null means "now". */
  anchorAt: Date | null;
  /** This user's offers on this ladder. */
  offers: OfferRecordLite[];
  journeyState: JourneyState | null;
  /** The user holds an open offer on another ladder. */
  otherOpenOffer: boolean;
  /** Offers (not counting suppressed ones) issued to this user in the last 90 days. */
  offersLast90Days: number;
  /** Free days and trial-extension days this user has ever received. */
  freeDaysGranted: number;
  /** The weekly budget for free grants across all users is used up. */
  weeklyBudgetExhausted: boolean;
}

export function decideNextAction(input: DecisionInput): JourneyDecision {
  const { ladder, settings, now, offers } = input;

  if (input.journeyState === "holdout") return { action: "blocked", reason: "holdout" };
  if (input.journeyState === "closed") return { action: "blocked", reason: "journey_closed" };
  if (input.journeyState === "sunset") return { action: "blocked", reason: "sunset" };

  if (offers.some((offer) => offer.status === "redeemed")) return { action: "close", reason: "redeemed" };

  const ordered = [...offers].sort((a, b) => a.rungIndex - b.rungIndex);
  const latest = ordered[ordered.length - 1] ?? null;

  if (latest && OCCUPYING.has(latest.status) && new Date(latest.closesAt).getTime() > now.getTime()) {
    return { action: "wait", reason: "open_offer", until: latest.closesAt };
  }

  const rungIndex = ordered.length;
  if (rungIndex >= ladder.rungs.length) return { action: "sunset" };
  const next = ladder.rungs[rungIndex];

  const base = latest ? new Date(latest.closesAt) : input.anchorAt ?? now;
  const earliest = new Date(base.getTime() + next.waitDays * DAY_MS);
  if (now.getTime() < earliest.getTime()) {
    return { action: "wait", reason: "waiting", until: earliest.toISOString() };
  }

  if (input.otherOpenOffer) return { action: "wait", reason: "other_ladder_offer" };
  if (input.offersLast90Days >= settings.maxOffersPer90Days) return { action: "wait", reason: "frequency_cap" };

  const freeNeeded = next.freeDays + next.trialExtensionDays;
  if (freeNeeded > 0) {
    // The pop-up and email describe the whole rung, so a rung the user can no
    // longer receive in full is skipped rather than quietly changed.
    if (input.freeDaysGranted + freeNeeded > settings.maxFreeDaysPerUser) {
      return { action: "skip_rung", rungIndex, reason: "free_days_cap" };
    }
    if (input.weeklyBudgetExhausted) return { action: "wait", reason: "free_budget" };
  }

  return { action: "issue", rungIndex };
}

/** When an offer stops being open or occupying, given how it was issued or claimed. */
export function closesAtOnIssue(now: Date, openDays: number): string {
  return new Date(now.getTime() + openDays * DAY_MS).toISOString();
}

/**
 * After a free period is claimed: a free-only offer occupies the user until the
 * free time ends; one that also carries a discount stays open a little longer.
 */
export function closesAtAfterFreeClaim(freeUntil: Date, hasDiscount: boolean): string {
  const extra = hasDiscount ? DISCOUNT_AFTER_FREE_DAYS * DAY_MS : 0;
  return new Date(freeUntil.getTime() + extra).toISOString();
}

/** Whether a user can still act on the offer from a pop-up or email. */
export function isOfferActionable(offer: {
  status: OfferStatus;
  closesAt: string;
  percentOff: number;
}, now: Date): boolean {
  if (new Date(offer.closesAt).getTime() <= now.getTime()) return false;
  if (offer.status === "issued" || offer.status === "seen" || offer.status === "clicked") return true;
  return offer.status === "claimed" && offer.percentOff > 0;
}
