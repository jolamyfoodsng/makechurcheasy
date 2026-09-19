import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dockCss = readFileSync(new URL("./dock.css", import.meta.url), "utf8");
const toolbarCss = readFileSync(new URL("./components/DockBottomToolbar.css", import.meta.url), "utf8");

describe("Bible Dock spacing", () => {
  it("keeps compact toolbar controls away from the panel edges", () => {
    expect(toolbarCss).toContain(".dock-btm-toolbar--compact {\n  padding: 8px 10px;");
    expect(dockCss).toContain(".dock-module--bible--compact .dock-btm-toolbar {\n  padding: 8px 10px;");
  });

  it("gives the installed Bible-version list room around its rows", () => {
    expect(dockCss).toContain(".bible-version-library__list {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding: 8px;");
    expect(dockCss).toContain(".bible-version-library__row {\n  display: flex;");
    expect(dockCss).toContain("  min-height: 36px;\n  padding: 7px 9px;");
  });
});
