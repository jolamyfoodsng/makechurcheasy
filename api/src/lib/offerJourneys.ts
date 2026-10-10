/**
 * Win-back offer journeys: the database side of the offer ladders.
 *
 * The rules (who gets which rung, when) are in offerLadderLogic.ts and are
 * unit-tested there. This file reads the data those rules need, writes the
 * offers, sends the emails, and handles claiming and redeeming.
 *
 * One offer per user per rung is stored in `user_offers`; one position per user
 * per ladder in `offer_journeys`. The pop-ups are ordinary announcements (one
 * template per rung, audience `personal_offer_users`), so the existing editor,
 * layouts, desktop watcher and click analytics all keep working.
 */
import { ObjectId, type Db } from "mongodb";
import clientPromise from "./mongodb";
import { COLLECTIONS, ensureIndexes, upsertSubscription } from "./db";
import { logAuditEvent } from "./auditLog";
import { getTrialForUser, updateTrialRecord } from "./trialRecords";
import { logTrialAction } from "./trialAudit";
import { getTrialSignalKey, normalizeEmailForTrial } from "./trialAbuse";
import { buildUnsubscribeUrl } from "./emailUnsubscribe";
import { offerFreePeriodEndingEmail, offerJourneyEmail, sendEmail } from "./emailTemplates";
import { invalidateAnnouncementsVersion } from "./announcements";
import { USE_EVENTS } from "./reactivationAudience";
import type { Announcement } from "@/types/schemas";
import {
  DAY_MS,
  FREE_PERIOD_PLAN,
  buildRungButtons,
  closesAtAfterFreeClaim,
  closesAtOnIssue,
  decideNextAction,
  describeRung,
  isHoldoutUser,
  isOfferActionable,
  mergeLadders,
  offerCodeFor,
  qualifiesAsLightUse,
  rungKind,
  rungNeedsClaim,
  sanitizeLadder,
  sanitizeSettings,
  type JourneyState,
  type OfferKind,
  type OfferLadder,
  type OfferRung,
  type OfferSettings,
  type OfferStatus,
  type TrialUseSummary,
} from "./offerLadderLogic";
import type { UserOffer, UserOfferParams } from "./offerMatch";

export type { UserOffer } from "./offerMatch";

const OCCUPYING: OfferStatus[] = ["issued", "seen", "clicked", "claimed"];
const OPEN_FOR_CLAIM: OfferStatus[] = ["issued", "seen", "clicked"];
const FREE_KINDS: OfferKind[] = ["free_period", "trial_extension"];

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheasy.com").replace(/\/$/, "");
const iso = (ms: number) => new Date(ms).toISOString();

export class OfferError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "OfferError";
    this.status = status;
  }
}

export interface OfferJourney {
  _id?: ObjectId;
  userId: string;
  ladderId: string;
  state: JourneyState;
  holdout: boolean;
  anchorAt: string | null;
  /** When this journey next needs looking at. Null means never (finished). */
  nextEvaluateAt: string | null;
  lastOfferAt: string | null;
  closedAt?: string | null;
  closedReason?: "redeemed" | "paid" | "suppressed" | "user_gone" | null;
  /** Set when the user became a paying customer, with or without using an offer. */
  convertedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const offersOf = (db: Db) => db.collection<UserOffer>(COLLECTIONS.USER_OFFERS);
const journeysOf = (db: Db) => db.collection<OfferJourney>(COLLECTIONS.OFFER_JOURNEYS);

// ── Configuration ──────────────────────────────────────────────────────────

export interface OfferConfig {
  settings: OfferSettings;
  ladders: OfferLadder[];
}

interface StoredOfferConfig {
  _id: string;
  settings?: Partial<OfferSettings>;
  ladders?: Array<Partial<OfferLadder>>;
  updatedAt?: string;
  updatedBy?: string | null;
}

export async function loadOfferConfig(): Promise<OfferConfig> {
  const client = await clientPromise;
  const stored = await client
    .db()
    .collection<StoredOfferConfig>(COLLECTIONS.OFFER_SETTINGS)
    .findOne({ _id: "global" });
  return {
    settings: sanitizeSettings(stored?.settings),
    ladders: mergeLadders(stored?.ladders),
  };
}

export async function saveOfferConfig(
  input: { settings?: Partial<OfferSettings>; ladders?: Array<Partial<OfferLadder>> },
  adminId: string,
): Promise<OfferConfig> {
  const current = await loadOfferConfig();
  const settings = sanitizeSettings({ ...current.settings, ...(input.settings || {}) });
  const incoming = new Map((input.ladders || []).map((ladder) => [String(ladder.id), ladder]));
  const ladders = current.ladders.map((existing) => {
    const patch = incoming.get(existing.id);
    return patch ? sanitizeLadder({ ...existing, ...patch }, existing) : existing;
  });

  const client = await clientPromise;
  const db = client.db();
  await db.collection<StoredOfferConfig>(COLLECTIONS.OFFER_SETTINGS).updateOne(
    { _id: "global" },
    { $set: { settings, ladders, updatedAt: new Date().toISOString(), updatedBy: adminId } },
    { upsert: true },
  );

  const config = { settings, ladders };
  await syncRungAnnouncements(db, config);
  return config;
}

// ── Pop-up templates (one announcement per rung) ───────────────────────────

const ANNOUNCEMENT_PRIORITY = 70;

function rungTag(ladderId: string, rungId: string): string {
  return `offer-ladder:${ladderId}:${rungId}`;
}

/**
 * Makes sure every rung has its pop-up template and that the parts tied to the
 * offer (code, percentage, plans, audience, on or off) match the ladder.
 *
 * Wording and layout belong to whoever edits the announcement: once an admin
 * has changed a template in the announcement editor (updatedBy is set), only
 * the offer-related fields are kept in step. Untouched templates also follow
 * the ladder's own copy. Only changed fields are written, so the announcement
 * version that desktops poll does not change when nothing did.
 */
export async function syncRungAnnouncements(db: Db, config: OfferConfig): Promise<void> {
  const collection = db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS);
  const now = new Date().toISOString();
  let changed = false;

  for (const ladder of config.ladders) {
    const live = config.settings.enabled && ladder.enabled;
    for (let index = 0; index < ladder.rungs.length; index++) {
      const rung = ladder.rungs[index];
      const tag = rungTag(ladder.id, rung.id);
      const hasDiscount = rung.percentOff > 0;
      const code = hasDiscount ? offerCodeFor(ladder, index) : null;
      const buttons = buildRungButtons(ladder, index);

      const mechanics: Partial<Announcement> = {
        audience: "personal_offer_users",
        surfaces: ["dashboard", "desktop"],
        personalOffer: { ladderId: ladder.id, rungId: rung.id },
        offerCode: code,
        offerDiscountPercent: hasDiscount ? rung.percentOff : null,
        offerDurationMonths: hasDiscount ? rung.discountMonths : null,
        offerMaxRedemptions: null,
        offerApplicablePlans: hasDiscount ? rung.plans : [],
        offerApplicableBillingCycles: hasDiscount ? [rung.billingCycle] : [],
        priority: ANNOUNCEMENT_PRIORITY,
        deliverySpacingMinutes: 1440,
        maxShowsPerUser: 2,
        expiresAt: null,
      };
      const creative: Partial<Announcement> = {
        title: rung.title,
        message: rung.message,
        layout: hasDiscount ? "promo" : "standard",
        tone: hasDiscount ? "offer" : "success",
        buttons,
        ctaLabel: buttons[0]?.label ?? rung.ctaLabel,
        ctaUrl: buttons[0]?.url ?? null,
      };

      const existing = await collection.findOne({ tags: tag });
      if (!existing) {
        await collection.insertOne({
          ...(mechanics as Announcement),
          ...(creative as Announcement),
          status: live ? "active" : "paused",
          tags: ["offer-ladder", tag],
          targetUserIds: [],
          targetEmails: [],
          publishAt: now,
          createdBy: "system:offer-ladders",
          updatedBy: null,
          metrics: { shown: 0, dismissed: 0, clicked: 0 },
          createdAt: now,
          updatedAt: now,
        } as Announcement);
        changed = true;
        continue;
      }

      const desired: Record<string, unknown> = { ...mechanics };
      if (existing.status !== "archived") desired.status = live ? "active" : "paused";
      if (!existing.updatedBy) Object.assign(desired, creative);

      const diff: Record<string, unknown> = {};
      const current = existing as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(desired)) {
        if (JSON.stringify(current[key] ?? null) !== JSON.stringify(value ?? null)) diff[key] = value;
      }
      if (Object.keys(diff).length > 0) {
        await collection.updateOne({ _id: existing._id }, { $set: { ...diff, updatedAt: now } });
        changed = true;
      }
    }
  }

  if (changed) invalidateAnnouncementsVersion();
}

