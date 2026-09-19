"use client";

import { useState, useRef, useEffect } from "react";
import {
  Check,
  Copy,
  Eye,
  Globe,
  Loader2,
  Monitor,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Users,
  Edit2,
  ExternalLink,
} from "lucide-react";
import type { Announcement } from "../types";
import { effectiveStatus, formatDate, audienceLabel } from "../types";

interface AnnouncementCardProps {
  announcement: Announcement;
  onEdit: (a: Announcement) => void;
  onDuplicate: (a: Announcement) => void;
  onArchive: (a: Announcement) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onStartNow: (id: string) => void;
  onRunAgain: (a: Announcement) => void;
  onViewAnalytics: (a: Announcement) => void;
  onPreview: (a: Announcement) => void;
  isBusy?: boolean;
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
  onViewAnalytics,
  onPreview,
  isBusy = false,
}: AnnouncementCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const effStatus = effectiveStatus(announcement);
  const shown = announcement.metrics?.shown ?? 0;
  const dismissed = announcement.metrics?.dismissed ?? 0;
  const clicked = announcement.metrics?.clicked ?? 0;
  const ctr = shown > 0 ? ((clicked / shown) * 100).toFixed(1) : "0.0";
  const dismissRate = shown > 0 ? Math.round((dismissed / shown) * 100) : 0;

  function copyCode() {
    if (!announcement.offerCode) return;
    navigator.clipboard.writeText(announcement.offerCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Determine card style based on status
  const cardStyle =
    effStatus === "active"
      ? "group relative bg-[#0F1628] hover:bg-[#121B32] border border-indigo-500/40 hover:border-indigo-500/70 rounded-xl p-5 shadow-lg shadow-black/40 transition duration-200"
      : effStatus === "scheduled"
        ? "group relative bg-[#0E1526] hover:bg-[#121B30] border border-slate-800/90 hover:border-slate-700 rounded-xl p-5 shadow-sm transition duration-200"
        : "group relative bg-[#0E1526]/70 hover:bg-[#121B30] border border-slate-800/70 hover:border-slate-700 rounded-xl p-5 transition duration-200";

  return (
    <article className={cardStyle}>
      {/* Ambient highlight indicator for active */}
      {effStatus === "active" && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-emerald-500 rounded-r" />
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Thumbnail (if image present) */}
        {announcement.imageUrl && (
          <div className="shrink-0">
            <a
              href={
                announcement.ctaUrl
                  ? announcement.ctaUrl.startsWith("http")
                    ? announcement.ctaUrl
                    : `https://makechurcheasy.com${announcement.ctaUrl.startsWith("/") ? "" : "/"}${announcement.ctaUrl}`
                  : undefined
              }
              target="_blank"
              rel="noopener noreferrer"
              className="block relative rounded-xl overflow-hidden border border-slate-700/80 hover:border-indigo-500 transition group w-28 h-16 sm:w-36 sm:h-20 bg-black/40 shadow-sm"
              title={announcement.ctaUrl ? `Destination: ${announcement.ctaUrl}` : "Announcement Image"}
            >
              <img
                src={announcement.imageUrl}
                alt=""
                className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
              />
              {announcement.ctaUrl && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                  <ExternalLink className="w-4 h-4" />
                </div>
              )}
            </a>
          </div>
        )}

        {/* Left Meta & Content */}
        <div className={`space-y-2 flex-1 ${effStatus === "active" ? "pl-2" : ""}`}>
          {/* Badges Header Row */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            {/* Status Badge */}
            {effStatus === "active" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-600/40 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Active Now
              </span>
            )}
            {effStatus === "scheduled" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-950/80 text-sky-400 border border-sky-800/50 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                Scheduled
              </span>
            )}
            {effStatus === "paused" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/50 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Paused
              </span>
            )}
            {effStatus === "ended" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700/60 text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Ended
              </span>
            )}
            {effStatus === "draft" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[11px] font-medium">
                Draft
              </span>
            )}

            {/* Audience Target Badge */}
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-medium">
              <Users className="w-3 h-3 text-slate-400" />
              {audienceLabel(announcement.audience)}
            </span>

            {/* Delivery Channels Badge */}
            <div className="flex items-center gap-1 text-slate-400 bg-slate-900/90 px-2 py-0.5 rounded-md border border-slate-800 text-[11px]">
              {announcement.surfaces.includes("desktop") && (
                <span title="Desktop Dock">
                  <Monitor className="w-3 h-3 text-slate-300" />
                </span>
              )}
              {announcement.surfaces.includes("desktop") && announcement.surfaces.includes("dashboard") && (
                <span className="text-slate-600">·</span>
              )}
              {announcement.surfaces.includes("dashboard") && (
                <span title="Web Browser">
                  <Globe className="w-3 h-3 text-slate-300" />
                </span>
              )}
              <span className="text-slate-400 text-[10px] ml-0.5 font-mono">
                {announcement.surfaces.includes("desktop") && announcement.surfaces.includes("dashboard")
                  ? "Web + Desktop"
                  : announcement.surfaces.includes("desktop")
                    ? "Desktop"
                    : "Web"}
              </span>
            </div>

            {/* Offer code or tags */}
            {announcement.offerCode && (
              <button
                type="button"
                onClick={copyCode}
                className="px-2 py-0.2 rounded bg-amber-900/40 text-amber-300 border border-amber-700/40 text-[10px] font-mono flex items-center gap-1 hover:bg-amber-800/50 transition-colors"
                title="Click to copy promo code"
              >
                <span>{announcement.offerCode}</span>
                {announcement.offerDiscountPercent ? (
                  <span>· {announcement.offerDiscountPercent}% off</span>
                ) : null}
                {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5 opacity-60" />}
              </button>
            )}

            <span className="text-slate-600 text-xs">·</span>
            <span className="text-[11px] text-slate-400 font-mono">
              {effStatus === "scheduled" ? "Scheduled for: " : "Published: "}
              {formatDate(announcement.publishAt)}
            </span>
          </div>

          {/* Title & Body Content */}
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight group-hover:text-indigo-300 transition flex items-center flex-wrap gap-2">
              {announcement.title}
              {announcement.tags?.some((t) => t.toLowerCase().includes("image-only")) && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-400/30 font-semibold">
                  Graphic Banner
                </span>
              )}
              {announcement.priority > 15 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 font-semibold">
                  Priority High
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-1 line-clamp-1 leading-relaxed">
              {announcement.message}
            </p>
          </div>

          {/* Real-time Metrics Pill Strip */}
          <div className="flex items-center gap-4 text-xs pt-1">
            <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px]">
              <span className="text-slate-500">Impressions:</span>
              <strong className="text-white font-semibold">{shown.toLocaleString()} views</strong>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px]">
              <span className="text-slate-500">Clicks:</span>
              <strong className="text-emerald-400 font-semibold">
                {clicked.toLocaleString()} clicks ({ctr}% CTR)
              </strong>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
              <span className="text-slate-500">Dismissed:</span>
              <span>{dismissRate}%</span>
            </div>
          </div>
        </div>

        {/* Right Actions Toolbar */}
        <div className="flex items-center gap-2 pl-2 lg:pl-0 flex-shrink-0">
          <button
            type="button"
            onClick={() => onPreview(announcement)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 hover:text-white"
            title="Preview announcement modal as user sees it"
          >
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            Preview
          </button>

          <button
            type="button"
            onClick={() => onEdit(announcement)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 hover:text-white"
          >
            <Edit2 className="w-3.5 h-3.5 text-slate-400" />
            Edit
          </button>

          {effStatus === "active" && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onStop(announcement._id)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
              Pause
            </button>
          )}

          {effStatus === "paused" && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRestart(announcement._id)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
              Resume
            </button>
          )}

          {effStatus === "scheduled" && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onStartNow(announcement._id)}
              className="px-3.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-800/50 text-sky-300 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-sky-400" />}
              Launch now
            </button>
          )}

          {effStatus === "ended" && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRunAgain(announcement)}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-800/60 text-indigo-300 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />}
              Re-run
            </button>
          )}

          {/* Context menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-xl border border-slate-800 bg-[#0E1526] py-1 shadow-xl text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDuplicate(announcement);
                  }}
                  className="flex w-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Duplicate as draft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onViewAnalytics(announcement);
                  }}
                  className="flex w-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  View analytics
                </button>
                <div className="my-1 border-t border-slate-800" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (window.confirm("Archive this announcement?")) {
                      onArchive(announcement);
                    }
                  }}
                  className="flex w-full px-3 py-1.5 text-rose-400 hover:bg-rose-500/10"
                >
                  Archive
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
