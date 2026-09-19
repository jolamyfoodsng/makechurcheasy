import { describe, expect, it } from "vitest";
import { formatBibleOutputText } from "./bibleVerseText";
import overlaySource from "../../public/mce-bible-overlay.html?raw";
import worshipOverlaySource from "../../public/mce-worship-overlay.html?raw";

describe("Bible projected verse numbers", () => {
  it("keeps the verse number in the payload for one verse", () => {
    expect(formatBibleOutputText([{ verse: 6, text: "The verse text." }])).toBe(
      "6. The verse text.",
    );
  });

  it("keeps every verse number when projecting multiple verses", () => {
    expect(formatBibleOutputText([
      { verse: 6, text: "The first verse." },
      { verse: 7, text: "The second verse." },
    ])).toBe("6. The first verse.\n7. The second verse.");
  });

  it("prefixes a fallback fetch with its verse number", () => {
    expect(formatBibleOutputText([], "The fetched verse.", 6)).toBe("6. The fetched verse.");
  });

  it("renders the marker separately at half the Bible text size", () => {
    expect(overlaySource).toContain('class="verse-text__number"');
    expect(overlaySource).toContain("font-size: 0.5em");
    expect(overlaySource).toContain("position: absolute");
    expect(overlaySource).toContain("function positionVerseNumbers(rootNode)");
    expect(overlaySource).toContain("class=\"verse-text__body\"");
    expect(overlaySource).toContain("function renderVerseLines(text, lineCount)");
    expect(overlaySource).toContain("const hideVerseNumbers = Number(lineCount) === 1");
    expect(overlaySource).toContain("renderVerseLines(sl.text, sl.lineCount)");
    expect(worshipOverlaySource).toContain('class="verse-text__number"');
    expect(worshipOverlaySource).toContain("font-size: 0.5em");
    expect(worshipOverlaySource).toContain("position: absolute");
    expect(worshipOverlaySource).toContain("function positionVerseNumbers(rootNode)");
    expect(worshipOverlaySource).toContain("function renderVerseLines(text, lineCount)");
    expect(worshipOverlaySource).toContain("const hideVerseNumbers = Number(lineCount) === 1");
  });
});
