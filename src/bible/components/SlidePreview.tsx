/**
 * SlidePreview.tsx — Preview panel
 *
 * Shows current slide text and reference in a 16:9 frame.
 */

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useBible } from "../bibleStore";
import type { BibleSlide, BibleTemplateType, BibleThemeSettings } from "../types";
import Icon from "../../components/Icon";

interface SlidePreviewProps {
  onClose?: () => void;
  slide?: BibleSlide | null;
  subtitle?: string;
  emptyLabel?: string;
  themeSettings?: BibleThemeSettings | null;
  templateType?: BibleTemplateType | null;
}

function resolvePreviewJustify(align: "left" | "center" | "right"): "flex-start" | "center" | "flex-end" {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  return "center";
}

export default function SlidePreview({
  onClose,
  slide = null,
  subtitle,
  emptyLabel = "Select a verse to preview",
  themeSettings = null,
  templateType = null,
}: SlidePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { currentSlide, activeTheme } = useBible();
  const settings = themeSettings ?? activeTheme?.settings;
  const displayMode = templateType ?? activeTheme?.templateType ?? "fullscreen";
  const previewSlide = slide ?? currentSlide;

  const previewScale = 0.18;
  const expandedPreviewScale = 0.56;

  useEffect(() => {
    if (!isExpanded) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  const bgStyle = useMemo(() => {
    if (!settings) return {};
    const background = settings.backgroundColorEnd
      ? `linear-gradient(${settings.bgGradientAngle ?? 135}deg, ${settings.backgroundColor}, ${settings.backgroundColorEnd})`
      : settings.backgroundColor;
    return {
      background: settings.backgroundImage ? undefined : background,
      backgroundImage: settings.backgroundImage ? `url(${settings.backgroundImage})` : undefined,
      backgroundSize: "cover",
      backgroundPosition: "center",
      opacity: settings.backgroundOpacity,
    };
  }, [settings]);

  const refStyle = useMemo(() => {
    if (!settings) return {};
    return {
      color: settings.refFontColor,
      fontWeight: settings.refFontWeight,
      textTransform: settings.refTextTransform,
      letterSpacing: `${settings.refLetterSpacing * previewScale}px`,
      opacity: settings.refOpacity,
    };
  }, [previewScale, settings]);

  const refRowStyle = useMemo(() => {
    if (!settings) return {};
    const align = settings.refTextAlign === "match" ? settings.textAlign : settings.refTextAlign;
    return {
      justifyContent: resolvePreviewJustify(align === "right" ? "right" : align === "center" ? "center" : "left"),
      marginTop: settings.refPosition === "top" ? 0 : `${Math.max(6, settings.refSpacing * previewScale * 0.45)}px`,
      marginBottom: settings.refPosition === "top" ? `${Math.max(6, settings.refSpacing * previewScale * 0.45)}px` : 0,
    } as React.CSSProperties;
  }, [previewScale, settings]);

  const refBadgeStyle = useMemo(() => {
    if (!settings?.referenceBackgroundEnabled) return {};
    return {
      backgroundColor: settings.referenceBackgroundStyle === "outline" ? "transparent" : settings.referenceBackgroundColor,
      border: settings.referenceBackgroundStyle === "outline" ? `1px solid ${settings.referenceBackgroundColor}` : "none",
      borderRadius: settings.referenceBackgroundStyle === "pill" ? "999px" : `${settings.referenceBackgroundRadius}px`,
      padding: "3px 8px",
    } as React.CSSProperties;
  }, [settings]);

  const displayText = previewSlide ? previewSlide.text.replace(/\[(\d+)\]\s*/g, "$1 ") : null;
  const modeLabel = displayMode === "lower-third" ? "lower-third" : "full";
  const previewSubtitle = subtitle ?? (previewSlide ? "Live output" : emptyLabel);

  const buildPreviewStyle = (scale: number) => {
    if (!settings) return {};
    const baseFontSize = settings.fontSize || 64;
    return {
      fontFamily: settings.fontFamily,
      fontSize: `${Math.max(5, baseFontSize * scale)}px`,
      fontWeight: settings.fontWeight,
      fontStyle: settings.fontStyle,
      color: settings.fontColor,
      lineHeight: settings.lineHeight,
      textAlign: settings.textAlign as React.CSSProperties["textAlign"],
      textShadow: settings.textShadow,
      textTransform: settings.textTransform,
      WebkitTextStroke: settings.textOutline
        ? `${Math.max(0.5, settings.textOutlineWidth * scale * 0.35)}px ${settings.textOutlineColor}`
        : undefined,
    };
  };

  const renderPreviewFrame = (scale: number, expanded = false) => (
    <div className={`preview-frame${expanded ? " preview-frame--expanded" : ""}`}>
      <div className="preview-frame-bg" style={bgStyle} />
      {settings?.fullscreenShadeEnabled && (
        <div
          className="preview-frame-shade"
          style={{
            backgroundColor: settings.fullscreenShadeColor,
            opacity: settings.fullscreenShadeOpacity,
          }}
        />
      )}

      {previewSlide ? (
        <div className={`preview-frame-text-wrap ${modeLabel}`}>
          <div className={`preview-frame-textbox ${modeLabel}`}>
            {settings?.refPosition === "top" && (
              <div className="preview-frame-ref-row" style={refRowStyle}>
                <span
                  className="preview-frame-reference"
                  style={{
                    ...refStyle,
                    ...refBadgeStyle,
                    fontSize: `${Math.max(3, settings?.refFontSize ? settings.refFontSize * scale : 0)}px`,
                  }}
                >
                  {previewSlide.reference}
                </span>
              </div>
            )}
            <div className="preview-frame-verse" style={buildPreviewStyle(scale)}>
              {displayText}
            </div>
            {settings?.refPosition !== "top" && (
              <div className="preview-frame-ref-row" style={refRowStyle}>
                <span
                  className="preview-frame-reference"
                  style={{
                    ...refStyle,
                    ...refBadgeStyle,
                    fontSize: `${Math.max(3, settings?.refFontSize ? settings.refFontSize * scale : 0)}px`,
                  }}
                >
                  {previewSlide.reference}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="preview-frame-empty">
          <Icon name="tv_off" size={20} />
          <span>{emptyLabel}</span>
        </div>
      )}
    </div>
  );

  const expandedModal = isExpanded && previewSlide && typeof document !== "undefined"
    ? createPortal(
      <div
        className="bible-modal-overlay bible-preview-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Enlarged Bible preview"
        onClick={() => setIsExpanded(false)}
      >
        <div className="bible-modal bible-preview-modal" onClick={(event) => event.stopPropagation()}>
          <div className="bible-modal-header bible-preview-modal-header">
            <Icon name="fullscreen" size={20} />
            <h3>Expanded Preview</h3>
            <button className="bible-modal-close" onClick={() => setIsExpanded(false)} title="Close preview">
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="bible-preview-modal-body">
            {renderPreviewFrame(expandedPreviewScale, true)}
            <div className="preview-slide-counter">
              Slide {previewSlide.index + 1} / {previewSlide.total}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

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

      <div
        className="live-preview-content live-preview-content--clickable"
        role={previewSlide ? "button" : undefined}
        tabIndex={previewSlide ? 0 : undefined}
        aria-label={previewSlide ? "Open enlarged Bible preview" : undefined}
        title={previewSlide ? "Click to enlarge preview" : undefined}
        onClick={previewSlide ? () => setIsExpanded(true) : undefined}
        onKeyDown={
          previewSlide
            ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIsExpanded(true);
              }
            }
            : undefined
        }
      >
        {/* Preview Frame */}
        {renderPreviewFrame(previewScale)}

        {/* Slide counter */}
        {previewSlide && (
          <div className="preview-slide-counter">
            Slide {previewSlide.index + 1} / {previewSlide.total}
          </div>
        )}
      </div>
      {expandedModal}
    </div>
  );
}
