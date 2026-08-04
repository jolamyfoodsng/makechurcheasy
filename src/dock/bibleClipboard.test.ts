import { describe, expect, it } from "vitest";
import { buildBibleVerseClipboardText } from "./bibleClipboard";

describe("Bible verse clipboard text", () => {
  it("includes the reference and translation with the verse text", () => {
    expect(buildBibleVerseClipboardText([
      { reference: "John 16:33", translation: "KJV", text: "Be of good cheer." },
    ])).toBe("John 16:33 (KJV)\nBe of good cheer.");
  });

  it("keeps compared translations as separate copy blocks", () => {
    expect(buildBibleVerseClipboardText([
      { reference: "John 16:33", translation: "KJV", text: "Be of good cheer." },
      { reference: "John 16:33", translation: "NIV", text: "Take heart." },
    ])).toBe("John 16:33 (KJV)\nBe of good cheer.\n\nJohn 16:33 (NIV)\nTake heart.");
  });
});
