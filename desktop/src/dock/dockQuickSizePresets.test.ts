import { describe, expect, it } from "vitest";
import {
  DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN,
  DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD,
  findActiveQuickSizeOption,
  getDockQuickSizeOptions,
} from "./dockQuickSizePresets";

describe("dock quick text-size presets", () => {
  it("offers the unified LG, XL, and 2XL size choices for lower third", () => {
    expect(DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD.map((option) => option.id)).toEqual([
      "lg",
      "xl",
      "2xl",
    ]);
    expect(DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD.map((option) => option.label)).toEqual([
      "LG",
      "XL",
      "2XL",
    ]);
    expect(DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD.map((option) => option.fontSize)).toEqual([
      48,
      56,
      64,
    ]);
    expect(getDockQuickSizeOptions("lower-third")).toEqual(DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD);
    expect(getDockQuickSizeOptions("lowerThird")).toEqual(DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD);
  });

  it("offers the unified LG, XL, and 2XL size choices for full screen with higher display sizes", () => {
    expect(DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN.map((option) => option.id)).toEqual([
      "lg",
      "xl",
      "2xl",
    ]);
    expect(DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN.map((option) => option.label)).toEqual([
      "LG",
      "XL",
      "2XL",
    ]);
    expect(DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN.map((option) => option.fontSize)).toEqual([
      80,
      110,
      145,
    ]);
    expect(getDockQuickSizeOptions("fullscreen")).toEqual(DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN);
  });
});

describe("selected quick text size", () => {
  it("selects the exact preset when the theme uses one", () => {
    expect(findActiveQuickSizeOption(DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN, "fullscreen", { fontSize: 110 })?.id).toBe("xl");
    expect(findActiveQuickSizeOption(DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD, "lower-third", { lowerThirdSize: "big", fontSize: 40 })?.id).toBe("2xl");
  });

  it("always selects the closest preset instead of none", () => {
    // Full screen: a theme size or +/- step that is not a preset.
    expect(findActiveQuickSizeOption(DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN, "fullscreen", { fontSize: 96 })?.id).toBe("xl");
    expect(findActiveQuickSizeOption(DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN, "fullscreen", { fontSize: 200 })?.id).toBe("2xl");
    // Lower third: a size name no preset uses ("smaller", "bigger", "biggest").
    expect(findActiveQuickSizeOption(DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD, "lower-third", { lowerThirdSize: "smaller", fontSize: 0 })?.id).toBe("lg");
    expect(findActiveQuickSizeOption(DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD, "lower-third", { lowerThirdSize: "biggest", fontSize: 0 })?.id).toBe("2xl");
    expect(findActiveQuickSizeOption(DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD, "lower-third", { lowerThirdSize: "bigger", fontSize: 70 })?.id).toBe("2xl");
  });

  it("selects nothing only when no size is known at all", () => {
    expect(findActiveQuickSizeOption(DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN, "fullscreen", {})).toBeNull();
    expect(findActiveQuickSizeOption([], "lower-third", { fontSize: 50 })).toBeNull();
  });
});
