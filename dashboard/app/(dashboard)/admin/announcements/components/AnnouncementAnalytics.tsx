"use client";

import {
  BarChart3,
  Calendar,
  Globe2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AnnouncementInsights, RangeKey } from "../types";
import { RANGES, formatDateTime, formatEventName } from "../types";

interface AnnouncementAnalyticsProps {
  insights: AnnouncementInsights | null;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
}

export function AnnouncementAnalytics({
  insights,
  range,
  onRangeChange,
}: AnnouncementAnalyticsProps) {
  if (!insights) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
        <p className="text-sm font-medium text-slate-300">No analytics data available yet</p>
        <p className="text-xs text-slate-500 mt-1">Data will appear once announcements are shown to users.</p>
      </div>
    );
  }

  const { platform, activitySeries, topAnnouncements, topCountries, recentPlatformEvents } = insights;
  const dismissalRate =
    platform.announcementViews > 0
      ? Math.round((platform.announcementDismissals / platform.announcementViews) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Header with Date Range */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white">Broadcast analytics</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Impression and click trends across church media clients.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => onRangeChange(r.key)}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                range === r.key
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60">
          <span className="text-[11px] font-medium text-slate-400">Total impressions</span>
          <p className="text-xl font-bold text-white mt-1">
            {platform.announcementViews.toLocaleString()}
          </p>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60">
          <span className="text-[11px] font-medium text-slate-400">Total clicks</span>
          <p className="text-xl font-bold text-white mt-1">
            {platform.announcementClicks.toLocaleString()}
          </p>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60">
          <span className="text-[11px] font-medium text-slate-400">Click rate (CTR)</span>
          <p className="text-xl font-bold text-emerald-400 mt-1">{platform.clickRate}%</p>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60">
          <span className="text-[11px] font-medium text-slate-400">Dismissal rate</span>
          <p className="text-xl font-bold text-slate-300 mt-1">{dismissalRate}%</p>
        </div>
      </div>

      {/* Activity Timeline Chart */}
      <div className="p-5 rounded-xl border border-slate-800/80 bg-slate-900/60 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-300">Activity timeline</h3>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Active users
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              Views
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Clicks
            </span>
          </div>
        </div>

        <div className="h-60 w-full pt-2">
          {activitySeries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No activity for this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activitySeries}>
                <defs>
                  <linearGradient id="userGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="clickGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="label" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F172A",
                    borderColor: "#334155",
                    borderRadius: "0.5rem",
                    color: "#F8FAFC",
                    fontSize: "11px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="activeUsers"
                  name="Active users"
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#userGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="announcementClicks"
                  name="Clicks"
                  stroke="#10B981"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#clickGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Announcements */}
        <div className="lg:col-span-2 p-4 rounded-xl border border-slate-800/80 bg-slate-900/60 space-y-3">
          <h3 className="text-xs font-semibold text-slate-300">Campaign performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] font-medium text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Campaign</th>
                  <th className="py-2 pr-3 text-right">Views</th>
                  <th className="py-2 pr-3 text-right">Clicks</th>
                  <th className="py-2 text-right">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {topAnnouncements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      No campaign records.
                    </td>
                  </tr>
                ) : (
                  topAnnouncements.map((item) => (
                    <tr key={item.announcementId} className="hover:bg-slate-800/30">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-slate-200 truncate block max-w-xs">
                          {item.title}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-slate-400 font-mono">
                        {item.views}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-emerald-400 font-mono font-medium">
                        {item.clicks}
                      </td>
                      <td className="py-2.5 text-right font-mono font-medium text-slate-300">
                        {item.clickRate > 0 ? `${item.clickRate}%` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Countries */}
        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/60 space-y-3">
          <h3 className="text-xs font-semibold text-slate-300">Top regions</h3>
          <div className="space-y-2">
            {topCountries.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No regional data.</p>
            ) : (
              topCountries.slice(0, 5).map((c) => (
                <div key={c.country} className="flex items-center justify-between text-xs py-1">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Globe2 className="w-3 h-3 text-slate-400" />
                    {c.country}
                  </span>
                  <span className="text-slate-400 font-mono">{c.activeUsers} users</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
