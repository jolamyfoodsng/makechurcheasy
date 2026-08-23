import { describe, expect, it } from "vitest";
import { DOCK_TABS } from "./dockTypes";
import dockPageSource from "./DockPage.tsx?raw";

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
});
