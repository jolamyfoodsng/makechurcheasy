"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import Link from "next/link";

type EventType = "license_tamper" | "device_limit" | "license_unsigned";

interface SecurityEvent {
  _id: string;
  type: EventType | string;
  userId: string | null;
  deviceId: string | null;
  reason: string | null;
  appVersion: string;
  ip: string;
  details?: Record<string, unknown>;
  createdAt: string | null;
}

interface TopUser {
  userId: string;
  count: number;
  lastAt: string | null;
  types: string[];
}

const TYPE_META: Record<string, { label: string; hint: string; badge: string }> = {
  license_tamper: {
    label: "License tamper",
    hint: "The desktop app rejected a license signature or found it altered.",
    badge: "bg-red-900/40 text-red-300 border-red-700/50",
  },
  license_unsigned: {
    label: "Unsigned license",
    hint: "The server could not sign a license response (signing key missing).",
    badge: "bg-amber-900/40 text-amber-300 border-amber-700/50",
  },
  device_limit: {
    label: "Device limit",
    hint: "An account tried to use more devices than its plan allows.",
    badge: "bg-indigo-900/40 text-indigo-300 border-indigo-700/50",
  },
};

const DAY_OPTIONS = [1, 7, 30, 90];

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-800 ${className ?? ""}`} />;
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, hint: "", badge: "bg-slate-800 text-slate-300 border-slate-600" };
}

export default function AdminSecurityEventsPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("");
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ days: String(days), limit: "200" });
      if (type) qs.set("type", type);
      const res = await fetch(`/api/admin/security-events?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load security events");
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
      setTopUsers(Array.isArray(data.topUsers) ? data.topUsers : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load security events");
      setEvents([]);
      setTopUsers([]);
    } finally {
      setLoading(false);
    }
  }, [type, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectClass =
    "h-10 px-3 rounded-xl border border-slate-700 text-sm bg-gray-900 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Security Events</h1>
        <p className="text-sm text-slate-400 mt-1">
          Licence tampering, unsigned responses, and device-limit hits reported by the apps. Repeats from the same
          device are collapsed to one entry per hour.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass} aria-label="Event type">
          <option value="">All types</option>
          {Object.entries(TYPE_META).map(([value, meta]) => (
            <option key={value} value={value}>{meta.label}</option>
          ))}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={selectClass} aria-label="Time range">
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>{d === 1 ? "Last 24 hours" : `Last ${d} days`}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="h-10 px-3 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-gray-900 text-sm text-slate-200 hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-xl text-sm bg-red-900/40 text-red-300 border border-red-700/50">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-start">
        <div className="rounded-2xl bg-gray-900 border border-slate-700 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-100">Most flagged accounts</h2>
            <p className="text-xs text-slate-500 mt-0.5">Highest event counts in this range</p>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              <SkeletonBlock className="h-10" />
              <SkeletonBlock className="h-10" />
              <SkeletonBlock className="h-10" />
            </div>
          ) : topUsers.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No flagged accounts.</p>
          ) : (
            <ul>
              {topUsers.map((u) => (
                <li key={u.userId} className="px-5 py-3 border-b border-slate-700/50 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/admin/users/${u.userId}`} className="text-sm font-medium text-indigo-300 hover:text-indigo-200 truncate">
                      {u.userId}
                    </Link>
                    <span className="text-sm font-semibold text-slate-100">{u.count}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.types.map((t) => (
                      <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-md border ${typeMeta(t).badge}`}>
                        {typeMeta(t).label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Last: {formatWhen(u.lastAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-gray-900 border border-slate-700 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              <SkeletonBlock className="h-12" />
              <SkeletonBlock className="h-12" />
              <SkeletonBlock className="h-12" />
              <SkeletonBlock className="h-12" />
            </div>
          ) : events.length === 0 ? (
            <div className="py-16 text-center">
              <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No security events in this range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider">When</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider">Type</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider">User / Device</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden lg:table-cell">Version</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden xl:table-cell">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const meta = typeMeta(e.type);
                    return (
                      <tr key={e._id} className="border-b border-slate-700/50 last:border-0 hover:bg-gray-800/50 transition-colors align-top">
                        <td className="px-5 py-3.5 text-slate-300 whitespace-nowrap">{formatWhen(e.createdAt)}</td>
                        <td className="px-5 py-3.5">
                          <span title={meta.hint} className={`inline-block text-xs px-2 py-0.5 rounded-md border ${meta.badge}`}>
                            {meta.label}
                          </span>
                          {e.reason && <p className="text-xs text-slate-500 mt-1 break-all">{e.reason}</p>}
                        </td>
                        <td className="px-5 py-3.5">
                          {e.userId ? (
                            <Link href={`/admin/users/${e.userId}`} className="font-medium text-indigo-300 hover:text-indigo-200 break-all">
                              {e.userId}
                            </Link>
                          ) : (
                            <span className="text-slate-500">No user</span>
                          )}
                          {e.deviceId && <p className="text-xs text-slate-500 mt-0.5 break-all">{e.deviceId}</p>}
                        </td>
                        <td className="px-5 py-3.5 text-slate-300 hidden lg:table-cell">{e.appVersion || "—"}</td>
                        <td className="px-5 py-3.5 text-slate-400 hidden xl:table-cell">{e.ip || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
