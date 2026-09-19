import { useEffect, useState } from "react";
import { Check, Clock, Crown, Sparkles, X } from "lucide-react";
import {
  clearCachedDesktopAnnouncement,
  getCachedDesktopAnnouncement,
  subscribeToDesktopAnnouncement,
} from "../services/desktopConfig";
import {
  dismissDesktopAnnouncement,
  type DiscountBillingCycle,
  type DesktopAnnouncement,
} from "../services/announcementService";

function toneLabel(tone: DesktopAnnouncement["tone"]) {
  if (tone === "upgrade") return "Upgrade";
  if (tone === "offer") return "Offer";
  if (tone === "warning") return "Notice";
  if (tone === "success") return "Update";
  return "Announcement";
}

export function withOfferCode(url: string, offerCode?: string | null): string {
  if (!url) return url;
  if (!offerCode) return url;
  try {
    const isAbsolute = url.startsWith("http://") || url.startsWith("https://");
    const parsed = isAbsolute
      ? new URL(url)
      : new URL(url, "https://makechurcheasy.com");
    if (!parsed.searchParams.has("promo") && !parsed.searchParams.has("code")) {
      parsed.searchParams.set("promo", offerCode);
    }
    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}promo=${encodeURIComponent(offerCode)}`;
  }
}

export function resolveActionUrl(announcement: DesktopAnnouncement | null): string {
  if (!announcement) return "";
  if (announcement.ctaUrl) {
    return withOfferCode(announcement.ctaUrl, announcement.offerCode);
  }
  const code = announcement.offerCode || "";
  const plan = announcement.offerApplicablePlans?.[0] || "growth";
  const cycle = announcement.offerApplicableBillingCycles?.[0] || "monthly";
  const params = new URLSearchParams();
  if (code) params.set("promo", code);
  params.set("plan", plan);
  params.set("billing", cycle);
  return `https://makechurcheasy.com/subscription/plans?${params.toString()}`;
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

function getOfferCards(announcement: DesktopAnnouncement, discountPercent: number) {
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
  const [announcement, setAnnouncement] = useState<DesktopAnnouncement | null>(null);
  const countdown = useAnnouncementCountdown(announcement?.expiresAt);

  useEffect(() => {
    setAnnouncement(getCachedDesktopAnnouncement());
    return subscribeToDesktopAnnouncement(setAnnouncement);
  }, []);

  async function dismiss(clicked = false) {
    if (!announcement) return;
    const current = announcement;
    setAnnouncement(null);
    clearCachedDesktopAnnouncement();
    await dismissDesktopAnnouncement(current.deliveryId, clicked);
  }

  async function openAction() {
    const url = resolveActionUrl(announcement);
    if (!url) return;
    await dismiss(true);
    if (url.startsWith("http")) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(`https://makechurcheasy.com${url}`, "_blank", "noopener,noreferrer");
  }

  if (!announcement) return null;

  const actionUrl = resolveActionUrl(announcement);

  const isImageOnly = Boolean(
    announcement.imageUrl &&
      (announcement.tags?.some((t) => t.toLowerCase().includes("image-only")) ||
        announcement.format === "image_only")
  );

  if (isImageOnly && announcement.imageUrl) {
    return (
      <div className="desktop-announcement-overlay desktop-announcement-overlay--image-only">
        <div className="desktop-announcement-backdrop" onClick={() => void dismiss(false)} />
        <div className="desktop-announcement-image-card">
          <button
            type="button"
            className="desktop-announcement-image-close"
            onClick={(e) => {
              e.stopPropagation();
              void dismiss(false);
            }}
            aria-label="Dismiss announcement"
          >
            <X size={18} />
          </button>
          <div
            role="button"
            tabIndex={0}
            className="desktop-announcement-image-wrapper"
            onClick={() => void openAction()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void openAction();
              }
            }}
            title={actionUrl ? `Open ${actionUrl}` : "Announcement"}
          >
            <img
              src={announcement.imageUrl}
              alt={announcement.title || "Announcement"}
              className="desktop-announcement-image-only"
            />
          </div>
        </div>
      </div>
    );
  }

  const discountPercent = clampDiscount(announcement.offerDiscountPercent);
  const hasDiscountSignal = Boolean(
    discountPercent ||
    announcement.offerCode ||
    announcement.tags?.some((t) => t.toLowerCase().includes("discount") || t.toLowerCase().includes("offer")) ||
    ["offer", "upgrade"].includes(announcement.tone)
  );
  const showOfferLayout = hasDiscountSignal && !isImageOnly;

  if (showOfferLayout) {
    const effectivePercent = discountPercent || 50;
    const offerCards = getOfferCards(announcement, effectivePercent);
    const actionLabel = announcement.ctaLabel || (announcement.offerCode ? `Upgrade with ${announcement.offerCode}` : (discountPercent ? `Claim ${discountPercent}% Discount` : "Upgrade Now"));

    return (
      <div className="desktop-announcement-overlay desktop-announcement-overlay--promo">
        <div className="desktop-announcement-backdrop desktop-announcement-backdrop--promo" onClick={() => void dismiss(false)} />
        <section className="desktop-announcement-promo">
          <button
            type="button"
            className="desktop-announcement-close"
            onClick={() => void dismiss(false)}
            aria-label="Dismiss announcement"
          >
            <X size={16} />
          </button>

          <div className="desktop-announcement-promo__visual">
            {announcement.imageUrl ? (
              <img className="desktop-announcement-promo__image" src={announcement.imageUrl} alt="" />
            ) : (
              <div className="desktop-announcement-promo__fallback" />
            )}
            <div className="desktop-announcement-promo__shade" />
            <div className="desktop-announcement-promo__visual-content">
              <div className="desktop-announcement-promo__topline">
                <span className="desktop-announcement-promo__badge">
                  <Crown size={16} />
                  Premium Offer
                </span>
                {discountPercent ? (
                  <span className="desktop-announcement-promo__discount">{discountPercent}% OFF</span>
                ) : (
                  <span className="desktop-announcement-promo__discount">SPECIAL OFFER</span>
                )}
              </div>
              <div>
                <p className="desktop-announcement-promo__kicker">Limited time discount</p>
                <h2 className="desktop-announcement-promo__title">{announcement.title}</h2>
              </div>

              <div className="desktop-announcement-promo__meta">
                <span className="desktop-announcement-promo__meta-item">
                  <Check size={14} />
                  Instant unlock
                </span>
                <span className="desktop-announcement-promo__meta-item">
                  <Clock size={14} />
                  {countdown ? `Ends in ${countdown}` : "Available now"}
                </span>
              </div>
            </div>
          </div>

          <div className="desktop-announcement-promo__content">
            <div className="desktop-announcement-promo__copy">
              <p>{announcement.message}</p>
            </div>

            <div className="desktop-announcement-promo__box">
              <div className="desktop-announcement-promo__box-head">
                <span>Select a plan to apply discount</span>
                {announcement.offerCode ? (
                  <code>PROMO: {announcement.offerCode}</code>
                ) : (
                  <code>SPECIAL DISCOUNT</code>
                )}
              </div>

              <div className="desktop-announcement-offer-grid">
                {offerCards.map((card, index) => (
                  <div
                    key={card.cycle}
                    className={`desktop-announcement-offer-card${index === 0 ? " desktop-announcement-offer-card--selected" : ""}`}
                  >
                    <div className="desktop-announcement-offer-card__head">
                      <div>
                        <strong>{card.title}</strong>
                        <span>{card.meta}</span>
                      </div>
                      <i aria-hidden="true" />
                    </div>
                    <p>{card.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="desktop-announcement-promo__actions">
              {actionUrl ? (
                <button type="button" className="desktop-announcement-promo__cta" onClick={() => void openAction()}>
                  <Sparkles size={16} />
                  {actionLabel}
                </button>
              ) : (
                <button type="button" className="desktop-announcement-promo__cta desktop-announcement-promo__cta--dark" onClick={() => void dismiss(false)}>
                  OK
                </button>
              )}
              {announcement.offerCode ? (
                <p>The discount code will be applied at checkout.</p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="desktop-announcement-overlay">
      <div className="desktop-announcement-backdrop" onClick={() => void dismiss(false)} />
      <section className={`desktop-announcement-modal desktop-announcement-modal--${announcement.tone}`}>
        {announcement.imageUrl ? (
          <img className="desktop-announcement-image" src={announcement.imageUrl} alt="" />
        ) : null}
        <div className="desktop-announcement-body">
          <div className="desktop-announcement-pill">{toneLabel(announcement.tone)}</div>
          <h2>{announcement.title}</h2>
          <p>{announcement.message}</p>
          {announcement.offerCode ? (
            <div className="desktop-announcement-offer">
              <span>Offer code</span>
              <strong>{announcement.offerCode}</strong>
              {announcement.offerDiscountPercent ? (
                <small>
                  {announcement.offerDiscountPercent}% off
                  {announcement.offerDurationMonths ? ` for ${announcement.offerDurationMonths} month${announcement.offerDurationMonths === 1 ? "" : "s"}` : ""}
                </small>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="desktop-announcement-actions">
          <button type="button" className="desktop-announcement-button" onClick={() => void dismiss(false)}>
            Later
          </button>
          {actionUrl ? (
            <button type="button" className="desktop-announcement-button desktop-announcement-button--primary" onClick={() => void openAction()}>
              {announcement.ctaLabel || (announcement.offerCode ? "Claim Offer" : "Open")}
            </button>
          ) : (
            <button type="button" className="desktop-announcement-button desktop-announcement-button--primary" onClick={() => void dismiss(false)}>
              OK
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
