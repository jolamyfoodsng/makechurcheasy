import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_APPEARANCE,
  getAppAppearanceCssVariables,
  getDockAppearanceCssVariables,
  normalizeAppAppearance,
} from "./appAppearance";

describe("app appearance", () => {
  it("normalizes invalid preferences back to the shared default", () => {
    expect(normalizeAppAppearance({ palette: "not-a-theme", customAccent: "not-a-color" })).toEqual({
      ...DEFAULT_APP_APPEARANCE,
    });
  });

  it("builds app and dock tokens from the same palette", () => {
    const preferences = normalizeAppAppearance({ palette: "ocean-teal" });
    const appTokens = getAppAppearanceCssVariables(preferences, "dark");
    const dockTokens = getDockAppearanceCssVariables(preferences, "dark");

    expect(appTokens["--primary"]).toBe("#0F766E");
    expect(appTokens["--accent-color"]).toBe(appTokens["--primary"]);
    expect(dockTokens["--dock-accent"]).toBe(appTokens["--primary"]);
    expect(dockTokens["--dock-surface"]).toBe(appTokens["--surface"]);
  });

  it("keeps a custom accent usable with white button text", () => {
    const preferences = normalizeAppAppearance({ palette: "custom", customAccent: "#FFFFFF" });
    const tokens = getAppAppearanceCssVariables(preferences, "light");

    expect(tokens["--primary"]).not.toBe("#FFFFFF");
    expect(tokens["--primary-hover"]).not.toBe("#FFFFFF");
  });

  it("normalizes optional Dock visual toggles without breaking older preferences", () => {
    const preferences = normalizeAppAppearance({
      palette: "classic-blue",
      dockVisuals: {
        glassSurface: true,
        radialGlow: false,
        softShadow: "yes",
      },
    });

    expect(preferences.dockVisuals).toEqual({
      glassSurface: true,
      radialGlow: false,
      softShadow: DEFAULT_APP_APPEARANCE.dockVisuals.softShadow,
      motion: DEFAULT_APP_APPEARANCE.dockVisuals.motion,
    });
  });
});
