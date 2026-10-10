import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";

/**
 * Text effects, set up the way church presentation software does it
 * (EasyWorship / ProPresenter): two independent effects that can be combined.
 *
 *   Outline — on/off, colour, thickness
 *   Shadow  — on/off, a style (Soft / Classic / Strong), colour, distance, blur, opacity
 *
 * Both write the same theme fields the overlays already read
 * (textOutline / textOutlineColor / textOutlineWidth / textShadow), so saved
 * themes keep working. Older one-off effects (echo, neon, splice…) still render;
 * their first shadow layer is shown here and replaced when edited.
 */

export interface TextEffectsPickerProps {
  settings: DockFullscreenQuickThemeSettings;
  onChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  target?: "all" | "verse" | "reference";
}

export interface ShadowValues {
  color: string;
  distance: number;
  blur: number;
  opacity: number;
}

const OUTLINE_MIN = 1;
const OUTLINE_MAX = 12;
const OUTLINE_DEFAULT = 2;

export const SHADOW_STYLES: Array<{ id: "soft" | "classic" | "strong"; label: string; values: Omit<ShadowValues, "color"> }> = [
  { id: "soft", label: "Soft", values: { distance: 3, blur: 8, opacity: 70 } },
  { id: "classic", label: "Classic", values: { distance: 4, blur: 2, opacity: 95 } },
  { id: "strong", label: "Strong", values: { distance: 6, blur: 6, opacity: 100 } },
];

const DEFAULT_SHADOW: ShadowValues = { color: "#000000", ...SHADOW_STYLES[1].values };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function toHexColor(input: string): string {
  const value = input.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value.slice(1).split("").map((c) => c + c).join("")}`.toLowerCase();
  }
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]].map((n) => clamp(Number(n), 0, 255).toString(16).padStart(2, "0")).join("")}`;
  }
  return "#000000";
}

function colorAlpha(input: string): number {
  const rgba = input.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/i);
  if (rgba) return Math.max(0, Math.min(1, Number(rgba[1])));
  if (/^#[0-9a-f]{8}$/i.test(input.trim())) return parseInt(input.trim().slice(7, 9), 16) / 255;
  return 1;
}

function hexToRgba(hex: string, opacity: number): string {
  const clean = toHexColor(hex).slice(1);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(100, opacity)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(2))})`;
}

/** Read the first layer of a CSS text-shadow ("none" / empty → null). */
export function parseShadow(textShadow?: string | null): ShadowValues | null {
  const raw = String(textShadow ?? "").trim();
  if (!raw || raw.toLowerCase() === "none") return null;
  // First layer only: split on commas that are not inside rgb()/rgba().
  const firstLayer = raw.split(/,(?![^(]*\))/)[0]?.trim() ?? "";
  const colorMatch = firstLayer.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\b(?:black|white)\b)/i);
  const colorToken = colorMatch?.[1] ?? "#000000";
  const lengths = firstLayer.replace(colorToken, "").match(/-?\d+(?:\.\d+)?(?:px)?/g) ?? [];
  const [x = 0, y = 0, blur = 0] = lengths.map((n) => parseFloat(n));
  const color = colorToken.toLowerCase() === "white" ? "#ffffff" : colorToken.toLowerCase() === "black" ? "#000000" : colorToken;
  return {
    color: toHexColor(color),
    distance: clamp(Math.max(Math.abs(x), Math.abs(y)), 0, 20),
    blur: clamp(blur, 0, 20),
    opacity: clamp(colorAlpha(color) * 100, 0, 100),
  };
}

/** Down-right shadow, the direction EasyWorship and ProPresenter use by default. */
export function buildShadow(values: ShadowValues): string {
  const x = Math.round(values.distance * 0.7);
  const y = values.distance;
  return `${x}px ${y}px ${values.blur}px ${hexToRgba(values.color, values.opacity)}`;
}

function matchingShadowStyle(values: ShadowValues | null): string | null {
  if (!values) return null;
  const match = SHADOW_STYLES.find((style) => (
    style.values.distance === values.distance
    && style.values.blur === values.blur
    && style.values.opacity === values.opacity
  ));
  return match?.id ?? null;
}

function SliderStepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="dtb-fx-field">
      <span className="dtb-effect-slider-label">{label}</span>
      <div className="dtb-effect-slider-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          className="dtb-effect-range-slider"
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
        />
        <div className="dtb-effect-stepper">
          <button type="button" onClick={() => onChange(Math.max(min, value - step))} aria-label={`Decrease ${label}`}>−</button>
          <span>{value}{suffix}</span>
          <button type="button" onClick={() => onChange(Math.min(max, value + step))} aria-label={`Increase ${label}`}>+</button>
        </div>
      </div>
    </div>
  );
}

function EffectToggle({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="dtb-fx-toggle-row">
      <span className="dtb-fx-toggle-label">
        <Icon name={icon} size={13} />
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`dtb-fx-switch${checked ? " dtb-fx-switch--on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="dtb-fx-switch__knob" />
      </button>
    </div>
  );
}

