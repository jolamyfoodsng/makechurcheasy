"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Crown, Gift, Info, Sparkles, X } from "lucide-react";
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

function withOfferCode(url: string, offerCode?: string | null): string {
  if (!offerCode || !url.includes("/subscription/plans")) return url;
  try {
    const parsed = url.startsWith("http")
      ? new URL(url)
      : new URL(url, "https://makechurcheazy.com");
    if (!parsed.searchParams.has("promo") && !parsed.searchParams.has("code")) {
      parsed.searchParams.set("promo", offerCode);
    }
    return url.startsWith("http") ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}promo=${encodeURIComponent(offerCode)}`;
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

  if (days > 0) return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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
      title: "Premium Monthly",
      meta: `Save ${discountPercent}%`,
      body: `Discount applies for ${duration}.`,
    },
    {
      cycle: "yearly" as DiscountBillingCycle,
      title: "Premium Yearly",
      meta: `Save ${discountPercent}%`,
      body: "Use the same code at yearly checkout.",
    },
    {
      cycle: "lifetime" as DiscountBillingCycle,
      title: "Lifetime Access",
      meta: `Save ${discountPercent}%`,
      body: "One-time premium access when available.",
    },
  ].filter((card) => cycles.includes(card.cycle));
}

export function AnnouncementModalHost() {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const countdown = useAnnouncementCountdown(announcement?.expiresAt);

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

  async function openAction() {
    if (!announcement?.ctaUrl) return;
    const url = withOfferCode(announcement.ctaUrl, announcement.offerCode);
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
  const showOfferLayout = Boolean(announcement.offerCode && discountPercent && ["offer", "upgrade"].includes(announcement.tone));

  if (showOfferLayout && discountPercent) {
    const offerCards = getOfferCards(announcement, discountPercent);
    const actionLabel = announcement.ctaLabel || `Upgrade with ${announcement.offerCode}`;

    return (
      <div className="fixed inset-0 z-[55] flex items-center justify-center overflow-y-auto p-3 sm:p-5">
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-md" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(124,58,237,0.64),transparent_34%),radial-gradient(circle_at_80%_75%,rgba(249,115,22,0.55),transparent_32%),linear-gradient(135deg,rgba(29,78,216,0.74),rgba(15,23,42,0.82))]" />
        <section className="relative my-auto grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/40 bg-white p-2 text-slate-950 shadow-[0_30px_110px_rgba(15,23,42,0.42)] lg:grid-cols-[0.9fr_1.1fr]">
          <button
            type="button"
            onClick={() => void dismiss(false)}
            className="absolute right-4 top-4 z-10 rounded-full bg-white/80 p-2 text-slate-500 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-white hover:text-slate-900"
            aria-label="Dismiss announcement"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative min-h-[260px] overflow-hidden rounded-[22px] bg-slate-950 text-white lg:min-h-[560px]">
            {announcement.imageUrl ? (
              <img src={announcement.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(145deg,#0f172a_0%,#1d4ed8_52%,#7c3aed_100%)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/78 via-slate-950/20 to-slate-950/8" />
            <div className="relative flex h-full min-h-[260px] flex-col justify-between p-6 sm:p-8 lg:min-h-[560px]">
              <div className="flex items-center justify-between gap-3 pr-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/24 bg-white/16 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur">
                  <Crown className="h-4 w-4" />
                  Premium Offer
                </div>
                <div className="rounded-full bg-orange-500 px-3 py-1.5 text-sm font-black text-white shadow-lg">
                  {discountPercent}% OFF
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-white/78">MakeChurchEasy Premium</p>
                <h2 className="mt-3 max-w-sm text-4xl font-black leading-[0.98] tracking-normal text-white sm:text-5xl">
                  Special price for your church
                </h2>
                <div className="mt-7 inline-flex flex-col rounded-2xl border border-white/20 bg-white/14 px-4 py-3 backdrop-blur">
                  <span className="text-xs font-bold uppercase tracking-wide text-white/70">Offer code</span>
                  <strong className="mt-1 text-2xl font-black tracking-normal text-white">{announcement.offerCode}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-[520px] flex-col justify-between px-5 py-7 sm:px-8 lg:px-10">
            <div>
              {countdown ? (
                <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 shadow-sm">
                  <Clock3 className="h-4 w-4 text-orange-500" />
                  <span>{countdown}</span>
                </div>
              ) : null}

              <h2 className="mt-6 max-w-xl text-3xl font-black leading-tight tracking-normal text-slate-950 sm:text-4xl">
                {announcement.title}
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-600">{announcement.message}</p>

              <div className="mt-6 grid gap-2">
                {PREMIUM_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-center gap-3 text-sm font-medium text-slate-800">
                    <CheckCircle2 className="h-4 w-4 flex-none text-emerald-500" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {offerCards.map((card, index) => (
                  <div
                    key={card.cycle}
                    className={`rounded-2xl border p-4 ${
                      index === 0
                        ? "border-orange-500 bg-orange-50 shadow-[0_12px_28px_rgba(249,115,22,0.16)]"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">{card.title}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-orange-600">{card.meta}</p>
                      </div>
                      <span
                        className={`mt-1 h-4 w-4 rounded-full border ${
                          index === 0 ? "border-orange-500 bg-orange-500 ring-4 ring-white" : "border-slate-300 bg-white"
                        }`}
                      />
                    </div>
                    <p className="mt-3 text-sm leading-5 text-slate-600">{card.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 space-y-3">
              {announcement.ctaUrl ? (
                <button
                  type="button"
                  onClick={() => void openAction()}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 text-sm font-black uppercase tracking-normal text-white shadow-[0_16px_34px_rgba(249,115,22,0.28)] transition hover:bg-orange-600"
                >
                  <Sparkles className="h-4 w-4" />
                  {actionLabel}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void dismiss(false)}
                  className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-black uppercase tracking-normal text-white transition hover:bg-slate-800"
                >
                  OK
                </button>
              )}
              <p className="text-center text-xs text-slate-500">The discount code will be applied at checkout.</p>
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
