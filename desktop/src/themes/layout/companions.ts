/**
 * companions.ts — every built-in layer theme ships both looks.
 *
 * A lower-third preset gets a full-screen companion and a full-screen preset gets a
 * lower-third companion, built from the same colours, fonts and text styles, so a
 * theme picked for Bible / Worship / Notes looks the same family in either mode.
 * Both are plain ThemeLayouts: people can open either one in the editor and change it.
 */
import type { LayerAnimation, LayerStyle, ThemeLayer, ThemeLayout } from "./types";
import { isVerseTextPattern } from "./content";

const anim = (preset: LayerAnimation["preset"], duration: number, delay = 0, extra: Partial<LayerAnimation> = {}): LayerAnimation => ({
  preset, duration, delay, easing: "out-expo", ...extra,
});
const none: LayerAnimation = { preset: "none", duration: 0, delay: 0, easing: "out-cubic" };

const area = (l: ThemeLayer) => l.w * (l.h === "auto" ? 0 : l.h);
const hasSurface = (l: ThemeLayer) => Boolean(l.style.fill || l.style.gradient);

function verseLayer(layout: ThemeLayout): ThemeLayer | undefined {
  return layout.layers.find((l) => l.type === "text" && isVerseTextPattern(l.content));
}

/** The text layer that carries the reference / label (prefers {reference}, then {book}…). */
function labelLayer(layout: ThemeLayout): ThemeLayer | undefined {
  const texts = layout.layers.filter((l) => l.type === "text" && !isVerseTextPattern(l.content) && /\{\w+\}/.test(l.content || ""));
  return texts.find((l) => (l.content || "").includes("{reference}"))
    ?? texts.find((l) => (l.content || "").includes("{book}"))
    ?? texts[0];
}

/** The biggest filled box: the panel, band or full-screen background. */
function mainSurface(layout: ThemeLayout): ThemeLayer | undefined {
  return layout.layers
    .filter((l) => (l.type === "box") && hasSurface(l))
    .sort((a, b) => area(b) - area(a))[0];
}

function rgbOf(color: string | undefined): [number, number, number, number] | null {
  const c = (color || "").trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)).concat(1) as [number, number, number, number];
  const r = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (r) return [Number(r[1]), Number(r[2]), Number(r[3]), r[4] === undefined ? 1 : Number(r[4])];
  return null;
}

/** True for a real colour (not white, black or grey). */
function isColourful(l: ThemeLayer): boolean {
  const c = rgbOf(l.style.fill ?? l.style.gradient?.stops?.[0]?.color);
  if (!c) return Boolean(l.style.gradient);
  return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 40;
}

/** A thin accent (divider, strip, edge) to echo in the companion — a coloured one first. */
function accent(layout: ThemeLayout, exclude?: ThemeLayer): ThemeLayer | undefined {
  const thin = layout.layers.filter((l) => l !== exclude && hasSurface(l) && (l.type === "divider" || l.w <= 120 || (l.h !== "auto" && l.h <= 12)));
  return thin.find(isColourful) ?? thin[0];
}

/** Full screen needs a solid background: see-through bars become solid, fades fall back. */
function solidSurface(s: LayerStyle | undefined, fallback: LayerStyle): LayerStyle {
  if (!s) return fallback;
  if (s.gradient) {
    const clear = s.gradient.stops.some((stop) => (rgbOf(stop.color)?.[3] ?? 1) < 0.5);
    return clear ? fallback : { gradient: s.gradient };
  }
  const c = rgbOf(s.fill);
  if (!c) return s.fill ? { fill: s.fill } : fallback;
  if (c[3] < 0.35) return fallback;
  return { fill: `rgb(${c[0]},${c[1]},${c[2]})` };
}

function surfaceStyle(s: LayerStyle | undefined, fallback: LayerStyle): LayerStyle {
  if (!s) return fallback;
  return { fill: s.fill, gradient: s.gradient, backdropBlur: s.backdropBlur };
}

function textLook(s: LayerStyle): LayerStyle {
  return {
    fontFamily: s.fontFamily,
    fontWeight: s.fontWeight,
    italic: s.italic,
    color: s.color,
    letterSpacing: s.letterSpacing,
    textTransform: s.textTransform,
    textShadow: s.textShadow,
    underline: s.underline,
    verseNumberColor: s.verseNumberColor,
    emphasisColor: s.emphasisColor,
    emphasisWeight: s.emphasisWeight,
  };
}

