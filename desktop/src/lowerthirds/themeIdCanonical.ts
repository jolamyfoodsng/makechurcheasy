/**
 * themeIdCanonical.ts — canonicalise lower-third theme ids without loading the
 * theme catalog. Same result as canonicalizeLowerThirdThemeId() in themes.ts
 * (kept in sync by themeIdIndex.test.ts), but backed by a ~3 KB generated id
 * index so favourites and the Dock can use it at start-up.
 */
import { LOWER_THIRD_THEME_IDS, LOWER_THIRD_THEME_ID_ALIASES } from "./themeIdIndex.generated";

const THEME_ID_SET = new Set(LOWER_THIRD_THEME_IDS);

export function canonicalizeLowerThirdThemeId(themeId: string): string {
  if (!themeId) return themeId;
  if (THEME_ID_SET.has(themeId)) return themeId;
  const mapped = LOWER_THIRD_THEME_ID_ALIASES[themeId];
  if (mapped && THEME_ID_SET.has(mapped)) return mapped;
  return themeId;
}
