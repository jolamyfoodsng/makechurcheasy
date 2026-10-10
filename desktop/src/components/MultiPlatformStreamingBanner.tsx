import { ArrowRight, HelpCircle, Music2, Radio, RefreshCw, User } from "lucide-react";

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
      className="broadcast-promo-banner"
      aria-label="Multi-Platform Streaming Announcement"
    >
      {/* ── Left Side (approx 60%): Icon, Copy, Platforms ── */}
      <div className="broadcast-promo-banner__left">
        <div className="broadcast-promo-banner__icon-box">
          <Radio size={30} className="broadcast-promo-banner__main-icon" />
        </div>

        <div className="broadcast-promo-banner__content">
          <div className="broadcast-promo-banner__title-row">
            <span className="broadcast-promo-banner__badge">NEW</span>
            <h2 className="broadcast-promo-banner__title">Multi-Platform Streaming</h2>
          </div>

          <p className="broadcast-promo-banner__tagline">
            Share your church videos across multiple platforms from OBS.
          </p>

          <p className="broadcast-promo-banner__desc">
            Create a profile for your church, such as Pasco Church, and add its YouTube, Facebook,
            TikTok, or Custom RTMP channels. Load the profile in OBS to stream to your selected
            channels at once, without installing extra plugins or setting up each platform
            separately. Add, remove, or switch channels whenever you need.
          </p>

          <div className="broadcast-promo-banner__platforms">
            <div className="broadcast-promo-banner__platform-tag">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect width="24" height="24" rx="6" fill="#EF4444" />
                <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#FFFFFF" />
              </svg>
              <span>YouTube</span>
            </div>

            <div className="broadcast-promo-banner__platform-tag">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="12" fill="#1877F2" />
                <path
                  d="M15.5 12.5H13V19H10.5V12.5H9V10.2H10.5V8.8C10.5 7.1 11.5 6 13.5 6C14.3 6 15 6.1 15 6.1V8.2H14.1C13.2 8.2 13 8.7 13 9.4V10.2H15.4L15.5 12.5Z"
                  fill="#FFFFFF"
                />
              </svg>
              <span>Facebook</span>
            </div>

            <div className="broadcast-promo-banner__platform-tag">
              <Music2 size={17} className="broadcast-promo-banner__tiktok-icon" aria-hidden="true" />
              <span>TikTok</span>
            </div>

            <div className="broadcast-promo-banner__platform-tag">
              <Radio size={17} className="broadcast-promo-banner__rtmp-icon" aria-hidden="true" />
              <span>Custom RTMP</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Side (approx 40%): 3-Step Workflow & CTAs ── */}
      <div className="broadcast-promo-banner__right">
        <div className="broadcast-promo-banner__workflow" aria-label="Streaming Workflow Steps">
          {/* Step 1: Choose Profile */}
          <div className="broadcast-promo-banner__step">
            <div className="broadcast-promo-banner__step-circle broadcast-promo-banner__step-circle--indigo">
              <User size={19} />
            </div>
            <span className="broadcast-promo-banner__step-label">
              Choose<br />Profile
            </span>
          </div>

          <ArrowRight size={17} className="broadcast-promo-banner__arrow" aria-hidden="true" />

          {/* Step 2: Sync with OBS */}
          <div className="broadcast-promo-banner__step">
            <div className="broadcast-promo-banner__step-circle broadcast-promo-banner__step-circle--indigo">
              <RefreshCw size={18} />
            </div>
            <span className="broadcast-promo-banner__step-label">
              Sync with<br />OBS
            </span>
          </div>

          <ArrowRight size={17} className="broadcast-promo-banner__arrow" aria-hidden="true" />

          {/* Step 3: Go Live */}
          <div className="broadcast-promo-banner__step">
            <div className="broadcast-promo-banner__step-circle broadcast-promo-banner__step-circle--green">
              <Radio size={19} />
            </div>
            <span className="broadcast-promo-banner__step-label">
              Go Live
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="broadcast-promo-banner__actions">
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
            className="broadcast-promo-banner__btn-secondary"
            onClick={onHowItWorks}
            title="Learn how multi-platform streaming works"
          >
            <HelpCircle size={15} />
            <span>How it works</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export default MultiPlatformStreamingBanner;
