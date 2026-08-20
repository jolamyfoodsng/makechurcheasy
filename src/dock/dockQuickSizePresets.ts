import type { LowerThirdSize, LowerThirdWidthPreset } from "../bible/types";

/**
 * Shared size choices used by the Bible and text quick output controls.
 * The labels stay short so the controls remain usable when the dock is narrow.
 */
export const DOCK_QUICK_SIZE_OPTIONS = [
  { id: "lg", labelKey: "bible.sizeLg", label: "LG", fontSize: 32, refFontSize: 16, preset: "small", value: "small", width: "xxl" },
  { id: "xl", labelKey: "bible.sizeXl", label: "XL", fontSize: 64, refFontSize: 32, preset: "medium", value: "medium", width: "xl" },
  { id: "xxl", labelKey: "bible.sizeXxl", label: "XXL", fontSize: 96, refFontSize: 48, preset: "big", value: "big", width: "lg" },
  { id: "2xl", labelKey: "bible.size2xl", label: "2XL", fontSize: 128, refFontSize: 64, preset: "bigger", value: "bigger", width: "md" },
  { id: "3xl", labelKey: "bible.size3xl", label: "3XL", fontSize: 160, refFontSize: 80, preset: "biggest", value: "biggest", width: "sm" },
] as const;

export type DockQuickSizeOption = (typeof DOCK_QUICK_SIZE_OPTIONS)[number] & {
  preset: LowerThirdSize;
  width: LowerThirdWidthPreset;
};
