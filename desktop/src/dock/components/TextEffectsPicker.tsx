import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";

export type TextEffectId =
  | "none"
  | "drop"
  | "glow"
  | "echo"
  | "outline"
  | "splice"
  | "neon";

export interface TextEffectConfig {
  id: TextEffectId;
  label: string;
  description?: string;
}

export const TEXT_EFFECTS: TextEffectConfig[] = [
  { id: "none", label: "None" },
  { id: "drop", label: "Drop Shadow" },
  { id: "glow", label: "Glow" },
  { id: "echo", label: "Echo" },
  { id: "outline", label: "Outline" },
  { id: "splice", label: "Splice" },
  { id: "neon", label: "Neon" },
];

export interface TextEffectsPickerProps {
  settings: DockFullscreenQuickThemeSettings;
  onChange: (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => void;
  target?: "all" | "verse" | "reference";
}

/**
 * Helper to parse hex color and opacity into rgba
 */
function hexToRgba(hex: string, opacity = 1): string {
  if (!hex || hex === "transparent") return "transparent";
  if (hex.startsWith("rgba")) return hex;
  const cleanHex = hex.replace("#", "");
  let r = 0, g = 0, b = 0;
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length >= 6) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

/**
 * Infer active effect from current settings
 */
export function inferActiveEffect(settings: DockFullscreenQuickThemeSettings): TextEffectId {
  const ts = settings.textShadow?.trim().toLowerCase() ?? "";
  const outline = settings.textOutline;
  const outlineWidth = settings.textOutlineWidth ?? 0;

  if (outline && outlineWidth > 0 && ts && ts !== "none") {
    return "splice";
  }
  if (outline && outlineWidth > 0) {
    return "outline";
  }
  if (!ts || ts === "none") {
    return "none";
  }
  if (ts.includes("#fff") && (ts.includes("40px") || ts.includes("80px"))) {
    return "neon";
  }
  if (ts.includes("0 0 ") && !ts.includes("px 0 #")) {
    return "glow";
  }
  if ((ts.split(",").length >= 2 && ts.includes(" 0 #")) || ts.includes(" 0 rgb")) {
    return "echo";
  }
  return "drop";
}

export const TextEffectsPicker: React.FC<TextEffectsPickerProps> = ({
  settings,
  onChange,
  target = "all",
}) => {
  const { t } = useTranslation();
  const activeEffect = inferActiveEffect(settings);

  // Local effect parameters state for smooth live slider & color control (defaults to black #000000)
  const [thickness, setThickness] = useState<number>(settings.textOutlineWidth || 4);
  const [outlineColor, setOutlineColor] = useState<string>(settings.textOutlineColor || "#000000");
  const [shadowColor, setShadowColor] = useState<string>("#000000");
  const [glowColor, setGlowColor] = useState<string>("#000000");
  const [intensity, setIntensity] = useState<number>(75);
  const [offset, setOffset] = useState<number>(8);
  const [direction, setDirection] = useState<number>(45);
  const [blur, setBlur] = useState<number>(10);
  const [opacity, setOpacity] = useState<number>(85);
  const [bgRoundness, setBgRoundness] = useState<number>(settings.referenceBackgroundRadius || 8);
  const [bgColor, setBgColor] = useState<string>(settings.referenceBackgroundColor || "#000000");

  // Keep colors in sync with incoming settings
  useEffect(() => {
    if (settings.textOutlineColor) {
      setOutlineColor(settings.textOutlineColor);
    }
    if (settings.referenceBackgroundColor) {
      setBgColor(settings.referenceBackgroundColor);
    }
    if (typeof settings.textOutlineWidth === "number" && settings.textOutlineWidth > 0) {
      setThickness(settings.textOutlineWidth);
    }
    if (typeof settings.referenceBackgroundRadius === "number") {
      setBgRoundness(settings.referenceBackgroundRadius);
    }
  }, [settings.textOutlineColor, settings.referenceBackgroundColor, settings.textOutlineWidth, settings.referenceBackgroundRadius]);

  const applyEffectValues = useCallback(
    (
      effectId: TextEffectId,
      currentParams: {
        thick: number;
        outColor: string;
        shColor: string;
        glColor: string;
        intens: number;
        off: number;
        dir: number;
        blr: number;
        opc: number;
        bgRad: number;
        bgCol: string;
      }
    ) => {
      onChange((prev) => {
        const next = { ...prev };
        switch (effectId) {
          case "none":
            next.textShadow = "none";
            next.textOutline = false;
            next.textOutlineWidth = 0;
            if (next.fontColor === "transparent") next.fontColor = "#ffffff";
            break;

          case "drop": {
            const rad = (currentParams.dir * Math.PI) / 180;
            const x = Math.round(Math.cos(rad) * currentParams.off);
            const y = Math.round(Math.sin(rad) * currentParams.off);
            const rgba = hexToRgba(currentParams.shColor, currentParams.opc / 100);
            next.textShadow = `${x}px ${y}px ${currentParams.blr}px ${rgba}`;
            next.textOutline = false;
            next.textOutlineWidth = 0;
            if (next.fontColor === "transparent") next.fontColor = "#ffffff";
            break;
          }

          case "glow": {
            const glowRgba = hexToRgba(currentParams.glColor, currentParams.intens / 100);
            const blur1 = Math.round(4 * (currentParams.intens / 50));
            const blur2 = Math.round(14 * (currentParams.intens / 50));
            const blur3 = Math.round(28 * (currentParams.intens / 50));
            next.textShadow = `0 0 ${blur1}px ${glowRgba}, 0 0 ${blur2}px ${glowRgba}, 0 0 ${blur3}px ${glowRgba}`;
            next.textOutline = false;
            next.textOutlineWidth = 0;
            if (next.fontColor === "transparent") next.fontColor = "#ffffff";
            break;
          }

          case "echo": {
            const rad = (currentParams.dir * Math.PI) / 180;
            const step = Math.max(2, currentParams.off / 3);
            const x1 = Math.round(Math.cos(rad) * step);
            const y1 = Math.round(Math.sin(rad) * step);
            const x2 = Math.round(Math.cos(rad) * step * 2);
            const y2 = Math.round(Math.sin(rad) * step * 2);
            const x3 = Math.round(Math.cos(rad) * step * 3);
            const y3 = Math.round(Math.sin(rad) * step * 3);
            const c1 = hexToRgba(currentParams.shColor, (currentParams.opc / 100) * 0.8);
            const c2 = hexToRgba(currentParams.shColor, (currentParams.opc / 100) * 0.5);
            const c3 = hexToRgba(currentParams.shColor, (currentParams.opc / 100) * 0.25);
            next.textShadow = `${x1}px ${y1}px 0 ${c1}, ${x2}px ${y2}px 0 ${c2}, ${x3}px ${y3}px 0 ${c3}`;
            next.textOutline = false;
            next.textOutlineWidth = 0;
            if (next.fontColor === "transparent") next.fontColor = "#ffffff";
            break;
          }

          case "outline":
            next.textOutline = true;
            next.textOutlineWidth = currentParams.thick;
            next.textOutlineColor = currentParams.outColor;
            next.textShadow = "none";
            if (next.fontColor === "transparent") next.fontColor = "#ffffff";
            break;

          case "splice": {
            const rad = (currentParams.dir * Math.PI) / 180;
            const x = Math.round(Math.cos(rad) * currentParams.off);
            const y = Math.round(Math.sin(rad) * currentParams.off);
            next.textOutline = true;
            next.textOutlineWidth = currentParams.thick;
            next.textOutlineColor = currentParams.outColor;
            next.textShadow = `${x}px ${y}px 0 ${currentParams.shColor}`;
            if (next.fontColor === "transparent") next.fontColor = "#ffffff";
            break;
          }

          case "neon": {
            const nColor = currentParams.glColor || "#000000";
            const b1 = Math.round(4 * (currentParams.intens / 70));
            const b2 = Math.round(10 * (currentParams.intens / 70));
            const b3 = Math.round(20 * (currentParams.intens / 70));
            const b4 = Math.round(40 * (currentParams.intens / 70));
            next.textShadow = `0 0 ${b1}px #ffffff, 0 0 ${b2}px #ffffff, 0 0 ${b3}px ${nColor}, 0 0 ${b4}px ${nColor}`;
            next.textOutline = false;
            next.textOutlineWidth = 0;
            if (next.fontColor === "transparent") next.fontColor = "#ffffff";
            break;
          }

        }
        return next;
      });
    },
    [onChange]
  );

  const handleSelectEffect = useCallback(
    (effectId: TextEffectId) => {
      applyEffectValues(effectId, {
        thick: thickness,
        outColor: outlineColor,
        shColor: shadowColor,
        glColor: glowColor,
        intens: intensity,
        off: offset,
        dir: direction,
        blr: blur,
        opc: opacity,
        bgRad: bgRoundness,
        bgCol: bgColor,
      });
    },
    [applyEffectValues, bgColor, bgRoundness, blur, direction, glowColor, intensity, offset, opacity, outlineColor, shadowColor, thickness]
  );

  return (
    <div className="dtb-effects-section" data-target={target}>
      <div className="dtb-control-section__head">
        <span className="dtb-control-section__title">{t("bgPicker.effects", "Effects")}</span>
      </div>

      {/* Dropdown Selector for Text Effects */}
      <div className="dtb-effect-select-wrap">
        <label className="dtb-compact-select-field">
          <span className="dtb-position-label">{t("bgPicker.textEffects", "Text Effect")}</span>
          <select
            className="dtb-compact-select-field__select"
            value={activeEffect}
            onChange={(e) => handleSelectEffect(e.target.value as TextEffectId)}
            aria-label={t("bgPicker.textEffects", "Text Effects")}
          >
            {TEXT_EFFECTS.map((effect) => (
              <option key={effect.id} value={effect.id}>
                {effect.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Contextual Sliders beneath Active Effect */}
      {activeEffect !== "none" && (
        <div className="dtb-effect-controls-panel">
          {(activeEffect === "outline" || activeEffect === "splice") && (
            <div className="dtb-effect-param-row">
              <div className="dtb-effect-slider-header">
                <span className="dtb-effect-slider-label">{t("bgPicker.thickness", "Thickness")}</span>
              </div>
              <div className="dtb-effect-slider-wrap">
                <input
                  type="range"
                  min={1}
                  max={24}
                  step={1}
                  value={thickness}
                  className="dtb-effect-range-slider"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setThickness(val);
                    applyEffectValues(activeEffect, {
                      thick: val,
                      outColor: outlineColor,
                      shColor: shadowColor,
                      glColor: glowColor,
                      intens: intensity,
                      off: offset,
                      dir: direction,
                      blr: blur,
                      opc: opacity,
                      bgRad: bgRoundness,
                      bgCol: bgColor,
                    });
                  }}
                />
                <div className="dtb-effect-stepper">
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.max(1, thickness - 1);
                      setThickness(val);
                      applyEffectValues(activeEffect, {
                        thick: val,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: offset,
                        dir: direction,
                        blr: blur,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    −
                  </button>
                  <span>{thickness}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.min(24, thickness + 1);
                      setThickness(val);
                      applyEffectValues(activeEffect, {
                        thick: val,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: offset,
                        dir: direction,
                        blr: blur,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="dtb-effect-color-row">
                <span className="dtb-effect-slider-label">{t("common.color", "Color")}</span>
                <input
                  type="color"
                  value={outlineColor}
                  className="dtb-effect-color-swatch"
                  onChange={(e) => {
                    const col = e.target.value;
                    setOutlineColor(col);
                    applyEffectValues(activeEffect, {
                      thick: thickness,
                      outColor: col,
                      shColor: shadowColor,
                      glColor: glowColor,
                      intens: intensity,
                      off: offset,
                      dir: direction,
                      blr: blur,
                      opc: opacity,
                      bgRad: bgRoundness,
                      bgCol: bgColor,
                    });
                  }}
                />
              </div>
            </div>
          )}

          {(activeEffect === "glow" || activeEffect === "neon") && (
            <div className="dtb-effect-param-row">
              <div className="dtb-effect-slider-header">
                <span className="dtb-effect-slider-label">{t("bgPicker.intensity", "Intensity")}</span>
              </div>
              <div className="dtb-effect-slider-wrap">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={intensity}
                  className="dtb-effect-range-slider"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setIntensity(val);
                    applyEffectValues(activeEffect, {
                      thick: thickness,
                      outColor: outlineColor,
                      shColor: shadowColor,
                      glColor: glowColor,
                      intens: val,
                      off: offset,
                      dir: direction,
                      blr: blur,
                      opc: opacity,
                      bgRad: bgRoundness,
                      bgCol: bgColor,
                    });
                  }}
                />
                <div className="dtb-effect-stepper">
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.max(10, intensity - 5);
                      setIntensity(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: val,
                        off: offset,
                        dir: direction,
                        blr: blur,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    −
                  </button>
                  <span>{intensity}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.min(100, intensity + 5);
                      setIntensity(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: val,
                        off: offset,
                        dir: direction,
                        blr: blur,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="dtb-effect-color-row">
                <span className="dtb-effect-slider-label">{t("common.color", "Color")}</span>
                <input
                  type="color"
                  value={glowColor}
                  className="dtb-effect-color-swatch"
                  onChange={(e) => {
                    const col = e.target.value;
                    setGlowColor(col);
                    applyEffectValues(activeEffect, {
                      thick: thickness,
                      outColor: outlineColor,
                      shColor: shadowColor,
                      glColor: col,
                      intens: intensity,
                      off: offset,
                      dir: direction,
                      blr: blur,
                      opc: opacity,
                      bgRad: bgRoundness,
                      bgCol: bgColor,
                    });
                  }}
                />
              </div>
            </div>
          )}

          {(activeEffect === "drop" || activeEffect === "echo") && (
            <div className="dtb-effect-param-row">
              <div className="dtb-effect-slider-header">
                <span className="dtb-effect-slider-label">{t("bgPicker.offset", "Offset / Distance")}</span>
              </div>
              <div className="dtb-effect-slider-wrap">
                <input
                  type="range"
                  min={1}
                  max={40}
                  step={1}
                  value={offset}
                  className="dtb-effect-range-slider"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setOffset(val);
                    applyEffectValues(activeEffect, {
                      thick: thickness,
                      outColor: outlineColor,
                      shColor: shadowColor,
                      glColor: glowColor,
                      intens: intensity,
                      off: val,
                      dir: direction,
                      blr: blur,
                      opc: opacity,
                      bgRad: bgRoundness,
                      bgCol: bgColor,
                    });
                  }}
                />
                <div className="dtb-effect-stepper">
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.max(1, offset - 1);
                      setOffset(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: val,
                        dir: direction,
                        blr: blur,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    −
                  </button>
                  <span>{offset}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.min(40, offset + 1);
                      setOffset(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: val,
                        dir: direction,
                        blr: blur,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="dtb-effect-slider-header" style={{ marginTop: "10px" }}>
                <span className="dtb-effect-slider-label">{t("bgPicker.direction", "Direction")}</span>
              </div>
              <div className="dtb-effect-slider-wrap">
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={5}
                  value={direction}
                  className="dtb-effect-range-slider"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDirection(val);
                    applyEffectValues(activeEffect, {
                      thick: thickness,
                      outColor: outlineColor,
                      shColor: shadowColor,
                      glColor: glowColor,
                      intens: intensity,
                      off: offset,
                      dir: val,
                      blr: blur,
                      opc: opacity,
                      bgRad: bgRoundness,
                      bgCol: bgColor,
                    });
                  }}
                />
                <div className="dtb-effect-stepper">
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.max(-180, direction - 15);
                      setDirection(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: offset,
                        dir: val,
                        blr: blur,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    −
                  </button>
                  <span>{direction}°</span>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.min(180, direction + 15);
                      setDirection(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: offset,
                        dir: val,
                        blr: blur,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="dtb-effect-slider-header" style={{ marginTop: "10px" }}>
                <span className="dtb-effect-slider-label">{t("bgPicker.blur", "Blur")}</span>
              </div>
              <div className="dtb-effect-slider-wrap">
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={blur}
                  className="dtb-effect-range-slider"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setBlur(val);
                    applyEffectValues(activeEffect, {
                      thick: thickness,
                      outColor: outlineColor,
                      shColor: shadowColor,
                      glColor: glowColor,
                      intens: intensity,
                      off: offset,
                      dir: direction,
                      blr: val,
                      opc: opacity,
                      bgRad: bgRoundness,
                      bgCol: bgColor,
                    });
                  }}
                />
                <div className="dtb-effect-stepper">
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.max(0, blur - 1);
                      setBlur(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: offset,
                        dir: direction,
                        blr: val,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    −
                  </button>
                  <span>{blur}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.min(40, blur + 1);
                      setBlur(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: offset,
                        dir: direction,
                        blr: val,
                        opc: opacity,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="dtb-effect-slider-header" style={{ marginTop: "10px" }}>
                <span className="dtb-effect-slider-label">{t("bgPicker.transparency", "Transparency / Opacity")}</span>
              </div>
              <div className="dtb-effect-slider-wrap">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={opacity}
                  className="dtb-effect-range-slider"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setOpacity(val);
                    applyEffectValues(activeEffect, {
                      thick: thickness,
                      outColor: outlineColor,
                      shColor: shadowColor,
                      glColor: glowColor,
                      intens: intensity,
                      off: offset,
                      dir: direction,
                      blr: blur,
                      opc: val,
                      bgRad: bgRoundness,
                      bgCol: bgColor,
                    });
                  }}
                />
                <div className="dtb-effect-stepper">
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.max(10, opacity - 5);
                      setOpacity(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: offset,
                        dir: direction,
                        blr: blur,
                        opc: val,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    −
                  </button>
                  <span>{opacity}%</span>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.min(100, opacity + 5);
                      setOpacity(val);
                      applyEffectValues(activeEffect, {
                        thick: thickness,
                        outColor: outlineColor,
                        shColor: shadowColor,
                        glColor: glowColor,
                        intens: intensity,
                        off: offset,
                        dir: direction,
                        blr: blur,
                        opc: val,
                        bgRad: bgRoundness,
                        bgCol: bgColor,
                      });
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="dtb-effect-color-row">
                <span className="dtb-effect-slider-label">{t("common.color", "Color")}</span>
                <input
                  type="color"
                  value={shadowColor}
                  className="dtb-effect-color-swatch"
                  onChange={(e) => {
                    const col = e.target.value;
                    setShadowColor(col);
                    applyEffectValues(activeEffect, {
                      thick: thickness,
                      outColor: outlineColor,
                      shColor: col,
                      glColor: glowColor,
                      intens: intensity,
                      off: offset,
                      dir: direction,
                      blr: blur,
                      opc: opacity,
                      bgRad: bgRoundness,
                      bgCol: bgColor,
                    });
                  }}
                />
              </div>
            </div>
          )}



        </div>
      )}
    </div>
  );
};

