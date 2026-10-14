/**
 * Third reference set (Oct 2026): "Confetti Frame" — from Tayo's 2 Timothy 3:16–17 picture.
 * A white card inside a rounded four-colour frame (blue, orange, pink, yellow), flecked like
 * confetti paper, with a black pill for the verse numbers, bold serif verse text, and the
 * reference in wide capitals above a four-colour rule.
 *
 * The frame is one rounded box per colour, each clipped to its stretch of the ring; the white
 * card sits on top and hides the middle. Heading layers (pill, rule, reference, translation)
 * are flagged `heading: true`, so they hide together when Worship / Notes send no label.
 */
import type { LayerAnimation, LayerStyle, ThemeLayer, ThemeLayout } from "./types";

const anim = (preset: LayerAnimation["preset"], duration: number, delay = 0, extra: Partial<LayerAnimation> = {}): LayerAnimation => ({
  preset, duration, delay, easing: "out-expo", ...extra,
});

type L = Omit<ThemeLayer, "in" | "out" | "anchor"> & Partial<Pick<ThemeLayer, "in" | "out" | "anchor">>;
const layer = (l: L): ThemeLayer => ({ anchor: "top-left", in: anim("fade", 400), out: anim("fade", 250), ...l });

const BLUE = "#7eb4de";
const ORANGE = "#e58a4d";
const PINK = "#e8a8cf";
const YELLOW = "#f2bb68";
const INK = "#111111";
const PAPER = "#fbfaf7";
const TRANSLATION = "#e08f3a";
const GAP = "#f4f2ec";

/** Where each colour sits on the frame ring (percent of the frame box). */
const CLIP_ORANGE = "polygon(5.2% 0, 55.5% 0, 55.5% 20%, 5.2% 20%)";
const CLIP_PINK = "polygon(55.5% 0, 100% 0, 100% 44%, 90% 44%, 90% 20%, 55.5% 20%)";
const CLIP_YELLOW = "polygon(90% 44%, 100% 44%, 100% 100%, 40.7% 100%, 40.7% 90%, 90% 90%)";

/** Faint grey flecks, like speckled paper. Fixed-size tiles, so they never stretch. */
const FLECKS = [
  "radial-gradient(circle, rgba(70,70,70,0.42) 1.7px, transparent 2.6px) 0 0 / 173px 131px",
  "radial-gradient(circle, rgba(70,70,70,0.32) 1.3px, transparent 2.2px) 61px 47px / 97px 113px",
  "radial-gradient(ellipse 3.4px 1.5px, rgba(70,70,70,0.36) 60%, transparent 100%) 23px 83px / 211px 157px",
  "radial-gradient(circle, rgba(70,70,70,0.18) 1px, transparent 1.8px) 119px 19px / 79px 67px",
].join(", ");

function frame(x: number, y: number, w: number, h: number, radius: number, ring: number): ThemeLayer[] {
  const box = (id: string, name: string, fill: string, clipPath?: string): ThemeLayer =>
    layer({
      id, name, type: "box", x, y, w, h,
      style: { fill, radius, ...(clipPath ? { clipPath } : {}) },
      in: anim("fade", 520), out: anim("fade", 300, 120),
    });
  return [
    box("frame-blue", "Frame · blue", BLUE),
    box("frame-orange", "Frame · orange", ORANGE, CLIP_ORANGE),
    box("frame-pink", "Frame · pink", PINK, CLIP_PINK),
    box("frame-yellow", "Frame · yellow", YELLOW, CLIP_YELLOW),
    // A thin coloured line, then a pale gap, then the white card (as in the picture).
    layer({
      id: "frame-gap", name: "Frame · gap", type: "box", x: x + ring, y: y + ring, w: w - ring * 2, h: h - ring * 2,
      style: { fill: GAP, radius: Math.max(8, radius - ring) }, in: anim("fade", 520), out: anim("fade", 300, 120),
    }),
  ];
}

function card(x: number, y: number, w: number, h: number, radius: number, scale: ThemeLayer["in"]): ThemeLayer[] {
  return [
    layer({ id: "card", name: "Card", type: "box", x, y, w, h, style: { fill: PAPER, radius }, in: scale, out: anim("fade", 300, 120) }),
    // Named like the built-in animated patterns, so the app does not add another one behind the card.
    layer({ id: "mce-pattern", name: "Confetti flecks", type: "box", x, y, w, h, style: { fill: FLECKS, radius }, in: anim("fade", 700, 200), out: anim("fade", 250) }),
  ];
}

