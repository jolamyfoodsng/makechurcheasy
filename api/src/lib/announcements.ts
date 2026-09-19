import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import { COLLECTIONS, ensureIndexes } from "./db";
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementDelivery,
  DiscountBillingCycle,
  PlanTier,
  AnnouncementSurface,
  AnnouncementTone,
} from "@/types/schemas";
import { EventEmitter } from "node:events";

// ── Event Bus for real-time notification ─────────────────────────────────────

let eventBus: EventEmitter | null = null;

export function getAnnouncementEventBus(): EventEmitter {
  if (!eventBus) {
    eventBus = new EventEmitter();
    eventBus.setMaxListeners(100);
  }
  return eventBus;
}

function emitPublished(announcementId: string): void {
  if (eventBus) {
    eventBus.emit("published", { type: "announcement_published", id: announcementId });
  }
}

function emitRestarted(announcementId: string): void {
  if (eventBus) {
    eventBus.emit("restarted", { type: "announcement_restarted", id: announcementId });
  }
}

export const ANNOUNCEMENT_AUDIENCES: AnnouncementAudience[] = [
  "all_users",
  "free_users",
  "paid_users",
  "trial_users",
  "basic_users",
  "growth_users",
  "ambassador_users",
  "just_subscribed",
  "cancelled_users",
  "expired_trials",
  "inactive_7d",
  "inactive_30d",
  "never_opened_app",
];

export const ANNOUNCEMENT_SURFACES: AnnouncementSurface[] = ["dashboard", "desktop"];
export const ANNOUNCEMENT_TONES: AnnouncementTone[] = ["info", "success", "warning", "offer", "upgrade"];

const PAID_PLANS = new Set(["basic", "growth", "unlimited", "ambassador"]);
const RECENT_SUBSCRIBER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface AnnouncementInput {
  title?: string;
  message?: string;
  tone?: AnnouncementTone;
  status?: Announcement["status"];
  surfaces?: AnnouncementSurface[];
  audience?: AnnouncementAudience;
  tags?: string[] | string;
  targetUserIds?: string[] | string;
  targetEmails?: string[] | string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  offerCode?: string | null;
  offerDiscountPercent?: number | string | null;
  offerDurationMonths?: number | string | null;
  offerMaxRedemptions?: number | string | null;
  offerApplicablePlans?: PlanTier[] | string;
  offerApplicableBillingCycles?: DiscountBillingCycle[] | string;
  priority?: number;
  publishAt?: string | null;
  expiresAt?: string | null;
  deliverySpacingMinutes?: number;
  maxShowsPerUser?: number;
}

export interface PublicAnnouncement {
  id: string;
  deliveryId: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  surface: AnnouncementSurface;
  tags: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  offerCode: string | null;
  offerDiscountPercent: number | null;
  offerDurationMonths: number | null;
  offerApplicablePlans: PlanTier[];
  offerApplicableBillingCycles: DiscountBillingCycle[];
  expiresAt: string | null;
  createdAt: string;
}

export type AnnouncementInsightRange = "daily" | "weekly" | "monthly";

export interface AnnouncementUserEvent {
  id: string;
  announcementId: string;
  announcementTitle: string;
  userId: string;
  userName: string;
  email: string;
  country: string;
  plan: string;
  surface: AnnouncementSurface;
  action: "viewed" | "dismissed" | "clicked";
  shownAt: string;
  dismissedAt: string | null;
  clickedAt: string | null;
  occurredAt: string;
}

export interface PlatformUserEvent {
  id: string;
  event: string;
  userId: string;
  userName: string;
  email: string;
  country: string;
  plan: string;
  occurredAt: string;
}