// ── Who is a candidate ─────────────────────────────────────────────────────

type UserDoc = Record<string, any>;

const NEW_JOURNEYS_PER_LADDER = 400;
const DUE_JOURNEYS_PER_LADDER = 600;
const PREVIEW_SAMPLES = 25;
const RUN_LOCK_ID = "run-lock";
const RUN_LOCK_MS = 20 * 60 * 1000;
const REMINDER_LEAD_DAYS = 2;

const asMs = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const isGrantedPlan = (user: UserDoc): boolean =>
  Boolean(user.adminTemporaryPlan?.active || user.adminManagedSubscription?.active || user.ambassador?.active);

const isPaidPlan = (user: UserDoc): boolean => String(user.plan || "free").trim().toLowerCase() !== "free";

/** On a paid plan that nobody gave them: an actual customer. */
const isPayingUser = (user: UserDoc): boolean => isPaidPlan(user) && !isGrantedPlan(user);

function isActiveTrial(user: UserDoc, nowMs: number): boolean {
  const trial = user.trial || {};
  const endsAt = asMs(trial.endsAt);
  return (trial.active === true || trial.status === "active") && (endsAt === null || endsAt > nowMs);
}

function firstNameOf(user: UserDoc): string | undefined {
  const raw =
    typeof user.firstName === "string" && user.firstName.trim()
      ? user.firstName.trim()
      : typeof user.name === "string"
        ? user.name.trim()
        : "";
  return raw.split(/\s+/)[0] || undefined;
}

const absoluteUrl = (path: string): string => (/^https?:\/\//i.test(path) ? path : `${appUrl()}${path}`);

const toLite = (offer: UserOffer) => ({
  rungIndex: offer.rungIndex,
  status: offer.status,
  closesAt: offer.closesAt,
  issuedAt: offer.issuedAt,
});

/** Free days the person has ever been given: free periods and trial extensions they actually claimed. */
function freeDaysGrantedTo(offers: UserOffer[]): number {
  return offers
    .filter((offer) => Boolean(offer.claimedAt))
    .reduce((sum, offer) => sum + (offer.params.freeDays || 0) + (offer.params.trialExtensionDays || 0), 0);
}

interface WorkItem {
  userId: string;
  journey: OfferJourney | null;
  /** The trial's end date for the post-trial ladder; null otherwise. */
  anchorAt: string | null;
}

const USER_PROJECTION = {
  email: 1,
  name: 1,
  firstName: 1,
  emailVerified: 1,
  emailPreferences: 1,
  plan: 1,
  status: 1,
  isActive: 1,
  adminTemporaryPlan: 1,
  adminManagedSubscription: 1,
  ambassador: 1,
  trial: 1,
};

/** Users that match the common rules, joined onto one row per user (the pipeline tail shared by both ladders). */
function eligibleUserStages(ladderId: string): Record<string, unknown>[] {
  return [
    { $addFields: { oid: { $convert: { input: "$_id", to: "objectId", onError: null, onNull: null } } } },
    { $lookup: { from: "users", localField: "oid", foreignField: "_id", as: "u" } },
    { $unwind: "$u" },
    {
      $match: {
        "u.emailVerified": true,
        "u.status": { $ne: "deleted" },
        "u.isActive": { $ne: false },
        "u.plan": { $in: ["free", null] },
        "u.adminTemporaryPlan.active": { $ne: true },
        "u.adminManagedSubscription.active": { $ne: true },
        "u.ambassador.active": { $ne: true },
      },
    },
    // Anyone holding the one-time Growth gift from the earlier campaign is left alone until it is used or lapses.
    { $lookup: { from: "reactivation_offers", localField: "_id", foreignField: "userId", as: "gift" } },
    { $match: { "gift.status": { $nin: ["available", "granting"] } } },
    { $lookup: { from: COLLECTIONS.OFFER_JOURNEYS, localField: "_id", foreignField: "userId", as: "j" } },
    { $match: { "j.ladderId": { $ne: ladderId } } },
  ];
}

/** People whose most recent trial has ended and who have no journey on this ladder yet. */
async function discoverExpiredTrials(db: Db, ladder: OfferLadder, nowIso: string): Promise<WorkItem[]> {
  const rows = await db
    .collection("trials")
    .aggregate<{ _id: string; endsAt: string }>([
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$userId", status: { $first: "$status" }, endsAt: { $first: "$endsAt" } } },
      { $match: { status: "expired", endsAt: { $lte: nowIso } } },
      ...eligibleUserStages(ladder.id),
      { $sort: { endsAt: -1 } },
      { $limit: NEW_JOURNEYS_PER_LADDER },
      { $project: { endsAt: 1 } },
    ], { allowDiskUse: true })
    .toArray();
  return rows.map((row) => ({ userId: String(row._id), journey: null, anchorAt: row.endsAt }));
}

/**
 * People in an active trial who used the app on very few days and have gone
 * quiet. Real use is counted from the same events the rest of the product uses
 * to decide whether someone has tried the app.
 */
async function discoverLightUseTrials(db: Db, ladder: OfferLadder, now: Date): Promise<WorkItem[]> {
  const nowIso = now.toISOString();
  const trials = await db
    .collection("trials")
    .aggregate<{ _id: string; startedAt: string; endsAt: string }>([
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$userId", status: { $first: "$status" }, startedAt: { $first: "$startedAt" }, endsAt: { $first: "$endsAt" } } },
      { $match: { status: "active", endsAt: { $gt: nowIso } } },
      ...eligibleUserStages(ladder.id),
      // Oldest trials first: they are the ones that have had time to go quiet.
      { $sort: { startedAt: 1 } },
      { $limit: 1500 },
      { $project: { startedAt: 1, endsAt: 1 } },
    ], { allowDiskUse: true })
    .toArray();
  if (trials.length === 0) return [];

  const ids = trials.map((trial) => String(trial._id));
  const variants: Array<string | ObjectId> = [...ids, ...ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))];
  const earliestStart = trials.reduce((min, trial) => (trial.startedAt < min ? trial.startedAt : min), trials[0].startedAt);

  const usage = await db
    .collection(COLLECTIONS.ACTIVITY_EVENTS)
    .aggregate<{ _id: string; useDays: number; lastUseAt: Date }>([
      { $match: { userId: { $in: variants }, event: { $in: Array.from(USE_EVENTS) } } },
      { $addFields: { at: { $convert: { input: { $ifNull: ["$timestamp", "$createdAt"] }, to: "date", onError: null, onNull: null } } } },
      { $match: { at: { $gte: new Date(earliestStart) } } },
      {
        $group: {
          _id: { u: { $toString: "$userId" }, d: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "Africa/Lagos" } } },
          last: { $max: "$at" },
        },
      },
      { $group: { _id: "$_id.u", useDays: { $sum: 1 }, lastUseAt: { $max: "$last" } } },
    ], { allowDiskUse: true })
    .toArray();
  const usageByUser = new Map(usage.map((row) => [String(row._id), row]));

  const items: WorkItem[] = [];
  for (const trial of trials) {
    const row = usageByUser.get(String(trial._id));
    if (!row) continue;
    const summary: TrialUseSummary = {
      trialEndsAt: trial.endsAt,
      useDays: row.useDays,
      lastUseAt: row.lastUseAt ? new Date(row.lastUseAt).toISOString() : null,
    };
    if (qualifiesAsLightUse(summary, ladder, now)) {
      items.push({ userId: String(trial._id), journey: null, anchorAt: null });
    }
    if (items.length >= NEW_JOURNEYS_PER_LADDER) break;
  }
  return items;
}

