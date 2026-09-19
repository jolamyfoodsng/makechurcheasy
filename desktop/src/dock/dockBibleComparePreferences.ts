export type DockBibleDisplayMode = "single" | "compare";

export interface DockBibleComparePreferenceState {
  compareEnabled?: boolean;
  displayMode?: DockBibleDisplayMode;
}

export const DEFAULT_DOCK_BIBLE_COMPARE_ENABLED = false;

export function resolveInitialDockBibleCompareEnabled(
  preferences: DockBibleComparePreferenceState,
): boolean {
  if (typeof preferences.compareEnabled === "boolean") {
    return preferences.compareEnabled;
  }

  // Keep the legacy displayMode preference for existing users while making a
  // brand-new Bible dock start in the normal single-reference view.
  return preferences.displayMode === "compare"
    ? true
    : DEFAULT_DOCK_BIBLE_COMPARE_ENABLED;
}
