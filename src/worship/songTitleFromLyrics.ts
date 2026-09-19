import { extractStructuredTextTitle, parseWorshipSectionLabelLine } from "./slideEngine";

/**
 * Extract the first non-empty line of text to use as a title.
 * Used for auto-titling both Worship songs and Notes as the user types/pastes.
 */
export function extractFirstLineAsTitle(rawContent: string): string {
  if (!rawContent) return "";

  // 1. Structured title like [My Song] or [Notes Title], but not section labels like [Chorus]
  const structured = extractStructuredTextTitle(rawContent);
  if (structured.title && !parseWorshipSectionLabelLine(`[${structured.title}]`) && !parseWorshipSectionLabelLine(structured.title)) {
    return structured.title;
  }

  const lines = rawContent
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  // If first line is a section label (e.g. "Verse 1:" or "[Chorus]"),
  // look ahead for the first lyric line if one exists
  let target = lines[0];
  if (parseWorshipSectionLabelLine(target)) {
    const nextLyricLine = lines.find((line) => !parseWorshipSectionLabelLine(line));
    if (nextLyricLine) target = nextLyricLine;
  }

  const cleaned = target
    .replace(/^\s*[#*•\-–—]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^\[[\d]+\]\s*/, "")
    .trim();

  return cleaned || target.trim();
}

/**
 * Use the first meaningful lyric line as the song title when the user has not
 * supplied a separate title. Section headings such as "Verse 1:" are not
 * titles, and bracketed hymn titles keep their existing convention.
 */
export function deriveSongTitleFromLyrics(rawLyrics: string): string {
  const structured = extractStructuredTextTitle(rawLyrics);
  if (structured.title) return structured.title;

  const firstLine = rawLyrics
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine || parseWorshipSectionLabelLine(firstLine)) return "";

  return firstLine
    .replace(/^\s*[#*•\-–—]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}