// ── Running the ladders ────────────────────────────────────────────────────

export interface OfferRunReport {
  dryRun: boolean;
  ran: boolean;
  skippedReason?: string;
  /** People looked at. */
  evaluated: number;
  /** Offers issued (or, in a dry run, that would be issued within this run's limit). */
  issued: number;
  /** People who qualify for an offer right now, before the per-run limit. */
  eligibleNow: number;
  /** Qualifying people left for tomorrow because the per-run limit was reached. */
  deferredByRunLimit: number;
  emailed: number;
  emailsSkipped: number;
  /** A rung the person could not receive in full (for example it would pass the free-days limit), recorded and passed over. */
  skippedRungs: number;
  waiting: number;
  holdout: number;
  closed: number;
  sunset: number;
  blocked: number;
  errors: number;
  expiredOffers: number;
  remindersSent: number;
  byRung: Record<string, number>;
  samples: Array<{ userId: string; email: string | null; ladderId: string; rungId: string; label: string }>;
}

function emptyReport(dryRun: boolean): OfferRunReport {
  return {
    dryRun,
    ran: true,
    evaluated: 0,
    issued: 0,
    eligibleNow: 0,
    deferredByRunLimit: 0,
    emailed: 0,
    emailsSkipped: 0,
    skippedRungs: 0,
    waiting: 0,
    holdout: 0,
    closed: 0,
    sunset: 0,
    blocked: 0,
    errors: 0,
    expiredOffers: 0,
    remindersSent: 0,
    byRung: {},
    samples: [],
  };
}

interface RunContext {
  db: Db;
  now: Date;
  nowIso: string;
  dryRun: boolean;
  settings: OfferSettings;
  report: OfferRunReport;
  /** New offers this run may still issue. */
  newOfferBudget: number;
  /** Free offers issued in the last 7 days, including this run's. */
  freeIssuedLast7Days: number;
}

async function patchJourney(ctx: RunContext, userId: string, ladderId: string, patch: Partial<OfferJourney>): Promise<void> {
  if (ctx.dryRun) return;
  await journeysOf(ctx.db).updateOne({ userId, ladderId }, { $set: { ...patch, updatedAt: ctx.nowIso } });
}

/** Creates the person's journey on first contact, or returns the existing one. */
async function ensureJourney(ctx: RunContext, ladder: OfferLadder, item: WorkItem, holdout: boolean): Promise<OfferJourney> {
  if (item.journey) return item.journey;
  const doc: OfferJourney = {
    userId: item.userId,
    ladderId: ladder.id,
    state: holdout ? "holdout" : "open",
    holdout,
    anchorAt: item.anchorAt,
    nextEvaluateAt: holdout ? null : ctx.nowIso,
    lastOfferAt: null,
    closedAt: null,
    closedReason: null,
    convertedAt: null,
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  };
  if (ctx.dryRun) return doc;
  await journeysOf(ctx.db).updateOne(
    { userId: item.userId, ladderId: ladder.id },
    { $setOnInsert: doc as never },
    { upsert: true },
  );
  return (await journeysOf(ctx.db).findOne({ userId: item.userId, ladderId: ladder.id })) ?? doc;
}

function paramsOf(rung: OfferRung) {
  return {
    trialExtensionDays: rung.trialExtensionDays,
    freeDays: rung.freeDays,
    percentOff: rung.percentOff,
    discountMonths: rung.discountMonths,
    plans: rung.plans,
    billingCycle: rung.billingCycle,
  } satisfies UserOfferParams;
}

