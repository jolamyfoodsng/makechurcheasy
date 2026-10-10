"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Clock3, Download, Globe2, RefreshCw, Search, TriangleAlert, Users } from "lucide-react";
import { getCountryDisplayName } from "@/lib/countryDisplay";

type PeriodDays = 7 | 30 | 90;

interface MultiStreamUser {
  userId: string;
  name: string;
  email: string;
  country: string;
  churchName: string;
}

interface MultiStreamSession extends MultiStreamUser {
  id: string;
  profileName: string;
  channels: Array<{ name: string; platform: string }>;
  status: string;
  startedAt: string;
  lastHeartbeat: string;
  endedAt: string | null;
  durationSeconds: number;
  errorCount: number;
  lastErrorCode: string;
}

interface MultiStreamError extends MultiStreamUser {
  id: string;
  profileName: string;
  channels: Array<{ name: string; platform: string }>;
  stage: string;
  code: string;
  message: string;
  createdAt: string;
}

interface MultiStreamChurch extends MultiStreamUser {
  plan: string;
  sessions: number;
  usedSeconds: number;
  monthSeconds: number;
  longestSeconds: number;
  interrupted: number;
  maxDestinations: number;
  platforms: string[];
  profiles: string[];
  errors: number;
  errorCodes: Array<{ code: string; count: number }>;
  firstAt: string | null;
  lastAt: string | null;
  triedOnlyWithErrors: boolean;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

interface MonitorData {
  updatedAt: string;
  churches?: MultiStreamChurch[];
  summary: { sessions: number; users: number; live: number; errors: number; usedSeconds: number };
  sessions: MultiStreamSession[];
  errors: MultiStreamError[];
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${safe}s`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function StatCard({ label, value, detail, icon: Icon }: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <Icon className="h-5 w-5 text-slate-500" aria-hidden="true" />
      </div>
    </div>
  );
}

export default function AdminMultiStreamPage() {
  const [days, setDays] = useState<PeriodDays>(30);
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/multistream?days=${days}`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load multi-stream activity.");
      setData(body as MonitorData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load multi-stream activity.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const summary = data?.summary;
  const [query, setQuery] = useState("");
  const churches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data?.churches || [];
    return q ? list.filter((c) => [c.name, c.email, c.churchName, c.country, ...c.platforms].some((v) => String(v || "").toLowerCase().includes(q))) : list;
  }, [data, query]);

