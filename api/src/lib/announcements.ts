import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import {
  getPersonalOfferSummary,
  markOfferClicked,
  markOfferSeen,
  userHasOpenPopupOffer,
  userHoldsOffer,
} from "./offerMatch";
import { COLLECTIONS, ensureIndexes } from "./db";
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementButton,
  AnnouncementButtonStyle,
  AnnouncementDelivery,
  AnnouncementLayout,
  DiscountBillingCycle,
  PlanTier,
  AnnouncementSurface,
  AnnouncementTone,
} from "@/types/schemas";
import { GROWTH_REACTIVATION_CAMPAIGN_KEY } from "@/lib/reactivationAudience";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";

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
  "reactivation_offer_users",
  "personal_offer_users",
];

export const ANNOUNCEMENT_SURFACES: AnnouncementSurface[] = ["dashboard", "desktop"];
export const ANNOUNCEMENT_TONES: AnnouncementTone[] = ["info", "success", "warning", "offer", "upgrade"];

const PAID_PLANS = new Set(["basic", "growth", "unlimited", "ambassador"]);
const RECENT_SUBSCRIBER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface AnnouncementInput {
  title?: string;
  message?: string;
  layout?: AnnouncementLayout;
  buttons?: Array<Partial<AnnouncementButton>> | null;
  bodyHtml?: string | null;
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
  layout: AnnouncementLayout | null;
  buttons: AnnouncementButton[];
  bodyHtml: string | null;
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
  /** Set for personal win-back offers: this person's own deadline and kind, so the app can show a countdown. */
  personalOffer?: { ladderId: string; rungId: string; kind: string; closesAt: string } | null;
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
  return normalizeCountry(
    user.country ||
      user.billingCountry ||
      user.profile?.country ||
      user.demographics?.country ||
      user.lastLoginCountry ||
      user.signupCountry ||
      user.subscriptionCountry,
  );
}

const USER_INSIGHT_PROJECTION = {
  name: 1,
  email: 1,
  country: 1,
  billingCountry: 1,
  lastLoginCountry: 1,
  signupCountry: 1,
  subscriptionCountry: 1,
  profile: 1,
  demographics: 1,
  plan: 1,
  effectivePlan: 1,
} as const;

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

export const ANNOUNCEMENT_LAYOUTS: AnnouncementLayout[] = ["standard", "promo", "image_only", "custom"];
const BUTTON_STYLES: AnnouncementButtonStyle[] = ["primary", "secondary", "link"];
export const MAX_ANNOUNCEMENT_BUTTONS = 4;
const MAX_BODY_HTML_LENGTH = 30_000;
const MAX_MESSAGE_LENGTH = 2_000;

/** Only web links and in-app paths. Blocks javascript:, data: and protocol-relative URLs. */
function cleanButtonUrl(value: unknown): string | null {
  const url = String(value ?? "").trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.hostname ? parsed.toString() : null;
    } catch {
      return null;
    }
  }
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) return url;
  return null;
}

function cleanButtons(value: AnnouncementInput["buttons"]): AnnouncementButton[] {
  if (!Array.isArray(value)) return [];
  const result: AnnouncementButton[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const label = String(raw.label ?? "").trim().slice(0, 40);
    const url = cleanButtonUrl(raw.url);
    if (!label || !url) continue;
    const style = BUTTON_STYLES.includes(raw.style as AnnouncementButtonStyle)
      ? raw.style as AnnouncementButtonStyle
      : result.length === 0 ? "primary" : "secondary";
    const id = String(raw.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || `b${result.length + 1}`;
    if (result.some((button) => button.id === id)) continue;
    result.push({ id, label, url, style });
    if (result.length >= MAX_ANNOUNCEMENT_BUTTONS) break;
  }
  return result;
}

/**
 * Custom HTML is shown by the apps inside a sandboxed frame without scripts.
 * This is a second layer: drop anything that can run code or load another page.
 */
export function sanitizeAnnouncementHtml(value: unknown): string | null {
  let html = String(value ?? "").trim();
  if (!html) return null;
  if (html.length > MAX_BODY_HTML_LENGTH) {
    throw new Error(`Custom HTML is too long (max ${MAX_BODY_HTML_LENGTH.toLocaleString()} characters)`);
  }
  html = html
    .replace(/<\s*(script|iframe|object|frameset)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, "")
    .replace(/<\s*\/?\s*(script|iframe|object|embed|frame|frameset|meta|base|link)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action|formaction|xlink:href)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, '$1=$2#$2');
  return html.trim() || null;
}