/** Records that a rung was passed over for this person so the ladder moves on. */
async function recordSuppressedRung(ctx: RunContext, ladder: OfferLadder, rungIndex: number, userId: string, reason: string): Promise<UserOffer> {
  const rung = ladder.rungs[rungIndex];
  const offer: UserOffer = {
    userId,
    ladderId: ladder.id,
    rungId: rung.id,
    rungIndex,
    kind: rungKind(rung),
    status: "suppressed",
    params: paramsOf(rung),
    code: null,
    issuedAt: ctx.nowIso,
    closesAt: ctx.nowIso,
    channels: {},
    createdBy: "system:offer-journeys",
    note: reason,
  };
  if (!ctx.dryRun) {
    try {
      await offersOf(ctx.db).insertOne(offer);
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }
  return offer;
}

type EmailOutcome = { sent: true } | { sent: false; reason: string };

async function sendOfferEmail(
  ctx: RunContext,
  ladder: OfferLadder,
  rungIndex: number,
  user: UserDoc,
  offer: UserOffer,
  emailsInLast7Days: number,
): Promise<EmailOutcome> {
  const rung = ladder.rungs[rungIndex];
  if (!rung.emailEnabled) return { sent: false, reason: "rung_email_off" };
  const to = typeof user.email === "string" ? user.email.trim() : "";
  if (!to) return { sent: false, reason: "no_email" };
  if (user.emailPreferences?.marketing === false) return { sent: false, reason: "marketing_opt_out" };
  if (emailsInLast7Days >= ctx.settings.maxEmailsPer7Days) return { sent: false, reason: "email_cap" };

  const buttons = buildRungButtons(ladder, rungIndex);
  const [primary, secondary] = buttons;
  if (!primary) return { sent: false, reason: "no_button" };

  try {
    const sent = await sendEmail(
      offerJourneyEmail({
        toEmail: to,
        name: firstNameOf(user),
        subject: rung.emailSubject,
        title: rung.title,
        message: rung.message,
        offerSummary: describeRung(rung),
        primary: { label: primary.label, url: absoluteUrl(primary.url) },
        secondary: secondary ? { label: secondary.label, url: absoluteUrl(secondary.url) } : null,
        promoCode: offer.code,
        closesAt: offer.closesAt,
        unsubscribeUrl: buildUnsubscribeUrl(String(user._id)),
      }),
    );
    return sent ? { sent: true } : { sent: false, reason: "send_failed" };
  } catch (error) {
    console.error("[offer-journeys] Email failed:", error);
    return { sent: false, reason: "send_failed" };
  }
}

async function issueOffer(
  ctx: RunContext,
  ladder: OfferLadder,
  rungIndex: number,
  user: UserDoc,
  userOffers: UserOffer[],
): Promise<UserOffer | null> {
  const rung = ladder.rungs[rungIndex];
  const userId = String(user._id);
  const offer: UserOffer = {
    userId,
    ladderId: ladder.id,
    rungId: rung.id,
    rungIndex,
    kind: rungKind(rung),
    status: "issued",
    params: paramsOf(rung),
    code: rung.percentOff > 0 ? offerCodeFor(ladder, rungIndex) : null,
    issuedAt: ctx.nowIso,
    closesAt: closesAtOnIssue(ctx.now, rung.openDays),
    channels: { email: { sentAt: null }, inApp: { firstShownAt: null } },
    createdBy: "system:offer-journeys",
  };

  let inserted;
  try {
    inserted = await offersOf(ctx.db).insertOne(offer);
  } catch (error: any) {
    // The unique index (user, ladder, rung) means another run already issued this one.
    if (error?.code === 11000) return null;
    throw error;
  }
  offer._id = inserted.insertedId;

  const emailsInLast7Days = userOffers.filter((o) => {
    const sentAt = asMs(o.channels?.email?.sentAt);
    return sentAt !== null && sentAt >= ctx.now.getTime() - 7 * DAY_MS;
  }).length;
  const outcome = await sendOfferEmail(ctx, ladder, rungIndex, user, offer, emailsInLast7Days);
  if (outcome.sent) {
    offer.channels.email = { sentAt: new Date().toISOString() };
    ctx.report.emailed += 1;
  } else {
    offer.channels.email = { sentAt: null, skippedReason: outcome.reason };
    ctx.report.emailsSkipped += 1;
  }
  await offersOf(ctx.db).updateOne({ _id: offer._id }, { $set: { "channels.email": offer.channels.email } });
  return offer;
}

/**
 * Looks at one person on one ladder and does the next thing, if there is one.
 * Everything that changes data goes through helpers that do nothing in a dry run.
 */
async function processUser(
  ctx: RunContext,
  ladder: OfferLadder,
  item: WorkItem,
  user: UserDoc | undefined,
  allOffers: UserOffer[],
  giftPending: boolean,
): Promise<void> {
  const { report, now, nowIso, settings } = ctx;
  report.evaluated += 1;
  const nowMs = now.getTime();

  const close = async (reason: NonNullable<OfferJourney["closedReason"]>, converted: boolean) => {
    if (item.journey) {
      await patchJourney(ctx, item.userId, ladder.id, {
        state: "closed",
        closedAt: nowIso,
        closedReason: reason,
        nextEvaluateAt: null,
        ...(converted ? { convertedAt: item.journey.convertedAt || nowIso } : {}),
      });
    }
    report.closed += 1;
  };
  const postpone = async (days: number, reason: string) => {
    if (item.journey) await patchJourney(ctx, item.userId, ladder.id, { nextEvaluateAt: iso(nowMs + days * DAY_MS) });
    report.blocked += 1;
    void reason;
  };

  // 1. Is this person still someone we should be talking to?
  if (!user || user.status === "deleted" || user.isActive === false) return close("user_gone", false);
  if (isPayingUser(user)) {
    if (!ctx.dryRun) await closeOpenOffersForPaidUser(ctx.db, item.userId, nowIso);
    return close("paid", true);
  }
  if (user.emailVerified !== true) return postpone(2, "email_not_verified");
  if (giftPending) return postpone(7, "reactivation_gift_pending");
  if (isGrantedPlan(user)) return postpone(2, "granted_plan");
  if (ladder.trigger === "trial_expired" && isActiveTrial(user, nowMs)) return postpone(2, "trial_active");

  // 2. First contact: decide once, for good, whether this person is held back to measure the effect of offers.
  let journey = item.journey;
  if (!journey) {
    const holdout = isHoldoutUser(item.userId, settings.holdoutPercent);
    if (holdout) {
      await ensureJourney(ctx, ladder, item, true);
      report.holdout += 1;
      return;
    }
  }

  // 3. Decide, passing over any rung this person cannot receive in full.
  let offers = allOffers.filter((offer) => offer.ladderId === ladder.id);
  const otherOpenOffer = allOffers.some(
    (offer) => offer.ladderId !== ladder.id && ["issued", "seen", "clicked", "claimed"].includes(offer.status) && new Date(offer.closesAt).getTime() > nowMs,
  );
  const offersLast90Days = allOffers.filter(
    (offer) => offer.status !== "suppressed" && (asMs(offer.issuedAt) ?? 0) >= nowMs - 90 * DAY_MS,
  ).length;
  const freeDaysGranted = freeDaysGrantedTo(allOffers);

  for (let step = 0; step <= ladder.rungs.length; step++) {
    const decision = decideNextAction({
      ladder,
      settings,
      now,
      anchorAt: item.anchorAt ? new Date(item.anchorAt) : null,
      offers: offers.map(toLite),
      journeyState: journey?.state ?? "open",
      otherOpenOffer,
      offersLast90Days,
      freeDaysGranted,
      weeklyBudgetExhausted: settings.weeklyFreeGrantBudget > 0 && ctx.freeIssuedLast7Days >= settings.weeklyFreeGrantBudget,
    });

    if (decision.action === "skip_rung") {
      journey = await ensureJourney(ctx, ladder, item, false);
      item.journey = journey;
      offers = [...offers, await recordSuppressedRung(ctx, ladder, decision.rungIndex, item.userId, decision.reason)];
      report.skippedRungs += 1;
      continue;
    }

    if (decision.action === "issue") {
      report.eligibleNow += 1;
      if (ctx.newOfferBudget <= 0) {
        report.deferredByRunLimit += 1;
        return;
      }
      ctx.newOfferBudget -= 1;
      const rung = ladder.rungs[decision.rungIndex];
      report.issued += 1;
      const key = `${ladder.id}:${rung.id}`;
      report.byRung[key] = (report.byRung[key] || 0) + 1;
      if (report.samples.length < PREVIEW_SAMPLES) {
        report.samples.push({
          userId: item.userId,
          email: typeof user.email === "string" ? user.email : null,
          ladderId: ladder.id,
          rungId: rung.id,
          label: rung.label,
        });
      }
      if (rung.freeDays + rung.trialExtensionDays > 0) ctx.freeIssuedLast7Days += 1;
      if (ctx.dryRun) return;

      journey = await ensureJourney(ctx, ladder, item, false);
      item.journey = journey;
      const offer = await issueOffer(ctx, ladder, decision.rungIndex, user, allOffers);
      if (offer) {
        await patchJourney(ctx, item.userId, ladder.id, { state: "open", lastOfferAt: nowIso, nextEvaluateAt: offer.closesAt });
      }
      return;
    }

    if (decision.action === "wait") {
      report.waiting += 1;
      if (item.journey || decision.until) {
        journey = await ensureJourney(ctx, ladder, item, false);
        item.journey = journey;
        await patchJourney(ctx, item.userId, ladder.id, { nextEvaluateAt: decision.until ?? iso(nowMs + DAY_MS) });
      }
      return;
    }

    if (decision.action === "close") return close("redeemed", true);

    if (decision.action === "sunset") {
      journey = await ensureJourney(ctx, ladder, item, false);
      await patchJourney(ctx, item.userId, ladder.id, { state: "sunset", closedAt: nowIso, nextEvaluateAt: null });
      report.sunset += 1;
      return;
    }

    // blocked: the journey is already closed, in holdout, or sunset.
    report.blocked += 1;
    return;
  }
}

/** Anyone who became a customer stops getting offers; their open ones are marked as superseded. */
async function closeOpenOffersForPaidUser(db: Db, userId: string, nowIso: string): Promise<void> {
  await offersOf(db).updateMany(
    { userId, status: { $in: OCCUPYING } },
    { $set: { status: "superseded", closesAt: nowIso } },
  );
}

/** One batch of people on one ladder: load what the rules need in a few queries, then decide for each. */
async function processBatch(ctx: RunContext, ladder: OfferLadder, items: WorkItem[]): Promise<void> {
  if (items.length === 0) return;
  const ids = items.map((item) => item.userId);
  const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));

  const [users, offers, gifts] = await Promise.all([
    ctx.db.collection("users").find({ _id: { $in: objectIds } }, { projection: USER_PROJECTION }).toArray(),
    offersOf(ctx.db).find({ userId: { $in: ids } }).toArray(),
    ctx.db
      .collection("reactivation_offers")
      .find({ userId: { $in: ids }, status: { $in: ["available", "granting"] } }, { projection: { userId: 1 } })
      .toArray(),
  ]);
  const userById = new Map<string, UserDoc>(users.map((user) => [String(user._id), user as UserDoc]));
  const offersByUser = new Map<string, UserOffer[]>();
  for (const offer of offers) {
    const list = offersByUser.get(offer.userId) || [];
    list.push(offer);
    offersByUser.set(offer.userId, list);
  }
  const giftUsers = new Set(gifts.map((gift) => String(gift.userId)));

  for (const item of items) {
    try {
      await processUser(ctx, ladder, item, userById.get(item.userId), offersByUser.get(item.userId) || [], giftUsers.has(item.userId));
    } catch (error) {
      ctx.report.errors += 1;
      console.error(`[offer-journeys] ${ladder.id} failed for ${item.userId}:`, error);
    }
  }
}

