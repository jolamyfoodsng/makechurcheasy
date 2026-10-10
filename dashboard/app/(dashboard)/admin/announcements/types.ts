import type { LucideIcon } from "lucide-react";
import { BellRing, Code2, Gift, ImageIcon, Megaphone, Type, Wrench } from "lucide-react";

export type AnnouncementTone = "info" | "success" | "warning" | "offer" | "upgrade";
export type AnnouncementAudience =
  | "all_users"
  | "free_users"
  | "paid_users"
  | "trial_users"
  | "basic_users"
  | "growth_users"
  | "ambassador_users"
  | "just_subscribed"
  | "cancelled_users"
  | "expired_trials"
  | "inactive_7d"
  | "inactive_30d"
  | "never_opened_app"
  | "reactivation_offer_users"
  | "personal_offer_users";
export type AnnouncementStatus = "draft" | "scheduled" | "active" | "paused" | "archived";
export type AnnouncementSurface = "dashboard" | "desktop";
export type AnnouncementLayout = "standard" | "promo" | "image_only" | "custom";
export type ButtonStyle = "primary" | "secondary" | "link";
export type PaidPlan = "basic" | "growth";
export type DiscountBillingCycle = "monthly" | "yearly";
export type RangeKey = "today" | "7d" | "30d" | "90d";
export type FilterStatus = "all" | "active" | "scheduled" | "paused" | "ended" | "draft";

export const MAX_BUTTONS = 4;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HTML_LENGTH = 30000;

export interface AnnouncementButton {
  id: string;
  label: string;
  url: string;
  style: ButtonStyle;
}

export interface Announcement {
  _id: string;
  title: string;
  message: string;
  layout?: AnnouncementLayout;
  buttons?: AnnouncementButton[];
  bodyHtml?: string | null;
  tone: AnnouncementTone;
  status: AnnouncementStatus;
  surfaces: AnnouncementSurface[];
  audience: AnnouncementAudience;
  tags: string[];
  targetUserIds?: string[];
  targetEmails?: string[];
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  offerCode?: string | null;
  offerDiscountPercent?: number | null;
  offerDurationMonths?: number | null;
  offerMaxRedemptions?: number | null;
  offerRedemptionCount?: number;
  offerApplicablePlans?: PaidPlan[];
  offerApplicableBillingCycles?: DiscountBillingCycle[];
  priority: number;
  publishAt: string;
  expiresAt?: string | null;
  deliverySpacingMinutes: number;
  maxShowsPerUser?: number;
  metrics: { shown: number; dismissed: number; clicked: number };
  createdAt: string;
}

export interface AnnouncementStats {
  active: number;
  scheduled: number;
  paused: number;
  delivered: number;
  ended?: number;
}

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

