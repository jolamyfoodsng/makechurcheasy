"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock4,
  Eye,
  ExternalLink,
  Gift,
  Globe2,
  Loader2,
  Megaphone,
  MousePointerClick,
  PauseCircle,
  PlayCircle,
  Send,
  Sparkles,
  Tags,
  Users,
  XCircle,
} from "lucide-react";

type AnnouncementTone = "info" | "success" | "warning" | "offer" | "upgrade";
type AnnouncementAudience =
  | "all_users"
  | "free_users"
  | "paid_users"
  | "trial_users"
  | "basic_users"
  | "growth_users"
  | "pro_users"
  | "ambassador_users"
  | "just_subscribed"
  | "cancelled_users"
  | "expired_trials";
type AnnouncementStatus = "draft" | "scheduled" | "active" | "paused" | "archived";
type AnnouncementSurface = "dashboard" | "desktop";
type TabKey = "announcements" | "engagement" | "platform" | "create";
type RangeKey = "daily" | "weekly" | "monthly";

type Announcement = {
  _id: string;
  title: string;
  message: string;
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
  priority: number;
  publishAt: string;
  expiresAt?: string | null;
  deliverySpacingMinutes: number;
  metrics: { shown: number; dismissed: number; clicked: number };
  createdAt: string;
};

type AnnouncementStats = {
  active: number;
  scheduled: number;
  paused: number;
  delivered: number;
};

type AnnouncementUserEvent = {
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
};

type PlatformUserEvent = {
  id: string;
  event: string;
  userId: string;
  userName: string;
  email: string;
  country: string;
  plan: string;
  occurredAt: string;
};

type AnnouncementInsights = {
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
};

type AnnouncementForm = {
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
  priority: number;
  publishAt: string;
  expiresAt: string;
  deliverySpacingMinutes: number;
};

const AUDIENCES: Array<{ value: AnnouncementAudience; label: string; hint: string }> = [
  { value: "all_users", label: "All users", hint: "Every active account" },
  { value: "free_users", label: "Free users", hint: "Upgrade and offer prompts" },
  { value: "paid_users", label: "Paid users", hint: "Customer-only messages" },
  { value: "trial_users", label: "Trial users", hint: "Trial conversion nudges" },
  { value: "basic_users", label: "Basic users", hint: "Basic plan segment" },
  { value: "growth_users", label: "Growth users", hint: "Growth plan segment" },
  { value: "pro_users", label: "Pro users", hint: "Pro plan segment" },
  { value: "ambassador_users", label: "Ambassadors", hint: "Ambassador accounts" },
  { value: "just_subscribed", label: "Just subscribed", hint: "Subscribed in the last 14 days" },
  { value: "cancelled_users", label: "Cancelled users", hint: "Win-back offers" },
  { value: "expired_trials", label: "Expired trials", hint: "Trial recovery messages" },
];

const TONES: Array<{ value: AnnouncementTone; label: string }> = [
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "offer", label: "Offer" },
  { value: "upgrade", label: "Upgrade" },
];

const TABS: Array<{ key: TabKey; label: string; icon: typeof Megaphone }> = [
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "engagement", label: "Engagement", icon: MousePointerClick },
  { key: "platform", label: "Platform activity", icon: BarChart3 },
  { key: "create", label: "Create", icon: Send },
];

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

const defaultForm: AnnouncementForm = {
  title: "",
  message: "",
  tone: "info",
  status: "active",
  surfaces: ["dashboard", "desktop"],
  audience: "all_users",
  tags: "",
  targetEmails: "",
  ctaLabel: "",
  ctaUrl: "",
  imageUrl: "",
  offerCode: "",
  priority: 0,
  publishAt: "",
  expiresAt: "",
  deliverySpacingMinutes: 60,
};

