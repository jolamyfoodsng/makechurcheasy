/**
 * StepWorship — Interactive Worship lyrics preview widget for onboarding.
 *
 * Reproduces the worship projection workflow: song selection, lyric slide
 * stepping, theme switching — all self-contained with mock data.
 */

import { ChevronRight } from "lucide-react";

/* ── Component ── */

export default function StepWorship({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Worship Lyrics</h1>
        <p>
          Manage songs, track keys &amp; tempos, select projection backdrops,
          and display worship lyrics live — step by step with ease.
        </p>
      </div>

      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack}>
            Back
          </button>
          <button className="ob-btn ob-btn--primary" onClick={onNext}>
            Continue
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
