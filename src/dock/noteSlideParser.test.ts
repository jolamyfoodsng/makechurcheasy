import { describe, expect, it } from "vitest";
import { splitNoteBodyIntoSections } from "./noteSlideParser";

describe("note slide boundaries", () => {
  it("keeps consecutive editor lines together until a blank line", () => {
    expect(splitNoteBodyIntoSections("First verse\nSecond verse\nThird verse")).toEqual([
      "First verse\nSecond verse\nThird verse",
    ]);
  });

  it("uses a blank line as the slide boundary", () => {
    expect(splitNoteBodyIntoSections("Content here\n\n1. Content one\n2. Content two")).toEqual([
      "Content here",
      "1. Content one\n2. Content two",
    ]);
  });

  it("keeps paragraph splitting for imported notes", () => {
    expect(splitNoteBodyIntoSections("First line\nSecond line\n\nNext paragraph")).toEqual([
      "First line\nSecond line",
      "Next paragraph",
    ]);
  });
});
