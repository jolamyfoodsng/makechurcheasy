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
    const backgroundPattern = settings.backgroundPattern ? `url("${settings.backgroundPattern}")` : undefined;
    const background = settings.backgroundColorEnd
      ? `linear-gradient(${settings.bgGradientAngle ?? 135}deg, ${settings.backgroundColor}, ${settings.backgroundColorEnd})`
      : settings.backgroundColor;
    return {
      background: settings.backgroundImage || settings.backgroundPattern || settings.backgroundVideo ? undefined : background,
      backgroundImage: settings.backgroundImage
        ? `url("${settings.backgroundImage}")`
        : (settings.backgroundPattern ? backgroundPattern : undefined),
      backgroundSize: "cover",
      backgroundPosition: "center",
      opacity: settings.backgroundOpacity,
    };
  }, [settings]);

  const refStyle = useMemo(() => {
    if (!settings) return {};
    const FAINT_REF_HEXES = new Set([
      "#AAAAAA", "#AEB9D1", "#C9D2E5", "#CCCCCC", "#E0E0E0", "#888888", "#CBD5E1", "#94A3B8", "#64748B"
    ]);
    const rawRefColor = (settings.refFontColor || "").trim().toUpperCase();
    const verseColor = settings.fontColor || "#FFFFFF";
    const effectiveRefColor = (!rawRefColor || FAINT_REF_HEXES.has(rawRefColor))
      ? verseColor
      : settings.refFontColor;
    const verseWeight = settings.fontWeight === "black" ? 900 : settings.fontWeight === "extrabold" ? 800 : settings.fontWeight === "bold" ? 700 : (settings.fontWeight ? 400 : 900);
    const refWeight = settings.refFontWeight === "black" ? 900 : settings.refFontWeight === "extrabold" ? 800 : settings.refFontWeight === "bold" ? 700 : (settings.refFontWeight && settings.refFontWeight !== "normal" ? 700 : verseWeight);
    const outlineEnabled = settings.textOutline !== false;
    const outlineWidth = outlineEnabled ? (settings.textOutlineWidth ?? 4) : 0;
    const outlineColor = settings.textOutlineColor || "#000000";
    const textShadow = settings.textShadow || "4px 5px 2px rgba(0, 0, 0, 0.95)";
    return {
      color: effectiveRefColor,
      fontWeight: refWeight,
      textTransform: settings.refTextTransform,
      letterSpacing: `${(settings.refLetterSpacing ?? 0) * previewScale}px`,
      opacity: settings.refOpacity,
      textShadow,
      paintOrder: "stroke fill",
      WebkitTextStroke: outlineWidth > 0
        ? `${Math.max(0.75, outlineWidth * previewScale * 1.5)}px ${outlineColor}`
        : undefined,
    };
  }, [previewScale, settings]);

  const resolveRefRowStyle = (scale: number): React.CSSProperties => {
    if (!settings) return {};
    const align = settings.refTextAlign === "match" ? settings.textAlign : settings.refTextAlign;
    const spacingPx = Math.max(0, Math.round((settings.refSpacing ?? 24) * scale * 1.5));
    const isTop = settings.refPosition === "top";
    return {
      display: "flex",
      alignItems: "center",
      justifyContent: resolvePreviewJustify(align === "right" ? "right" : align === "center" ? "center" : "left"),
      marginTop: !isTop ? `${spacingPx}px` : 0,
      marginBottom: isTop ? `${spacingPx}px` : 0,
    };
  };

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
    const outlineEnabled = settings.textOutline !== false;
    const outlineWidth = outlineEnabled ? (settings.textOutlineWidth ?? 4) : 0;
    const outlineColor = settings.textOutlineColor || "#000000";
    const textShadow = settings.textShadow || "4px 5px 2px rgba(0, 0, 0, 0.95)";
    return {
      fontFamily: settings.fontFamily,
      fontSize: `${Math.max(5, baseFontSize * scale)}px`,
      fontWeight: settings.fontWeight === "black" ? 900 : settings.fontWeight === "extrabold" ? 800 : settings.fontWeight === "bold" ? 700 : (settings.fontWeight ? 400 : 900),
      fontStyle: settings.fontStyle,
      color: settings.fontColor,
      lineHeight: settings.lineHeight,
      letterSpacing: settings.letterSpacing ? `${settings.letterSpacing * scale}px` : undefined,
      wordSpacing: settings.wordSpacing ? `${settings.wordSpacing * scale}px` : undefined,
      textAlign: settings.textAlign as React.CSSProperties["textAlign"],
      textShadow,
      textTransform: settings.textTransform,
      paintOrder: "stroke fill",
      WebkitTextStroke: outlineWidth > 0
        ? `${Math.max(0.75, outlineWidth * scale * 1.5)}px ${outlineColor}`
        : undefined,
    };
  };

  const renderPreviewFrame = (scale: number, expanded = false) => {
    const baseSize = settings?.fontSize ?? 48;
    const explicitRef = settings?.refFontSize;
    const effectiveRefSize = (explicitRef && explicitRef > 0 && explicitRef < baseSize)
      ? explicitRef
      : Math.max(14, Math.round(baseSize * 0.7));

    return (
      <div className={`preview-frame${expanded ? " preview-frame--expanded" : ""}`}>
        <div className="preview-frame-bg" style={bgStyle} />
        {settings?.backgroundVideo && (
          <video
            className="preview-frame-video"
            src={settings.backgroundVideo}
            autoPlay
            loop
            muted
            playsInline
            style={{ opacity: settings.backgroundOpacity }}
          />
        )}
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
                <div className="preview-frame-ref-row" style={resolveRefRowStyle(scale)}>
                  <span
                    className="preview-frame-reference"
                    style={{
                      ...refStyle,
                      ...refBadgeStyle,
                      fontSize: `${Math.max(3, effectiveRefSize * scale)}px`,
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
                <div className="preview-frame-ref-row" style={resolveRefRowStyle(scale)}>
                  <span
                    className="preview-frame-reference"
                    style={{
                      ...refStyle,
                      ...refBadgeStyle,
                      fontSize: `${Math.max(3, effectiveRefSize * scale)}px`,
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
  };

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
