"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  CreditCard,
  FlaskConical,
  MessageCircle,
  RefreshCw,
  Users,
  X,
} from "lucide-react";

type Stage = {
  key: string;
  label: string;
  users: number;
  rate: number;
  dropoffFromPrevious: number;
};

type FunnelResponse = {
  generatedAt: string;
  periodDays: number;
  totalUsers: number;
  funnel: Stage[];
  cohorts: Array<{
    cohort: string;
    totalUsers: number;
    maturedFor7DayReturn: number;
    stages: Record<string, number>;
  }>;
  feedback: {
    total: number;
    options: Record<string, number>;
    recent: Array<{ id: string; userId: string; reason: string; detail: string; createdAt: string }>;
  };
  experiment: {
    settings: ExperimentSettings;
    variants: Array<{ variant: string; assigned: number; activated: number; paid: number }>;
    betaUsers: BetaUser[];
  };
};

type ExperimentSettings = {
  enabled: boolean;
  enabledAt?: string | null;
  activatedTrialDurationDays: number;
  controlTrialDurationDays: number;
  betaTrialDurationDays: number;
  activatedVariantAllocationPercent: number;
  updatedAt: string;
};

type BetaUser = { id: string; name: string; email: string; plan: string; variant: string | null; createdAt: string | null };

const DEFAULT_SETTINGS: ExperimentSettings = {
  enabled: false,
  enabledAt: null,
  activatedTrialDurationDays: 7,
  controlTrialDurationDays: 14,
  betaTrialDurationDays: 30,
  activatedVariantAllocationPercent: 50,
  updatedAt: "",
};

const REASON_LABELS: Record<string, string> = {
  could_not_connect: "Could not connect OBS",
  did_not_understand: "Did not understand the app",
  did_not_need_it_yet: "Did not need it yet",
  missing_feature: "Missing a feature",
  technical_problem: "Technical problem",
  already_use_something_else: "Already use something else",
  still_testing: "Still testing",
  other: "Other",
};

