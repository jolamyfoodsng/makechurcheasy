import { describe, expect, it } from "vitest";
import { snapRect } from "./snapGuides";
import { alignLayerPatch } from "./layoutOps";
import type { ThemeLayer } from "../types";

const canvas = { w: 1920, h: 1080 };

describe("snapRect", () => {
  it("snaps the centre to the canvas centre and reports both guides", () => {
    // 800 wide box whose centre is 4px left of 960; 400 tall box whose centre is 3px above 540.
    const r = snapRect({ x: 556, y: 337, w: 800, h: 400 }, [], { canvas, threshold: 8 });
    expect(r.dx).toBe(4);
    expect(r.dy).toBe(3);
    expect(r.guidesX).toEqual([960]);
    expect(r.guidesY).toEqual([540]);
  });

  it("does nothing outside the threshold", () => {
    const r = snapRect({ x: 500, y: 300, w: 800, h: 400 }, [], { canvas, threshold: 8 });
    expect(r).toEqual({ dx: 0, dy: 0, guidesX: [], guidesY: [] });
  });

  it("snaps to canvas edges and to other layers", () => {
    expect(snapRect({ x: 5, y: 100, w: 300, h: 100 }, [], { canvas, threshold: 8 }).dx).toBe(-5);
    const near = snapRect({ x: 1002, y: 100, w: 300, h: 100 }, [{ x: 1000, y: 600, w: 200, h: 50 }], { canvas, threshold: 8 });
    expect(near.dx).toBe(-2);
    expect(near.guidesX).toEqual([1000]);
  });

  it("only uses the allowed edges when resizing", () => {
    // Start edge is near 0 but only the end edge may snap.
    const r = snapRect({ x: 4, y: 0, w: 1000, h: 100 }, [], { canvas, threshold: 8, edgesX: ["end"], edgesY: ["end"] });
    expect(r.dx).toBe(0);
  });
});

describe("alignLayerPatch", () => {
  const layer = { id: "v", name: "V", type: "text", anchor: "top-left", x: 300, y: 200, w: 800, h: 400 } as unknown as ThemeLayer;
  const rect = { x: 300, y: 200, w: 800, h: 400 };
  const screen = { x: 0, y: 0, w: 1920, h: 1080 };

  it("centres, and puts it on each side", () => {
    expect(alignLayerPatch(layer, rect, screen, "center").x).toBe(560);
    expect(alignLayerPatch(layer, rect, screen, "left").x).toBe(0);
    expect(alignLayerPatch(layer, rect, screen, "right").x).toBe(1120);
    expect(alignLayerPatch(layer, rect, screen, "middle").y).toBe(340);
    expect(alignLayerPatch(layer, rect, screen, "top").y).toBe(0);
    expect(alignLayerPatch(layer, rect, screen, "bottom").y).toBe(680);
  });

  it("aligns inside a parent box", () => {
    const parent = { x: 100, y: 800, w: 1000, h: 200 };
    const child = { x: 20, y: 20, w: 400, h: 100 };
    const nested = { ...layer, x: 20, y: 20, w: 400, h: 100 } as ThemeLayer;
    // Child sits at 120,820 on the canvas; centring it in the parent moves it 280px right.
    expect(alignLayerPatch(nested, { x: 120, y: 820, w: child.w, h: child.h }, parent, "center").x).toBe(300);
  });
});
