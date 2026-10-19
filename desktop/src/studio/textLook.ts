/**
 * textLook.ts — the Studio's quick Text Settings that sit on top of any theme:
 * text colour, shadow, alignment and background. (Size, Bold and Italic live in studioEngine.)
 *
 * Each one defaults to "theme": the theme's own look is left alone until the operator changes it.
 */
import type { BibleThemeSettings } from "../bible/types";
import { isVerseTextPattern } from "../themes/layout/content";

export type TextShadowChoice = "theme" | "on" | "off";
export type TextAlignChoice = "theme" | "left" | "center" | "right";

export interface StudioTextLook {
  /** CSS colour for the words; "" keeps the theme's colour. */
  color: string;
  shadow: TextShadowChoice;
  align: TextAlignChoice;
  /** Id of a background preset; "theme" keeps the theme's own background. */
  background: string;
}

export const DEFAULT_TEXT_LOOK: StudioTextLook = { color: "", shadow: "theme", align: "theme", background: "theme" };

export interface TextBackgroundPreset {
  id: string;
  label: string;
  /** Gradient start / end (a flat colour when they match). */
  from: string;
  to: string;
}

export const TEXT_BACKGROUNDS: TextBackgroundPreset[] = [
  { id: "theme", label: "Theme background", from: "#10124a", to: "#6a2cc4" },
  { id: "midnight", label: "Midnight blue", from: "#0b1226", to: "#1d3a85" },
  { id: "black", label: "Black", from: "#000000", to: "#000000" },
  { id: "charcoal", label: "Charcoal", from: "#16181d", to: "#2b2f38" },
  { id: "wine", label: "Deep red", from: "#3a0a12", to: "#8a1c2b" },
  { id: "forest", label: "Forest green", from: "#07241b", to: "#14634a" },
  { id: "royal", label: "Royal purple", from: "#1a0b3d", to: "#5b2bb8" },
];

export const SHADOW_ON_CSS = "0 4px 14px rgba(0, 0, 0, 0.7)";

export function textBackgroundPreset(id: string): TextBackgroundPreset | null {
  return TEXT_BACKGROUNDS.find((p) => p.id === id && p.id !== "theme") ?? null;
}

export function isDefaultTextLook(look: StudioTextLook): boolean {
  return look.color === "" && look.shadow === "theme" && look.align === "theme" && look.background === "theme";
}

/** The next alignment when the align button is pressed: theme → left → centre → right → theme. */
export function nextTextAlign(current: TextAlignChoice): TextAlignChoice {
  return current === "theme" ? "left" : current === "left" ? "center" : current === "center" ? "right" : "theme";
}

/** The theme with the operator's colour, shadow, alignment and background on top (same object when nothing is set). */
export function withTextLook(settings: BibleThemeSettings, look: StudioTextLook): BibleThemeSettings {
  if (isDefaultTextLook(look)) return settings;
  const next: BibleThemeSettings = { ...settings };
  const shadowCss = look.shadow === "on" ? SHADOW_ON_CSS : look.shadow === "off" ? "none" : "";
  if (look.color) next.fontColor = look.color;
  if (shadowCss) next.textShadow = shadowCss;
  if (look.align !== "theme") next.textAlign = look.align;
  const background = textBackgroundPreset(look.background);
  if (background) {
    // The same fields the Dock's Background tab sets; layer themes read them too.
    const flat = background.from === background.to;
    Object.assign(next, {
      backgroundType: "color",
      backgroundColor: background.from,
      backgroundColorEnd: flat ? "" : background.to,
      bgGradientAngle: 160,
    });
  }
  const layout = settings.layout;
  if (layout && Array.isArray(layout.layers) && (look.color || shadowCss || look.align !== "theme")) {
    next.layout = {
      ...layout,
      layers: layout.layers.map((layer) => {
        // Only the words themselves (verse, lyric, note): not the reference, title or timer.
        if (layer.type !== "text" || !layer.style || typeof layer.style.fontSize !== "number" || !isVerseTextPattern(layer.content)) return layer;
        return {
          ...layer,
          style: {
            ...layer.style,
            ...(look.color ? { color: look.color } : {}),
            ...(shadowCss ? { textShadow: shadowCss } : {}),
            ...(look.align !== "theme" ? { align: look.align } : {}),
          },
        };
      }),
    };
  }
  return next;
}
