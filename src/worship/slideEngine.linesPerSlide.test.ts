import { describe, expect, it } from "vitest";
import {
  generateSlides,
  normalizeWorshipDisplayText,
  parseWorshipLyricSections,
} from "./slideEngine";

describe("explicit worship lines-per-slide settings", () => {
  it("removes only outer whitespace from display text", () => {
    expect(normalizeWorshipDisplayText("\n  First line\nSecond line  \n")).toBe("First line\nSecond line");
  });

  it("preserves authored stanzas when Original mode is selected", () => {
    const lyrics = [
      "Verse 1:",
      "First line",
      "Second line",
      "",
      "Chorus:",
      "Sing",
      "Again",
    ].join("\n");

    const slides = generateSlides(lyrics, 1, false);

    expect(slides.map((slide) => slide.content)).toEqual([
      "First line\nSecond line",
      "Sing\nAgain",
    ]);
  });

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

  it("reflows repeated section labels when a saved song changes line count", () => {
    const previouslySplit = [
      "Verse 1:",
      "One",
      "",
      "Verse 1:",
      "Two",
      "",
      "Verse 1:",
      "Three",
      "",
      "Verse 1:",
      "Four",
    ].join("\n");

    const slides = generateSlides(previouslySplit, 4, true, { continuousLineCount: true });

    expect(slides).toHaveLength(1);
    expect(slides[0]?.content).toBe("One\nTwo\nThree\nFour");
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

  it("reports one card per authored section when Original mode is selected", () => {
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

    const sections = parseWorshipLyricSections(lyrics, 1, false);

    expect(sections.map((section) => section.slideCount)).toEqual([1, 1]);
  });
});
