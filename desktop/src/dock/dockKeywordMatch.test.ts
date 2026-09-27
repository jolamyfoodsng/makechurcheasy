import { describe, expect, it } from "vitest";
import {
  getDockBibleKeywordMatchOutputOptions,
  splitTextByKeywordTerms,
} from "./dockKeywordMatch";

describe("dock keyword match output options", () => {
  it("keeps a single keyword match as one output line", () => {
    expect(getDockBibleKeywordMatchOutputOptions({ verse: 9 })).toEqual({
      lineCount: 1,
      rangeEndVerse: null,
    });
  });

  it("preserves a valid verse range while capping the displayed line count", () => {
    expect(getDockBibleKeywordMatchOutputOptions({ verse: 2, endVerse: 4 })).toEqual({
      lineCount: 3,
      rangeEndVerse: 4,
    });
    expect(getDockBibleKeywordMatchOutputOptions({ verse: 2, endVerse: 8 })).toEqual({
      lineCount: 4,
      rangeEndVerse: 8,
    });
  });

  it("ignores an invalid or backwards range", () => {
    expect(getDockBibleKeywordMatchOutputOptions({ verse: 5, endVerse: 5 })).toEqual({
      lineCount: 1,
      rangeEndVerse: null,
    });
    expect(getDockBibleKeywordMatchOutputOptions({ verse: 5, endVerse: 3 })).toEqual({
      lineCount: 1,
      rangeEndVerse: null,
    });
  });
});

describe("splitTextByKeywordTerms", () => {
  it("does not split inside words like 'unto' when searching 'to'", () => {
    const text = "Thou shalt be over my house, and according unto thy word shall all my people be ruled";
    const query = "according to your word";
    const segments = splitTextByKeywordTerms(text, query);

    // "according" is matched
    const matchedTexts = segments.filter((s) => s.isMatch).map((s) => s.text);
    expect(matchedTexts).toContain("according");
    expect(matchedTexts).toContain("word");
    // "to" must NOT match inside "unto"
    expect(matchedTexts).not.toContain("to");

    // The text segment containing "unto" must be whole, not "un" + "to"
    const joined = segments.map((s) => s.text).join("");
    expect(joined).toBe(text);
    expect(segments.some((s) => s.text === "unto" || s.text.includes("unto"))).toBe(true);
    expect(segments.some((s) => s.text === "un " || s.text === "un")).toBe(false);
  });

  it("highlights whole plural words like 'words' when searching 'word'", () => {
    const text = "Now also it according unto your words: he with whom it is found";
    const query = "according to your word";
    const segments = splitTextByKeywordTerms(text, query);

    const matchedTexts = segments.filter((s) => s.isMatch).map((s) => s.text);
    expect(matchedTexts).toContain("according");
    expect(matchedTexts).toContain("your");
    // "words" must be matched as a complete word, not "word" + "s:"
    expect(matchedTexts).toContain("words");
    expect(segments.some((s) => s.text === "word")).toBe(false);
  });

  it("does not split 'Tomorrow' when searching 'to'", () => {
    const text = "Tomorrow we will go unto the city";
    const segments = splitTextByKeywordTerms(text, "to");
    const matchedTexts = segments.filter((s) => s.isMatch).map((s) => s.text);
    expect(matchedTexts).toHaveLength(0);
  });

  it("handles case-insensitivity while preserving original casing", () => {
    const text = "The Word of God was spoken";
    const segments = splitTextByKeywordTerms(text, "word");
    const matched = segments.find((s) => s.isMatch);
    expect(matched?.text).toBe("Word");
  });
});
