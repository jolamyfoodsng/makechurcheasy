import { describe, expect, it } from "vitest";
import {
  ALL_THEME_IDS,
  canonicalizeLowerThirdThemeId as canonicalizeFromCatalog,
  getLowerThirdThemeIdAliasEntries,
} from "./themes";
import { canonicalizeLowerThirdThemeId } from "./themeIdCanonical";
import { LOWER_THIRD_THEME_IDS, LOWER_THIRD_THEME_ID_ALIASES } from "./themeIdIndex.generated";

const REGENERATE = "Run `node scripts/export-lower-third-theme-ids.cjs` to update themeIdIndex.generated.ts.";

describe("lower-third theme id index", () => {
  it("lists the same theme ids as the catalog", () => {
    expect([...LOWER_THIRD_THEME_IDS].sort(), REGENERATE).toEqual([...new Set(ALL_THEME_IDS)].sort());
  });

  it("has the same aliases as the catalog", () => {
    expect(LOWER_THIRD_THEME_ID_ALIASES, REGENERATE).toEqual(Object.fromEntries(getLowerThirdThemeIdAliasEntries()));
  });

  it("canonicalises ids exactly like the catalog", () => {
    const samples = [...ALL_THEME_IDS, ...Object.keys(LOWER_THIRD_THEME_ID_ALIASES), "", "not-a-theme"];
    for (const id of samples) {
      expect(canonicalizeLowerThirdThemeId(id)).toBe(canonicalizeFromCatalog(id));
    }
  });
});
