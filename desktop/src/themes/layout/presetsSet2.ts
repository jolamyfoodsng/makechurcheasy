/**
 * Second reference set from Tayo (Oct 2026): six lower thirds, each with a
 * hand-made full-screen look. (Crimson Texture and the Violet Split list entry were
 * retired; Violet Split lives on as the lower third of the Violet Praise starter.) Every one works for Bible, Worship and Notes.
 *
 * Heading layers (reference / label and any box behind it) are flagged
 * `heading: true`, so the heading can be switched off in the Theme Editor and
 * hides by itself when Worship / Notes send no label.
 */
import type { LayerAnimation, LayerGradient, LayerStyle, ThemeLayer, ThemeLayout } from "./types";

const none: LayerAnimation = { preset: "none", duration: 0, delay: 0, easing: "out-cubic" };
const anim = (preset: LayerAnimation["preset"], duration: number, delay = 0, extra: Partial<LayerAnimation> = {}): LayerAnimation => ({
  preset, duration, delay, easing: "out-expo", ...extra,
});
const linear = (angle: number, ...stops: Array<[string, number]>): LayerGradient => ({
  type: "linear", angle, stops: stops.map(([color, at]) => ({ color, at })),
});
const radial = (...stops: Array<[string, number]>): LayerGradient => ({
  type: "radial", stops: stops.map(([color, at]) => ({ color, at })),
});

type L = Omit<ThemeLayer, "in" | "out" | "anchor"> & Partial<Pick<ThemeLayer, "in" | "out" | "anchor">>;
const layer = (l: L): ThemeLayer => ({ anchor: "top-left", in: anim("fade", 400), out: anim("fade", 250), ...l });

const lt = (layers: ThemeLayer[]): ThemeLayout => ({ version: 1, format: "lower-third", swap: "content", layers });
const fs = (layers: ThemeLayer[]): ThemeLayout => ({ version: 1, format: "fullscreen", swap: "content", layers });

const fullBg = (style: LayerStyle): ThemeLayer =>
  layer({ id: "bg", name: "Background", type: "box", x: 0, y: 0, w: 1920, h: 1080, style, in: anim("fade", 500), out: anim("fade", 400, 200) });

const verseText = (style: LayerStyle): LayerStyle => ({ align: "left", verticalAlign: "middle", color: "#ffffff", lineHeight: 1.25, ...style });
const VERSE_IN = anim("line-rise", 520, 380, { stagger: 60 });
const VERSE_OUT = anim("fade", 220);

// ─────────────────────────── 1 · Painted Brush ───────────────────────────
// Painted multicolour stroke with torn ends, maroon reference tab on top (John 3:16).
// The torn edge is a clip-path, so the stroke grows in (a wipe would replace the clip while it runs).

const BRUSH_CLIP =
  "polygon(1.4% 7%, 3.2% 0%, 30% 3%, 62% 0%, 96.6% 2%, 98.7% 0%, 99.5% 13%, 98.2% 27%, 100% 41%, 98.8% 55%, 99.7% 69%, 98.3% 83%, 99.2% 100%, 70% 97%, 35% 100%, 2.6% 98%, 0.5% 100%, 1.5% 86%, 0% 72%, 1.2% 58%, 0.1% 44%, 1.4% 30%, 0% 17%)";
const BRUSH_PAINT = linear(100, ["#8a1f4f", 0], ["#3b1a6e", 20], ["#1b2a7a", 36], ["#2b8a9a", 48], ["#4a1d6a", 60], ["#8b2a6e", 76], ["#c25a12", 100]);
const BRUSH_SWIRL = radial(["rgba(130,210,235,0.38)", 0], ["rgba(70,40,130,0)", 42]);
const BRUSH_SHADE = linear(180, ["rgba(10,4,24,0.12)", 0], ["rgba(10,4,24,0.38)", 100]);

