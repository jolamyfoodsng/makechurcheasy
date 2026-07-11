import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BibleThemeSettings } from "../../bible/types";
import type { CompareThemeSettings } from "../compareThemeConfig";
import Icon from "../DockIcon";

export type DockFullscreenQuickThemeSettings = Pick<
  BibleThemeSettings,
  | "fontSize"
  | "fontFamily"
  | "refFontSize"
  | "refFontWeight"
  | "fontColor"
  | "refFontColor"
  | "refPosition"
  | "refTextTransform"
  | "refLetterSpacing"
  | "refOpacity"
  | "refTextAlign"
  | "refSpacing"
  | "fullscreenShadeColor"
  | "fullscreenShadeOpacity"
  | "textAlign"
  | "lineHeight"
  | "fontWeight"
  | "fontStyle"
  | "textTransform"
  | "textShadow"
  | "animation"
  | "animationDuration"
  | "backgroundImage"
  | "backgroundImageFilePath"
  | "backgroundPattern"
  | "backgroundVideo"
  | "backgroundVideoFilePath"
  | "backgroundOpacity"
  | "backgroundColor"
  | "backgroundColorEnd"
  | "bgGradientAngle"
  | "referenceBackgroundEnabled"
  | "referenceBackgroundColor"
  | "referenceBackgroundStyle"
  | "referenceBackgroundRadius"
  // Lower-third positioning
  | "lowerThirdPosition"
  | "lowerThirdSize"
  | "lowerThirdWidthPreset"
  | "lowerThirdOffsetX"
  | "lowerThirdCaptionPosition"
  // Compare Translation layout
  | "compareTranslationWidth"
  | "compareTranslationGap"
> & Partial<CompareThemeSettings> & {
  /** Dock-only: persisted background mode (off/theme/color/image/pattern/video) */
  backgroundType?: "off" | "theme" | "color" | "image" | "pattern" | "video";
};

interface Props {
  settings: DockFullscreenQuickThemeSettings;
  onChange: (settings: DockFullscreenQuickThemeSettings) => void;
  onReset: () => void;
  onSaveDefault: () => void | Promise<void>;
  title?: string;
  subtitle?: string;
  showBackgroundControls?: boolean;
}

type ThemePreset = {
  id: string;
  label: string;
  settings: DockFullscreenQuickThemeSettings;
};

