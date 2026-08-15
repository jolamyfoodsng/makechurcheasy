import { describe, expect, it } from "vitest";
import type { BiblePassage } from "../bible/types";
import type { BibleHistoryItem } from "./tabs/bibleHistoryTypes";
import {
  formatDockFavoriteBibleSearch,
  mergeFavoriteBibleSearches,
} from "./bibleSearchSuggestions";

describe("Dock Bible favorite search suggestions", () => {
  it("merges reader favorites and starred history without duplicate references", () => {
    const readerFavorite = {
      reference: "John 3:16",
      translation: "KJV",
    } as BiblePassage;
    const historyFavorite = {
      id: "history-1",
      book: "John",
      chapter: 3,
      verse: 16,
      reference: "john 3:16",
      verseText: "For God so loved the world",
      timestamp: 2,
      isFavorite: true,
      visitCount: 1,
    } satisfies BibleHistoryItem;
    const otherHistoryFavorite = {
      ...historyFavorite,
      id: "history-2",
      reference: "Psalms 24:1",
      book: "Psalms",
      chapter: 24,
      verse: 1,
    } satisfies BibleHistoryItem;

    expect(mergeFavoriteBibleSearches(
      [readerFavorite],
      [historyFavorite, otherHistoryFavorite],
    )).toEqual([
      { reference: "John 3:16", translation: "KJV" },
      { reference: "Psalms 24:1" },
    ]);
  });

  it("does not include unstarred history entries and formats translation labels", () => {
    const historyItem = {
      id: "history-1",
      book: "Mark",
      chapter: 10,
      verse: 27,
      reference: "Mark 10:27",
      verseText: "With God all things are possible",
      timestamp: 1,
      isFavorite: false,
      visitCount: 1,
    } satisfies BibleHistoryItem;

    expect(mergeFavoriteBibleSearches([], [historyItem])).toEqual([]);
    expect(formatDockFavoriteBibleSearch({
      reference: "John 3:16",
      translation: "KJV",
    })).toBe("John 3:16 — KJV");
  });
});
