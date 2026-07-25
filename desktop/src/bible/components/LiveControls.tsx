/**
 * LiveControls.tsx — Footer Transport Bar: Simplified
 *
 * PREV/NEXT + CLEAR in pill layout.
 * Broadcast setup integrated. Keyboard: Space/Arrow=Next, Esc=Clear
 */

import { useEffect, useCallback } from "react";
import { useBible } from "../bibleStore";
import { bibleObsService } from "../bibleObsService";
import Icon from "../../components/Icon";

export default function LiveControls() {
  const {
    state, currentSlide, currentQueueItem, activeTheme,
    nextSlide, prevSlide,
  } = useBible();

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    switch (e.key) {
      case "ArrowRight": e.preventDefault(); nextSlide(); break;
      case "ArrowLeft": e.preventDefault(); prevSlide(); break;
      case " ": e.preventDefault(); nextSlide(); break;
      case "Escape": e.preventDefault(); bibleObsService.clearOverlay().catch(console.error); break;
    }
  }, [nextSlide, prevSlide]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSetupObs = async () => {
    try {
      const result = await bibleObsService.ensureBrowserSource(undefined, activeTheme?.templateType);
      alert(`Bible overlay created!\nScene: ${result.sceneName}\nItem ID: ${result.sceneItemId}\n\nThe overlay will update automatically.`);
    } catch (err) {
      alert(`Failed to setup OBS: ${err instanceof Error ? err.message : err}`);
    }
  };

  const hasSlides = currentQueueItem && currentQueueItem.slides.length > 0;
  const queueLen = state.queue.length;
  const slideInfo = currentSlide ? `${currentSlide.index + 1}/${currentSlide.total}` : "0/0";

  return (
    <div className="bible-footer">
      {/* Left: CLEAR + OBS */}
      <div className="footer-left">
        <button className="footer-action-btn clear" onClick={() => bibleObsService.clearOverlay().catch(console.error)} title="Clear output (Esc)">
          <Icon name="block" size={20} /> CLEAR
        </button>

        <button className="footer-action-btn blank" onClick={handleSetupObs} title="Setup OBS Browser Source">
          <Icon name="settings_input_antenna" size={20} /> OBS
        </button>
      </div>

      {/* Center: PREV / NEXT pill */}
      <div className="footer-center">
        <button className="footer-nav-btn" onClick={() => prevSlide()} disabled={!hasSlides} title="Previous slide">
          <Icon name="arrow_back" size={20} className="prev" /> PREV
        </button>
        <button className="footer-nav-btn" onClick={() => nextSlide()} disabled={!hasSlides} title="Next slide">
          NEXT <Icon name="arrow_forward" size={20} className="next" />
        </button>
      </div>

      {/* Right: Stats + Keyboard hints */}
      <div className="footer-right">
        <div className="footer-stats">
          <span className="footer-stat green">
            <Icon name="slideshow" size={20} /> {slideInfo}
          </span>
          <span className="footer-stat purple">
            <Icon name="queue" size={20} /> {queueLen}
          </span>
        </div>
        <div className="footer-kbd-hints">
          <span><kbd>Space</kbd> Next</span>
          <span><kbd>Esc</kbd> Clear</span>
        </div>
      </div>
    </div>
  );
}