/** Label look incl. a tab / pill fill behind the words. */
function labelLook(s: LayerStyle): LayerStyle {
  const look = textLook(s);
  if (s.fill || s.gradient) {
    return { ...look, hug: true, fill: s.fill, gradient: s.gradient, radius: s.radius, padding: s.padding ?? [8, 18, 8, 18] };
  }
  return look;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Full-screen look for a lower-third preset. */
export function fullscreenFromLowerThird(lt: ThemeLayout): ThemeLayout {
  const surface = mainSurface(lt);
  const verse = verseLayer(lt);
  const label = labelLayer(lt);
  const bar = accent(lt, surface);
  const vs = verse?.style ?? {};
  const layers: ThemeLayer[] = [
    {
      id: "bg",
      name: "Background",
      type: "box",
      anchor: "top-left",
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
      style: solidSurface(surface?.style, { gradient: { type: "linear", angle: 180, stops: [{ color: "#141b2d", at: 0 }, { color: "#05070d", at: 100 }] } }),
      in: anim("fade", 500),
      out: anim("fade", 400, 200),
    },
  ];
  {
    // Presets without a label (e.g. Note Card) still show the reference on a full screen.
    const ls: LayerStyle = label ? label.style : { fontFamily: vs.fontFamily, fontWeight: 700, color: vs.color, fontSize: 34 };
    layers.push({
      id: "reference",
      name: "Reference",
      type: "text",
      // A lone book or translation would lose the verse number on a full screen.
      content: label && /\{(reference|chapterVerse)\}/.test(label.content || "") ? label.content : "{reference}",
      anchor: "top-center",
      x: 960,
      y: 210,
      w: 1500,
      h: "auto",
      style: { ...labelLook(ls), fontSize: clamp(Math.round((ls.fontSize || 30) * 1.6), 40, 72), minFontSize: 26, align: "center", maxLines: 1 },
      in: anim("slide-down", 500, 250, { distance: 24 }),
      out: anim("fade", 220),
    });
  }
  if (bar) {
    layers.push({
      id: "accent",
      name: "Accent",
      type: "divider",
      anchor: "top-center",
      x: 960,
      y: 320,
      w: 160,
      h: 6,
      style: { fill: bar.style.fill, gradient: bar.style.gradient, radius: 3 },
      in: anim("grow-x", 600, 350),
      out: none,
    });
  }
  layers.push({
    id: "verse",
    name: "Verse",
    type: "text",
    content: "{text}",
    anchor: "top-center",
    x: 960,
    y: 360,
    w: 1600,
    h: 560,
    style: { ...textLook(vs), fontSize: 80, minFontSize: 38, lineHeight: Math.max(1.2, vs.lineHeight || 1.25), align: "center", verticalAlign: "middle" },
    in: anim("line-rise", 560, 420, { stagger: 80 }),
    out: anim("fade", 260),
  });
  return { version: 1, format: "fullscreen", swap: "content", layers, fontImports: lt.fontImports };
}

/** Lower-third look for a full-screen preset. */
export function lowerThirdFromFullscreen(fs: ThemeLayout): ThemeLayout {
  const surface = mainSurface(fs);
  const verse = verseLayer(fs);
  const label = labelLayer(fs);
  const bar = accent(fs, surface);
  const vs = verse?.style ?? {};
  const band = surface?.style ?? {};
  const layers: ThemeLayer[] = [
    {
      id: "band",
      name: "Band",
      type: "box",
      anchor: "bottom-center",
      x: 960,
      y: 1040,
      w: 1800,
      h: 236,
      style: {
        ...surfaceStyle(band, { fill: "rgba(12,16,28,0.9)" }),
        radius: band.radius ? Math.min(band.radius, 18) : 0,
        borderWidth: band.borderWidth,
        borderColor: band.borderColor,
        shadow: "0 16px 40px rgba(0,0,0,0.4)",
      },
      in: anim("slide-up", 560, 0, { distance: 50 }),
      out: anim("slide-up", 400, 160, { distance: 50, easing: "in-out" }),
    },
  ];
  if (bar) {
    layers.push({
      id: "accent",
      name: "Accent",
      type: "divider",
      parentId: "band",
      anchor: "top-left",
      x: 0,
      y: 0,
      w: 1800,
      h: 6,
      style: { fill: bar.style.fill, gradient: bar.style.gradient },
      in: anim("grow-x", 600, 150),
      out: none,
    });
  }
  if (label) {
    layers.push({
      id: "reference",
      name: "Reference",
      type: "text",
      parentId: "band",
      content: "{reference}",
      anchor: "top-left",
      x: 44,
      y: 24,
      w: 1700,
      h: "auto",
      style: { ...labelLook(label.style), fontSize: clamp(Math.round((label.style.fontSize || 40) * 0.5), 26, 38), minFontSize: 18, align: "left", maxLines: 1 },
      in: anim("fade", 380, 300),
      out: anim("fade", 200),
    });
  }
  layers.push({
    id: "verse",
    name: "Verse",
    type: "text",
    parentId: "band",
    content: "{text}",
    anchor: "top-left",
    x: 44,
    y: label ? 80 : 30,
    w: 1712,
    h: label ? 134 : 176,
    style: { ...textLook(vs), fontSize: 42, minFontSize: 22, lineHeight: 1.24, align: "left", verticalAlign: "middle" },
    in: anim("line-rise", 500, 380, { stagger: 60 }),
    out: anim("fade", 220),
  });
  return { version: 1, format: "lower-third", swap: "content", layers, fontImports: fs.fontImports };
}

/** Both looks for a preset: [fullscreen, lowerThird]. */
export function presetPair(layout: ThemeLayout): { fullscreen: ThemeLayout; lowerThird: ThemeLayout } {
  return layout.format === "fullscreen"
    ? { fullscreen: layout, lowerThird: lowerThirdFromFullscreen(layout) }
    : { fullscreen: fullscreenFromLowerThird(layout), lowerThird: layout };
}
