/**
 * Catalog files that are known to be partial and must never be advertised as
 * downloadable translations.
 *
 * These files remain in R2 for source-data purposes, but they are excluded
 * from every public catalog and download lookup.
 */
export const KNOWN_INCOMPLETE_BIBLE_FILENAMES = [
  "Igbo1988Bible.xml",
  "EnglishPassionBible.xml",
] as const;

const knownIncompleteBibleFilenames = new Set(
  KNOWN_INCOMPLETE_BIBLE_FILENAMES.map((filename) => filename.toLowerCase()),
);

export function isKnownIncompleteBibleFile(filename: string | null | undefined): boolean {
  return knownIncompleteBibleFilenames.has((filename ?? "").trim().toLowerCase());
}