const PRESETS: ThemePreset[] = [
  {
    id: "faith",
    label: "Faith",
    settings: {
      fontSize: 58,
      fontFamily: "'Georgia', serif",
      refFontSize: 25,
      refFontWeight: "normal",
      fontColor: "#FFF8E0",
      refFontColor: "#F4D17B",
      refPosition: "bottom",
      refTextTransform: "none",
      refLetterSpacing: 0,
      refOpacity: 1,
      refTextAlign: "match",
      refSpacing: 24,
      fullscreenShadeColor: "#1A2244",
      fullscreenShadeOpacity: 0.52,
      textAlign: "center",
      lineHeight: 1.34,
      fontWeight: "bold",
      textTransform: "none",
      textShadow: "0 2px 8px rgba(0,0,0,0.6)",
      animation: "fade",
      animationDuration: 400,
      backgroundImage: "",
      backgroundImageFilePath: "",
      backgroundPattern: "",
      backgroundVideo: "",
      backgroundVideoFilePath: "",
      backgroundOpacity: 1,
      backgroundColor: "#0B1426",
      backgroundColorEnd: "#162040",
      bgGradientAngle: 180,
      referenceBackgroundEnabled: false,
      referenceBackgroundColor: "#F4D17B",
      referenceBackgroundStyle: "solid",
      referenceBackgroundRadius: 12,
      lowerThirdPosition: "left",
      lowerThirdSize: "medium",
      lowerThirdWidthPreset: "full",
      lowerThirdOffsetX: 0,
      lowerThirdCaptionPosition: "bottom",
      compareTranslationWidth: 40,
      compareTranslationGap: 40,
    },
  },
  {
    id: "minimal",
    label: "Minimal",
    settings: {
      fontSize: 48,
      fontFamily: "'Inter', system-ui, sans-serif",
      refFontSize: 20,
      refFontWeight: "normal",
      fontColor: "#F8FAFC",
      refFontColor: "#CBD5E1",
      refPosition: "bottom",
      refTextTransform: "none",
      refLetterSpacing: 0,
      refOpacity: 1,
      refTextAlign: "match",
      refSpacing: 24,
      fullscreenShadeColor: "#0F172A",
      fullscreenShadeOpacity: 0.36,
      textAlign: "left",
      lineHeight: 1.48,
      fontWeight: "normal",
      textTransform: "none",
      textShadow: "none",
      animation: "none",
      animationDuration: 300,
      backgroundImage: "",
      backgroundImageFilePath: "",
      backgroundPattern: "",
      backgroundVideo: "",
      backgroundVideoFilePath: "",
      backgroundOpacity: 1,
      backgroundColor: "#0F172A",
      backgroundColorEnd: "#1E293B",
      bgGradientAngle: 180,
      referenceBackgroundEnabled: false,
      referenceBackgroundColor: "#CBD5E1",
      referenceBackgroundStyle: "solid",
      referenceBackgroundRadius: 12,
      lowerThirdPosition: "left",
      lowerThirdSize: "medium",
      lowerThirdWidthPreset: "full",
      lowerThirdOffsetX: 0,
      lowerThirdCaptionPosition: "bottom",
      compareTranslationWidth: 40,
      compareTranslationGap: 40,
    },
  },
  {
    id: "bold",
    label: "Bold",
    settings: {
      fontSize: 68,
      fontFamily: "'Impact', 'Arial Black', sans-serif",
      refFontSize: 28,
      refFontWeight: "normal",
      fontColor: "#FFFFFF",
      refFontColor: "#B9CCFF",
      refPosition: "bottom",
      refTextTransform: "none",
      refLetterSpacing: 0,
      refOpacity: 1,
      refTextAlign: "match",
      refSpacing: 24,
      fullscreenShadeColor: "#050816",
      fullscreenShadeOpacity: 0.66,
      textAlign: "center",
      lineHeight: 1.22,
      fontWeight: "bold",
      textTransform: "uppercase",
      textShadow: "0 2px 8px rgba(0,0,0,0.6)",
      animation: "fade",
      animationDuration: 400,
      backgroundImage: "",
      backgroundImageFilePath: "",
      backgroundPattern: "",
      backgroundVideo: "",
      backgroundVideoFilePath: "",
      backgroundOpacity: 1,
      backgroundColor: "#050816",
      backgroundColorEnd: "#0C1633",
      bgGradientAngle: 180,
      referenceBackgroundEnabled: true,
      referenceBackgroundColor: "#B9CCFF",
      referenceBackgroundStyle: "pill",
      referenceBackgroundRadius: 20,
      lowerThirdPosition: "left",
      lowerThirdSize: "medium",
      lowerThirdWidthPreset: "full",
      lowerThirdOffsetX: 0,
      lowerThirdCaptionPosition: "bottom",
      compareTranslationWidth: 40,
      compareTranslationGap: 40,
    },
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    settings: {
      fontSize: 56,
      fontFamily: "'Inter', system-ui, sans-serif",
      refFontSize: 24,
      refFontWeight: "normal",
      fontColor: "#FFFFFF",
      refFontColor: "#FDE68A",
      refPosition: "bottom",
      refTextTransform: "none",
      refLetterSpacing: 0,
      refOpacity: 1,
      refTextAlign: "match",
      refSpacing: 24,
      fullscreenShadeColor: "#000000",
      fullscreenShadeOpacity: 0.78,
      textAlign: "center",
      lineHeight: 1.32,
      fontWeight: "bold",
      textTransform: "uppercase",
      textShadow: "0 2px 8px rgba(0,0,0,0.6)",
      animation: "fade",
      animationDuration: 400,
      backgroundImage: "",
      backgroundImageFilePath: "",
      backgroundPattern: "",
      backgroundVideo: "",
      backgroundVideoFilePath: "",
      backgroundOpacity: 1,
      backgroundColor: "#000000",
      backgroundColorEnd: "#0F172A",
      bgGradientAngle: 180,
      referenceBackgroundEnabled: true,
      referenceBackgroundColor: "#FDE68A",
      referenceBackgroundStyle: "outline",
      referenceBackgroundRadius: 4,
      lowerThirdPosition: "left",
      lowerThirdSize: "medium",
      lowerThirdWidthPreset: "full",
      lowerThirdOffsetX: 0,
      lowerThirdCaptionPosition: "bottom",
      compareTranslationWidth: 40,
      compareTranslationGap: 40,
    },
  },
];

