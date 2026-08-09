import { describe, expect, it } from "vitest";
import { deriveSongTitleFromLyrics } from "./songTitleFromLyrics";

describe("deriveSongTitleFromLyrics", () => {
  it("uses the first non-empty lyric line", () => {
    expect(deriveSongTitleFromLyrics("\nAmazing Grace\nVerse one line")).toBe("Amazing Grace");
  });

  it("supports bracketed hymn titles", () => {
    expect(deriveSongTitleFromLyrics("[Orin 969]\n2: Jesu Kristi wa pelu mi")).toBe("Orin 969");
  });

  it("does not mistake a section heading for a title", () => {
    expect(deriveSongTitleFromLyrics("Verse 1:\nAmazing grace")).toBe("");
  });

  it("preserves Unicode song titles", () => {
    expect(deriveSongTitleFromLyrics("Kyerɛ yɛn W'anuonyam\nOwura")).toBe("Kyerɛ yɛn W'anuonyam");
  });
});
