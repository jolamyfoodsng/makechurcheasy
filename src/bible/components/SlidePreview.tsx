/**
 * SlidePreview.tsx — Preview panel
 *
 * Shows current slide text and reference in a 16:9 frame.
 */

import { useMemo } from "react";
import { useBible } from "../bibleStore";
import type { BibleSlide } from "../types";
import Icon from "../../components/Icon";

interface SlidePreviewProps {
  onClose?: () => void;
  slide?: BibleSlide | null;
  subtitle?: string;
  emptyLabel?: string;
}

export default function SlidePreview({
  onClose,
  slide = null,
  subtitle,
  emptyLabel = "Select a verse to preview",
}: SlidePreviewProps) {
  const { currentSlide, activeTheme } = useBible();
  const settings = activeTheme?.settings;
  const displayMode = activeTheme?.templateType ?? "fullscreen";
  const previewSlide = slide ?? currentSlide;

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

  const displayText = previewSlide ? previewSlide.text.replace(/\[(\d+)\]\s*/g, "$1 ") : null;
  const modeLabel = displayMode === "lower-third" ? "lower-third" : "full";
  const previewSubtitle = subtitle ?? (previewSlide ? "Live output" : emptyLabel);

  return (
    <div className="live-preview-col">
      {/* Header */}
      <div className="live-preview-header">
        <div className="live-preview-header-info">
          <h3>PREVIEW</h3>
          <p>{previewSubtitle}</p>
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

          {previewSlide ? (
            <div className={`preview-frame-text-wrap ${modeLabel}`}>
              <div className={`preview-frame-textbox ${modeLabel}`}>
                <div className="preview-frame-verse" style={previewStyle}>
                  {displayText}
                </div>
                <div className="preview-frame-ref-row">
                  <span className="preview-frame-reference" style={refStyle}>
                    {previewSlide.reference}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="preview-frame-empty">
              <Icon name="tv_off" size={20} />
              <span>{emptyLabel}</span>
            </div>
          )}
        </div>

        {/* Slide counter */}
        {previewSlide && (
          <div className="preview-slide-counter">
            Slide {previewSlide.index + 1} / {previewSlide.total}
          </div>
        )}
      </div>
    </div>
  );
}
