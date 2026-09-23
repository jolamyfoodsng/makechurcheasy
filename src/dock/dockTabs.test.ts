import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DOCK_TABS,
  FREE_PLAN_HIDDEN_DOCK_TABS,
  isDockTabAvailableForPlan,
} from "./dockTypes";
import dockPageSource from "./DockPage.tsx?raw";

const dockCssSource = readFileSync(fileURLToPath(new URL("./dock.css", import.meta.url)), "utf8");

describe("combined Worship and Notes Dock tab", () => {
  it("exposes one top-level tab while retaining the internal subtab switcher", () => {
    expect(DOCK_TABS.map((tab) => tab.id)).not.toContain("notes");
    expect(DOCK_TABS.find((tab) => tab.id === "worship")).toMatchObject({
      label: "Worship and Notes",
      icon: "text_fields",
    });
    expect(dockPageSource).toContain("showSubtabs");
    expect(dockPageSource).toContain('initialSubTab={shellPreferences.activeTab === "notes" ? "notes" : undefined}');
    expect(dockPageSource).toContain('if (tab === "notes") return "worship";');
    expect(dockPageSource).not.toContain('const DockNotesTab = lazy');
    expect(dockPageSource).not.toContain('mountedDockTabs.has("notes")');
  });

  it("keeps the dock interface standalone above collapsible settings sections", () => {
    expect(dockPageSource).not.toContain("showDockInterface");
    expect(dockPageSource).toContain('className="dock-sidebar__standalone-section"');
    expect(dockPageSource).toContain('aria-controls="appearance-panel"');
    expect(dockPageSource).toContain('id="appearance-panel"');
    expect(dockPageSource).toContain('id="dock-interface-panel"');
    expect(dockPageSource.indexOf('className="dock-sidebar__standalone-section"')).toBeLessThan(dockPageSource.indexOf("{/* Appearance */}"));
    expect(dockPageSource).toContain("showBibleSearch");
    expect(dockPageSource).toContain('aria-controls="bible-search-panel"');
    expect(dockPageSource).toContain('id="bible-search-panel"');
    expect(dockPageSource).toContain("dock-sidebar__item--open");
  });

  it("keeps compact section navigation visibly button-like", () => {
    expect(dockPageSource).toContain('className="dock-vertical-nav"');
    expect(dockPageSource).toContain('className={`dock-vertical-nav__item');
    expect(dockPageSource).toContain("const updateHeight = () => setDockHeight(el.getBoundingClientRect().height);");
    expect(dockPageSource).toContain('if (typeof ResizeObserver === "undefined")');
    expect(dockCssSource).toContain(".dock-vertical-nav__item {");
    expect(dockCssSource).toContain("flex: 1 1 0;");
    expect(dockCssSource).toContain("height: auto;");
    expect(dockCssSource).toContain("min-height: 48px;");
  });

  it("keeps vertical navigation rail slim and compact to maximize content width", () => {
    expect(dockCssSource).toContain("width: 40px;");
    expect(dockCssSource).toContain("width: 34px;\n  height: 34px;\n  min-height: 34px;");
    expect(dockPageSource).toContain("<Icon name={tab.icon} size={16} />");
  });
});

describe("Free-plan Dock tabs", () => {
  it("hides Ministry and Multi-View while keeping them available to paid plans", () => {
    expect(FREE_PLAN_HIDDEN_DOCK_TABS).toEqual(["ministry", "multiview"]);
    expect(isDockTabAvailableForPlan("ministry", true)).toBe(false);
    expect(isDockTabAvailableForPlan("multiview", true)).toBe(false);
    expect(isDockTabAvailableForPlan("bible", true)).toBe(true);
    expect(isDockTabAvailableForPlan("ministry", false)).toBe(true);
    expect(isDockTabAvailableForPlan("multiview", false)).toBe(true);
    expect(DOCK_TABS.map((tab) => tab.id)).toContain("ministry");
    expect(DOCK_TABS.map((tab) => tab.id)).toContain("multiview");
  });
});