/** The four-colour rule above the reference. */
function rule(x: number, y: number, totalW: number, h: number): ThemeLayer[] {
  const w = Math.round(totalW / 4);
  return [BLUE, ORANGE, PINK, YELLOW].map((fill, i) =>
    layer({
      id: `rule-${i + 1}`, name: `Rule · ${["blue", "orange", "pink", "yellow"][i]}`, type: "divider", heading: true,
      x: x + i * w, y, w, h, style: { fill },
      in: anim("grow-x", 420, 420 + i * 70), out: anim("fade", 180),
    }),
  );
}

const pill = (x: number, y: number, size: number): ThemeLayer =>
  layer({
    id: "verses", name: "Verse numbers", type: "text", heading: true, content: "{verses}", x, y, w: 360, h: "auto",
    style: {
      hug: true, fill: "#0b0b0b", radius: 60, padding: [Math.round(size * 0.3), Math.round(size * 0.8), Math.round(size * 0.3), Math.round(size * 0.8)],
      fontFamily: "Montserrat", fontSize: size, minFontSize: 14, fontWeight: 700, letterSpacing: 1, color: "#ffffff", align: "center", maxLines: 1,
    },
    in: anim("pop", 420, 300), out: anim("fade", 180),
  });

const reference = (x: number, y: number, w: number, size: number, tracking: number): ThemeLayer =>
  layer({
    id: "reference", name: "Reference", type: "text", heading: true, content: "{book} {chapterVerse}", anchor: "top-right", x, y, w, h: "auto",
    style: { fontFamily: "Montserrat", fontSize: size, minFontSize: 18, fontWeight: 500, letterSpacing: tracking, textTransform: "uppercase", color: INK, align: "right", maxLines: 1 },
    in: anim("slide-up", 420, 380, { distance: 18 }), out: anim("fade", 180),
  });

const translation = (x: number, y: number, w: number, size: number): ThemeLayer =>
  layer({
    id: "translation", name: "Translation", type: "text", heading: true, content: "{translation}", anchor: "top-right", x, y, w, h: "auto",
    style: { fontFamily: "Montserrat", fontSize: size, minFontSize: 12, fontWeight: 600, letterSpacing: 2, color: TRANSLATION, align: "right", maxLines: 1 },
    in: anim("fade", 340, 520), out: anim("fade", 160),
  });

const verse = (x: number, y: number, w: number, h: number, size: number, min: number, lineHeight: number): ThemeLayer =>
  layer({
    id: "verse", name: "Verse", type: "text", content: "{text}", x, y, w, h,
    style: {
      fontFamily: "Playfair Display", fontSize: size, minFontSize: min, fontWeight: 900, color: INK, lineHeight, align: "left", verticalAlign: "top",
      verseNumbers: false,
    } as LayerStyle,
    in: anim("line-rise", 540, 380, { stagger: 60 }), out: anim("fade", 220),
  });

const lt = (layers: ThemeLayer[]): ThemeLayout => ({ version: 1, format: "lower-third", swap: "content", layers });
const fs = (layers: ThemeLayer[]): ThemeLayout => ({ version: 1, format: "fullscreen", swap: "content", layers });

// ─────────────────────────── Confetti Frame ───────────────────────────

export const CONFETTI_FRAME = lt([
  ...frame(110, 676, 1700, 364, 60, 11),
  ...card(128, 694, 1664, 328, 40, anim("scale", 520, 0)),
  pill(168, 722, 22),
  verse(168, 778, 1010, 232, 56, 28, 1.12),
  ...rule(1240, 790, 512, 6),
  reference(1752, 812, 560, 38, 3),
  translation(1752, 870, 300, 24),
]);

export const CONFETTI_FRAME_FS = fs([
  layer({ id: "bg", name: "Background", type: "box", x: 0, y: 0, w: 1920, h: 1080, style: { fill: "#f4f2ec" }, in: anim("fade", 500), out: anim("fade", 400, 200) }),
  ...frame(78, 39, 1763, 1004, 92, 24),
  ...card(123, 83, 1669, 917, 52, anim("scale", 560, 0)),
  pill(162, 196, 32),
  verse(270, 246, 1220, 556, 84, 38, 1.1),
  ...rule(1082, 786, 568, 8),
  reference(1661, 814, 900, 54, 4),
  translation(1661, 896, 400, 32),
]);

/** Preset list entry: the lower third plus its hand-made full screen. */
export const SET3_PRESETS: Array<{ id: string; name: string; layout: ThemeLayout; companion: ThemeLayout }> = [
  { id: "preset-confetti-frame", name: "Confetti Frame", layout: CONFETTI_FRAME, companion: CONFETTI_FRAME_FS },
];