function brushPanel(id: string, x: number, y: number, w: number, h: number, anchor: ThemeLayer["anchor"]): ThemeLayer[] {
  return [
    layer({ id, name: "Brush stroke", type: "box", anchor, x, y, w, h, style: { gradient: BRUSH_PAINT, clipPath: BRUSH_CLIP }, in: anim("grow-x", 650), out: anim("fade", 380, 150) }),
    layer({ id: `${id}-swirl`, name: "Paint swirl", type: "box", parentId: id, x: 0, y: 0, w, h, style: { gradient: BRUSH_SWIRL }, in: none, out: none, loop: { preset: "drift", duration: 14000 } }),
    layer({ id: `${id}-shade`, name: "Shade", type: "box", parentId: id, x: 0, y: 0, w, h, style: { gradient: BRUSH_SHADE }, in: none, out: none }),
  ];
}

const brushTab = (x: number, y: number, size: number): ThemeLayer =>
  layer({
    id: "reference", name: "Reference tab", type: "text", heading: true, content: "{reference}", anchor: "bottom-center", x, y, w: 1200, h: "auto",
    style: { hug: true, fill: "#7a1f4f", padding: [8, 24, 6, 24], fontFamily: "Work Sans", fontSize: size, minFontSize: 16, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "#ffffff", align: "center", maxLines: 1 },
    in: anim("slide-up", 420, 360, { distance: 18 }), out: anim("fade", 200),
  });

export const PAINTED_BRUSH = lt([
  ...brushPanel("band", 960, 1030, 1780, 172, "bottom-center"),
  brushTab(960, 860, 26),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "band", content: "{text}", x: 100, y: 22, w: 1580, h: 128,
    style: verseText({ fontFamily: "Montserrat", fontSize: 34, minFontSize: 20, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", align: "center", lineHeight: 1.2, textShadow: "0 2px 6px rgba(0,0,0,0.5)", verseNumberColor: "rgba(255,255,255,0.75)" }),
    in: VERSE_IN, out: VERSE_OUT,
  }),
]);

export const PAINTED_BRUSH_FS = fs([
  fullBg({ gradient: radial(["#2a1446", 0], ["#0b0716", 75]) }),
  ...brushPanel("panel", 960, 580, 1700, 620, "center"),
  brushTab(960, 272, 38),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "panel", content: "{text}", x: 130, y: 70, w: 1440, h: 480,
    style: verseText({ fontFamily: "Montserrat", fontSize: 64, minFontSize: 32, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", align: "center", lineHeight: 1.2, textShadow: "0 3px 10px rgba(0,0,0,0.5)", verseNumberColor: "rgba(255,255,255,0.75)" }),
    in: anim("line-rise", 560, 420, { stagger: 80 }), out: VERSE_OUT,
  }),
]);

// ─────────────────────────── 2 · Violet Split ───────────────────────────
// Condensed label block on the left, glowing violet text panel on the right.

const VIOLET_PANEL = linear(120, ["#24032b", 0], ["#560a66", 40], ["#8e1aa0", 76], ["#b23cc4", 100]);
const VIOLET_LABEL = linear(90, ["#6b0f7a", 0], ["#a01cb0", 100]);

export const VIOLET_SPLIT = lt([
  layer({ id: "panel", name: "Text panel", type: "box", x: 855, y: 725, w: 1065, h: 303, style: { gradient: VIOLET_PANEL, shadow: "0 14px 40px rgba(0,0,0,0.4)" }, in: anim("wipe-left", 650), out: anim("wipe-right", 400, 150, { easing: "in-out" }) }),
  layer({ id: "panel-glow", name: "Glow", type: "box", parentId: "panel", x: 0, y: 0, w: 1065, h: 303, style: { gradient: radial(["rgba(255,140,255,0.22)", 0], ["rgba(255,140,255,0)", 55]) }, in: none, out: none, loop: { preset: "drift", duration: 16000 } }),
  layer({ id: "label-box", name: "Label box", type: "box", heading: true, x: 302, y: 828, w: 580, h: 100, style: { gradient: VIOLET_LABEL, shadow: "0 8px 22px rgba(0,0,0,0.35)" }, in: anim("slide-right", 500, 200, { distance: 60 }), out: anim("fade", 220) }),
  layer({
    id: "label", name: "Label", type: "text", heading: true, parentId: "label-box", content: "{reference}", x: 20, y: 0, w: 540, h: 100,
    style: { fontFamily: "Bebas Neue", fontSize: 50, minFontSize: 24, letterSpacing: 1.5, color: "#ffffff", align: "center", verticalAlign: "middle", maxLines: 1 },
    in: anim("fade", 300, 420), out: anim("fade", 160),
  }),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "panel", content: "{text}", x: 80, y: 40, w: 920, h: 223,
    style: verseText({ fontFamily: "Montserrat", fontSize: 30, minFontSize: 18, fontWeight: 800, textTransform: "uppercase", lineHeight: 1.22, verseNumberColor: "rgba(255,200,255,0.8)" }),
    in: VERSE_IN, out: VERSE_OUT,
  }),
]);

