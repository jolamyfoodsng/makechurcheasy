export interface BibleOutputVerse {
  verse: number;
  text: string;
}

/**
 * Keep verse numbers in the output text for every selection, including a
 * single-verse selection. The overlay turns the prefix into a separate,
 * smaller left-side marker.
 */
export function formatBibleOutputText(
  verses: ReadonlyArray<BibleOutputVerse>,
  fallbackText = "",
  fallbackVerse?: number,
): string {
  const formattedVerses = verses
    .filter((entry) => Number.isFinite(entry.verse) && String(entry.text ?? "").trim())
    .map((entry) => `${entry.verse}. ${String(entry.text).trim()}`);

  if (formattedVerses.length > 0) return formattedVerses.join("\n");

  const cleanFallback = String(fallbackText ?? "").trim();
  if (!cleanFallback) return "";
  return Number.isFinite(fallbackVerse) && Number(fallbackVerse) > 0
    ? `${fallbackVerse}. ${cleanFallback}`
    : cleanFallback;
}
