import { describe, expect, it } from "vitest";
import { addLayer, duplicateLayer, isBackdropLayer, moveLayer, nudgeLayer, removeLayer, roleForContent, updateLayerStyle } from "./layoutOps";
import { BLANK_FULLSCREEN } from "../blankTheme";
import { SCRIPTURE_TAB } from "../presets";

describe("layoutOps", () => {
  it("adds, duplicates and removes layers without touching the source layout", () => {
    const added = addLayer(SCRIPTURE_TAB, "text");
    expect(added.layout.layers).toHaveLength(SCRIPTURE_TAB.layers.length + 1);
    expect(SCRIPTURE_TAB.layers.some((l) => l.id === added.id)).toBe(false);
    const dup = duplicateLayer(added.layout, "box");
    expect(dup.layout.layers.find((l) => l.id === dup.id)?.name).toBe("Box copy");
    // Removing the box also removes the verse nested inside it.
    const removed = removeLayer(SCRIPTURE_TAB, "box");
    expect(removed.layers.map((l) => l.id)).toEqual(["label"]);
  });

  it("moves a layer in the draw order", () => {
    const up = moveLayer(SCRIPTURE_TAB, "box", "up");
    expect(up.layers.map((l) => l.id)).toEqual(["label", "box", "verse"]);
    expect(moveLayer(SCRIPTURE_TAB, "verse", "up")).toBe(SCRIPTURE_TAB);
  });

  it("keeps the left/top edge fixed when resizing a centred layer", () => {
    const layer = { ...SCRIPTURE_TAB.layers[0], anchor: "top-center" as const, x: 960, w: 1000 };
    expect(nudgeLayer(layer, 0, 0, 100, 0)).toMatchObject({ x: 1010, w: 1100 });
    expect(nudgeLayer(layer, 16, -8)).toMatchObject({ x: 976, y: SCRIPTURE_TAB.layers[0].y - 8 });
  });

  it("knows text roles and updates styles immutably", () => {
    expect(roleForContent("{text}")).toBe("verse");
    expect(roleForContent("Hello")).toBe("custom");
    const next = updateLayerStyle(SCRIPTURE_TAB, "label", { color: "#ff0000" });
    expect(next.layers.find((l) => l.id === "label")?.style.color).toBe("#ff0000");
    expect(SCRIPTURE_TAB.layers.find((l) => l.id === "label")?.style.color).toBe("#ffffff");
  });
});

describe("isBackdropLayer", () => {
  it("is the full-screen background, not text or nested boxes", () => {
    const [bg, ref, verse] = BLANK_FULLSCREEN.layers;
    expect(isBackdropLayer(bg)).toBe(true);
    expect(isBackdropLayer(ref)).toBe(false);
    expect(isBackdropLayer(verse)).toBe(false);
    expect(isBackdropLayer({ ...bg, parentId: "x" })).toBe(false);
    expect(isBackdropLayer({ ...bg, w: 600, h: 200 })).toBe(false);
  });
});
