"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Loader2, Pencil, Search } from "lucide-react";
import type { AnnouncementDetailAnalytics, AnnouncementPersonRow } from "../types";
import { audienceLabel, clickRate, formatDate, formatDateTime, layoutLabel } from "../types";
import { ViewsClicksChart } from "../components/ViewsClicksChart";

type PeopleTab = "clicked" | "not_clicked" | "all";

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  active: { label: "Live", className: "adm-badge--success" },
  scheduled: { label: "Scheduled", className: "adm-badge--info" },
  paused: { label: "Paused", className: "adm-badge--warning" },
  draft: { label: "Draft", className: "" },
  archived: { label: "Archived", className: "" },
};

function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  // Stop spreadsheet apps from running a name or email that starts like a formula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv(rows: AnnouncementPersonRow[], title: string) {
  const header = ["Name", "Email", "Country", "Plan", "Where", "Result", "Button", "Clicked at", "Shown at"];
  const lines = rows.map((row) =>
    [
      row.userName,
      row.email,
      row.country,
      row.plan,
      row.surface === "desktop" ? "Desktop app" : "Web dashboard",
      row.status === "clicked" ? "Clicked" : row.status === "dismissed" ? "Dismissed" : "Seen",
      row.buttonLabel || "",
      row.clickedAt || "",
      row.shownAt || "",
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "announcement"}-people.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AnnouncementDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<AnnouncementDetailAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PeopleTab>("clicked");
  const [country, setCountry] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/announcements/${id}/analytics`, { credentials: "include" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load analytics");
        if (!cancelled) {
          setData(body);
          // Open on the people who did something, falling back to everyone.
          setTab(body.totals?.clickers > 0 ? "clicked" : "all");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const people = useMemo(() => data?.people ?? [], [data]);
  const countryOptions = useMemo(
    () => Array.from(new Set(people.map((person) => person.country))).sort((a, b) => a.localeCompare(b)),
    [people],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((person) => {
      if (tab === "clicked" && person.status !== "clicked") return false;
      if (tab === "not_clicked" && person.status === "clicked") return false;
      if (country !== "all" && person.country !== country) return false;
      if (!q) return true;
      return person.userName.toLowerCase().includes(q) || person.email.toLowerCase().includes(q);
    });
  }, [people, tab, country, query]);

  if (loading) {
    return (
      <div className="adm-page">
        <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--mce-admin-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading analytics
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="adm-page">
        <Link href="/admin/announcements" className="adm-btn adm-btn--ghost adm-btn--sm mb-4">
          <ArrowLeft className="h-4 w-4" />
          Announcements
        </Link>
        <div className="adm-card adm-empty">
          <div className="text-[var(--mce-admin-text)]">{error || "Announcement not found"}</div>
        </div>
      </div>
    );
  }

  const { announcement, totals } = data;
  const status = STATUS_STYLE[announcement.status] ?? STATUS_STYLE.draft;
  const clickedCount = people.filter((person) => person.status === "clicked").length;
  const maxCountryReached = Math.max(1, ...data.countries.map((item) => item.reached));
  const chartData = data.series.map((point) => ({ label: point.label, views: point.views, clicks: point.clicks }));
  const knownCountries = data.countries.filter((item) => item.country !== "Unknown");

  return (
    <div className="adm-page">
      <Link href="/admin/announcements" className="adm-btn adm-btn--ghost adm-btn--sm mb-4 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Announcements
      </Link>

      <header className="adm-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="adm-title">{announcement.title}</h1>
            <span className={`adm-badge ${status.className}`}>
              <span className="adm-badge__dot" />
              {status.label}
            </span>
          </div>
          <p className="adm-subtitle">
            {layoutLabel(announcement.layout ?? "standard")} · {audienceLabel(announcement.audience)} ·{" "}
            {announcement.surfaces.map((s) => (s === "desktop" ? "Desktop app" : "Web dashboard")).join(" and ")} · Published{" "}
            {formatDate(announcement.publishAt)}
          </p>
        </div>
        <Link href={`/admin/announcements?edit=${announcement.id}`} className="adm-btn">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "People reached", value: totals.reached.toLocaleString() },
          { label: "Views", value: totals.views.toLocaleString() },
          { label: "People who clicked", value: totals.clickers.toLocaleString() },
          { label: "Click rate", value: clickRate(totals.clickers, totals.reached) },
          { label: "Dismissed", value: clickRate(totals.dismissed, totals.views) },
        ].map((stat) => (
          <div key={stat.label} className="adm-card px-4 py-3.5">
            <div className="adm-stat__label">{stat.label}</div>
            <div className="adm-stat__value">{stat.value}</div>
          </div>
        ))}
      </section>

      <div className="adm-card mb-5 p-4">
        <div className="mb-2 text-[13px] font-semibold text-[var(--mce-admin-text)]">Last 30 days</div>
        <ViewsClicksChart data={chartData} height={220} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="adm-card overflow-hidden">
          <div className="adm-card__head">
            <div className="adm-card__title">Countries</div>
            <span className="text-[12px] text-[var(--mce-admin-text-muted)]">{knownCountries.length} known</span>
          </div>
          {data.countries.length === 0 ? (
            <div className="adm-empty">Nobody has seen this yet.</div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th className="adm-num">Reached</th>
                    <th className="adm-num">Clicked</th>
                    <th className="adm-num">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.countries.map((item) => (
                    <tr key={item.country}>
                      <td>
                        <div className="text-[var(--mce-admin-text)]">{item.country}</div>
                        <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-[var(--mce-admin-surface-raised)]">
                          <div
                            className="h-full rounded-full bg-[var(--mce-admin-accent)]"
                            style={{ width: `${Math.max(4, (item.reached / maxCountryReached) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="adm-num">{item.reached.toLocaleString()}</td>
                      <td className="adm-num text-[var(--mce-admin-text)]">{item.clickers.toLocaleString()}</td>
                      <td className="adm-num">{item.clickers ? `${item.clickRate}%` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="adm-card overflow-hidden">
            <div className="adm-card__head">
              <div className="adm-card__title">Buttons</div>
            </div>
            {data.buttons.length === 0 ? (
              <div className="adm-empty">
                {announcement.layout === "image_only" || announcement.layout === "custom"
                  ? "Clicks on the image or on links inside the HTML are counted above."
                  : "This announcement has no buttons."}
              </div>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Button</th>
                    <th>Opens</th>
                    <th className="adm-num">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.buttons.map((button) => (
                    <tr key={button.id}>
                      <td className="text-[var(--mce-admin-text)]">{button.label}</td>
                      <td className="max-w-[200px] truncate text-[12px]">{button.url}</td>
                      <td className="adm-num text-[var(--mce-admin-text)]">{button.clicks.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="adm-card overflow-hidden">
            <div className="adm-card__head">
              <div className="adm-card__title">Where it was seen</div>
            </div>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Place</th>
                  <th className="adm-num">Reached</th>
                  <th className="adm-num">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {data.surfaces.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="adm-empty">No data yet.</td>
                  </tr>
                ) : (
                  data.surfaces.map((item) => (
                    <tr key={item.surface}>
                      <td className="text-[var(--mce-admin-text)]">{item.surface === "desktop" ? "Desktop app" : "Web dashboard"}</td>
                      <td className="adm-num">{item.reached.toLocaleString()}</td>
                      <td className="adm-num text-[var(--mce-admin-text)]">{item.clickers.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="adm-card overflow-hidden">
        <div className="adm-card__head flex-wrap">
          <div className="adm-seg" role="group" aria-label="Filter people">
            {(
              [
                { key: "clicked", label: `Clicked ${clickedCount}` },
                { key: "not_clicked", label: `Did not click ${people.length - clickedCount}` },
                { key: "all", label: `Everyone ${people.length}` },
              ] as Array<{ key: PeopleTab; label: string }>
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                className={`adm-seg__item ${tab === item.key ? "adm-seg__item--active" : ""}`}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="adm-input !h-8 !w-auto"
            >
              <option value="all">All countries</option>
              {countryOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--mce-admin-text-muted)]" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or email"
                aria-label="Search people"
                className="adm-input !h-8 !w-48 !pl-8"
              />
            </div>
            <button
              type="button"
              className="adm-btn adm-btn--sm"
              disabled={filtered.length === 0}
              onClick={() => exportCsv(filtered, announcement.title)}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Country</th>
                <th>Plan</th>
                <th>Where</th>
                <th>Result</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="adm-empty">
                    {people.length === 0 ? "Nobody has been shown this announcement yet." : "No one matches these filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((person) => (
                  <tr key={`${person.userId}-${person.surface}`}>
                    <td className="whitespace-nowrap font-medium text-[var(--mce-admin-text)]">{person.userName}</td>
                    <td className="max-w-[220px] truncate">{person.email || "-"}</td>
                    <td className="whitespace-nowrap">{person.country}</td>
                    <td className="whitespace-nowrap capitalize">{person.plan}</td>
                    <td className="whitespace-nowrap">{person.surface === "desktop" ? "Desktop app" : "Web"}</td>
                    <td className="whitespace-nowrap">
                      {person.status === "clicked" ? (
                        <span className="adm-badge adm-badge--success">
                          Clicked{person.buttonLabel ? `: ${person.buttonLabel}` : ""}
                        </span>
                      ) : person.status === "dismissed" ? (
                        <span className="adm-badge">Dismissed</span>
                      ) : (
                        <span className="adm-badge">Seen</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-[12px]">{formatDateTime(person.clickedAt || person.shownAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data.truncated && (
          <div className="border-t border-[var(--mce-admin-border)] px-4 py-3 text-[12px] text-[var(--mce-admin-text-muted)]">
            Showing the {people.length.toLocaleString()} most recent people. Clicks are listed first.
          </div>
        )}
      </div>
    </div>
  );
}
