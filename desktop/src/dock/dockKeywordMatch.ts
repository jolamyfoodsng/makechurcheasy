const DEFAULT_MAX_KEYWORD_MATCH_LINES = 4;

export type DockKeywordMatchRange = {
  verse: number;
  endVerse?: number;
};

export type DockKeywordMatchOutputOptions = {
  lineCount: number;
  rangeEndVerse: number | null;
};

export function getDockBibleKeywordMatchOutputOptions(
  result: DockKeywordMatchRange,
  maxLines = DEFAULT_MAX_KEYWORD_MATCH_LINES,
): DockKeywordMatchOutputOptions {
  const safeMaxLines = Math.max(1, Math.floor(maxLines));
  const hasRange = Number.isFinite(result.endVerse)
    && result.endVerse !== undefined
    && result.endVerse > result.verse;
  const rangeEndVerse = hasRange ? result.endVerse ?? null : null;
  const rawLineCount = hasRange && rangeEndVerse !== null
    ? rangeEndVerse - result.verse + 1
    : 1;

  return {
    lineCount: Math.min(Math.max(rawLineCount, 1), safeMaxLines),
    rangeEndVerse,
  };
}

export function getKeywordSearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9']+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  );
}

export type KeywordTextSegment = {
  text: string;
  isMatch: boolean;
};

export function splitTextByKeywordTerms(text: string, query: string): KeywordTextSegment[] {
  if (!text) return [];
  const terms = getKeywordSearchTerms(query);
  if (terms.length === 0) return [{ text, isMatch: false }];

  const escapedTerms = terms
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);
  if (escapedTerms.length === 0) return [{ text, isMatch: false }];

  const isAlphaNumericAscii = escapedTerms.every((t) => /^[a-zA-Z0-9']+$/.test(t));
  const pattern = isAlphaNumericAscii
    ? `\\b(?:${escapedTerms.map((t) => `${t}(?:'s|s|es|ed|ing|eth|est)?`).join("|")})\\b`
    : `(?:${escapedTerms.join("|")})`;

  const regex = new RegExp(`(${pattern})`, "gi");
  const rawSegments = text.split(regex);

  const segments: KeywordTextSegment[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const segment = rawSegments[i];
    if (!segment) continue;
    // Capturing groups are placed at odd indices in String.prototype.split()
    segments.push({
      text: segment,
      isMatch: i % 2 === 1,
    });
  }
  return segments;
}
