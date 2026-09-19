import type { LucideIcon } from "lucide-react";
import { Sparkles, Gift, Megaphone, BellRing, Wrench, ImageIcon } from "lucide-react";

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
  | "expired_trials";
export type AnnouncementStatus = "draft" | "scheduled" | "active" | "paused" | "archived";
export type AnnouncementSurface = "dashboard" | "desktop";
export type PaidPlan = "basic" | "growth";
export type DiscountBillingCycle = "monthly" | "yearly";
export type RangeKey = "today" | "7d" | "30d" | "90d";
export type FilterStatus = "all" | "active" | "scheduled" | "paused" | "ended" | "draft";

export interface Announcement {
  _id: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  status: AnnouncementStatus;
  surfaces: AnnouncementSurface[];
  audience: AnnouncementAudience;
  tags: string[];
  format?: "standard" | "image_only";
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

export interface AnnouncementForm {
  title: string;
  message: string;
  tone: AnnouncementTone;
  status: "active" | "scheduled" | "draft";
  surfaces: AnnouncementSurface[];
  audience: AnnouncementAudience;
  tags: string;
  targetEmails: string;
  ctaLabel: string;
  ctaUrl: string;
  imageUrl: string;
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
  format?: "standard" | "image_only";
}

export const AUDIENCES: Array<{ value: AnnouncementAudience; label: string; hint: string; badge: string }> = [
  { value: "all_users", label: "All users", hint: "Broadcast to every registered user", badge: "Universal" },
  { value: "free_users", label: "Free users", hint: "Free plan accounts & upgrade prompts", badge: "Monetization" },
  { value: "paid_users", label: "Paid subscribers", hint: "Active paying church accounts", badge: "Customers" },
  { value: "trial_users", label: "Trial users", hint: "Accounts currently evaluating during trial", badge: "Conversion" },
  { value: "basic_users", label: "Basic plan", hint: "Basic tier users for upsells", badge: "Tier" },
  { value: "growth_users", label: "Growth plan", hint: "Growth tier church leaders", badge: "Tier" },
  { value: "ambassador_users", label: "Ambassadors", hint: "Official ambassadors & affiliates", badge: "VIP" },
  { value: "just_subscribed", label: "New subscribers", hint: "Subscribed within the last 14 days", badge: "Welcome" },
  { value: "cancelled_users", label: "Cancelled users", hint: "Win-back offers & reactivations", badge: "Retention" },
  { value: "expired_trials", label: "Expired trials", hint: "Trial recovery discounts & nudges", badge: "Recovery" },
];

export const TONES: Array<{
  value: AnnouncementTone;
  label: string;
  description: string;
  badgeClass: string;
  borderClass: string;
  textClass: string;
  glowClass: string;
}> = [
  {
    value: "upgrade",
    label: "Upgrade / Pro",
    description: "High-converting upgrade highlight with feature badges",
    badgeClass: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    borderClass: "border-violet-500/40",
    textClass: "text-violet-400",
    glowClass: "from-violet-600/20 to-indigo-600/10",
  },
  {
    value: "offer",
    label: "Special Offer",
    description: "Promotional discount codes with coupon layout",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    borderClass: "border-amber-500/40",
    textClass: "text-amber-400",
    glowClass: "from-amber-600/20 to-orange-600/10",
  },
  {
    value: "info",
    label: "Information",
    description: "Product updates, feature releases, and guidance",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    borderClass: "border-sky-500/40",
    textClass: "text-sky-400",
    glowClass: "from-sky-600/20 to-blue-600/10",
  },
  {
    value: "success",
    label: "Celebration",
    description: "Ministry greetings, good news, and congratulations",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    borderClass: "border-emerald-500/40",
    textClass: "text-emerald-400",
    glowClass: "from-emerald-600/20 to-teal-600/10",
  },
  {
    value: "warning",
    label: "Notice / Alert",
    description: "Scheduled maintenance or important service advisories",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    borderClass: "border-rose-500/40",
    textClass: "text-rose-400",
    glowClass: "from-rose-600/20 to-amber-600/10",
  },
];

export const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

export const RANGE_API_MAP: Record<RangeKey, string> = {
  today: "daily",
  "7d": "weekly",
  "30d": "monthly",
  "90d": "monthly",
};

export const defaultForm: AnnouncementForm = {
  title: "",
  message: "",
  tone: "upgrade",
  status: "active",
  surfaces: ["dashboard", "desktop"],
  audience: "all_users",
  tags: "",
  targetEmails: "",
  ctaLabel: "View plans",
  ctaUrl: "/subscription/plans",
  imageUrl: "",
  offerCode: "",
  offerDiscountPercent: 0,
  offerDurationMonths: 1,
  offerMaxRedemptions: 0,
  offerApplicablePlans: ["basic", "growth"],
  offerApplicableBillingCycles: ["monthly", "yearly"],
  priority: 10,
  publishAt: "",
  expiresAt: "",
  deliverySpacingMinutes: 120,
  format: "standard",
};

export interface CampaignTemplate {
  name: string;
  tagline: string;
  icon: LucideIcon;
  patch: Partial<AnnouncementForm>;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    name: "Special Discount Offer",
    tagline: "Promotional offer with coupon code & pro tier discount",
    icon: Gift,
    patch: {
      title: "Special 25% Off Sanctuary Pro",
      message: "Unlock unlimited workspace members, custom themes, and AI automation credits at a special limited rate.",
      tone: "offer",
      audience: "all_users",
      surfaces: ["dashboard", "desktop"],
      tags: "promo, discount",
      ctaLabel: "Claim 25% Discount",
      ctaUrl: "/subscription/plans?promo=SAVE25",
      offerCode: "SAVE25",
      offerDiscountPercent: 25,
      offerDurationMonths: 1,
      offerApplicablePlans: ["basic", "growth"],
      offerApplicableBillingCycles: ["monthly", "yearly"],
      deliverySpacingMinutes: 120,
      priority: 35,
      format: "standard",
    },
  },
  {
    name: "Graphic Banner (Image-Only)",
    tagline: "Upload an image banner that opens your link when clicked",
    icon: ImageIcon,
    patch: {
      title: "Special Announcement Banner",
      message: "Click the banner to explore.",
      tone: "offer",
      audience: "all_users",
      surfaces: ["dashboard", "desktop"],
      tags: "promo, image-only",
      ctaLabel: "Open Link",
      ctaUrl: "/subscription/plans",
      offerCode: "",
      offerDiscountPercent: 0,
      deliverySpacingMinutes: 120,
      priority: 30,
      format: "image_only",
    },
  },
  {
    name: "Premium Upgrade Promo",
    tagline: "Drive free users to upgrade with feature showcase & discount",
    icon: Sparkles,
    patch: {
      title: "Unlock More With MakeChurchEasy Premium",
      message: "Upgrade today to unlock high-capacity AI credits, unlimited cloud media storage, premium OBS lower-thirds, and priority church support.",
      tone: "upgrade",
      audience: "free_users",
      surfaces: ["dashboard", "desktop"],
      tags: "upgrade, premium, offer",
      ctaLabel: "View Premium Plans",
      ctaUrl: "/subscription/plans",
      offerCode: "CHURCHGROWTH20",
      offerDiscountPercent: 20,
      offerDurationMonths: 3,
      offerApplicablePlans: ["basic", "growth"],
      offerApplicableBillingCycles: ["monthly", "yearly"],
      deliverySpacingMinutes: 180,
      priority: 30,
    },
  },
  {
    name: "Seasonal / Holiday Offer",
    tagline: "Limited-time church package or seasonal ministry discount",
    icon: Gift,
    patch: {
      title: "Special Ministry Season Offer",
      message: "Equip your media and presentation team this season with our most popular tools at a discounted church rate.",
      tone: "offer",
      audience: "all_users",
      surfaces: ["dashboard", "desktop"],
      tags: "holiday, promo, discount",
      ctaLabel: "Claim Discount",
      ctaUrl: "/subscription/plans",
      offerCode: "SEASON25",
      offerDiscountPercent: 25,
      offerDurationMonths: 3,
      offerApplicablePlans: ["basic", "growth"],
      offerApplicableBillingCycles: ["yearly"],
      deliverySpacingMinutes: 120,
      priority: 40,
    },
  },
  {
    name: "New Feature Announcement",
    tagline: "Notify users of new desktop or dock capabilities",
    icon: BellRing,
    patch: {
      title: "New Feature: Enhanced Worship Presentation Tools",
      message: "We've added lightning-fast song search, offline Bible caching, and multi-display output directly in your desktop dock.",
      tone: "info",
      audience: "all_users",
      surfaces: ["dashboard", "desktop"],
      tags: "features, update, changelog",
      ctaLabel: "Explore Features",
      ctaUrl: "/dashboard",
      deliverySpacingMinutes: 0,
      priority: 15,
    },
  },
  {
    name: "Happy New Month Blessing",
    tagline: "Heartfelt greeting & pastoral encouragement for church teams",
    icon: Megaphone,
    patch: {
      title: "Happy New Month from MakeChurchEasy",
      message: "We are praying this month brings fresh grace, deep spiritual impact, and renewed fruitfulness to your ministry and services.",
      tone: "success",
      audience: "all_users",
      surfaces: ["dashboard", "desktop"],
      tags: "greeting, blessing, community",
      ctaLabel: "Go to Dashboard",
      ctaUrl: "/dashboard",
      deliverySpacingMinutes: 0,
      priority: 5,
    },
  },
  {
    name: "Scheduled System Maintenance",
    tagline: "Inform church admins in advance of planned service windows",
    icon: Wrench,
    patch: {
      title: "Planned Server Maintenance Notice",
      message: "We will be performing scheduled infrastructure upgrades on Monday at 2:00 AM UTC. Service may experience brief latency for 15 minutes.",
      tone: "warning",
      audience: "all_users",
      surfaces: ["dashboard", "desktop"],
      tags: "maintenance, advisory",
      ctaLabel: "Check Status",
      ctaUrl: "/support",
      deliverySpacingMinutes: 0,
      priority: 50,
    },
  },
];

export function toDateTimeLocalInputValue(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function defaultExpiresAtValue(now = new Date()): string {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 0, 0);
  return toDateTimeLocalInputValue(endOfToday);
}

export function createDefaultForm(): AnnouncementForm {
  return { ...defaultForm, expiresAt: "" };
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
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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
