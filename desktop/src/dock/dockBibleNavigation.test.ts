import { describe, expect, it } from "vitest";
import {
  extractBibleVerseFromPayload,
  getPendingBibleVerseSelection,
  setPendingBibleVerseSelection,
} from "./dockBibleNavigation";

describe("Bible verse navigation from Schedule and History", () => {
  it("reads book, chapter and verse straight from a Bible item", () => {
    expect(extractBibleVerseFromPayload({ book: "John", chapter: 3, verse: 16, translation: "kjv" }))
      .toEqual({ book: "John", chapter: 3, verse: 16, translation: "KJV" });
  });

  it("falls back to the reference label when the item has no book/chapter/verse", () => {
    expect(extractBibleVerseFromPayload({ referenceLabel: "John 3:16 (KJV)" })).toMatchObject({
      book: "John",
      chapter: 3,
      verse: 16,
    });
    expect(extractBibleVerseFromPayload({}, "Romans 8:28")).toMatchObject({
      book: "Romans",
      chapter: 8,
      verse: 28,
    });
  });

  it("returns null when the item has no usable reference", () => {
    expect(extractBibleVerseFromPayload({ verseText: "In the beginning" }, "Sunday message")).toBeNull();
    expect(extractBibleVerseFromPayload(null)).toBeNull();
  });

  it("holds a pending selection for a Bible tab that mounts a moment later", () => {
    setPendingBibleVerseSelection({ book: "John", chapter: 3, verse: 16 });
    expect(getPendingBibleVerseSelection()).toEqual({ book: "John", chapter: 3, verse: 16 });
    setPendingBibleVerseSelection(null);
    expect(getPendingBibleVerseSelection()).toBeNull();
  });
});
