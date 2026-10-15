/**
 * lyricTools.ts — the text tools behind the buttons in the song editor
 * (TT / tt / Tt, Clean, Trim Gaps, Strip Numbers, Chords, Add label, Split here)
 * and the "lines per slide" numbers shown for each song.
 *
 * Everything here is Unicode-aware on purpose: Yoruba (ẹ ọ ṣ and tone marks), Greek,
 * Cyrillic, Arabic and Chinese lyrics must come out the same as English ones.
 * (The old versions only knew A–Z, so "àwọn" became "àWọn" and a line written only in
 * non-English letters could be deleted by Trim Gaps.)
 */
import type { Slide, Song } from "./types";

const LETTER = /\p{L}/u;
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;
const APOSTROPHES = "'’";

/** Does this line have any letter or digit in any language? */
export function hasWordCharacter(line: string): boolean {
  return /[\p{L}\p{N}]/u.test(line);
}

/** Capitalize the first letter of every word and lower-case the rest. Works with accents and tone marks. */
export function capitalizeLyricsText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const chars = Array.from(line.toLocaleLowerCase());
      for (let i = 0; i < chars.length; i += 1) {
        if (!LETTER.test(chars[i])) continue;
        const prev = i > 0 ? chars[i - 1] : "";
        const beforePrev = i > 1 ? chars[i - 2] : "";
        const insideWord = prev !== "" && WORD_CHAR.test(prev);
        // "don't": the t after the apostrophe is not a new word. 'Hello' in quotes still is.
        const afterContraction = prev !== "" && APOSTROPHES.includes(prev) && beforePrev !== "" && LETTER.test(beforePrev);
        if (!insideWord && !afterContraction) chars[i] = chars[i].toLocaleUpperCase();
      }
      return chars.join("");
    })
    .join("\n");
}

/** Tidy pasted text: odd spaces, spacing around punctuation, trailing spaces. Keeps every word and every blank line. */
export function cleanLyricsText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[​⁠﻿]/g, "")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => {
      let next = line;
      next = next.replace(/\t/g, " ");
      next = next.replace(/\s{2,}/g, " ");
      next = next.replace(/\s+([,.;:!?])/g, "$1");
      // A space after , ; : ! ? when a letter follows ("God,Amen" → "God, Amen"; never inside 10:30).
      next = next.replace(/([,;:!?])(\p{L})/gu, "$1 $2");
      // After a full stop only when a capital follows a lower-case word ("end.Next" → "end. Next"; "U.S.A" stays).
      next = next.replace(/(\p{Ll})\.(\p{Lu})/gu, "$1. $2");
      next = next.replace(/\s+$/g, "");
      return next.trimStart();
    })
    .join("\n");
}

/** Collapse runs of empty lines to ONE empty line (the gap between slides). Lines with only dashes, dots or symbols count as empty. */
export function removeEmptyLyricsLines(text: string): string {
  const lines = text.split("\n");
  const collapsed: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const isBlank = trimmed === "" || !hasWordCharacter(trimmed);
    if (isBlank) {
      blankCount += 1;
      if (blankCount <= 1) collapsed.push("");
      continue;
    }
    blankCount = 0;
    collapsed.push(line);
  }
  return collapsed.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

/** Remove "1.", "2)", "[3]", "(4)" and "Verse 5:" at the start of a line. Lines like "10.5 percent" are left alone. */
export function removeVerseNumbers(text: string): string {
  return text
    .replace(/^[ \t]*\d{1,3}[.)](?:[ \t]+|$)/gm, "")
    .replace(/^[ \t]*\[\d{1,3}\][ \t]*/gm, "")
    .replace(/^[ \t]*\(\d{1,3}\)[ \t]*/gm, "")
    .replace(/^[ \t]*Verse[ \t]+\d{1,3}[ \t]*:?[ \t]*/gim, "");
}

