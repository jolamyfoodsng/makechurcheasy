import type { BibleTheme } from "./types";

export type BibleOverlayMode = "fullscreen" | "lower-third";

function hasEnabledVariant(theme: Pick<BibleTheme, "enabledVariants">, mode: BibleOverlayMode): boolean {
  return !Array.isArray(theme.enabledVariants) || theme.enabledVariants.length === 0
    ? true
    : theme.enabledVariants.includes(mode);
}

export function themeSupportsBibleOverlayMode(
  theme: Pick<BibleTheme, "templateType" | "enabledVariants" | "variants">,
  mode: BibleOverlayMode,
): boolean {
  if (!hasEnabledVariant(theme, mode)) {
    return false;
  }

  if (mode === "lower-third") {
    return theme.templateType === "lower-third" || Boolean(theme.variants?.lowerThird);
  }

  return theme.templateType === "fullscreen"
    || theme.templateType === "side-by-side"
    || Boolean(theme.variants?.fullscreen);
}
