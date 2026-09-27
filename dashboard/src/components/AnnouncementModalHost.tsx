"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Info, Sparkles, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";

type AnnouncementTone = "info" | "success" | "warning" | "offer" | "upgrade";
type DiscountBillingCycle = "monthly" | "yearly" | "lifetime";

interface Announcement {
  id: string;
  deliveryId: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  tags: string[];
  format?: "standard" | "image_only";
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  offerCode?: string | null;
  offerDiscountPercent?: number | null;
  offerDurationMonths?: number | null;
  offerApplicableBillingCycles?: DiscountBillingCycle[];
  expiresAt?: string | null;
}

const PREMIUM_FEATURES = [
  "Premium OBS overlays",
  "Worship and Bible presentation tools",
  "Cloud media storage",
  "More AI credits",
  "Priority app updates",
];

const INITIAL_REFRESH_DELAY_MS = 1200;
const FALLBACK_POLL_INTERVAL_MS = 5 * 60 * 1000;
const FOCUS_REFRESH_THROTTLE_MS = 60 * 1000;

function isPageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function iconForTone(tone: AnnouncementTone) {
  if (tone === "success") return CheckCircle2;
  if (tone === "warning") return AlertTriangle;
  if (tone === "offer") return Tag;
  if (tone === "upgrade") return Sparkles;
  return Info;
}

function accentForTone(tone: AnnouncementTone) {
  if (tone === "success") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (tone === "warning") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  if (tone === "offer") return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  if (tone === "upgrade") return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
}

function withOfferParams(
  url: string,
  offerCode?: string | null,
  cycle?: DiscountBillingCycle
): string {
  try {
    const isAbsolute = url.startsWith("http://") || url.startsWith("https://");
    const parsed = isAbsolute
      ? new URL(url)
      : new URL(url, "https://makechurcheasy.com");
    if (offerCode && !parsed.searchParams.has("promo") && !parsed.searchParams.has("code")) {
      parsed.searchParams.set("promo", offerCode);
    }
    if (
      cycle &&
      parsed.pathname.includes("/subscription/plans") &&
      !parsed.searchParams.has("billing")
    ) {
      parsed.searchParams.set("billing", cycle);
    }
    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return offerCode ? `${url}${separator}promo=${encodeURIComponent(offerCode)}` : url;
  }
}

function clampDiscount(value?: number | null): number | null {
  if (!value || !Number.isFinite(value)) return null;
  return Math.min(95, Math.max(1, Math.round(value)));
}

function offerDurationLabel(months?: number | null): string {
  if (!months || months <= 0) return "limited time";
  if (months === 1) return "1 month";
  return `${months} months`;
}

