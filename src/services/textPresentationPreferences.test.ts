import { describe, expect, it } from "vitest";
import { applyDockLinePresentationControls } from "./textPresentationPreferences";

const storage = {
  lineCountKey: "linesPerSlide",
  lineModeKey: "linesPerSlideOverride",
  defaultLineCount: 1,
};

describe("Dock text presentation line preferences", () => {
  it("preserves the remembered count when Original is selected", () => {
    expect(applyDockLinePresentationControls(
      storage,
      1,
      "original",
    )).toEqual({ linesPerSlideOverride: false });
  });

  it("stores a clamped count when counted mode is selected", () => {
    expect(applyDockLinePresentationControls(storage, 99, "count"))
      .toEqual({ linesPerSlide: 12, linesPerSlideOverride: true });
  });
});
