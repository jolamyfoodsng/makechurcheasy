/**
 * dsl.ts — tiny helpers for writing countdown design presets as plain ThemeLayout data.
 * Everything here returns ordinary layers, so users can edit every part in the layer editor.
 */
import type { LayerAnchor, LayerAnimation, LayerStyle, ThemeLayer, ThemeLayout } from "../../themes/layout/types";

export const NONE: LayerAnimation = { preset: "none", duration: 0, delay: 0, easing: "out-cubic" };

export const anim = (
  preset: LayerAnimation["preset"],
  duration: number,
  delay = 0,
  extra: Partial<LayerAnimation> = {},
): LayerAnimation => ({ preset, duration, delay, easing: "out-expo", ...extra });

interface LayerOpts {
  name?: string;
  anchor?: LayerAnchor;
  parentId?: string;
  rotation?: number;
  opacity?: number;
  in?: LayerAnimation;
  out?: LayerAnimation;
  loop?: ThemeLayer["loop"];
}

/** A box (background, card, bar, ring). x/y are the anchor point (centre by default). */
export function box(id: string, x: number, y: number, w: number, h: number, style: LayerStyle, o: LayerOpts = {}): ThemeLayer {
  return {
    id,
    name: o.name ?? id,
    type: "box",
    anchor: o.anchor ?? "center",
    x,
    y,
    w,
    h,
    ...(o.parentId ? { parentId: o.parentId } : {}),
    ...(o.rotation ? { rotation: o.rotation } : {}),
    ...(o.opacity !== undefined ? { opacity: o.opacity } : {}),
    style,
    in: o.in ?? anim("fade", 500),
    out: o.out ?? anim("fade", 300),
    ...(o.loop ? { loop: o.loop } : {}),
  };
}

/** A text layer. `content` uses tokens such as {tm}, {mm}, {title}. */
export function text(
  id: string,
  content: string,
  x: number,
  y: number,
  w: number,
  h: number,
  style: LayerStyle,
  o: LayerOpts = {},
): ThemeLayer {
  return {
    id,
    name: o.name ?? id,
    type: "text",
    content,
    hideWhenEmpty: true,
    anchor: o.anchor ?? "center",
    x,
    y,
    w,
    h,
    ...(o.parentId ? { parentId: o.parentId } : {}),
    ...(o.rotation ? { rotation: o.rotation } : {}),
    ...(o.opacity !== undefined ? { opacity: o.opacity } : {}),
    style: { verticalAlign: "middle", align: "center", nowrap: true, ...style },
    in: o.in ?? anim("fade", 500, 150),
    out: o.out ?? anim("fade", 250),
    ...(o.loop ? { loop: o.loop } : {}),
  };
}

export function line(id: string, x: number, y: number, w: number, h: number, fill: string, o: LayerOpts = {}): ThemeLayer {
  return { ...box(id, x, y, w, h, { fill }, o), type: "divider" };
}

export const COUNTDOWN_FONT_IMPORTS = ["/fonts/google/google-fonts.css", "/fonts/countdown-fonts.css"];

export function countdownLayout(layers: ThemeLayer[]): ThemeLayout {
  return {
    version: 1,
    format: "fullscreen",
    kind: "countdown",
    swap: "content",
    layers,
    fontImports: COUNTDOWN_FONT_IMPORTS,
  };
}

/** Hard-stop outline made from eight text shadows (for outlined digits). */
export function outlineShadow(color: string, px: number): string {
  const d = px;
  const pts: Array<[number, number]> = [[-d, -d], [d, -d], [-d, d], [d, d], [0, -d], [0, d], [-d, 0], [d, 0]];
  return pts.map(([x, y]) => `${x}px ${y}px 0 ${color}`).join(", ");
}
