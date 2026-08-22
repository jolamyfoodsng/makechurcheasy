import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dockBibleTabSource from "./tabs/DockBibleTab.tsx?raw";
import bibleDockUiSource from "./components/BibleDockUI.tsx?raw";

const dockCssSource = readFileSync(fileURLToPath(new URL("./dock.css", import.meta.url)), "utf8");

describe("Dock Bible narrow layout", () => {
  it("keeps Compare Translations available from both narrow overflow menus", () => {
    expect((dockBibleTabSource.match(/className=\"dock-bible-actions__menu-item\"/g) ?? []).length).toBe(4);
    expect((dockBibleTabSource.match(/setShowComparePopover\(true\);/g) ?? []).length).toBe(2);
  });

  it("moves Browse Bible and Compare Translation into three dots below 400px", () => {
    expect(dockBibleTabSource).toContain("setIsNarrowWidth(width < 400);");
    expect(dockBibleTabSource).toContain("}, [preferencesHydrated, translationsLoaded]);");
    expect(dockBibleTabSource).toContain("isShortHeight || isNarrowWidth ? ((browseExpanded, onBrowseToggle) => (");
    expect(bibleDockUiSource).toContain("const shouldUseNarrowOverflowActions = isNarrowWidth && Boolean(renderedCompactActions);");
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
});