/** Offers whose time has run out are marked expired, so the admin screens and counts stay honest. */
async function sweepExpiredOffers(db: Db, nowIso: string): Promise<number> {
  const result = await offersOf(db).updateMany(
    { status: { $in: OCCUPYING }, closesAt: { $lte: nowIso } },
    { $set: { status: "expired" } },
  );
  return result.modifiedCount;
}

/**
 * "Your free period ends soon, keep it at half price" for offers that combine
 * free days with a discount. Claimed first, then sent, so nobody gets it twice.
 */
async function sendFreePeriodReminders(ctx: RunContext, config: OfferConfig): Promise<number> {
  const soon = iso(ctx.now.getTime() + REMINDER_LEAD_DAYS * DAY_MS);
  const due = await offersOf(ctx.db)
    .find({
      status: "claimed",
      kind: "free_period",
      "params.percentOff": { $gt: 0 },
      reminderSentAt: null,
      freeUntil: { $gt: ctx.nowIso, $lte: soon },
    })
    .limit(200)
    .toArray();

  let sent = 0;
  for (const offer of due) {
    try {
      const claim = await offersOf(ctx.db).updateOne(
        { _id: offer._id, reminderSentAt: null },
        { $set: { reminderSentAt: ctx.nowIso } },
      );
      if (claim.modifiedCount !== 1) continue;

      const ladder = config.ladders.find((l) => l.id === offer.ladderId);
      if (!ladder || !offer.code || !offer.freeUntil || !ObjectId.isValid(offer.userId)) continue;
      const user = await ctx.db
        .collection("users")
        .findOne({ _id: new ObjectId(offer.userId) }, { projection: USER_PROJECTION });
      if (!user || typeof user.email !== "string" || !user.email) continue;
      if (user.emailVerified !== true || user.emailPreferences?.marketing === false) continue;
      if (isPayingUser(user)) continue;

      const ok = await sendEmail(
        offerFreePeriodEndingEmail({
          toEmail: user.email,
          name: firstNameOf(user),
          freeUntil: offer.freeUntil,
          percentOff: offer.params.percentOff,
          discountMonths: offer.params.discountMonths,
          ctaUrl: absoluteUrl(plansPathFor(offer)),
          promoCode: offer.code,
          unsubscribeUrl: buildUnsubscribeUrl(offer.userId),
        }),
      );
      if (ok) sent += 1;
    } catch (error) {
      console.error("[offer-journeys] Reminder failed:", error);
    }
  }
  return sent;
}

function plansPathFor(offer: UserOffer): string {
  const plan = offer.params.plans[0] || "basic";
  return `/subscription/plans?promo=${encodeURIComponent(offer.code || "")}&plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(offer.params.billingCycle)}`;
}

/** Only one run at a time: a retried or overlapping cron call must never issue offers twice. */
async function acquireRunLock(db: Db, now: Date): Promise<boolean> {
  const locks = db.collection<{ _id: string; lockedUntil: string | null }>(COLLECTIONS.OFFER_SETTINGS);
  try {
    const result = await locks.findOneAndUpdate(
      { _id: RUN_LOCK_ID, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now.toISOString() } }] },
      { $set: { lockedUntil: iso(now.getTime() + RUN_LOCK_MS) } },
      { upsert: true, returnDocument: "after" },
    );
    return Boolean(result);
  } catch (error: any) {
    // The lock document exists and is still held.
    if (error?.code === 11000) return false;
    throw error;
  }
}

async function releaseRunLock(db: Db): Promise<void> {
  await db
    .collection<{ _id: string; lockedUntil: string | null }>(COLLECTIONS.OFFER_SETTINGS)
    .updateOne({ _id: RUN_LOCK_ID }, { $set: { lockedUntil: null } })
    .catch(() => undefined);
}

/**
 * The daily evaluation. With dryRun it only counts and previews: no offers,
 * journeys, emails or announcements are written, and ladders that are switched
 * off are included so an admin can see what turning them on would do.
 */
export async function runOfferJourneys(opts: { now?: Date; dryRun?: boolean } = {}): Promise<OfferRunReport> {
  const now = opts.now ?? new Date();
  const dryRun = Boolean(opts.dryRun);
  const report = emptyReport(dryRun);

  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const config = await loadOfferConfig();

  if (!dryRun && !config.settings.enabled) {
    report.ran = false;
    report.skippedReason = "offers_disabled";
    return report;
  }
  if (!dryRun && !(await acquireRunLock(db, now))) {
    report.ran = false;
    report.skippedReason = "already_running";
    return report;
  }

  try {
    const nowIso = now.toISOString();
    const weekAgo = iso(now.getTime() - 7 * DAY_MS);
    const freeIssuedLast7Days = await offersOf(db).countDocuments({
      status: { $ne: "suppressed" },
      kind: { $in: FREE_KINDS },
      issuedAt: { $gte: weekAgo },
    });

    const ctx: RunContext = {
      db,
      now,
      nowIso,
      dryRun,
      settings: config.settings,
      report,
      newOfferBudget: config.settings.maxNewOffersPerRun,
      freeIssuedLast7Days,
    };

    if (!dryRun) {
      report.expiredOffers = await sweepExpiredOffers(db, nowIso);
      report.remindersSent = await sendFreePeriodReminders(ctx, config);
    }

    for (const ladder of config.ladders) {
      if (!ladder.enabled && !dryRun) continue;

      // People already on the ladder whose turn has come: progress them before taking on new people.
      const due = await journeysOf(db)
        .find({ ladderId: ladder.id, state: "open", nextEvaluateAt: { $ne: null, $lte: nowIso } })
        .sort({ nextEvaluateAt: 1 })
        .limit(DUE_JOURNEYS_PER_LADDER)
        .toArray();
      await processBatch(
        ctx,
        ladder,
        due.map((journey) => ({ userId: journey.userId, journey, anchorAt: journey.anchorAt })),
      );

      const fresh =
        ladder.trigger === "trial_expired"
          ? await discoverExpiredTrials(db, ladder, nowIso)
          : await discoverLightUseTrials(db, ladder, now);
      await processBatch(ctx, ladder, fresh);
    }

    return report;
  } finally {
    if (!dryRun) await releaseRunLock(db);
  }
}

// ── Claiming a free offer ──────────────────────────────────────────────────

export interface ClaimResult {
  success: true;
  alreadyClaimed: boolean;
  kind: OfferKind;
  /** The plan a free period unlocked (always Basic); null for a trial extension. */
  plan: typeof FREE_PERIOD_PLAN | null;
  /** When the free period or extended trial ends. */
  freeUntil: string;
  percentOff: number;
  discountMonths: number;
  code: string | null;
  /** Where to send the person to keep the plan at the discounted price. */
  plansUrl: string | null;
}