export interface AnnouncementAdminInsights {
  range: AnnouncementInsightRange;
  days: number;
  platform: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    periodActiveUsers: number;
    periodActions: number;
    announcementViews: number;
    announcementDismissals: number;
    announcementClicks: number;
    clickRate: number;
  };
  activitySeries: Array<{
    date: string;
    label: string;
    activeUsers: number;
    actions: number;
    announcementViews: number;
    announcementClicks: number;
  }>;
  topAnnouncements: Array<{
    announcementId: string;
    title: string;
    status: Announcement["status"];
    views: number;
    dismissals: number;
    clicks: number;
    clickRate: number;
  }>;
  topCountries: Array<{
    country: string;
    activeUsers: number;
    actions: number;
  }>;
  recentAnnouncementEvents: AnnouncementUserEvent[];
  recentPlatformEvents: PlatformUserEvent[];
}

function asArray(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function cleanStrings(value: string[] | string | undefined): string[] {
  return Array.from(
    new Set(
      asArray(value)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseDate(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function parseNullableDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function optionalBoundedNumber(value: unknown, fallback: number | null, min: number, max: number): number | null {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeOfferCode(value: unknown): string | null {
  const code = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  return code || null;
}

function cleanPlans(value: PlanTier[] | string | undefined): PlanTier[] {
  const plans = cleanStrings(value).filter((plan): plan is PlanTier =>
    plan === "basic" || plan === "growth",
  );
  return plans.length > 0 ? plans : ["basic", "growth"];
}

function cleanBillingCycles(value: DiscountBillingCycle[] | string | undefined): DiscountBillingCycle[] {
  const cycles = cleanStrings(value).filter((cycle): cycle is DiscountBillingCycle =>
    cycle === "monthly" || cycle === "yearly" || cycle === "lifetime",
  );
  return cycles.length > 0 ? cycles : ["monthly", "yearly"];
}

function rangeToDays(range: AnnouncementInsightRange): number {
  if (range === "daily") return 1;
  if (range === "weekly") return 7;
  return 30;
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgo(days: number): Date {
  const date = startOfToday();
  date.setDate(date.getDate() - Math.max(0, days - 1));
  return date;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseMaybeDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function idText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    const text = value.toString();
    return text === "[object Object]" ? "" : text;
  }
  return "";
}

function normalizeCountry(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Unknown";
  const compact = value.trim().replace(/[_-]/g, " ");
  const upper = compact.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(upper) || upper;
    } catch {
      return upper;
    }
  }
  return compact
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function userCountry(user: Record<string, any> | undefined): string {
  if (!user) return "Unknown";
  return normalizeCountry(user.country || user.billingCountry || user.profile?.country || user.demographics?.country);
}

function userDateSinceFilter(field: string, since: Date) {
  return {
    $or: [
      { [field]: { $gte: since } },
      { [field]: { $gte: since.toISOString() } },
    ],
  };
}

function deliveryDateSinceFilter(since: Date) {
  const sinceIso = since.toISOString();
  return {
    $or: [
      { shownAt: { $gte: sinceIso } },
      { clickedAt: { $gte: sinceIso } },
      { dismissedAt: { $gte: sinceIso } },
    ],
  };
}

function buildSeries(days: number) {
  const start = daysAgo(days);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: dateKey(date),
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      activeUsers: 0,
      actions: 0,
      announcementViews: 0,
      announcementClicks: 0,
    };
  });
}

function safeClickRate(clicks: number, views: number): number {
  return views > 0 ? Number(((clicks / views) * 100).toFixed(1)) : 0;
}

export function normalizeAnnouncementInput(
  body: AnnouncementInput,
  adminUserId: string,
  existing?: Announcement | null,
): Announcement {
  const now = new Date().toISOString();
  const title = String(body.title ?? existing?.title ?? "").trim();
  const message = String(body.message ?? existing?.message ?? "").trim();
  if (!title || !message) {
    throw new Error("title and message are required");
  }

  const tone = ANNOUNCEMENT_TONES.includes(body.tone as AnnouncementTone)
    ? body.tone as AnnouncementTone
    : existing?.tone ?? "info";
  const audience = ANNOUNCEMENT_AUDIENCES.includes(body.audience as AnnouncementAudience)
    ? body.audience as AnnouncementAudience
    : existing?.audience ?? "all_users";
  const inputSurfaces = cleanStrings(body.surfaces as string[] | string | undefined)
    .filter((surface): surface is AnnouncementSurface =>
      ANNOUNCEMENT_SURFACES.includes(surface as AnnouncementSurface),
    );
  const surfaces = inputSurfaces.length > 0 ? inputSurfaces : existing?.surfaces ?? ["dashboard", "desktop"];
  const publishAt = parseDate(body.publishAt, existing?.publishAt ?? now);
  const expiresAt = parseNullableDate(body.expiresAt) ?? existing?.expiresAt ?? null;
  const explicitStatus = body.status && ["draft", "scheduled", "active", "paused", "archived"].includes(body.status)
    ? body.status
    : null;
  const defaultStatus = new Date(publishAt).getTime() > Date.now() ? "scheduled" : "active";
  const offerCode = normalizeOfferCode(body.offerCode ?? existing?.offerCode);
  const offerDiscountPercent = optionalBoundedNumber(
    body.offerDiscountPercent ?? existing?.offerDiscountPercent,
    existing?.offerDiscountPercent ?? null,
    1,
    95,
  );
  const offerDurationMonths = optionalBoundedNumber(
    body.offerDurationMonths ?? existing?.offerDurationMonths,
    existing?.offerDurationMonths ?? (offerCode && offerDiscountPercent ? 1 : null),
    1,
    60,
  );
  const offerMaxRedemptions = optionalBoundedNumber(
    body.offerMaxRedemptions ?? existing?.offerMaxRedemptions,
    existing?.offerMaxRedemptions ?? null,
    0,
    1_000_000,
  );

  return {
    ...(existing ?? {}),
    title,
    message,
    tone,
    status: explicitStatus ?? existing?.status ?? defaultStatus,
    surfaces,
    audience,
    tags: cleanStrings(body.tags ?? existing?.tags ?? []),
    targetUserIds: cleanStrings(body.targetUserIds ?? existing?.targetUserIds ?? []),
    targetEmails: cleanStrings(body.targetEmails ?? existing?.targetEmails ?? []).map((email) => email.toLowerCase()),
    ctaLabel: String(body.ctaLabel ?? existing?.ctaLabel ?? "").trim() || null,
    ctaUrl: String(body.ctaUrl ?? existing?.ctaUrl ?? "").trim() || null,
    imageUrl: String(body.imageUrl ?? existing?.imageUrl ?? "").trim() || null,
    offerCode,
    offerDiscountPercent: offerCode ? offerDiscountPercent : null,
    offerDurationMonths: offerCode && offerDiscountPercent ? offerDurationMonths : null,
    offerMaxRedemptions: offerCode && offerDiscountPercent && offerMaxRedemptions ? offerMaxRedemptions : null,
    offerRedemptionCount: existing?.offerRedemptionCount ?? 0,
    offerApplicablePlans: offerCode && offerDiscountPercent
      ? cleanPlans(body.offerApplicablePlans ?? existing?.offerApplicablePlans)
      : [],
    offerApplicableBillingCycles: offerCode && offerDiscountPercent
      ? cleanBillingCycles(body.offerApplicableBillingCycles ?? existing?.offerApplicableBillingCycles)
      : [],
    priority: boundedNumber(body.priority ?? existing?.priority, 0, -100, 100),
    publishAt,
    expiresAt,
    deliverySpacingMinutes: boundedNumber(body.deliverySpacingMinutes ?? existing?.deliverySpacingMinutes, 60, 0, 24 * 60),
    maxShowsPerUser: boundedNumber(body.maxShowsPerUser ?? existing?.maxShowsPerUser, 1, 1, 5),
    createdBy: existing?.createdBy ?? adminUserId,
    updatedBy: existing ? adminUserId : null,
    metrics: existing?.metrics ?? { shown: 0, dismissed: 0, clicked: 0 },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function announcementToPublic(
  announcement: Announcement,
  delivery: AnnouncementDelivery,
  surface: AnnouncementSurface,
): PublicAnnouncement {
  return {
    id: announcement._id?.toString() || "",
    deliveryId: delivery._id?.toString() || "",
    title: announcement.title,
    message: announcement.message,
    tone: announcement.tone,
    surface,
    tags: announcement.tags || [],
    ctaLabel: announcement.ctaLabel || null,
    ctaUrl: announcement.ctaUrl || null,
    imageUrl: announcement.imageUrl || null,
    offerCode: announcement.offerCode || null,
    offerDiscountPercent: announcement.offerDiscountPercent || null,
    offerDurationMonths: announcement.offerDurationMonths || null,
    offerApplicablePlans: announcement.offerApplicablePlans || [],
    offerApplicableBillingCycles: announcement.offerApplicableBillingCycles || [],
    expiresAt: announcement.expiresAt || null,
    createdAt: announcement.createdAt,
  };
}

function isAnnouncementDeliverableNow(announcement: Announcement, nowIso: string): boolean {
  if (!["active", "scheduled"].includes(announcement.status)) return false;
  if (announcement.publishAt > nowIso) return false;
  if (announcement.expiresAt && announcement.expiresAt <= nowIso) return false;
  return true;
}

export async function userMatchesAnnouncement(
  announcement: Announcement,
  user: Record<string, any>,
): Promise<boolean> {
  const userId = user._id?.toString?.() || String(user._id || "");
  const email = String(user.email || "").toLowerCase();
  const plan = String(user.effectivePlan || user.plan || "free").toLowerCase();

  if (announcement.targetUserIds?.length && !announcement.targetUserIds.includes(userId)) {
    return false;
  }
  if (announcement.targetEmails?.length && !announcement.targetEmails.includes(email)) {
    return false;
  }

  switch (announcement.audience) {
    case "all_users":
      return true;
    case "free_users":
      return !PAID_PLANS.has(plan) && plan !== "trial";
    case "paid_users":
      return PAID_PLANS.has(plan);
    case "trial_users":
      return Boolean(user.trial?.active || user.trial?.status === "active" || plan === "trial");
    case "basic_users":
    case "growth_users":
      return plan === announcement.audience.replace("_users", "");
    case "ambassador_users":
      return Boolean(user.ambassador?.active || plan === "ambassador");
    case "cancelled_users":
      return String(user.subscriptionStatus || user.paymentStatus || "").toLowerCase() === "cancelled";
    case "expired_trials":
      return Boolean(user.trial?.status === "expired");
    case "just_subscribed": {
      const client = await clientPromise;
      const db = client.db();
      const since = new Date(Date.now() - RECENT_SUBSCRIBER_WINDOW_MS).toISOString();
      const subscription = await db.collection(COLLECTIONS.SUBSCRIPTIONS).findOne({
        userId,
        status: "active",
        createdAt: { $gte: since },
      });
      return Boolean(subscription);
    }
    case "inactive_7d":
    case "inactive_30d": {
      const days = announcement.audience === "inactive_7d" ? 7 : 30;
      const cutoff = new Date(Date.now() - days * 86400000);
      // If the user document itself shows recent activity, they're not inactive
      const lastLogin = user.lastLogin ? new Date(user.lastLogin) : null;
      const lastActive = user.lastActive ? new Date(user.lastActive) : null;
      if ((lastLogin && lastLogin >= cutoff) || (lastActive && lastActive >= cutoff)) {
        return false;
      }
      // Also check security_sessions for any recent session activity
      const client2 = await clientPromise;
      const db2 = client2.db();
      const recentSession = await db2
        .collection(COLLECTIONS.SECURITY_SESSIONS)
        .findOne({
          userId,
          lastActive: { $gte: cutoff.toISOString() },
        });
      return !recentSession;
    }
    case "never_opened_app": {
      const client3 = await clientPromise;
      const db3 = client3.db();
      const desktopSession = await db3
        .collection(COLLECTIONS.SECURITY_SESSIONS)
        .findOne({
          userId,
          $or: [
            { platform: { $regex: /desktop/i } },
            { deviceType: { $regex: /desktop/i } },
            { userAgent: { $regex: /electron/i } },
          ],
        });
      return !desktopSession;
    }
    default:
      return false;
  }
}

export async function listAnnouncements(limit = 50): Promise<Announcement[]> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  return db
    .collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS)
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function getAnnouncementStats() {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const now = new Date().toISOString();
  const [active, scheduled, paused, delivered, ended] = await Promise.all([
    db.collection(COLLECTIONS.ANNOUNCEMENTS).countDocuments({
      status: "active",
      publishAt: { $lte: now },
      $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    }),
    db.collection(COLLECTIONS.ANNOUNCEMENTS).countDocuments({
      $or: [{ status: "scheduled" }, { publishAt: { $gt: now } }],
    }),
    db.collection(COLLECTIONS.ANNOUNCEMENTS).countDocuments({ status: "paused" }),
    db.collection(COLLECTIONS.ANNOUNCEMENT_DELIVERIES).countDocuments({ shownAt: { $exists: true } }),
    db.collection(COLLECTIONS.ANNOUNCEMENTS).countDocuments({
      $or: [
        { status: "archived" },
        {
          status: { $in: ["active", "scheduled", "paused"] },
          expiresAt: { $ne: null, $lte: now },
        },
      ],
    }),
  ]);
  return { active, scheduled, paused, delivered, ended };
}

export async function getAnnouncementAdminInsights(
  range: AnnouncementInsightRange,
): Promise<AnnouncementAdminInsights> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const usersCol = db.collection("users");
  const announcementsCol = db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS);
  const deliveriesCol = db.collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES);
  const activityCol = db.collection("activity_events");

  const days = rangeToDays(range);
  const since = daysAgo(days);
  const today = startOfToday();
  const weekStart = daysAgo(7);
  const monthStart = daysAgo(30);

  async function activeUserSet(from: Date): Promise<Set<string>> {
    const [loginUsers, eventUserIds] = await Promise.all([
      usersCol
        .find(
          { status: { $ne: "deleted" }, ...userDateSinceFilter("lastLogin", from) },
          { projection: { _id: 1 } },
        )
        .toArray(),
      activityCol.distinct("userId", {
        userId: { $nin: [null, ""] },
        timestamp: { $gte: from },
      }),
    ]);
    return new Set([
      ...loginUsers.map((user) => idText(user._id)).filter(Boolean),
      ...eventUserIds.map((userId) => idText(userId)).filter(Boolean),
    ]);
  }

  const [
    dailyActiveSet,
    weeklyActiveSet,
    monthlyActiveSet,
    periodActiveSet,
    periodDeliveries,
    recentPlatformEventsRaw,
    activityAgg,
    userActionAgg,
    announcements,
  ] = await Promise.all([
    activeUserSet(today),
    activeUserSet(weekStart),
    activeUserSet(monthStart),
    activeUserSet(since),
    deliveriesCol
      .find(deliveryDateSinceFilter(since))
      .sort({ updatedAt: -1, shownAt: -1 })
      .limit(5000)
      .toArray(),
    activityCol
      .find({ userId: { $nin: [null, ""] }, timestamp: { $gte: since } })
      .sort({ timestamp: -1 })
      .limit(120)
      .toArray(),
    activityCol
      .aggregate([
        { $match: { userId: { $nin: [null, ""] }, timestamp: { $gte: since } } },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
              userId: "$userId",
            },
            actions: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: "$_id.day",
            activeUsers: { $sum: 1 },
            actions: { $sum: "$actions" },
          },
        },
      ])
      .toArray(),
    activityCol
      .aggregate([
        { $match: { userId: { $nin: [null, ""] }, timestamp: { $gte: since } } },
        { $group: { _id: "$userId", actions: { $sum: 1 } } },
      ])
      .toArray(),
    announcementsCol.find({}).sort({ createdAt: -1 }).limit(200).toArray(),
  ]);

  const announcementMap = new Map(announcements.map((announcement) => [
    announcement._id?.toString() || "",
    announcement,
  ]));

  const userIds = new Set<string>([
    ...periodActiveSet,
    ...periodDeliveries.map((delivery) => idText(delivery.userId)).filter(Boolean),
    ...recentPlatformEventsRaw.map((event) => idText(event.userId)).filter(Boolean),
    ...userActionAgg.map((event) => idText(event._id)).filter(Boolean),
  ]);

  const objectIds = Array.from(userIds)
    .filter((userId) => ObjectId.isValid(userId))
    .map((userId) => new ObjectId(userId));

  const users = objectIds.length
    ? await usersCol
      .find(
        { _id: { $in: objectIds } },
        { projection: { name: 1, email: 1, country: 1, billingCountry: 1, profile: 1, demographics: 1, plan: 1 } },
      )
      .toArray()
    : [];
  const userMap = new Map(users.map((user) => [idText(user._id), user]));

  const platformActions = userActionAgg.reduce((sum, doc) => sum + (doc.actions || 0), 0);
  const announcementViews = periodDeliveries.filter((delivery) => Boolean(delivery.shownAt)).length;
  const announcementDismissals = periodDeliveries.filter((delivery) => Boolean(delivery.dismissedAt)).length;
  const announcementClicks = periodDeliveries.filter((delivery) => Boolean(delivery.clickedAt)).length;

  const series = buildSeries(days);
  const seriesMap = new Map(series.map((item) => [item.date, item]));
  for (const doc of activityAgg) {
    const bucket = seriesMap.get(String(doc._id || ""));
    if (!bucket) continue;
    bucket.activeUsers = doc.activeUsers || 0;
    bucket.actions = doc.actions || 0;
  }
  for (const delivery of periodDeliveries) {
    const shownDate = parseMaybeDate(delivery.shownAt);
    if (shownDate) {
      const bucket = seriesMap.get(dateKey(shownDate));
      if (bucket) bucket.announcementViews += 1;
    }
    const clickedDate = parseMaybeDate(delivery.clickedAt);
    if (clickedDate) {
      const bucket = seriesMap.get(dateKey(clickedDate));
      if (bucket) bucket.announcementClicks += 1;
    }
  }

  const announcementBuckets = new Map<string, { views: number; dismissals: number; clicks: number }>();
  for (const delivery of periodDeliveries) {
    const key = idText(delivery.announcementId);
    if (!key) continue;
    const bucket = announcementBuckets.get(key) || { views: 0, dismissals: 0, clicks: 0 };
    if (delivery.shownAt) bucket.views += 1;
    if (delivery.dismissedAt) bucket.dismissals += 1;
    if (delivery.clickedAt) bucket.clicks += 1;
    announcementBuckets.set(key, bucket);
  }

  const topAnnouncements = Array.from(announcementBuckets.entries())
    .map(([announcementId, bucket]) => {
      const announcement = announcementMap.get(announcementId);
      return {
        announcementId,
        title: announcement?.title || "Deleted announcement",
        status: announcement?.status || "archived",
        views: bucket.views,
        dismissals: bucket.dismissals,
        clicks: bucket.clicks,
        clickRate: safeClickRate(bucket.clicks, bucket.views),
      };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);

  const countryBuckets = new Map<string, { activeUsers: Set<string>; actions: number }>();
  for (const userId of periodActiveSet) {
    const user = userMap.get(userId);
    const country = userCountry(user);
    const bucket = countryBuckets.get(country) || { activeUsers: new Set<string>(), actions: 0 };
    bucket.activeUsers.add(userId);
    countryBuckets.set(country, bucket);
  }
  for (const event of userActionAgg) {
    const userId = idText(event._id);
    const user = userMap.get(userId);
    const country = userCountry(user);
    const bucket = countryBuckets.get(country) || { activeUsers: new Set<string>(), actions: 0 };
    if (userId) bucket.activeUsers.add(userId);
    bucket.actions += event.actions || 0;
    countryBuckets.set(country, bucket);
  }

  const topCountries = Array.from(countryBuckets.entries())
    .map(([country, bucket]) => ({
      country,
      activeUsers: bucket.activeUsers.size,
      actions: bucket.actions,
    }))
    .sort((a, b) => b.activeUsers - a.activeUsers || b.actions - a.actions)
    .slice(0, 12);

  const recentAnnouncementEvents = periodDeliveries.slice(0, 120).map((delivery) => {
    const userId = idText(delivery.userId);
    const user = userMap.get(userId);
    const announcementId = idText(delivery.announcementId);
    const announcement = announcementMap.get(announcementId);
    const action = delivery.clickedAt ? "clicked" : delivery.dismissedAt ? "dismissed" : "viewed";
    return {
      id: idText(delivery._id),
      announcementId,
      announcementTitle: announcement?.title || "Deleted announcement",
      userId,
      userName: String(user?.name || "Unknown user"),
      email: String(user?.email || ""),
      country: userCountry(user),
      plan: String(user?.plan || "free"),
      surface: delivery.surface,
      action,
      shownAt: delivery.shownAt,
      dismissedAt: delivery.dismissedAt || null,
      clickedAt: delivery.clickedAt || null,
      occurredAt: delivery.clickedAt || delivery.dismissedAt || delivery.shownAt,
    } satisfies AnnouncementUserEvent;
  });

  const recentPlatformEvents = recentPlatformEventsRaw.map((event) => {
    const userId = idText(event.userId);
    const user = userMap.get(userId);
    const occurredAt = parseMaybeDate(event.timestamp)?.toISOString() || String(event.timestamp || "");
    return {
      id: idText(event._id),
      event: String(event.event || "unknown_event"),
      userId,
      userName: String(user?.name || "Unknown user"),
      email: String(user?.email || ""),
      country: userCountry(user),
      plan: String(user?.plan || "free"),
      occurredAt,
    } satisfies PlatformUserEvent;
  });

  return {
    range,
    days,
    platform: {
      dailyActiveUsers: dailyActiveSet.size,
      weeklyActiveUsers: weeklyActiveSet.size,
      monthlyActiveUsers: monthlyActiveSet.size,
      periodActiveUsers: periodActiveSet.size,
      periodActions: platformActions,
      announcementViews,
      announcementDismissals,
      announcementClicks,
      clickRate: safeClickRate(announcementClicks, announcementViews),
    },
    activitySeries: series,
    topAnnouncements,
    topCountries,
    recentAnnouncementEvents,
    recentPlatformEvents,
  };
}