const templates: Array<{ name: string; patch: Partial<AnnouncementForm>; icon: typeof Gift }> = [
  {
    name: "Upgrade offer",
    icon: Sparkles,
    patch: {
      title: "Unlock More With MakeChurchEasy Premium",
      message: "Upgrade today to get more AI credits, expanded media workflows, and premium presentation tools.",
      tone: "upgrade",
      audience: "free_users",
      tags: "upgrade, premium, offer",
      ctaLabel: "View plans",
      ctaUrl: "/subscription/plans",
      deliverySpacingMinutes: 120,
      priority: 20,
    },
  },
  {
    name: "Black Friday",
    icon: Gift,
    patch: {
      title: "Black Friday Offer Is Live",
      message: "Get a limited-time MakeChurchEasy bundle for your church production team.",
      tone: "offer",
      audience: "all_users",
      tags: "black-friday, seasonal, combo-offer",
      ctaLabel: "See offer",
      ctaUrl: "/subscription/plans",
      offerCode: "BLACKFRIDAY",
      priority: 40,
    },
  },
  {
    name: "Happy new month",
    icon: Megaphone,
    patch: {
      title: "Happy New Month",
      message: "We are praying this month brings fresh grace, clarity, and fruitfulness to your ministry work.",
      tone: "success",
      audience: "all_users",
      tags: "new-month, greeting",
      deliverySpacingMinutes: 60,
      priority: 5,
    },
  },
];

function toDateTimeLocalInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function defaultExpiresAtValue(now = new Date()) {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 0, 0);
  return toDateTimeLocalInputValue(endOfToday);
}

function createDefaultForm(): AnnouncementForm {
  return {
    ...defaultForm,
    expiresAt: defaultExpiresAtValue(),
  };
}