function formatPx(value: number): string {
  return `${Math.round(value)}px`;
}

function formatOpacity(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatLineHeight(value: number): string {
  return `${value.toFixed(2)}x`;
}

function withPatch(
  current: DockFullscreenQuickThemeSettings,
  patch: Partial<DockFullscreenQuickThemeSettings>,
): DockFullscreenQuickThemeSettings {
  return {
    ...current,
    ...patch,
  };
}

export default function DockFullscreenThemeQuickSettings({
  settings,
  onChange,
  onReset,
  onSaveDefault,
  title,
  subtitle,
  showBackgroundControls = true,
}: Props) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("dock.fullscreenThemeQuickSettings.quickThemeSettings");
  const resolvedSubtitle = subtitle ?? t("dock.fullscreenThemeQuickSettings.subtitle");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handlePreset = (preset: ThemePreset) => {
    onChange(withPatch(settings, preset.settings));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSaveDefault();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`dock-theme-quick${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="dock-theme-quick__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t("dock.fullscreenThemeQuickSettings.quickThemeSettings")}
      >
        <Icon name="edit" size={10} />
      </button>

      {open && (
        <div
          className="dock-theme-quick__backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="dock-theme-quick__modal"
            role="dialog"
            aria-label={t("dock.fullscreenThemeQuickSettings.quickThemeSettings")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dock-theme-quick__modal-head">
              <div>
                <div className="dock-theme-quick__heading">{resolvedTitle}</div>
                <div className="dock-theme-quick__sub">{resolvedSubtitle}</div>
              </div>
              <button
                type="button"
                className="dock-theme-quick__close"
                onClick={() => setOpen(false)}
                aria-label={t("dock.fullscreenThemeQuickSettings.closeQuickThemeSettings")}
                title={t("common.close")}
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="dock-theme-quick__body">
              <div className="dock-theme-quick__section">
                <label className="dock-theme-quick__field">
                  <span className="dock-theme-quick__field-head">
                    <span>{t("dock.fullscreenThemeQuickSettings.mainTextSize")}</span>
                    <span>{formatPx(settings.fontSize)}</span>
                  </span>
                  <input
                    className="dock-theme-quick__range"
                    type="range"
                    min={28}
                    max={200}
                    step={1}
                    value={settings.fontSize}
                    onChange={(event) =>
                      onChange(withPatch(settings, { fontSize: Number(event.target.value) }))
                    }
                  />
                </label>

                <div className="dock-theme-quick__split-row">
                  <div className="dock-theme-quick__section">
                    <div className="dock-theme-quick__section-label">{t("dock.fullscreenThemeQuickSettings.weight")}</div>
                    <div className="dock-console-segmented dock-console-segmented--compact">
                      {(["normal", "bold"] as const).map((weight) => (
                        <button
                          key={weight}
                          type="button"
                          className={`dock-console-segmented__item${settings.fontWeight === weight ? " dock-console-segmented__item--active" : ""}`}
                          onClick={() => onChange(withPatch(settings, { fontWeight: weight }))}
                          title={weight === "normal" ? t("dock.fullscreenThemeQuickSettings.normal") : t("dock.fullscreenThemeQuickSettings.bold")}>
                          {weight === "normal" ? t("dock.fullscreenThemeQuickSettings.normal") : t("dock.fullscreenThemeQuickSettings.bold")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="dock-theme-quick__section">
                    <div className="dock-theme-quick__section-label">{t("dock.fullscreenThemeQuickSettings.case")}</div>
                    <div className="dock-console-segmented dock-console-segmented--compact dock-theme-quick__segmented-wrap">
                      {([
                        ["none", "Aa"],
                        ["uppercase", "AA"],
                        ["lowercase", "aa"],
                        ["capitalize", "Ab"],
                      ] as const).map(([transform, label]) => (
                        <button
                          key={transform}
                          type="button"
                          className={`dock-console-segmented__item${settings.textTransform === transform ? " dock-console-segmented__item--active" : ""}`}
                          onClick={() => onChange(withPatch(settings, { textTransform: transform }))}
                          title={transform}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="dock-theme-quick__section">
                <label className="dock-theme-quick__field">
                  <span className="dock-theme-quick__field-head">
                    <span>{t("dock.fullscreenThemeQuickSettings.fontFamily")}</span>
                  </span>
                  <select
                    className="dock-theme-quick__select"
                    value={settings.fontFamily ?? "Inter, system-ui, sans-serif"}
                    onChange={(event) => onChange(withPatch(settings, { fontFamily: event.target.value }))}
                  >
                    <option value="Inter, system-ui, sans-serif">Inter</option>
                    <option value="'Georgia', serif">Georgia</option>
                    <option value="'Playfair Display', serif">Playfair Display</option>
                    <option value="'Merriweather', serif">Merriweather</option>
                    <option value="'Lora', serif">Lora</option>
                    <option value="'Open Sans', sans-serif">Open Sans</option>
                    <option value="'Roboto', sans-serif">Roboto</option>
                    <option value="'Impact', 'Arial Black', sans-serif">Impact</option>
                    <option value="'Courier New', monospace">Courier New</option>
                    <option value="system-ui, sans-serif">{t("dock.fullscreenThemeQuickSettings.systemDefault")}</option>
                  </select>
                </label>
              </div>

              <div className="dock-theme-quick__section">
                <label className="dock-theme-quick__field">
                  <span className="dock-theme-quick__field-head">
                    <span>{t("dock.fullscreenThemeQuickSettings.refSize")}</span>
                    <span>{formatPx(settings.refFontSize)}</span>
                  </span>
                  <input
                    className="dock-theme-quick__range"
                    type="range"
                    min={14}
                    max={150}
                    step={1}
                    value={settings.refFontSize}
                    onChange={(event) =>
                      onChange(withPatch(settings, { refFontSize: Number(event.target.value) }))
                    }
                  />
                </label>
              </div>

              <div className="dock-theme-quick__section">
                <div className="dock-theme-quick__color-grid">
                  <label className="dock-theme-quick__color-field">
                    <span>{t("dock.fullscreenThemeQuickSettings.mainText")}</span>
                    <span className="dock-theme-quick__color-input-wrap">
                      <input
                        className="dock-theme-quick__color-input"
                        type="color"
                        value={settings.fontColor}
                        onChange={(event) =>
                          onChange(withPatch(settings, { fontColor: event.target.value }))
                        }
                      />
                      <span>{settings.fontColor.toUpperCase()}</span>
                    </span>
                  </label>

                  <label className="dock-theme-quick__color-field">
                    <span>{t("dock.fullscreenThemeQuickSettings.reference")}</span>
                    <span className="dock-theme-quick__color-input-wrap">
                      <input
                        className="dock-theme-quick__color-input"
                        type="color"
                        value={settings.refFontColor}
                        onChange={(event) =>
                          onChange(withPatch(settings, { refFontColor: event.target.value }))
                        }
                      />
                      <span>{settings.refFontColor.toUpperCase()}</span>
                    </span>
                  </label>

                  {showBackgroundControls && (
                    <label className="dock-theme-quick__color-field">
                      <span>{t("dock.fullscreenThemeQuickSettings.background")}</span>
                      <span className="dock-theme-quick__color-input-wrap">
                        <input
                          className="dock-theme-quick__color-input"
                          type="color"
                          value={settings.fullscreenShadeColor}
                          onChange={(event) =>
                            onChange(
                              withPatch(settings, {
                                fullscreenShadeColor: event.target.value,
                              }),
                            )
                          }
                        />
                        <span>{settings.fullscreenShadeColor.toUpperCase()}</span>
                      </span>
                    </label>
                  )}
                </div>
              </div>

              {showBackgroundControls && (
                <div className="dock-theme-quick__section">
                  <label className="dock-theme-quick__field">
                    <span className="dock-theme-quick__field-head">
                      <span>{t("dock.fullscreenThemeQuickSettings.backgroundOpacity")}</span>
                      <span>{formatOpacity(settings.fullscreenShadeOpacity)}</span>
                    </span>
                    <input
                      className="dock-theme-quick__range"
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(settings.fullscreenShadeOpacity * 100)}
                      onChange={(event) =>
                        onChange(
                          withPatch(settings, {
                            fullscreenShadeOpacity: Number(event.target.value) / 100,
                          }),
                        )
                      }
                    />
                  </label>
                </div>
              )}

              <div className="dock-theme-quick__split-row">
                <div className="dock-theme-quick__section">
                  <div className="dock-theme-quick__section-label">{t("dock.fullscreenThemeQuickSettings.textAlignment")}</div>
                  <div className="dock-console-segmented dock-console-segmented--compact">
                    {(["left", "center", "right"] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        className={`dock-console-segmented__item${settings.textAlign === align ? " dock-console-segmented__item--active" : ""}`}
                        onClick={() => onChange(withPatch(settings, { textAlign: align }))}
                        title={t(`common.${align}`)}>
                        {t(`common.${align}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="dock-theme-quick__section">
                  <label className="dock-theme-quick__field">
                    <span className="dock-theme-quick__field-head">
                      <span>{t("dock.fullscreenThemeQuickSettings.lineHeight")}</span>
                      <span>{formatLineHeight(settings.lineHeight)}</span>
                    </span>
                    <input
                      className="dock-theme-quick__range"
                      type="range"
                      min={1.05}
                      max={1.8}
                      step={0.05}
                      value={settings.lineHeight}
                      onChange={(event) =>
                        onChange(withPatch(settings, { lineHeight: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="dock-theme-quick__section">
                <div className="dock-theme-quick__section-label">{t("dock.fullscreenThemeQuickSettings.presets")}</div>
                <div className="dock-theme-quick__preset-grid">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="dock-theme-quick__preset"
                      onClick={() => handlePreset(preset)}
                    >
                      {t(`dock.fullscreenThemeQuickSettings.preset${preset.id.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("")}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="dock-theme-quick__actions">
              <button
                type="button"
                className="dock-btn dock-btn--ghost dock-btn--compact dock-theme-quick__action"
                onClick={onReset}
                title={t("common.reset")}>
                {t("dock.fullscreenThemeQuickSettings.resetToDefault")}
              </button>
              <button
                type="button"
                className="dock-btn dock-btn--preview dock-btn--compact dock-theme-quick__action"
                onClick={() => void handleSave()}
                disabled={saving}
                title={t("dock.fullscreenThemeQuickSettings.saving")}>
                {saving ? t("dock.fullscreenThemeQuickSettings.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
