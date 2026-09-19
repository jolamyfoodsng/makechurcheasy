import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORSHIP_LINES_PER_SLIDE,
  resolveWorshipLayoutSelection,
} from "./slideLayout";

describe("worship slide layout selection", () => {
  it("keeps the previous count when Original is selected", () => {
    expect(resolveWorshipLayoutSelection(4, { autoSplit: false, linesPerSlide: 2 })).toEqual({
      autoSplit: false,
      linesPerSlide: 4,
    });
  });

  it("restores the preserved count when switching back to counted slides", () => {
    const original = resolveWorshipLayoutSelection(3, { autoSplit: false, linesPerSlide: 2 });
    expect(resolveWorshipLayoutSelection(original.linesPerSlide, { autoSplit: true, linesPerSlide: 3 })).toEqual({
      autoSplit: true,
      linesPerSlide: 3,
    });
  });

  it("uses the shared Dock default for an invalid previous count", () => {
    expect(resolveWorshipLayoutSelection(0, { autoSplit: false, linesPerSlide: 2 }).linesPerSlide)
      .toBe(DEFAULT_WORSHIP_LINES_PER_SLIDE);
  });
});
