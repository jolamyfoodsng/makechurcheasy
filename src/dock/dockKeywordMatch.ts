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
