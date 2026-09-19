"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Eye,
  Globe,
  Grid,
  History,
  List,
  Loader2,
  Megaphone,
  Monitor,
  MousePointerClick,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementForm,
  AnnouncementInsights,
  AnnouncementStats,
  AnnouncementSurface,
  FilterStatus,
  RangeKey,
} from "./types";
import {
  AUDIENCES,
  RANGE_API_MAP,
  createDefaultForm,
  effectiveStatus,
  fromLocalInputValue,
  toDateTimeLocalInputValue,
} from "./types";
import { AnnouncementCard } from "./components/AnnouncementCard";
import { AnnouncementStudioModal } from "./components/AnnouncementStudioModal";
import { AnnouncementPreviewModal } from "./components/AnnouncementPreviewModal";
import { AnnouncementAnalytics } from "./components/AnnouncementAnalytics";

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [stats, setStats] = useState<AnnouncementStats | null>(null);
  const [insights, setInsights] = useState<AnnouncementInsights | null>(null);
  const [activeTab, setActiveTab] = useState<"announcements" | "analytics" | "drafts">("announcements");
  const [range, setRange] = useState<RangeKey>("7d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Studio & Preview Modals
  const [showStudio, setShowStudio] = useState(false);
  const [previewItem, setPreviewItem] = useState<Announcement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(createDefaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  // Filters & Search
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterAudience, setFilterAudience] = useState<"all" | AnnouncementAudience>("all");
  const [filterChannel, setFilterChannel] = useState<"all" | AnnouncementSurface>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut listener for ⌘K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function load(isManualRefresh = false) {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const apiRange = RANGE_API_MAP[range];
      const res = await fetch(`/api/admin/announcements?range=${apiRange}`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load announcements");

      setAnnouncements(body.announcements || []);
      setStats(body.stats || null);
      setInsights(body.insights || null);
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load announcements",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  function updateForm(patch: Partial<AnnouncementForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function uploadAnnouncementImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setToast({ type: "error", message: "Please choose an image file (PNG, JPG, WebP)." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setToast({ type: "error", message: "Image is too large. Maximum size is 5MB." });
      return;
    }

    setImageUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "announcements");
      const res = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to upload image");
      }
      updateForm({ imageUrl: data.url });
      setToast({ type: "success", message: "Image uploaded." });
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to upload image",
      });
    } finally {
      setImageUploading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(createDefaultForm());
    setShowStudio(true);
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
      publishAt: announcement.publishAt
        ? toDateTimeLocalInputValue(new Date(announcement.publishAt))
        : "",
      expiresAt: announcement.expiresAt
        ? toDateTimeLocalInputValue(new Date(announcement.expiresAt))
        : "",
      deliverySpacingMinutes: announcement.deliverySpacingMinutes,
      format: announcement.tags?.some((t) => t.toLowerCase().includes("image-only"))
        ? "image_only"
        : "standard",
    });
    setShowStudio(true);
  }

  async function submitWithStatus(
    status: "draft" | "active" | "scheduled",
    overrides?: Partial<AnnouncementForm>
  ) {
    const merged = { ...form, ...(overrides || {}) };
    const payload: Record<string, unknown> = {
      ...merged,
      status,
      publishAt: fromLocalInputValue(merged.publishAt) || new Date().toISOString(),
      expiresAt: fromLocalInputValue(merged.expiresAt),
      tags: merged.tags,
      targetEmails: merged.targetEmails,
    };

    if (status === "active") {
      payload.publishAt = new Date().toISOString();
    }

    setSubmitting(true);
    try {
      const url = editingId ? `/api/admin/announcements/${editingId}` : "/api/admin/announcements";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save announcement");

      const successMsg =
        status === "active"
          ? "Announcement published."
          : status === "scheduled"
            ? "Announcement scheduled."
            : "Draft saved.";

      setToast({ type: "success", message: successMsg });
      setShowStudio(false);
      setEditingId(null);
      await load();
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save announcement",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function doAction(id: string, patch: Partial<Announcement>, successMsg?: string) {
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

      if (successMsg) setToast({ type: "success", message: successMsg });
      await load();
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update announcement",
      });
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function stopAnnouncement(id: string) {
    await doAction(id, { status: "paused" }, "Announcement paused.");
  }

  async function restartAnnouncement(id: string) {
    await doAction(
      id,
      { status: "active", publishAt: new Date().toISOString() },
      "Announcement resumed."
    );
  }

  async function startNow(id: string) {
    await doAction(
      id,
      { status: "active", publishAt: new Date().toISOString() },
      "Announcement launched."
    );
  }

  async function runAgain(announcement: Announcement) {
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
          offerDiscountPercent: announcement.offerDiscountPercent,
          offerDurationMonths: announcement.offerDurationMonths,
          offerMaxRedemptions: announcement.offerMaxRedemptions,
          offerApplicablePlans: announcement.offerApplicablePlans,
          offerApplicableBillingCycles: announcement.offerApplicableBillingCycles,
          priority: announcement.priority,
          publishAt: new Date().toISOString(),
          deliverySpacingMinutes: announcement.deliverySpacingMinutes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to duplicate announcement");

      setToast({ type: "success", message: "Announcement republished." });
      await load();
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to re-run announcement",
      });
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(announcement._id);
        return next;
      });
    }
  }

  async function duplicateAnnouncement(announcement: Announcement) {
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
          offerDiscountPercent: announcement.offerDiscountPercent,
          offerDurationMonths: announcement.offerDurationMonths,
          offerMaxRedemptions: announcement.offerMaxRedemptions,
          offerApplicablePlans: announcement.offerApplicablePlans,
          offerApplicableBillingCycles: announcement.offerApplicableBillingCycles,
          priority: announcement.priority,
          deliverySpacingMinutes: announcement.deliverySpacingMinutes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to duplicate announcement");

      setToast({ type: "success", message: "Duplicated as draft." });
      await load();
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to duplicate",
      });
    }
  }

  async function archiveAnnouncement(id: string) {
    await doAction(id, { status: "archived" }, "Announcement archived.");
  }

  // Filtered announcements
  const filteredAnnouncements = useMemo(() => {
    let result = announcements;

    if (activeTab === "drafts") {
      return result.filter((a) => a.status === "draft");
    }

    if (filterStatus !== "all") {
      result = result.filter((a) => effectiveStatus(a) === filterStatus);
    }

    if (filterAudience !== "all") {
      result = result.filter((a) => a.audience === filterAudience);
    }

    if (filterChannel !== "all") {
      result = result.filter((a) => a.surfaces.includes(filterChannel));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.message.toLowerCase().includes(q) ||
          (a.offerCode && a.offerCode.toLowerCase().includes(q))
      );
    }

    return result;
  }, [announcements, activeTab, filterStatus, filterAudience, filterChannel, searchQuery]);

  const activeCount = stats?.active ?? 0;
  const scheduledCount = stats?.scheduled ?? 0;
  const pausedCount = stats?.paused ?? 0;
  const endedCount = stats?.ended ?? 0;
  const totalViews = insights?.platform.announcementViews ?? 0;
  const overallCtr = insights?.platform.clickRate ?? 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#090D16] min-h-screen text-slate-200">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[80] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl shadow-lg border text-xs font-medium backdrop-blur-md animate-in fade-in duration-150 ${
            toast.type === "success"
              ? "bg-[#0E1424] border-emerald-500/40 text-emerald-200"
              : toast.type === "error"
                ? "bg-[#0E1424] border-rose-500/40 text-rose-200"
                : "bg-[#0E1424] border-slate-700 text-slate-200"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-0.5 hover:bg-white/10 rounded text-slate-400"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Top Header & Action Controls */}
      <header className="border-b border-slate-800/80 bg-[#0E1424]/70 backdrop-blur-md sticky top-0 z-30 px-6 sm:px-8 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white tracking-tight">Announcements</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Production Mode
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Broadcast product announcements, maintenance alerts, feature releases, and modal banners across web & desktop clients.
            </p>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* Refresh Sync Button */}
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing || loading}
              className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white transition shadow-sm hover:border-slate-700"
              title="Sync & Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
            </button>

            {/* History / Audit Trail Button */}
            <button
              type="button"
              onClick={() => setActiveTab("analytics")}
              className="px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5 text-slate-400" />
              Audit Trail
            </button>

            {/* Primary New Announcement Action */}
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold tracking-wide flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              New announcement
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <div className="max-w-7xl w-full mx-auto px-6 sm:px-8 py-7 space-y-7 flex-1">
        {/* BEGIN: Metric Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-purpose="metrics-row">
          {/* Metric 1: Active */}
          <div
            onClick={() => {
              setFilterStatus("active");
              setActiveTab("announcements");
            }}
            className="cursor-pointer p-4 rounded-xl bg-gradient-to-b from-[#131B2F] to-[#0E1526] border border-slate-800/90 shadow-sm relative overflow-hidden group hover:border-slate-700/80 transition"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Currently Live</span>
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-white font-mono">{activeCount}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Delivering
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
              Reaching all desktop & web users
            </p>
          </div>

          {/* Metric 2: Scheduled */}
          <div
            onClick={() => {
              setFilterStatus("scheduled");
              setActiveTab("announcements");
            }}
            className="cursor-pointer p-4 rounded-xl bg-gradient-to-b from-[#131B2F] to-[#0E1526] border border-slate-800/90 shadow-sm relative overflow-hidden group hover:border-slate-700/80 transition"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Scheduled Queue</span>
              <div className="w-2.5 h-2.5 rounded-full bg-sky-400/90" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-white font-mono">{scheduledCount}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                Upcoming
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Automated delivery schedule
            </p>
          </div>

          {/* Metric 3: Total Impressions */}
          <div className="p-4 rounded-xl bg-gradient-to-b from-[#131B2F] to-[#0E1526] border border-slate-800/90 shadow-sm relative overflow-hidden group hover:border-slate-700/80 transition">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Impressions</span>
              <Eye className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-white font-mono">{totalViews.toLocaleString()}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold font-mono flex items-center">
                ↑ active
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Across {announcements.length} broadcast campaigns
            </p>
          </div>

          {/* Metric 4: Average CTR */}
          <div
            onClick={() => setActiveTab("analytics")}
            className="cursor-pointer p-4 rounded-xl bg-gradient-to-b from-[#131B2F] to-[#0E1526] border border-slate-800/90 shadow-sm relative overflow-hidden group hover:border-slate-700/80 transition"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Avg Click-Through (CTR)</span>
              <TrendingUp className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-emerald-400 font-mono">{overallCtr}%</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium">Benchmark 4.2%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Engagement with action buttons
            </p>
          </div>
        </section>
        {/* END: Metric Summary Cards */}

        {/* BEGIN: Navigation Tabs & Filtering Bar */}
        <section className="space-y-4" data-purpose="filtering-section">
          {/* Segmented Tab Navigation */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800/80">
              <button
                type="button"
                onClick={() => setActiveTab("announcements")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  activeTab === "announcements"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                Announcements
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("analytics")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                  activeTab === "analytics"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                Analytics & Conversion
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                  New
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("drafts");
                  setFilterStatus("draft");
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  activeTab === "drafts"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                Drafts & Templates
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>
                Showing <strong className="text-slate-200 font-semibold">{filteredAnnouncements.length}</strong> records
              </span>
            </div>
          </div>

          {/* Filter Controls Toolbar */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#0E1526]/80 p-3 rounded-xl border border-slate-800">
            {/* Status Pill Chips Filter */}
            <div className="flex items-center flex-wrap gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className={`px-3 py-1.5 rounded-lg font-semibold border transition shadow-sm flex items-center gap-1.5 ${
                  filterStatus === "all"
                    ? "bg-slate-800 text-white border-slate-700"
                    : "bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 border-slate-800"
                }`}
              >
                <span>All</span>
                <span className="text-[10px] px-1.5 rounded bg-slate-900 text-slate-400 font-mono">
                  {announcements.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterStatus("active")}
                className={`px-3 py-1.5 rounded-lg font-medium border transition flex items-center gap-1.5 group ${
                  filterStatus === "active"
                    ? "bg-slate-800 text-white border-slate-700"
                    : "bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 border-slate-800"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Active</span>
                <span className="text-[10px] px-1.5 rounded bg-slate-800/70 text-slate-400 font-mono group-hover:text-slate-300">
                  {activeCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterStatus("scheduled")}
                className={`px-3 py-1.5 rounded-lg font-medium border transition flex items-center gap-1.5 group ${
                  filterStatus === "scheduled"
                    ? "bg-slate-800 text-white border-slate-700"
                    : "bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 border-slate-800"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                <span>Scheduled</span>
                <span className="text-[10px] px-1.5 rounded bg-slate-800/70 text-slate-400 font-mono group-hover:text-slate-300">
                  {scheduledCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterStatus("paused")}
                className={`px-3 py-1.5 rounded-lg font-medium border transition flex items-center gap-1.5 group ${
                  filterStatus === "paused"
                    ? "bg-slate-800 text-white border-slate-700"
                    : "bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 border-slate-800"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Paused</span>
                <span className="text-[10px] px-1.5 rounded bg-slate-800/70 text-slate-400 font-mono group-hover:text-slate-300">
                  {pausedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterStatus("ended")}
                className={`px-3 py-1.5 rounded-lg font-medium border transition flex items-center gap-1.5 group ${
                  filterStatus === "ended"
                    ? "bg-slate-800 text-white border-slate-700"
                    : "bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 border-slate-800"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Ended / Past</span>
                <span className="text-[10px] px-1.5 rounded bg-slate-800/70 text-slate-400 font-mono group-hover:text-slate-300">
                  {endedCount}
                </span>
              </button>
            </div>

            {/* Secondary Filters & Search Input */}
            <div className="flex items-center gap-2.5 flex-wrap lg:flex-nowrap">
              {/* Audience Filter Dropdown */}
              <div className="relative">
                <select
                  value={filterAudience}
                  onChange={(e) => setFilterAudience(e.target.value as "all" | AnnouncementAudience)}
                  className="appearance-none bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">All Audiences</option>
                  {AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Placement / Channel Dropdown */}
              <div className="relative hidden sm:block">
                <select
                  value={filterChannel}
                  onChange={(e) => setFilterChannel(e.target.value as "all" | AnnouncementSurface)}
                  className="appearance-none bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">All Placements</option>
                  <option value="desktop">Desktop Dock (OBS)</option>
                  <option value="dashboard">Web Dashboard</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Search Bar with Shortcut Badge */}
              <div className="relative min-w-[200px] flex-1">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search announcements..."
                  className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-lg pl-8 pr-12 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                  <kbd className="text-[10px] font-mono text-slate-500 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
                    ⌘K
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* END: Navigation Tabs & Filtering Bar */}

        {/* BEGIN: Announcement Content Area */}
        {activeTab === "analytics" ? (
          <AnnouncementAnalytics
            insights={insights}
            range={range}
            onRangeChange={(newRange) => setRange(newRange)}
          />
        ) : (
          <section className="space-y-3 pb-12" data-purpose="announcements-list">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-28 rounded-xl border border-slate-800/80 bg-slate-900/40 animate-pulse" />
                ))}
              </div>
            ) : filteredAnnouncements.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-[#0E1526]/50 p-12 text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                  <Megaphone className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-200">No announcements found</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchQuery || filterStatus !== "all" || filterAudience !== "all" || filterChannel !== "all"
                    ? "Try adjusting your search query or filter options."
                    : "No announcements created yet. Start broadcasting to your users."}
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create announcement
                </button>
              </div>
            ) : (
              filteredAnnouncements.map((announcement) => (
                <AnnouncementCard
                  key={announcement._id}
                  announcement={announcement}
                  onEdit={openEdit}
                  onDuplicate={duplicateAnnouncement}
                  onArchive={(a) => archiveAnnouncement(a._id)}
                  onStop={stopAnnouncement}
                  onRestart={restartAnnouncement}
                  onStartNow={startNow}
                  onRunAgain={runAgain}
                  onViewAnalytics={() => setActiveTab("analytics")}
                  onPreview={(a) => setPreviewItem(a)}
                  isBusy={actionLoading.has(announcement._id)}
                />
              ))
            )}
          </section>
        )}
        {/* END: Announcement Content Area */}

        {/* BEGIN: Pagination Footer */}
        {activeTab !== "analytics" && (
          <footer
            className="pt-2 pb-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400"
            data-purpose="pagination-footer"
          >
            <div className="flex items-center gap-2">
              <span>Displaying 1–{filteredAnnouncements.length} of {announcements.length} announcements</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">Rows per page:</span>
              <select className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option>10</option>
                <option>25</option>
                <option>50</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed text-xs font-medium flex items-center gap-1"
                disabled
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <span className="px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium text-xs">1</span>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed text-xs font-medium flex items-center gap-1"
                disabled
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </footer>
        )}
        {/* END: Pagination Footer */}
      </div>

      {/* Preview Modal */}
      <AnnouncementPreviewModal
        announcement={previewItem}
        onClose={() => setPreviewItem(null)}
      />

      {/* Studio Modal */}
      <AnnouncementStudioModal
        isOpen={showStudio}
        editingId={editingId}
        form={form}
        submitting={submitting}
        imageUploading={imageUploading}
        onClose={() => {
          setShowStudio(false);
          setEditingId(null);
        }}
        onUpdateForm={updateForm}
        onSubmitWithStatus={submitWithStatus}
        onUploadImage={uploadAnnouncementImage}
      />
    </div>
  );
}
