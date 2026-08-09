import type { CatalogBible, RawBibleData } from "./types";

export const MIN_COMPLETE_BIBLE_BOOKS = 50;
export const MIN_COMPLETE_BIBLE_VERSES = 20000;

const KNOWN_INCOMPLETE_CATALOG_IDS = new Set([
  "ebf729fc-7bb8-a069-06cd-d37f77f7430a", // Igbo1988Bible.xml, shows as 1B and only contains a partial corpus.
  "0a5f01d6-4856-f192-44bd-3a665f8e3d39", // EnglishPassionBible.xml (PB), 19,798 verses.
]);

const KNOWN_INCOMPLETE_FILENAMES = new Set([
  "igbo1988bible.xml",
  "englishpassionbible.xml",
]);

export interface BibleDataStats {
  books: number;
  chapters: number;
  verses: number;
}

export function getBibleDataStats(data: RawBibleData | null | undefined): BibleDataStats {
  let books = 0;
  let chapters = 0;
  let verses = 0;

  if (!data || typeof data !== "object") return { books, chapters, verses };

  for (const chapterMap of Object.values(data)) {
    if (!chapterMap || typeof chapterMap !== "object") continue;
    let bookHasVerse = false;

    for (const verseMap of Object.values(chapterMap)) {
      if (!verseMap || typeof verseMap !== "object") continue;
      let chapterHasVerse = false;

      for (const text of Object.values(verseMap)) {
        if (typeof text === "string" && text.trim()) {
          verses++;
          chapterHasVerse = true;
          bookHasVerse = true;
        }
      }

      if (chapterHasVerse) chapters++;
    }

    if (bookHasVerse) books++;
  }

  return { books, chapters, verses };
}

export function isCompleteBibleData(data: RawBibleData | null | undefined): boolean {
  const stats = getBibleDataStats(data);
  return stats.books >= MIN_COMPLETE_BIBLE_BOOKS && stats.verses >= MIN_COMPLETE_BIBLE_VERSES;
}

export function formatBibleDataStats(stats: BibleDataStats): string {
  return `${stats.books} books, ${stats.verses.toLocaleString()} verses`;
}

export function assertCompleteBibleData(data: RawBibleData, label = "This Bible"): void {
  const stats = getBibleDataStats(data);
  if (stats.books >= MIN_COMPLETE_BIBLE_BOOKS && stats.verses >= MIN_COMPLETE_BIBLE_VERSES) return;

  throw new Error(
    `${label} looks incomplete (${formatBibleDataStats(stats)} found). It was not installed so it will not show empty verses.`
  );
}

export function isKnownIncompleteCatalogBible(bible: Pick<CatalogBible, "id" | "filename">): boolean {
  const filename = (bible.filename || "").trim().toLowerCase();
  return KNOWN_INCOMPLETE_CATALOG_IDS.has(bible.id) || KNOWN_INCOMPLETE_FILENAMES.has(filename);
}

export function filterDownloadableCatalogBibles(items: CatalogBible[]): CatalogBible[] {
  return items.filter((item) => !isKnownIncompleteCatalogBible(item));
}