export interface AnnouncementInsights {
  range: RangeKey;
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
    status: AnnouncementStatus;
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

/** One person who was shown an announcement, and what they did with it. */
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
    status: AnnouncementStatus;
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

export interface AnnouncementForm {
  title: string;
  message: string;
  layout: AnnouncementLayout;
  tone: AnnouncementTone;
  status: "active" | "scheduled" | "draft";
  surfaces: AnnouncementSurface[];
  audience: AnnouncementAudience;
  tags: string;
  targetEmails: string;
  buttons: AnnouncementButton[];
  imageUrl: string;
  bodyHtml: string;
  offerCode: string;
  offerDiscountPercent: number;
  offerDurationMonths: number;
  offerMaxRedemptions: number;
  offerApplicablePlans: PaidPlan[];
  offerApplicableBillingCycles: DiscountBillingCycle[];
  priority: number;
  publishAt: string;
  expiresAt: string;
  deliverySpacingMinutes: number;
  maxShowsPerUser: number;
}

export const AUDIENCES: Array<{ value: AnnouncementAudience; label: string; hint: string }> = [
  { value: "all_users", label: "Everyone", hint: "Every registered user" },
  { value: "free_users", label: "Free plan", hint: "Users on the free plan" },
  { value: "paid_users", label: "Paying subscribers", hint: "Active paid accounts" },
  { value: "trial_users", label: "On a trial", hint: "Accounts currently in their trial" },
  { value: "basic_users", label: "Basic plan", hint: "Users on Basic" },
  { value: "growth_users", label: "Growth plan", hint: "Users on Growth" },
  { value: "ambassador_users", label: "Ambassadors", hint: "Ambassadors and affiliates" },
  { value: "just_subscribed", label: "New subscribers", hint: "Subscribed in the last 14 days" },
  { value: "cancelled_users", label: "Cancelled", hint: "Users who cancelled their subscription" },
  { value: "expired_trials", label: "Expired trials", hint: "Trial ended without upgrading" },
  { value: "inactive_7d", label: "Inactive for 7 days", hint: "No activity in the last week" },
  { value: "inactive_30d", label: "Inactive for 30 days", hint: "No activity in the last month" },
  { value: "never_opened_app", label: "Never opened the app", hint: "Signed up but never opened the desktop app" },
  {
    value: "reactivation_offer_users",
    label: "Returning users with a Growth gift",
    hint: "Selected for the reactivation campaign and not yet claimed",
  },
  {
    value: "personal_offer_users",
    label: "Win-back offer holders",
    hint: "Only people issued this offer by the Offers ladders. Managed in Admin > Offers",
  },
];

/** Tones for the plain layout. Offer/upgrade belong to the promo layout only. */
export const STANDARD_TONES: Array<{ value: AnnouncementTone; label: string }> = [
  { value: "info", label: "Info" },
  { value: "success", label: "Good news" },
  { value: "warning", label: "Notice" },
];

export const PROMO_TONES: Array<{ value: AnnouncementTone; label: string }> = [
  { value: "offer", label: "Offer" },
  { value: "upgrade", label: "Upgrade" },
];

export const LAYOUTS: Array<{
  value: AnnouncementLayout;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "standard", label: "Text", description: "Title, message, optional image and buttons", icon: Type },
  { value: "image_only", label: "Image", description: "A banner people click to open a link", icon: ImageIcon },
  { value: "custom", label: "Custom HTML", description: "Write your own layout with HTML and CSS", icon: Code2 },
  { value: "promo", label: "Discount offer", description: "Promo code and billing cycle picker", icon: Gift },
];

export const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

export const RANGE_API_MAP: Record<RangeKey, string> = {
  today: "daily",
  "7d": "weekly",
  "30d": "monthly",
  "90d": "monthly",
};

export const STARTER_HTML = `<div style="font-family: system-ui, sans-serif; padding: 28px; text-align: center; color: #1f2937;">
  <h2 style="margin: 0 0 8px; font-size: 22px;">Your headline</h2>
  <p style="margin: 0 0 18px; font-size: 14px; line-height: 1.5; color: #4b5563;">
    A short line that explains what is new.
  </p>
  <a href="https://makechurcheasy.com" style="display: inline-block; padding: 10px 18px; border-radius: 8px; background: #0238E9; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600;">
    Learn more
  </a>
</div>`;

export function newButtonId(): string {
  return `b${Math.random().toString(36).slice(2, 8)}`;
}

export function newButton(patch: Partial<AnnouncementButton> = {}): AnnouncementButton {
  return { id: newButtonId(), label: "", url: "", style: "primary", ...patch };
}

export const defaultForm: AnnouncementForm = {
  title: "",
  message: "",
  layout: "standard",
  tone: "info",
  status: "active",
  surfaces: ["dashboard", "desktop"],
  audience: "all_users",
  tags: "",
  targetEmails: "",
  buttons: [],
  imageUrl: "",
  bodyHtml: "",
  offerCode: "",
  offerDiscountPercent: 0,
  offerDurationMonths: 1,
  offerMaxRedemptions: 0,
  offerApplicablePlans: ["basic", "growth"],
  offerApplicableBillingCycles: ["monthly", "yearly"],
  priority: 10,
  publishAt: "",
  expiresAt: "",
  deliverySpacingMinutes: 0,
  maxShowsPerUser: 1,
};

