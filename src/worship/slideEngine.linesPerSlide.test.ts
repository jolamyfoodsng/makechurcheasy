import { describe, expect, it } from "vitest";
import { generateSlides } from "./slideEngine";

describe("explicit worship lines-per-slide settings", () => {
  it("groups blank-separated unlabelled lyric lines by the selected count", () => {
    const lyrics = [
      "First line",
      "",
      "Second line",
      "",
      "Third line",
      "",
      "Fourth line",
    ].join("\n");

    const slides = generateSlides(lyrics, 2, true, { continuousLineCount: true });

    expect(slides.map((slide) => slide.content)).toEqual([
      "First line\nSecond line",
      "Third line\nFourth line",
    ]);
  });

  it("keeps explicit lyric sections separate while splitting each section", () => {
    const lyrics = [
      "Verse 1:",
      "One",
      "Two",
      "Three",
      "",
      "Chorus:",
      "Sing",
      "Again",
    ].join("\n");

    const slides = generateSlides(lyrics, 2, true, { continuousLineCount: true });

    expect(slides.map((slide) => slide.content)).toEqual([
      "One\nTwo",
      "Three",
      "Sing\nAgain",
    ]);
    expect(slides.map((slide) => slide.label)).toEqual([
      "Verse 1",
      "Verse 1 (cont)",
      "Chorus",
    ]);
  });
});
