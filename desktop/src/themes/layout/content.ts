/**
 * Turns the live packet (text + reference) into the values theme tokens use.
 */
import type { ThemeContent } from "./types";

export interface ResolvedTokens {
  text: string;
  reference: string;
  referenceShort: string;
  book: string;
  chapter: string;
  verses: string;
  chapterVerse: string;
  translation: string;
}

/**
 * Parses "John 3:16-18 (KJV)", "1 Corinthians 13:4", "Psalm 23", "Amazing Grace".
 * Anything that is not a scripture reference (worship titles, note titles) lands
 * in `book` with chapter/verses empty, so `{reference}` still shows it as-is.
 */
export function parseReference(raw: string): Omit<ResolvedTokens, "text"> {
  const reference = (raw || "").trim();
  let rest = reference;
  let translation = "";
  const tr = rest.match(/\s*\(([^()]{1,24})\)\s*$/);
  if (tr) {
    translation = tr[1].trim();
    rest = rest.slice(0, tr.index).trim();
  }
  const m = rest.match(/^(.+?)\s+(\d{1,3})(?::\s*([\d\s,–—-]+[a-z]?))?$/i);
  if (!m) {
    return {
      reference,
      referenceShort: rest,
      book: rest,
      chapter: "",
      verses: "",
      chapterVerse: "",
      translation,
    };
  }
  const book = m[1].trim();
  const chapter = m[2];
  const verses = (m[3] || "").replace(/\s+/g, "");
  return {
    reference,
    referenceShort: rest,
    book,
    chapter,
    verses,
    chapterVerse: verses ? `${chapter}:${verses}` : chapter,
    translation,
  };
}

export function resolveTokens(content: ThemeContent): ResolvedTokens {
  return { text: content.text || "", ...parseReference(content.reference || "") };
}

const TOKEN_RE = /\{(text|reference|referenceShort|book|chapter|verses|chapterVerse|translation)\}/g;

export function hasTokens(pattern: string | undefined): boolean {
  if (!pattern) return false;
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(pattern);
}

export function fillTokens(pattern: string, tokens: ResolvedTokens): string {
  return pattern.replace(TOKEN_RE, (_, key: keyof ResolvedTokens) => tokens[key] ?? "").trim();
}

export function isVerseTextPattern(pattern: string | undefined): boolean {
  return (pattern || "").trim() === "{text}";
}

export interface VerseLine {
  number: string;
  body: string;
}

/** Same line format the legacy overlays use: "[16] For God…" or "16. For God…". */
export function splitVerseLines(text: string, lineCount?: number): VerseLine[] {
  const hideNumbers = Number(lineCount) === 1;
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(?:\[(\d+)\]|(\d+)[.)])\s+([\s\S]+)$/);
      if (!match) return { number: "", body: line };
      return { number: hideNumbers ? "" : match[1] || match[2], body: match[3] };
    });
}
