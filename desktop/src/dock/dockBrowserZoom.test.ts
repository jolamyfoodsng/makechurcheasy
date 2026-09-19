import { describe, expect, it } from "vitest";
import { getDockBrowserZoomShortcut, isLikelyDockBrowserZoomedIn } from "./dockBrowserZoom";

describe("Dock browser zoom detection", () => {
  const baseSignals = {
    devicePixelRatio: 1,
    baselineDevicePixelRatio: 1,
    visualViewportScale: 1,
    innerWidth: 400,
    outerWidth: 400,
    isWindows: true,
  };

  it("warns when Chromium reports a page zoom increase from the display baseline", () => {
    expect(isLikelyDockBrowserZoomedIn({
      ...baseSignals,
      devicePixelRatio: 1.25,
    })).toBe(true);
  });

  it("does not confuse normal Windows display scaling with browser zoom", () => {
    expect(isLikelyDockBrowserZoomedIn({
      ...baseSignals,
      devicePixelRatio: 1.25,
      baselineDevicePixelRatio: 1.25,
    })).toBe(false);
  });

  it("catches a persisted Windows page zoom from the embedded viewport width", () => {
    expect(isLikelyDockBrowserZoomedIn({
      ...baseSignals,
      innerWidth: 320,
      outerWidth: 400,
      baselineDevicePixelRatio: null,
    })).toBe(true);
  });

  it("keeps the warning hidden at the normal zoom baseline", () => {
    expect(isLikelyDockBrowserZoomedIn(baseSignals)).toBe(false);
  });

  it("uses the platform reset shortcut", () => {
    expect(getDockBrowserZoomShortcut("Win32")).toBe("Ctrl+0");
    expect(getDockBrowserZoomShortcut("MacIntel")).toBe("⌘0");
  });
});
