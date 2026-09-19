import { parseBibleSearch } from "./bibleSearchParser";
import type { BiblePassage } from "../bible/types";

export type ComparePassageNavigation = "linked" | "independent";

export interface ParsedBiblePassageReference {
  book: string;
  chapter: number;
  verse: number;
  endVerse: number | null;
}

export interface ComparePassageDraft {
  id: string;
  reference: string;
  translation: string;
}

export interface ComparePassagePreview {
  draft: ComparePassageDraft;
  parsed: ParsedBiblePassageReference | null;
  passage: BiblePassage | null;
  text: string;
  verseRange: string;
  verseEnd: number | null;
  referenceLabel: string;
  loading: boolean;
  error: string;
}

/** Parse a single exact Bible reference for the multi-passage compare view. */
export function parseBiblePassageReference(value: string): ParsedBiblePassageReference | null {
  const candidate = parseBibleSearch(value)
    .find((result) => result.chapter !== null && result.verse !== null);
  if (!candidate || candidate.chapter === null || candidate.verse === null) return null;

  return {
    book: candidate.book,
    chapter: candidate.chapter,
    verse: candidate.verse,
    endVerse: candidate.endVerse && candidate.endVerse >= candidate.verse
      ? candidate.endVerse
      : null,
  };
}

export function formatBiblePassageReference(
  reference: Pick<ParsedBiblePassageReference, "book" | "chapter" | "verse"> & { endVerse?: number | null },
): string {
  const range = reference.endVerse && reference.endVerse > reference.verse
    ? `${reference.verse}-${reference.endVerse}`
    : String(reference.verse);
  return `${reference.book} ${reference.chapter}:${range}`;
}

/** Move within the loaded chapter, returning null at either chapter boundary. */
export function navigateBiblePassageReference(
  reference: ParsedBiblePassageReference,
  direction: -1 | 1,
  maxVerse: number,
): ParsedBiblePassageReference | null {
  const nextVerse = reference.verse + direction;
  if (!Number.isFinite(maxVerse) || nextVerse < 1 || nextVerse > maxVerse) return null;

  return {
    ...reference,
    verse: nextVerse,
    endVerse: null,
  };
}
