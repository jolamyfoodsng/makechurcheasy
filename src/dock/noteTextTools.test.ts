import { describe, expect, it } from "vitest";
import { autoSplitNoteText, formatNoteText, getNoteContentSections } from "./noteTextTools";

describe("note text tools", () => {
  it("auto-splits note lines into slide-sized blocks", () => {
    const formatted = autoSplitNoteText(
      [
        "First point",
        "Second point",
        "Third point",
        "Fourth point",
        "Fifth point",
        "Sixth point",
        "Seventh point",
      ].join("\n"),
      3,
    );

    expect(formatted.split(/\n\n+/)).toEqual([
      "First point\nSecond point\nThird point",
      "Fourth point\nFifth point\nSixth point",
      "Seventh point",
    ]);
  });

  it("auto-splits pasted sentences when the note has no line breaks", () => {
    const formatted = autoSplitNoteText(
      "Prayer starts here. The next sentence belongs on the slide. This is another sentence. Final sentence.",
      2,
    );

    expect(formatted.split(/\n\n+/)).toEqual([
      "Prayer starts here.\nThe next sentence belongs on the slide.",
      "This is another sentence.\nFinal sentence.",
    ]);
  });

  it("keeps note sections usable for selected slide formatting", () => {
    const content = formatNoteText("1. First line\n2. Second line", "remove-verse-numbers");

    expect(content).toBe("First line\nSecond line");
    expect(getNoteContentSections(content, "Fallback title")).toEqual(["First line\nSecond line"]);
  });
});
