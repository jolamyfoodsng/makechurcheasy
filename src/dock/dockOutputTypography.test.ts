import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCK_OUTPUT_FONT_SCALE,
  applyDockOutputFontScale,
  normalizeDockOutputFontScale,
} from "./dockOutputTypography";

describe("dock OBS output typography", () => {
  it("normalizes output size to a supported option", () => {
    expect(normalizeDockOutputFontScale(undefined)).toBe(DEFAULT_DOCK_OUTPUT_FONT_SCALE);
    expect(normalizeDockOutputFontScale("1.25")).toBe(1.25);
    expect(normalizeDockOutputFontScale(0.1)).toBe(0.8);
  });

  it("scales Bible, Notes, and Worship text sizes together", () => {
    expect(applyDockOutputFontScale({ fontSize: 48, refFontSize: 20 }, 1.1)).toMatchObject({
      fontSize: 53,
      refFontSize: 22,
    });
  });

  it("does not mutate the original theme settings", () => {
    const source = { fontSize: 48 };
    const next = applyDockOutputFontScale(source, 0.8);
    expect(source.fontSize).toBe(48);
    expect(next?.fontSize).toBe(38);
  });
});