export function normalizeAnnouncementInput(
  body: AnnouncementInput,
  adminUserId: string,
  existing?: Announcement | null,
): Announcement {
  const now = new Date().toISOString();
  const title = String(body.title ?? existing?.title ?? "").trim();
  const message = String(body.message ?? existing?.message ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
  const layout = ANNOUNCEMENT_LAYOUTS.includes(body.layout as AnnouncementLayout)
    ? body.layout as AnnouncementLayout
    : existing?.layout;
  const bodyHtml = body.bodyHtml === undefined
    ? existing?.bodyHtml ?? null
    : sanitizeAnnouncementHtml(body.bodyHtml);
  const buttons = body.buttons === undefined
    ? existing?.buttons ?? []
    : cleanButtons(body.buttons);
  const imageUrlInput = String(body.imageUrl ?? existing?.imageUrl ?? "").trim();
  if (!title) {
    throw new Error("A title is required");
  }
  if (!message && !bodyHtml && !imageUrlInput) {
    throw new Error("Add a message, an image or custom HTML");
  }
  if (layout === "custom" && !bodyHtml) {
    throw new Error("Custom layout needs HTML content");
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

  // The first button doubles as the classic call to action so apps that
  // predate buttons still show it.
  const firstButton = buttons[0];
  const ctaLabelInput = String(body.ctaLabel ?? existing?.ctaLabel ?? "").trim();
  const ctaUrlInput = String(body.ctaUrl ?? existing?.ctaUrl ?? "").trim();

  return {
    ...(existing ?? {}),
    title,
    message,
    layout,
    buttons,
    bodyHtml,
    tone,
    status: explicitStatus ?? existing?.status ?? defaultStatus,
    surfaces,
    audience,
    tags: cleanStrings(body.tags ?? existing?.tags ?? []),
    targetUserIds: cleanStrings(body.targetUserIds ?? existing?.targetUserIds ?? []),
    targetEmails: cleanStrings(body.targetEmails ?? existing?.targetEmails ?? []).map((email) => email.toLowerCase()),
    ctaLabel: firstButton ? firstButton.label : ctaLabelInput || null,
    ctaUrl: firstButton ? firstButton.url : ctaUrlInput || null,
    imageUrl: imageUrlInput || null,
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
    layout: announcement.layout || null,
    buttons: announcement.buttons || [],
    bodyHtml: announcement.bodyHtml || null,
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
    case "reactivation_offer_users": {
      if (!userId) return false;
      const client = await clientPromise;
      const db = client.db();
      return Boolean(await db.collection("reactivation_offers").findOne({
        campaignKey: GROWTH_REACTIVATION_CAMPAIGN_KEY,
        userId,
        status: "available",
      }, { projection: { _id: 1 } }));
    }
    case "personal_offer_users": {
      const offer = announcement.personalOffer;
      if (!userId || !offer?.ladderId || !offer?.rungId) return false;
      return userHoldsOffer(userId, offer.ladderId, offer.rungId);
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
        { projection: USER_INSIGHT_PROJECTION },
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

// ── Per-announcement analytics ───────────────────────────────────────────────

export interface AnnouncementPersonRow {
  userId: string;
  userName: string;
  email: string;
  country: string;
  plan: string;
  surface: AnnouncementSurface;
  status: "clicked" | "dismissed" | "seen";
  shownAt: string | null;
  clickedAt: string | null;
  clickCount: number;
  buttonId: string | null;
  buttonLabel: string | null;
}

export interface AnnouncementDetailAnalytics {
  announcement: {
    id: string;
    title: string;
    message: string;
    status: Announcement["status"];
    layout: AnnouncementLayout | null;
    audience: AnnouncementAudience;
    surfaces: AnnouncementSurface[];
    buttons: AnnouncementButton[];
    imageUrl: string | null;
    publishAt: string;
    expiresAt: string | null;
  };
  totals: {
    reached: number;
    views: number;
    dismissed: number;
    clickers: number;
    totalClicks: number;
    clickRate: number;
    dismissRate: number;
  };
  series: Array<{ date: string; label: string; views: number; clicks: number }>;
  countries: Array<{ country: string; reached: number; clickers: number; clickRate: number }>;
  buttons: Array<{ id: string; label: string; url: string; clicks: number }>;
  surfaces: Array<{ surface: AnnouncementSurface; reached: number; clickers: number }>;
  people: AnnouncementPersonRow[];
  truncated: boolean;
}

const MAX_ANALYTICS_DELIVERIES = 20_000;
const MAX_ANALYTICS_PEOPLE = 1_000;

/** Who saw an announcement, who clicked it (name, email, country, plan) and which button they used. */
export async function getAnnouncementDetailAnalytics(
  announcementId: string,
): Promise<AnnouncementDetailAnalytics | null> {
  if (!ObjectId.isValid(announcementId)) return null;
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();

  const announcement = await db
    .collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS)
    .findOne({ _id: new ObjectId(announcementId) });
  if (!announcement) return null;

  const deliveries = await db
    .collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES)
    .find({ announcementId })
    .sort({ updatedAt: -1 })
    .limit(MAX_ANALYTICS_DELIVERIES + 1)
    .toArray();
  const truncated = deliveries.length > MAX_ANALYTICS_DELIVERIES;
  if (truncated) deliveries.length = MAX_ANALYTICS_DELIVERIES;

  const userIds = Array.from(new Set(deliveries.map((d) => idText(d.userId)).filter(Boolean)));
  const objectIds = userIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const users: Array<Record<string, any>> = [];
  // Chunked so a large audience does not build one huge $in query.
  for (let i = 0; i < objectIds.length; i += 1000) {
    users.push(
      ...(await db
        .collection("users")
        .find({ _id: { $in: objectIds.slice(i, i + 1000) } }, { projection: USER_INSIGHT_PROJECTION })
        .toArray()),
    );
  }
  const userMap = new Map(users.map((user) => [idText(user._id), user]));
  const buttonMap = new Map((announcement.buttons || []).map((button) => [button.id, button]));

  type Row = AnnouncementPersonRow & { sortAt: string };
  const rows: Row[] = [];
  const countryBuckets = new Map<string, { reached: Set<string>; clickers: Set<string> }>();
  const surfaceBuckets = new Map<AnnouncementSurface, { reached: Set<string>; clickers: Set<string> }>();
  const buttonClicks = new Map<string, number>();
  const reached = new Set<string>();
  const clickers = new Set<string>();
  let views = 0;
  let dismissed = 0;
  let totalClicks = 0;

  const days = 30;
  const series = buildSeries(days).map((item) => ({
    date: item.date,
    label: item.label,
    views: 0,
    clicks: 0,
  }));
  const seriesMap = new Map(series.map((item) => [item.date, item]));

  for (const delivery of deliveries) {
    const userId = idText(delivery.userId);
    if (!userId) continue;
    const user = userMap.get(userId);
    const country = userCountry(user);
    const clickedAt = delivery.firstClickedAt || delivery.clickedAt || null;
    const clicked = Boolean(clickedAt);
    const status: AnnouncementPersonRow["status"] = clicked
      ? "clicked"
      : delivery.dismissedAt
        ? "dismissed"
        : "seen";

    if (delivery.shownAt) views += 1;
    if (delivery.dismissedAt) dismissed += 1;
    if (clicked) totalClicks += Math.max(1, delivery.clickCount || 1);

    reached.add(userId);
    if (clicked) clickers.add(userId);

    const countryBucket = countryBuckets.get(country) || { reached: new Set<string>(), clickers: new Set<string>() };
    countryBucket.reached.add(userId);
    if (clicked) countryBucket.clickers.add(userId);
    countryBuckets.set(country, countryBucket);

    const surfaceBucket = surfaceBuckets.get(delivery.surface) || { reached: new Set<string>(), clickers: new Set<string>() };
    surfaceBucket.reached.add(userId);
    if (clicked) surfaceBucket.clickers.add(userId);
    surfaceBuckets.set(delivery.surface, surfaceBucket);

    const shownDate = parseMaybeDate(delivery.shownAt);
    if (shownDate) {
      const bucket = seriesMap.get(dateKey(shownDate));
      if (bucket) bucket.views += 1;
    }
    const clickedDate = parseMaybeDate(delivery.lastClickedAt || clickedAt);
    if (clickedDate) {
      const bucket = seriesMap.get(dateKey(clickedDate));
      if (bucket) bucket.clicks += 1;
    }

    const buttonId = delivery.clickedButtonId || null;
    if (clicked && buttonId) buttonClicks.set(buttonId, (buttonClicks.get(buttonId) || 0) + 1);

    rows.push({
      userId,
      userName: String(user?.name || "").trim() || "Unknown user",
      email: String(user?.email || ""),
      country,
      plan: String(user?.effectivePlan || user?.plan || "free"),
      surface: delivery.surface,
      status,
      shownAt: delivery.shownAt || null,
      clickedAt,
      clickCount: clicked ? Math.max(1, delivery.clickCount || 1) : 0,
      buttonId,
      buttonLabel: buttonId ? buttonMap.get(buttonId)?.label || null : null,
      sortAt: clickedAt || delivery.dismissedAt || delivery.shownAt || "",
    });
  }

  // Clicks first (newest first), then everyone else who only saw it.
  rows.sort((a, b) => {
    if ((a.status === "clicked") !== (b.status === "clicked")) return a.status === "clicked" ? -1 : 1;
    return String(b.sortAt).localeCompare(String(a.sortAt));
  });

  const countries = Array.from(countryBuckets.entries())
    .map(([country, bucket]) => ({
      country,
      reached: bucket.reached.size,
      clickers: bucket.clickers.size,
      clickRate: safeClickRate(bucket.clickers.size, bucket.reached.size),
    }))
    .sort((a, b) => b.clickers - a.clickers || b.reached - a.reached);

  const buttons = (announcement.buttons || []).map((button) => ({
    id: button.id,
    label: button.label,
    url: button.url,
    clicks: buttonClicks.get(button.id) || 0,
  }));

  return {
    announcement: {
      id: announcementId,
      title: announcement.title,
      message: announcement.message,
      status: announcement.status,
      layout: announcement.layout || null,
      audience: announcement.audience,
      surfaces: announcement.surfaces,
      buttons: announcement.buttons || [],
      imageUrl: announcement.imageUrl || null,
      publishAt: announcement.publishAt,
      expiresAt: announcement.expiresAt || null,
    },
    totals: {
      reached: reached.size,
      views,
      dismissed,
      clickers: clickers.size,
      totalClicks,
      clickRate: safeClickRate(clickers.size, reached.size),
      dismissRate: safeClickRate(dismissed, views),
    },
    series,
    countries,
    buttons,
    surfaces: Array.from(surfaceBuckets.entries()).map(([surface, bucket]) => ({
      surface,
      reached: bucket.reached.size,
      clickers: bucket.clickers.size,
    })),
    people: rows.slice(0, MAX_ANALYTICS_PEOPLE).map(({ sortAt: _sortAt, ...row }) => row),
    truncated: truncated || rows.length > MAX_ANALYTICS_PEOPLE,
  };
}

// ── Cheap change detection for clients ───────────────────────────────────────
//
// Desktop apps poll this every few minutes instead of running the full
// per-user announcement check. The value only changes when the set of
// announcements that can be delivered right now changes: publish, edit,
// pause, archive, delete, a scheduled one going live, or one expiring.
// It is the same for every user, so it is cached in memory and at the edge.

const VERSION_CACHE_MS = 60 * 1000;
const versionCache = new Map<AnnouncementSurface, { value: string; computedAt: number }>();

export function invalidateAnnouncementsVersion(): void {
  versionCache.clear();
}

export async function getAnnouncementsVersion(surface: AnnouncementSurface): Promise<string> {
  const cached = versionCache.get(surface);
  if (cached && Date.now() - cached.computedAt < VERSION_CACHE_MS) {
    return cached.value;
  }

  const client = await clientPromise;
  const db = client.db();
  const nowIso = new Date().toISOString();
  const live = await db
    .collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS)
    .find(
      {
        status: { $in: ["active", "scheduled"] },
        surfaces: surface,
        publishAt: { $lte: nowIso },
        $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: nowIso } }],
      },
      { projection: { _id: 1, updatedAt: 1 } },
    )
    .sort({ _id: 1 })
    .limit(500)
    .toArray();

  const fingerprint = live
    .map((announcement) => `${announcement._id?.toString()}:${announcement.updatedAt || ""}`)
    .join("|");
  const value = createHash("sha1").update(fingerprint).digest("hex").slice(0, 16);
  versionCache.set(surface, { value, computedAt: Date.now() });
  return value;
}