export interface CampaignTemplate {
  name: string;
  tagline: string;
  icon: LucideIcon;
  patch: Partial<AnnouncementForm>;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    name: "Plain announcement",
    tagline: "A title and a message. Add buttons if you need them.",
    icon: Megaphone,
    patch: { layout: "standard", tone: "info", title: "", message: "", buttons: [], tags: "" },
  },
  {
    name: "Feature update",
    tagline: "Tell people about something new in the app.",
    icon: BellRing,
    patch: {
      layout: "standard",
      tone: "info",
      title: "New in MakeChurchEasy",
      message: "Write what changed and why it helps your team on Sunday.",
      buttons: [newButton({ label: "See what's new", url: "/features" })],
      tags: "update",
      priority: 15,
    },
  },
  {
    name: "Maintenance notice",
    tagline: "Warn people ahead of planned downtime.",
    icon: Wrench,
    patch: {
      layout: "standard",
      tone: "warning",
      title: "Planned maintenance",
      message: "We will be doing maintenance on Monday at 2:00 AM UTC. You may notice brief delays for about 15 minutes.",
      buttons: [],
      tags: "maintenance",
      priority: 50,
    },
  },
  {
    name: "Image banner",
    tagline: "Upload a picture that opens a link when clicked.",
    icon: ImageIcon,
    patch: {
      layout: "image_only",
      tone: "info",
      title: "Announcement banner",
      message: "",
      buttons: [newButton({ label: "Open", url: "" })],
      tags: "",
      priority: 30,
    },
  },
  {
    name: "Custom HTML",
    tagline: "Start from a small HTML layout you can edit.",
    icon: Code2,
    patch: {
      layout: "custom",
      tone: "info",
      title: "Announcement",
      message: "Open the app to see this announcement.",
      bodyHtml: STARTER_HTML,
      buttons: [],
      tags: "",
    },
  },
  {
    name: "Discount offer",
    tagline: "Promo code with a billing cycle picker.",
    icon: Gift,
    patch: {
      layout: "promo",
      tone: "offer",
      title: "Special offer",
      message: "A limited-time discount for your church team.",
      buttons: [newButton({ label: "Claim offer", url: "/subscription/plans" })],
      tags: "promo",
      offerCode: "",
      offerDiscountPercent: 25,
      offerDurationMonths: 1,
      priority: 35,
    },
  },
];

// ── Conversion between the API shape and the editor form ────────────────────

/** Announcements saved before `layout` existed: work out what the apps showed. */
export function detectLegacyLayout(announcement: Announcement): AnnouncementLayout {
  if (announcement.layout) return announcement.layout;
  const tags = (announcement.tags || []).map((tag) => tag.toLowerCase());
  if (announcement.imageUrl && tags.some((tag) => tag.includes("image-only"))) return "image_only";
  if (
    announcement.offerCode ||
    announcement.offerDiscountPercent ||
    ["offer", "upgrade"].includes(announcement.tone) ||
    tags.some((tag) => tag.includes("discount") || tag.includes("offer"))
  ) {
    return "promo";
  }
  return "standard";
}

export function announcementButtons(announcement: Announcement): AnnouncementButton[] {
  if (announcement.buttons?.length) return announcement.buttons;
  if (announcement.ctaUrl) {
    return [
      {
        id: "b1",
        label: announcement.ctaLabel || "Open",
        url: announcement.ctaUrl,
        style: "primary",
      },
    ];
  }
  return [];
}

export function announcementToForm(announcement: Announcement): AnnouncementForm {
  return {
    title: announcement.title,
    message: announcement.message,
    layout: detectLegacyLayout(announcement),
    tone: announcement.tone,
    status: announcement.status === "scheduled" ? "scheduled" : "active",
    surfaces: announcement.surfaces,
    audience: announcement.audience,
    tags: (announcement.tags || []).filter((tag) => tag.toLowerCase() !== "image-only").join(", "),
    targetEmails: (announcement.targetEmails || []).join(", "),
    buttons: announcementButtons(announcement),
    imageUrl: announcement.imageUrl || "",
    bodyHtml: announcement.bodyHtml || "",
    offerCode: announcement.offerCode || "",
    offerDiscountPercent: announcement.offerDiscountPercent || 0,
    offerDurationMonths: announcement.offerDurationMonths || 1,
    offerMaxRedemptions: announcement.offerMaxRedemptions || 0,
    offerApplicablePlans: announcement.offerApplicablePlans?.length
      ? announcement.offerApplicablePlans
      : ["basic", "growth"],
    offerApplicableBillingCycles: announcement.offerApplicableBillingCycles?.length
      ? announcement.offerApplicableBillingCycles
      : ["monthly", "yearly"],
    priority: announcement.priority,
    publishAt: announcement.publishAt ? toDateTimeLocalInputValue(new Date(announcement.publishAt)) : "",
    expiresAt: announcement.expiresAt ? toDateTimeLocalInputValue(new Date(announcement.expiresAt)) : "",
    deliverySpacingMinutes: announcement.deliverySpacingMinutes,
    maxShowsPerUser: announcement.maxShowsPerUser ?? 1,
  };
}

