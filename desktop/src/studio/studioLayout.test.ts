import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, LAYOUT_LIMITS, normalizeLayout, planColumns } from "./studioLayout";

describe("saved layout", () => {
  it("falls back to the defaults for anything missing or broken", () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout("nonsense")).toEqual(DEFAULT_LAYOUT);
    const odd = normalizeLayout({ section: "lower", verseAiWidth: 9999, dock: { width: -5, pinned: "yes" }, camera: { layout: "sideways" } });
    expect(odd.section).toBe("bible");
    expect(odd.verseAiWidth).toBe(LAYOUT_LIMITS.verseAi.max);
    expect(odd.dock.width).toBe(LAYOUT_LIMITS.dock.min);
    expect(odd.dock.pinned).toBe(false);
    expect(odd.camera.layout).toBe("behind-content");
  });

  it("keeps the pinned Schedule / History, its width and tab", () => {
    const layout = normalizeLayout({ dock: { open: true, pinned: true, tab: "history", width: 360 } });
    expect(layout.dock).toEqual({ open: true, pinned: true, tab: "history", width: 360 });
  });

  it("reads the old Studio's choices (Notes became Docs, look became display mode)", () => {
    const layout = normalizeLayout({ source: "notes", look: "lower-third", transition: "cut", previewFirst: false });
    expect(layout.section).toBe("docs");
    expect(layout.displayMode).toBe("lower-third");
    expect(layout.transition).toBe("cut");
    expect(layout.previewFirst).toBe(false);
  });
});

describe("fitting the columns", () => {
  const sum = (p: ReturnType<typeof planColumns>) => p.verseAi + p.dock + p.preview + p.workspace;

  it("opening Schedule / History takes space from the workspace and Preview (never overlaps)", () => {
    const closed = planColumns(1920, { verseAi: 320, dock: null, preview: 640 });
    const open = planColumns(1920, { verseAi: 320, dock: 300, preview: 640 });
    expect(closed.dock).toBe(0);
    expect(open.dock).toBe(300);
    expect(sum(open)).toBe(sum(closed));
    expect(open.workspace + open.preview).toBe(closed.workspace + closed.preview - 300);
  });

  it("keeps the workspace readable by shrinking the Preview first", () => {
    const plan = planColumns(1440, { verseAi: 320, dock: 300, preview: 900 });
    expect(plan.stacked).toBe(false);
    expect(plan.workspace).toBeGreaterThanOrEqual(LAYOUT_LIMITS.workspaceMin);
    expect(plan.preview).toBeGreaterThanOrEqual(LAYOUT_LIMITS.preview.min);
  });

  it("on a small laptop the side panels give way before anything overlaps", () => {
    const plan = planColumns(1280, { verseAi: 420, dock: 480, preview: 560 });
    expect(plan.verseAi).toBeGreaterThanOrEqual(LAYOUT_LIMITS.verseAi.min);
    expect(plan.dock).toBeGreaterThanOrEqual(LAYOUT_LIMITS.dock.min);
    expect(plan.verseAi + plan.dock + plan.preview + plan.workspace).toBeLessThanOrEqual(1280);
  });

  it("stacks the Preview over the workspace when there is no room side by side", () => {
    const plan = planColumns(900, { verseAi: 320, dock: 300, preview: 560 });
    expect(plan.stacked).toBe(true);
  });

  it("on a narrow window the Schedule / History floats over the edge so the middle stays usable", () => {
    const plan = planColumns(820, { verseAi: 320, dock: 300, preview: 560 });
    expect(plan.dockOverlay).toBe(true);
    expect(plan.dock).toBeGreaterThanOrEqual(LAYOUT_LIMITS.dock.min);
    expect(plan.workspace).toBeGreaterThanOrEqual(LAYOUT_LIMITS.centerMin);
  });

  it("on a very narrow window Verse AI folds to its rail too", () => {
    const plan = planColumns(680, { verseAi: 320, dock: 300, preview: 560 });
    expect(plan.dockOverlay).toBe(true);
    expect(plan.verseAiRail).toBe(true);
    expect(plan.workspace).toBeGreaterThanOrEqual(LAYOUT_LIMITS.centerMin);
  });

  it("a wide window is untouched", () => {
    const plan = planColumns(1920, { verseAi: 320, dock: 300, preview: 640 });
    expect(plan.dockOverlay).toBe(false);
    expect(plan.verseAiRail).toBe(false);
  });
});
