import { ChevronRight, HelpCircle, Music2, Radio } from "./icons/NativeIcons";

interface MultiPlatformStreamingBannerProps {
  onOpenBroadcast: () => void;
  onHowItWorks: () => void;
}

export function MultiPlatformStreamingBanner({
  onOpenBroadcast,
  onHowItWorks,
}: MultiPlatformStreamingBannerProps) {
  return (
    <section
      className="broadcast-promo-banner broadcast-promo-banner--half broadcast-promo-banner--stream"
      aria-label="Multi-Platform Streaming Announcement"
    >
      <div className="promo-head">
        <div className="promo-head__icon">
          <Radio size={22} />
          <span className="promo-head__live-dot" aria-hidden="true" />
        </div>
        <div className="promo-head__copy">
          <div className="promo-head__title-row">
            <h2 className="promo-head__title">Multi-Platform Streaming</h2>
            <span className="broadcast-promo-banner__badge">NEW</span>
          </div>
          <p className="promo-head__tagline">One click from OBS, live on every channel.</p>
        </div>
      </div>

      <div className="promo-tiles" aria-label="Supported platforms">
        <div className="promo-tile">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="#EF4444" />
            <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#FFFFFF" />
          </svg>
          <span>YouTube</span>
        </div>
        <div className="promo-tile">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="12" fill="#1877F2" />
            <path
              d="M15.5 12.5H13V19H10.5V12.5H9V10.2H10.5V8.8C10.5 7.1 11.5 6 13.5 6C14.3 6 15 6.1 15 6.1V8.2H14.1C13.2 8.2 13 8.7 13 9.4V10.2H15.4L15.5 12.5Z"
              fill="#FFFFFF"
            />
          </svg>
          <span>Facebook</span>
        </div>
        <div className="promo-tile">
          <Music2 size={20} className="broadcast-promo-banner__tiktok-icon" aria-hidden="true" />
          <span>TikTok</span>
        </div>
        <div className="promo-tile">
          <Radio size={20} className="broadcast-promo-banner__rtmp-icon" aria-hidden="true" />
          <span>Custom RTMP</span>
        </div>
      </div>

      <div className="promo-footer">
        <ol className="promo-steps" aria-label="How it works">
          <li><b>1</b> Choose profile</li>
          <ChevronRight size={14} aria-hidden="true" />
          <li><b>2</b> Sync OBS</li>
          <ChevronRight size={14} aria-hidden="true" />
          <li className="promo-steps__live"><b>3</b> Go live</li>
        </ol>
        <div className="promo-footer__actions">
          <button
            type="button"
            className="broadcast-promo-banner__btn-primary"
            onClick={onOpenBroadcast}
            title="Open Multi-Platform Streaming Broadcast"
          >
            <Radio size={15} />
            <span>Open Broadcast</span>
          </button>
          <button
            type="button"
            className="promo-icon-btn"
            onClick={onHowItWorks}
            title="How multi-platform streaming works"
            aria-label="How it works"
          >
            <HelpCircle size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}

export default MultiPlatformStreamingBanner;