function claimResult(offer: UserOffer, alreadyClaimed: boolean): ClaimResult {
  return {
    success: true,
    alreadyClaimed,
    kind: offer.kind,
    plan: offer.kind === "free_period" ? FREE_PERIOD_PLAN : null,
    freeUntil: offer.freeUntil || offer.closesAt,
    percentOff: offer.params.percentOff,
    discountMonths: offer.params.discountMonths,
    code: offer.code,
    plansUrl: offer.code ? plansPathFor(offer) : null,
  };
}

/**
 * One free offer per device and per email address. The same keys the free trial
 * uses are recorded per rung, so a second account on the same computer cannot
 * collect the same free month.
 */
async function reserveClaimSignals(
  db: Db,
  userId: string,
  email: string,
  kind: string,
): Promise<{ ok: true; keys: string[] } | { ok: false }> {
  const keys = new Set<string>();
  if (email) keys.add(getTrialSignalKey("email", normalizeEmailForTrial(email)));
  const owned = await db
    .collection(COLLECTIONS.TRIAL_CLAIM_SIGNALS)
    .find({ userId, signalType: { $in: ["device_fingerprint", "installation", "device"] } }, { projection: { signalKey: 1 } })
    .toArray();
  for (const row of owned) if (row.signalKey) keys.add(String(row.signalKey));

  const signals = db.collection(COLLECTIONS.OFFER_CLAIM_SIGNALS);
  const inserted: string[] = [];
  for (const signalKey of keys) {
    try {
      await signals.insertOne({ signalKey, kind, userId, createdAt: new Date().toISOString() });
      inserted.push(signalKey);
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const existing = await signals.findOne({ signalKey, kind });
      if (existing && existing.userId !== userId) {
        await releaseClaimSignals(db, userId, kind, inserted);
        return { ok: false };
      }
    }
  }
  return { ok: true, keys: inserted };
}

async function releaseClaimSignals(db: Db, userId: string, kind: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await db.collection(COLLECTIONS.OFFER_CLAIM_SIGNALS).deleteMany({ userId, kind, signalKey: { $in: keys } });
}

/**
 * The person pressed the claim button on a free-period or trial-extension offer.
 * Free periods are always the Basic plan, with no card, and end on their own.
 * The offer is marked claimed first (that is the lock), then the grant is made;
 * if the grant fails everything is put back so the person can try again.
 */
export async function claimOffer(userId: string, ladderId: string, rungId: string): Promise<ClaimResult> {
  if (!ObjectId.isValid(userId)) throw new OfferError("Sign in to claim this offer.", 401);
  const client = await clientPromise;
  const db = client.db();
  await ensureIndexes();

  const config = await loadOfferConfig();
  const ladder = config.ladders.find((candidate) => candidate.id === ladderId);
  if (!config.settings.enabled || !ladder || !ladder.enabled || !ladder.rungs.some((rung) => rung.id === rungId)) {
    throw new OfferError("This offer is no longer available.", 410);
  }

  const users = db.collection("users");
  const userObjectId = new ObjectId(userId);
  const user = await users.findOne({ _id: userObjectId });
  if (!user || user.status === "deleted" || user.isActive === false) {
    throw new OfferError("This offer is not available for this account.", 403);
  }
  if (user.emailVerified !== true) throw new OfferError("Verify your email address to claim this offer.", 403);

  const offer = await offersOf(db).findOne({ userId, ladderId, rungId });
  if (!offer?._id) throw new OfferError("This offer is not available for this account.", 404);
  if (offer.status === "claimed") return claimResult(offer, true);

  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  if (!isOfferActionable({ status: offer.status, closesAt: offer.closesAt, percentOff: offer.params.percentOff }, now)) {
    throw new OfferError("This offer has ended.", 410);
  }
  if (offer.kind === "percent_off") throw new OfferError("This offer is applied when you subscribe.", 400);
  if (isPayingUser(user)) throw new OfferError("You already have an active plan.", 409);
  if (isGrantedPlan(user)) throw new OfferError("Another plan is already active on this account.", 409);
  if (offer.kind === "free_period" && isActiveTrial(user, nowMs)) {
    throw new OfferError("Your free trial is still running. This offer will be here when it ends.", 409);
  }

  let trial = null;
  if (offer.kind === "trial_extension") {
    trial = await getTrialForUser(userId);
    if (!trial || (trial.status !== "active" && trial.status !== "expired")) {
      throw new OfferError("A trial extension is not available for this account.", 409);
    }
  }

  const days = offer.params.freeDays + offer.params.trialExtensionDays;
  const mine = await offersOf(db).find({ userId }).toArray();
  const alreadyGranted = freeDaysGrantedTo(mine.filter((other) => String(other._id) !== String(offer._id)));
  if (alreadyGranted + days > config.settings.maxFreeDaysPerUser) {
    throw new OfferError("This account has reached the limit for free time.", 409);
  }

  const signalKind = `${ladderId}:${rungId}`;
  const reservation = await reserveClaimSignals(db, userId, typeof user.email === "string" ? user.email : "", signalKind);
  if (!reservation.ok) {
    throw new OfferError("This offer has already been used on this device or email address.", 409);
  }

  const locked = await offersOf(db).findOneAndUpdate(
    { _id: offer._id, status: { $in: OPEN_FOR_CLAIM }, closesAt: { $gt: nowIso } },
    { $set: { status: "claimed", claimedAt: nowIso } },
    { returnDocument: "before" },
  );
  if (!locked) {
    await releaseClaimSignals(db, userId, signalKind, reservation.keys);
    const latest = await offersOf(db).findOne({ _id: offer._id });
    if (latest?.status === "claimed") return claimResult(latest, true);
    throw new OfferError("Your offer is being activated. Please try again in a moment.", 409);
  }

  try {
    let freeUntil: Date;
    let closesAt: string;

    if (offer.kind === "free_period") {
      freeUntil = new Date(nowMs + offer.params.freeDays * DAY_MS);
      const granted = await users.updateOne(
        {
          _id: userObjectId,
          $or: [{ plan: "free" }, { plan: { $exists: false } }, { plan: null }],
          "adminTemporaryPlan.active": { $ne: true },
          "adminManagedSubscription.active": { $ne: true },
          "ambassador.active": { $ne: true },
        },
        {
          $set: {
            plan: FREE_PERIOD_PLAN,
            adminTemporaryPlan: {
              active: true,
              plan: FREE_PERIOD_PLAN,
              previousPlan: "free",
              returnPlan: "free",
              grantedBy: "offer_journeys",
              grantedAt: nowIso,
              startedAt: nowIso,
              expiresAt: freeUntil.toISOString(),
              durationDays: offer.params.freeDays,
              reason: `Win-back offer: ${describeRung(offer.params)}`,
              campaignKey: rungTag(ladderId, rungId),
              offerId: String(offer._id),
              endedAt: null,
              endedBy: null,
              endedReason: null,
              expiredAt: null,
            },
          },
        },
      );
      if (granted.modifiedCount === 0) throw new OfferError("Another plan is already active on this account.", 409);

      try {
        await upsertSubscription(userId, {
          plan: FREE_PERIOD_PLAN,
          status: "active",
          autoRenew: false,
          currentPeriodEnd: freeUntil.toISOString(),
        });
      } catch (error) {
        await users.updateOne(
          { _id: userObjectId, "adminTemporaryPlan.offerId": String(offer._id) },
          {
            $set: {
              plan: "free",
              "adminTemporaryPlan.active": false,
              "adminTemporaryPlan.endedAt": new Date().toISOString(),
              "adminTemporaryPlan.endedBy": "offer_journeys",
              "adminTemporaryPlan.endedReason": "grant_failed",
            },
          },
        );
        throw error;
      }

      closesAt = closesAtAfterFreeClaim(freeUntil, offer.params.percentOff > 0);
      await logAuditEvent({
        adminId: "offer_journeys",
        action: "temporary_plan_grant",
        targetUserId: userId,
        details: {
          plan: FREE_PERIOD_PLAN,
          durationDays: offer.params.freeDays,
          expiresAt: freeUntil.toISOString(),
          ladderId,
          rungId,
          offerId: String(offer._id),
        },
        timestamp: now,
      });
    } else {
      const current = trial!;
      const stillRunning = current.status === "active" && (asMs(current.endsAt) ?? 0) > nowMs;
      const base = stillRunning ? (asMs(current.endsAt) as number) : nowMs;
      freeUntil = new Date(base + offer.params.trialExtensionDays * DAY_MS);
      await updateTrialRecord(String(current._id), {
        status: "active",
        endsAt: freeUntil.toISOString(),
        extendedDays: (current.extendedDays || 0) + offer.params.trialExtensionDays,
        extensionCount: (current.extensionCount || 0) + 1,
        lastModifiedBy: "offer_journeys",
        ...(stillRunning ? {} : { restartedAt: nowIso, stoppedAt: null, stoppedReason: null }),
      });
      await logTrialAction({
        userId,
        action: stillRunning ? "extended" : "reactivated",
        performedBy: "offer_journeys",
        previousExpiry: current.endsAt,
        newExpiry: freeUntil.toISOString(),
        notes: `Win-back offer ${ladderId}/${rungId}: +${offer.params.trialExtensionDays} days`,
      });
      closesAt = closesAtAfterFreeClaim(freeUntil, false);
    }

    await offersOf(db).updateOne(
      { _id: offer._id },
      { $set: { freeUntil: freeUntil.toISOString(), closesAt } },
    );
    await journeysOf(db).updateOne(
      { userId, ladderId },
      { $set: { nextEvaluateAt: closesAt, updatedAt: nowIso } },
    );
    return claimResult({ ...offer, status: "claimed", freeUntil: freeUntil.toISOString(), closesAt }, false);
  } catch (error) {
    await offersOf(db).updateOne(
      { _id: offer._id, status: "claimed" },
      { $set: { status: locked.status }, $unset: { claimedAt: "" } },
    );
    await releaseClaimSignals(db, userId, signalKind, reservation.keys);
    throw error;
  }
}