export async function createAnnouncement(body: AnnouncementInput, adminUserId: string): Promise<Announcement> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const announcement = normalizeAnnouncementInput(body, adminUserId);
  const result = await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).insertOne(announcement);
  const created = { ...announcement, _id: result.insertedId };
  if (created.status === "active") {
    emitPublished(result.insertedId.toString());
  }
  return created;
}

export async function updateAnnouncement(
  id: string,
  body: AnnouncementInput,
  adminUserId: string,
): Promise<Announcement | null> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return null;
  }

  const existing = await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).findOne({ _id: objectId });
  if (!existing) return null;

  const announcement = normalizeAnnouncementInput(body, adminUserId, existing);
  const updateDoc = { ...announcement };
  delete updateDoc._id;
  await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).updateOne(
    { _id: objectId },
    { $set: updateDoc },
  );

  // Emit real-time event when published or restarted
  if (announcement.status === "active") {
    if (existing.status !== "active") {
      await db.collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES).deleteMany({
        announcementId: id,
      });
    }
    if (existing.status === "scheduled" || existing.status === "draft") {
      emitPublished(id);
    } else if (existing.status === "paused") {
      emitRestarted(id);
    }
  }

  return { ...announcement, _id: objectId };
}

export async function getNextAnnouncementForUser(
  user: Record<string, any>,
  surface: AnnouncementSurface,
): Promise<{ announcement: PublicAnnouncement | null; nextAvailableAt?: string | null }> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const userId = user._id?.toString?.() || String(user._id || "");
  const now = new Date();
  const nowIso = now.toISOString();

  const pendingDelivery = await db
    .collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES)
    .findOne(
      { userId, surface, dismissedAt: null },
      { sort: { shownAt: 1 } },
    );

  if (pendingDelivery && ObjectId.isValid(pendingDelivery.announcementId)) {
    const existing = await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).findOne({
      _id: new ObjectId(pendingDelivery.announcementId),
      status: { $in: ["active", "scheduled"] },
    });
    if (existing && isAnnouncementDeliverableNow(existing, nowIso)) {
      return { announcement: announcementToPublic(existing, pendingDelivery, surface) };
    }
  }

  const candidates = await db
    .collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS)
    .find({
      status: { $in: ["active", "scheduled"] },
      surfaces: surface,
      publishAt: { $lte: nowIso },
      $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: nowIso } }],
    })
    .sort({ priority: -1, publishAt: 1, createdAt: 1 })
    .limit(100)
    .toArray();

  let nextAvailableAt: string | null = null;

  for (const candidate of candidates) {
    const announcementId = candidate._id?.toString();
    if (!announcementId) continue;

    const existingDelivery = await db.collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES).findOne({
      userId,
      announcementId,
      surface,
    });
    const currentShowCount = existingDelivery?.showCount ?? (existingDelivery ? 1 : 0);
    if (currentShowCount >= Math.max(1, candidate.maxShowsPerUser || 1)) continue;
    if (!(await userMatchesAnnouncement(candidate, user))) continue;

    if (existingDelivery?.shownAt) {
      const spacingMs = Math.max(0, candidate.deliverySpacingMinutes || 0) * 60 * 1000;
      const allowedAtMs = new Date(existingDelivery.shownAt).getTime() + spacingMs;
      if (allowedAtMs > now.getTime()) {
        nextAvailableAt = new Date(allowedAtMs).toISOString();
        continue;
      }
    }

    let delivery: AnnouncementDelivery;
    if (existingDelivery?._id) {
      delivery = {
        ...existingDelivery,
        showCount: currentShowCount + 1,
        shownAt: nowIso,
        dismissedAt: null,
        clickedAt: null,
        updatedAt: nowIso,
      };
      await db.collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES).updateOne(
        { _id: existingDelivery._id },
        {
          $set: {
            showCount: delivery.showCount,
            shownAt: delivery.shownAt,
            dismissedAt: null,
            clickedAt: null,
            updatedAt: nowIso,
          },
        },
      );
    } else {
      delivery = {
        announcementId,
        userId,
        surface,
        showCount: 1,
        shownAt: nowIso,
        dismissedAt: null,
        clickedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const result = await db
        .collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES)
        .insertOne(delivery);
      delivery = { ...delivery, _id: result.insertedId };
    }
    await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).updateOne(
      { _id: candidate._id },
      { $inc: { "metrics.shown": 1 }, $set: { updatedAt: nowIso } },
    );
    return {
      announcement: announcementToPublic(candidate, delivery, surface),
    };
  }

  return { announcement: null, nextAvailableAt };
}

export async function dismissAnnouncementDelivery(
  userId: string,
  deliveryId: string,
  clicked: boolean,
): Promise<boolean> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(deliveryId);
  } catch {
    return false;
  }

  const now = new Date().toISOString();
  const update = clicked
    ? { dismissedAt: now, clickedAt: now, updatedAt: now }
    : { dismissedAt: now, updatedAt: now };

  const delivery = await db.collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES).findOne({
    _id: objectId,
    userId,
  });
  if (!delivery || delivery.dismissedAt) return false;

  const result = await db.collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES).updateOne(
    { _id: objectId, userId, dismissedAt: null },
    { $set: update },
  );

  if (result.modifiedCount > 0) {
    await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).updateOne(
      { _id: new ObjectId(delivery.announcementId) },
      {
        $inc: clicked ? { "metrics.dismissed": 1, "metrics.clicked": 1 } : { "metrics.dismissed": 1 },
        $set: { updatedAt: now },
      },
    );
  }

  return result.modifiedCount > 0;
}
