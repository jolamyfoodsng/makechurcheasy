import { describe, expect, it } from "vitest";
import type { BibleTheme } from "../bible/types";
import {
  dockAreaFromScope,
  filterThemesForDockArea,
  isThemeAvailableInDockArea,
  isThemeHiddenFromDock,
  isThemeOptedOut,
  limitCustomThemesToPlan,
  parseDockThemeOptOuts,
  withThemeAreaVisible,
  withThemeHidden,
} from "./dockThemeAvailability";

function theme(id: string, source: "builtin" | "custom", categories?: BibleTheme["categories"]): BibleTheme {
  return { id, name: id, source, categories } as unknown as BibleTheme;
}

describe("Dock theme availability", () => {
  it("shows the user's own themes in every area, whatever category they were saved with", () => {
    // New themes used to be saved as "Bible only", which hid them from Worship and Notes.
    const mine = theme("mine", "custom", ["bible"]);
    for (const area of ["bible", "worship", "notes"] as const) {
      expect(
        isThemeAvailableInDockArea(mine, { area, allowedCategories: ["worship", "general"], optOuts: {} }),
      ).toBe(true);
    }
    const noCategory = theme("none", "custom", undefined);
    expect(isThemeAvailableInDockArea(noCategory, { area: "notes", allowedCategories: ["worship"], optOuts: {} })).toBe(true);
  });

  it("hides a custom theme only in the area the user switched off", () => {
    const mine = theme("mine", "custom");
    const optOuts = { mine: ["notes" as const] };
    expect(isThemeAvailableInDockArea(mine, { area: "notes", optOuts })).toBe(false);
    expect(isThemeAvailableInDockArea(mine, { area: "bible", optOuts })).toBe(true);
    expect(isThemeAvailableInDockArea(mine, { area: "worship", optOuts })).toBe(true);
    // Another theme is not affected.
    expect(isThemeAvailableInDockArea(theme("other", "custom"), { area: "notes", optOuts })).toBe(true);
  });

  it("keeps the category rule for ready-made themes", () => {
    const worshipOnly = theme("ready", "builtin", ["worship"]);
    expect(isThemeAvailableInDockArea(worshipOnly, { area: "bible", allowedCategories: ["bible", "general"], optOuts: {} })).toBe(false);
    expect(isThemeAvailableInDockArea(worshipOnly, { area: "worship", allowedCategories: ["worship", "general"], optOuts: {} })).toBe(true);
    expect(isThemeAvailableInDockArea(worshipOnly, { area: "bible", optOuts: {} })).toBe(true);
    // A ready-made theme is never touched by the opt-outs.
    expect(isThemeAvailableInDockArea(worshipOnly, { area: "worship", allowedCategories: ["worship"], optOuts: { ready: ["worship"] } })).toBe(true);
  });

  it("shows the ready-made themes from the Themes page everywhere too, until hidden", () => {
    const ready = theme("ready", "builtin", ["worship"]);
    const alwaysShownIds = new Set(["ready"]);
    // The category no longer keeps it out of Bible.
    expect(isThemeAvailableInDockArea(ready, { area: "bible", allowedCategories: ["bible", "general"], optOuts: {}, alwaysShownIds })).toBe(true);
    expect(isThemeAvailableInDockArea(ready, { area: "notes", allowedCategories: ["worship"], optOuts: {}, alwaysShownIds })).toBe(true);
    // Hiding works on it like on your own themes.
    const hidden = withThemeHidden({}, "ready", true);
    expect(isThemeAvailableInDockArea(ready, { area: "bible", allowedCategories: ["bible"], optOuts: hidden, alwaysShownIds })).toBe(false);
    // A library template that is not on the Themes page still follows its category.
    const library = theme("lib", "builtin", ["worship"]);
    expect(isThemeAvailableInDockArea(library, { area: "bible", allowedCategories: ["bible", "general"], optOuts: {}, alwaysShownIds })).toBe(false);
    expect(isThemeAvailableInDockArea(library, { area: "bible", allowedCategories: ["bible", "general"], optOuts: { lib: ["bible"] }, alwaysShownIds })).toBe(false);
  });

  it("filters a list and keeps its order", () => {
    const list = [theme("a", "custom"), theme("b", "builtin", ["worship"]), theme("c", "custom")];
    const result = filterThemesForDockArea(list, {
      area: "bible",
      allowedCategories: ["bible"],
      optOuts: { c: ["bible"] },
    });
    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("applies no opt-outs when the picker's area is unknown", () => {
    expect(isThemeAvailableInDockArea(theme("mine", "custom"), { area: null, optOuts: { mine: ["bible", "worship", "notes"] } })).toBe(true);
  });

  it("turns one area off and on again without touching the others", () => {
    let optOuts = withThemeAreaVisible({}, "t1", "worship", false);
    expect(optOuts).toEqual({ t1: ["worship"] });
    optOuts = withThemeAreaVisible(optOuts, "t1", "bible", false);
    expect(optOuts).toEqual({ t1: ["bible", "worship"] });
    expect(isThemeOptedOut(optOuts, "t1", "bible")).toBe(true);
    optOuts = withThemeAreaVisible(optOuts, "t1", "worship", true);
    expect(optOuts).toEqual({ t1: ["bible"] });
    optOuts = withThemeAreaVisible(optOuts, "t1", "bible", true);
    // Back to the default: the theme is dropped from the file.
    expect(optOuts).toEqual({});
  });

  it("hides a theme from the whole Dock and brings it back with one action", () => {
    const hidden = withThemeHidden({}, "t1", true);
    expect(hidden).toEqual({ t1: ["bible", "worship", "notes"] });
    expect(isThemeHiddenFromDock(hidden, "t1")).toBe(true);
    for (const area of ["bible", "worship", "notes"] as const) {
      expect(isThemeAvailableInDockArea(theme("t1", "custom"), { area, optOuts: hidden })).toBe(false);
    }
    // Other themes are untouched.
    expect(isThemeHiddenFromDock(hidden, "t2")).toBe(false);
    expect(withThemeHidden(hidden, "t1", false)).toEqual({});
    // A theme hidden in only some areas does not count as hidden.
    expect(isThemeHiddenFromDock({ t1: ["notes"] }, "t1")).toBe(false);
    // Hiding is repeatable and fills in the missing areas.
    expect(withThemeHidden({ t1: ["notes"] }, "t1", true)).toEqual({ t1: ["bible", "worship", "notes"] });
  });

  it("does not change the object it was given", () => {
    const before = { t1: ["notes" as const] };
    withThemeAreaVisible(before, "t1", "notes", true);
    expect(before).toEqual({ t1: ["notes"] });
  });

  it("reads stored opt-outs safely", () => {
    expect(parseDockThemeOptOuts(null)).toEqual({});
    expect(parseDockThemeOptOuts([])).toEqual({});
    expect(parseDockThemeOptOuts("nope")).toEqual({});
    expect(
      parseDockThemeOptOuts({ a: ["notes", "bogus", "bible"], b: "notes", c: [], d: ["worship"] }),
    ).toEqual({ a: ["bible", "notes"], d: ["worship"] });
  });

  it("maps a picker scope to its Dock area", () => {
    expect(dockAreaFromScope("bible")).toBe("bible");
    expect(dockAreaFromScope("worship")).toBe("worship");
    expect(dockAreaFromScope("notes")).toBe("notes");
    expect(dockAreaFromScope("global")).toBeNull();
    expect(dockAreaFromScope(undefined)).toBeNull();
  });
});

describe("limitCustomThemesToPlan", () => {
  const made = (id: string, createdAt: string) => ({ ...theme(id, "custom"), createdAt }) as BibleTheme;
  const list = [made("c", "2026-03-01"), made("a", "2026-01-01"), theme("starter", "builtin"), made("b", "2026-02-01")];

  it("keeps only the first themes created, in the list's own order, and every ready-made theme", () => {
    expect(limitCustomThemesToPlan(list, 2).map((t) => t.id)).toEqual(["a", "starter", "b"]);
  });

  it("changes nothing with room to spare or no limit", () => {
    expect(limitCustomThemesToPlan(list, 3)).toBe(list);
    expect(limitCustomThemesToPlan(list, -1)).toBe(list);
  });

  it("offers none of their own themes when the plan has none", () => {
    expect(limitCustomThemesToPlan(list, 0).map((t) => t.id)).toEqual(["starter"]);
  });
});
