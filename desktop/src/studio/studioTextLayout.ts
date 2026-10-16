/**
 * studioTextLayout.ts — "Lines per slide" and translation for songs and notes in the Studio.
 *
 * Same idea as the Dock: the person picks how many lines each slide holds (0 = Original, keep the
 * slides as written) and can translate every slide into another language. All of it works on the
 * slide cards after they are built, so Preview, Program and the Schedule all see the same text.
 */
import type { StudioSlide } from "./studioEngine";
import type { DockTranslationValue } from "../dock/components/DockTranslationControls";
import { getDockTranslationSourceSignature, getOrderedTranslationParts } from "../dock/dockTranslation";

/** Most lines one slide can hold (the Dock allows the same). */
export const MAX_STUDIO_LINES = 6;
/** What a note uses when it is split by lines but has no number saved yet (the Dock's default). */
export const DEFAULT_SPLIT_LINES = 4;

/** 0 = Original (no re-splitting), otherwise 1..MAX_STUDIO_LINES. */
export function clampLines(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_STUDIO_LINES);
}

/** The lines-per-slide a note is set to. Shared with the Dock, which stores it on the note. */
export function noteLinesOf(note: { autoSplit?: boolean; linesPerSlide?: number } | null | undefined): number {
  if (!note?.autoSplit) return 0;
  return clampLines(note.linesPerSlide ?? DEFAULT_SPLIT_LINES) || DEFAULT_SPLIT_LINES;
}

/** Cut a block of text into pieces of at most `lines` lines. Blank lines are dropped. */
export function chunkLines(text: string, lines: number): string[] {
  const n = clampLines(lines);
  if (n === 0) return [text];
  const all = text.split("\n").map((line) => line.replace(/\s+$/, "")).filter((line) => line.trim() !== "");
  if (all.length <= n) return [text];
  const out: string[] = [];
  for (let i = 0; i < all.length; i += n) out.push(all.slice(i, i + n).join("\n"));
  return out;
}

/**
 * Re-split slides that hold more than `lines` lines. A slide that is short enough is left alone,
 * so nothing is ever merged. Every extra piece keeps the original slide's origin (so the Schedule
 * and "Edit" still point at the real section) and gets a key of its own.
 */
export function reflowSlides<T extends StudioSlide>(slides: T[], lines: number): T[] {
  const n = clampLines(lines);
  if (n === 0) return slides;
  const out: T[] = [];
  for (const slide of slides) {
    if (slide.media || !slide.text) { out.push(slide); continue; }
    const pieces = chunkLines(slide.text, n);
    if (pieces.length === 1) { out.push(slide); continue; }
    pieces.forEach((text, c) => out.push({
      ...slide,
      key: c === 0 ? slide.key : `${slide.key}~${c + 1}`,
      label: c === 0 ? slide.label : `${slide.label} · ${c + 1}`,
      text,
    }));
  }
  return out;
}

/** What the translator is given: one section per slide, keyed like the Dock does. */
export function translationSections(slides: StudioSlide[]): { id: string; text: string }[] {
  return slides.filter((s) => s.text && !s.media).map((s) => ({ id: s.key, text: s.text }));
}

/** A saved translation only applies while the slides it was made from are unchanged. */
export function translationFits(value: DockTranslationValue | null | undefined, slides: StudioSlide[]): value is DockTranslationValue {
  if (!value) return false;
  return value.sourceSignature === getDockTranslationSourceSignature(translationSections(slides));
}

/** Put the translation into the slide text: translation only, or both (order as chosen). */
export function applyTranslation<T extends StudioSlide>(slides: T[], value: DockTranslationValue | null | undefined): T[] {
  if (!translationFits(value, slides)) return slides;
  return slides.map((slide) => {
    const translated = value.translatedSections[slide.key];
    if (!translated || !translated.trim() || !slide.text) return slide;
    const parts = getOrderedTranslationParts(slide.text, translated, value.showBoth !== false, value.translationOrder);
    return { ...slide, text: parts.map((p) => p.text).join("\n\n") };
  });
}
