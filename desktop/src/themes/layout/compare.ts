/**
 * compare.ts — side-by-side Bible (two translations) for layer themes.
 *
 * A layer theme draws one verse block. For a compare slide the first verse layer is split into
 * two columns next to each other: the left keeps "{text}", the new right one shows "{text2}".
 * Each column ends with its translation ("— KJV"). Themes without a verse layer are left as they are.
 */
import type { LayerAnchor, ThemeLayer, ThemeLayout } from "./types";
import { isVerseTextPattern } from "./content";

export interface CompareColumn {
  translation?: string;
  reference?: string;
  text?: string;
}

/** The slice of an overlay slide that decides whether it is a side-by-side compare. */
export interface CompareSlide {
  layout?: string;
  compareMode?: string;
  /** "line-by-line" (one translation under the other) or "side-by-side" (columns). */
  compareLayout?: string;
  columns?: CompareColumn[] | null;
}

/** Gap between the two columns, in the theme's 1920 x 1080 space. */
const COLUMN_GAP = 56;
const MIN_COLUMN = 240;

export function compareColumnsOf(slide: CompareSlide | null | undefined): [CompareColumn, CompareColumn] | null {
  if (!slide || slide.layout !== "compare") return null;
  if (slide.compareMode && slide.compareMode !== "translations" && slide.compareMode !== "passages") return null;
  const columns = Array.isArray(slide.columns) ? slide.columns.filter(Boolean) : [];
  return columns.length === 2 ? [columns[0], columns[1]] : null;
}

export type CompareLayoutMode = "line-by-line" | "side-by-side";

/** Line by line is the Dock's default; anything but "side-by-side" means line by line. */
export function compareLayoutOf(slide: CompareSlide | null | undefined): CompareLayoutMode {
  // Two different passages are always shown as columns.
  if (slide?.compareMode === "passages") return "side-by-side";
  return slide?.compareLayout === "side-by-side" ? "side-by-side" : "line-by-line";
}

function across(anchor: LayerAnchor): "left" | "center" | "right" {
  if (anchor.endsWith("left")) return "left";
  if (anchor.endsWith("right")) return "right";
  return "center";
}

/**
 * The theme's layout for a compare slide. Side by side: the first verse layer is split into two
 * columns. Line by line: the verse layer stays one block (both translations stacked in it), a bit smaller.
 */
export function applyCompareToLayout(layout: ThemeLayout, mode: CompareLayoutMode = "side-by-side"): ThemeLayout {
  if (mode === "line-by-line") return shrinkVerseLayer(layout);
  return splitVerseLayer(layout);
}

function shrinkVerseLayer(layout: ThemeLayout): ThemeLayout {
  const index = layout.layers.findIndex((l) => l.type === "text" && !l.hidden && isVerseTextPattern(l.content) && (l.content || "").trim() === "{text}");
  if (index < 0) return layout;
  const verse = layout.layers[index];
  const size = verse.style.fontSize;
  if (typeof size !== "number") return layout;
  const style = { ...verse.style, fontSize: Math.round(size * 0.8), minFontSize: Math.max(14, Math.round(size * 0.35)) };
  const layers = layout.layers.slice();
  layers[index] = { ...verse, style };
  return { ...layout, layers };
}

function splitVerseLayer(layout: ThemeLayout): ThemeLayout {
  const index = layout.layers.findIndex((l) => l.type === "text" && !l.hidden && isVerseTextPattern(l.content) && (l.content || "").trim() === "{text}");
  if (index < 0) return layout;
  const verse = layout.layers[index];
  const half = Math.max(MIN_COLUMN, Math.floor((verse.w - COLUMN_GAP) / 2));
  const shift = (half + COLUMN_GAP) / 2;
  const side = across(verse.anchor);
  const [x1, x2] = side === "left"
    ? [verse.x, verse.x + half + COLUMN_GAP]
    : side === "right"
      ? [verse.x - half - COLUMN_GAP, verse.x]
      : [verse.x - shift, verse.x + shift];
  const size = verse.style.fontSize;
  // Both columns start at the same line, so the two verses read across.
  const style = typeof size === "number"
    ? { ...verse.style, fontSize: Math.round(size * 0.72), minFontSize: Math.max(14, Math.round(size * 0.35)), verticalAlign: "top" as const }
    : { ...verse.style, verticalAlign: "top" as const };
  const left: ThemeLayer = { ...verse, x: x1, w: half, style };
  const right: ThemeLayer = { ...verse, id: `${verse.id}-compare`, name: `${verse.name} (2nd translation)`, content: "{text2}", x: x2, w: half, style };
  const layers = layout.layers.slice();
  layers.splice(index, 1, left, right);
  return { ...layout, layers };
}

/** What the layers fill in: column one in {text}, column two in {text2}, both references together. */
export function compareContent(
  columns: [CompareColumn, CompareColumn],
  lineCount?: number,
  mode: CompareLayoutMode = "side-by-side",
  kind: "translations" | "passages" = "translations",
) {
  const [a, b] = columns;
  if (kind === "passages") {
    // Two different passages: each column ends with its own reference, the heading lists both.
    const clean = (c: CompareColumn) => (c.reference || "").replace(/\s*\([^)]*\)\s*$/, "");
    const tag = (c: CompareColumn) => {
      const ref = clean(c);
      return ref ? `\n— ${ref}${c.translation ? ` (${c.translation})` : ""}` : "";
    };
    return {
      text: `${a.text || ""}${tag(a)}`,
      reference: [clean(a), clean(b)].filter(Boolean).join(" · "),
      lineCount,
      extra: { text2: `${b.text || ""}${tag(b)}` },
    };
  }
  const label = (c: CompareColumn) => (c.translation ? `\n— ${c.translation}` : "");
  const names = [a.translation, b.translation].filter(Boolean).join(" · ");
  const base = (a.reference || b.reference || "").replace(/\s*\([^)]*\)\s*$/, "");
  if (mode === "line-by-line") {
    // One block: the first translation, then the second under it.
    const line = (c: CompareColumn) => `${c.text || ""}${c.translation ? ` — ${c.translation}` : ""}`;
    return {
      text: `${line(a)}\n${line(b)}`,
      reference: names ? `${base} (${names})` : base,
      lineCount,
      stackLines: true,
    };
  }
  return {
    text: `${a.text || ""}${label(a)}`,
    reference: names ? `${base} (${names})` : base,
    lineCount,
    extra: { text2: `${b.text || ""}${label(b)}` },
  };
}

/** The part of a Worship / Notes slide that carries a translation next to the original. */
export interface TranslatedSlide {
  text?: string;
  translationText?: string;
  translationOrder?: string;
}

/** The slide's translation, or "" when it is not showing both languages. */
export function translationOf(slide: TranslatedSlide | null | undefined): string {
  return typeof slide?.translationText === "string" ? slide.translationText.trim() : "";
}

/**
 * Worship and Notes show a translation under (or above) the original. A layer theme has one verse
 * block, so both languages go in it, one line each, in the order the operator chose.
 */
export function bilingualText(slide: TranslatedSlide): string {
  const original = (slide.text || "").trim();
  const translated = translationOf(slide);
  if (!translated) return slide.text || "";
  return slide.translationOrder === "translation-first" ? `${translated}\n${original}` : `${original}\n${translated}`;
}
