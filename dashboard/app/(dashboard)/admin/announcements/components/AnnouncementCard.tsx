"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Image as ImageIcon, Loader2, Monitor, MoreHorizontal } from "lucide-react";
import type { Announcement, FilterStatus } from "../types";
import {
  audienceLabel,
  clickRate,
  detectLegacyLayout,
  effectiveStatus,
  formatDate,
  layoutLabel,
} from "../types";

interface AnnouncementRowProps {
  announcement: Announcement;
  onEdit: (a: Announcement) => void;
  onDuplicate: (a: Announcement) => void;
  onArchive: (a: Announcement) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onStartNow: (id: string) => void;
  onRunAgain: (a: Announcement) => void;
  onPreview: (a: Announcement) => void;
  isBusy?: boolean;
}

const STATUS_BADGE: Record<FilterStatus, { label: string; className: string }> = {
  all: { label: "", className: "" },
  active: { label: "Live", className: "adm-badge--success" },
  scheduled: { label: "Scheduled", className: "adm-badge--info" },
  paused: { label: "Paused", className: "adm-badge--warning" },
  ended: { label: "Ended", className: "" },
  draft: { label: "Draft", className: "" },
};

export function StatusBadge({ announcement }: { announcement: Announcement }) {
  const status = effectiveStatus(announcement);
  const badge = STATUS_BADGE[status];
  if (!badge.label) return null;
  return (
    <span className={`adm-badge ${badge.className}`}>
      <span className="adm-badge__dot" />
      {badge.label}
    </span>
  );
}

export function AnnouncementCard({
  announcement,
  onEdit,
  onDuplicate,
  onArchive,
  onStop,
  onRestart,
  onStartNow,
  onRunAgain,
  onPreview,
  isBusy = false,
}: AnnouncementRowProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const status = effectiveStatus(announcement);
  const shown = announcement.metrics?.shown ?? 0;
  const clicked = announcement.metrics?.clicked ?? 0;
  const layout = detectLegacyLayout(announcement);
  const detailHref = `/admin/announcements/${announcement._id}`;
  const dateLabel = status === "scheduled" ? "Goes live" : "Published";

  function menuItem(label: string, action: () => void, danger = false) {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setMenuOpen(false);
          action();
        }}
        className={`block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--mce-admin-surface-hover)] ${
          danger ? "text-[var(--mce-admin-danger)]" : "text-[var(--mce-admin-text)]"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <tr
      className="cursor-pointer"
      onClick={() => router.push(detailHref)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === "Enter") router.push(detailHref);
      }}
      tabIndex={0}
    >
      <td className="max-w-[420px]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--mce-admin-border)] bg-[var(--mce-admin-bg)]">
            {announcement.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={announcement.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-4 w-4 text-[var(--mce-admin-text-muted)]" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-[var(--mce-admin-text)]">
              {announcement.title}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[var(--mce-admin-text-muted)]">
              {layoutLabel(layout)} · {audienceLabel(announcement.audience)}
            </div>
          </div>
        </div>
      </td>
      <td>
        <StatusBadge announcement={announcement} />
      </td>
      <td>
        <span className="inline-flex items-center gap-1.5 text-[var(--mce-admin-text-muted)]">
          {announcement.surfaces.includes("desktop") && <Monitor className="h-3.5 w-3.5" aria-label="Desktop app" />}
          {announcement.surfaces.includes("dashboard") && <Globe className="h-3.5 w-3.5" aria-label="Web dashboard" />}
        </span>
      </td>
      <td className="adm-num">{shown.toLocaleString()}</td>
      <td className="adm-num">
        <span className="text-[var(--mce-admin-text)]">{clicked.toLocaleString()}</span>
        <span className="ml-1.5 text-[12px] text-[var(--mce-admin-text-muted)]">{clickRate(clicked, shown)}</span>
      </td>
      <td className="whitespace-nowrap text-[12px]">
        <div>{formatDate(announcement.publishAt)}</div>
        <div className="text-[var(--mce-admin-text-muted)]">{dateLabel}</div>
      </td>
      <td onClick={(event) => event.stopPropagation()} className="w-[1%] whitespace-nowrap">
        <div className="relative flex items-center justify-end gap-1" ref={menuRef}>
          {status === "active" && (
            <button type="button" className="adm-btn adm-btn--sm" disabled={isBusy} onClick={() => onStop(announcement._id)}>
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Pause
            </button>
          )}
          {status === "paused" && (
            <button type="button" className="adm-btn adm-btn--sm" disabled={isBusy} onClick={() => onRestart(announcement._id)}>
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Resume
            </button>
          )}
          {status === "scheduled" && (
            <button type="button" className="adm-btn adm-btn--sm" disabled={isBusy} onClick={() => onStartNow(announcement._id)}>
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Launch now
            </button>
          )}
          {status === "ended" && (
            <button type="button" className="adm-btn adm-btn--sm" disabled={isBusy} onClick={() => onRunAgain(announcement)}>
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Run again
            </button>
          )}
          {status === "draft" && (
            <button type="button" className="adm-btn adm-btn--sm" onClick={() => onEdit(announcement)}>
              Edit
            </button>
          )}
          <button
            type="button"
            className="adm-icon-btn"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={isBusy}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--mce-admin-border-strong)] bg-[var(--mce-admin-surface-raised)] py-1 shadow-xl"
            >
              {menuItem("View analytics", () => router.push(detailHref))}
              {status !== "draft" && menuItem("Edit", () => onEdit(announcement))}
              {menuItem("Preview", () => onPreview(announcement))}
              {menuItem("Duplicate as draft", () => onDuplicate(announcement))}
              <div className="my-1 border-t border-[var(--mce-admin-border)]" />
              {menuItem(
                "Archive",
                () => {
                  if (window.confirm("Archive this announcement? It will stop showing to users.")) onArchive(announcement);
                },
                true,
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
