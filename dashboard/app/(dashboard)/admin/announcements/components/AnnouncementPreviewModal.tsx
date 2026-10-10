"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { Announcement } from "../types";
import { announcementButtons, detectLegacyLayout } from "../types";
import { LiveAnnouncementPreview } from "./LiveAnnouncementPreview";

export function AnnouncementPreviewModal({
  announcement,
  onClose,
}: {
  announcement: Announcement | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!announcement) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [announcement, onClose]);

  if (!announcement) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Announcement preview"
    >
      <div className="adm-card w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="adm-card__head">
          <div className="min-w-0">
            <div className="adm-card__title">Preview</div>
            <div className="truncate text-[12px] text-[var(--mce-admin-text-muted)]">{announcement.title}</div>
          </div>
          <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="Close preview">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <LiveAnnouncementPreview
            data={{
              title: announcement.title,
              message: announcement.message,
              layout: detectLegacyLayout(announcement),
              tone: announcement.tone,
              buttons: announcementButtons(announcement),
              imageUrl: announcement.imageUrl,
              bodyHtml: announcement.bodyHtml,
              offerCode: announcement.offerCode,
              offerDiscountPercent: announcement.offerDiscountPercent,
              offerDurationMonths: announcement.offerDurationMonths,
              expiresAt: announcement.expiresAt,
            }}
          />
        </div>
      </div>
    </div>
  );
}
