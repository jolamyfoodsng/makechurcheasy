import { describe, expect, it } from "vitest";
import {
  formatBiblePassageReference,
  navigateBiblePassageReference,
  parseBiblePassageReference,
} from "./bibleMultiPassage";

describe("multi-passage Bible references", () => {
  it("parses full references and keeps the canonical book name", () => {
    expect(parseBiblePassageReference("John 3:16")).toEqual({
      book: "John",
      chapter: 3,
      verse: 16,
      endVerse: null,
    });
    expect(parseBiblePassageReference("Heb 4:15")).toEqual({
      book: "Hebrews",
      chapter: 4,
      verse: 15,
      endVerse: null,
    });
  });

  it("supports verse ranges and rejects chapter-only input", () => {
    const reference = parseBiblePassageReference("1 Cor 13:4-7");
    expect(reference).toEqual({
      book: "1 Corinthians",
      chapter: 13,
      verse: 4,
      endVerse: 7,
    });
    expect(parseBiblePassageReference("John 3")).toBeNull();
    expect(formatBiblePassageReference(reference!)).toBe("1 Corinthians 13:4-7");
  });

  it("moves one verse and stops at a loaded chapter boundary", () => {
    const reference = parseBiblePassageReference("John 3:16")!;
    expect(navigateBiblePassageReference(reference, 1, 36)).toMatchObject({ verse: 17, endVerse: null });
    expect(navigateBiblePassageReference({ ...reference, verse: 36 }, 1, 36)).toBeNull();
    expect(navigateBiblePassageReference({ ...reference, verse: 1 }, -1, 36)).toBeNull();
  });
});