const CHORD = /^[A-G][#b♯♭]?(?:maj|min|m|M|sus|dim|aug|add)?\d{0,2}(?:sus\d?|add\d{1,2}|b5|#5|b9|#9)?(?:\/[A-G][#b♯♭]?)?$/;

function isChordToken(token: string): boolean {
  return CHORD.test(token.replace(/[()]/g, ""));
}

/** Remove chord lines (G  D  Em  C) and inline chords like [G] or [Am7] from a pasted chord sheet. Section labels like [Chorus] stay. */
export function removeChords(text: string): string {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (trimmed) {
      const tokens = trimmed.split(/[\s|–-]+/).filter(Boolean);
      const allChords = tokens.length > 0 && tokens.every(isChordToken);
      if (allChords && (tokens.length > 1 || tokens[0].length > 1)) continue;
    }
    out.push(raw.replace(/\[([^\]\n]{1,10})\]/g, (whole, inner: string) => (isChordToken(inner.trim()) ? "" : whole)).replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/g, ""));
  }
  return out.join("\n");
}

export const SECTION_LABELS = ["Verse", "Pre-Chorus", "Chorus", "Bridge", "Tag", "Intro", "Outro"] as const;
export type SectionLabelName = (typeof SECTION_LABELS)[number];

/** Put a [Chorus]-style label above the line the cursor is on, with an empty line before it. Returns the new text and cursor. */
export function insertSectionLabel(text: string, caret: number, label: string): { text: string; caret: number } {
  const at = Math.max(0, Math.min(text.length, caret));
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const before = text.slice(0, lineStart);
  const after = text.slice(lineStart);
  const gap = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const tag = `[${label}]\n`;
  const next = `${before}${gap}${tag}${after}`;
  return { text: next, caret: before.length + gap.length + tag.length };
}

/** Start a new slide at the cursor: break the line there and leave an empty line. */
export function splitSlideAt(text: string, caret: number): { text: string; caret: number } {
  const at = Math.max(0, Math.min(text.length, caret));
  const before = text.slice(0, at).replace(/[ \t]+$/g, "").replace(/\n+$/g, "");
  const after = text.slice(at).replace(/^[ \t]+/g, "").replace(/^\n+/g, "");
  if (!before || !after) return { text, caret: at };
  return { text: `${before}\n\n${after}`, caret: before.length + 2 };
}

export interface LineStats {
  slides: number;
  lines: number;
  /** Lines per slide: the most common count (ties go to the larger). */
  typical: number;
  shortest: number;
  longest: number;
  /** "2 lines per slide", "2 lines per slide (1–4)", "no slides". */
  label: string;
  /** Short form for lists: "2 lines/slide", "1–4 lines/slide". */
  short: string;
}

function nonEmptyLines(content: string): number {
  return content.split("\n").filter((line) => line.trim().length > 0).length;
}

/** The lines-per-slide numbers for a set of slides. */
export function lineStats(slides: Array<Pick<Slide, "content">>): LineStats {
  const counts = slides.map((slide) => nonEmptyLines(slide.content));
  if (counts.length === 0) return { slides: 0, lines: 0, typical: 0, shortest: 0, longest: 0, label: "no slides", short: "no slides" };
  const tally = new Map<number, number>();
  for (const c of counts) tally.set(c, (tally.get(c) ?? 0) + 1);
  let typical = counts[0];
  let best = 0;
  for (const [count, times] of tally) {
    if (times > best || (times === best && count > typical)) { typical = count; best = times; }
  }
  const shortest = Math.min(...counts);
  const longest = Math.max(...counts);
  const lines = counts.reduce((a, b) => a + b, 0);
  const plural = (n: number) => `${n} line${n === 1 ? "" : "s"}`;
  const label = shortest === longest ? `${plural(typical)} per slide` : `${plural(typical)} per slide (${shortest}–${longest})`;
  const short = shortest === longest ? `${plural(typical)}/slide` : `${shortest}–${longest} lines/slide`;
  return { slides: counts.length, lines, typical, shortest, longest, label, short };
}

/** Lines per slide for a saved song, measured from its real slides (the saved setting is only the last button pressed). */
export function songLineStats(song: Pick<Song, "slides">): LineStats {
  return lineStats(song.slides ?? []);
}