// ── What a signed-in person can act on right now ───────────────────────────

export interface ActiveOfferView {
  offerId: string;
  ladderId: string;
  rungId: string;
  kind: OfferKind;
  status: OfferStatus;
  title: string;
  message: string;
  ctaLabel: string;
  code: string | null;
  percentOff: number;
  discountMonths: number;
  freeDays: number;
  trialExtensionDays: number;
  plans: UserOfferParams["plans"];
  billingCycle: UserOfferParams["billingCycle"];
  closesAt: string;
  freeUntil: string | null;
  /** True while the person still has to press claim. */
  needsClaim: boolean;
}

export async function listActiveOffersForUser(userId: string, now = new Date()): Promise<ActiveOfferView[]> {
  if (!userId) return [];
  const config = await loadOfferConfig();
  if (!config.settings.enabled) return [];
  const client = await clientPromise;
  const offers = await offersOf(client.db()).find({ userId, status: { $in: OCCUPYING } }).sort({ issuedAt: -1 }).toArray();

  const views: ActiveOfferView[] = [];
  for (const offer of offers) {
    if (!isOfferActionable({ status: offer.status, closesAt: offer.closesAt, percentOff: offer.params.percentOff }, now)) continue;
    const ladder = config.ladders.find((candidate) => candidate.id === offer.ladderId);
    const rung = ladder?.rungs.find((candidate) => candidate.id === offer.rungId);
    if (!ladder?.enabled || !rung || !offer._id) continue;
    views.push({
      offerId: String(offer._id),
      ladderId: offer.ladderId,
      rungId: offer.rungId,
      kind: offer.kind,
      status: offer.status,
      title: rung.title,
      message: rung.message,
      ctaLabel: rung.ctaLabel,
      code: offer.code,
      percentOff: offer.params.percentOff,
      discountMonths: offer.params.discountMonths,
      freeDays: offer.params.freeDays,
      trialExtensionDays: offer.params.trialExtensionDays,
      plans: offer.params.plans,
      billingCycle: offer.params.billingCycle,
      closesAt: offer.closesAt,
      freeUntil: offer.freeUntil || null,
      needsClaim: rungNeedsClaim(offer.params) && offer.status !== "claimed",
    });
  }
  return views;
}

// ── Admin: one person ──────────────────────────────────────────────────────

export interface UserOfferHistory {
  journeys: OfferJourney[];
  offers: UserOffer[];
}

export async function getUserOfferHistory(userId: string): Promise<UserOfferHistory> {
  const client = await clientPromise;
  const db = client.db();
  const [journeys, offers] = await Promise.all([
    journeysOf(db).find({ userId }).toArray(),
    offersOf(db).find({ userId }).sort({ issuedAt: 1 }).toArray(),
  ]);
  return { journeys, offers };
}

/** Stop all offers to this person on one ladder, for good. Open offers end now. */
export async function suppressJourney(userId: string, ladderId: string, adminId: string): Promise<void> {
  const config = await loadOfferConfig();
  if (!config.ladders.some((ladder) => ladder.id === ladderId)) throw new OfferError("Unknown ladder.", 404);
  const client = await clientPromise;
  const db = client.db();
  const nowIso = new Date().toISOString();

  await offersOf(db).updateMany(
    { userId, ladderId, status: { $in: OCCUPYING } },
    { $set: { status: "superseded", closesAt: nowIso, note: `Stopped by admin ${adminId}` } },
  );
  await journeysOf(db).updateOne(
    { userId, ladderId },
    {
      $set: { state: "closed", closedAt: nowIso, closedReason: "suppressed", nextEvaluateAt: null, updatedAt: nowIso },
      $setOnInsert: {
        userId,
        ladderId,
        holdout: false,
        anchorAt: null,
        lastOfferAt: null,
        convertedAt: null,
        createdAt: nowIso,
      },
    },
    { upsert: true },
  );
}

/**
 * Admin: give this person the next rung now instead of waiting for the daily
 * run. The usual protections still apply (an open offer, the 90-day cap, the
 * free-days limit) and the ladder has to be on, since the pop-up and claim
 * button only work while it is.
 */
