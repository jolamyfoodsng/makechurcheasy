export const DEFAULT_WORSHIP_LINES_PER_SLIDE = 1;

export interface WorshipLayoutSelection {
  autoSplit: boolean;
  linesPerSlide: number;
}

/**
 * Resolve a layout choice without losing the last manual line-count choice.
 * Original mode changes only the splitting mode; the count is deliberately
 * retained so switching back to a counted layout returns to the same value.
 */
export function resolveWorshipLayoutSelection(
  currentLinesPerSlide: number,
  preset: Pick<WorshipLayoutSelection, "autoSplit" | "linesPerSlide">,
): WorshipLayoutSelection {
  const previousCount = Number.isFinite(currentLinesPerSlide) && currentLinesPerSlide > 0
    ? Math.trunc(currentLinesPerSlide)
    : DEFAULT_WORSHIP_LINES_PER_SLIDE;

  return {
    autoSplit: preset.autoSplit,
    linesPerSlide: preset.autoSplit
      ? Math.max(1, Math.trunc(preset.linesPerSlide) || DEFAULT_WORSHIP_LINES_PER_SLIDE)
      : previousCount,
  };
}
