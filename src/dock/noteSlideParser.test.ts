import { describe, expect, it } from "vitest";
import { paginateNoteSections, splitNoteBodyIntoSections } from "./noteSlideParser";

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

  it("groups all stored note lines globally for the quick line-count setting", () => {
    const sections = ["One", "Two", "Three", "Four", "Five"].map((line) => ({
      headingLabel: "",
      lines: [line],
    }));

    expect(paginateNoteSections(sections, 2).map((slide) => slide.text)).toEqual([
      "One\nTwo",
      "Three\nFour",
      "Five",
    ]);
    expect(paginateNoteSections(sections, 3).map((slide) => slide.text)).toEqual([
      "One\nTwo\nThree",
      "Four\nFive",
    ]);
    expect(paginateNoteSections(sections, 5).map((slide) => slide.text)).toEqual([
      "One\nTwo\nThree\nFour\nFive",
    ]);
  });
});
