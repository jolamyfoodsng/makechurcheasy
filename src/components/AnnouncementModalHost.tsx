import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Crown, Sparkles, X } from "lucide-react";
import {
  dismissDesktopAnnouncement,
  fetchNextDesktopAnnouncement,
  subscribeToAnnouncementStream,
  type DiscountBillingCycle,
  type DesktopAnnouncement,
} from "../services/announcementService";

const PREMIUM_FEATURES = [
  "Premium OBS overlays",
  "Worship and Bible presentation tools",
  "Cloud media storage",
  "More AI credits",
  "Priority app updates",
];

function toneLabel(tone: DesktopAnnouncement["tone"]) {
  if (tone === "upgrade") return "Upgrade";
  if (tone === "offer") return "Offer";
  if (tone === "warning") return "Notice";
  if (tone === "success") return "Update";
  return "Announcement";
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
    let cancelled = false;

    const refreshIfActive = async () => {
      const next = await fetchNextDesktopAnnouncement().catch(() => null);
      if (!cancelled) setAnnouncement(next);
    };

    const timer = window.setTimeout(() => void refreshIfActive(), 1500);
    const handleOnline = () => void refreshIfActive();
    const handleFocus = () => void refreshIfActive();
    const interval = window.setInterval(() => void refreshIfActive(), 30_000);

    // Real-time SSE listener for instant delivery
    let eventSource: EventSource | null = null;
    try {
      eventSource = subscribeToAnnouncementStream(() => {
        if (!cancelled) void refreshIfActive();
      });
    } catch {
      // SSE unavailable, polling fallback is sufficient
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      if (eventSource) eventSource.close();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  async function dismiss(clicked = false) {
    if (!announcement) return;
    const current = announcement;
    setAnnouncement(null);
    await dismissDesktopAnnouncement(current.deliveryId, clicked);
  }

  async function openAction() {
    if (!announcement?.ctaUrl) return;
    const url = withOfferCode(announcement.ctaUrl, announcement.offerCode);
    await dismiss(true);
    if (url.startsWith("http")) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(`https://makechurcheazy.com${url}`, "_blank", "noopener,noreferrer");
  }

  if (!announcement) return null;

  const discountPercent = clampDiscount(announcement.offerDiscountPercent);
  const showOfferLayout = Boolean(announcement.offerCode && discountPercent && ["offer", "upgrade"].includes(announcement.tone));

  if (showOfferLayout && discountPercent) {
    const offerCards = getOfferCards(announcement, discountPercent);
    const actionLabel = announcement.ctaLabel || `Upgrade with ${announcement.offerCode}`;

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
                <span className="desktop-announcement-promo__discount">{discountPercent}% OFF</span>
              </div>
              <div>
                <p>MakeChurchEasy Premium</p>
                <h2>Special price for your church</h2>
                <div className="desktop-announcement-promo__code">
                  <span>Offer code</span>
                  <strong>{announcement.offerCode}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="desktop-announcement-promo__content">
            <div>
              {countdown ? (
                <div className="desktop-announcement-countdown">
                  <Clock3 size={16} />
                  <span>{countdown}</span>
                </div>
              ) : null}

              <h2>{announcement.title}</h2>
              <p className="desktop-announcement-promo__message">{announcement.message}</p>

              <div className="desktop-announcement-feature-list">
                {PREMIUM_FEATURES.map((feature) => (
                  <div key={feature} className="desktop-announcement-feature">
                    <CheckCircle2 size={16} />
                    <span>{feature}</span>
                  </div>
                ))}
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
              {announcement.ctaUrl ? (
                <button type="button" className="desktop-announcement-promo__cta" onClick={() => void openAction()}>
                  <Sparkles size={16} />
                  {actionLabel}
                </button>
              ) : (
                <button type="button" className="desktop-announcement-promo__cta desktop-announcement-promo__cta--dark" onClick={() => void dismiss(false)}>
                  OK
                </button>
              )}
              <p>The discount code will be applied at checkout.</p>
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
          {announcement.ctaUrl ? (
            <button type="button" className="desktop-announcement-button desktop-announcement-button--primary" onClick={() => void openAction()}>
              {announcement.ctaLabel || "Open"}
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