/**
 * Violet Praise full screen (Oct 2026): a plain violet background, the reference on
 * top and the verse below it. Same violet as the Violet Split text panel; the slow
 * pattern behind it is added by `withAnimatedBackground` (backgroundPatterns.ts).
 */
export const VIOLET_PLAIN_FS = fs([
  fullBg({ gradient: linear(135, ["#24032b", 0], ["#560a66", 42], ["#8e1aa0", 76], ["#b23cc4", 100]) }),
  layer({
    id: "label", name: "Reference", type: "text", heading: true, content: "{reference}", anchor: "top-center", x: 960, y: 110, w: 1500, h: "auto",
    style: { fontFamily: "Bebas Neue", fontSize: 96, minFontSize: 40, letterSpacing: 4, color: "#ffffff", align: "center", maxLines: 1, textShadow: "0 4px 18px rgba(0,0,0,0.35)" },
    in: anim("slide-up", 420, 300, { distance: 24 }), out: anim("fade", 200),
  }),
  layer({
    id: "label-rule", name: "Reference rule", type: "box", heading: true, anchor: "top-center", x: 960, y: 248, w: 180, h: 4,
    style: { fill: "rgba(255,255,255,0.55)" }, in: anim("grow-x", 500, 480), out: anim("fade", 200),
  }),
  layer({
    id: "verse", name: "Verse", type: "text", content: "{text}", x: 200, y: 300, w: 1520, h: 680,
    style: verseText({ fontFamily: "Montserrat", fontSize: 66, minFontSize: 32, fontWeight: 800, textTransform: "uppercase", align: "center", lineHeight: 1.22, textShadow: "0 3px 10px rgba(0,0,0,0.4)", verseNumberColor: "rgba(255,200,255,0.8)" }),
    in: anim("line-rise", 560, 420, { stagger: 80 }), out: VERSE_OUT,
  }),
]);

// ─────────────────────────── 3 · Frosted Light Bar ───────────────────────────
// Milky glass bar, dark centred text, small sage reference chip bottom-right (Acts 2:42).

const frostedRef = (x: number, y: number, size: number, anchor: ThemeLayer["anchor"], parentId?: string): ThemeLayer =>
  layer({
    id: "reference", name: "Reference chip", type: "text", heading: true, parentId, content: "{reference}", anchor, x, y, w: 900, h: "auto",
    style: { hug: true, fill: "rgba(200,212,162,0.95)", radius: 4, padding: [4, 14, 3, 14], fontFamily: "Inter", fontSize: size, minFontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#1d2a12", maxLines: 1 },
    in: anim("fade", 300, 420), out: anim("fade", 160),
  });

export const FROSTED_LIGHT_BAR = lt([
  layer({ id: "bar", name: "Glass bar", type: "box", anchor: "bottom-center", x: 960, y: 1012, w: 1500, h: 190, style: { fill: "rgba(246,246,241,0.84)", backdropBlur: 10, radius: 6, shadow: "0 10px 30px rgba(0,0,0,0.25)" }, in: anim("slide-up", 520, 0, { distance: 40 }), out: anim("fade", 300, 120) }),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "bar", content: "{text}", x: 70, y: 18, w: 1360, h: 122,
    style: verseText({ fontFamily: "Inter", fontSize: 40, minFontSize: 22, fontWeight: 500, color: "#1b1b1b", align: "center", lineHeight: 1.22, verseNumberColor: "#6b7a4a" }),
    in: VERSE_IN, out: VERSE_OUT,
  }),
  frostedRef(1470, 176, 20, "bottom-right", "bar"),
]);

