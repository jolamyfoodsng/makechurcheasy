"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Gift,
  Info,
  Monitor,
  Sparkles,
  Globe,
  Link2,
  MousePointer,
  X,
} from "lucide-react";
import type { AnnouncementTone, PaidPlan, DiscountBillingCycle } from "../types";

interface PreviewData {
  title: string;
  message: string;
  tone: AnnouncementTone;
  surfaces: string[];
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  offerCode?: string | null;
  offerDiscountPercent?: number | null;
  offerDurationMonths?: number | null;
  offerApplicablePlans?: PaidPlan[];
  offerApplicableBillingCycles?: DiscountBillingCycle[];
  expiresAt?: string | null;
  tags?: string[] | string;
  format?: "standard" | "image_only";
}

export function LiveAnnouncementPreview({
  data,
  initialSurface = "desktop",
}: {
  data: PreviewData;
  initialSurface?: "desktop" | "dashboard";
}) {
  const [surface, setSurface] = useState<"desktop" | "dashboard">(initialSurface);

  const discountPercent =
    data.offerDiscountPercent && Number.isFinite(data.offerDiscountPercent) && data.offerDiscountPercent > 0
      ? Math.min(95, Math.max(1, Math.round(data.offerDiscountPercent)))
      : null;

  const showOffer = Boolean(
    data.offerCode && discountPercent && ["offer", "upgrade"].includes(data.tone)
  );

  const displayTitle = data.title.trim() || "Announcement title";
  const displayMessage =
    data.message.trim() ||
    "Write your broadcast message. This is how it will appear to users on their screens.";

  const isImageOnly = Boolean(
    data.imageUrl &&
      (data.format === "image_only" ||
        (Array.isArray(data.tags)
          ? data.tags.some((t) => t.toLowerCase().includes("image-only"))
          : typeof data.tags === "string" && data.tags.toLowerCase().includes("image-only")))
  );

  return (
    <div className="flex flex-col h-full bg-slate-950/60 rounded-2xl border border-slate-800/80 overflow-hidden">
      {/* Subtle Preview Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
        <span className="text-slate-400 font-medium flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Preview
        </span>

        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setSurface("desktop")}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              surface === "desktop" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <Monitor className="w-3 h-3" />
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setSurface("dashboard")}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              surface === "dashboard" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <Globe className="w-3 h-3" />
            Web
          </button>
        </div>
      </div>

      {/* Clean Modal Canvas */}
      <div className="flex-1 p-6 flex items-center justify-center bg-slate-950/40 min-h-[320px]">
        {isImageOnly ? (
          <div className="w-full max-w-md space-y-3">
            <div
              onClick={() => {
                if (data.ctaUrl) {
                  const dest = data.ctaUrl.startsWith("http")
                    ? data.ctaUrl
                    : `${typeof window !== "undefined" ? window.location.origin : ""}${data.ctaUrl.startsWith("/") ? "" : "/"}${data.ctaUrl}`;
                  if (typeof window !== "undefined") {
                    window.open(dest, "_blank", "noopener,noreferrer");
                  }
                }
              }}
              className="w-full rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl relative transform transition-all duration-200 hover:scale-[1.01] cursor-pointer group bg-slate-900"
              title={data.ctaUrl ? `Click to test link: ${data.ctaUrl}` : "Click anywhere to test link"}
            >
              <img
                src={data.imageUrl!}
                alt="Announcement Banner"
                className="w-full h-auto max-h-[360px] object-contain block"
              />

              {/* Top-right corner close simulation */}
              <div className="absolute top-3 right-3 z-20">
                <div className="h-7 w-7 rounded-full bg-black/60 border border-white/20 text-white/90 flex items-center justify-center shadow-lg backdrop-blur-md">
                  <X className="w-4 h-4" />
                </div>
              </div>

              {/* Click overlay indicator on hover */}
              <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

              {/* Bottom clickable hint */}
              <div className="absolute bottom-2 left-3 right-3 z-10 flex items-center justify-between px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 text-[10px] text-white/90 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="flex items-center gap-1 font-medium">
                  <MousePointer className="w-3 h-3 text-amber-300" />
                  Click to test link in browser
                </span>
                <span className="font-mono text-blue-300 truncate max-w-[150px]">
                  {data.ctaUrl || "No link"}
                </span>
              </div>
            </div>

            {/* Destination Pill */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs shadow-md">
                <Link2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-slate-400">Destination:</span>
                <span className="font-mono text-blue-300 font-medium truncate max-w-[220px]">
                  {data.ctaUrl || "No destination link set"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl text-slate-100 space-y-4">
            {/* Optional Image */}
            {data.imageUrl ? (
              <div className="h-32 w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                <img src={data.imageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            ) : null}

            {/* Tone & Offer Tag */}
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                {data.tone === "upgrade" && <Sparkles className="w-3 h-3 text-violet-400" />}
                {data.tone === "offer" && <Gift className="w-3 h-3 text-amber-400" />}
                {data.tone === "info" && <Info className="w-3 h-3 text-sky-400" />}
                {data.tone === "warning" && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                {data.tone === "success" && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                <span className="capitalize">{data.tone}</span>
              </span>

              {discountPercent ? (
                <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                  {discountPercent}% OFF
                </span>
              ) : null}
            </div>

            {/* Title & Message */}
            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-white tracking-tight leading-snug">
                {displayTitle}
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {displayMessage}
              </p>
            </div>

            {/* Offer Code Chip */}
            {data.offerCode ? (
              <div className="p-2.5 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-amber-400/90 tracking-wider">Coupon Code</span>
                  <div className="font-mono font-bold text-white text-sm">{data.offerCode}</div>
                </div>
                {data.offerDurationMonths ? (
                  <span className="text-[11px] text-slate-400">
                    {data.offerDurationMonths} mo validity
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* Action Row */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800/80">
              <button
                type="button"
                className="px-3 h-8 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200"
              >
                Later
              </button>
              <button
                type="button"
                className="px-3.5 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                {data.ctaLabel || "Got it"}
                {data.ctaUrl ? <ExternalLink className="w-3 h-3" /> : null}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