export async function createAnnouncement(body: AnnouncementInput, adminUserId: string): Promise<Announcement> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const announcement = normalizeAnnouncementInput(body, adminUserId);
  const result = await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).insertOne(announcement);
  const created = { ...announcement, _id: result.insertedId };
  invalidateAnnouncementsVersion();
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

  invalidateAnnouncementsVersion();

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

/** Most announcements one request may hand to an app that pages through them. */
export const MAX_ANNOUNCEMENTS_PER_BATCH = 3;

export interface AnnouncementsForUserResult {
  /** Up to `limit` announcements, in the order the app should page through them. */
  announcements: PublicAnnouncement[];
  /** First entry of `announcements`; older app versions show only this one. */
  announcement: PublicAnnouncement | null;
  nextAvailableAt?: string | null;
}

function compareAnnouncementOrder(a: Announcement, b: Announcement): number {
  return (
    (b.priority ?? 0) - (a.priority ?? 0) ||
    String(a.publishAt || "").localeCompare(String(b.publishAt || "")) ||
    String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  );
}

/**
 * Returns the announcements this user should see now, up to `limit` (capped at
 * MAX_ANNOUNCEMENTS_PER_BATCH). Apps that can page through several at once ask
 * for more than one; everything else keeps getting a single announcement.
 *
 * Announcements the user was already given but has not dismissed come first,
 * then new ones by priority. Each new one is recorded as shown right away so
 * that it can be dismissed by its deliveryId, so `metrics.shown` counts an
 * announcement when it is handed to the app, not when the user pages to it.
 */