function formatCountdown(expiresAt?: string | null, now = Date.now()): string | null {
  if (!expiresAt) return null;
  const target = new Date(expiresAt).getTime();
  if (!Number.isFinite(target)) return null;

  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  if (days > 0) return `${days}d ${hours}h ${pad(minutes)}m`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${minutes}m ${pad(seconds)}s`;
}

function useAnnouncementCountdown(expiresAt?: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return formatCountdown(expiresAt, now);
}

function getOfferCards(announcement: Announcement, discountPercent: number) {
  const cycles = announcement.offerApplicableBillingCycles?.length
    ? announcement.offerApplicableBillingCycles
    : (["monthly", "yearly"] as DiscountBillingCycle[]);
  const duration = offerDurationLabel(announcement.offerDurationMonths);

  return [
    {
      cycle: "monthly" as DiscountBillingCycle,
      title: "Monthly Billing",
      meta: `Save ${discountPercent}%`,
      body: `Discount applies for ${duration}.`,
    },
    {
      cycle: "yearly" as DiscountBillingCycle,
      title: "Yearly Billing",
      meta: `Save ${discountPercent}%`,
      body: "Applies to annual plan checkout.",
    },
    {
      cycle: "lifetime" as DiscountBillingCycle,
      title: "Lifetime Access",
      meta: `Save ${discountPercent}%`,
      body: "One-time premium access.",
    },
  ].filter((card) => cycles.includes(card.cycle));
}

const DISMISS_STORAGE_KEY = "mce_dismissed_announcements_v1";

function isLocallyDismissed(id?: string, deliveryId?: string): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const record: Record<string, number> = JSON.parse(raw);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (id && record[id] && now - record[id] < oneDayMs) return true;
    if (deliveryId && record[deliveryId] && now - record[deliveryId] < oneDayMs) return true;
    return false;
  } catch {
    return false;
  }
}

function recordLocalDismissal(id?: string, deliveryId?: string): void {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    const record: Record<string, number> = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    if (id) record[id] = now;
    if (deliveryId) record[deliveryId] = now;
    for (const key of Object.keys(record)) {
      if (now - record[key] > 7 * 24 * 60 * 60 * 1000) delete record[key];
    }
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(record));
  } catch {}
}

export function AnnouncementModalHost() {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<DiscountBillingCycle | null>(null);
  const countdown = useAnnouncementCountdown(announcement?.expiresAt);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/user/announcements?surface=dashboard", { credentials: "include" });
      if (!res.ok) return;
      const body = await res.json();
      const next = body.announcement || null;
      if (next && isLocallyDismissed(next.id, next.deliveryId)) {
        return;
      }
      setAnnouncement(next);
    } catch (error) {
      console.error("[AnnouncementModalHost] Failed to fetch announcement:", error);
    }
  }, []);

  useEffect(() => {
    let lastRefreshAt = 0;
    const refreshIfVisible = () => {
      if (!isPageVisible()) return;
      lastRefreshAt = Date.now();
      void refresh();
    };
    const refreshIfStale = () => {
      if (Date.now() - lastRefreshAt < FOCUS_REFRESH_THROTTLE_MS) return;
      refreshIfVisible();
    };

    const timer = window.setTimeout(refreshIfVisible, INITIAL_REFRESH_DELAY_MS);
    const handleFocus = refreshIfStale;
    const handleVisibilityChange = () => {
      if (isPageVisible()) refreshIfStale();
    };
    const interval = window.setInterval(refreshIfVisible, FALLBACK_POLL_INTERVAL_MS);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  async function dismiss(clicked = false) {
    if (!announcement) return;
    const current = announcement;
    recordLocalDismissal(current.id, current.deliveryId);
    setAnnouncement(null);
    await fetch("/api/user/announcements", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId: current.deliveryId, clicked }),
    }).catch(() => {});
  }

  const isImageOnly = Boolean(
    announcement?.imageUrl &&
      (announcement.tags?.some((t) => t.toLowerCase().includes("image-only")) ||
        announcement.format === "image_only")
  );

  async function openAction(cycle?: DiscountBillingCycle) {
    const rawTarget = announcement?.ctaUrl || "/subscription/plans";
    const targetCycle =
      cycle || selectedCycle || announcement?.offerApplicableBillingCycles?.[0] || "monthly";
    const url = withOfferParams(rawTarget, announcement?.offerCode, targetCycle);
    await dismiss(true);
    if (url.startsWith("http") || isImageOnly) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(url);
  }

  if (!announcement) return null;

  if (isImageOnly && announcement.imageUrl) {
    return (
      <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-slate-950/75 backdrop-blur-md"
          onClick={() => void dismiss(false)}
        />
        <div className="relative z-10 max-w-2xl w-full flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200">
          {/* Close button X */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void dismiss(false);
            }}
            className="absolute -top-3 -right-3 sm:top-2 sm:right-2 z-20 rounded-full bg-slate-900/90 border border-white/20 p-2 text-white shadow-xl backdrop-blur transition hover:bg-slate-800 hover:scale-110"
            aria-label="Dismiss announcement"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Full Clickable Picture */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => void openAction()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void openAction();
              }
            }}
            className="cursor-pointer overflow-hidden rounded-2xl border border-white/10 shadow-2xl transition hover:opacity-95 active:scale-[0.99] focus:outline-none"
            title={announcement.ctaUrl ? `Open ${announcement.ctaUrl}` : "Announcement"}
          >
            <img
              src={announcement.imageUrl}
              alt={announcement.title || "Announcement"}
              className="block max-h-[82vh] w-auto max-w-full object-contain mx-auto rounded-2xl"
            />
          </div>
        </div>
      </div>
    );
  }

  const Icon = iconForTone(announcement.tone);
  const accent = accentForTone(announcement.tone);
  const discountPercent = clampDiscount(announcement.offerDiscountPercent);
  const showOfferLayout = Boolean(
    announcement.offerCode &&
    discountPercent &&
    ["offer", "upgrade"].includes(announcement.tone)
  );

  if (showOfferLayout && discountPercent) {
    const offerCards = getOfferCards(announcement, discountPercent);
    const activeCycle =
      selectedCycle && offerCards.some((c) => c.cycle === selectedCycle)
        ? selectedCycle
        : offerCards[0]?.cycle || "monthly";
    const actionLabel =
      announcement.ctaLabel ||
      (discountPercent ? `Claim ${discountPercent}% Discount` : "Upgrade Now");

    return (
      <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          onClick={() => void dismiss(false)}
        />
        <section
          className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => void dismiss(false)}
            className="absolute right-3.5 top-3.5 z-10 rounded-full border border-slate-200 bg-white p-1.5 text-slate-400 shadow-sm transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Dismiss announcement"
          >
            <X className="h-4 w-4" />
          </button>

          {announcement.imageUrl ? (
            <div className="h-40 w-full overflow-hidden border-b border-slate-100 bg-slate-50">
              <img
                src={announcement.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          <div className="space-y-4 p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-blue-700">
                <Tag className="h-3 w-3" />
                <span>{discountPercent}% OFF</span>
              </span>
              {countdown ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">
                  <Clock3 className="h-3.5 w-3.5 text-orange-500" />
                  <span>Ends in {countdown}</span>
                </span>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                {announcement.title}
              </h2>
              {announcement.message ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {announcement.message}
                </p>
              ) : null}
            </div>

            {announcement.offerCode ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Promo Code
                  </span>
                  <code className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-900">
                    {announcement.offerCode}
                  </code>
                </div>
                <span className="text-xs font-medium text-emerald-600">
                  ✓ Auto-applied at checkout
                </span>
              </div>
            ) : null}

            {offerCards.length > 0 ? (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Choose billing cycle
                </span>
                <div className="space-y-2">
                  {offerCards.map((card) => {
                    const isSelected = activeCycle === card.cycle;
                    return (
                      <button
                        type="button"
                        key={card.cycle}
                        onClick={() => setSelectedCycle(card.cycle)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
                            isSelected
                              ? "border-blue-600 bg-blue-600"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {isSelected ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {card.title}
                            </span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                              {card.meta}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">{card.body}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5 py-1">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 flex-none text-emerald-600" />
                <span>Instant unlock of all premium features</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 flex-none text-emerald-600" />
                <span>Cancel or switch plans anytime</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => void openAction(activeCycle)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]"
              >
                <Sparkles className="h-4 w-4" />
                <span>{actionLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => void dismiss(false)}
                className="w-full text-center text-xs font-medium text-slate-500 transition hover:text-slate-800 py-1"
              >
                Maybe later
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

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
            {announcement.offerDiscountPercent ? (
              <p className="mt-1 text-xs font-medium text-slate-500">
                {announcement.offerDiscountPercent}% off
                {announcement.offerDurationMonths ? ` for ${announcement.offerDurationMonths} month${announcement.offerDurationMonths === 1 ? "" : "s"}` : ""}
              </p>
            ) : null}
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
