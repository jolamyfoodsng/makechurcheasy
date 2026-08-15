import type { BiblePassage } from "../bible/types";
import type { BibleHistoryItem } from "./tabs/bibleHistoryTypes";

export interface DockFavoriteBibleSearch {
  reference: string;
  translation?: string;
}

/**
 * Combines reader favorites and starred Bible history entries for the search
 * popover. Both stores can contain the same reference, so keep one item per
 * reference and prefer the richer reader-favorite record.
 */
export function mergeFavoriteBibleSearches(
  passages: readonly BiblePassage[],
  historyItems: readonly BibleHistoryItem[],
): DockFavoriteBibleSearch[] {
  const merged = new Map<string, DockFavoriteBibleSearch>();

  for (const passage of passages) {
    const reference = passage.reference?.trim();
    if (!reference) continue;

    const key = reference.toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, {
        reference,
        translation: passage.translation?.trim() || undefined,
      });
    }
  }

  for (const item of historyItems) {
    if (!item.isFavorite) continue;

    const reference = item.reference?.trim() || `${item.book} ${item.chapter}:${item.verse}`;
    const key = reference.toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, { reference });
    }
  }

  return Array.from(merged.values());
}

export function formatDockFavoriteBibleSearch(search: DockFavoriteBibleSearch): string {
  return search.translation
    ? `${search.reference} — ${search.translation}`
    : search.reference;
}
