import type { LowerThirdSize, LowerThirdWidthPreset } from "../bible/types";

export interface DockQuickSizeOption {
  id: string;
  labelKey: string;
  label: string;
  fontSize: number;
  refFontSize: number;
  fontWeight: "black" | "extrabold" | "bold" | "normal";
  refFontWeight: "black" | "extrabold" | "bold" | "normal";
  refSpacing: number;
  preset: LowerThirdSize;
  value: string;
  width: LowerThirdWidthPreset;
  cardPadding?: number;
  cardMaxHeight?: number;
}

/**
 * Compact lower-third presets. The renderer can reduce these further for
 * unusually long passages while keeping every glyph inside the card.
 */
export const DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD: readonly DockQuickSizeOption[] = [
  { id: "lg", labelKey: "bible.sizeLg", label: "LG", fontSize: 48, refFontSize: 28, fontWeight: "black", refFontWeight: "black", refSpacing: 12, preset: "small", value: "small", width: "xxl", cardPadding: 20, cardMaxHeight: 280 },
  { id: "xl", labelKey: "bible.sizeXl", label: "XL", fontSize: 56, refFontSize: 32, fontWeight: "black", refFontWeight: "black", refSpacing: 14, preset: "medium", value: "medium", width: "xl", cardPadding: 24, cardMaxHeight: 340 },
  { id: "2xl", labelKey: "bible.size2xl", label: "2XL", fontSize: 64, refFontSize: 40, fontWeight: "black", refFontWeight: "black", refSpacing: 16, preset: "big", value: "big", width: "lg", cardPadding: 28, cardMaxHeight: 420 },
];

/**
 * Quick size presets for Full Screen: LG (80px), XL (110px), and 2XL (145px).
 * High-visibility full display presets.
 */
export const DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN: readonly DockQuickSizeOption[] = [
  { id: "lg", labelKey: "bible.sizeLg", label: "LG", fontSize: 80, refFontSize: 52, fontWeight: "black", refFontWeight: "black", refSpacing: 22, preset: "small", value: "small", width: "xxl" },
  { id: "xl", labelKey: "bible.sizeXl", label: "XL", fontSize: 110, refFontSize: 72, fontWeight: "black", refFontWeight: "black", refSpacing: 30, preset: "medium", value: "medium", width: "xl" },
  { id: "2xl", labelKey: "bible.size2xl", label: "2XL", fontSize: 145, refFontSize: 92, fontWeight: "black", refFontWeight: "black", refSpacing: 38, preset: "biggest", value: "biggest", width: "lg" },
];

/**
 * Default fallback list of size choices
 */
export const DOCK_QUICK_SIZE_OPTIONS: readonly DockQuickSizeOption[] = [
  ...DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD,
];

export function getDockQuickSizeOptions(
  mode: "fullscreen" | "lower-third" | "lowerThird" | "all" = "all",
): readonly DockQuickSizeOption[] {
  if (mode === "fullscreen") {
    return DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN;
  }
  if (mode === "lower-third" || mode === "lowerThird") {
    return DOCK_QUICK_SIZE_OPTIONS_LOWER_THIRD;
  }
  return DOCK_QUICK_SIZE_OPTIONS_FULLSCREEN;
}
