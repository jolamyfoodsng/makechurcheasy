import { describe, expect, it } from "vitest";
import { GALLERY_CATEGORIES, GALLERY_LAYOUTS } from "./galleryLayouts";

describe("gallery language", () => {
  it("describes source-neutral layouts instead of implying bundled cameras or logos", () => {
    const layout = GALLERY_LAYOUTS.find((item) => item.id === "logo-tr");

    expect(layout?.name).toBe("Full Frame + Top-Right Overlay");
    expect(layout?.description).toContain("Add your own");
    expect(layout?.slots.map((slot) => slot.label)).toEqual([
      "Main content",
      "top right overlay",
    ]);
  });

  it("uses layout-focused category labels", () => {
    expect(GALLERY_CATEGORIES.find((category) => category.key === "cameras")?.label).toBe("Multi-source");
    expect(GALLERY_CATEGORIES.find((category) => category.key === "hybrid")?.label).toBe("Combined");
  });
});

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
