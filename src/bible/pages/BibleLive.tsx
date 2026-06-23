/**
 * BibleLive.tsx — Full-screen Bible Controller
 *
 * Simplified view focused on presentation control:
 * - Large preview
 * - Big transport buttons
 * - Queue with slide thumbnails
 * - Keyboard-first design
 * - Back/Exit button and Escape to exit
 */

import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useBible } from "../bibleStore";
import SlidePreview from "../components/SlidePreview";
import LiveControls from "../components/LiveControls";
import QueuePanel from "../components/QueuePanel";
import Icon from "../../components/Icon";

export default function BibleLive() {
  const { currentSlide, currentQueueItem } = useBible();
  const navigate = useNavigate();

  const handleExit = useCallback(() => {
    navigate("/bible");
  }, [navigate]);

  // Escape to exit controller
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        handleExit();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleExit]);

  return (
    <div className="bible-live">
      <div className="bible-live-header">
        <button
          className="bible-live-back-btn"
          onClick={handleExit}
          title="Back to Control Room (Esc)"
        >
          <Icon name="arrow_back" size={20} style={{ verticalAlign: "middle" }} />
          {" "}Back
        </button>
        <h1>
          <Icon name="live_tv" size={24} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Controller
        </h1>
        <span
          className={`bible-live-status ${currentSlide ? "live" : "off"}`}
        >
          <Icon name={currentSlide ? "fiber_manual_record" : "radio_button_unchecked"} size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
          {currentSlide ? "LIVE" : "OFF"}
        </span>
      </div>

      <div className="bible-live-body">
        {/* Left: Large preview */}
        <div className="bible-live-preview-area">
          <SlidePreview />

          {/* Current slide text (large) */}
          {currentSlide && (
            <div className="bible-live-current-text">
              <p>
                {currentSlide.text.replace(/\[(\d+)\]\s*/g, "$1 ")}
              </p>
              <span className="bible-live-current-ref">
                {currentSlide.reference}
              </span>
            </div>
          )}

          {/* Next slide preview */}
          {currentQueueItem &&
            currentQueueItem.currentSlide <
              currentQueueItem.slides.length - 1 && (
              <div className="bible-live-next">
                <span className="bible-live-next-label">Next:</span>
                <span className="bible-live-next-text">
                  {currentQueueItem.slides[
                    currentQueueItem.currentSlide + 1
                  ].text
                    .replace(/\[(\d+)\]\s*/g, "$1 ")
                    .slice(0, 80)}
                  ...
                </span>
              </div>
            )}

          <LiveControls />
        </div>

        {/* Right: Queue */}
        <div className="bible-live-queue-area">
          <QueuePanel />
        </div>
      </div>
    </div>
  );
}
