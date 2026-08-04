import { describe, expect, it } from "vitest";
import { GALLERY_LAYOUTS } from "./galleryLayouts";

describe("multimedia scene portrait layout", () => {
  it("exposes separate full-canvas and portrait scene slots", () => {
    const layout = GALLERY_LAYOUTS.find((item) => item.id === "multimedia-scene-portrait");

    expect(layout).toBeDefined();
    expect(layout?.category).toBe("multimedia");
    expect(layout?.defaultFrameId).toBe("clean-white-round");
    expect(layout?.slots).toEqual([
      expect.objectContaining({
        id: "multimedia-background",
        label: "Background Scene",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        zIndex: 1,
      }),
      expect.objectContaining({
        id: "multimedia-portrait",
        label: "Portrait / Short-form Scene",
        x: 72,
        y: 72,
        width: 520,
        height: 936,
        zIndex: 2,
      }),
    ]);
    expect(layout?.defaultSlotFrames).toEqual({
      "multimedia-background": "none",
      "multimedia-portrait": "inherit",
    });
  });
});

describe("multimedia landscape half layout", () => {
  it("fills the left half while keeping a full-canvas background scene", () => {
    const layout = GALLERY_LAYOUTS.find((item) => item.id === "multimedia-scene-half-left");

    expect(layout).toBeDefined();
    expect(layout?.category).toBe("multimedia");
    expect(layout?.defaultFrameId).toBe("broadcast-gold");
    expect(layout?.slots).toEqual([
      expect.objectContaining({
        id: "multimedia-half-background",
        label: "Background Scene",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        zIndex: 1,
      }),
      expect.objectContaining({
        id: "multimedia-half-left",
        label: "Left Half Landscape Scene",
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
        zIndex: 2,
      }),
    ]);
    expect(layout?.defaultSlotFrames).toEqual({
      "multimedia-half-background": "none",
      "multimedia-half-left": "inherit",
    });
  });
});
