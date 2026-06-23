/**
 * SlidePreview.tsx — Preview panel
 *
 * Shows current slide text and reference in a 16:9 frame.
 */

import { useMemo } from "react";
import { useBible } from "../bibleStore";
import Icon from "../../components/Icon";

interface SlidePreviewProps {
  onClose?: () => void;
}

export default function SlidePreview({ onClose }: SlidePreviewProps) {
  const { currentSlide, activeTheme } = useBible();
  const settings = activeTheme?.settings;
  const displayMode = activeTheme?.templateType ?? "fullscreen";

  const previewScale = 0.28;

  const previewStyle = useMemo(() => {
    if (!settings) return {};
    return {
      fontFamily: settings.fontFamily,
      fontSize: `5px`,
      fontWeight: settings.fontWeight,
      color: settings.fontColor,
      lineHeight: settings.lineHeight,
      textAlign: settings.textAlign as React.CSSProperties["textAlign"],
      textShadow: settings.textShadow,
    };
  }, [settings]);

  const bgStyle = useMemo(() => {
    if (!settings) return {};
    return {
      backgroundColor: settings.backgroundColor,
      backgroundImage: settings.backgroundImage ? `url(${settings.backgroundImage})` : undefined,
      backgroundSize: "cover",
      backgroundPosition: "center",
      opacity: settings.backgroundOpacity,
    };
  }, [settings]);

  const refStyle = useMemo(() => {
    if (!settings) return {};
    return {
      fontSize: `${Math.max(3, settings.refFontSize * previewScale)}px`,
      color: settings.refFontColor,
      fontWeight: settings.refFontWeight,
    };
  }, [settings]);

  const displayText = currentSlide ? currentSlide.text.replace(/\[(\d+)\]\s*/g, "$1 ") : null;
  const modeLabel = displayMode === "lower-third" ? "lower-third" : "full";

  return (
    <div className="live-preview-col">
      {/* Header */}
      <div className="live-preview-header">
        <div className="live-preview-header-info">
          <h3>PREVIEW</h3>
        </div>
        {onClose && (
          <button className="live-preview-close" onClick={onClose} title="Close preview">
            <Icon name="close" size={20} />
          </button>
        )}
      </div>

      <div className="live-preview-content">
        {/* Preview Frame */}
        <div className="preview-frame">
          <div className="preview-frame-bg" style={bgStyle} />

          {currentSlide ? (
            <div className={`preview-frame-text-wrap ${modeLabel}`}>
              <div className={`preview-frame-textbox ${modeLabel}`}>
                <div className="preview-frame-verse" style={previewStyle}>
                  {displayText}
                </div>
                <div className="preview-frame-ref-row">
                  <span className="preview-frame-reference" style={refStyle}>
                    {currentSlide.reference}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="preview-frame-empty">
              <Icon name="tv_off" size={20} />
              <span>No verse selected</span>
            </div>
          )}
        </div>

        {/* Slide counter */}
        {currentSlide && (
          <div className="preview-slide-counter">
            Slide {currentSlide.index + 1} / {currentSlide.total}
          </div>
        )}
      </div>
    </div>
  );
}
