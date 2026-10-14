import { describe, expect, it } from "vitest";
import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";
import { LAYOUT_PRESET_THEMES, NEW_USER_THEME_IDS, STARTER_DEFAULT_THEME_ID } from "../themes/layout/presetThemes";
import { filterThemesForDockArea } from "./dockThemeAvailability";
import {
  initialThemeLibrary,
  isThemeInLibrary,
  parseThemeLibrary,
  themeIdsOutsideLibrary,
  withThemeAdded,
  withThemeRemoved,
} from "./themeLibrary";

const readyMadeIds = BUILTIN_THEMES.map((theme) => theme.id);

describe("theme library", () => {
  it("starts new accounts with Royal Blue Glow, Serif Tab Band and Royal Frame", () => {
    expect(NEW_USER_THEME_IDS).toEqual(["preset-royal-blue-glow", "preset-serif-tab-band", "preset-royal-frame"]);
    expect(STARTER_DEFAULT_THEME_ID).toBe(NEW_USER_THEME_IDS[0]);
    expect(LAYOUT_PRESET_THEMES.slice(0, 3).map((theme) => theme.id)).toEqual([...NEW_USER_THEME_IDS]);
    expect(BUILTIN_THEMES.slice(0, 3).map((theme) => theme.id)).toEqual([...NEW_USER_THEME_IDS]);
    for (const id of NEW_USER_THEME_IDS) {
      const theme = BUILTIN_THEMES.find((item) => item.id === id)!;
      expect(Boolean(theme.variants?.fullscreen && theme.variants?.lowerThird)).toBe(true);
    }
  });

  it("a new account sees only the three, everything else is outside the library", () => {
    const library = initialThemeLibrary(false);
    expect(library.mode).toBe("curated");
    const outside = themeIdsOutsideLibrary(library, readyMadeIds);
    expect(readyMadeIds.filter((id) => !outside.has(id))).toEqual([...NEW_USER_THEME_IDS]);
  });

  it("an account that finished onboarding keeps every theme; a missing file means everything", () => {
    expect(initialThemeLibrary(true).mode).toBe("all");
    expect(themeIdsOutsideLibrary(initialThemeLibrary(true), readyMadeIds).size).toBe(0);
    expect(themeIdsOutsideLibrary(null, readyMadeIds).size).toBe(0);
    expect(isThemeInLibrary(null, "preset-confetti-frame")).toBe(true);
  });

  it("adds and removes themes, and the starting three cannot be removed", () => {
    let library = initialThemeLibrary(false);
    library = withThemeAdded(library, "preset-confetti-frame");
    expect(isThemeInLibrary(library, "preset-confetti-frame")).toBe(true);
    expect(withThemeAdded(library, "preset-confetti-frame")).toBe(library);
    library = withThemeRemoved(library, "preset-confetti-frame");
    expect(isThemeInLibrary(library, "preset-confetti-frame")).toBe(false);
    expect(isThemeInLibrary(withThemeRemoved(library, NEW_USER_THEME_IDS[1]), NEW_USER_THEME_IDS[1])).toBe(true);
  });

  it("reads stored data defensively", () => {
    expect(parseThemeLibrary(null)).toBeNull();
    expect(parseThemeLibrary({ mode: "nope" })).toBeNull();
    expect(parseThemeLibrary({ mode: "curated", added: ["a", "a", 3, ""] })).toEqual({ mode: "curated", added: ["a"] });
  });

  it("the Dock picker leaves out themes that were not added", () => {
    const library = withThemeAdded(initialThemeLibrary(false), "preset-confetti-frame");
    const alwaysShownIds = new Set(readyMadeIds);
    const shown = filterThemesForDockArea(BUILTIN_THEMES, {
      area: "bible",
      optOuts: {},
      alwaysShownIds,
      excludedIds: themeIdsOutsideLibrary(library, readyMadeIds),
    }).map((theme) => theme.id);
    expect(shown).toEqual([...NEW_USER_THEME_IDS, "preset-confetti-frame"].sort((a, b) => readyMadeIds.indexOf(a) - readyMadeIds.indexOf(b)));
  });
});
