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

export type WarnLevel = "green" | "yellow" | "red";

/** Seven-segment digits drawn as SVG (countdown designs). */
export interface SegmentStyle {
  /** Segment thickness as % of the digit height. Default 12. */
  thickness?: number;
  /** Gap between segment tips, design px. Default 2.4. */
  gap?: number;
  /** Space between digits as % of a digit's width. Default 18. */
  spacing?: number;
  /** Lean in degrees (0–25) for an italic look. */
  slant?: number;
  /** Colour of unlit segments. Default: same as the digit colour. */
  offColor?: string;
  /** Opacity of unlit segments, 0–1. 0 hides them. */
  offOpacity?: number;
  /** Glow blur in px. 0 = none. */
  glow?: number;
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

  // ── Image / media ──
  /** Image layers: the picture. Box layers: a picture drawn over the fill (e.g. a theme background). */
  src?: string;
  /** Image and box layers: play this video (muted, looping) instead of a still. */
  videoSrc?: string;
  fit?: "cover" | "contain" | "fill";
  /** Darken the picture / video, percent 0–100 (0 = as is). */
  dim?: number;

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
  /**
   * Colour of *important words* (words typed between asterisks). Unset: worked out from the theme
   * (see emphasis.ts), so each theme has its own highlight.
   */
  emphasisColor?: string;
  /** Font weight of important words. Unset: a step bolder than the text (at least Bold). */
  emphasisWeight?: number;
  /** Underline the text (e.g. a centred reference). */
  underline?: boolean;
  /**
   * Text layers only: the box hugs its text (up to `w`) instead of always being
   * `w` wide — for tabs and labels with a fill behind the words. Use with h "auto".
   */
  hug?: boolean;

  // ── Countdown designs ──
  /** Text layers: draw the digits as a seven-segment display instead of a font. */
  segment?: SegmentStyle;
  /** Colour follows the timer's green / yellow / red level: the text, the fill, or the border. */
  warn?: "text" | "fill" | "border";
  /** Custom colours for the levels (defaults: green #22c55e, yellow #eab308, red #ef4444). */
  warnColors?: Partial<Record<WarnLevel, string>>;
  /**
   * Box layers bound to the timer: "elapsed" / "remaining" resize the fill as a progress bar,
   * "marker" slides the layer along its parent's width, "zones" paints green / yellow / red
   * stretches matching the warning times.
   */
  progress?: "elapsed" | "remaining" | "marker" | "zones";
  /** Text layers: flip animation each time the value changes (flip clocks). */
  flip?: boolean;
  /** Text layers: keep to one line and shrink to fit the width (times, never wrapped). */
  nowrap?: boolean;
  /** Text layers: roughen the edges (stamp / distressed look), 0–10. */
  roughen?: number;
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
  /**
   * Part of the heading (the reference / label line and the box behind it).
   * Heading boxes hide with their text when the label is empty or switched off.
   * Layouts with no flagged layers treat every non-verse token text as heading.
   */
  heading?: boolean;

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
  /** false hides the heading (reference / label and its box). Default true. */
  showHeading?: boolean;
  /** "countdown": a timer design (tokens come from the timer, no scripture heading). */
  kind?: "bible" | "countdown";
}

/** Live content the overlays already receive (BibleSlide subset). */
export interface ThemeContent {
  text: string;
  reference: string;
  /** Lines per slide from the packet; 1 hides verse numbers like the legacy overlay. */
  lineCount?: number;
  /** Put every line of the verse text on its own row (Line By Line compare: one translation under the other). */
  stackLines?: boolean;
  /** Extra token values (countdown designs: time, mm, ss, title…). */
  extra?: Record<string, string>;
  /** Timer state for warning colours and progress bars. */
  live?: ThemeLive;
}

export interface ThemeLive {
  /** undefined = no warnings for this timer. */
  level?: WarnLevel;
  /** 0–1 of the timer used up. */
  fraction: number;
  /** Fraction of the timer where yellow starts / red starts (for the zones bar). */
  yellowFrom?: number;
  redFrom?: number;
}

export function isThemeLayout(value: unknown): value is ThemeLayout {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ThemeLayout>;
  return v.version === THEME_LAYOUT_VERSION && Array.isArray(v.layers);
}
