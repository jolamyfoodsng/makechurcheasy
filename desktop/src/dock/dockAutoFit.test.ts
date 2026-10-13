import { describe, expect, it } from "vitest";
import { DOCK_AUTO_FIT_MIN, computeDockAutoFit } from "./dockAutoFit";

describe("dock auto-fit", () => {
  it("leaves a roomy Dock on a big screen alone", () => {
    expect(computeDockAutoFit({ viewportWidth: 520, viewportHeight: 900, screenWidth: 1920 })).toBe(1);
  });

  it("shrinks on small screens: Windows 150% (1280) more than a 14in MacBook (1512)", () => {
    const win = computeDockAutoFit({ viewportWidth: 420, viewportHeight: 800, screenWidth: 1280 });
    const mac = computeDockAutoFit({ viewportWidth: 420, viewportHeight: 800, screenWidth: 1512 });
    expect(win).toBeLessThan(mac);
    expect(mac).toBeLessThan(1);
  });

  it("shrinks further for a narrow, short panel", () => {
    const roomy = computeDockAutoFit({ viewportWidth: 420, viewportHeight: 800, screenWidth: 1512 });
    const tight = computeDockAutoFit({ viewportWidth: 300, viewportHeight: 520, screenWidth: 1512 });
    expect(tight).toBeLessThan(roomy);
  });

  it("never goes below the floor or above 1, and ignores unknown sizes", () => {
    expect(computeDockAutoFit({ viewportWidth: 100, viewportHeight: 100, screenWidth: 800 })).toBe(DOCK_AUTO_FIT_MIN);
    expect(computeDockAutoFit({ viewportWidth: 0, viewportHeight: 0, screenWidth: 0 })).toBe(1);
  });
});
