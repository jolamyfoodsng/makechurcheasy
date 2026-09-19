import { describe, expect, it } from "vitest";
import { getDockBibleKeywordMatchOutputOptions } from "./dockKeywordMatch";

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