function percent(value: number): string {
  return `${Number(value || 0).toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function prettyDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "—";
}

export default function AdminActivationPage() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [settings, setSettings] = useState<ExperimentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [betaEmail, setBetaEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [funnelResponse, experimentResponse] = await Promise.all([
        fetch(`/api/admin/activation-funnel?days=${period}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/admin/activation-experiment", { credentials: "include", cache: "no-store" }),
      ]);
      const funnelBody = await funnelResponse.json();
      const experimentBody = await experimentResponse.json();
      if (!funnelResponse.ok) throw new Error(funnelBody.error || "Could not load activation funnel");
      if (!experimentResponse.ok) throw new Error(experimentBody.error || "Could not load experiment settings");
      setData(funnelBody);
      setSettings(experimentBody.settings || DEFAULT_SETTINGS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activation data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [period]);

  async function saveExperiment() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/activation-experiment", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save experiment");
      setSettings(body.settings);
      setMessage("Experiment settings saved. Existing trials were not changed.");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save experiment");
    } finally {
      setSaving(false);
    }
  }

  async function updateBeta(action: "add_beta" | "remove_beta", email: string) {
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/activation-experiment", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, email }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Could not update beta cohort");
      return;
    }
    setBetaEmail("");
    setMessage(body.note || "Beta cohort updated.");
    void load();
  }

  const maxFeedback = useMemo(
    () => Math.max(1, ...Object.values(data?.feedback.options || {})),
    [data?.feedback.options],
  );

  return (
    <div className="min-h-screen bg-slate-900 px-5 py-7 text-slate-50 md:px-8 lg:px-10">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-400">
              <BarChart3 className="h-4 w-4" /> Activation workspace
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50">Where users disappear</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Distinct users from signup to first useful result, return, upgrade prompt, checkout, and payment.
              Use this before changing pricing or buying more traffic.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="activation-period">Cohort window</label>
            <select id="activation-period" value={period} onChange={(event) => setPeriod(Number(event.target.value))} className="h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 outline-none ring-violet-500 focus:ring-2">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
            </select>
            <button type="button" onClick={() => void load()} className="flex h-11 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-300 hover:bg-slate-800" title="Refresh activation data">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>

        {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        {loading ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-10 text-center text-sm text-slate-400">Loading activation data…</div>
        ) : (
          <>
            <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 md:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">Activation funnel</h2>
                  <p className="mt-1 text-xs text-slate-500">{data?.totalUsers.toLocaleString() || 0} users in this cohort window</p>
                </div>
                <Users className="h-5 w-5 text-violet-400" />
              </div>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
                {(data?.funnel || []).map((stage, index) => (
                  <div key={stage.key} className="relative rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                    <p className="min-h-[32px] text-xs font-medium leading-4 text-slate-400">{stage.label}</p>
                    <p className="mt-3 text-2xl font-bold text-slate-50">{stage.users.toLocaleString()}</p>
                    <p className="mt-1 text-xs font-semibold text-violet-300">{percent(stage.rate)} of signups</p>
                    {index > 0 && stage.dropoffFromPrevious > 0 && <p className="mt-3 text-[11px] text-amber-300">-{stage.dropoffFromPrevious} from prior step</p>}
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 md:p-6">
                <h2 className="text-lg font-semibold text-slate-50">Weekly cohorts</h2>
                <p className="mt-1 text-xs text-slate-500">Return and paid stages are most useful once a cohort has had enough time to mature.</p>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[800px] text-left text-xs">
                    <thead className="border-b border-slate-700 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="pb-3 pr-4">Cohort</th>
                        <th className="pb-3 pr-4">Users</th>
                        <th className="pb-3 pr-4">Setup</th>
                        <th className="pb-3 pr-4">OBS</th>
                        <th className="pb-3 pr-4">First result</th>
                        <th className="pb-3 pr-4">Return 7d</th>
                        <th className="pb-3 pr-4">Paywall</th>
                        <th className="pb-3">Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {(data?.cohorts || []).map((cohort) => (
                        <tr key={cohort.cohort} className="text-slate-300">
                          <td className="py-3 pr-4 font-semibold text-slate-100">{prettyDate(cohort.cohort)}</td>
                          <td className="py-3 pr-4">{cohort.totalUsers}</td>
                          <td className="py-3 pr-4">{cohort.stages.onboardingCompleted || 0}</td>
                          <td className="py-3 pr-4">{cohort.stages.obsConnected || 0}</td>
                          <td className="py-3 pr-4">{cohort.stages.firstUsefulUse || 0}</td>
                          <td className="py-3 pr-4">{cohort.stages.returnedWithin7d || 0}<span className="ml-1 text-slate-500">({cohort.maturedFor7DayReturn} mature)</span></td>
                          <td className="py-3 pr-4">{cohort.stages.paywallSeen || 0}</td>
                          <td className="py-3 font-semibold text-emerald-300">{cohort.stages.paid || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data?.cohorts.length && <p className="py-10 text-center text-sm text-slate-500">No users in this period.</p>}
                </div>
              </section>

              <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">Why users stop</h2>
                    <p className="mt-1 text-xs text-slate-500">Short exit survey responses</p>
                  </div>
                  <MessageCircle className="h-5 w-5 text-blue-400" />
                </div>
                <div className="mt-5 space-y-3">
                  {Object.entries(data?.feedback.options || {}).map(([reason, count]) => (
                    <div key={reason}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-slate-300">{REASON_LABELS[reason] || reason}</span>
                        <span className="font-semibold text-slate-100">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-blue-500" style={{ width: `${(count / maxFeedback) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-xs text-slate-500">{data?.feedback.total || 0} responses received</p>
                {!!data?.feedback.recent.length && <div className="mt-5 space-y-3 border-t border-slate-700 pt-4">{data.feedback.recent.slice(0, 4).map((item) => <div key={item.id} className="text-xs"><p className="font-semibold text-slate-300">{REASON_LABELS[item.reason] || item.reason}</p>{item.detail && <p className="mt-1 leading-5 text-slate-500">{item.detail}</p>}</div>)}</div>}
              </section>
            </div>

            <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-violet-400" /><h2 className="text-lg font-semibold text-slate-50">Activated 7-day trial experiment</h2></div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Because many signups never reach the product, this test starts the trial after OBS connection or the first useful result. It only affects accounts created after you enable it; existing users and trials keep their current access.</p>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${settings.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-400"}`}>{settings.enabled ? "Running for new claims" : "Off"}</div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200 sm:col-span-2 lg:col-span-1"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} className="h-4 w-4 accent-violet-600" /> Enable test</label>
                <label className="text-xs font-semibold text-slate-400">Activated days<input type="number" min={1} max={90} value={settings.activatedTrialDurationDays} onChange={(event) => setSettings({ ...settings, activatedTrialDurationDays: Number(event.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none ring-violet-500 focus:ring-2" /></label>
                <label className="text-xs font-semibold text-slate-400">Control days<input type="number" min={1} max={90} value={settings.controlTrialDurationDays} onChange={(event) => setSettings({ ...settings, controlTrialDurationDays: Number(event.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none ring-violet-500 focus:ring-2" /></label>
                <label className="text-xs font-semibold text-slate-400">Beta days<input type="number" min={1} max={180} value={settings.betaTrialDurationDays} onChange={(event) => setSettings({ ...settings, betaTrialDurationDays: Number(event.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none ring-violet-500 focus:ring-2" /></label>
                <label className="text-xs font-semibold text-slate-400">Activated share (%)<input type="number" min={0} max={100} value={settings.activatedVariantAllocationPercent} onChange={(event) => setSettings({ ...settings, activatedVariantAllocationPercent: Number(event.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none ring-violet-500 focus:ring-2" /></label>
              </div>
              <button type="button" onClick={() => void saveExperiment()} disabled={saving} className="mt-5 h-11 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{saving ? "Saving…" : "Save experiment settings"}</button>

              <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Variant outcomes</h3>
                  <div className="mt-3 space-y-2">{(data?.experiment.variants || []).map((variant) => <div key={variant.variant} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-3 text-xs"><span className="font-semibold text-slate-300">{variant.variant}</span><span className="text-slate-500">{variant.assigned} assigned · {variant.activated} activated · <span className="text-emerald-300">{variant.paid} paid</span></span></div>)}{!data?.experiment.variants.length && <p className="text-xs text-slate-500">No assignments yet.</p>}</div>
                </div>
                <div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-sm font-semibold text-slate-200">Beta cohort</h3><p className="mt-1 text-xs text-slate-500">Mark existing users for extended beta access. This does not alter an existing trial.</p></div><div className="flex gap-2"><input value={betaEmail} onChange={(event) => setBetaEmail(event.target.value)} placeholder="user@example.com" className="h-10 min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none ring-violet-500 placeholder:text-slate-600 focus:ring-2" /><button type="button" disabled={!betaEmail.trim()} onClick={() => void updateBeta("add_beta", betaEmail)} className="h-10 rounded-lg bg-slate-700 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-600 disabled:opacity-50">Add</button></div></div>
                  <div className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-700">{(data?.experiment.betaUsers || []).map((user) => <div key={user.id} className="flex items-center justify-between gap-3 px-3 py-3 text-xs"><div className="min-w-0"><p className="truncate font-semibold text-slate-200">{user.name || user.email}</p><p className="truncate text-slate-500">{user.email}</p></div><button type="button" onClick={() => void updateBeta("remove_beta", user.email)} className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><X className="h-3.5 w-3.5" /> Remove</button></div>)}{!data?.experiment.betaUsers.length && <p className="px-3 py-4 text-xs text-slate-500">No beta users marked.</p>}</div>
                </div>
              </div>
            </section>

            <div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Data generated {prettyDate(data?.generatedAt)}. Counts are distinct users, not raw events.</div>
          </>
        )}
      </div>
    </div>
  );
}
