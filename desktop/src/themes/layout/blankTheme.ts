/**
 * The starting point for "New" in the Theme Creator: a plain black theme made of
 * real layers (background, reference, verse, translation), so every piece can be
 * selected, moved and styled like in any ready-made theme.
 */
import type { LayerAnimation, ThemeLayout } from "./types";

const fade = (duration: number, delay = 0): LayerAnimation => ({ preset: "fade", duration, delay, easing: "out-cubic" });

export const BLANK_FULLSCREEN: ThemeLayout = {
  version: 1,
  format: "fullscreen",
  swap: "content",
  layers: [
    { id: "bg", name: "Background", type: "box", anchor: "top-left", x: 0, y: 0, w: 1920, h: 1080, style: { fill: "#000000" }, in: fade(400), out: fade(300) },
    {
      id: "reference",
      name: "Reference",
      type: "text",
      content: "{reference}",
      anchor: "top-center",
      x: 960,
      y: 150,
      w: 1500,
      h: "auto",
      style: { fontFamily: "Arial", fontSize: 36, minFontSize: 24, fontWeight: 700, align: "center", color: "#ffffff", maxLines: 1 },
      in: fade(400, 100),
      out: fade(200),
    },
    {
      id: "verse",
      name: "Verse",
      type: "text",
      content: "{text}",
      anchor: "top-center",
      x: 960,
      y: 260,
      w: 1680,
      h: 600,
      style: { fontFamily: "Arial", fontSize: 50, minFontSize: 28, fontWeight: 700, lineHeight: 1.25, align: "center", verticalAlign: "middle", color: "#ffffff", verseNumberColor: "rgba(255,255,255,0.75)" },
      in: fade(400, 200),
      out: fade(200),
    },
    {
      id: "translation",
      name: "Translation",
      type: "text",
      content: "{translation}",
      anchor: "top-right",
      x: 1800,
      y: 940,
      w: 400,
      h: "auto",
      style: { fontFamily: "Arial", fontSize: 28, fontWeight: 700, align: "right", color: "#ffffff", maxLines: 1 },
      in: fade(400, 300),
      out: fade(200),
    },
  ],
};

export const BLANK_LOWER_THIRD: ThemeLayout = {
  version: 1,
  format: "lower-third",
  swap: "content",
  layers: [
    { id: "bar", name: "Bar", type: "box", anchor: "top-left", x: 60, y: 770, w: 1800, h: 270, style: { fill: "#000000", radius: 8 }, in: fade(400), out: fade(300) },
    {
      id: "reference",
      name: "Reference",
      type: "text",
      content: "{reference}",
      anchor: "top-left",
      x: 110,
      y: 792,
      w: 1200,
      h: "auto",
      style: { fontFamily: "Arial", fontSize: 32, minFontSize: 22, fontWeight: 700, align: "left", color: "#ffffff", maxLines: 1 },
      in: fade(400, 100),
      out: fade(200),
    },
    {
      id: "verse",
      name: "Verse",
      type: "text",
      content: "{text}",
      anchor: "top-left",
      x: 110,
      y: 850,
      w: 1700,
      h: 170,
      style: { fontFamily: "Arial", fontSize: 50, minFontSize: 26, fontWeight: 400, lineHeight: 1.25, align: "left", verticalAlign: "top", color: "#ffffff", verseNumberColor: "rgba(255,255,255,0.75)" },
      in: fade(400, 200),
      out: fade(200),
    },
    {
      id: "translation",
      name: "Translation",
      type: "text",
      content: "{translation}",
      anchor: "top-right",
      x: 1810,
      y: 796,
      w: 300,
      h: "auto",
      style: { fontFamily: "Arial", fontSize: 26, fontWeight: 700, align: "right", color: "#ffffff", maxLines: 1 },
      in: fade(400, 300),
      out: fade(200),
    },
  ],
};