  const exportCsv = () => {
    const header = ["Name", "Email", "Church", "Country", "Plan", "Sessions", "Total minutes", "Minutes this month", "Longest session (min)", "Platforms", "Max destinations", "Errors", "Top error codes", "Interrupted", "First used", "Last used"];
    const rows = churches.map((c) => [c.name, c.email, c.churchName, c.country, c.plan, c.sessions, Math.round(c.usedSeconds / 60), Math.round(c.monthSeconds / 60), Math.round(c.longestSeconds / 60), c.platforms.join(" / "), c.maxDestinations, c.errors, c.errorCodes.map((e) => `${e.code}×${e.count}`).join(" / "), c.interrupted, c.firstAt || "", c.lastAt || ""]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `multistream-churches-${days}d.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Product usage</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Multi-Stream usage</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            See who used Multi-Stream, how long their sessions lasted, which destination labels they used, and where setup errors occurred.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="multistream-period">Activity period</label>
          <select
            id="multistream-period"
            value={days}
            onChange={(event) => setDays(Number(event.target.value) as PeriodDays)}
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-indigo-400"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <p className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs leading-5 text-slate-400">
        Tracking starts when this version is deployed and users run the updated desktop app. Channel stream keys and ingest addresses are not collected.
      </p>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />)}
        </div>
      ) : (
        <>
          <section aria-label="Multi-Stream summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Live now" value={String(summary?.live || 0)} detail="Recent active sessions" icon={Activity} />
            <StatCard label="Hours used" value={`${((summary?.usedSeconds || 0) / 3600).toFixed(1)}h`} detail={`Across ${summary?.sessions || 0} sessions`} icon={Clock3} />
            <StatCard label="Users" value={String(summary?.users || 0)} detail="Unique users in this period" icon={Users} />
            <StatCard label="Errors" value={String(summary?.errors || 0)} detail="Setup and OBS stream errors" icon={TriangleAlert} />
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Churches</h2>
                <p className="mt-1 text-xs text-slate-500">Everyone who used or tried multi-stream in this period: total time, platforms, errors. Click a name for the full user page.</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 text-sm text-slate-400">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, platform" className="w-48 bg-transparent text-slate-100 outline-none placeholder:text-slate-500" />
                </label>
                <button type="button" onClick={exportCsv} disabled={!churches.length} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                  <Download className="h-4 w-4" aria-hidden="true" /> CSV
                </button>
              </div>
            </div>
            {churches.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-slate-950/50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Church / user</th>
                      <th className="px-4 py-3 font-medium">Plan</th>
                      <th className="px-4 py-3 font-medium text-right">Sessions</th>
                      <th className="px-4 py-3 font-medium text-right">Total time</th>
                      <th className="px-4 py-3 font-medium text-right">This month</th>
                      <th className="px-4 py-3 font-medium">Platforms tried</th>
                      <th className="px-4 py-3 font-medium">Errors</th>
                      <th className="px-4 py-3 font-medium">Last used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {churches.map((c) => (
                      <tr key={c.userId} className="align-top text-slate-300">
                        <td className="px-5 py-3">
                          <Link href={`/admin/users/${c.userId}`} className="font-medium text-slate-100 hover:text-indigo-300">{c.churchName || c.name}</Link>
                          <div className="mt-0.5 text-xs text-slate-500">{c.churchName ? `${c.name} · ` : ""}{c.email || "No email on account"}</div>
                          <div className="mt-0.5 text-xs text-slate-600">{getCountryDisplayName(c.country)}</div>
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-400">{c.plan}</td>
                        <td className="px-4 py-3 text-right font-mono">{c.sessions}{c.interrupted ? <div className="text-[11px] text-amber-400">{c.interrupted} dropped</div> : null}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-100">{formatDuration(c.usedSeconds)}{c.longestSeconds ? <div className="text-[11px] font-normal text-slate-500">longest {formatDuration(c.longestSeconds)}</div> : null}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatDuration(c.monthSeconds)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {c.platforms.length ? c.platforms.map((p) => <span key={p} className="rounded border border-slate-700 bg-slate-800/70 px-1.5 py-0.5 text-[11px] capitalize text-slate-300">{p}</span>) : <span className="text-xs text-slate-500">—</span>}
                          </div>
                          {c.maxDestinations ? <div className="mt-1 text-[11px] text-slate-500">up to {c.maxDestinations} at once</div> : null}
                        </td>
                        <td className="px-4 py-3">
                          {c.errors ? (
                            <>
                              <span className="font-semibold text-rose-300">{c.errors}</span>
                              <div className="mt-0.5 text-[11px] text-slate-500">{c.errorCodes.map((e) => `${e.code} ×${e.count}`).join(", ")}</div>
                              {c.triedOnlyWithErrors && <div className="mt-0.5 text-[11px] text-amber-400">Tried, never went live</div>}
                            </>
                          ) : <span className="text-slate-500">0</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{formatDate(c.lastAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-slate-500">{query ? "No churches match this search." : "No church used multi-stream in this period."}</p>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Recent sessions</h2>
                <p className="mt-1 text-xs text-slate-500">Account name, email, country, profile, destinations, duration, and session state.</p>
              </div>
              <span className="text-xs text-slate-500">Updated {formatDate(data?.updatedAt)}</span>
            </div>
            {data?.sessions.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-slate-950/50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Country</th>
                      <th className="px-4 py-3 font-medium">Profile / destinations</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium">Started</th>
                      <th className="px-4 py-3 font-medium">State / errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {data.sessions.map((session) => (
                      <tr key={session.id} className="align-top text-slate-300">
                        <td className="px-5 py-4">
                          {session.userId ? <Link href={`/admin/users/${session.userId}`} className="font-medium text-slate-100 hover:text-indigo-300">{session.name}</Link> : <span className="font-medium text-slate-100">{session.name}</span>}
                          <div className="mt-1 text-xs text-slate-500">{session.email || "No email on account"}</div>
                          {session.churchName && <div className="mt-1 text-xs text-slate-500">{session.churchName}</div>}
                        </td>
                        <td className="px-4 py-4 text-slate-400">{getCountryDisplayName(session.country)}</td>
                        <td className="max-w-[380px] px-4 py-4">
                          <div className="font-medium text-slate-200">{session.profileName || "Untitled profile"}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {session.channels.map((channel, index) => (
                              <span key={`${channel.platform}-${channel.name}-${index}`} className="rounded border border-slate-700 bg-slate-800/70 px-1.5 py-0.5 text-[11px] text-slate-400">
                                {channel.name || channel.platform}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-100">{formatDuration(session.durationSeconds)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-400">{formatDate(session.startedAt)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${session.status === "live" ? "bg-emerald-500/10 text-emerald-300" : session.status === "interrupted" ? "bg-amber-500/10 text-amber-300" : "bg-slate-800 text-slate-400"}`}>
                            {session.status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                            {session.status === "live" ? "Live" : session.status === "interrupted" ? "Interrupted" : "Ended"}
                          </span>
                          <div className="mt-1 text-xs text-slate-500">{session.errorCount} errors{session.lastErrorCode ? ` · ${session.lastErrorCode}` : ""}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <Activity className="mx-auto h-7 w-7 text-slate-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-slate-300">No sessions recorded in this period</p>
                <p className="mt-1 text-xs text-slate-500">Sessions will appear here after an updated desktop app starts multi-streaming.</p>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
              <TriangleAlert className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold text-slate-100">Recent errors</h2>
                <p className="mt-1 text-xs text-slate-500">Only the error summary is stored; stream keys and ingest addresses are excluded.</p>
              </div>
            </div>
            {data?.errors.length ? (
              <div className="divide-y divide-slate-800/80">
                {data.errors.map((item) => (
                  <article key={item.id} className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(220px,1fr)_minmax(240px,1.4fr)_minmax(160px,0.8fr)] md:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-100">{item.name}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{item.email} · {getCountryDisplayName(item.country)}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-amber-200">{item.code} <span className="font-normal text-slate-500">· {item.stage}</span></div>
                      <p className="mt-1 text-sm text-slate-300">{item.message}</p>
                      {(item.profileName || item.channels.length > 0) && (
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {[item.profileName, ...item.channels.map((channel) => channel.name || channel.platform)].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{formatDate(item.createdAt)}</div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500">
                <Globe2 className="h-4 w-4" aria-hidden="true" />
                No multi-stream errors recorded in this period.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
