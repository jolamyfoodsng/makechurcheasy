import { extractStructuredTextTitle, parseWorshipSectionLabelLine } from "./slideEngine";

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
    .replace(/^\s*[#*]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}
