/**
 * backgroundPatterns.ts — slow, moving patterns behind full-screen themes.
 *
 * A theme background used to be one flat gradient. `withAnimatedBackground` adds two
 * ordinary layers right above it, so every full-screen theme feels alive:
 *
 *   • "Animated pattern": a tiled CSS pattern (dots, stripes, grid …) that pans slowly
 *     sideways with the existing `drift` loop. Tile sizes are fixed pixels, so the
 *     pattern never stretches while it moves.
 *   • "Soft glow": a faint light that breathes with the existing `pulse` loop.
 *
 * Both are plain layers (no renderer change): they can be edited, hidden or deleted in
 * the Theme Editor, and the Dock's own background pick hides them together with the
 * theme background (they count as background layers, see adjust.ts).
 */
import type { LayerAnimation, ThemeLayer, ThemeLayout } from "./types";

export type PatternKind = "dots" | "chevrons" | "stripes" | "grid" | "rings" | "scallops" | "orbs";

export const PATTERN_KINDS: readonly PatternKind[] = ["dots", "chevrons", "stripes", "grid", "rings", "scallops", "orbs"];

type Rgb = [number, number, number];

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

const fade = (duration: number, delay = 0): LayerAnimation => ({ preset: "fade", duration, delay, easing: "out-expo" });

function rgbOf(color: string | undefined): Rgb | null {
  const c = (color || "").trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as Rgb;
  const r = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return r ? [Number(r[1]), Number(r[2]), Number(r[3])] : null;
}

