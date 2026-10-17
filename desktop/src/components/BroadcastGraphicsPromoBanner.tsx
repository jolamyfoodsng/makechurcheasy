import { ChevronRight, Layers, PlayCircle } from "./icons/NativeIcons";

interface BroadcastGraphicsPromoBannerProps {
  onOpenGraphics: () => void;
  onWatchTutorials: () => void;
}

/**
 * Companion to MultiPlatformStreamingBanner, shown beside it on the dashboard
 * to advertise the Broadcast Graphics page. Tiles are tiny live-style mockups.
 */
export function BroadcastGraphicsPromoBanner({
  onOpenGraphics,
  onWatchTutorials,
}: BroadcastGraphicsPromoBannerProps) {
  return (
    <section
      className="broadcast-promo-banner broadcast-promo-banner--half broadcast-promo-banner--graphics"
      aria-label="Broadcast Graphics Announcement"
    >
      <div className="promo-head">
        <div className="promo-head__icon">
          <Layers size={22} />
        </div>
        <div className="promo-head__copy">
          <div className="promo-head__title-row">
            <h2 className="promo-head__title">Broadcast Graphics</h2>
          </div>
          <p className="promo-head__tagline">Make your stream look like a studio.</p>
        </div>
      </div>

      <div className="promo-tiles" aria-label="Graphic types">
        <div className="promo-tile promo-tile--mock">
          <span className="promo-mock promo-mock--lt" aria-hidden="true">
            <i /><i />
          </span>
          <span>Lower thirds</span>
        </div>
        <div className="promo-tile promo-tile--mock">
          <span className="promo-mock promo-mock--verse" aria-hidden="true">John 3:16</span>
          <span>Scripture</span>
        </div>
        <div className="promo-tile promo-tile--mock">
          <span className="promo-mock promo-mock--count" aria-hidden="true">05:00</span>
          <span>Countdowns</span>
        </div>
        <div className="promo-tile promo-tile--mock">
          <span className="promo-mock promo-mock--quote" aria-hidden="true">&ldquo;</span>
          <span>Quote cards</span>
        </div>
      </div>

      <div className="promo-footer">
        <ol className="promo-steps" aria-label="How it works">
          <li><b>1</b> Pick a design</li>
          <ChevronRight size={14} aria-hidden="true" />
          <li><b>2</b> Edit text</li>
          <ChevronRight size={14} aria-hidden="true" />
          <li className="promo-steps__live"><b>3</b> Go live</li>
        </ol>
        <div className="promo-footer__actions">
          <button
            type="button"
            className="broadcast-promo-banner__btn-primary"
            onClick={onOpenGraphics}
            title="Open Broadcast Graphics"
          >
            <Layers size={15} />
            <span>Open Graphics</span>
          </button>
          <button
            type="button"
            className="promo-icon-btn"
            onClick={onWatchTutorials}
            title="Watch tutorials"
            aria-label="Watch tutorials"
          >
            <PlayCircle size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}

export default BroadcastGraphicsPromoBanner;
