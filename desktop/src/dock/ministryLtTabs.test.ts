import { describe, expect, it } from "vitest";
import {
  canAddLtTab,
  cloneLtTab,
  closeLtTab,
  FIRST_LT_TAB_ID,
  ltTabEditorId,
  ltTabLimitForPlan,
  parseLtTabs,
  usableLtTabs,
  type MinistryLtTab,
} from "./ministryLtTabs";

const tabs: MinistryLtTab[] = [
  { id: FIRST_LT_TAB_ID, themeKey: "lt:a", size: "sm" },
  { id: "b", themeKey: "lt:b" },
  { id: "c", themeKey: null },
];

describe("ministry lower-third tabs", () => {
  it("limits tabs by plan", () => {
    expect(ltTabLimitForPlan("free")).toBe(1);
    expect(ltTabLimitForPlan("basic")).toBe(3);
    expect(ltTabLimitForPlan("growth")).toBe(10);
    expect(ltTabLimitForPlan("pro")).toBe(-1);
    expect(ltTabLimitForPlan(undefined)).toBe(1);
    expect(canAddLtTab(1, 1)).toBe(false);
    expect(canAddLtTab(2, 3)).toBe(true);
    expect(canAddLtTab(3, 3)).toBe(false);
    expect(canAddLtTab(500, -1)).toBe(true);
    expect(usableLtTabs(tabs, 1).map((t) => t.id)).toEqual([FIRST_LT_TAB_ID]);
    expect(usableLtTabs(tabs, -1)).toHaveLength(3);
  });

  it("clones a tab right after its source", () => {
    const next = cloneLtTab(tabs, FIRST_LT_TAB_ID, "x");
    expect(next.map((t) => t.id)).toEqual([FIRST_LT_TAB_ID, "x", "b", "c"]);
    expect(next[1]).toEqual({ id: "x", themeKey: "lt:a", size: "sm" });
  });

  it("closes a tab and picks a neighbour", () => {
    expect(closeLtTab(tabs, "b", "b")).toEqual({ tabs: [tabs[0], tabs[2]], activeId: "c" });
    expect(closeLtTab(tabs, "c", "c").activeId).toBe("b");
    expect(closeLtTab(tabs, "c", FIRST_LT_TAB_ID).activeId).toBe(FIRST_LT_TAB_ID);
    expect(closeLtTab([tabs[0]], FIRST_LT_TAB_ID, FIRST_LT_TAB_ID).tabs).toHaveLength(1);
  });

  it("keeps the first tab on the original slots", () => {
    expect(ltTabEditorId({ id: FIRST_LT_TAB_ID })).toBe("default");
    expect(ltTabEditorId({ id: "b" })).toBe("tab-b");
  });

  it("reads saved tabs defensively", () => {
    expect(parseLtTabs(null)).toBeNull();
    expect(parseLtTabs({ tabs: [] })).toBeNull();
    expect(parseLtTabs({ tabs: [{ id: "a", themeKey: 3 }, { id: "a" }, "x"], activeId: "zzz" })).toEqual({
      tabs: [{ id: "a", themeKey: null }],
      activeId: "a",
    });
  });
});
