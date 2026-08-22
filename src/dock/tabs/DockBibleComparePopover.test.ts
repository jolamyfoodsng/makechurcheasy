import { describe, expect, it } from "vitest";
import dockBibleTabSource from "./DockBibleTab.tsx?raw";

describe("Bible Compare Translation popover", () => {
  it("promotes the bottom-toolbar card above the reader and keeps it independently scrollable", () => {
    expect(dockBibleTabSource).toContain('import { createPortal } from "react-dom";');
    expect(dockBibleTabSource).toContain("comparePopoverPanelRef");
    expect(dockBibleTabSource).toContain("setComparePopoverPosition");
    expect(dockBibleTabSource).toContain("position: \"fixed\" as const");
    expect(dockBibleTabSource).toContain("data-dock-keep-overflow-open=\"true\"");
    expect(dockBibleTabSource).toContain("createPortal(");
  });
});