/** 0 (black) – 1 (white): average brightness of the colours a background is made of. */
export function backgroundBrightness(layer: ThemeLayer): number {
  const colours = layer.style.gradient?.stops?.map((s) => s.color) ?? [layer.style.fill];
  const rgbs = colours.map(rgbOf).filter((c): c is Rgb => c !== null);
  if (rgbs.length === 0) return 0.1; // unknown: treat as dark
  const sum = rgbs.reduce((t, [r, g, b]) => t + (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, 0);
  return sum / rgbs.length;
}

/** Pattern CSS (a `background` shorthand value) in the tint colour at the given strength. */
export function patternCss(kind: PatternKind, tint: Rgb, alpha: number): string {
  const c = (k: number) => `rgba(${tint[0]},${tint[1]},${tint[2]},${Math.min(1, +(alpha * k).toFixed(3))})`;
  switch (kind) {
    case "dots":
      return `radial-gradient(circle, ${c(1)} 3px, transparent 4px) 0 0 / 64px 64px, radial-gradient(circle, ${c(0.6)} 2px, transparent 3px) 32px 32px / 64px 64px`;
    case "chevrons":
      return [
        `linear-gradient(135deg, ${c(0.7)} 25%, transparent 25%) -40px 0 / 80px 80px`,
        `linear-gradient(225deg, ${c(0.7)} 25%, transparent 25%) -40px 0 / 80px 80px`,
        `linear-gradient(315deg, ${c(0.7)} 25%, transparent 25%) 0 0 / 80px 80px`,
        `linear-gradient(45deg, ${c(0.7)} 25%, transparent 25%) 0 0 / 80px 80px`,
      ].join(", ");
    case "stripes":
      return `repeating-linear-gradient(135deg, ${c(1)} 0px, ${c(1)} 3px, transparent 3px, transparent 44px)`;
    case "grid":
      return `linear-gradient(${c(1)} 1px, transparent 1px) 0 0 / 72px 72px, linear-gradient(90deg, ${c(1)} 1px, transparent 1px) 0 0 / 72px 72px`;
    case "rings":
      return `repeating-radial-gradient(circle at 30% 40%, transparent 0px, transparent 54px, ${c(1)} 54px, ${c(1)} 56px)`;
    case "scallops":
      return `radial-gradient(circle at 50% 100%, transparent 0px, transparent 34px, ${c(1)} 35px, ${c(1)} 37px, transparent 38px) 0 0 / 76px 38px`;
    case "orbs":
      return [
        `radial-gradient(circle at 25% 30%, ${c(2.2)} 0%, transparent 14%) 0 0 / 960px 540px`,
        `radial-gradient(circle at 75% 70%, ${c(1.7)} 0%, transparent 18%) 0 0 / 960px 540px`,
        `radial-gradient(circle at 62% 18%, ${c(1.3)} 0%, transparent 10%) 0 0 / 960px 540px`,
      ].join(", ");
  }
}

/** One cycle of the sideways pan, ms. Longer = calmer; a pan covers one screen width. */
const PAN_MS: Record<PatternKind, number> = {
  dots: 42000,
  chevrons: 52000,
  stripes: 36000,
  grid: 60000,
  rings: 46000,
  scallops: 48000,
  orbs: 38000,
};

/** Quiet by design: the verse must stay easy to read. */
const ALPHA_ON_DARK = 0.07;
const ALPHA_ON_LIGHT = 0.06;

function hashOf(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The pattern a theme gets by default: stable per theme id, spread over all kinds. */
export function patternKindFor(themeId: string): PatternKind {
  return PATTERN_KINDS[hashOf(themeId) % PATTERN_KINDS.length];
}

function isBackground(layer: ThemeLayer): boolean {
  return (
    !layer.hidden &&
    !layer.parentId &&
    layer.type === "box" &&
    layer.w >= DESIGN_WIDTH * 0.9 &&
    typeof layer.h === "number" &&
    layer.h >= DESIGN_HEIGHT * 0.9 &&
    Boolean(layer.style.fill || layer.style.gradient) &&
    !layer.style.src &&
    !layer.style.videoSrc
  );
}

export const PATTERN_LAYER_ID = "mce-pattern";
export const PATTERN_GLOW_LAYER_ID = "mce-pattern-glow";

/** The two moving layers for one background. */
export function patternLayers(kind: PatternKind, bright: number): ThemeLayer[] {
  const light = bright > 0.62;
  const tint: Rgb = light ? [20, 20, 40] : [255, 255, 255];
  const glowColour = light ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.10)";
  return [
    {
      id: PATTERN_LAYER_ID,
      name: "Animated pattern",
      type: "box",
      anchor: "top-left",
      x: 0,
      y: 0,
      w: DESIGN_WIDTH,
      h: DESIGN_HEIGHT,
      style: { fill: patternCss(kind, tint, light ? ALPHA_ON_LIGHT : ALPHA_ON_DARK) },
      in: fade(900, 250),
      out: fade(300),
      loop: { preset: "drift", duration: PAN_MS[kind] },
    },
    {
      id: PATTERN_GLOW_LAYER_ID,
      name: "Soft glow",
      type: "box",
      anchor: "top-left",
      x: 0,
      y: 0,
      w: DESIGN_WIDTH,
      h: DESIGN_HEIGHT,
      style: { gradient: { type: "radial", stops: [{ color: glowColour, at: 0 }, { color: "rgba(255,255,255,0)", at: 62 }] } },
      in: fade(900, 250),
      out: fade(300),
      loop: { preset: "pulse", duration: 9000 },
    },
  ];
}

/**
 * A full-screen layout with the animated pattern + glow right above its background.
 * Same object back when it is not full screen, has no plain colour/gradient background,
 * or already has the layers (so it is safe to call twice).
 */
export function withAnimatedBackground(layout: ThemeLayout, themeId: string, kind?: PatternKind): ThemeLayout {
  if (layout.format !== "fullscreen") return layout;
  if (layout.layers.some((l) => l.id === PATTERN_LAYER_ID)) return layout;
  const at = layout.layers.findIndex(isBackground);
  if (at < 0) return layout;
  const added = patternLayers(kind ?? patternKindFor(themeId), backgroundBrightness(layout.layers[at]));
  return { ...layout, layers: [...layout.layers.slice(0, at + 1), ...added, ...layout.layers.slice(at + 1)] };
}
