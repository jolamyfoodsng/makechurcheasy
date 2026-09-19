import { describe, expect, it } from "vitest";
import {
  calculateMultiviewBackgroundRect,
  calculateMultiviewMarginSlotRect,
} from "./DockMultiviewTab";

describe("DockMultiviewTab margin calculations", () => {
  const fullCanvasSlot = { x: 0, y: 0, width: 1920, height: 1080 };
  const leftHalfSlot = { x: 0, y: 0, width: 960, height: 1080 };
  const pipSlot = { x: 1200, y: 600, width: 640, height: 360 };

  it("returns unchanged slot rect when margin is 0", () => {
    const result = calculateMultiviewMarginSlotRect(pipSlot, 0);
    expect(result).toEqual(pipSlot);
  });

  it("insets and scales slots when margin > 0", () => {
    const margin = 40;
    // scaleX = (1920 - 80) / 1920 = 1840 / 1920 = 0.958333...
    // scaleY = (1080 - 80) / 1080 = 1000 / 1080 = 0.925925...
    const result = calculateMultiviewMarginSlotRect(fullCanvasSlot, margin);
    expect(result.x).toBe(40);
    expect(result.y).toBe(40);
    expect(result.width).toBe(1840);
    expect(result.height).toBe(1000);
  });

  it("correctly positions multi-slot layout with margin", () => {
    const margin = 20;
    const result = calculateMultiviewMarginSlotRect(leftHalfSlot, margin);
    expect(result.x).toBe(20);
    expect(result.y).toBe(20);
    expect(result.width).toBeCloseTo(960 * ((1920 - 40) / 1920), 4);
    expect(result.height).toBeCloseTo(1080 * ((1080 - 40) / 1080), 4);
  });

  it("clamps maximum margin to 200px", () => {
    const result = calculateMultiviewMarginSlotRect(fullCanvasSlot, 300);
    expect(result.x).toBe(200);
    expect(result.y).toBe(200);
    expect(result.width).toBe(1920 - 400);
    expect(result.height).toBe(1080 - 400);
  });

  it("applies inner gap between adjacent side-by-side slots", () => {
    const leftSlot = { x: 0, y: 0, width: 960, height: 1080 };
    const rightSlot = { x: 960, y: 0, width: 960, height: 1080 };
    const gap = 20;

    const leftResult = calculateMultiviewMarginSlotRect(leftSlot, 0, gap);
    const rightResult = calculateMultiviewMarginSlotRect(rightSlot, 0, gap);

    // Left slot: touches left (x=0), right edge pulls back by half gap (width - 10)
    expect(leftResult.x).toBe(0);
    expect(leftResult.width).toBe(950);

    // Right slot: left edge shifts right by half gap (+10), touches right edge
    expect(rightResult.x).toBe(970);
    expect(rightResult.width).toBe(950);

    // The gap between left and right slots is exactly 20px (970 - 950 = 20)
    expect(rightResult.x - (leftResult.x + leftResult.width)).toBe(20);
  });
});

describe("DockMultiviewTab affectBackground calculations", () => {
  it("leaves background full-bleed when affectBackground is false", () => {
    const rect = calculateMultiviewBackgroundRect(40, false);
    expect(rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("leaves background full-bleed when margin is 0 even if affectBackground is true", () => {
    const rect = calculateMultiviewBackgroundRect(0, true);
    expect(rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("insets background around canvas when affectBackground is true and margin > 0", () => {
    const rect = calculateMultiviewBackgroundRect(24, true);
    expect(rect).toEqual({
      x: 24,
      y: 24,
      width: 1920 - 48,
      height: 1080 - 48,
    });
  });
});
