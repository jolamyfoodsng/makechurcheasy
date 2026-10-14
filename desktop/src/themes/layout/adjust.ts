/**
 * adjust.ts — the few changes an operator can make to a ready-made layer theme
 * from the Dock without opening the Theme Editor: text size, reference size and
 * (lower thirds) how high it sits. Stored as plain theme-settings fields so they
 * travel with the theme packet; applied by the overlay just before drawing.
 */
import { hasTokens, isVerseTextPattern } from "./content";
import { DESIGN_HEIGHT, DESIGN_WIDTH, type LayerAnimation, type ThemeLayer, type ThemeLayout } from "./types";

export interface LayoutAdjustSettings {
  /** Verse / lyric / note text size, percent of the theme's own (100 = as designed). */
  layoutTextScale?: number;
  /** Reference / label size, percent. */
  layoutRefScale?: number;
  /** Verse / lyric / note line spacing, percent of the theme's own (100 = as designed). */
  layoutLineHeight?: number;
  /** Show or hide the theme's title (reference / label line). Missing = as the theme is set. */
  layoutShowTitle?: boolean;
  /** Lower thirds: move the whole graphic up (negative) or down, in 1080p pixels. */
  layoutOffsetY?: number;
  /** Full screen: darken the background, percent (0 = as designed). */
  layoutBackdropDarkness?: number;
}

export const LAYOUT_SCALE_MIN = 50;
export const LAYOUT_SCALE_MAX = 200;
export const LAYOUT_LINE_MIN = 70;
export const LAYOUT_LINE_MAX = 160;
export const LAYOUT_OFFSET_MIN = -400;
export const LAYOUT_OFFSET_MAX = 120;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Reads the adjust fields from theme settings / quick settings (missing = as designed). */
export function readLayoutAdjust(source: unknown): Required<Omit<LayoutAdjustSettings, "layoutBackdropDarkness" | "layoutShowTitle">> {
  const s = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  return {
    layoutTextScale: clamp(num(s.layoutTextScale) ?? 100, LAYOUT_SCALE_MIN, LAYOUT_SCALE_MAX),
    layoutRefScale: clamp(num(s.layoutRefScale) ?? 100, LAYOUT_SCALE_MIN, LAYOUT_SCALE_MAX),
    layoutLineHeight: clamp(num(s.layoutLineHeight) ?? 100, LAYOUT_LINE_MIN, LAYOUT_LINE_MAX),
    layoutOffsetY: clamp(num(s.layoutOffsetY) ?? 0, LAYOUT_OFFSET_MIN, LAYOUT_OFFSET_MAX),
  };
}

/** The Dock's Show title switch: true / false when the operator set it, undefined = leave the theme's own setting. */
export function readLayoutShowTitle(source: unknown): boolean | undefined {
  const s = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  return typeof s.layoutShowTitle === "boolean" ? s.layoutShowTitle : undefined;
}

/** Only the adjust fields that are set, for merging quick settings into a live theme. */
export function pickLayoutAdjust(source: unknown): LayoutAdjustSettings {
  const s = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  const out: LayoutAdjustSettings = {};
  if (num(s.layoutTextScale) !== undefined) out.layoutTextScale = num(s.layoutTextScale);
  if (num(s.layoutRefScale) !== undefined) out.layoutRefScale = num(s.layoutRefScale);
  if (num(s.layoutLineHeight) !== undefined) out.layoutLineHeight = num(s.layoutLineHeight);
  if (typeof s.layoutShowTitle === "boolean") out.layoutShowTitle = s.layoutShowTitle;
  if (num(s.layoutOffsetY) !== undefined) out.layoutOffsetY = num(s.layoutOffsetY);
  if (num(s.layoutBackdropDarkness) !== undefined) out.layoutBackdropDarkness = num(s.layoutBackdropDarkness);
  return out;
}

export function isLayoutAdjustDefault(adjust: LayoutAdjustSettings): boolean {
  const a = readLayoutAdjust(adjust);
  return a.layoutTextScale === 100
    && a.layoutRefScale === 100
    && a.layoutLineHeight === 100
    && a.layoutOffsetY === 0
    && readLayoutShowTitle(adjust) === undefined;
}

