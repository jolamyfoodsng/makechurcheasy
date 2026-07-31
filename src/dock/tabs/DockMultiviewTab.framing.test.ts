import { describe, expect, it } from "vitest";

import { calculateSlotTransform } from "./DockMultiviewTab";

const slot = { x: 0, y: 0, width: 924, height: 980 };

describe("DockMultiviewTab framing transform", () => {
  it("stretches a source to the selected slot without cropping", () => {
    const tx = calculateSlotTransform(1920, 1080, slot, {
      mode: "fit",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
    });

    expect(tx.scale).toBeCloseTo(0.907407, 5);
    expect(tx.scaleX).toBeCloseTo(0.48125, 5);
    expect(tx.scaleY).toBeCloseTo(0.907407, 5);
    expect(tx.renderedWidth).toBeCloseTo(924, 5);
    expect(tx.renderedHeight).toBeCloseTo(980, 5);
    expect(tx.positionX).toBeCloseTo(0, 5);
    expect(tx.positionY).toBeCloseTo(0, 5);
    expect(tx.cropLeft ?? 0).toBe(0);
  });

  it("fills the slot by cropping the overflowing source axis", () => {
    const tx = calculateSlotTransform(1920, 1080, slot, {
      mode: "fill",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
    });

    expect(tx.scale).toBeCloseTo(0.907407, 5);
    expect(tx.renderedWidth).toBeCloseTo(1742.222, 3);
    expect(tx.renderedHeight).toBeCloseTo(980, 5);
    expect(tx.cropLeft).toBeCloseTo(450.857, 3);
    expect(tx.cropRight).toBeCloseTo(450.857, 3);
    expect(tx.cropTop).toBeCloseTo(0, 5);
    expect(tx.cropBottom).toBeCloseTo(0, 5);
  });

  it("custom mode applies zoom and focal point crops", () => {
    const tx = calculateSlotTransform(1920, 1080, slot, {
      mode: "custom",
      focalX: 0.25,
      focalY: 0.75,
      zoom: 1.5,
    });

    expect(tx.scale).toBeCloseTo(1.361111, 5);
    expect(tx.cropLeft).toBeCloseTo(310.286, 3);
    expect(tx.cropRight).toBeCloseTo(930.857, 3);
    expect(tx.cropTop).toBeCloseTo(270, 1);
    expect(tx.cropBottom).toBeCloseTo(90, 1);
  });

  it("clamps impossible custom zoom below 1x", () => {
    const lowZoom = calculateSlotTransform(1920, 1080, slot, {
      mode: "custom",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 0.5,
    });
    const oneZoom = calculateSlotTransform(1920, 1080, slot, {
      mode: "custom",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
    });

    expect(lowZoom).toEqual(oneZoom);
  });
});
