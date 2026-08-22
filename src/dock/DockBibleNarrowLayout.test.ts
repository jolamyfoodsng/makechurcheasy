import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dockBibleTabSource from "./tabs/DockBibleTab.tsx?raw";
import bibleDockUiSource from "./components/BibleDockUI.tsx?raw";

const dockCssSource = readFileSync(fileURLToPath(new URL("./dock.css", import.meta.url)), "utf8");

describe("Dock Bible narrow layout", () => {
  it("removes Browse Bible while keeping Compare Translations in both overflow menus", () => {
    expect((dockBibleTabSource.match(/className=\"dock-bible-actions__menu-item\"/g) ?? []).length).toBe(2);
    expect((dockBibleTabSource.match(/setShowComparePopover\(true\);/g) ?? []).length).toBe(2);
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
});
