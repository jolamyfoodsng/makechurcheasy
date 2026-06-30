import { useEffect, useState } from "react";
import type { BibleThemeSettings } from "../../bible/types";
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
> & {
  /** Dock-only: persisted background mode (off/theme/color/image/video) */
  backgroundType?: "off" | "theme" | "color" | "image" | "video";
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
  title = "Quick Theme Settings",
  subtitle = "Theme edits update the dock preview live.",
  showBackgroundControls = true,
}: Props) {
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
        title="Quick theme settings"
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
            aria-label="Quick theme settings"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dock-theme-quick__modal-head">
              <div>
                <div className="dock-theme-quick__heading">{title}</div>
                <div className="dock-theme-quick__sub">{subtitle}</div>
              </div>
              <button
                type="button"
                className="dock-theme-quick__close"
                onClick={() => setOpen(false)}
                aria-label="Close quick theme settings"
                title="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="dock-theme-quick__body">
              <div className="dock-theme-quick__section">
                <label className="dock-theme-quick__field">
                  <span className="dock-theme-quick__field-head">
                    <span>Main text size</span>
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
                    <div className="dock-theme-quick__section-label">Weight</div>
                    <div className="dock-console-segmented dock-console-segmented--compact">
                      {(["normal", "bold"] as const).map((weight) => (
                        <button
                          key={weight}
                          type="button"
                          className={`dock-console-segmented__item${settings.fontWeight === weight ? " dock-console-segmented__item--active" : ""}`}
                          onClick={() => onChange(withPatch(settings, { fontWeight: weight }))}
                         title="No">
                          {weight === "normal" ? "Normal" : "Bold"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="dock-theme-quick__section">
                    <div className="dock-theme-quick__section-label">Case</div>
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
                    <span>Font family</span>
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
                    <option value="system-ui, sans-serif">System Default</option>
                  </select>
                </label>
              </div>

              <div className="dock-theme-quick__section">
                <label className="dock-theme-quick__field">
                  <span className="dock-theme-quick__field-head">
                    <span>Ref. size</span>
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
                    <span>Main text</span>
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
                    <span>Reference</span>
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
                      <span>Background</span>
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
                      <span>Background opacity</span>
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
                  <div className="dock-theme-quick__section-label">Text alignment</div>
                  <div className="dock-console-segmented dock-console-segmented--compact">
                    {(["left", "center", "right"] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        className={`dock-console-segmented__item${settings.textAlign === align ? " dock-console-segmented__item--active" : ""}`}
                        onClick={() => onChange(withPatch(settings, { textAlign: align }))}
                       title="Center">
                        {align === "left" ? "Left" : align === "center" ? "Center" : "Right"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="dock-theme-quick__section">
                  <label className="dock-theme-quick__field">
                    <span className="dock-theme-quick__field-head">
                      <span>Line height</span>
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
                <div className="dock-theme-quick__section-label">Presets</div>
                <div className="dock-theme-quick__preset-grid">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="dock-theme-quick__preset"
                      onClick={() => handlePreset(preset)}
                    >
                      {preset.label}
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
               title="Reset">
                Reset to Default
              </button>
              <button
                type="button"
                className="dock-btn dock-btn--preview dock-btn--compact dock-theme-quick__action"
                onClick={() => void handleSave()}
                disabled={saving}
               title="Saving...">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
