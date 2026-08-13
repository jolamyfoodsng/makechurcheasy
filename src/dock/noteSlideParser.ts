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
