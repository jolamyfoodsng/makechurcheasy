/**
 * Split note content into the sections consumed by the Dock Notes slide
 * generator. A single newline keeps the next line in the same slide; a blank
 * line is the explicit boundary between slides.
 */
export function splitNoteBodyIntoSections(content: string): string[] {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  return normalized
    .split(/\n[ \t]*\n+/)
    .map((section) => section.trim())
    .filter(Boolean);
}

export interface NoteSlideSection {
  headingLabel: string;
  lines: string[];
}

export interface NoteSlideChunk {
  headingLabel: string;
  text: string;
}

/**
 * Group every non-empty note line as one continuous sequence.
 * Blank lines may separate stored paragraphs, but they must not prevent the
 * Dock's Lines per note setting from grouping the next lines together.
 */
export function paginateNoteSections(
  sections: NoteSlideSection[],
  linesPerSlide: number,
): NoteSlideChunk[] {
  const requestedLineCount = Number.isFinite(linesPerSlide) ? Math.trunc(linesPerSlide) : 1;
  const lineCount = Math.max(1, requestedLineCount || 1);
  const lines = sections.flatMap((section) => section.lines
    .map((line, lineIndex) => ({
      text: line.trim(),
      headingLabel: lineIndex === 0 ? section.headingLabel : "",
    }))
    .filter((line) => Boolean(line.text)));
  const chunks: NoteSlideChunk[] = [];

  for (let start = 0; start < lines.length; start += lineCount) {
    const chunkLines = lines.slice(start, start + lineCount);
    chunks.push({
      headingLabel: chunkLines.find((line) => line.headingLabel)?.headingLabel ?? "",
      text: chunkLines.map((line) => line.text).join("\n"),
    });
  }

  return chunks;
}
