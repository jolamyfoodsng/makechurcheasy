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

const LOWER_THIRD_SIZE_LADDER: readonly string[] = [
  "smallest",
  "smaller",
  "small",
  "medium",
  "big",
  "bigger",
  "biggest",
];

function closestByFontSize(
  options: readonly DockQuickSizeOption[],
  fontSize: number,
): DockQuickSizeOption | null {
  let best: DockQuickSizeOption | null = null;
  let bestDistance = Infinity;
  for (const option of options) {
    const distance = Math.abs(option.fontSize - fontSize);
    // On a tie keep the earlier (smaller) option.
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Which LG / XL / 2XL button to show as selected.
 *
 * A button used to light up only when the theme's size matched a preset
 * exactly. Themes often use other sizes (a lower-third "smaller" or "bigger",
 * a full-screen 96px), and the +/- text-size buttons move the size off the
 * presets too, so nothing was selected. Fall back to the closest preset so one
 * is always selected.
 */
export function findActiveQuickSizeOption(
  options: readonly DockQuickSizeOption[],
  mode: "fullscreen" | "lower-third",
  settings: { fontSize?: number | null; lowerThirdSize?: string | null },
): DockQuickSizeOption | null {
  if (!options.length) return null;
  const fontSize = Number(settings.fontSize);
  const hasFontSize = Number.isFinite(fontSize) && fontSize > 0;
  const sizeName = typeof settings.lowerThirdSize === "string" ? settings.lowerThirdSize : "";

  if (mode === "fullscreen") {
    const exact = hasFontSize ? options.find((option) => option.fontSize === fontSize) : undefined;
    if (exact) return exact;
    if (!hasFontSize && sizeName) {
      const byPreset = options.find((option) => option.preset === sizeName);
      if (byPreset) return byPreset;
    }
    return hasFontSize ? closestByFontSize(options, fontSize) : null;
  }

  const byPreset = sizeName ? options.find((option) => option.preset === sizeName) : undefined;
  if (byPreset) return byPreset;
  if (!sizeName && hasFontSize) {
    const exact = options.find((option) => option.fontSize === fontSize);
    if (exact) return exact;
  }
  if (hasFontSize) return closestByFontSize(options, fontSize);

  const rank = LOWER_THIRD_SIZE_LADDER.indexOf(sizeName);
  if (rank < 0) return null;
  let best: DockQuickSizeOption | null = null;
  let bestDistance = Infinity;
  for (const option of options) {
    const optionRank = LOWER_THIRD_SIZE_LADDER.indexOf(option.preset);
    if (optionRank < 0) continue;
    const distance = Math.abs(optionRank - rank);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}