export const FROSTED_LIGHT_BAR_FS = fs([
  fullBg({ gradient: linear(180, ["#f6f5f0", 0], ["#e2e0d6", 100]) }),
  layer({ id: "rule", name: "Line", type: "divider", anchor: "top-center", x: 960, y: 180, w: 140, h: 4, style: { fill: "#9aab6a", radius: 2 }, in: anim("grow-x", 500, 200), out: none }),
  layer({
    id: "verse", name: "Verse", type: "text", content: "{text}", anchor: "top-center", x: 960, y: 230, w: 1560, h: 560,
    style: verseText({ fontFamily: "Inter", fontSize: 72, minFontSize: 34, fontWeight: 500, color: "#1b1b1b", align: "center", lineHeight: 1.25, verseNumberColor: "#6b7a4a" }),
    in: anim("line-rise", 560, 380, { stagger: 80 }), out: VERSE_OUT,
  }),
  frostedRef(960, 850, 30, "top-center"),
]);

// ─────────────────────────── 5 · Paper Card ───────────────────────────
// Off-white card, bold black serif, verse-number chip, colour-block rule over the reference (2 Timothy 3:16).

const PAPER = linear(180, ["#fbfaf6", 0], ["#efece4", 100]);
const RAINBOW = linear(90, ["#5b8fd6", 0], ["#5b8fd6", 25], ["#e08a3c", 25], ["#e08a3c", 50], ["#e58fb6", 50], ["#e58fb6", 75], ["#e8c547", 75], ["#e8c547", 100]);

function paperDetails(card: string, w: number, h: number, k: number): ThemeLayer[] {
  return [
    layer({ id: "edge", name: "Colour edge", type: "divider", parentId: card, anchor: "bottom-left", x: 0, y: h, w, h: Math.round(5 * k), style: { gradient: RAINBOW }, in: anim("grow-x", 600, 250), out: none }),
    layer({
      id: "chip", name: "Verse chip", type: "text", heading: true, parentId: card, content: "{verses}", x: Math.round(24 * k), y: Math.round(22 * k), w: 300, h: "auto",
      style: { hug: true, fill: "#111111", radius: 40, padding: [5, 12, 4, 12].map((v) => Math.round(v * k)) as [number, number, number, number], fontFamily: "Inter", fontSize: Math.round(15 * k), minFontSize: 10, fontWeight: 800, color: "#ffffff", maxLines: 1 },
      in: anim("pop", 360, 420), out: anim("fade", 160),
    }),
    layer({ id: "rule", name: "Colour rule", type: "divider", heading: true, parentId: card, anchor: "bottom-right", x: w - Math.round(40 * k), y: h - Math.round(78 * k), w: Math.round(420 * k), h: Math.round(5 * k), style: { gradient: RAINBOW }, in: anim("grow-x", 600, 420), out: none }),
    layer({
      id: "reference", name: "Reference", type: "text", heading: true, parentId: card, content: "{referenceShort}", anchor: "bottom-right", x: w - Math.round(40 * k), y: h - Math.round(36 * k), w: Math.round(900 * k), h: "auto",
      style: { fontFamily: "Outfit", fontSize: Math.round(30 * k), minFontSize: 16, fontWeight: 500, letterSpacing: 3, textTransform: "uppercase", color: "#222222", align: "right", maxLines: 1 },
      in: anim("fade", 340, 460), out: anim("fade", 160),
    }),
    layer({
      id: "translation", name: "Translation", type: "text", heading: true, parentId: card, content: "{translation}", anchor: "bottom-right", x: w - Math.round(40 * k), y: h - Math.round(14 * k), w: 400, h: "auto",
      style: { fontFamily: "Outfit", fontSize: Math.round(15 * k), minFontSize: 10, fontWeight: 600, letterSpacing: 1, color: "#d4a24a", align: "right", maxLines: 1 },
      in: anim("fade", 340, 520), out: anim("fade", 160),
    }),
  ];
}

