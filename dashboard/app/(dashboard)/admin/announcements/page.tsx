"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock4,
  Eye,
  ExternalLink,
  Gift,
  Globe2,
  Loader2,
  Megaphone,
  MoreHorizontal,
  MousePointerClick,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Send,
  Sparkles,
  Tags,
  Users,
  X,
  XCircle,
} from "lucide-react";

type AnnouncementTone = "info" | "success" | "warning" | "offer" | "upgrade";
type AnnouncementAudience =
  | "all_users" | "free_users" | "paid_users" | "trial_users"
  | "basic_users" | "growth_users" | "pro_users" | "ambassador_users"
  | "just_subscribed" | "cancelled_users" | "expired_trials";
type AnnouncementStatus = "draft" | "scheduled" | "active" | "paused" | "archived";
type AnnouncementSurface = "dashboard" | "desktop";
type RangeKey = "today" | "7d" | "30d" | "90d";
type FilterStatus = "all" | "active" | "scheduled" | "paused" | "ended";

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
  ended?: number;
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

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

const RANGE_API_MAP: Record<RangeKey, string> = {
  today: "daily",
  "7d": "weekly",
  "30d": "monthly",
  "90d": "monthly",
};

const RANGE_DAYS_MAP: Record<RangeKey, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

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
  return { ...defaultForm, expiresAt: defaultExpiresAtValue() };
}