function fromLocalInputValue(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function formatDate(value?: string | null) {
  if (!value) return "No expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(value?: string | null) {
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

function formatEventName(event: string) {
  return event
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusStyle(status: AnnouncementStatus) {
  if (status === "active") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "scheduled") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (status === "paused") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "archived") return "border-slate-700 bg-slate-800 text-slate-400";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function actionStyle(action: AnnouncementUserEvent["action"]) {
  if (action === "clicked") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (action === "dismissed") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-800 ${className}`} />;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  caption,
}: {
  label: string;
  value: number | string;
  icon: typeof Megaphone;
  tone: string;
  caption?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-gray-900 p-5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-50">{value}</p>
      {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-gray-900 px-5 py-12 text-center">
      <Megaphone className="mx-auto mb-3 h-8 w-8 text-slate-600" />
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function ActivityTimeline({ items }: { items: AnnouncementInsights["activitySeries"] }) {
  const maxActive = Math.max(1, ...items.map((item) => item.activeUsers));

  return (
    <div className="rounded-xl border border-slate-700 bg-gray-900 p-5">
      <h2 className="text-base font-semibold text-slate-50">Activity timeline</h2>
      <p className="mt-1 text-sm text-slate-400">Daily active users, platform actions, announcement views, and clicks.</p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.date} className="grid grid-cols-1 gap-2 text-sm md:grid-cols-[76px_minmax(0,1fr)_220px] md:items-center md:gap-3">
            <span className="text-xs text-slate-500">{item.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${Math.min(100, Math.round((item.activeUsers / maxActive) * 100))}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-left text-xs text-slate-500 sm:grid-cols-4 md:text-right">
              <span><strong className="text-slate-100">{item.activeUsers}</strong> users</span>
              <span><strong className="text-slate-100">{item.actions}</strong> actions</span>
              <span><strong className="text-slate-100">{item.announcementViews}</strong> views</span>
              <span><strong className="text-slate-100">{item.announcementClicks}</strong> clicks</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-xs font-semibold uppercase text-slate-400">{children}</span>;
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [stats, setStats] = useState<AnnouncementStats | null>(null);
  const [insights, setInsights] = useState<AnnouncementInsights | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(() => createDefaultForm());
  const [activeTab, setActiveTab] = useState<TabKey>("announcements");
  const [range, setRange] = useState<RangeKey>("weekly");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const audienceHint = useMemo(() => {
    return new Map(AUDIENCES.map((item) => [item.value, item.hint]));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/announcements?range=${range}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load announcements");
      setAnnouncements(body.announcements || []);
      setStats(body.stats || null);
      setInsights(body.insights || null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [range]);

  function updateForm(patch: Partial<AnnouncementForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function toggleSurface(surface: AnnouncementSurface) {
    setForm((current) => {
      const exists = current.surfaces.includes(surface);
      const next = exists
        ? current.surfaces.filter((item) => item !== surface)
        : [...current.surfaces, surface];
      return { ...current, surfaces: next.length ? next : [surface] };
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setToast(null);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          publishAt: fromLocalInputValue(form.publishAt) || new Date().toISOString(),
          expiresAt: fromLocalInputValue(form.expiresAt),
          tags: form.tags,
          targetEmails: form.targetEmails,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to create announcement");
      setToast("Announcement saved.");
      setForm(createDefaultForm());
      setActiveTab("announcements");
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to create announcement");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchAnnouncement(id: string, patch: Partial<Announcement>) {
    setToast(null);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to update announcement");
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to update announcement");
    }
  }

  const summaryCards = [
    { label: "Active", value: stats?.active ?? 0, icon: CheckCircle2, tone: "bg-emerald-500/12 text-emerald-300" },
    { label: "Scheduled", value: stats?.scheduled ?? 0, icon: CalendarClock, tone: "bg-blue-500/12 text-blue-300" },
    { label: "Paused", value: stats?.paused ?? 0, icon: PauseCircle, tone: "bg-amber-500/12 text-amber-300" },
    { label: "Delivered", value: stats?.delivered ?? 0, icon: Send, tone: "bg-violet-500/12 text-violet-300" },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold uppercase text-slate-400">
            <Megaphone className="h-3.5 w-3.5" />
            Admin announcements
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-50">Announcement Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Control announcements, see who viewed or clicked them, and monitor daily, weekly, and monthly platform activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
              className={`h-10 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                range === item.key
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-slate-700 bg-gray-900 text-slate-300 hover:border-slate-500"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {toast ? (
        <div className="rounded-xl border border-slate-700 bg-gray-900 px-4 py-3 text-sm text-slate-200">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-gray-900 p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:bg-gray-800 hover:text-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-32" />
            ))}
          </div>
          <SkeletonBlock className="h-96" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </div>

          {activeTab === "announcements" && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">Announcements</h2>
                  <p className="text-sm text-slate-400">Stop, restart, archive, and inspect every announcement from one list.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("create")}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  <Send className="h-4 w-4" />
                  Create announcement
                </button>
              </div>

              {announcements.length === 0 ? (
                <EmptyPanel title="No announcements yet" description="Create the first message from the Create tab." />
              ) : (
                <div className="space-y-3">
                  {announcements.map((announcement) => (
                    <article key={announcement._id} className="rounded-xl border border-slate-700 bg-gray-900 p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyle(announcement.status)}`}>
                              {announcement.status}
                            </span>
                            <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-400">
                              {announcement.audience.replace(/_/g, " ")}
                            </span>
                            {announcement.offerCode ? (
                              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-300">
                                {announcement.offerCode}
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-3 text-base font-semibold text-slate-50">{announcement.title}</h3>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{announcement.message}</p>
                          <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock4 className="h-3.5 w-3.5" />
                              {formatDate(announcement.publishAt)}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarClock className="h-3.5 w-3.5" />
                              Expires {formatDate(announcement.expiresAt)}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Send className="h-3.5 w-3.5" />
                              {announcement.surfaces.join(", ")}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Tags className="h-3.5 w-3.5" />
                              {announcement.tags?.length ? announcement.tags.join(", ") : "No tags"}
                            </span>
                          </div>
                        </div>

                        <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                            <p className="text-lg font-semibold text-slate-50">{announcement.metrics?.shown ?? 0}</p>
                            <p className="text-[11px] text-slate-500">Shown</p>
                          </div>
                          <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                            <p className="text-lg font-semibold text-slate-50">{announcement.metrics?.dismissed ?? 0}</p>
                            <p className="text-[11px] text-slate-500">Dismissed</p>
                          </div>
                          <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                            <p className="text-lg font-semibold text-slate-50">{announcement.metrics?.clicked ?? 0}</p>
                            <p className="text-[11px] text-slate-500">Clicked</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                        <p className="font-mono text-xs text-slate-500">ID: {announcement._id}</p>
                        <div className="flex flex-wrap gap-2">
                          {announcement.status === "active" || announcement.status === "scheduled" ? (
                            <button
                              type="button"
                              onClick={() => void patchAnnouncement(announcement._id, { status: "paused" })}
                              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500"
                            >
                              <PauseCircle className="h-3.5 w-3.5" />
                              Stop
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void patchAnnouncement(announcement._id, {
                              status: "active",
                              publishAt: new Date().toISOString(),
                            })}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500"
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            Restart
                          </button>
                          <button
                            type="button"
                            onClick={() => void patchAnnouncement(announcement._id, { status: "archived" })}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archive
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "engagement" && insights && (
            <section className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Views" value={insights.platform.announcementViews} icon={Eye} tone="bg-blue-500/12 text-blue-300" caption={`${range} window`} />
                <StatCard label="Clicks" value={insights.platform.announcementClicks} icon={MousePointerClick} tone="bg-violet-500/12 text-violet-300" caption={`${insights.platform.clickRate}% click rate`} />
                <StatCard label="Dismissals" value={insights.platform.announcementDismissals} icon={XCircle} tone="bg-amber-500/12 text-amber-300" caption="Closed by users" />
                <StatCard label="Active users" value={insights.platform.periodActiveUsers} icon={Users} tone="bg-emerald-500/12 text-emerald-300" caption={`Across ${insights.days} day${insights.days === 1 ? "" : "s"}`} />
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-xl border border-slate-700 bg-gray-900 p-5">
                  <h2 className="text-base font-semibold text-slate-50">Top announcements</h2>
                  <p className="mt-1 text-sm text-slate-400">Ranked by views in the selected range.</p>
                  <div className="mt-4 space-y-3">
                    {insights.topAnnouncements.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">No announcement engagement yet.</p>
                    ) : insights.topAnnouncements.map((item) => (
                      <div key={item.announcementId} className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-50">{item.title}</p>
                            <p className="mt-1 font-mono text-[11px] text-slate-500">{item.announcementId}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusStyle(item.status)}`}>{item.status}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                          <div><p className="font-semibold text-slate-100">{item.views}</p><p className="text-slate-500">Views</p></div>
                          <div><p className="font-semibold text-slate-100">{item.clicks}</p><p className="text-slate-500">Clicks</p></div>
                          <div><p className="font-semibold text-slate-100">{item.dismissals}</p><p className="text-slate-500">Closed</p></div>
                          <div><p className="font-semibold text-slate-100">{item.clickRate}%</p><p className="text-slate-500">CTR</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-gray-900 p-5">
                  <h2 className="text-base font-semibold text-slate-50">Viewed and clicked users</h2>
                  <p className="mt-1 text-sm text-slate-400">User id, email, country, surface, and action for every recent delivery.</p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="py-3 pr-4 font-semibold">User</th>
                          <th className="py-3 pr-4 font-semibold">Announcement</th>
                          <th className="py-3 pr-4 font-semibold">Action</th>
                          <th className="py-3 pr-4 font-semibold">Country</th>
                          <th className="py-3 pr-4 font-semibold">Surface</th>
                          <th className="py-3 pr-4 font-semibold">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {insights.recentAnnouncementEvents.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-500">No user delivery events yet.</td>
                          </tr>
                        ) : insights.recentAnnouncementEvents.map((event) => (
                          <tr key={event.id}>
                            <td className="py-3 pr-4">
                              <p className="font-medium text-slate-100">{event.email || event.userName}</p>
                              <p className="font-mono text-[11px] text-slate-500">{event.userId}</p>
                            </td>
                            <td className="max-w-[260px] py-3 pr-4">
                              <p className="truncate text-slate-300">{event.announcementTitle}</p>
                              <p className="font-mono text-[11px] text-slate-500">{event.announcementId}</p>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${actionStyle(event.action)}`}>{event.action}</span>
                            </td>
                            <td className="py-3 pr-4 text-slate-300">{event.country}</td>
                            <td className="py-3 pr-4 text-slate-300">{event.surface}</td>
                            <td className="py-3 pr-4 text-slate-400">{formatDateTime(event.occurredAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "platform" && insights && (
            <section className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Daily users" value={insights.platform.dailyActiveUsers} icon={Users} tone="bg-blue-500/12 text-blue-300" caption="Logged in or sent events today" />
                <StatCard label="Weekly users" value={insights.platform.weeklyActiveUsers} icon={Users} tone="bg-violet-500/12 text-violet-300" caption="Last 7 days" />
                <StatCard label="Monthly users" value={insights.platform.monthlyActiveUsers} icon={Users} tone="bg-emerald-500/12 text-emerald-300" caption="Last 30 days" />
                <StatCard label="Actions" value={insights.platform.periodActions} icon={BarChart3} tone="bg-amber-500/12 text-amber-300" caption={`${range} platform events`} />
              </div>

              <ActivityTimeline items={insights.activitySeries} />

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-xl border border-slate-700 bg-gray-900 p-5">
                  <h2 className="text-base font-semibold text-slate-50">Countries</h2>
                  <p className="mt-1 text-sm text-slate-400">Where active users are coming from.</p>
                  <div className="mt-4 space-y-3">
                    {insights.topCountries.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">No country activity yet.</p>
                    ) : insights.topCountries.map((country) => (
                      <div key={country.country} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Globe2 className="h-4 w-4 text-blue-300" />
                          <span className="text-sm font-medium text-slate-100">{country.country}</span>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p><span className="font-semibold text-slate-100">{country.activeUsers}</span> users</p>
                          <p>{country.actions} actions</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-gray-900 p-5">
                  <h2 className="text-base font-semibold text-slate-50">Recent platform actions</h2>
                  <p className="mt-1 text-sm text-slate-400">Shows what users did, with id, email, plan, and country.</p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left text-sm">
                      <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="py-3 pr-4 font-semibold">User</th>
                          <th className="py-3 pr-4 font-semibold">Action</th>
                          <th className="py-3 pr-4 font-semibold">Country</th>
                          <th className="py-3 pr-4 font-semibold">Plan</th>
                          <th className="py-3 pr-4 font-semibold">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {insights.recentPlatformEvents.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-slate-500">No platform actions in this range.</td>
                          </tr>
                        ) : insights.recentPlatformEvents.map((event) => (
                          <tr key={event.id}>
                            <td className="py-3 pr-4">
                              <p className="font-medium text-slate-100">{event.email || event.userName}</p>
                              <p className="font-mono text-[11px] text-slate-500">{event.userId}</p>
                            </td>
                            <td className="py-3 pr-4 text-slate-300">{formatEventName(event.event)}</td>
                            <td className="py-3 pr-4 text-slate-300">{event.country}</td>
                            <td className="py-3 pr-4 text-slate-300">{event.plan}</td>
                            <td className="py-3 pr-4 text-slate-400">{formatDateTime(event.occurredAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "create" && (
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-700 bg-gray-900 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/12 text-blue-300">
                    <Send className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">Create announcement</h2>
                    <p className="text-sm text-slate-400">Dashboard and desktop users receive it when they come online.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <FieldLabel>Title</FieldLabel>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.title}
                      onChange={(event) => updateForm({ title: event.target.value })}
                      placeholder="Happy New Month"
                      required
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>Audience</FieldLabel>
                    <select
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.audience}
                      onChange={(event) => updateForm({ audience: event.target.value as AnnouncementAudience })}
                    >
                      {AUDIENCES.map((audience) => (
                        <option key={audience.value} value={audience.value}>{audience.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">{audienceHint.get(form.audience)}</p>
                  </label>
                </div>

                <label className="block space-y-2">
                  <FieldLabel>Message</FieldLabel>
                  <textarea
                    className="min-h-[150px] w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm leading-6 text-slate-50 outline-none focus:border-blue-500"
                    value={form.message}
                    onChange={(event) => updateForm({ message: event.target.value })}
                    placeholder="Write the announcement users should see."
                    required
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="space-y-2">
                    <FieldLabel>Tone</FieldLabel>
                    <select
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.tone}
                      onChange={(event) => updateForm({ tone: event.target.value as AnnouncementTone })}
                    >
                      {TONES.map((tone) => <option key={tone.value} value={tone.value}>{tone.label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>Priority</FieldLabel>
                    <input
                      type="number"
                      min={-100}
                      max={100}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.priority}
                      onChange={(event) => updateForm({ priority: Number(event.target.value) })}
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>Spacing minutes</FieldLabel>
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.deliverySpacingMinutes}
                      onChange={(event) => updateForm({ deliverySpacingMinutes: Number(event.target.value) })}
                    />
                  </label>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <Users className="h-4 w-4 text-blue-300" />
                    Surfaces
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {(["dashboard", "desktop"] as const).map((surface) => (
                      <button
                        key={surface}
                        type="button"
                        onClick={() => toggleSurface(surface)}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                          form.surfaces.includes(surface)
                            ? "border-blue-500 bg-blue-500/12 text-blue-300"
                            : "border-slate-700 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        {surface === "dashboard" ? "Dashboard" : "Desktop"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <FieldLabel>Publish at</FieldLabel>
                    <input
                      type="datetime-local"
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.publishAt}
                      onChange={(event) => updateForm({ publishAt: event.target.value, status: event.target.value ? "scheduled" : "active" })}
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>Expires at</FieldLabel>
                    <input
                      type="datetime-local"
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.expiresAt}
                      onChange={(event) => updateForm({ expiresAt: event.target.value })}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <FieldLabel>CTA label</FieldLabel>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.ctaLabel}
                      onChange={(event) => updateForm({ ctaLabel: event.target.value })}
                      placeholder="View plans"
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>CTA URL</FieldLabel>
                    <div className="relative">
                      <input
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 pr-10 text-sm text-slate-50 outline-none focus:border-blue-500"
                        value={form.ctaUrl}
                        onChange={(event) => updateForm({ ctaUrl: event.target.value })}
                        placeholder="/subscription/plans or https://..."
                      />
                      <ExternalLink className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500" />
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <FieldLabel>Tags</FieldLabel>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.tags}
                      onChange={(event) => updateForm({ tags: event.target.value })}
                      placeholder="christmas, offer, upgrade"
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>Offer code</FieldLabel>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.offerCode}
                      onChange={(event) => updateForm({ offerCode: event.target.value })}
                      placeholder="CHRISTMAS25"
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <FieldLabel>Specific user emails</FieldLabel>
                  <input
                    className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                    value={form.targetEmails}
                    onChange={(event) => updateForm({ targetEmails: event.target.value })}
                    placeholder="pastor@example.com, media@example.com"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Save announcement
                  </button>
                </div>
              </form>

              <aside className="space-y-4">
                <div className="rounded-xl border border-slate-700 bg-gray-900 p-5">
                  <h2 className="text-base font-semibold text-slate-50">Templates</h2>
                  <p className="mt-1 text-sm text-slate-400">Start from common campaign types.</p>
                  <div className="mt-4 space-y-2">
                    {templates.map((template) => {
                      const Icon = template.icon;
                      return (
                        <button
                          key={template.name}
                          type="button"
                          onClick={() => updateForm(template.patch)}
                          className="flex w-full items-center gap-3 rounded-xl border border-slate-700 px-4 py-3 text-left text-sm font-semibold text-slate-300 hover:border-slate-500"
                        >
                          <Icon className="h-4 w-4 text-blue-300" />
                          {template.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-gray-900 p-5">
                  <h2 className="text-base font-semibold text-slate-50">Delivery rules</h2>
                  <div className="mt-4 space-y-3 text-sm text-slate-400">
                    <div className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">Only one announcement is returned per user request.</div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">Spacing controls when the next message can appear for that user.</div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">Dashboard and desktop deliveries are tracked separately.</div>
                  </div>
                </div>
              </aside>
            </section>
          )}
        </>
      )}
    </div>
  );
}
