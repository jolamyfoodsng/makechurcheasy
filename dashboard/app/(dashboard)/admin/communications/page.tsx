"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Clock4,
  Eye,
  Loader2,
  Mail,
  MousePointerClick,
  Send,
  TriangleAlert,
  Users,
} from "lucide-react";

type Campaign = {
  _id: string;
  name: string;
  subject: string;
  audience: string;
  status: string;
  scheduledFor?: string | null;
  recipientCount: number;
  metrics: {
    queued: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    failed: number;
  };
  createdAt: string;
};

type Overview = {
  summary: {
    audience: {
      allUsers: number;
      trialUsers: number;
      paidUsers: number;
    };
    queue: {
      pending: number;
      failed: number;
    };
    delivery: {
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      failed: number;
      unsubscribed: number;
    };
    failedRenewalsLast30Days: number;
  };
  recentCampaigns: Campaign[];
};

const AUDIENCE_OPTIONS = [
  { value: "all_users", label: "All Users" },
  { value: "trial_users", label: "Trial Users" },
  { value: "free_users", label: "Free Users" },
  { value: "basic_users", label: "Basic Users" },
  { value: "growth_users", label: "Growth Users" },
  { value: "pro_users", label: "Pro Users" },
  { value: "cancelled_users", label: "Cancelled Users" },
  { value: "expired_trials", label: "Expired Trials" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-500/12 text-slate-300 border-slate-700",
  scheduled: "bg-blue-500/12 text-blue-300 border-blue-500/30",
  processing: "bg-amber-500/12 text-amber-300 border-amber-500/30",
  sent: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30",
  failed: "bg-rose-500/12 text-rose-300 border-rose-500/30",
};

const defaultForm = {
  name: "",
  subject: "",
  previewText: "",
  audience: "all_users",
  bodyHtml: "",
  bodyMarkdown: "",
  ctaLabel: "",
  ctaUrl: "",
  scheduleMode: "send_now",
  scheduledFor: "",
};

function formatDate(value?: string | null) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function AdminCommunicationsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const audienceLabel = useMemo(() => {
    return new Map(AUDIENCE_OPTIONS.map((option) => [option.value, option.label]));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [overviewRes, campaignsRes] = await Promise.all([
        fetch("/api/admin/communications/overview", { credentials: "include" }),
        fetch("/api/admin/communications/campaigns", { credentials: "include" }),
      ]);

      if (!overviewRes.ok || !campaignsRes.ok) {
        throw new Error("Failed to load communications data");
      }

      const overviewBody = await overviewRes.json();
      const campaignsBody = await campaignsRes.json();
      setOverview(overviewBody);
      setCampaigns(campaignsBody.campaigns || []);
    } catch (error) {
      console.error("[admin/communications] Load error:", error);
      setToast("Failed to load communications data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setToast(null);

    try {
      const res = await fetch("/api/admin/communications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          bodyMarkdown: form.bodyMarkdown || form.subject,
          scheduledFor: form.scheduleMode === "schedule_later" ? new Date(form.scheduledFor).toISOString() : null,
          category: "announcement",
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to create campaign" }));
        throw new Error(body.error || "Failed to create campaign");
      }

      setToast(form.scheduleMode === "schedule_later" ? "Campaign scheduled." : "Campaign queued for delivery.");
      setForm(defaultForm);
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

  const summaryCards = overview
    ? [
        {
          label: "Verified Audience",
          value: overview.summary.audience.allUsers,
          detail: `${overview.summary.audience.trialUsers} trial users`,
          icon: Users,
          tone: "bg-blue-500/12 text-blue-300",
        },
        {
          label: "Delivered",
          value: overview.summary.delivery.delivered,
          detail: `${overview.summary.delivery.sent} sent in the last 30 days`,
          icon: BadgeCheck,
          tone: "bg-emerald-500/12 text-emerald-300",
        },
        {
          label: "Opens",
          value: overview.summary.delivery.opened,
          detail: `${overview.summary.delivery.clicked} clicks tracked`,
          icon: Eye,
          tone: "bg-violet-500/12 text-violet-300",
        },
        {
          label: "Queue Health",
          value: overview.summary.queue.pending,
          detail: `${overview.summary.queue.failed} failed jobs pending review`,
          icon: Clock4,
          tone: "bg-amber-500/12 text-amber-300",
        },
      ]
    : [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Communications</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Event-driven email lifecycle, broadcast campaigns, and delivery health. Billing,
            trials, and account emails now flow through the same backend queue.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
          Failed renewals in the last 30 days:{" "}
          <span className="font-semibold text-amber-300">
            {overview?.summary.failedRenewalsLast30Days ?? 0}
          </span>
        </div>
      </div>

      {toast ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">
          {toast}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-10 text-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-3" />
          Loading communications data...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-3xl border border-slate-700 bg-slate-900 p-5"
                >
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${card.tone}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-sm text-slate-400 mt-4">{card.label}</p>
                  <p className="text-3xl font-semibold text-slate-50 mt-1">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-2">{card.detail}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] gap-6">
            <form
              onSubmit={handleSubmit}
              className="rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/12 text-blue-300 flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">Create broadcast</h2>
                  <p className="text-sm text-slate-400">
                    Compose one campaign and let the backend fan it out through the queue.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Campaign Name
                  </span>
                  <input
                    className="w-full h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-50 outline-none focus:border-blue-500"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="July Product Update"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Audience
                  </span>
                  <select
                    className="w-full h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-50 outline-none focus:border-blue-500"
                    value={form.audience}
                    onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))}
                  >
                    {AUDIENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Subject
                  </span>
                  <input
                    className="w-full h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-50 outline-none focus:border-blue-500"
                    value={form.subject}
                    onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                    placeholder="New OBS workflow updates"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Preview Text
                  </span>
                  <input
                    className="w-full h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-50 outline-none focus:border-blue-500"
                    value={form.previewText}
                    onChange={(event) => setForm((current) => ({ ...current, previewText: event.target.value }))}
                    placeholder="What users see in inbox previews"
                  />
                </label>
              </div>

              <label className="space-y-2 block">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Rich HTML Body
                </span>
                <textarea
                  className="w-full min-h-[220px] rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-50 outline-none focus:border-blue-500 resize-y"
                  value={form.bodyHtml}
                  onChange={(event) => setForm((current) => ({ ...current, bodyHtml: event.target.value }))}
                  placeholder="<p>Ship a polished update, maintenance notice, or feature release.</p>"
                  required
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    CTA Label
                  </span>
                  <input
                    className="w-full h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-50 outline-none focus:border-blue-500"
                    value={form.ctaLabel}
                    onChange={(event) => setForm((current) => ({ ...current, ctaLabel: event.target.value }))}
                    placeholder="Read the release"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    CTA URL
                  </span>
                  <input
                    className="w-full h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-50 outline-none focus:border-blue-500"
                    value={form.ctaUrl}
                    onChange={(event) => setForm((current) => ({ ...current, ctaUrl: event.target.value }))}
                    placeholder="https://..."
                  />
                </label>
              </div>

              <div className="rounded-3xl border border-slate-700 bg-slate-950/80 p-4 space-y-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, scheduleMode: "send_now" }))}
                    className={`rounded-2xl px-4 py-2 text-sm font-medium border transition-colors ${
                      form.scheduleMode === "send_now"
                        ? "border-blue-500 bg-blue-500/12 text-blue-300"
                        : "border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    Send Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, scheduleMode: "schedule_later" }))}
                    className={`rounded-2xl px-4 py-2 text-sm font-medium border transition-colors ${
                      form.scheduleMode === "schedule_later"
                        ? "border-blue-500 bg-blue-500/12 text-blue-300"
                        : "border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    Schedule Later
                  </button>
                </div>

                {form.scheduleMode === "schedule_later" ? (
                  <label className="space-y-2 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Schedule Time
                    </span>
                    <input
                      type="datetime-local"
                      className="w-full h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-50 outline-none focus:border-blue-500"
                      value={form.scheduledFor}
                      onChange={(event) => setForm((current) => ({ ...current, scheduledFor: event.target.value }))}
                      required={form.scheduleMode === "schedule_later"}
                    />
                  </label>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-xs text-slate-500 max-w-xl">
                  Product announcements honor unsubscribe preferences. Transactional billing and
                  security emails stay backend-controlled and mandatory.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {form.scheduleMode === "schedule_later" ? "Schedule Campaign" : "Queue Campaign"}
                </button>
              </div>
            </form>

            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl bg-violet-500/12 text-violet-300 flex items-center justify-center">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">Delivery signals</h2>
                    <p className="text-sm text-slate-400">
                      Visibility into opens, clicks, bounce risk, and queue backlog.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Clicks</p>
                    <p className="text-2xl font-semibold text-slate-50 mt-1">
                      {overview?.summary.delivery.clicked ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Bounces</p>
                    <p className="text-2xl font-semibold text-slate-50 mt-1">
                      {overview?.summary.delivery.bounced ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Unsubscribed</p>
                    <p className="text-2xl font-semibold text-slate-50 mt-1">
                      {overview?.summary.delivery.unsubscribed ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Failed Jobs</p>
                    <p className="text-2xl font-semibold text-slate-50 mt-1">
                      {overview?.summary.queue.failed ?? 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">Recent campaigns</h2>
                    <p className="text-sm text-slate-400">
                      The latest broadcasts and their lifecycle state.
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {campaigns.length} total shown
                  </div>
                </div>

                <div className="space-y-3">
                  {campaigns.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 px-4 py-10 text-center text-sm text-slate-500">
                      No campaigns yet.
                    </div>
                  ) : (
                    campaigns.map((campaign) => (
                      <div
                        key={campaign._id}
                        className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-50">{campaign.name}</p>
                            <p className="text-sm text-slate-400 mt-1">{campaign.subject}</p>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[campaign.status] || STATUS_STYLES.draft}`}
                          >
                            {campaign.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-4">
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            {audienceLabel.get(campaign.audience as (typeof AUDIENCE_OPTIONS)[number]["value"]) || campaign.audience}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock4 className="w-3.5 h-3.5" />
                            {formatDate(campaign.scheduledFor || campaign.createdAt)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5" />
                            {campaign.recipientCount} recipients
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 mt-4">
                          <div className="rounded-xl bg-slate-900 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Queued</p>
                            <p className="text-sm font-semibold text-slate-100">{campaign.metrics.queued}</p>
                          </div>
                          <div className="rounded-xl bg-slate-900 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Delivered</p>
                            <p className="text-sm font-semibold text-slate-100">{campaign.metrics.delivered}</p>
                          </div>
                          <div className="rounded-xl bg-slate-900 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Opened</p>
                            <p className="text-sm font-semibold text-slate-100">{campaign.metrics.opened}</p>
                          </div>
                          <div className="rounded-xl bg-slate-900 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Clicked</p>
                            <p className="text-sm font-semibold text-slate-100">{campaign.metrics.clicked}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/12 text-amber-300 flex items-center justify-center">
                    <TriangleAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">Billing lifecycle health</h2>
                    <p className="text-sm text-slate-400">
                      Failed renewals and payment recovery pressure.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Failed Renewals</p>
                    <p className="text-2xl font-semibold text-slate-50 mt-1">
                      {overview?.summary.failedRenewalsLast30Days ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Paid Audience</p>
                    <p className="text-2xl font-semibold text-slate-50 mt-1">
                      {overview?.summary.audience.paidUsers ?? 0}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 mt-4 text-sm text-slate-400">
                  Automatic retries are scheduled from the backend billing state. Recovery emails,
                  suspension, and invoice events now share the same event log and queue.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
