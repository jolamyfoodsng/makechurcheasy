import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { HexColorPicker } from "react-colorful";
import type { BibleTheme } from "../../bible/types";
import Icon from "../DockIcon";
import BackgroundPickerCard from "./BackgroundPickerCard";
import type { DockBackgroundPreset } from "../dockConsoleTheme";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";

interface Props {
  selectedThemeId: string | null;
  onSelect: (theme: BibleTheme) => void;
  templateType?: BibleTheme["templateType"];
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

/* ── Stepper Control (Compact) ── */
function StepperControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const handleDecrement = () => onChange(Math.max(min, value - step));
  const handleIncrement = () => onChange(Math.min(max, value + step));
  return (
    <div className="dtb-stepper dtb-stepper--compact">
      <label className="dtb-stepper__label">{label}</label>
      <div className="dtb-stepper__row">
        <div className="dtb-stepper__inline">
          <button
            type="button"
            className="dtb-stepper__btn dtb-stepper__btn--dec"
            onClick={handleDecrement}
            disabled={value <= min}
            aria-label={`Decrease ${label}`}
          >
            <Icon name="remove" size={12} />
          </button>
          <span className="dtb-stepper__value">
            {value}
            {unit && <span className="dtb-stepper__unit">{unit}</span>}
          </span>
          <button
            type="button"
            className="dtb-stepper__btn dtb-stepper__btn--inc"
            onClick={handleIncrement}
            disabled={value >= max}
            aria-label={`Increase ${label}`}
          >
            <Icon name="add" size={12} />
          </button>
        </div>
      </div>
      <div className="dtb-stepper__range_topper" />
      <input
        type="range"
        className="dtb-stepper__range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

/* ── Color Popover Trigger (compact swatch + hex, click to open picker) ── */
function ColorPopoverTrigger({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => { setHexInput(value); }, [value]);

  const openPopover = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = Math.min(rect.bottom + 6, window.innerHeight - 220);
    const left = Math.min(rect.left, window.innerWidth - 210);
    setPos({ top, left: Math.max(8, left) });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const commitHex = useCallback(() => {
    const cleaned = hexInput.trim().replace(/^#/, "");
    if (/^[\da-f]{6}$/i.test(cleaned)) {
      onChange(`#${cleaned.toUpperCase()}`);
    } else {
      setHexInput(value);
    }
  }, [hexInput, value, onChange]);

  return (
    <>
      <div
        className="dtb-color-swatch-row"
        ref={triggerRef}
        onClick={openPopover}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openPopover(); }}
      >
        <div className="dtb-color-swatch-row__swatch" style={{ backgroundColor: value }} />
        <span className="dtb-color-swatch-row__hex">{value.toUpperCase()}</span>
      </div>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="dtb-color-swatch__popover"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 10000 }}
        >
          <HexColorPicker color={value} onChange={onChange} />
          <div className="dtb-color-swatch__popover-input-row">
            <span className="dtb-color-swatch__popover-hash">#</span>
            <input
              className="dtb-color-swatch__popover-hex-input"
              type="text"
              maxLength={6}
              value={hexInput.replace(/^#/, "")}
              onChange={(e) => setHexInput(`#${e.target.value.replace(/^#/, "")}`)}
              onBlur={commitHex}
              onKeyDown={(e) => { if (e.key === "Enter") commitHex(); }}
              spellCheck={false}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
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
  templateType,
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
      label: "Fade In",
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
      label: "Glow",
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
      label: "Subtle Zoom",
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
      label: "Verse Reveal",
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
      label: "Text Shadow",
      icon: "blur_on",
      isActive: (s: DockFullscreenQuickThemeSettings) => s.textShadow !== "none" && s.textShadow !== "",
      toggle: (s: DockFullscreenQuickThemeSettings): DockFullscreenQuickThemeSettings => ({
        ...s,
        textShadow: s.textShadow !== "none" && s.textShadow !== "" ? "none" : "0 2px 8px rgba(0,0,0,0.6)",
      }),
    },
  ], []);

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
    const ts = theme.settings;
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
  }, [onSelect, updateDraft]);

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
          aria-label="Quick Edits"
          title="Quick Edits"
        >
          <Icon name="edit" size={13} />
          <span>Quick Edits</span>
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
                <h2 className="dtb-studio__title">Theme Settings</h2>
                <p className="dtb-studio__subtitle">{subtitle}</p>
              </div>
              <button
                type="button"
                className="dtb-studio__close"
                onClick={() => setView("closed")}
                aria-label="Close"
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
                  templateType={templateType}
                  allowedCategories={allowedCategories}
                  sampleText={sampleText}
                  sampleReference={sampleReference}
                  onBackgroundPresetChange={onBackgroundPresetChange}
                  showReferences={showReferences}
                />

                {/* Lower-Third Positioning — only shown in lower-third mode */}
                {overlayMode === "lower-third" && (
                  <div className="dtb-studio-card dtb-studio-card--no-collapse">
                    <div className="dtb-studio-card__body">
                      <div className="dtb-bg-picker__header">
                        <div className="dtb-bg-picker__header-left">
                          <Icon name="swap_vert" size={14} className="dtb-studio-card__icon" />
                          <span className="dtb-studio-card__title">Lower Third Position</span>
                        </div>
                      </div>
                      <p className="dtb-bg-picker__subtitle">Control where the lower third appears on screen.</p>

                      <div className="dtb-align-group">
                        <span className="dtb-align-group__label">Container position</span>
                        <div className="dtb-segmented" role="group" aria-label="Lower third container position">
                          {([
                            { value: "left" as const, icon: "format_align_left", label: "Left" },
                            { value: "center" as const, icon: "format_align_center", label: "Center" },
                            { value: "right" as const, icon: "format_align_right", label: "Right" },
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
                        <span className="dtb-typo-row__label">Width</span>
                        <div className="dtb-segmented dtb-segmented--compact" role="group" aria-label="Lower third width">
                          {([
                            { value: "full" as const, label: "Full" },
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
                          <span>Horizontal offset</span>
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
                          aria-label="Lower third horizontal offset"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <SectionDivider />

                {/* ═══ Text Section ═══ */}
                <div className="dtb-section">
                  <SectionLabel icon="text_fields" label="Text" accent />

                  {/* Text color + Reference color — compact rows */}
                  <div className="dtb-colors__section">
                    <span className="dtb-colors__label">Text Color</span>
                    <ColorPopoverTrigger
                      value={draftSettings.fontColor}
                      onChange={(v) => updateDraft((c) => withPatch(c, { fontColor: v }))}
                    />
                  </div>





                  {/* Font sizes — side by side */}
                  <div className="dtb-typo-grid">
                    <div className="dtb-typo-grid__row">
                      <StepperControl
                        label="Main size"
                        value={draftSettings.fontSize}
                        min={28}
                        max={200}
                        unit="px"
                        onChange={(v) => updateDraft((c) => withPatch(c, { fontSize: v }))}
                      />

                    </div>
                  </div>

                  <SectionDivider />

                  {/* Weight */}
                  <div className="dtb-typo-row dtb-typo-row--inline">
                    <span className="dtb-typo-row__label">Weight</span>
                    <div className="dtb-segmented dtb-segmented--compact" role="group" aria-label="Font weight">
                      {([
                        { value: "light" as const, label: "Light", style: { fontWeight: 300 } },
                        { value: "normal" as const, label: "Regular", style: { fontWeight: 400 } },
                        { value: "bold" as const, label: "Bold", style: { fontWeight: 700 } },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`dtb-segmented__item${draftSettings.fontWeight === opt.value ? " dtb-segmented__item--active" : ""}`}
                          onClick={() => updateDraft((c) => withPatch(c, { fontWeight: opt.value }))}
                          style={opt.style}
                          aria-pressed={draftSettings.fontWeight === opt.value}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alignment */}
                  <div className="dtb-typo-row dtb-typo-row--inline">
                    <span className="dtb-typo-row__label">Alignment</span>
                    <div className="dtb-segmented" role="group" aria-label="Text alignment">
                      {([
                        { value: "left" as const, icon: "format_align_left" },
                        { value: "center" as const, icon: "format_align_center" },
                        { value: "right" as const, icon: "format_align_right" },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`dtb-segmented__item${draftSettings.textAlign === opt.value ? " dtb-segmented__item--active" : ""}`}
                          onClick={() => updateDraft((c) => withPatch(c, { textAlign: opt.value }))}
                          aria-pressed={draftSettings.textAlign === opt.value}
                          aria-label={`Align ${opt.value}`}
                        >
                          <Icon name={opt.icon} size={14} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line height */}
                  <div className="dtb-slider-field">
                    <div className="dtb-slider-field__head">
                      <span>Line height</span>
                      <span className="dtb-slider-field__value">{draftSettings.lineHeight.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      className="dtb-slider"
                      min={1.05}
                      max={1.8}
                      step={0.01}
                      value={draftSettings.lineHeight}
                      onChange={(e) => updateDraft((c) => withPatch(c, { lineHeight: Number(e.target.value) }))}
                      aria-label="Line height"
                    />
                  </div>

                  {/* Text transform */}
                  <div className="dtb-typo-row dtb-typo-row--inline">
                    <span className="dtb-typo-row__label">Text case</span>
                    <div className="dtb-segmented dtb-segmented--compact dtb-segmented--icon" role="group" aria-label="Text case">
                      {([
                        { value: "none" as const, label: "Aa" },
                        { value: "uppercase" as const, label: "AA" },
                        { value: "lowercase" as const, label: "aa" },
                        { value: "capitalize" as const, label: "Ab" },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`dtb-segmented__item${draftSettings.textTransform === opt.value ? " dtb-segmented__item--active" : ""}`}
                          onClick={() => updateDraft((c) => withPatch(c, { textTransform: opt.value }))}
                          aria-pressed={draftSettings.textTransform === opt.value}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <SectionDivider />

                {/* ═══ Effects Section (collapsed by default) ═══ */}
                <div className="dtb-section">
                  <button
                    type="button"
                    className="dtb-section-toggle"
                    onClick={() => setEffectsOpen((o) => !o)}
                    aria-expanded={effectsOpen}
                  >
                    <SectionLabel icon="auto_awesome" label="Effects" />
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
                  Reset
                </button>
                <button
                  type="button"
                  className="dtb-studio__footer-btn dtb-studio__footer-btn--save"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
