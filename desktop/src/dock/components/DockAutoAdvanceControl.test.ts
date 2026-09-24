import { describe, expect, it } from "vitest";
import {
  computeDefaultAutoAdvanceBannerPosition,
  getAutoAdvanceIndex,
  getAutoAdvancePopoverPosition,
} from "./DockAutoAdvanceControl";

describe("dock auto-advance queue", () => {
  it("advances until the last item, then stops", () => {
    expect(getAutoAdvanceIndex(0, 3, "stop")).toBe(1);
    expect(getAutoAdvanceIndex(1, 3, "stop")).toBe(2);
    expect(getAutoAdvanceIndex(2, 3, "stop")).toBeNull();
  });

  it("wraps around when looping is enabled", () => {
    expect(getAutoAdvanceIndex(2, 3, "loop")).toBe(0);
    expect(getAutoAdvanceIndex(1, 3, "loop", 4)).toBe(2);
  });

  it("rejects an invalid queue position", () => {
    expect(getAutoAdvanceIndex(-1, 3, "stop")).toBeNull();
    expect(getAutoAdvanceIndex(3, 3, "loop")).toBeNull();
    expect(getAutoAdvanceIndex(0, 0, "loop")).toBeNull();
  });

  it("keeps a single-item queue scoped to the selected item", () => {
    expect(getAutoAdvanceIndex(0, 1, "stop")).toBeNull();
    expect(getAutoAdvanceIndex(0, 1, "loop")).toBe(0);
  });

  it("keeps the settings panel inside a narrow Dock viewport", () => {
    const position = getAutoAdvancePopoverPosition(
      { top: 70, right: 278, bottom: 110 },
      { left: 26, top: 0, width: 316, height: 512 },
      430,
      360,
    );

    expect(position.width).toBe(300);
    expect(position.left).toBe(34);
    expect(position.top).toBe(118);
    expect(position.maxHeight).toBe(386);
  });

  it("opens above the trigger when the lower viewport has no room", () => {
    const position = getAutoAdvancePopoverPosition(
      { top: 450, right: 300, bottom: 490 },
      { left: 0, top: 0, width: 320, height: 512 },
      240,
      260,
    );

    expect(position.top).toBe(202);
    expect(position.left).toBe(40);
  });

  describe("computeDefaultAutoAdvanceBannerPosition", () => {
    it("positions banner directly above worship bottom toolbar with 8px clearance", () => {
      const mockToolbar = {
        getBoundingClientRect: () => ({
          top: 500,
          bottom: 548,
          left: 0,
          right: 400,
          width: 400,
          height: 48,
          x: 0,
          y: 500,
          toJSON: () => {},
        }),
      } as unknown as Element;

      const mockDoc = {
        querySelector: (sel: string) => {
          if (sel.includes(".dock-worship-toolbar")) return mockToolbar;
          return null;
        },
      };

      const fakeBanner = {
        offsetWidth: 300,
        offsetHeight: 38,
      } as HTMLElement;

      const pos = computeDefaultAutoAdvanceBannerPosition(
        fakeBanner,
        {
          innerWidth: 800,
          innerHeight: 600,
        },
        mockDoc,
      );

      // targetY should be rect.top - bannerHeight - 8 = 500 - 38 - 8 = 454
      expect(pos.y).toBe(454);
      expect(pos.x).toBe(16);
    });

    it("falls back to window-height offset when toolbar is not present", () => {
      const fakeBanner = {
        offsetWidth: 280,
        offsetHeight: 36,
      } as HTMLElement;

      const pos = computeDefaultAutoAdvanceBannerPosition(fakeBanner, {
        innerWidth: 1000,
        innerHeight: 700,
      });

      // targetY should be winHeight - 96 - bannerHeight = 700 - 96 - 36 = 568
      expect(pos.y).toBe(568);
      expect(pos.x).toBe(16);
    });

    it("clamps position within viewport bounds for small windows", () => {
      const fakeBanner = {
        offsetWidth: 200,
        offsetHeight: 40,
      } as HTMLElement;

      const pos = computeDefaultAutoAdvanceBannerPosition(fakeBanner, {
        innerWidth: 150,
        innerHeight: 120,
      });

      expect(pos.x).toBeGreaterThanOrEqual(8);
      expect(pos.y).toBeGreaterThanOrEqual(8);
    });
  });
});