export const TextEffectsPicker: React.FC<TextEffectsPickerProps> = ({
  settings,
  onChange,
  target = "all",
}) => {
  const { t } = useTranslation();

  const outlineOn = Boolean(settings.textOutline) && (settings.textOutlineWidth ?? 0) > 0;
  const outlineWidth = clamp(settings.textOutlineWidth || OUTLINE_DEFAULT, OUTLINE_MIN, OUTLINE_MAX);
  const outlineColor = toHexColor(settings.textOutlineColor || "#000000");

  const shadow = useMemo(() => parseShadow(settings.textShadow), [settings.textShadow]);
  const shadowOn = shadow !== null;
  const shadowValues = shadow ?? DEFAULT_SHADOW;
  const activeStyle = matchingShadowStyle(shadow);

  const ensureVisibleText = (next: DockFullscreenQuickThemeSettings) => {
    if (next.fontColor === "transparent") next.fontColor = "#ffffff";
    return next;
  };

  const setOutline = useCallback((patch: { on?: boolean; width?: number; color?: string }) => {
    onChange((prev) => {
      const on = patch.on ?? (Boolean(prev.textOutline) && (prev.textOutlineWidth ?? 0) > 0);
      const width = clamp(patch.width ?? (prev.textOutlineWidth || OUTLINE_DEFAULT), OUTLINE_MIN, OUTLINE_MAX);
      return ensureVisibleText({
        ...prev,
        textOutline: on,
        textOutlineWidth: on ? width : 0,
        textOutlineColor: patch.color ?? prev.textOutlineColor ?? "#000000",
      });
    });
  }, [onChange]);

  const setShadow = useCallback((next: ShadowValues | null) => {
    onChange((prev) => ensureVisibleText({
      ...prev,
      textShadow: next ? buildShadow(next) : "none",
    }));
  }, [onChange]);

  const [expanded, setExpanded] = useState(false);
  const summary = [
    outlineOn ? `${t("bgPicker.outline", "Outline")} ${outlineWidth}px` : null,
    shadowOn
      ? (activeStyle
        ? `${t(`bgPicker.shadow_${activeStyle}`, SHADOW_STYLES.find((style) => style.id === activeStyle)?.label ?? "")} ${t("bgPicker.shadow", "Shadow").toLowerCase()}`
        : t("bgPicker.shadow", "Shadow"))
      : null,
  ].filter(Boolean).join(" · ") || t("bgPicker.noEffects", "None");

  return (
    <div className={`dtb-control-section dtb-effects-section dtb-collapsible${expanded ? " dtb-collapsible--open" : ""}`} data-target={target}>
      <button
        type="button"
        className="dtb-control-section__head dtb-collapsible__head"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="dtb-control-section__icon">
          <Icon name="auto_awesome" size={14} />
        </span>
        <span className="dtb-control-section__title">{t("bgPicker.effects", "Effects")}</span>
        {!expanded && <span className="dtb-collapsible__summary">{summary}</span>}
        <Icon name="expand_more" size={14} className="dtb-collapsible__chevron" />
      </button>

      {expanded && (
      <div className="dtb-control-section__body dtb-fx-body">
        {/* ── Outline ── */}
        <div className="dtb-fx-group">
          <EffectToggle
            label={t("bgPicker.outline", "Outline")}
            icon="text_fields"
            checked={outlineOn}
            onChange={(on) => setOutline({ on })}
          />
          {outlineOn && (
            <div className="dtb-fx-group__body">
              <div className="dtb-fx-color-row">
                <span className="dtb-effect-slider-label">{t("common.color", "Color")}</span>
                <input
                  type="color"
                  value={outlineColor}
                  className="dtb-effect-color-swatch"
                  onChange={(event) => setOutline({ color: event.target.value })}
                  aria-label={t("bgPicker.outlineColor", "Outline color")}
                />
              </div>
              <SliderStepper
                label={t("bgPicker.thickness", "Thickness")}
                value={outlineWidth}
                min={OUTLINE_MIN}
                max={OUTLINE_MAX}
                suffix="px"
                onChange={(width) => setOutline({ width })}
              />
            </div>
          )}
        </div>

        {/* ── Shadow ── */}
        <div className="dtb-fx-group">
          <EffectToggle
            label={t("bgPicker.shadow", "Shadow")}
            icon="shadow"
            checked={shadowOn}
            onChange={(on) => setShadow(on ? { ...DEFAULT_SHADOW, color: shadowValues.color } : null)}
          />
          {shadowOn && (
            <div className="dtb-fx-group__body">
              <div className="dtb-fx-styles" role="group" aria-label={t("bgPicker.shadowStyle", "Shadow style")}>
                {SHADOW_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    className={`dtb-fx-style${activeStyle === style.id ? " dtb-fx-style--active" : ""}`}
                    aria-pressed={activeStyle === style.id}
                    onClick={() => setShadow({ ...style.values, color: shadowValues.color })}
                  >
                    {t(`bgPicker.shadow_${style.id}`, style.label)}
                  </button>
                ))}
              </div>
              <div className="dtb-fx-color-row">
                <span className="dtb-effect-slider-label">{t("common.color", "Color")}</span>
                <input
                  type="color"
                  value={shadowValues.color}
                  className="dtb-effect-color-swatch"
                  onChange={(event) => setShadow({ ...shadowValues, color: event.target.value })}
                  aria-label={t("bgPicker.shadowColor", "Shadow color")}
                />
              </div>
              <SliderStepper
                label={t("bgPicker.distance", "Distance")}
                value={shadowValues.distance}
                min={0}
                max={20}
                suffix="px"
                onChange={(distance) => setShadow({ ...shadowValues, distance })}
              />
              <SliderStepper
                label={t("bgPicker.blur", "Blur")}
                value={shadowValues.blur}
                min={0}
                max={20}
                suffix="px"
                onChange={(blur) => setShadow({ ...shadowValues, blur })}
              />
              <SliderStepper
                label={t("bgPicker.opacity", "Opacity")}
                value={shadowValues.opacity}
                min={10}
                max={100}
                step={5}
                suffix="%"
                onChange={(opacity) => setShadow({ ...shadowValues, opacity })}
              />
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

