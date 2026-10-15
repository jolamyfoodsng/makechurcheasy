import { describe, expect, it } from "vitest";
import { autoSplitLyricsText } from "./slideEngine";

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
