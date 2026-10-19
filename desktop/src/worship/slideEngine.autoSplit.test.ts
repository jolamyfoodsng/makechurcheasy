import { describe, expect, it } from "vitest";
import { autoSplitLyricsText, generateSlides } from "./slideEngine";

const authored = ["Verse 1:", "alpha", "bravo", "delta", "echo", "foxtrot", "golf"].join("\n");

describe("autoSplitLyricsText re-flows text that was split before", () => {
  it("2 lines then 3 lines gives 3-line slides, not the old 2-line ones", () => {
    const two = autoSplitLyricsText(authored, 2);
    expect(two).toBe("Verse 1:\nalpha\nbravo\n\nVerse 1:\ndelta\necho\n\nVerse 1:\nfoxtrot\ngolf");
    const three = autoSplitLyricsText(two, 3);
    expect(three).toBe("Verse 1:\nalpha\nbravo\ndelta\n\nVerse 1:\necho\nfoxtrot\ngolf");
  });
  it("unlabelled blocks flow on into each other", () => {
    expect(autoSplitLyricsText("one\ntwo\n\nthree\nfour\n\nfive", 3)).toBe("one\ntwo\nthree\n\nfour\nfive");
  });
  it("different labels stay apart", () => {
    expect(autoSplitLyricsText("Verse 1:\nalpha\nbravo\n\nChorus:\ndelta\necho", 4)).toBe("Verse 1:\nalpha\nbravo\n\nChorus:\ndelta\necho");
  });
  it("wrap off keeps long lines whole", () => {
    const long = "this is a very long line of lyrics that would normally be wrapped by the splitter";
    expect(autoSplitLyricsText(long, 2, { maxLineLength: 0 })).toBe(long);
    expect(autoSplitLyricsText(long, 2).includes("\n")).toBe(true);
  });
});

describe("hymns pasted from a hymn book", () => {
  it("starts a new section at a mid-block label, keeps the Hymn number off the slides and tidies wide gaps", () => {
    const pasted = "Hymn 5\n1: Let us sinners repent,\nJesus will come\n2: When Jesus has come,\nWe will kneel down\nChorus: Forgive us,\nForgive us all.        Amen";
    const slides = generateSlides(pasted, 2, true, { continuousLineCount: true });
    expect(slides.map((s) => [s.label, s.content])).toEqual([
      ["Verse 1", "Let us sinners repent,\nJesus will come"],
      ["Verse 2", "When Jesus has come,\nWe will kneel down"],
      ["Chorus", "Forgive us,\nForgive us all. Amen"],
    ]);
    expect(autoSplitLyricsText(pasted, 2).startsWith("Hymn 5\n\nVerse 1:\n")).toBe(true);
  });

  it("reads a language on a label and drops a stray (cont)", () => {
    const slides = generateSlides("Verse 1 (Yoruba):\nJesu awa de,\n\nVerse 1 (English):\nJesus here we come,\n\nChorus (cont):\nHallelujah", 2, true);
    expect(slides.map((s) => s.label)).toEqual(["Verse 1 (Yoruba)", "Verse 1 (English)", "Chorus"]);
  });

  it("does not take a plain lyric line in the middle of a verse for a label", () => {
    const slides = generateSlides("Verse 1:\nWe sing until the\nEnd\nof the world", 4, true);
    expect(slides).toHaveLength(1);
    expect(slides[0].content).toBe("We sing until the\nEnd\nof the world");
  });
});