export async function getAnnouncementsForUser(
  user: Record<string, any>,
  surface: AnnouncementSurface,
  limit = 1,
): Promise<AnnouncementsForUserResult> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  const userId = user._id?.toString?.() || String(user._id || "");
  const now = new Date();
  const nowIso = now.toISOString();
  const max = Math.min(MAX_ANNOUNCEMENTS_PER_BATCH, Math.max(1, Math.floor(limit) || 1));

  const picked: Array<{ announcement: Announcement; delivery: AnnouncementDelivery }> = [];
  const pickedIds = new Set<string>();

  const pendingDeliveries = await db
    .collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES)
    .find({ userId, surface, dismissedAt: null })
    .sort({ shownAt: 1 })
    .limit(20)
    .toArray();

  for (const pendingDelivery of pendingDeliveries) {
    if (picked.length >= max) break;
    if (!ObjectId.isValid(pendingDelivery.announcementId)) continue;
    if (pickedIds.has(pendingDelivery.announcementId)) continue;
    const existing = await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).findOne({
      _id: new ObjectId(pendingDelivery.announcementId),
      status: { $in: ["active", "scheduled"] },
    });
    if (existing && isAnnouncementDeliverableNow(existing, nowIso)) {
      // A personal offer that was claimed, redeemed or has run out is not shown again.
      if (existing.personalOffer?.ladderId && !(await userHasOpenPopupOffer(userId, existing.personalOffer.ladderId, existing.personalOffer.rungId))) {
        await db
          .collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES)
          .updateOne({ _id: pendingDelivery._id }, { $set: { dismissedAt: nowIso, updatedAt: nowIso } });
        continue;
      }
      picked.push({ announcement: existing, delivery: pendingDelivery });
      pickedIds.add(pendingDelivery.announcementId);
    }
  }

  let nextAvailableAt: string | null = null;

  if (picked.length < max) {
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

    for (const candidate of candidates) {
      if (picked.length >= max) break;
      const announcementId = candidate._id?.toString();
      if (!announcementId || pickedIds.has(announcementId)) continue;

      const existingDelivery = await db.collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES).findOne({
        userId,
        announcementId,
        surface,
      });
      const currentShowCount = existingDelivery?.showCount ?? (existingDelivery ? 1 : 0);
      if (currentShowCount >= Math.max(1, candidate.maxShowsPerUser || 1)) continue;
      if (!(await userMatchesAnnouncement(candidate, user))) continue;
      if (candidate.personalOffer?.ladderId && !(await userHasOpenPopupOffer(userId, candidate.personalOffer.ladderId, candidate.personalOffer.rungId))) {
        continue;
      }

      if (existingDelivery) {
        if (existingDelivery.dismissedAt) {
          const spacingMinutes = candidate.deliverySpacingMinutes ?? 0;
          // If no spacing interval is set (<= 0), an explicit dismissal means do not re-show.
          if (spacingMinutes <= 0) {
            continue;
          }
          // If a spacing interval is set, enforce the cooldown after dismissal.
          const dismissedAtMs = new Date(existingDelivery.dismissedAt).getTime();
          const spacingMs = spacingMinutes * 60 * 1000;
          const allowedAtMs = dismissedAtMs + spacingMs;
          if (allowedAtMs > now.getTime()) {
            nextAvailableAt = new Date(allowedAtMs).toISOString();
            continue;
          }
        } else if (existingDelivery.shownAt) {
          const spacingMs = Math.max(0, candidate.deliverySpacingMinutes || 0) * 60 * 1000;
          if (spacingMs > 0) {
            const allowedAtMs = new Date(existingDelivery.shownAt).getTime() + spacingMs;
            if (allowedAtMs > now.getTime()) {
              nextAvailableAt = new Date(allowedAtMs).toISOString();
              continue;
            }
          }
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
      picked.push({ announcement: candidate, delivery });
      pickedIds.add(announcementId);
    }
  }

  picked.sort((a, b) => compareAnnouncementOrder(a.announcement, b.announcement));
  const announcements = await Promise.all(
    picked.map(async ({ announcement, delivery }) => {
      const publicAnnouncement = announcementToPublic(announcement, delivery, surface);
      const personal = announcement.personalOffer;
      if (personal?.ladderId) {
        const summary = await getPersonalOfferSummary(userId, personal.ladderId, personal.rungId).catch(() => null);
        publicAnnouncement.personalOffer = summary
          ? { ladderId: personal.ladderId, rungId: personal.rungId, kind: summary.kind, closesAt: summary.closesAt }
          : null;
        // Handing the pop-up to the app counts as the offer being seen.
        await markOfferSeen(userId, personal.ladderId, personal.rungId).catch(() => undefined);
      }
      return publicAnnouncement;
    }),
  );

  return {
    announcements,
    announcement: announcements[0] ?? null,
    nextAvailableAt: announcements.length === 0 ? nextAvailableAt : null,
  };
}

