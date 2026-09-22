import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import bibleDockUiSource from "./components/BibleDockUI.tsx?raw";
import dockBibleTabSource from "./tabs/DockBibleTab.tsx?raw";
import toolbarSource from "./components/DockBottomToolbar.tsx?raw";

const dockCss = readFileSync(fileURLToPath(new URL("./dock.css", import.meta.url)), "utf8");
const toolbarCss = readFileSync(fileURLToPath(new URL("./components/DockBottomToolbar.css", import.meta.url)), "utf8");

describe("Bible Dock Toolbar Collapse & Spacing", () => {
  it("keeps the bottom search panel permanently open in Bible dock container", () => {
    expect(bibleDockUiSource).toContain("expanded={true}");
    expect(bibleDockUiSource).toContain("const bottomPanelToggle = undefined;");
  });

  it("passes toolbar collapse controls to BibleSearchRow and DockBottomToolbar", () => {
    expect(bibleDockUiSource).toContain("toolbarCollapsed={isBottomPanel ? toolbarCollapsed : false}");
    expect(bibleDockUiSource).toContain("onToolbarCollapseToggle={isBottomPanel ? onToolbarCollapseToggle : undefined}");
    expect(dockBibleTabSource).toContain("toolbarCollapsed={toolbarCollapsed}");
    expect(dockBibleTabSource).toContain("onToolbarCollapseToggle={() => setToolbarCollapsed((prev) => !prev)}");
    expect(dockBibleTabSource).toContain("collapsed={toolbarCollapsed}");
    expect(dockBibleTabSource).toContain("onCollapseChange={setToolbarCollapsed}");
    expect(dockBibleTabSource).toContain("bottomPanelToggle={undefined}");
  });

  it("renders the uncollapse button next to KJV with three dots to its left when collapsed", () => {
    expect(bibleDockUiSource).toContain("toolbarCollapsed && onToolbarCollapseToggle && (");
    expect(bibleDockUiSource).toContain('className="dock-bible-actions__overflow dock-bible-actions__uncollapse-btn"');
    expect(bibleDockUiSource).toContain('<Icon name="expand_less" size={15} />');
  });

  it("renders the collapse button on DockBottomToolbar when onCollapseChange is passed", () => {
    expect(toolbarSource).toContain("onCollapseChange && !bottomPanelToggle && (");
    expect(toolbarSource).toContain('className="dock-btm-toolbar__icon-btn dock-btm-toolbar__collapse-btn"');
    expect(toolbarSource).toContain('onClick={() => onCollapseChange(true)}');
    expect(toolbarSource).toContain('<Icon name="expand_more" size={15} />');
  });

  it("renders only bottomPanel when collapsed has a bottomPanel", () => {
    expect(toolbarSource).toContain("if (collapsed) {");
    expect(toolbarSource).toContain("if (bottomPanel) {");
    expect(toolbarSource).toContain('className="dock-btm-toolbar dock-btm-toolbar--bottom-panel-only"');
    expect(toolbarCss).toContain(".dock-btm-toolbar--bottom-panel-only {\n  padding: 0 !important;");
  });

  it("removes excessive space to the left of the hamburger and extends the search input", () => {
    expect(dockCss).toContain(".dock-module--bible .dock-bible-search-row {\n  min-height: 0;\n  padding-block: 4px;\n  padding-inline: 2px 6px;\n}");
    expect(dockCss).toContain(".dock-module--bible .dock-bible-search-row__input .dock-bible-search-bar {\n  min-height: 32px;\n  padding-block: 0;\n  gap: 2px;\n}");
    expect(dockCss).toContain(".dock-bible-search-bar__menu-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 26px;\n  height: 28px;\n  min-width: 26px;\n  min-height: 28px;");
    expect(dockCss).toContain(".dock-bible-actions__uncollapse-btn {");
    expect(toolbarCss).toContain(".dock-btm-toolbar:has(> .dock-bottom-search-panel) {\n  position: relative;\n  padding-inline: 0;\n  padding-top: 0;\n}");
    expect(toolbarCss).toContain(".dock-btm-toolbar:has(> .dock-bottom-search-panel) > .dock-btm-toolbar__row {\n  padding-inline: 10px;\n  padding-top: 6px;\n}");
  });
});