export const PAPER_CARD = lt([
  layer({ id: "card", name: "Card", type: "box", x: 210, y: 712, w: 1500, h: 328, style: { gradient: PAPER, radius: 22, borderWidth: 2, borderColor: "rgba(0,0,0,0.06)", shadow: "0 14px 36px rgba(0,0,0,0.3)" }, in: anim("slide-up", 560, 0, { distance: 50 }), out: anim("fade", 300, 120) }),
  ...paperDetails("card", 1500, 328, 1),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "card", content: "{text}", x: 80, y: 52, w: 1340, h: 186,
    style: verseText({ fontFamily: "Playfair Display", fontSize: 40, minFontSize: 22, fontWeight: 700, color: "#111111", lineHeight: 1.16, verseNumbers: false }),
    in: VERSE_IN, out: VERSE_OUT,
  }),
]);

export const PAPER_CARD_FS = fs([
  fullBg({ gradient: linear(180, ["#e9e7e0", 0], ["#d9d6cc", 100]) }),
  layer({ id: "card", name: "Card", type: "box", anchor: "center", x: 960, y: 540, w: 1640, h: 880, style: { gradient: PAPER, radius: 30, borderWidth: 2, borderColor: "rgba(0,0,0,0.06)", shadow: "0 24px 60px rgba(0,0,0,0.22)" }, in: anim("scale", 560, 0), out: anim("fade", 300, 120) }),
  ...paperDetails("card", 1640, 880, 1.8),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "card", content: "{text}", x: 130, y: 130, w: 1380, h: 520,
    style: verseText({ fontFamily: "Playfair Display", fontSize: 76, minFontSize: 36, fontWeight: 700, color: "#111111", lineHeight: 1.16, verseNumbers: false }),
    in: anim("line-rise", 560, 420, { stagger: 80 }), out: VERSE_OUT,
  }),
]);

// ─────────────────────────── 6 · White Pill Card ───────────────────────────
// Rounded white card, small grey reference, heavy black capitals (Colossians 1:15).

export const WHITE_PILL = lt([
  layer({ id: "card", name: "Card", type: "box", anchor: "bottom-center", x: 960, y: 1012, w: 1560, h: 176, style: { fill: "#ffffff", radius: 28, shadow: "0 12px 34px rgba(0,0,0,0.3)" }, in: anim("slide-up", 520, 0, { distance: 40 }), out: anim("fade", 300, 120) }),
  layer({
    id: "reference", name: "Reference", type: "text", heading: true, parentId: "card", content: "{reference}", x: 46, y: 22, w: 1460, h: "auto",
    style: { fontFamily: "Inter", fontSize: 22, minFontSize: 14, fontWeight: 600, textTransform: "uppercase", color: "#8a8a8a", maxLines: 1 },
    in: anim("fade", 300, 300), out: anim("fade", 160),
  }),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "card", content: "{text}", x: 46, y: 56, w: 1468, h: 102,
    style: verseText({ fontFamily: "Inter", fontSize: 34, minFontSize: 20, fontWeight: 800, textTransform: "uppercase", color: "#111111", lineHeight: 1.15, verseNumberColor: "#8a8a8a" }),
    in: VERSE_IN, out: VERSE_OUT,
  }),
]);

export const WHITE_PILL_FS = fs([
  fullBg({ gradient: linear(180, ["#252a33", 0], ["#11141a", 100]) }),
  layer({ id: "card", name: "Card", type: "box", anchor: "center", x: 960, y: 540, w: 1560, h: 760, style: { fill: "#ffffff", radius: 44, shadow: "0 24px 60px rgba(0,0,0,0.4)" }, in: anim("scale", 520, 0), out: anim("fade", 300, 120) }),
  layer({
    id: "reference", name: "Reference", type: "text", heading: true, parentId: "card", content: "{reference}", x: 100, y: 80, w: 1360, h: "auto",
    style: { fontFamily: "Inter", fontSize: 36, minFontSize: 18, fontWeight: 600, textTransform: "uppercase", color: "#8a8a8a", maxLines: 1 },
    in: anim("fade", 300, 300), out: anim("fade", 160),
  }),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "card", content: "{text}", x: 100, y: 150, w: 1360, h: 530,
    style: verseText({ fontFamily: "Inter", fontSize: 66, minFontSize: 30, fontWeight: 800, textTransform: "uppercase", color: "#111111", lineHeight: 1.14, verseNumberColor: "#8a8a8a" }),
    in: anim("line-rise", 560, 400, { stagger: 80 }), out: VERSE_OUT,
  }),
]);

