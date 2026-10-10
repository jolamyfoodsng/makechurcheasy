"use client";

import Link from "next/link";
import type { AnnouncementInsights, RangeKey } from "../types";
import { RANGES, clickRate, formatDateTime } from "../types";
import { ViewsClicksChart } from "./ViewsClicksChart";

interface AnnouncementAnalyticsProps {
  insights: AnnouncementInsights | null;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
}

export function AnnouncementAnalytics({ insights, range, onRangeChange }: AnnouncementAnalyticsProps) {
  if (!insights) {
    return (
      <div className="adm-card adm-empty">
        <div className="text-[var(--mce-admin-text)]">No data yet</div>
        <div className="mt-1">Numbers show up once announcements have been shown to users.</div>
      </div>
    );
  }

  const { platform, activitySeries, topAnnouncements, recentAnnouncementEvents } = insights;
  const recentClicks = recentAnnouncementEvents.filter((event) => event.action === "clicked").slice(0, 15);
  const chartData = activitySeries.map((point) => ({
    label: point.label,
    views: point.announcementViews,
    clicks: point.announcementClicks,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--mce-admin-text)]">All announcements</h2>
          <p className="text-[13px] text-[var(--mce-admin-text-secondary)]">Views and clicks across everything you have sent.</p>
        </div>
        <div className="adm-seg" role="group" aria-label="Time range">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`adm-seg__item ${range === item.key ? "adm-seg__item--active" : ""}`}
              onClick={() => onRangeChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Views", value: platform.announcementViews.toLocaleString() },
          { label: "Clicks", value: platform.announcementClicks.toLocaleString() },
          { label: "Click rate", value: `${platform.clickRate}%` },
          { label: "Dismissed", value: clickRate(platform.announcementDismissals, platform.announcementViews) },
        ].map((stat) => (
          <div key={stat.label} className="adm-card px-4 py-3.5">
            <div className="adm-stat__label">{stat.label}</div>
            <div className="adm-stat__value">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="adm-card p-4">
        <ViewsClicksChart data={chartData} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="adm-card overflow-hidden">
          <div className="adm-card__head">
            <div className="adm-card__title">By announcement</div>
          </div>
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Announcement</th>
                  <th className="adm-num">Views</th>
                  <th className="adm-num">Clicks</th>
                  <th className="adm-num">Rate</th>
                </tr>
              </thead>
              <tbody>
                {topAnnouncements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="adm-empty">Nothing in this period.</td>
                  </tr>
                ) : (
                  topAnnouncements.map((item) => (
                    <tr key={item.announcementId}>
                      <td className="max-w-[260px] truncate">
                        <Link
                          href={`/admin/announcements/${item.announcementId}`}
                          className="text-[var(--mce-admin-text)] hover:underline"
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td className="adm-num">{item.views.toLocaleString()}</td>
                      <td className="adm-num text-[var(--mce-admin-text)]">{item.clicks.toLocaleString()}</td>
                      <td className="adm-num">{item.clicks ? `${item.clickRate}%` : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="adm-card overflow-hidden">
          <div className="adm-card__head">
            <div className="adm-card__title">Latest clicks</div>
          </div>
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Country</th>
                  <th>Announcement</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentClicks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="adm-empty">No clicks in this period.</td>
                  </tr>
                ) : (
                  recentClicks.map((event) => (
                    <tr key={event.id}>
                      <td className="max-w-[160px] truncate text-[var(--mce-admin-text)]">{event.userName}</td>
                      <td className="whitespace-nowrap">{event.country}</td>
                      <td className="max-w-[160px] truncate">
                        <Link href={`/admin/announcements/${event.announcementId}`} className="hover:underline">
                          {event.announcementTitle}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-[12px]">{formatDateTime(event.clickedAt || event.occurredAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
