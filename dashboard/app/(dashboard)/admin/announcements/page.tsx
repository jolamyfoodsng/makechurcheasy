"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Megaphone, Plus, RefreshCw, Search, X } from "lucide-react";
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementForm,
  AnnouncementInsights,
  FilterStatus,
  RangeKey,
} from "./types";
import {
  AUDIENCES,
  RANGE_API_MAP,
  announcementToForm,
  clickRate,
  createDefaultForm,
  effectiveStatus,
  formToPayload,
} from "./types";
import { AnnouncementCard } from "./components/AnnouncementCard";
import { AnnouncementStudioModal } from "./components/AnnouncementStudioModal";
import { AnnouncementPreviewModal } from "./components/AnnouncementPreviewModal";
import { AnnouncementAnalytics } from "./components/AnnouncementAnalytics";

type Toast = { type: "success" | "error"; message: string };

const STATUS_TABS: Array<{ key: FilterStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Live" },
  { key: "scheduled", label: "Scheduled" },
  { key: "paused", label: "Paused" },
  { key: "draft", label: "Drafts" },
  { key: "ended", label: "Ended" },
];

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [insights, setInsights] = useState<AnnouncementInsights | null>(null);
  const [view, setView] = useState<"list" | "overview">("list");
  const [range, setRange] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [showEditor, setShowEditor] = useState(false);
  const [previewItem, setPreviewItem] = useState<Announcement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(createDefaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterAudience, setFilterAudience] = useState<"all" | AnnouncementAudience>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function load(manual = false) {
    if (manual) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/admin/announcements?range=${RANGE_API_MAP[range]}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load announcements");
      setAnnouncements(body.announcements || []);
      setInsights(body.insights || null);
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Failed to load announcements" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // The detail page links here with ?edit=<id> to open the editor.
  const editHandled = useRef(false);
  useEffect(() => {
    if (editHandled.current || loading) return;
    const id = new URLSearchParams(window.location.search).get("edit");
    if (!id) {
      editHandled.current = true;
      return;
    }
    const target = announcements.find((announcement) => announcement._id === id);
    if (!target) return;
    editHandled.current = true;
    setEditingId(target._id);
    setForm(announcementToForm(target));
    setShowEditor(true);
    window.history.replaceState(null, "", "/admin/announcements");
  }, [loading, announcements]);

  function updateForm(patch: Partial<AnnouncementForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function uploadImage(file: File) {
    const supported =
      ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) ||
      /\.(png|jpe?g|webp|gif)$/i.test(file.name);
    if (!supported) {
      setToast({ type: "error", message: "Choose a PNG, JPG, WebP or GIF image." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setToast({ type: "error", message: "That image is over 5 MB." });
      return;
    }
    setImageUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "announcements");
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
      updateForm({ imageUrl: data.url });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Upload failed" });
    } finally {
      setImageUploading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(createDefaultForm());
    setShowEditor(true);
  }

  function openEdit(announcement: Announcement) {
    setEditingId(announcement._id);
    setForm(announcementToForm(announcement));
    setShowEditor(true);
  }

  async function save(status: "draft" | "active" | "scheduled") {
    const payload: Record<string, unknown> = formToPayload(form, status);
    if (status === "active") payload.publishAt = new Date().toISOString();

    setSubmitting(true);
    try {
      const url = editingId ? `/api/admin/announcements/${editingId}` : "/api/admin/announcements";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save announcement");
      setToast({
        type: "success",
        message: status === "active" ? "Announcement published." : status === "scheduled" ? "Announcement scheduled." : "Draft saved.",
      });
      setShowEditor(false);
      setEditingId(null);
      await load();
    } catch (error) {
      // Re-thrown to the editor, which shows it next to the Publish button.
      setToast({ type: "error", message: error instanceof Error ? error.message : "Failed to save announcement" });
    } finally {
      setSubmitting(false);
    }
  }

  async function withBusy(id: string, task: () => Promise<void>) {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await task();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function patchAnnouncement(id: string, patch: Record<string, unknown>, success: string) {
    await withBusy(id, async () => {
      try {
        const res = await fetch(`/api/admin/announcements/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Failed to update announcement");
        setToast({ type: "success", message: success });
        await load();
      } catch (error) {
        setToast({ type: "error", message: error instanceof Error ? error.message : "Failed to update announcement" });
      }
    });
  }

  async function createCopy(announcement: Announcement, status: "draft" | "active") {
    const form = announcementToForm(announcement);
    const payload = formToPayload(
      { ...form, title: status === "draft" ? `${announcement.title} (copy)` : announcement.title },
      status,
    );
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        publishAt: new Date().toISOString(),
        expiresAt: status === "active" ? null : payload.expiresAt,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to copy announcement");
  }

  async function duplicate(announcement: Announcement) {
    await withBusy(announcement._id, async () => {
      try {
        await createCopy(announcement, "draft");
        setToast({ type: "success", message: "Copied as a draft." });
        await load();
      } catch (error) {
        setToast({ type: "error", message: error instanceof Error ? error.message : "Failed to copy" });
      }
    });
  }

  async function runAgain(announcement: Announcement) {
    await withBusy(announcement._id, async () => {
      try {
        await createCopy(announcement, "active");
        setToast({ type: "success", message: "Announcement is live again." });
        await load();
      } catch (error) {
        setToast({ type: "error", message: error instanceof Error ? error.message : "Failed to run again" });
      }
    });
  }

  const counts = useMemo(() => {
    const result: Record<FilterStatus, number> = { all: announcements.length, active: 0, scheduled: 0, paused: 0, draft: 0, ended: 0 };
    for (const announcement of announcements) {
      const status = effectiveStatus(announcement);
      if (status in result) result[status] += 1;
    }
    return result;
  }, [announcements]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return announcements.filter((announcement) => {
      if (filterStatus !== "all" && effectiveStatus(announcement) !== filterStatus) return false;
      if (filterAudience !== "all" && announcement.audience !== filterAudience) return false;
      if (!query) return true;
      return (
        announcement.title.toLowerCase().includes(query) ||
        announcement.message.toLowerCase().includes(query) ||
        Boolean(announcement.offerCode && announcement.offerCode.toLowerCase().includes(query))
      );
    });
  }, [announcements, filterStatus, filterAudience, searchQuery]);

  const totalViews = announcements.reduce((sum, a) => sum + (a.metrics?.shown ?? 0), 0);
  const totalClicks = announcements.reduce((sum, a) => sum + (a.metrics?.clicked ?? 0), 0);
  const filtersActive = filterStatus !== "all" || filterAudience !== "all" || searchQuery.trim() !== "";

  return (
    <div className="adm-page">
      {toast && (
        <div
          role="status"
          className="fixed right-5 top-5 z-[80] flex items-center gap-2 rounded-lg border border-[var(--mce-admin-border-strong)] bg-[var(--mce-admin-surface-raised)] px-3.5 py-2.5 text-[13px] shadow-xl"
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--mce-admin-success)]" />
          ) : (
            <X className="h-4 w-4 text-[var(--mce-admin-danger)]" />
          )}
          <span className="text-[var(--mce-admin-text)]">{toast.message}</span>
          <button type="button" className="adm-icon-btn !h-6 !w-6" onClick={() => setToast(null)} aria-label="Dismiss message">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <header className="adm-header">
        <div>
          <h1 className="adm-title">Announcements</h1>
          <p className="adm-subtitle">Messages shown to users inside the desktop app and the web dashboard.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="adm-icon-btn"
            onClick={() => void load(true)}
            disabled={refreshing || loading}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button type="button" className="adm-btn adm-btn--primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New announcement
          </button>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Live now", value: counts.active.toLocaleString() },
          { label: "Scheduled", value: counts.scheduled.toLocaleString() },
          { label: "Total views", value: totalViews.toLocaleString() },
          { label: "Click rate", value: clickRate(totalClicks, totalViews), sub: `${totalClicks.toLocaleString()} clicks` },
        ].map((stat) => (
          <div key={stat.label} className="adm-card px-4 py-3.5">
            <div className="adm-stat__label">{stat.label}</div>
            <div className="adm-stat__value">
              {stat.value}
              {stat.sub ? <span className="ml-2 text-[12px] font-normal text-[var(--mce-admin-text-muted)]">{stat.sub}</span> : null}
            </div>
          </div>
        ))}
      </section>

      <div className="adm-tabs mb-5" role="tablist">
        <button type="button" role="tab" aria-selected={view === "list"} className={`adm-tab ${view === "list" ? "adm-tab--active" : ""}`} onClick={() => setView("list")}>
          Announcements
        </button>
        <button type="button" role="tab" aria-selected={view === "overview"} className={`adm-tab ${view === "overview" ? "adm-tab--active" : ""}`} onClick={() => setView("overview")}>
          Overview
        </button>
      </div>

      {view === "overview" ? (
        <AnnouncementAnalytics insights={insights} range={range} onRangeChange={setRange} />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="adm-seg flex-wrap" role="group" aria-label="Filter by status">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`adm-seg__item ${filterStatus === tab.key ? "adm-seg__item--active" : ""}`}
                  onClick={() => setFilterStatus(tab.key)}
                >
                  {tab.label}
                  <span className="ml-1.5 text-[var(--mce-admin-text-muted)]">{counts[tab.key]}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter by audience"
                value={filterAudience}
                onChange={(event) => setFilterAudience(event.target.value as "all" | AnnouncementAudience)}
                className="adm-input !h-9 !w-auto"
              >
                <option value="all">All audiences</option>
                {AUDIENCES.map((audience) => (
                  <option key={audience.value} value={audience.value}>
                    {audience.label}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--mce-admin-text-muted)]" />
                <input
                  ref={searchRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search"
                  aria-label="Search announcements"
                  className="adm-input !h-9 !w-56 !pl-9"
                />
              </div>
            </div>
          </div>

          <div className="adm-card overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[var(--mce-admin-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading announcements
              </div>
            ) : filtered.length === 0 ? (
              <div className="adm-empty">
                <Megaphone className="mx-auto mb-3 h-6 w-6" />
                <div className="text-[var(--mce-admin-text)]">{filtersActive ? "Nothing matches these filters" : "No announcements yet"}</div>
                <div className="mt-1">
                  {filtersActive ? "Try a different status, audience or search." : "Create one to show a message to your users."}
                </div>
                {!filtersActive && (
                  <button type="button" className="adm-btn adm-btn--primary mt-4" onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    New announcement
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Announcement</th>
                      <th>Status</th>
                      <th>Where</th>
                      <th className="adm-num">Views</th>
                      <th className="adm-num">Clicks</th>
                      <th>Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((announcement) => (
                      <AnnouncementCard
                        key={announcement._id}
                        announcement={announcement}
                        onEdit={openEdit}
                        onDuplicate={duplicate}
                        onArchive={(a) => patchAnnouncement(a._id, { status: "archived" }, "Announcement archived.")}
                        onStop={(id) => patchAnnouncement(id, { status: "paused" }, "Announcement paused.")}
                        onRestart={(id) =>
                          patchAnnouncement(id, { status: "active", publishAt: new Date().toISOString() }, "Announcement resumed.")
                        }
                        onStartNow={(id) =>
                          patchAnnouncement(id, { status: "active", publishAt: new Date().toISOString() }, "Announcement launched.")
                        }
                        onRunAgain={runAgain}
                        onPreview={setPreviewItem}
                        isBusy={busyIds.has(announcement._id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {!loading && filtered.length > 0 && (
            <p className="mt-3 text-[12px] text-[var(--mce-admin-text-muted)]">
              Click an announcement to see who viewed and clicked it.
            </p>
          )}
        </>
      )}

      <AnnouncementPreviewModal announcement={previewItem} onClose={() => setPreviewItem(null)} />

      {showEditor && (
        <AnnouncementStudioModal
          editingId={editingId}
          form={form}
          submitting={submitting}
          imageUploading={imageUploading}
          onClose={() => {
            setShowEditor(false);
            setEditingId(null);
          }}
          onUpdateForm={updateForm}
          onSave={save}
          onUploadImage={uploadImage}
        />
      )}
    </div>
  );
}
