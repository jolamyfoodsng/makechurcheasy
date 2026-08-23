import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import toolbarSource from "./DockBottomToolbar.tsx?raw";
import bottomPanelSource from "./DockBottomSearchPanel.tsx?raw";
import bibleTabSource from "../tabs/DockBibleTab.tsx?raw";
import notesTabSource from "../tabs/DockNotesTab.tsx?raw";
import worshipTabSource from "../tabs/DockWorshipTab.tsx?raw";

const toolbarCss = readFileSync(fileURLToPath(new URL("./DockBottomToolbar.css", import.meta.url)), "utf8");
const bottomPanelCss = readFileSync(fileURLToPath(new URL("./DockBottomSearchPanel.css", import.meta.url)), "utf8");

describe("Dock bottom toolbar narrow actions", () => {
  it("measures the toolbar itself and switches at 350px", () => {
    expect(toolbarSource).toContain("setIsNarrow(width <= 350)");
    expect(toolbarSource).toContain("width <= 239");
    expect(toolbarSource).toContain("dock-btm-toolbar--narrow");
    expect(toolbarSource).toContain("dock-btm-toolbar--ultra-narrow");
    expect(toolbarCss).toContain(".dock-btm-toolbar--narrow .dock-btm-toolbar__inline-action");
    expect(toolbarCss).toContain(".dock-btm-toolbar--narrow .dock-btm-overflow__narrow-actions");
    expect(toolbarCss).toContain(".dock-btm-toolbar.dock-btm-toolbar--ultra-narrow .dock-btm-toolbar__center");
    expect(toolbarCss).toContain(".dock-btm-toolbar.dock-btm-toolbar--ultra-narrow .dock_bottom_bar");
  });

  it("provides Quick Edits in the narrow overflow for Bible, Notes, and Worship", () => {
    for (const source of [bibleTabSource, notesTabSource, worshipTabSource]) {
      expect(source).toContain("narrowOverflowActions=");
      expect(source).toContain("dock-btm-overflow__menu-item");
      expect(source).toContain("data-dock-close-overflow=\"true\"");
    }
  });

  it("keeps narrow overflow entries text-only", () => {
    expect(toolbarCss).toContain(".dock-btm-overflow__narrow-actions > * svg");
    expect(toolbarCss).toContain(".dock-btm-overflow__children > * > button > svg");
  });

  it("anchors overflow cards above the full bottom deck when search is expanded", () => {
    expect(toolbarCss).toContain(".dock-btm-toolbar:has(> .dock-bottom-search-panel)");
    expect(toolbarCss).toContain(".dock-btm-toolbar:has(> .dock-bottom-search-panel) .dock-btm-overflow {\n  position: static;");
    expect(toolbarCss).toContain(".dock-btm-toolbar:has(> .dock-bottom-search-panel) .dock-btm-overflow__menu");
  });

  it("places the search panel toggle after the three-dot control", () => {
    expect(toolbarSource).toContain("bottomPanelToggle");
    expect(toolbarSource).toContain("dock-btm-toolbar__bottom-panel-toggle");
    expect(toolbarCss).toContain(".dock_bottom_bar {\n  display: flex;");
    expect(bottomPanelSource).toContain("toggleInToolbar");
    expect(bottomPanelCss).toContain(".dock-bottom-search-panel__label {\n  display: none;");
  });
});
