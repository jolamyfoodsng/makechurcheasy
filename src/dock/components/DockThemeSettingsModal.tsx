import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { flushSync } from "react-dom";
import type { BibleTheme } from "../../bible/types";
import Icon from "../DockIcon";
import BackgroundPickerCard from "./BackgroundPickerCard";
import type { DockBackgroundPreset } from "../dockConsoleTheme";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";

interface Props {
  selectedThemeId: string | null;
  onSelect: (theme: BibleTheme) => void;
  allowedCategories?: Array<NonNullable<BibleTheme["category"]>>;
  sampleText?: string;
  sampleReference?: string;
  quickSettings: DockFullscreenQuickThemeSettings;
  defaultQuickSettings?: DockFullscreenQuickThemeSettings;
  onQuickSettingsSave: (settings: DockFullscreenQuickThemeSettings) => void | Promise<void>;
  onQuickSettingsChange?: (settings: DockFullscreenQuickThemeSettings) => void;
  title: string;
  subtitle: string;
  /** When provided, modal is externally controlled */
  isOpen?: boolean;
  onClose?: () => void;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
  /** Overlay mode — shows lower-third positioning controls in LT mode */
  overlayMode?: "fullscreen" | "lower-third";
  /** Show the Reference section in BackgroundPickerCard (only for Bible tab) */
  showReferences?: boolean;
}

type StudioView = "closed" | "settings";

function withPatch(
  current: DockFullscreenQuickThemeSettings,
  patch: Partial<DockFullscreenQuickThemeSettings>,
): DockFullscreenQuickThemeSettings {
  return { ...current, ...patch };
}

/* ── Section Divider ── */
function SectionDivider() {
  return <div className="dtb-section-divider" />;
}

/* ── Section Label (ThemeModalStitch style) ── */
function SectionLabel({ icon, label, accent }: { icon: string; label: string; accent?: boolean }) {
  return (
    <h3 className={`dtb-section-label${accent ? " dtb-section-label--accent" : ""}`}>
      <Icon name={icon} size={14} className="dtb-section-label__icon" />
      <span>{label}</span>
    </h3>
  );
}

