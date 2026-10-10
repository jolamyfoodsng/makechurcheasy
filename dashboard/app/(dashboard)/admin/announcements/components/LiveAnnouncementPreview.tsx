"use client";

import { ImageIcon, Tag, X } from "lucide-react";
import { CustomHtmlFrame } from "@/components/announcement/CustomHtmlFrame";
import type { AnnouncementButton, AnnouncementLayout, AnnouncementTone } from "../types";

export interface PreviewData {
  title: string;
  message: string;
  layout: AnnouncementLayout;
  tone: AnnouncementTone;
  buttons: AnnouncementButton[];
  imageUrl?: string | null;
  bodyHtml?: string | null;
  offerCode?: string | null;
  offerDiscountPercent?: number | null;
  offerDurationMonths?: number | null;
  expiresAt?: string | null;
}

const TONE_LABEL: Record<AnnouncementTone, string> = {
  info: "Announcement",
  success: "Good news",
  warning: "Notice",
  offer: "Offer",
  upgrade: "Upgrade",
};

const TONE_COLOR: Record<AnnouncementTone, string> = {
  info: "#7aa9f7",
  success: "#3ecf8e",
  warning: "#e5a93d",
  offer: "#e5a93d",
  upgrade: "#7aa9f7",
};

function buttonClass(style: AnnouncementButton["style"]): string {
  if (style === "primary") return "bg-[#3b82f6] text-white hover:bg-[#2f74ec]";
  if (style === "secondary") return "bg-white/10 text-white hover:bg-white/15";
  return "bg-transparent text-[#9db8ee] hover:text-white underline-offset-2 hover:underline";
}

function PreviewButtons({ buttons }: { buttons: AnnouncementButton[] }) {
  const visible = buttons.filter((button) => button.label.trim());
  if (visible.length === 0) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {visible.map((button) => (
        <span
          key={button.id}
          className={`inline-flex h-9 items-center rounded-lg px-4 text-[13px] font-semibold ${buttonClass(button.style)}`}
        >
          {button.label}
        </span>
      ))}
    </div>
  );
}

export function LiveAnnouncementPreview({ data }: { data: PreviewData }) {
  const title = data.title.trim() || "Announcement title";
  const message = data.message.trim();
  const toneColor = TONE_COLOR[data.tone];

  let card: React.ReactNode;

  if (data.layout === "image_only") {
    card = data.imageUrl ? (
      <div className="relative w-full overflow-hidden rounded-2xl shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.imageUrl} alt="" className="block w-full" />
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
          <X className="h-4 w-4" />
        </span>
      </div>
    ) : (
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 text-[13px] text-white/50">
        <ImageIcon className="h-6 w-6" />
        Upload an image to preview it
      </div>
    );
  } else if (data.layout === "custom") {
    card = (
      <div className="relative w-full overflow-hidden rounded-2xl bg-white shadow-2xl">
        {data.bodyHtml?.trim() ? (
          <CustomHtmlFrame html={data.bodyHtml} />
        ) : (
          <div className="px-6 py-12 text-center text-[13px] text-gray-500">
            Your HTML will show up here as you type.
          </div>
        )}
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
          <X className="h-4 w-4" />
        </span>
      </div>
    );
  } else {
    const isPromo = data.layout === "promo";
    const percent = data.offerDiscountPercent && data.offerDiscountPercent > 0
      ? Math.min(95, Math.round(data.offerDiscountPercent))
      : null;
    card = (
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#1a1b1e] text-white shadow-2xl">
        {data.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.imageUrl} alt="" className="block max-h-44 w-full object-cover" />
        ) : null}
        <div className="p-6">
          <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: toneColor }}>
            {isPromo ? <Tag className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor }} />}
            {isPromo ? (percent ? `${percent}% off` : "Special offer") : TONE_LABEL[data.tone]}
          </div>
          <h3 className="mt-3 text-[18px] font-semibold leading-snug">{title}</h3>
          {message ? (
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-white/70">{message}</p>
          ) : (
            <p className="mt-2 text-[13px] text-white/35">Your message appears here.</p>
          )}
          {isPromo && data.offerCode ? (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
              <div>
                <div className="text-[11px] text-white/50">Promo code</div>
                <div className="font-mono text-[14px] font-semibold tracking-wide">{data.offerCode}</div>
              </div>
              <span className="text-[12px] text-white/50">Applied at checkout</span>
            </div>
          ) : null}
          <PreviewButtons buttons={data.buttons} />
          <div className="mt-4 text-[12px] text-white/40">Close</div>
        </div>
        <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/80">
          <X className="h-4 w-4" />
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[420px] w-full items-center justify-center rounded-xl border border-[var(--mce-admin-border)] p-6"
      style={{
        background:
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 10px, rgba(255,255,255,0) 10px 20px), #0b0b0c",
      }}
    >
      <div className="w-full max-w-[440px]">{card}</div>
    </div>
  );
}
