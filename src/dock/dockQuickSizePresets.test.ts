import { describe, expect, it } from "vitest";
import { DOCK_QUICK_SIZE_OPTIONS } from "./dockQuickSizePresets";

describe("dock quick text-size presets", () => {
  it("offers the five Bible-style size choices in ascending order", () => {
    expect(DOCK_QUICK_SIZE_OPTIONS.map((option) => option.id)).toEqual([
      "lg",
      "xl",
      "xxl",
      "2xl",
      "3xl",
    ]);
    expect(DOCK_QUICK_SIZE_OPTIONS.map((option) => option.label)).toEqual([
      "LG",
      "XL",
      "XXL",
      "2XL",
      "3XL",
    ]);
    expect(DOCK_QUICK_SIZE_OPTIONS.map((option) => option.preset)).toEqual([
      "small",
      "medium",
      "big",
      "bigger",
      "biggest",
    ]);
    expect(DOCK_QUICK_SIZE_OPTIONS.map((option) => option.fontSize)).toEqual([
      32,
      64,
      96,
      128,
      160,
    ]);
  });
});
