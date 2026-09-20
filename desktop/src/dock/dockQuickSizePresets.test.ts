import { describe, expect, it } from "vitest";
import {
  DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN,
  DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD,
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
