import { describe, expect, it } from "vitest";
import { getDockLayerKind } from "./dockLayerManager";

function mockElement(className: string, role?: string): Element {
  return {
    classList: className.split(" "),
    getAttribute: (name: string) => name === "role" ? role ?? null : null,
  } as unknown as Element;
}

describe("dock layer classification", () => {
  it("keeps structural Dock panels out of the transient scroll layer", () => {
    expect(getDockLayerKind(mockElement("dock-tab-panel"))).toBeNull();
    expect(getDockLayerKind(mockElement("dock-console-panel dock-console-panel--workspace"))).toBeNull();
    expect(getDockLayerKind(mockElement("dock-presentation-bible-lm-pane"))).toBeNull();
  });

  it("keeps transient modals, menus, and popovers scrollable", () => {
    expect(getDockLayerKind(mockElement("dock-bible-compare-popover"))).toBe("surface");
    expect(getDockLayerKind(mockElement("dock-btm-overflow__menu"))).toBe("surface");
    expect(getDockLayerKind(mockElement("dock-translation__panel"))).toBe("surface");
    expect(getDockLayerKind(mockElement("dock-custom-dialog", "dialog"))).toBe("surface");
  });
});
