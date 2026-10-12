import { describe, expect, it } from "vitest";
import pickerSource from "./components/BackgroundPickerCard.tsx?raw";
import dockThemeDataSource from "./dockThemeData.ts?raw";
import appSource from "../App.tsx?raw";
import bibleDbSource from "../bible/bibleDb.ts?raw";
import creatorSource from "../pages/ThemeCreatorModal.tsx?raw";
import themesPageSource from "../pages/ProductionThemeSettingsPage.tsx?raw";
import favoriteThemesSource from "../services/favoriteThemes.ts?raw";

/** The slice of the picker's ThemeSection component. */
function themeSection(): string {
  const start = pickerSource.indexOf("function ThemeSection({");
  const end = pickerSource.indexOf("/* ── Theme Presets ── */", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return pickerSource.slice(start, end);
}

describe("Your own themes appear in the Dock by themselves", () => {
  it("lists them per tab, with the user's switch-offs applied", () => {
    const section = themeSection();
    expect(section).toContain("loadDockThemesForArea(area, categories, { fresh })");
    expect(pickerSource).toContain("area={dockAreaFromScope(storageScope)}");
    // Ready-made category filtering no longer lives in the picker; the loader does it.
    expect(section).not.toContain("allowed.has(");
    expect(dockThemeDataSource).toContain("filterThemesForDockArea(themes, { area, allowedCategories, optOuts, alwaysShownIds })");
  });

  it("refetches when Quick Edits opens and has a reload button", () => {
    const section = themeSection();
    // Quick Edits mounts this component, so the first load is a fresh one.
    expect(section).toContain("void loadThemes(true)");
    expect(section).toContain("dtb-theme-section__reload");
    expect(section).toContain('dockClient.sendCommand({ type: "themes:sync"');
    expect(section).toContain('msg.type === "state:favorite-themes-updated"');
    expect(dockThemeDataSource).toContain("if (options.fresh) await refreshFavoriteThemesFromStore()");
  });

  it("does not reload on every render of the parent", () => {
    // allowedCategories is a new array on each render; the load keys on its contents.
    expect(themeSection()).toContain('const categoriesKey = (allowedCategories ?? []).join("|")');
  });

  it("the app answers the Dock's reload and tells open Docks about new themes", () => {
    expect(appSource).toContain('cmd.type === "themes:sync"');
    expect(appSource).toContain("notifyDockThemesChanged()");
    expect(bibleDbSource.match(/\.then\(\(\) => notifyDockThemesChanged\(\)\)/g)?.length).toBe(2);
    expect(favoriteThemesSource).toContain("export function notifyDockThemesChanged");
  });

  it("new themes are for every category by default, not Bible only", () => {
    expect(creatorSource).toContain("if (set.size === 0) for (const value of ordered) set.add(value);");
    expect(creatorSource).not.toContain('setCategories(["bible"])');
  });

  it("the Themes page only lets you hide a theme, on every card, with no show button", () => {
    expect(themesPageSource).toContain("setHiddenFromDock(theme.id, !isThemeHiddenFromDock(dockOptOuts, theme.id))");
    expect(themesPageSource).toContain("themes.hideFromDock");
    expect(themesPageSource).not.toContain("themes.showInDock");
    expect(themesPageSource).not.toContain("production-theme-card__dock");
    // The Hide button sits before the custom / ready-made split, so every card has it.
    const hide = themesPageSource.indexOf("themes.hideFromDock");
    const split = themesPageSource.indexOf('{theme.source === "custom" ? (\n              <>');
    expect(hide).toBeGreaterThan(-1);
    expect(split).toBeGreaterThan(hide);
    // There is no "Use theme" button on the cards any more.
    expect(themesPageSource).not.toContain("handleUseTheme");
    expect(themesPageSource).not.toContain("themes.useTheme");
    expect(themesPageSource).not.toContain("production-theme-targets");
    // The "Hidden from Dock" tag is not limited to your own themes either.
    expect(themesPageSource).toContain("{isThemeHiddenFromDock(dockOptOuts, theme.id) && (");
  });

  it("every ready-made theme on the Themes page is in the Dock list, favourited or not", () => {
    expect(dockThemeDataSource).toContain("const pageBuiltinIds = new Set(BUILTIN_THEMES.map((theme) => theme.id));");
    expect(dockThemeDataSource).toContain("pageBuiltinIds.has(theme.id) || allFavoriteIds.has(theme.id)");
    // Your own themes come first in the grid.
    expect(dockThemeDataSource).toContain("[...uniqueCustom, ...favoritedBuiltins, ...otherBuiltins]");
    expect(dockThemeDataSource).toContain("filterThemesForDockArea(themes, { area, allowedCategories, optOuts, alwaysShownIds })");
  });
});
