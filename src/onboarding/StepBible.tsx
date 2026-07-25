/**
 * StepBible — Interactive Bible preview widget for the onboarding wizard.
 *
 * Reproduces the key UX of the Bible presentation engine: version switching,
 * verse selection, and live overlay preview — all self-contained with mock data.
 */

import {
  ChevronRight
} from "lucide-react";

/* ── Component ── */

export default function StepBible({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {

  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Bible Presentation</h1>
        <p>
          Display scriptures beautifully in your services. Switch versions, browse
          verses, and preview the live overlay — all in real time.
        </p>
      </div>

      {/* ── Interactive Bible Widget ── */}

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
