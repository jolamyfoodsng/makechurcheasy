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
  LAYOUT_LINE_MAX,
  LAYOUT_LINE_MIN,
  LAYOUT_OFFSET_MAX,
  LAYOUT_OFFSET_MIN,
  LAYOUT_SCALE_MAX,
  LAYOUT_SCALE_MIN,
  readLayoutAdjust,
  readLayoutShowTitle,
} from "../../themes/layout/adjust";
import { hasHeading, isHeadingShown } from "../../themes/layout/heading";
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
  const titleOverride = readLayoutShowTitle(quickSettings);
  const canToggleTitle = hasHeading(layout);
  // What the output will do: the Dock's choice, else the theme's own Heading setting.
  const titleShown = titleOverride ?? isHeadingShown(layout);
  const isLowerThird = layout.format === "lower-third";
  const content = PREVIEW_CONTENT[scope === "global" ? "bible" : scope];
  const previewLayout = useMemo(
    () => applyLayoutAdjust(layout, { ...adjust, layoutShowTitle: titleOverride }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, adjust.layoutTextScale, adjust.layoutRefScale, adjust.layoutLineHeight, adjust.layoutOffsetY, titleOverride],
  );

  const set = (patch: Partial<DockFullscreenQuickThemeSettings>) =>
    onQuickSettingsChange((prev) => ({ ...prev, ...patch }));

  const referenceLabel = scope === "bible"
    ? t("bgPicker.layoutRefSize", "Reference size")
    : t("bgPicker.layoutLabelSize", "Label size");

  const titleLabel = scope === "bible"
    ? t("bgPicker.layoutShowReference", "Show reference")
    : t("bgPicker.layoutShowTitle", "Show title");

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

      <AdjustSlider
        label={t("bgPicker.layoutLineHeight", "Line height")}
        value={adjust.layoutLineHeight}
        min={LAYOUT_LINE_MIN}
        max={LAYOUT_LINE_MAX}
        step={5}
        format={(v) => `${v}%`}
        onChange={(v) => set({ layoutLineHeight: v })}
      />

      {canToggleTitle && (
        <div className="dtb-toggle-field dtb-toggle-field--inline dtb-layout-adjust__toggle">
          <div className="dtb-toggle-field__copy">
            <span className="dtb-toggle-field__label">{titleLabel}</span>
          </div>
          <button
            type="button"
            className={`dtb-toggle${titleShown ? " dtb-toggle--on" : ""}`}
            onClick={() => set({ layoutShowTitle: !titleShown })}
            role="switch"
            aria-checked={titleShown}
            aria-label={titleLabel}
          >
            <span className="dtb-toggle__knob" />
          </button>
        </div>
      )}

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
        disabled={isLayoutAdjustDefault({ ...adjust, layoutShowTitle: titleOverride })}
        onClick={() => set({ layoutTextScale: 100, layoutRefScale: 100, layoutLineHeight: 100, layoutOffsetY: 0, layoutShowTitle: undefined })}
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
