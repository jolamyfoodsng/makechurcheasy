"use client";

import { X } from "lucide-react";
import type { Announcement } from "../types";
import { LiveAnnouncementPreview } from "./LiveAnnouncementPreview";

export function AnnouncementPreviewModal({
  announcement,
  onClose,
}: {
  announcement: Announcement | null;
  onClose: () => void;
}) {
  if (!announcement) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Broadcast Client Simulator
            </h2>
            <p className="text-xs text-slate-400">
              Visualizing how &ldquo;{announcement.title}&rdquo; renders across MakeChurchEasy devices
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Simulator Area */}
        <div className="flex-1 overflow-hidden min-h-[440px]">
          <LiveAnnouncementPreview
            data={{
              title: announcement.title,
              message: announcement.message,
              tone: announcement.tone,
              surfaces: announcement.surfaces,
              ctaLabel: announcement.ctaLabel,
              ctaUrl: announcement.ctaUrl,
              imageUrl: announcement.imageUrl,
              offerCode: announcement.offerCode,
              offerDiscountPercent: announcement.offerDiscountPercent,
              offerDurationMonths: announcement.offerDurationMonths,
              offerApplicablePlans: announcement.offerApplicablePlans,
              offerApplicableBillingCycles: announcement.offerApplicableBillingCycles,
              expiresAt: announcement.expiresAt,
              tags: announcement.tags,
              format: announcement.format,
            }}
            initialSurface={announcement.surfaces.includes("desktop") ? "desktop" : "dashboard"}
          />
        </div>
      </div>
    </div>
  );
}