/* ── Main Component ── */
export default function DockThemeSettingsModal({
  selectedThemeId,
  onSelect,
  allowedCategories,
  sampleText = "Faith",
  sampleReference = "John 3:16",
  quickSettings,
  defaultQuickSettings,
  onQuickSettingsSave,
  onQuickSettingsChange,
  title,
  subtitle,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  onBackgroundPresetChange,
  overlayMode = "fullscreen",
  showReferences = true,
}: Props) {
  const { t } = useTranslation();
  const [internalView, setInternalView] = useState<StudioView>("closed");
  const view = externalIsOpen !== undefined
    ? (externalIsOpen ? (internalView === "closed" ? "settings" : internalView) : "closed")
    : internalView;
  const setView = useCallback((v: StudioView) => {
    if (externalIsOpen !== undefined && v === "closed") {
      externalOnClose?.();
      return;
    }
    setInternalView(v);
  }, [externalIsOpen, externalOnClose]);
  const [draftSettings, setDraftSettings] = useState(quickSettings);
  const [saving, setSaving] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(view !== "closed");
  const originalSettingsRef = useRef(quickSettings);

  useEffect(() => {
    const isOpen = view !== "closed";
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (isOpen && !wasOpen) {
      originalSettingsRef.current = quickSettings;
      setDraftSettings(quickSettings);
    }
  }, [view, quickSettings]);

  const updateDraft = useCallback(
    (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => {
      setDraftSettings((prev) => {
        const next = updater(prev);
        onQuickSettingsChange?.(next);
        return next;
      });
    },
    [onQuickSettingsChange],
  );

  const EFFECT_DEFS = useMemo(() => [
    {
      id: "fadeIn",
      label: t('worship.fadeIn'),
      icon: "opacity",
      isActive: (s: DockFullscreenQuickThemeSettings) => s.animation === "fade",
      toggle: (s: DockFullscreenQuickThemeSettings): DockFullscreenQuickThemeSettings => ({
        ...s,
        animation: s.animation === "fade" ? "none" : "fade",
        animationDuration: 400,
      }),
    },
    {
      id: "glow",
      label: t('worship.glow'),
      icon: "wb_sunny",
      isActive: (s: DockFullscreenQuickThemeSettings) => s.textShadow.includes("0 0"),
      toggle: (s: DockFullscreenQuickThemeSettings): DockFullscreenQuickThemeSettings => ({
        ...s,
        textShadow: s.textShadow.includes("0 0")
          ? "0 2px 8px rgba(0,0,0,0.6)"
          : "0 0 24px rgba(255,255,220,0.8), 0 0 48px rgba(255,255,220,0.4)",
      }),
    },
    {
      id: "subtleZoom",
      label: t('worship.subtleZoom'),
      icon: "zoom_in",
      isActive: (s: DockFullscreenQuickThemeSettings) => s.animation === "scale-in",
      toggle: (s: DockFullscreenQuickThemeSettings): DockFullscreenQuickThemeSettings => ({
        ...s,
        animation: s.animation === "scale-in" ? "none" : "scale-in",
        animationDuration: 400,
      }),
    },
    {
      id: "verseReveal",
      label: t('worship.verseReveal'),
      icon: "visibility",
      isActive: (s: DockFullscreenQuickThemeSettings) => s.animation === "reveal-bg-then-text",
      toggle: (s: DockFullscreenQuickThemeSettings): DockFullscreenQuickThemeSettings => ({
        ...s,
        animation: s.animation === "reveal-bg-then-text" ? "none" : "reveal-bg-then-text",
        animationDuration: 600,
      }),
    },
    {
      id: "textShadow",
      label: t('worship.textShadow'),
      icon: "blur_on",
      isActive: (s: DockFullscreenQuickThemeSettings) => s.textShadow !== "none" && s.textShadow !== "",
      toggle: (s: DockFullscreenQuickThemeSettings): DockFullscreenQuickThemeSettings => ({
        ...s,
        textShadow: s.textShadow !== "none" && s.textShadow !== "" ? "none" : "0 2px 8px rgba(0,0,0,0.6)",
      }),
    },
  ], [t]);

  useEffect(() => {
    if (view === "closed") return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setView("closed");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  const openSettings = useCallback(() => {
    setDraftSettings(quickSettings);
    setView("settings");
  }, [quickSettings]);

  const handleThemeSelect = useCallback((theme: BibleTheme) => {
    onSelect(theme);
    // Resolve variant settings based on active overlay mode
    const variant = overlayMode === "lower-third"
      ? theme.variants?.lowerThird
      : theme.variants?.fullscreen;
    const ts = variant?.settings ?? theme.settings;
    updateDraft((prev) => ({
      ...prev,
      fontColor: ts.fontColor,
      refFontColor: ts.refFontColor,
      refFontSize: ts.refFontSize,
      refFontWeight: ts.refFontWeight || "normal",
      refPosition: ts.refPosition || "bottom",
      refTextTransform: ts.refTextTransform || "none",
      refLetterSpacing: ts.refLetterSpacing ?? 0,
      refOpacity: ts.refOpacity ?? 1,
      refTextAlign: ts.refTextAlign || "match",
      refSpacing: ts.refSpacing ?? 24,
      fontWeight: ts.fontWeight === "light" ? "normal" : ts.fontWeight,
      fontStyle: ts.fontStyle ?? "normal",
      textTransform: ts.textTransform,
      textAlign: ts.textAlign,
      lineHeight: ts.lineHeight,
      textShadow: ts.textShadow,
      fullscreenShadeColor: ts.fullscreenShadeColor,
      fullscreenShadeOpacity: ts.fullscreenShadeOpacity,
      backgroundImage: ts.backgroundImage,
      backgroundVideo: ts.backgroundVideo,
      backgroundOpacity: ts.backgroundOpacity,
      backgroundColor: ts.backgroundColor,
      backgroundColorEnd: ts.backgroundColorEnd,
      bgGradientAngle: ts.bgGradientAngle,
      referenceBackgroundEnabled: ts.referenceBackgroundEnabled,
      referenceBackgroundColor: ts.referenceBackgroundColor,
      referenceBackgroundStyle: ts.referenceBackgroundStyle,
      referenceBackgroundRadius: ts.referenceBackgroundRadius,
      lowerThirdPosition: ts.lowerThirdPosition,
      lowerThirdSize: ts.lowerThirdSize,
      lowerThirdWidthPreset: ts.lowerThirdWidthPreset,
      lowerThirdOffsetX: ts.lowerThirdOffsetX,
    }));
  }, [onSelect, updateDraft, overlayMode]);

  const handleSave = useCallback(() => {
    const nextSettings = { ...draftSettings };
    setSaving(true);
    flushSync(() => setView("closed"));
    const commit = () => {
      void Promise.resolve(onQuickSettingsSave(nextSettings))
        .catch((error) => console.warn("[DockThemeSettingsModal] quick settings save failed:", error))
        .finally(() => setSaving(false));
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(commit);
      return;
    }
    window.setTimeout(commit, 0);
  }, [draftSettings, onQuickSettingsSave]);

  const handleReset = useCallback(() => {
    updateDraft(() => defaultQuickSettings ?? originalSettingsRef.current);
  }, [updateDraft, defaultQuickSettings]);

  /* ── Render ── */
  return (
    <div className="dtb-studio">
      {externalIsOpen === undefined && (
        <button
          type="button"
          className="dtb-studio__trigger dtb-studio__trigger--labeled"
          onClick={openSettings}
          aria-haspopup="dialog"
          aria-label={t('worship.quickEdits')}
          title={t('worship.quickEdits')}
        >
          <Icon name="edit" size={13} />
          <span>{t('worship.quickEdits')}</span>
        </button>
      )}

      {view !== "closed" && (
        <div className="dtb-studio__backdrop" onClick={() => setView("closed")} role="presentation">
          <div
            className="dtb-studio__modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="dtb-studio__header">
              <div className="dtb-studio__header-spacer" />
              <div className="dtb-studio__header-center">
                <h2 className="dtb-studio__title">{t('worship.openThemeSettings')}</h2>
                <p className="dtb-studio__subtitle">{subtitle}</p>
              </div>
              <button
                type="button"
                className="dtb-studio__close"
                onClick={() => setView("closed")}
                aria-label={t('common.close')}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {/* ── Settings View ── */}
            {view === "settings" && (
              <div className="dtb-studio__settings-view">

                {/* ═══ Background Section ═══ */}
                <BackgroundPickerCard
                  quickSettings={draftSettings}
                  onQuickSettingsChange={(updater) => updateDraft(updater)}
                  onQuickSettingsSave={(settings) => onQuickSettingsSave(settings)}
                  selectedThemeId={selectedThemeId}
                  onThemeSelect={handleThemeSelect}
                  allowedCategories={allowedCategories}
                  sampleText={sampleText}
                  sampleReference={sampleReference}
                  onBackgroundPresetChange={onBackgroundPresetChange}
                  showReferences={showReferences}
                  overlayMode={overlayMode}
                />

                {/* Lower-Third Positioning — only shown in lower-third mode */}
                {overlayMode === "lower-third" && (
                  <div className="dtb-studio-card dtb-studio-card--no-collapse">
                    <div className="dtb-studio-card__body">
                      <div className="dtb-bg-picker__header">
                        <div className="dtb-bg-picker__header-left">
                          <Icon name="swap_vert" size={14} className="dtb-studio-card__icon" />
                          <span className="dtb-studio-card__title">{t('worship.lowerThirdPosition')}</span>
                        </div>
                      </div>
                      <p className="dtb-bg-picker__subtitle">{t('worship.adjustDescription')}</p>

                      <div className="dtb-align-group">
                        <span className="dtb-align-group__label">{t('worship.containerPosition')}</span>
                        <div className="dtb-segmented" role="group" aria-label={t('worship.containerPosition')}>
                          {([
                            { value: "left" as const, icon: "format_align_left", label: t('worship.left') },
                            { value: "center" as const, icon: "format_align_center", label: t('worship.center') },
                            { value: "right" as const, icon: "format_align_right", label: t('worship.right') },
                          ]).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              className={`dtb-segmented__item${draftSettings.lowerThirdPosition === opt.value ? " dtb-segmented__item--active" : ""}`}
                              onClick={() => updateDraft((c) => withPatch(c, { lowerThirdPosition: opt.value }))}
                              aria-pressed={draftSettings.lowerThirdPosition === opt.value}
                              title={opt.label}
                            >
                              <Icon name={opt.icon} size={14} />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="dtb-typo-row dtb-typo-row--inline">
                        <span className="dtb-typo-row__label">{t('worship.width')}</span>
                        <div className="dtb-segmented dtb-segmented--compact" role="group" aria-label={t('worship.width')}>
                          {([
                            { value: "full" as const, label: t('worship.full') },
                            { value: "xl" as const, label: "XL" },
                            { value: "lg" as const, label: "LG" },
                            { value: "md" as const, label: "MD" },
                            { value: "sm" as const, label: "SM" },
                          ]).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              className={`dtb-segmented__item${draftSettings.lowerThirdWidthPreset === opt.value ? " dtb-segmented__item--active" : ""}`}
                              onClick={() => updateDraft((c) => withPatch(c, { lowerThirdWidthPreset: opt.value }))}
                              aria-pressed={draftSettings.lowerThirdWidthPreset === opt.value}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="dtb-slider-field">
                        <div className="dtb-slider-field__head">
                          <span>{t('worship.horizontalOffset')}</span>
                          <span className="dtb-slider-field__value">{draftSettings.lowerThirdOffsetX}px</span>
                        </div>
                        <input
                          type="range"
                          className="dtb-slider"
                          min={-300}
                          max={300}
                          step={1}
                          value={draftSettings.lowerThirdOffsetX}
                          onChange={(e) => updateDraft((c) => withPatch(c, { lowerThirdOffsetX: Number(e.target.value) }))}
                          aria-label={t('worship.horizontalOffset')}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <SectionDivider />

                {/* ═══ Effects Section (collapsed by default) ═══ */}
                <div className="dtb-section">
                  <button
                    type="button"
                    className="dtb-section-toggle"
                    onClick={() => setEffectsOpen((o) => !o)}
                    aria-expanded={effectsOpen}
                  >
                    <SectionLabel icon="auto_awesome" label={t('worship.textStyle')} />
                    <Icon
                      name={effectsOpen ? "expand_less" : "expand_more"}
                      size={14}
                      className="dtb-section-toggle__chevron"
                    />
                  </button>

                  {effectsOpen && (
                    <div className="dtb-effects-grid">
                      {EFFECT_DEFS.map((effect) => (
                        <button
                          key={effect.id}
                          type="button"
                          className={`dtb-effect-toggle${effect.isActive(draftSettings) ? " dtb-effect-toggle--active" : ""}`}
                          aria-pressed={effect.isActive(draftSettings)}
                          onClick={() => updateDraft((c) => effect.toggle(c))}
                        >
                          <Icon name={effect.icon} size={14} />
                          <span>{effect.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <SectionDivider />

                {/* ═══ Quick Presets Section ═══ */}

                {/* Spacer for sticky footer */}
                <div className="dtb-studio__spacer" />
              </div>
            )}

            {/* ── Sticky Footer ── */}
            {view === "settings" && (
              <div className="dtb-studio__footer">
                <button
                  type="button"
                  className="dtb-studio__footer-btn dtb-studio__footer-btn--reset"
                  onClick={handleReset}
                >
                  {t('common.reset')}
                </button>
                <button
                  type="button"
                  className="dtb-studio__footer-btn dtb-studio__footer-btn--save"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? t('worship.saving') : t('worship.saveChanges')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