/** Build the request body. Older apps still look for the `image-only` tag and ctaLabel/ctaUrl. */
export function formToPayload(form: AnnouncementForm, status: "draft" | "active" | "scheduled") {
  const tags = form.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag && tag.toLowerCase() !== "image-only");
  if (form.layout === "image_only") tags.push("image-only");

  const buttons = form.buttons
    .map((button) => ({
      ...button,
      // The image itself is the button, so it needs no label from the admin.
      label: button.label.trim() || (form.layout === "image_only" ? "Open" : ""),
      url: button.url.trim(),
    }))
    .filter((button) => button.label && button.url)
    .slice(0, form.layout === "image_only" ? 1 : form.layout === "custom" ? 0 : MAX_BUTTONS);
  const isPromo = form.layout === "promo";

  return {
    title: form.title.trim(),
    message: form.message.trim(),
    layout: form.layout,
    tone: form.tone,
    status,
    surfaces: form.surfaces,
    audience: form.audience,
    tags,
    targetEmails: form.targetEmails,
    buttons,
    // Always sent, even when empty, so removing every button clears the old call to action.
    ctaLabel: buttons[0]?.label ?? "",
    ctaUrl: buttons[0]?.url ?? "",
    imageUrl: form.layout === "custom" && !form.imageUrl ? "" : form.imageUrl,
    bodyHtml: form.layout === "custom" ? form.bodyHtml : "",
    offerCode: isPromo ? form.offerCode : "",
    offerDiscountPercent: isPromo ? form.offerDiscountPercent : 0,
    offerDurationMonths: isPromo ? form.offerDurationMonths : null,
    offerMaxRedemptions: isPromo ? form.offerMaxRedemptions : 0,
    offerApplicablePlans: isPromo ? form.offerApplicablePlans : [],
    offerApplicableBillingCycles: isPromo ? form.offerApplicableBillingCycles : [],
    priority: form.priority,
    publishAt: fromLocalInputValue(form.publishAt) || new Date().toISOString(),
    expiresAt: fromLocalInputValue(form.expiresAt),
    deliverySpacingMinutes: form.deliverySpacingMinutes,
    maxShowsPerUser: form.maxShowsPerUser,
  };
}

// ── Formatting helpers ──────────────────────────────────────────────────────

export function toDateTimeLocalInputValue(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function createDefaultForm(): AnnouncementForm {
  return { ...defaultForm, buttons: [], surfaces: [...defaultForm.surfaces] };
}

export function fromLocalInputValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTime(value?: string | null): string {
  return formatDate(value) ?? "-";
}

export function formatEventName(event: string): string {
  return event.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isEnded(announcement: Announcement): boolean {
  if (announcement.status === "archived") return true;
  if (announcement.expiresAt && new Date(announcement.expiresAt) < new Date()) return true;
  return false;
}

export function effectiveStatus(announcement: Announcement): FilterStatus {
  if (announcement.status === "draft") return "draft";
  if (isEnded(announcement)) return "ended";
  if (announcement.status === "active") return "active";
  if (announcement.status === "scheduled") return "scheduled";
  if (announcement.status === "paused") return "paused";
  return "all";
}

export function audienceLabel(audience: AnnouncementAudience): string {
  const entry = AUDIENCES.find((a) => a.value === audience);
  return entry?.label ?? audience.replace(/_/g, " ");
}

export function layoutLabel(layout: AnnouncementLayout): string {
  return LAYOUTS.find((l) => l.value === layout)?.label ?? layout;
}

export function clickRate(clicks: number, views: number): string {
  if (!views) return "0%";
  const rate = (clicks / views) * 100;
  return `${rate >= 10 ? Math.round(rate) : rate.toFixed(1)}%`;
}