// ───────────────────────────── background ─────────────────────────────

export type LayoutBackdropKind = "theme" | "off" | "color" | "image" | "video";

export interface LayoutBackdrop {
  kind: LayoutBackdropKind;
  color: string;
  colorEnd: string;
  angle: number;
  image: string;
  video: string;
  /** 0–1 */
  darkness: number;
}

const FADE: LayerAnimation = { preset: "fade", duration: 350, delay: 0, easing: "linear" };

/**
 * A media URL the OBS browser source can load. The Dock stores Media Library files
 * as /uploads/<file>; file paths are reduced to that, anything else is left as is.
 * Values the overlay replaces with a CSS marker (large data URIs) are not usable here.
 */
export function resolveBackdropMediaUrl(value: unknown): string {
  let v = typeof value === "string" ? value.trim() : "";
  if (!v || v.startsWith("__FROM_")) return "";
  if (/^(?:blob:|https?:\/\/)/i.test(v)) return v;
  if (/^data:(?:image|video)\//i.test(v)) return v;
  if (v.startsWith("/uploads/")) return v;
  if (v.startsWith("uploads/")) return `/${v}`;
  if (/^file:\/\//i.test(v)) {
    try { v = decodeURIComponent(v.replace(/^file:\/\//i, "")); } catch { v = v.replace(/^file:\/\//i, ""); }
  }
  if (v.startsWith("/") && !/^\/(?:Users|home|Volumes|var|private|tmp)\//.test(v)) return v;
  const name = v.split(/[\\/]/).pop()?.trim() || "";
  return name ? `/uploads/${encodeURIComponent(name)}` : "";
}

/**
 * The background the operator picked in the Dock (Background tab), read from the same
 * quick-setting fields the classic themes use, plus the darkness slider.
 * "theme" means: keep the theme's own background.
 */
export function readLayoutBackdrop(source: unknown): LayoutBackdrop {
  const s = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string).trim() : "");
  const type = str("backgroundType").toLowerCase();
  const image = resolveBackdropMediaUrl(str("backgroundImage") || str("backgroundImageFilePath"));
  const video = resolveBackdropMediaUrl(str("backgroundVideo") || str("backgroundVideoFilePath"));
  const color = str("backgroundColor");
  let kind: LayoutBackdropKind = "theme";
  if (type === "off") kind = "off";
  else if (type === "color" && color) kind = "color";
  else if (type === "image" && image) kind = "image";
  else if (type === "video" && video) kind = "video";
  return {
    kind,
    color,
    colorEnd: str("backgroundColorEnd"),
    angle: num(s.bgGradientAngle) ?? 135,
    image,
    video,
    darkness: clamp(num(s.layoutBackdropDarkness) ?? 0, 0, 100) / 100,
  };
}

export function isLayoutBackdropDefault(b: LayoutBackdrop): boolean {
  return b.kind === "theme" && b.darkness === 0;
}

/** A layer that fills (nearly) the whole canvas and holds no text: the theme's own background. */
function isBackgroundLayer(layer: ThemeLayer): boolean {
  return !layer.hidden
    && !layer.parentId
    && (layer.type === "box" || layer.type === "image")
    && layer.w >= DESIGN_WIDTH * 0.9
    && typeof layer.h === "number"
    && layer.h >= DESIGN_HEIGHT * 0.9;
}

function fullCanvasLayer(id: string, name: string, style: ThemeLayer["style"], type: ThemeLayer["type"] = "box", opacity?: number): ThemeLayer {
  return {
    id,
    name,
    type,
    anchor: "top-left",
    x: 0,
    y: 0,
    w: DESIGN_WIDTH,
    h: DESIGN_HEIGHT,
    ...(opacity !== undefined ? { opacity } : {}),
    style,
    in: FADE,
    out: FADE,
  };
}

/** Full-screen layouts only: swap the theme's background for the Dock's pick and/or darken it. */
function applyBackdrop(layers: ThemeLayer[], b: LayoutBackdrop): ThemeLayer[] {
  if (isLayoutBackdropDefault(b)) return layers;
  const replace = b.kind !== "theme";
  const next = replace ? layers.map((l) => (isBackgroundLayer(l) ? { ...l, hidden: true } : l)) : layers.slice();

  const added: ThemeLayer[] = [];
  if (b.kind === "color") {
    const gradient = b.colorEnd
      ? { type: "linear" as const, angle: b.angle, stops: [{ color: b.color, at: 0 }, { color: b.colorEnd, at: 100 }] }
      : undefined;
    added.push(fullCanvasLayer("mce-backdrop", "Dock background", gradient ? { gradient } : { fill: b.color }));
  } else if (b.kind === "image") {
    added.push(fullCanvasLayer("mce-backdrop", "Dock background", { src: b.image, fit: "cover" }, "image"));
  } else if (b.kind === "video") {
    added.push(fullCanvasLayer("mce-backdrop", "Dock background", { videoSrc: b.video, fit: "cover" }, "image"));
  }
  if (b.darkness > 0 && b.kind !== "off") {
    added.push(fullCanvasLayer("mce-backdrop-dim", "Dock background darkness", { fill: "#000000" }, "box", b.darkness));
  }
  if (added.length === 0) return next;

  // Replaced backgrounds go at the very bottom. With the theme's own background kept,
  // the dimmer sits right above it so the text stays bright.
  let at = 0;
  if (!replace) {
    for (let i = 0; i < layers.length; i++) if (isBackgroundLayer(layers[i])) at = i + 1;
  }
  next.splice(at, 0, ...added);
  return next;
}

/** The layout with the operator's size / position / background changes applied (same object when none). */
export function applyLayoutAdjust(layout: ThemeLayout, source: unknown): ThemeLayout {
  const a = readLayoutAdjust(source);
  const offset = layout.format === "lower-third" ? a.layoutOffsetY : 0;
  const backdrop = layout.format === "fullscreen" ? readLayoutBackdrop(source) : null;
  const backdropChanged = backdrop !== null && !isLayoutBackdropDefault(backdrop);
  const showTitle = readLayoutShowTitle(source);
  // Switch on = the theme's default (heading shown); switch off = hidden.
  const nextShowHeading = showTitle === undefined ? layout.showHeading : showTitle ? undefined : false;
  const titleChanged = nextShowHeading !== layout.showHeading;
  if (a.layoutTextScale === 100 && a.layoutRefScale === 100 && a.layoutLineHeight === 100 && offset === 0 && !backdropChanged && !titleChanged) return layout;
  const textK = a.layoutTextScale / 100;
  const refK = a.layoutRefScale / 100;
  const lineK = a.layoutLineHeight / 100;
  const layers = layout.layers.map((layer) => {
    let next = layer;
    if (layer.type === "text" && hasTokens(layer.content)) {
      const isVerse = isVerseTextPattern(layer.content);
      const k = isVerse ? textK : refK;
      // Line spacing only matters for the verse / lyric / note body (the renderer's default is 1.3).
      const lk = isVerse ? lineK : 1;
      if (k !== 1 || lk !== 1) {
        const style = { ...layer.style };
        if (k !== 1) {
          if (typeof style.fontSize === "number") style.fontSize = Math.round(style.fontSize * k);
          if (typeof style.minFontSize === "number") style.minFontSize = Math.round(style.minFontSize * k);
        }
        if (lk !== 1) style.lineHeight = Math.round((style.lineHeight || 1.3) * lk * 100) / 100;
        next = { ...next, style };
      }
    }
    if (offset && !layer.parentId) next = { ...next, y: layer.y + offset };
    return next;
  });
  const out: ThemeLayout = { ...layout, layers: backdropChanged && backdrop ? applyBackdrop(layers, backdrop) : layers };
  if (titleChanged) {
    if (nextShowHeading === undefined) delete out.showHeading;
    else out.showHeading = nextShowHeading;
  }
  return out;
}