export async function issueNextRungNow(userId: string, ladderId: string, adminId: string): Promise<{ rungId: string; label: string }> {
  if (!ObjectId.isValid(userId)) throw new OfferError("Invalid user.", 400);
  const config = await loadOfferConfig();
  const ladder = config.ladders.find((candidate) => candidate.id === ladderId);
  if (!ladder) throw new OfferError("Unknown ladder.", 404);
  if (!config.settings.enabled || !ladder.enabled) {
    throw new OfferError("Turn this ladder on first. Pop-ups and claim buttons only work while it is on.", 409);
  }

  const client = await clientPromise;
  const db = client.db();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) }, { projection: USER_PROJECTION });
  if (!user || user.status === "deleted" || user.isActive === false) throw new OfferError("This account is not active.", 409);
  if (isPayingUser(user)) throw new OfferError("This person already has a paid plan.", 409);
  if (user.emailVerified !== true) throw new OfferError("This person has not verified their email.", 409);

  const allOffers = await offersOf(db).find({ userId }).toArray();
  let offers: UserOffer[] = allOffers.filter((offer) => offer.ladderId === ladderId);
  const journey = await journeysOf(db).findOne({ userId, ladderId });
  if (journey && journey.state !== "open") {
    const why =
      journey.state === "holdout"
        ? "This person is in the group held back to measure the offers' effect, so no offers are issued to them."
        : journey.state === "sunset"
          ? "This person has already received every rung and the ladder is finished for them."
          : "This person's offers on this ladder have been closed (they subscribed, were stopped, or the account is gone).";
    throw new OfferError(why, 409);
  }

  const report = emptyReport(false);
  const ctx: RunContext = {
    db,
    now,
    nowIso,
    dryRun: false,
    // An admin chose to send this, so the weekly email limit does not apply.
    settings: { ...config.settings, maxEmailsPer7Days: 7 },
    report,
    newOfferBudget: 1,
    freeIssuedLast7Days: 0,
  };
  const item: WorkItem = { userId, journey, anchorAt: journey?.anchorAt ?? null };

  for (let step = 0; step <= ladder.rungs.length; step++) {
    const nextIndex = offers.length;
    if (nextIndex >= ladder.rungs.length) throw new OfferError("This person has already received every rung.", 409);
    // The admin is overriding the wait between rungs, nothing else.
    const unhurried: OfferLadder = {
      ...ladder,
      rungs: ladder.rungs.map((rung, index) => (index === nextIndex ? { ...rung, waitDays: 0 } : rung)),
    };
    const decision = decideNextAction({
      ladder: unhurried,
      settings: config.settings,
      now,
      anchorAt: null,
      offers: offers.map(toLite),
      journeyState: journey?.state ?? "open",
      otherOpenOffer: allOffers.some(
        (offer) => offer.ladderId !== ladderId && OCCUPYING.includes(offer.status) && new Date(offer.closesAt).getTime() > nowMs,
      ),
      offersLast90Days: allOffers.filter(
        (offer) => offer.status !== "suppressed" && (asMs(offer.issuedAt) ?? 0) >= nowMs - 90 * DAY_MS,
      ).length,
      freeDaysGranted: freeDaysGrantedTo(allOffers),
      weeklyBudgetExhausted: false,
    });

    if (decision.action === "skip_rung") {
      offers = [...offers, await recordSuppressedRung(ctx, ladder, decision.rungIndex, userId, decision.reason)];
      continue;
    }
    if (decision.action === "issue") {
      const rung = ladder.rungs[decision.rungIndex];
      await ensureJourney(ctx, ladder, item, false);
      const offer = await issueOffer(ctx, ladder, decision.rungIndex, user, allOffers);
      if (!offer) throw new OfferError("This rung was already issued.", 409);
      await patchJourney(ctx, userId, ladderId, { state: "open", lastOfferAt: nowIso, nextEvaluateAt: offer.closesAt });
      await logAuditEvent({
        adminId,
        action: "plan_change",
        targetUserId: userId,
        details: { kind: "offer_issued_by_admin", ladderId, rungId: rung.id },
        timestamp: now,
      });
      return { rungId: rung.id, label: rung.label };
    }
    const reason =
      decision.action === "wait"
        ? decision.reason === "open_offer"
          ? "This person already has an open offer on this ladder."
          : decision.reason === "other_ladder_offer"
            ? "This person has an open offer on another ladder."
            : decision.reason === "frequency_cap"
              ? "This person has reached the offer limit for 90 days."
              : "This offer cannot be issued right now."
        : decision.action === "sunset"
          ? "This person has already received every rung."
          : "This offer cannot be issued.";
    throw new OfferError(reason, 409);
  }
  throw new OfferError("This offer cannot be issued.", 409);
}

// ── Admin: results ─────────────────────────────────────────────────────────

export interface RungResults {
  rungId: string;
  label: string;
  issued: number;
  emailed: number;
  seen: number;
  clicked: number;
  claimed: number;
  redeemed: number;
  expired: number;
  suppressed: number;
}

export interface CohortResults {
  people: number;
  converted: number;
}

export interface LadderResults {
  ladderId: string;
  open: number;
  waiting: number;
  sunset: number;
  closed: number;
  rungs: RungResults[];
  /** Everyone eligible and not held back, offered or still waiting their turn. */
  offered: CohortResults;
  /** Eligible people deliberately given no offers, to show what would have happened anyway. */
  holdout: CohortResults;
}

export async function getOfferResults(config?: OfferConfig): Promise<LadderResults[]> {
  const resolved = config ?? (await loadOfferConfig());
  const client = await clientPromise;
  const db = client.db();

  const [offerRows, journeyRows] = await Promise.all([
    offersOf(db)
      .aggregate<{ _id: { ladderId: string; rungId: string } } & Omit<RungResults, "rungId" | "label">>([
        {
          $group: {
            _id: { ladderId: "$ladderId", rungId: "$rungId" },
            issued: { $sum: { $cond: [{ $ne: ["$status", "suppressed"] }, 1, 0] } },
            emailed: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$channels.email.sentAt", null] }, null] }, 1, 0] } },
            seen: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$seenAt", null] }, null] }, 1, 0] } },
            clicked: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$clickedAt", null] }, null] }, 1, 0] } },
            claimed: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$claimedAt", null] }, null] }, 1, 0] } },
            redeemed: { $sum: { $cond: [{ $eq: ["$status", "redeemed"] }, 1, 0] } },
            expired: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
            suppressed: { $sum: { $cond: [{ $eq: ["$status", "suppressed"] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    journeysOf(db)
      .aggregate<{ _id: { ladderId: string; state: JourneyState; holdout: boolean }; people: number; converted: number; waiting: number }>([
        {
          $group: {
            _id: { ladderId: "$ladderId", state: "$state", holdout: "$holdout" },
            people: { $sum: 1 },
            converted: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$convertedAt", null] }, null] }, 1, 0] } },
            waiting: { $sum: { $cond: [{ $and: [{ $eq: ["$state", "open"] }, { $eq: [{ $ifNull: ["$lastOfferAt", null] }, null] }] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
  ]);

  return resolved.ladders.map((ladder) => {
    const rungs: RungResults[] = ladder.rungs.map((rung) => {
      const row = offerRows.find((candidate) => candidate._id.ladderId === ladder.id && candidate._id.rungId === rung.id);
      return {
        rungId: rung.id,
        label: rung.label,
        issued: row?.issued ?? 0,
        emailed: row?.emailed ?? 0,
        seen: row?.seen ?? 0,
        clicked: row?.clicked ?? 0,
        claimed: row?.claimed ?? 0,
        redeemed: row?.redeemed ?? 0,
        expired: row?.expired ?? 0,
        suppressed: row?.suppressed ?? 0,
      };
    });

    const mine = journeyRows.filter((row) => row._id.ladderId === ladder.id);
    const sum = (rows: typeof mine, field: "people" | "converted") => rows.reduce((total, row) => total + row[field], 0);
    const byState = (state: JourneyState) => sum(mine.filter((row) => row._id.state === state), "people");
    const offeredRows = mine.filter((row) => !row._id.holdout);
    const holdoutRows = mine.filter((row) => row._id.holdout);

    return {
      ladderId: ladder.id,
      open: byState("open"),
      waiting: mine.filter((row) => row._id.state === "open").reduce((total, row) => total + row.waiting, 0),
      sunset: byState("sunset"),
      closed: byState("closed"),
      rungs,
      offered: { people: sum(offeredRows, "people"), converted: sum(offeredRows, "converted") },
      holdout: { people: sum(holdoutRows, "people"), converted: sum(holdoutRows, "converted") },
    } satisfies LadderResults;
  });
}

export async function countOpenOffers(): Promise<number> {
  const client = await clientPromise;
  return offersOf(client.db()).countDocuments({ status: { $in: OPEN_FOR_CLAIM }, closesAt: { $gt: new Date().toISOString() } });
}
