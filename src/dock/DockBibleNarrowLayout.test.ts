import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dockBibleTabSource from "./tabs/DockBibleTab.tsx?raw";
import bibleDockUiSource from "./components/BibleDockUI.tsx?raw";

const dockCssSource = readFileSync(fileURLToPath(new URL("./dock.css", import.meta.url)), "utf8");

describe("Dock Bible narrow layout", () => {
  it("removes Browse Bible while keeping Compare Translations in the overflow menus", () => {
    expect((dockBibleTabSource.match(/className=\"dock-bible-actions__menu-item\"/g) ?? []).length).toBe(2);
    expect((dockBibleTabSource.match(/setShowComparePopover\(true\);/g) ?? []).length).toBe(3);
    expect(dockBibleTabSource).not.toContain("bible.browseBible");
    expect(dockBibleTabSource).not.toContain("closeBibleBrowser");
  });

  it("keeps the narrow Compare overflow available below 400px", () => {
    expect(dockBibleTabSource).toContain("setIsNarrowWidth(width < 400);");
    expect(dockBibleTabSource).toContain("}, [preferencesHydrated, translationsLoaded]);");
    expect(dockBibleTabSource).toContain("isShortHeight || isNarrowWidth ? (() => (");
    expect(bibleDockUiSource).toContain("const shouldUseNarrowOverflowActions = showActions\n    && isNarrowWidth\n    && Boolean(renderedCompactActions);");
    expect(bibleDockUiSource).toContain("dock-bible-compact-actions--narrow");
    expect(dockCssSource).toContain("@media (max-width: 399px)");
    expect(dockCssSource).toContain(".dock-bible-search-row:has(");
  });

  it("lets search consume the available row width without a right-side spacer", () => {
    expect(dockCssSource).toContain(".dock-bible-search-row__translation {\n  order: 2;\n  display: flex;");
    expect(dockCssSource).toContain("margin: 0;\n  gap: 4px;");
    expect(dockCssSource).toContain(".dock-bible-search-row__input .dock-search {\n  width: 100%;\n  min-width: 0;");
    expect(dockCssSource).toContain("@media (max-width: 250px) {\n  .dock-bible-search-row {");
    expect(dockCssSource).toContain("flex-wrap: nowrap;");
  });

  it("keeps the Bible search control at a shallow toolbar height", () => {
    expect(dockCssSource).toContain(".dock-module--bible .dock-bible-search-row {\n  min-height: 0;\n  padding-block: 4px;");
    expect(dockCssSource).toContain(".dock-module--bible .dock-bible-search-row__input .dock_search__input {\n  height: 32px;\n  min-height: 32px;");
    expect(dockCssSource).toContain(".dock-module--bible .dock-bible-search-row__translation .bible-version-library__trigger,");
  });

  it("gives compact Bible actions a clear button surface", () => {
    expect(dockCssSource).toContain(".dock-module--bible--compact .dock-bible-compact-actions button {");
    expect(dockCssSource).toContain("border: 1px solid var(--dock-border);");
    expect(dockCssSource).toContain("border-radius: 9px;");
    expect(dockCssSource).toContain(".dock-module--bible--compact .dock-bible-compact-actions button:focus-visible {");
    expect(dockCssSource).toContain("height: 48px;");
  });
});
