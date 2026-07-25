"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Gift, Info, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";

type AnnouncementTone = "info" | "success" | "warning" | "offer" | "upgrade";

interface Announcement {
  id: string;
  deliveryId: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  tags: string[];
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  offerCode?: string | null;
}

function iconForTone(tone: AnnouncementTone) {
  if (tone === "success") return CheckCircle2;
  if (tone === "warning") return AlertTriangle;
  if (tone === "offer") return Gift;
  if (tone === "upgrade") return Sparkles;
  return Info;
}

function accentForTone(tone: AnnouncementTone) {
  if (tone === "success") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (tone === "warning") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  if (tone === "offer") return "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20";
  if (tone === "upgrade") return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
}

export function AnnouncementModalHost() {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/user/announcements?surface=dashboard", { credentials: "include" });
      if (!res.ok) return;
      const body = await res.json();
      setAnnouncement(body.announcement || null);
    } catch (error) {
      console.error("[AnnouncementModalHost] Failed to fetch announcement:", error);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 1200);
    const handleFocus = () => void refresh();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  async function dismiss(clicked = false) {
    if (!announcement) return;
    const current = announcement;
    setAnnouncement(null);
    await fetch("/api/user/announcements", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId: current.deliveryId, clicked }),
    }).catch(() => {});
  }

  async function openAction() {
    if (!announcement?.ctaUrl) return;
    const url = announcement.ctaUrl;
    await dismiss(true);
    if (url.startsWith("http")) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(url);
  }

  if (!announcement) return null;

  const Icon = iconForTone(announcement.tone);
  const accent = accentForTone(announcement.tone);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <button
          type="button"
          onClick={() => void dismiss(false)}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss announcement"
        >
          <X className="h-4 w-4" />
        </button>
        {announcement.imageUrl ? (
          <img src={announcement.imageUrl} alt="" className="h-40 w-full object-cover" />
        ) : null}
        <div className="px-6 pt-6">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${accent}`}>
            <Icon className="h-4 w-4" />
            <span>{announcement.tone === "upgrade" ? "Upgrade" : announcement.tone === "offer" ? "Offer" : "Announcement"}</span>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">{announcement.title}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{announcement.message}</p>
        </div>

        {announcement.offerCode ? (
          <div className="mx-6 mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Offer code</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{announcement.offerCode}</p>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-5">
          <button
            type="button"
            onClick={() => void dismiss(false)}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            Later
          </button>
          {announcement.ctaUrl ? (
            <button
              type="button"
              onClick={() => void openAction()}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              {announcement.ctaLabel || "Open"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void dismiss(false)}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

