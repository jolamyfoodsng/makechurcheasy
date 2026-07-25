import { useEffect, useState, useRef } from "react";
import {
  dismissDesktopAnnouncement,
  fetchNextDesktopAnnouncement,
  subscribeToAnnouncementStream,
  type DesktopAnnouncement,
} from "../services/announcementService";

function toneLabel(tone: DesktopAnnouncement["tone"]) {
  if (tone === "upgrade") return "Upgrade";
  if (tone === "offer") return "Offer";
  if (tone === "warning") return "Notice";
  if (tone === "success") return "Update";
  return "Announcement";
}

export function AnnouncementModalHost() {
  const [announcement, setAnnouncement] = useState<DesktopAnnouncement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const next = await fetchNextDesktopAnnouncement().catch(() => null);
      if (!cancelled) setAnnouncement(next);
    };

    const timer = window.setTimeout(() => void refresh(), 1500);
    const handleOnline = () => void refresh();
    const handleFocus = () => void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);

    // Real-time SSE listener for instant delivery
    let eventSource: EventSource | null = null;
    try {
      eventSource = subscribeToAnnouncementStream(() => {
        if (!cancelled) refresh();
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
    const url = announcement.ctaUrl;
    await dismiss(true);
    if (url.startsWith("http")) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(`https://makechurcheasy.creatorstudioslabs.stream${url}`, "_blank", "noopener,noreferrer");
  }

  if (!announcement) return null;

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

