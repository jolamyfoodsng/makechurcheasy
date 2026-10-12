import { parseBiblePassageReference } from "./bibleMultiPassage";

/**
 * Lets any part of the Dock (Schedule drawer, History, ...) ask the Bible tab
 * to move its verse list to a verse and select it, without importing the tab.
 * Mirrors how worship songs are selected from the Schedule: an event for a
 * mounted tab, plus a pending selection for a tab that mounts a moment later.
 */
export const DOCK_SELECT_BIBLE_VERSE_EVENT = "dock:select-bible-verse";

export interface DockSelectBibleVerseDetail {
  book: string;
  chapter: number;
  verse: number;
  translation?: string;
}

let pendingBibleVerseSelection: DockSelectBibleVerseDetail | null = null;

export function setPendingBibleVerseSelection(detail: DockSelectBibleVerseDetail | null): void {
  pendingBibleVerseSelection = detail;
}

export function getPendingBibleVerseSelection(): DockSelectBibleVerseDetail | null {
  return pendingBibleVerseSelection;
}

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function stripVersionSuffix(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Work out which verse a saved/pushed Bible item points at. Items made from
 * the Bible tab carry book/chapter/verse; items made elsewhere (service
 * planner, older history rows) may only carry a label such as "John 3:16 (KJV)".
 */
export function extractBibleVerseFromPayload(
  payload: Record<string, unknown> | null | undefined,
  fallbackLabel?: string,
): DockSelectBibleVerseDetail | null {
  const source = payload ?? {};
  const translation = typeof source.translation === "string" && source.translation.trim()
    ? source.translation.trim().toUpperCase()
    : undefined;

  const book = typeof source.book === "string" ? source.book.trim() : "";
  const chapter = toPositiveInt(source.chapter);
  const verse = toPositiveInt(source.verse);
  if (book && chapter && verse) {
    return { book, chapter, verse, ...(translation ? { translation } : {}) };
  }

  // rawReferenceLabel always has the full book name, so try it first.
  const labels = [
    source.rawReferenceLabel,
    source.referenceLabel,
    source.displayReferenceLabel,
    source.reference,
    fallbackLabel,
  ];
  for (const label of labels) {
    if (typeof label !== "string" || !label.trim()) continue;
    const parsed = parseBiblePassageReference(stripVersionSuffix(label));
    if (parsed) {
      return {
        book: parsed.book,
        chapter: parsed.chapter,
        verse: parsed.verse,
        ...(translation ? { translation } : {}),
      };
    }
  }
  return null;
}