export async function getNextAnnouncementForUser(
  user: Record<string, any>,
  surface: AnnouncementSurface,
): Promise<{ announcement: PublicAnnouncement | null; nextAvailableAt?: string | null }> {
  const { announcement, nextAvailableAt } = await getAnnouncementsForUser(user, surface, 1);
  return { announcement, nextAvailableAt };
}

export async function dismissAnnouncementDelivery(
  userId: string,
  deliveryId: string,
  clicked: boolean,
  buttonId?: string | null,
): Promise<boolean> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();
  let objectId: ObjectId | null = null;
  try {
    objectId = new ObjectId(deliveryId);
  } catch {
    objectId = null;
  }

  const now = new Date().toISOString();
  const cleanButtonId = buttonId ? String(buttonId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) : "";
  const update = clicked
    ? {
        dismissedAt: now,
        clickedAt: now,
        lastClickedAt: now,
        ...(cleanButtonId ? { clickedButtonId: cleanButtonId } : {}),
        updatedAt: now,
      }
    : { dismissedAt: now, updatedAt: now };

  const query: any = { userId, dismissedAt: null };
  if (objectId) {
    query.$or = [{ _id: objectId }, { announcementId: deliveryId }];
  } else {
    query.announcementId = deliveryId;
  }

  const delivery = await db.collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES).findOne(query);
  if (!delivery) return false;

  const result = await db.collection<AnnouncementDelivery>(COLLECTIONS.ANNOUNCEMENT_DELIVERIES).updateMany(
    { userId, announcementId: delivery.announcementId, dismissedAt: null },
    clicked
      ? { $set: update, $min: { firstClickedAt: now }, $inc: { clickCount: 1 } }
      : { $set: update },
  );

  if (result.modifiedCount > 0) {
    await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).updateOne(
      { _id: new ObjectId(delivery.announcementId) },
      {
        $inc: clicked ? { "metrics.dismissed": 1, "metrics.clicked": 1 } : { "metrics.dismissed": 1 },
        $set: { updatedAt: now },
      },
    );
    if (clicked && ObjectId.isValid(delivery.announcementId)) {
      const clickedAnnouncement = await db
        .collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS)
        .findOne({ _id: new ObjectId(delivery.announcementId) }, { projection: { personalOffer: 1 } });
      if (clickedAnnouncement?.personalOffer?.ladderId) {
        await markOfferClicked(userId, clickedAnnouncement.personalOffer.ladderId, clickedAnnouncement.personalOffer.rungId).catch(() => undefined);
      }
    }
  }

  return result.modifiedCount > 0;
}

/** Dismiss several deliveries at once (the app's carousel closing). True if any was recorded. */
export async function dismissAnnouncementDeliveries(
  userId: string,
  deliveryIds: string[],
  clicked: boolean,
  buttonId?: string | null,
): Promise<boolean> {
  const unique = Array.from(
    new Set(deliveryIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ).slice(0, 10);
  const results = await Promise.all(
    unique.map((deliveryId) => dismissAnnouncementDelivery(userId, deliveryId, clicked, buttonId)),
  );
  return results.some(Boolean);
}