// ─────────────────────────── 7–8 · Navy family ───────────────────────────
// Deep-blue lit box with a thin light border, white left bar and a sky-blue square.

const NAVY = linear(100, ["#0b1c4a", 0], ["#183677", 45], ["#2c5cab", 76], ["#173069", 100]);
const NAVY_GLOW = radial(["rgba(130,180,255,0.3)", 0], ["rgba(130,180,255,0)", 60]);
const SKY = "#4aa3d6";

function navyBox(x: number, y: number, w: number, h: number, delay = 0): ThemeLayer[] {
  return [
    layer({ id: "box", name: "Box", type: "box", x, y, w, h, style: { gradient: NAVY, borderWidth: 2, borderColor: "rgba(225,232,255,0.8)", shadow: "0 14px 40px rgba(0,0,0,0.45)" }, in: anim("wipe-left", 650, delay), out: anim("wipe-right", 400, 150, { easing: "in-out" }) }),
    layer({ id: "box-glow", name: "Glow", type: "box", parentId: "box", x: 0, y: 0, w, h, style: { gradient: NAVY_GLOW }, in: none, out: none, loop: { preset: "drift", duration: 18000 } }),
    layer({ id: "bar", name: "Left bar", type: "divider", x: x - 8, y, w: 10, h, style: { fill: "#f2f4f8" }, in: anim("grow-y", 450, delay), out: anim("fade", 200) }),
  ];
}
const skySquare = (x: number, y: number, w: number, h: number): ThemeLayer =>
  layer({ id: "square", name: "Blue square", type: "box", x, y, w, h, style: { fill: SKY }, in: anim("pop", 420, 250), out: anim("fade", 200) });

export const NAVY_POINT = lt([
  skySquare(110, 770, 112, 104),
  ...navyBox(232, 800, 1640, 200),
  layer({
    id: "verse", name: "Point", type: "text", parentId: "box", content: "{text}", x: 70, y: 18, w: 1500, h: 164,
    style: verseText({ fontFamily: "Cinzel", fontSize: 56, minFontSize: 28, fontWeight: 600, align: "center", lineHeight: 1.15, textShadow: "0 3px 6px rgba(0,0,0,0.6)", verseNumberColor: "rgba(200,220,255,0.8)" }),
    in: VERSE_IN, out: VERSE_OUT,
  }),
  layer({
    id: "reference", name: "Reference", type: "text", heading: true, parentId: "box", content: "{reference}", anchor: "bottom-right", x: 1620, y: 192, w: 900, h: "auto",
    style: { fontFamily: "Cinzel", fontSize: 22, minFontSize: 14, fontWeight: 600, letterSpacing: 1, color: "rgba(220,230,255,0.85)", align: "right", maxLines: 1 },
    in: anim("fade", 300, 460), out: anim("fade", 160),
  }),
]);

export const NAVY_POINT_FS = fs([
  fullBg({ gradient: radial(["#13254f", 0], ["#04070f", 80]) }),
  skySquare(150, 240, 150, 140),
  ...navyBox(310, 280, 1460, 520),
  layer({
    id: "verse", name: "Point", type: "text", parentId: "box", content: "{text}", x: 100, y: 60, w: 1260, h: 360,
    style: verseText({ fontFamily: "Cinzel", fontSize: 92, minFontSize: 40, fontWeight: 600, align: "center", lineHeight: 1.15, textShadow: "0 4px 10px rgba(0,0,0,0.6)", verseNumberColor: "rgba(200,220,255,0.8)" }),
    in: anim("line-rise", 560, 420, { stagger: 80 }), out: VERSE_OUT,
  }),
  layer({
    id: "reference", name: "Reference", type: "text", heading: true, parentId: "box", content: "{reference}", anchor: "bottom-center", x: 730, y: 490, w: 1200, h: "auto",
    style: { fontFamily: "Cinzel", fontSize: 32, minFontSize: 16, fontWeight: 600, letterSpacing: 2, color: "rgba(220,230,255,0.9)", align: "center", maxLines: 1 },
    in: anim("fade", 300, 460), out: anim("fade", 160),
  }),
]);

