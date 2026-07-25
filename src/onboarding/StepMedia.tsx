/**
 * StepMedia — Interactive Media assets preview widget for onboarding.
 *
 * Reproduces the media library workflow: category browsing, asset selection,
 * custom text overlay, and fullscreen preview — all self-contained with mock data.
 */

import {
  ChevronRight
} from "lucide-react";

/* ── Mock Data ── */

/* ── Component ── */

export default function StepMedia({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {


  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Media Library</h1>
        <p>
          Organize custom text slides, prayer screens, and announcements across
          categories. Select an asset to preview and customize the overlay text.
        </p>
      </div>


      {/* ── Interactive Media Widget ── */}


      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack} title="Go back">
            Back
          </button>
          <button className="ob-btn ob-btn--primary" onClick={onNext} title="Continue">
            Continue
            <ChevronRight size={16} />
          </button>
        </div>

      </div>
    </div>
  );
}