function fromLocalInputValue(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function formatDate(value?: string | null) {
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

function formatShortDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
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
  return event.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isEnded(announcement: Announcement): boolean {
  if (announcement.status === "archived") return true;
  if (announcement.expiresAt && new Date(announcement.expiresAt) < new Date()) return true;
  return false;
}

function effectiveStatus(announcement: Announcement): FilterStatus {
  if (isEnded(announcement)) return "ended";
  if (announcement.status === "active") return "active";
  if (announcement.status === "scheduled") return "scheduled";
  if (announcement.status === "paused") return "paused";
  return "all";
}

function statusStyle(status: string): string {
  if (status === "active") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (status === "scheduled") return "border-blue-500/30 bg-blue-500/10 text-blue-400";
  if (status === "paused") return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  if (status === "ended" || status === "archived") return "border-slate-600 bg-slate-800 text-slate-400";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function statusLabel(status: string): string {
  if (status === "ended") return "Ended";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function actionStyle(action: AnnouncementUserEvent["action"]) {
  if (action === "clicked") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (action === "dismissed") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function audienceLabel(audience: AnnouncementAudience): string {
  const entry = AUDIENCES.find((a) => a.value === audience);
  return entry?.label ?? audience.replace(/_/g, " ");
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-800 ${className}`} />;
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-xs font-semibold uppercase text-slate-400">{children}</span>;
}

function OverflowMenu({
  announcement,
  onEdit,
  onDuplicate,
  onArchive,
  onViewAnalytics,
  disabled,
}: {
  announcement: Announcement;
  onEdit: (a: Announcement) => void;
  onDuplicate: (a: Announcement) => void;
  onArchive: (a: Announcement) => void;
  onViewAnalytics: (a: Announcement) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-40"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
          <button
            type="button"
            onClick={() => { onEdit(announcement); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => { onDuplicate(announcement); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => { onViewAnalytics(announcement); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            View analytics
          </button>
          <div className="my-1 border-t border-slate-800" />
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Archive this announcement? This cannot be easily undone.")) {
                onArchive(announcement);
              }
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-800"
          >
            Archive
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [stats, setStats] = useState<AnnouncementStats | null>(null);
  const [insights, setInsights] = useState<AnnouncementInsights | null>(null);
  const [activeTab, setActiveTab] = useState<"announcements" | "analytics">("announcements");
  const [range, setRange] = useState<RangeKey>("7d");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(createDefaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const audienceHint = useMemo(() => {
    return new Map(AUDIENCES.map((item) => [item.value, item.hint]));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const apiRange = RANGE_API_MAP[range];
      const res = await fetch(`/api/admin/announcements?range=${apiRange}`, { credentials: "include" });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateForm(patch: Partial<AnnouncementForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function toggleSurface(surface: AnnouncementSurface) {
    setForm((current) => {
      const exists = current.surfaces.includes(surface);
      const next = exists ? current.surfaces.filter((item) => item !== surface) : [...current.surfaces, surface];
      return { ...current, surfaces: next.length ? next : [surface] };
    });
  }

  function openCreate() {
    setEditingId(null);
    setForm(createDefaultForm());
    setShowCreate(true);
  }

  function openEdit(announcement: Announcement) {
    setEditingId(announcement._id);
    setForm({
      title: announcement.title,
      message: announcement.message,
      tone: announcement.tone,
      status: announcement.status === "scheduled" ? "scheduled" : "active",
      surfaces: announcement.surfaces,
      audience: announcement.audience,
      tags: (announcement.tags || []).join(", "),
      targetEmails: (announcement.targetEmails || []).join(", "),
      ctaLabel: announcement.ctaLabel || "",
      ctaUrl: announcement.ctaUrl || "",
      imageUrl: announcement.imageUrl || "",
      offerCode: announcement.offerCode || "",
      priority: announcement.priority,
      publishAt: announcement.publishAt ? toDateTimeLocalInputValue(new Date(announcement.publishAt)) : "",
      expiresAt: announcement.expiresAt ? toDateTimeLocalInputValue(new Date(announcement.expiresAt)) : "",
      deliverySpacingMinutes: announcement.deliverySpacingMinutes,
    });
    setShowCreate(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setToast(null);
    try {
      const url = editingId ? `/api/admin/announcements/${editingId}` : "/api/admin/announcements";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
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
      if (!res.ok) throw new Error(body.error || `Failed to ${editingId ? "update" : "create"} announcement`);
      setToast(editingId ? "Announcement updated." : "Announcement created.");
      setShowCreate(false);
      setEditingId(null);
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to save announcement");
    } finally {
      setSubmitting(false);
    }
  }

  async function doAction(id: string, patch: Partial<Announcement>) {
    setToast(null);
    setActionLoading((prev) => new Set(prev).add(id));
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
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function stopAnnouncement(id: string) {
    await doAction(id, { status: "paused" });
  }

  async function restartAnnouncement(id: string) {
    await doAction(id, { status: "active", publishAt: new Date().toISOString() });
  }

  async function startNow(id: string) {
    await doAction(id, { status: "active", publishAt: new Date().toISOString() });
  }

  async function runAgain(announcement: Announcement) {
    setToast(null);
    setActionLoading((prev) => new Set(prev).add(announcement._id));
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: announcement.title,
          message: announcement.message,
          tone: announcement.tone,
          status: "active",
          surfaces: announcement.surfaces,
          audience: announcement.audience,
          tags: announcement.tags,
          targetEmails: announcement.targetEmails,
          ctaLabel: announcement.ctaLabel,
          ctaUrl: announcement.ctaUrl,
          imageUrl: announcement.imageUrl,
          offerCode: announcement.offerCode,
          priority: announcement.priority,
          publishAt: new Date().toISOString(),
          deliverySpacingMinutes: announcement.deliverySpacingMinutes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to duplicate announcement");
      setToast("Announcement duplicated and activated.");
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to run again");
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(announcement._id);
        return next;
      });
    }
  }

  function archiveAnnouncement(id: string) {
    return doAction(id, { status: "archived" });
  }

  async function duplicateAnnouncement(announcement: Announcement) {
    setToast(null);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${announcement.title} (copy)`,
          message: announcement.message,
          tone: announcement.tone,
          status: "draft",
          surfaces: announcement.surfaces,
          audience: announcement.audience,
          tags: announcement.tags,
          targetEmails: announcement.targetEmails,
          ctaLabel: announcement.ctaLabel,
          ctaUrl: announcement.ctaUrl,
          imageUrl: announcement.imageUrl,
          offerCode: announcement.offerCode,
          priority: announcement.priority,
          deliverySpacingMinutes: announcement.deliverySpacingMinutes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to duplicate announcement");
      setToast("Announcement duplicated.");
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to duplicate");
    }
  }

  function viewAnalytics(_announcement: Announcement) {
    setActiveTab("analytics");
  }

  const filteredAnnouncements = useMemo(() => {
    let result = announcements;
    if (filterStatus !== "all") {
      result = result.filter((a) => effectiveStatus(a) === filterStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.message.toLowerCase().includes(q)
      );
    }
    return result;
  }, [announcements, filterStatus, searchQuery]);

  const summaryCards = [
    { label: "Active", value: stats?.active ?? 0, icon: CheckCircle2, tone: "bg-emerald-500/12 text-emerald-300" },
    { label: "Scheduled", value: stats?.scheduled ?? 0, icon: CalendarClock, tone: "bg-blue-500/12 text-blue-300" },
    { label: "Paused", value: stats?.paused ?? 0, icon: PauseCircle, tone: "bg-amber-500/12 text-amber-300" },
    { label: "Ended", value: stats?.ended ?? 0, icon: Archive, tone: "bg-slate-600 text-slate-300" },
  ];

  const FILTER_LABELS: Array<{ key: FilterStatus; label: string }> = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "scheduled", label: "Scheduled" },
    { key: "paused", label: "Paused" },
    { key: "ended", label: "Ended" },
  ];

  const endedCount = stats?.ended ?? 0;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase text-slate-400">
            <Megaphone className="h-3.5 w-3.5" />
            Admin announcements
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-50">Announcement Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Create and manage messages shown to MakeChurchEasy users.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Create announcement
        </button>
      </div>

      {toast ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">{toast}</div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1.5 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("announcements")}
          className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
            activeTab === "announcements"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          }`}
        >
          <Megaphone className="h-4 w-4" />
          Announcements
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
            activeTab === "analytics"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Analytics
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-28" />
            ))}
          </div>
          <SkeletonBlock className="h-96" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={() => {
                  if (card.label === "Ended") {
                    setFilterStatus("ended");
                  } else {
                    setFilterStatus(card.label.toLowerCase() as FilterStatus);
                  }
                  setActiveTab("announcements");
                }}
                className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-left transition-colors hover:border-slate-500"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.tone}`}>
                  <card.icon className="h-4.5 w-4.5" />
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-50">{card.value}</p>
                <p className="mt-0.5 text-xs font-medium uppercase text-slate-500">{card.label}</p>
              </button>
            ))}
          </div>

          {/* ANNOUNCEMENTS TAB */}
          {activeTab === "announcements" && (
            <section className="space-y-4">
              {/* Filters + Search */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {FILTER_LABELS.map((f) => {
                    const count =
                      f.key === "all"
                        ? announcements.length
                        : f.key === "ended"
                          ? endedCount
                          : stats?.[f.key as keyof AnnouncementStats] ?? 0;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilterStatus(f.key)}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                          filterStatus === f.key
                            ? "border-blue-500 bg-blue-600 text-white"
                            : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                        }`}
                      >
                        {f.label}
                        <span className="opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500 sm:w-64"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search announcements..."
                  />
                </div>
              </div>

              {filteredAnnouncements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900 px-5 py-12 text-center">
                  <Megaphone className="mx-auto mb-3 h-8 w-8 text-slate-600" />
                  <p className="text-sm font-semibold text-slate-300">
                    {searchQuery ? "No announcements match your search" : "No announcements yet"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {searchQuery ? "Try a different search term." : "Create your first announcement to get started."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAnnouncements.map((announcement) => {
                    const eff = effectiveStatus(announcement);
                    const isBusy = actionLoading.has(announcement._id);

                    return (
                      <article
                        key={announcement._id}
                        className="rounded-xl border border-slate-700 bg-slate-900 p-5"
                      >
                        {/* Row 1: Status + Audience */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              eff === "active"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                : statusStyle(eff)
                            }`}
                          >
                            {eff === "active" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                            {statusLabel(eff)}
                          </span>
                          <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-400">
                            {audienceLabel(announcement.audience)}
                          </span>
                          {announcement.offerCode ? (
                            <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-300">
                              {announcement.offerCode}
                            </span>
                          ) : null}
                        </div>

                        {/* Row 2: Title + Preview */}
                        <h3 className="mt-3 text-base font-semibold text-slate-50">{announcement.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{announcement.message}</p>

                        {/* Row 3: Schedule + Channels */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock4 className="h-3.5 w-3.5" />
                            {formatDate(announcement.publishAt)}
                            {announcement.expiresAt && (
                              <> → {formatDate(announcement.expiresAt)}</>
                            )}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Send className="h-3.5 w-3.5" />
                            {announcement.surfaces.map((s) => s === "dashboard" ? "Dashboard" : "Desktop").join(" · ")}
                          </span>
                        </div>

                        {/* Row 4: Engagement */}
                        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                          <span>
                            <strong className="text-slate-200 font-semibold">{announcement.metrics?.shown ?? 0}</strong>{" "}
                            Views
                          </span>
                          <span>
                            <strong className="text-slate-200 font-semibold">{announcement.metrics?.dismissed ?? 0}</strong>{" "}
                            Dismissals
                          </span>
                          <span>
                            <strong className="text-slate-200 font-semibold">{announcement.metrics?.clicked ?? 0}</strong>{" "}
                            Clicks
                          </span>
                        </div>

                        {/* Row 5: Actions */}
                        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
                          {eff === "active" && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => stopAnnouncement(announcement._id)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-40"
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                              Stop
                            </button>
                          )}
                          {eff === "paused" && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => restartAnnouncement(announcement._id)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-40"
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                              Restart
                            </button>
                          )}
                          {eff === "scheduled" && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => openEdit(announcement)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-40"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => startNow(announcement._id)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 text-xs font-semibold text-blue-400 hover:border-blue-500 disabled:opacity-40"
                              >
                                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                                Start now
                              </button>
                            </>
                          )}
                          {eff === "ended" && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runAgain(announcement)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-40"
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                              Run again
                            </button>
                          )}
                          <OverflowMenu
                            announcement={announcement}
                            onEdit={openEdit}
                            onDuplicate={duplicateAnnouncement}
                            onArchive={() => archiveAnnouncement(announcement._id)}
                            onViewAnalytics={viewAnalytics}
                            disabled={isBusy}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ANALYTICS TAB */}
          {activeTab === "analytics" && insights && (
            <section className="space-y-6">
              {/* Date range */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">Announcement Analytics</h2>
                  <p className="text-sm text-slate-400">Engagement and platform activity for the selected period.</p>
                </div>
                <div className="relative">
                  <select
                    value={range}
                    onChange={(e) => { setRange(e.target.value as RangeKey); void load(); }}
                    className="h-10 appearance-none rounded-lg border border-slate-700 bg-slate-900 pl-3 pr-9 text-sm text-slate-200 outline-none focus:border-blue-500"
                  >
                    {RANGES.map((r) => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>

              {/* Overview metrics */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                  <p className="text-xs font-medium uppercase text-slate-500">Total views</p>
                  <p className="mt-1 text-2xl font-bold text-slate-50">{insights.platform.announcementViews.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                  <p className="text-xs font-medium uppercase text-slate-500">Dismissals</p>
                  <p className="mt-1 text-2xl font-bold text-slate-50">{insights.platform.announcementDismissals.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                  <p className="text-xs font-medium uppercase text-slate-500">Dismissal rate</p>
                  <p className="mt-1 text-2xl font-bold text-slate-50">
                    {insights.platform.announcementViews > 0
                      ? `${Math.round((insights.platform.announcementDismissals / insights.platform.announcementViews) * 100)}%`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                  <p className="text-xs font-medium uppercase text-slate-500">CTR</p>
                  <p className="mt-1 text-2xl font-bold text-slate-50">
                    {insights.platform.clickRate > 0 ? `${insights.platform.clickRate}%` : "—"}
                  </p>
                </div>
              </div>

              {/* Announcement performance table */}
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
                <h2 className="text-base font-semibold text-slate-50">Announcement performance</h2>
                <p className="mt-1 text-sm text-slate-400">Views, dismissals, clicks, and click-through rate per announcement.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-3 pr-4 font-semibold">Announcement</th>
                        <th className="py-3 pr-4 font-semibold text-right">Views</th>
                        <th className="py-3 pr-4 font-semibold text-right">Dismissals</th>
                        <th className="py-3 pr-4 font-semibold text-right">Clicks</th>
                        <th className="py-3 pr-4 font-semibold text-right">CTR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {insights.topAnnouncements.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-slate-500">No data for this period.</td>
                        </tr>
                      ) : insights.topAnnouncements.map((item) => (
                        <tr key={item.announcementId} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 pr-4">
                            <p className="font-medium text-slate-100 truncate max-w-[300px]">{item.title}</p>
                          </td>
                          <td className="py-3 pr-4 text-right font-mono text-slate-200">{item.views}</td>
                          <td className="py-3 pr-4 text-right font-mono text-slate-200">{item.dismissals}</td>
                          <td className="py-3 pr-4 text-right font-mono text-slate-200">{item.clicks}</td>
                          <td className="py-3 pr-4 text-right font-mono text-slate-200">
                            {item.clickRate > 0 ? `${item.clickRate}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Platform activity */}
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
                <h2 className="text-base font-semibold text-slate-50">Platform activity</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Active users and platform actions over the selected period.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <p className="text-xs text-slate-500">Active users</p>
                    <p className="mt-1 text-xl font-bold text-slate-50">{insights.platform.periodActiveUsers.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <p className="text-xs text-slate-500">Platform actions</p>
                    <p className="mt-1 text-xl font-bold text-slate-50">{insights.platform.periodActions.toLocaleString()}</p>
                  </div>
                </div>

                {/* Activity timeline */}
                {insights.activitySeries.length > 0 && (
                  <div className="mt-5">
                    <h3 className="text-sm font-semibold text-slate-300">Activity timeline</h3>
                    <div className="mt-3 space-y-2">
                      {insights.activitySeries.map((item) => {
                        const maxHeight = Math.max(1, ...insights.activitySeries.map((s) => s.activeUsers));
                        return (
                          <div key={item.date} className="flex items-center gap-3">
                            <span className="w-16 shrink-0 text-xs text-slate-500">{item.label}</span>
                            <div className="flex flex-1 items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-blue-500"
                                  style={{ width: `${Math.min(100, Math.round((item.activeUsers / maxHeight) * 100))}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-500">{item.activeUsers} users</span>
                              <span className="text-xs text-slate-600">·</span>
                              <span className="text-xs text-slate-500">{item.announcementViews} views</span>
                              <span className="text-xs text-slate-600">·</span>
                              <span className="text-xs text-slate-500">{item.announcementClicks} clicks</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent platform events */}
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-slate-300">Recent platform events</h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left text-sm">
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
                            <td colSpan={5} className="py-10 text-center text-slate-500">No platform activity in this period.</td>
                          </tr>
                        ) : insights.recentPlatformEvents.map((event) => (
                          <tr key={event.id}>
                            <td className="py-3 pr-4">
                              <p className="font-medium text-slate-100">{event.email || event.userName}</p>
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

              {/* Countries */}
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
                <h2 className="text-base font-semibold text-slate-50">Top countries</h2>
                <p className="mt-1 text-sm text-slate-400">Where active users are coming from.</p>
                <div className="mt-4 space-y-2">
                  {insights.topCountries.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">No country data yet.</p>
                  ) : insights.topCountries.map((country) => (
                    <div key={country.country} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Globe2 className="h-4 w-4 text-blue-300" />
                        <span className="text-sm font-medium text-slate-100">{country.country}</span>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <span className="font-semibold text-slate-100">{country.activeUsers}</span> users
                        <span className="mx-1.5">·</span>
                        {country.actions} actions
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* Create / Edit modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh]"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setEditingId(null); } }}
        >
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/12 text-blue-300">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">
                    {editingId ? "Edit announcement" : "Create announcement"}
                  </h2>
                  <p className="text-sm text-slate-400">
                    {editingId
                      ? "Update your announcement and associated details."
                      : "Dashboard and desktop users receive it when they come online."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setEditingId(null); }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submit} className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <FieldLabel>Title</FieldLabel>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.title}
                      onChange={(e) => updateForm({ title: e.target.value })}
                      placeholder="Happy New Month"
                      required
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>Audience</FieldLabel>
                    <select
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.audience}
                      onChange={(e) => updateForm({ audience: e.target.value as AnnouncementAudience })}
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
                    className="min-h-[130px] w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm leading-6 text-slate-50 outline-none focus:border-blue-500"
                    value={form.message}
                    onChange={(e) => updateForm({ message: e.target.value })}
                    placeholder="Write the announcement users should see."
                    required
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="space-y-2">
                    <FieldLabel>Tone</FieldLabel>
                    <select
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.tone}
                      onChange={(e) => updateForm({ tone: e.target.value as AnnouncementTone })}
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
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.priority}
                      onChange={(e) => updateForm({ priority: Number(e.target.value) })}
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>Spacing minutes</FieldLabel>
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.deliverySpacingMinutes}
                      onChange={(e) => updateForm({ deliverySpacingMinutes: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <Globe2 className="h-4 w-4 text-blue-300" />
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
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.publishAt}
                      onChange={(e) => updateForm({ publishAt: e.target.value, status: e.target.value ? "scheduled" : "active" })}
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>Expires at</FieldLabel>
                    <input
                      type="datetime-local"
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.expiresAt}
                      onChange={(e) => updateForm({ expiresAt: e.target.value })}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <FieldLabel>CTA label</FieldLabel>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.ctaLabel}
                      onChange={(e) => updateForm({ ctaLabel: e.target.value })}
                      placeholder="View plans"
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>CTA URL</FieldLabel>
                    <div className="relative">
                      <input
                        className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 pr-10 text-sm text-slate-50 outline-none focus:border-blue-500"
                        value={form.ctaUrl}
                        onChange={(e) => updateForm({ ctaUrl: e.target.value })}
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
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.tags}
                      onChange={(e) => updateForm({ tags: e.target.value })}
                      placeholder="christmas, offer, upgrade"
                    />
                  </label>
                  <label className="space-y-2">
                    <FieldLabel>Offer code</FieldLabel>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.offerCode}
                      onChange={(e) => updateForm({ offerCode: e.target.value })}
                      placeholder="CHRISTMAS25"
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <FieldLabel>Specific user emails</FieldLabel>
                  <input
                    className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 outline-none focus:border-blue-500"
                    value={form.targetEmails}
                    onChange={(e) => updateForm({ targetEmails: e.target.value })}
                    placeholder="pastor@example.com, media@example.com"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {editingId ? "Update announcement" : "Save announcement"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreate(false); setEditingId(null); }}
                    className="inline-flex h-11 items-center rounded-xl border border-slate-700 px-5 text-sm font-semibold text-slate-300 hover:border-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Templates sidebar */}
              <aside className="space-y-4 xl:border-l xl:border-slate-800 xl:pl-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-300">Templates</h3>
                  <p className="mt-1 text-xs text-slate-500">Start from common campaign types.</p>
                  <div className="mt-3 space-y-2">
                    {templates.map((template) => {
                      const Icon = template.icon;
                      return (
                        <button
                          key={template.name}
                          type="button"
                          onClick={() => updateForm(template.patch)}
                          className="flex w-full items-center gap-3 rounded-xl border border-slate-700 px-4 py-3 text-left text-sm font-semibold text-slate-300 hover:border-slate-500 transition-colors"
                        >
                          <Icon className="h-4 w-4 text-blue-300" />
                          {template.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-300">Delivery rules</h3>
                  <div className="mt-3 space-y-2 text-xs text-slate-400">
                    <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5">Only one announcement is returned per user request.</div>
                    <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5">Spacing controls when the next message can appear for that user.</div>
                    <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5">Dashboard and desktop deliveries are tracked separately.</div>
                  </div>
                </div>
              </aside>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
