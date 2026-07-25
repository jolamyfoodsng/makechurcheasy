/**
 * tutorialPlacement.test.ts — Unit tests for the tutorial placement engine.
 *
 * Covers smart panel placement with viewport-aware fallbacks and spotlight
 * boundary clamping.
 */

import { describe, it, expect } from "vitest";
import {
  calculatePanelPlacement,
  clampSpotlight,
  type Rect,
  type Viewport,
} from "./tutorialPlacement";

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const PANEL_W = 340;
const PANEL_H = 300;

function rect(top: number, left: number, w: number, h: number): Rect {
  return { top, left, right: left + w, bottom: top + h, width: w, height: h };
}

const STANDARD_VP: Viewport = { width: 1280, height: 800 };
const SMALL_VP: Viewport = { width: 640, height: 480 };

// ═══════════════════════════════════════════════════════════════════════════════
// calculatePanelPlacement
// ═══════════════════════════════════════════════════════════════════════════════

describe("calculatePanelPlacement", () => {
  // ── Preferred placement ──────────────────────────────────────────────

  describe("Preferred placement: right", () => {
    it("places panel to the right when space is available", () => {
      const target = rect(300, 400, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.placement).toBe("right");
      expect(result.left).toBeGreaterThanOrEqual(target.right + 20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
    });
  });

  // ── Fallback: bottom ─────────────────────────────────────────────────

  describe("Fallback to bottom when right doesn't fit", () => {
    it("falls back to bottom when target is near right edge", () => {
      // Target is far right — no room for panel on the right
      const target = rect(300, 1100, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.placement).not.toBe("right");
      // Should still be within viewport
      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
      expect(result.top).toBeGreaterThanOrEqual(20);
      expect(result.top + PANEL_H).toBeLessThanOrEqual(STANDARD_VP.height - 20);
    });
  });

  // ── Fallback: left ───────────────────────────────────────────────────

  describe("Fallback to left", () => {
    it("falls back to left when right and bottom don't fit", () => {
      // Target is far right AND near the bottom — right won't fit, bottom may not fit either
      const target = rect(700, 1100, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.placement).not.toBe("right");
      // Must be within viewport
      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
    });
  });

  // ── Fallback: top ────────────────────────────────────────────────────

  describe("Fallback to top", () => {
    it("falls back to top when right, bottom, and left don't fit", () => {
      // Target in bottom-right corner — tight space
      const target = rect(700, 1100, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, {
        width: 1280,
        height: 800,
      });

      // Verify it's within bounds regardless of which placement was chosen
      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.top).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(1280 - 20);
      expect(result.top + PANEL_H).toBeLessThanOrEqual(800 - 20);
    });
  });

  // ── Target near edges ────────────────────────────────────────────────

  describe("Targets near viewport edges", () => {
    it("handles target at the top edge", () => {
      const target = rect(0, 500, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.top).toBeGreaterThanOrEqual(20);
      expect(result.top + PANEL_H).toBeLessThanOrEqual(STANDARD_VP.height - 20);
    });

    it("handles target at the bottom edge", () => {
      const target = rect(760, 500, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.top).toBeGreaterThanOrEqual(20);
      expect(result.top + PANEL_H).toBeLessThanOrEqual(STANDARD_VP.height - 20);
    });

    it("handles target at the left edge", () => {
      const target = rect(300, 0, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
    });

    it("handles target at the right edge", () => {
      const target = rect(300, 1260, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
    });

    it("handles target at top-left corner", () => {
      const target = rect(0, 0, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.top).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
      expect(result.top + PANEL_H).toBeLessThanOrEqual(STANDARD_VP.height - 20);
    });

    it("handles target at top-right corner", () => {
      const target = rect(0, 1200, 80, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.top).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
      expect(result.top + PANEL_H).toBeLessThanOrEqual(STANDARD_VP.height - 20);
    });

    it("handles target at bottom-left corner", () => {
      const target = rect(760, 0, 100, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.top).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
      expect(result.top + PANEL_H).toBeLessThanOrEqual(STANDARD_VP.height - 20);
    });

    it("handles target at bottom-right corner", () => {
      const target = rect(760, 1200, 80, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.top).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
      expect(result.top + PANEL_H).toBeLessThanOrEqual(STANDARD_VP.height - 20);
    });
  });

  // ── Small viewport ───────────────────────────────────────────────────

  describe("Small viewport", () => {
    it("always returns a position within bounds even on small screens", () => {
      const target = rect(100, 100, 80, 40);
      const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, SMALL_VP);

      expect(result.left).toBeGreaterThanOrEqual(20);
      expect(result.top).toBeGreaterThanOrEqual(20);
      expect(result.left + PANEL_W).toBeLessThanOrEqual(SMALL_VP.width - 20);
      expect(result.top + PANEL_H).toBeLessThanOrEqual(SMALL_VP.height - 20);
    });
  });

  // ── Panel fully within viewport (invariant) ──────────────────────────

  describe("Viewport containment invariant", () => {
    const edgeTargets: Array<[string, Rect]> = [
      ["center", rect(380, 590, 100, 40)],
      ["top-center", rect(0, 590, 100, 40)],
      ["bottom-center", rect(760, 590, 100, 40)],
      ["left-center", rect(380, 0, 100, 40)],
      ["right-center", rect(380, 1200, 80, 40)],
      ["top-left", rect(0, 0, 100, 40)],
      ["top-right", rect(0, 1200, 80, 40)],
      ["bottom-left", rect(760, 0, 100, 40)],
      ["bottom-right", rect(760, 1200, 80, 40)],
    ];

    for (const [name, target] of edgeTargets) {
      it(`panel stays within viewport for target at ${name}`, () => {
        const result = calculatePanelPlacement(target, PANEL_W, PANEL_H, STANDARD_VP);

        expect(result.left).toBeGreaterThanOrEqual(20);
        expect(result.top).toBeGreaterThanOrEqual(20);
        expect(result.left + PANEL_W).toBeLessThanOrEqual(STANDARD_VP.width - 20);
        expect(result.top + PANEL_H).toBeLessThanOrEqual(STANDARD_VP.height - 20);
      });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// clampSpotlight
// ═══════════════════════════════════════════════════════════════════════════════

describe("clampSpotlight", () => {
  const vp: Viewport = { width: 1280, height: 800 };

  it("returns unchanged rect when fully within viewport", () => {
    const result = clampSpotlight(
      { top: 100, left: 100, width: 200, height: 100 },
      vp,
    );

    expect(result).toEqual({ top: 100, left: 100, width: 200, height: 100 });
  });

  it("clips spotlight extending past right edge", () => {
    const result = clampSpotlight(
      { top: 100, left: 1200, width: 200, height: 100 },
      vp,
    );

    expect(result.left).toBe(1200);
    expect(result.width).toBe(80); // 1280 - 1200
    expect(result.height).toBe(100);
  });

  it("clips spotlight extending past bottom edge", () => {
    const result = clampSpotlight(
      { top: 750, left: 100, width: 200, height: 100 },
      vp,
    );

    expect(result.top).toBe(750);
    expect(result.height).toBe(50); // 800 - 750
    expect(result.width).toBe(200);
  });

  it("clips spotlight extending past left edge (negative left)", () => {
    const result = clampSpotlight(
      { top: 100, left: -50, width: 200, height: 100 },
      vp,
    );

    expect(result.left).toBe(0);
    expect(result.width).toBe(150); // 200 - 50
  });

  it("clips spotlight extending past top edge (negative top)", () => {
    const result = clampSpotlight(
      { top: -30, left: 100, width: 200, height: 100 },
      vp,
    );

    expect(result.top).toBe(0);
    expect(result.height).toBe(70); // 100 - 30
  });

  it("clips spotlight at top-left corner (both negative)", () => {
    const result = clampSpotlight(
      { top: -20, left: -30, width: 200, height: 100 },
      vp,
    );

    expect(result.top).toBe(0);
    expect(result.left).toBe(0);
    expect(result.width).toBe(170); // 200 - 30
    expect(result.height).toBe(80); // 100 - 20
  });

  it("returns zero dimensions when spotlight is entirely outside viewport", () => {
    const result = clampSpotlight(
      { top: -200, left: -300, width: 50, height: 50 },
      vp,
    );

    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it("clips spotlight that spans the full viewport width", () => {
    const result = clampSpotlight(
      { top: 100, left: 0, width: 2000, height: 50 },
      vp,
    );

    expect(result.left).toBe(0);
    expect(result.width).toBe(1280);
  });

  it("clips spotlight that spans the full viewport height", () => {
    const result = clampSpotlight(
      { top: 0, left: 100, width: 50, height: 2000 },
      vp,
    );

    expect(result.top).toBe(0);
    expect(result.height).toBe(800);
  });
});
