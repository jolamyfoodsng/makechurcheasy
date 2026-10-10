/**
 * Theme layout model — the data behind editor-built themes.
 *
 * A layout is plain JSON stored on a theme's settings (`BibleThemeSettings.layout`).
 * It travels with the existing overlay packet to the Bible, Worship and Notes
 * overlays, where `renderer.ts` draws it. Positions are in a fixed 1920×1080
 * design space and are scaled to the real OBS canvas at render time.
 */

export const THEME_LAYOUT_VERSION = 1 as const;
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export type ThemeLayoutFormat = "lower-third" | "fullscreen";

/** Which point of the layer's box sits at (x, y). Also the direction it grows. */
export type LayerAnchor =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export type LayerType = "box" | "image" | "text" | "divider";

export type AnimationPreset =
  | "none"
  | "fade"
  | "slide-up" | "slide-down" | "slide-left" | "slide-right"
  | "wipe-left" | "wipe-right" | "wipe-up" | "wipe-down"
  | "grow-x" | "grow-y"
  | "scale" | "pop"
  | "blur-in"
  | "word-rise" | "line-rise";

export type AnimationEasing = "linear" | "out-cubic" | "out-expo" | "in-out" | "spring";

export interface LayerAnimation {
  preset: AnimationPreset;
  /** ms */
  duration: number;
  /** ms, relative to the start of the in (or out) sequence */
  delay: number;
  easing: AnimationEasing;
  /** px for slides (design space). Default 40. */
  distance?: number;
  /** ms between words/lines for word-rise / line-rise. Default 35. */
  stagger?: number;
}

export type LoopPreset = "none" | "drift" | "pulse" | "shimmer";

export interface LayerLoop {
  preset: LoopPreset;
  /** ms for one cycle */
  duration: number;
}

export interface GradientStop {
  color: string;
  /** 0–100 */
  at: number;
}

export interface LayerGradient {
  type: "linear" | "radial";
  /** degrees, linear only */
  angle?: number;
  stops: GradientStop[];
}

export interface LayerStyle {
  // ── Surface (box / divider / text background) ──
  fill?: string;
  gradient?: LayerGradient;
  /** px backdrop blur ("glass"). Expensive in OBS — keep to one layer. */
  backdropBlur?: number;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  /** CSS box-shadow */
  shadow?: string;
  /** CSS clip-path for angled tabs, e.g. "polygon(0 0, 100% 0, 92% 100%, 0 100%)" */
  clipPath?: string;
  /** [top, right, bottom, left] px */
  padding?: [number, number, number, number];

  // ── Image ──
  src?: string;
  fit?: "cover" | "contain" | "fill";

  // ── Text ──
  fontFamily?: string;
  fontSize?: number;
  /** Smallest size auto-fit may shrink to. Defaults to 60% of fontSize. */
  minFontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  textShadow?: string;
  /** Max lines before auto-fit shrinks the text. */
  maxLines?: number;
  /** Show verse numbers inside {text}. Default true. */
  verseNumbers?: boolean;
  verseNumberColor?: string;
}

export interface ThemeLayer {
  id: string;
  name: string;
  type: LayerType;
  /**
   * Text content for text layers. Tokens are filled from the live packet:
   * {text} {reference} {referenceShort} {book} {chapter} {verses}
   * {chapterVerse} {translation}. A layer whose content is exactly "{text}"
   * gets verse-line rendering (verse numbers, line breaks, auto-fit).
   */
  content?: string;
  /** Hide the layer when its content resolves to an empty string. Default true. */
  hideWhenEmpty?: boolean;
  /** Nest inside another layer: x/y become relative to the parent's box. */
  parentId?: string;

  anchor: LayerAnchor;
  x: number;
  y: number;
  w: number;
  /** "auto" grows with the content (text layers). */
  h: number | "auto";
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  locked?: boolean;

  style: LayerStyle;
  in: LayerAnimation;
  out: LayerAnimation;
  loop?: LayerLoop;
}

export interface ThemeLayout {
  version: typeof THEME_LAYOUT_VERSION;
  format: ThemeLayoutFormat;
  /** Layers in draw order: first = bottom. */
  layers: ThemeLayer[];
  /** Stylesheet URLs (e.g. Google Fonts css2 links) loaded before first show. */
  fontImports?: string[];
  /**
   * What happens when new content arrives while the theme is on screen:
   * "content" (default) re-animates only layers that use tokens,
   * "all" plays the whole theme out and back in.
   */
  swap?: "content" | "all";
}

/** Live content the overlays already receive (BibleSlide subset). */
export interface ThemeContent {
  text: string;
  reference: string;
  /** Lines per slide from the packet; 1 hides verse numbers like the legacy overlay. */
  lineCount?: number;
}

export function isThemeLayout(value: unknown): value is ThemeLayout {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ThemeLayout>;
  return v.version === THEME_LAYOUT_VERSION && Array.isArray(v.layers);
}
