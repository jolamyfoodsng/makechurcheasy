/**
 * LayoutThemeAdjustPanel — the Dock's simple settings for a ready-made layer theme.
 *
 * Layer themes carry their own fonts, colours, effects and label style, so the
 * full Text / Layout editors don't apply to them. Operators only get what they
 * actually need on a Sunday: text size, reference size and (lower thirds)
 * how high the graphic sits. Everything else is changed by customising the
 * theme on the app's Themes page.
 */
import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import ThemeLayoutPreview, { SAMPLE_THEME_CONTENT } from "../../themes/layout/ThemeLayoutPreview";
import {
  applyLayoutAdjust,
  isLayoutAdjustDefault,
  LAYOUT_OFFSET_MAX,
  LAYOUT_OFFSET_MIN,
  LAYOUT_SCALE_MAX,
  LAYOUT_SCALE_MIN,
  readLayoutAdjust,
} from "../../themes/layout/adjust";
import type { ThemeContent, ThemeLayout } from "../../themes/layout/types";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";

const PREVIEW_CONTENT: Record<"bible" | "worship" | "notes", ThemeContent> = {
  bible: SAMPLE_THEME_CONTENT,
  worship: {
    text: "Amazing grace, how sweet the sound\nThat saved a wretch like me",
    reference: "Amazing Grace · Verse 1",
  },
  notes: {
    text: "Faith grows when we hear the Word and act on it.",
    reference: "Point 1",
  },
};

function sliderProgress(value: number, min: number, max: number): CSSProperties {
  const progress = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return { "--dtb-slider-progress": `${progress}%` } as CSSProperties;
}

function AdjustSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="dtb-slider-field dtb-layout-adjust__field">
      <div className="dtb-slider-field__head">
        <span>{label}</span>
        <span className="dtb-slider-field__value">{format(value)}</span>
      </div>
      <div className="dtb-layout-adjust__row">
        <button
          type="button"
          className="dtb-slider-field__step-button"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label={`${label} −`}
        >
          −
        </button>
        <input
          type="range"
          className="dtb-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          style={sliderProgress(value, min, max)}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          aria-label={label}
          aria-valuetext={format(value)}
        />
        <button
          type="button"
          className="dtb-slider-field__step-button"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label={`${label} +`}
        >
          +
        </button>
      </div>
    </div>
  );
}

interface Props {
  themeName: string;
  layout: ThemeLayout;
  quickSettings: DockFullscreenQuickThemeSettings;
  onQuickSettingsChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  scope: "bible" | "worship" | "notes" | "global";
}

export default function LayoutThemeAdjustPanel({ themeName, layout, quickSettings, onQuickSettingsChange, scope }: Props) {
  const { t } = useTranslation();
  const adjust = readLayoutAdjust(quickSettings);
  const isLowerThird = layout.format === "lower-third";
  const content = PREVIEW_CONTENT[scope === "global" ? "bible" : scope];
  const previewLayout = useMemo(
    () => applyLayoutAdjust(layout, adjust),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, adjust.layoutTextScale, adjust.layoutRefScale, adjust.layoutOffsetY],
  );

  const set = (patch: Partial<DockFullscreenQuickThemeSettings>) =>
    onQuickSettingsChange((prev) => ({ ...prev, ...patch }));

  const referenceLabel = scope === "bible"
    ? t("bgPicker.layoutRefSize", "Reference size")
    : t("bgPicker.layoutLabelSize", "Label size");

  return (
    <div className="dtb-layout-adjust">
      <div className="dtb-layout-adjust__preview" aria-hidden="true">
        <ThemeLayoutPreview layout={previewLayout} content={content} style={{ position: "absolute", inset: 0 }} />
      </div>

      <div className="dtb-layout-adjust__theme">
        <Icon name="palette" size={14} />
        <span>{themeName}</span>
      </div>

      <AdjustSlider
        label={t("bgPicker.layoutTextSize", "Text size")}
        value={adjust.layoutTextScale}
        min={LAYOUT_SCALE_MIN}
        max={LAYOUT_SCALE_MAX}
        step={5}
        format={(v) => `${v}%`}
        onChange={(v) => set({ layoutTextScale: v })}
      />

      <AdjustSlider
        label={referenceLabel}
        value={adjust.layoutRefScale}
        min={LAYOUT_SCALE_MIN}
        max={LAYOUT_SCALE_MAX}
        step={5}
        format={(v) => `${v}%`}
        onChange={(v) => set({ layoutRefScale: v })}
      />

      {isLowerThird && (
        <AdjustSlider
          label={t("bgPicker.layoutPosition", "Move up / down")}
          value={adjust.layoutOffsetY}
          min={LAYOUT_OFFSET_MIN}
          max={LAYOUT_OFFSET_MAX}
          step={4}
          format={(v) => (v === 0 ? t("bgPicker.layoutPositionDefault", "As designed") : `${v < 0 ? "↑" : "↓"} ${Math.abs(v)}px`)}
          onChange={(v) => set({ layoutOffsetY: v })}
        />
      )}

      <button
        type="button"
        className="dtb-layout-adjust__reset"
        disabled={isLayoutAdjustDefault(adjust)}
        onClick={() => set({ layoutTextScale: 100, layoutRefScale: 100, layoutOffsetY: 0 })}
      >
        <Icon name="restart_alt" size={14} />
        <span>{t("bgPicker.layoutReset", "Back to the theme's sizes")}</span>
      </button>

      <p className="dtb-layout-adjust__note">
        <Icon name="info" size={13} />
        <span>
          {t(
            "bgPicker.layoutThemeNote",
            "This theme sets its own fonts, colours and effects. To change those, open Themes in the app and click Customize.",
          )}
        </span>
      </p>
    </div>
  );
}