const navyHeading = (x: number, y: number, w: number, h: number, size: number): ThemeLayer[] => [
  layer({ id: "heading-box", name: "Heading box", type: "box", heading: true, x, y, w, h, style: { gradient: linear(180, ["#1c1c1c", 0], ["#000000", 100]), borderWidth: 2, borderColor: "rgba(255,255,255,0.85)", radius: 4, shadow: "0 8px 22px rgba(0,0,0,0.4)" }, in: anim("slide-down", 460, 260, { distance: 24 }), out: anim("fade", 200) }),
  layer({
    id: "heading", name: "Heading", type: "text", heading: true, parentId: "heading-box", content: "{reference}", x: Math.round(h * 0.55), y: 0, w: w - Math.round(h * 0.9), h,
    style: { fontFamily: "Source Sans 3", fontSize: size, minFontSize: Math.round(size * 0.5), fontWeight: 600, color: "#ffffff", align: "left", verticalAlign: "middle", maxLines: 1, textShadow: "0 2px 4px rgba(0,0,0,0.6)" },
    in: anim("fade", 300, 420), out: anim("fade", 160),
  }),
];

export const NAVY_SCRIPTURE = lt([
  skySquare(70, 806, 124, 104),
  ...navyBox(202, 790, 1680, 240),
  ...navyHeading(150, 696, 940, 108, 56),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "box", content: "{text}", x: 36, y: 30, w: 1600, h: 186,
    style: verseText({ fontFamily: "Source Sans 3", fontSize: 46, minFontSize: 24, fontWeight: 500, verticalAlign: "top", lineHeight: 1.22, textShadow: "0 2px 5px rgba(0,0,0,0.55)", verseNumberColor: "rgba(200,220,255,0.8)" }),
    in: VERSE_IN, out: VERSE_OUT,
  }),
]);

export const NAVY_SCRIPTURE_FS = fs([
  fullBg({ gradient: radial(["#13254f", 0], ["#04070f", 80]) }),
  skySquare(120, 330, 140, 124),
  ...navyBox(270, 300, 1530, 640),
  ...navyHeading(220, 170, 1040, 150, 76),
  layer({
    id: "verse", name: "Verse", type: "text", parentId: "box", content: "{text}", x: 70, y: 70, w: 1390, h: 510,
    style: verseText({ fontFamily: "Source Sans 3", fontSize: 72, minFontSize: 34, fontWeight: 500, verticalAlign: "top", lineHeight: 1.22, textShadow: "0 3px 8px rgba(0,0,0,0.55)", verseNumberColor: "rgba(200,220,255,0.8)" }),
    in: anim("line-rise", 560, 420, { stagger: 80 }), out: VERSE_OUT,
  }),
]);

/** Preset list entries: the lower third plus its hand-made full screen. */
export const SET2_PRESETS: Array<{ id: string; name: string; layout: ThemeLayout; companion: ThemeLayout }> = [
  { id: "preset-painted-brush", name: "Painted Brush", layout: PAINTED_BRUSH, companion: PAINTED_BRUSH_FS },
  { id: "preset-frosted-light-bar", name: "Frosted Light Bar", layout: FROSTED_LIGHT_BAR, companion: FROSTED_LIGHT_BAR_FS },
  { id: "preset-paper-card", name: "Paper Card", layout: PAPER_CARD, companion: PAPER_CARD_FS },
  { id: "preset-white-pill", name: "White Pill Card", layout: WHITE_PILL, companion: WHITE_PILL_FS },
  { id: "preset-navy-point", name: "Navy Sermon Point", layout: NAVY_POINT, companion: NAVY_POINT_FS },
  { id: "preset-navy-scripture", name: "Navy Scripture", layout: NAVY_SCRIPTURE, companion: NAVY_SCRIPTURE_FS },
];
