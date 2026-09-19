import { describe, expect, it } from "vitest";
import {
  DOCK_TIME_LOWER_THIRD_SOURCE_NAME,
  DOCK_TIME_SOURCE_NAME,
  formatTimeDuration,
  getDockTimeSourceName,
  getTimerElapsedSeconds,
} from "./timeOverlay";
import timeOverlaySource from "../../public/time-overlay.html?raw";

describe("Dock Time overlay helpers", () => {
  it("uses separate OBS sources for full-screen and lower-third output", () => {
    expect(getDockTimeSourceName("fullscreen")).toBe(DOCK_TIME_SOURCE_NAME);
    expect(getDockTimeSourceName("lower-third")).toBe(DOCK_TIME_LOWER_THIRD_SOURCE_NAME);
  });

  it("keeps a running timer accurate without network updates", () => {
    expect(getTimerElapsedSeconds({ elapsedSeconds: 12, running: true, startedAt: 1_000 }, 6_700)).toBe(17);
    expect(getTimerElapsedSeconds({ elapsedSeconds: 12, running: false, startedAt: null }, 6_700)).toBe(12);
  });

  it("formats short and long elapsed times clearly", () => {
    expect(formatTimeDuration(75)).toBe("01:15");
    expect(formatTimeDuration(3_661)).toBe("01:01:01");
  });

  it("supports multiple clock themes in the overlay HTML", () => {
    expect(timeOverlaySource).toContain("theme-digital-modern");
    expect(timeOverlaySource).toContain("theme-analog-wall");
    expect(timeOverlaySource).toContain("theme-broadcast-pill");
    expect(timeOverlaySource).toContain("theme-neon");
    expect(timeOverlaySource).toContain("theme-elegant");
  });

  it("supports transparent mode and 4-way corner placements", () => {
    expect(timeOverlaySource).toContain("is-transparent");
    expect(timeOverlaySource).toContain("placement-top-left");
    expect(timeOverlaySource).toContain("placement-top-right");
    expect(timeOverlaySource).toContain("placement-bottom-left");
    expect(timeOverlaySource).toContain("placement-bottom-right");
  });

  it("includes SVG analog clock elements and rotation updates", () => {
    expect(timeOverlaySource).toContain("analog-dial");
    expect(timeOverlaySource).toContain("analog-hour-hand");
    expect(timeOverlaySource).toContain("analog-min-hand");
    expect(timeOverlaySource).toContain("analog-sec-hand");
    expect(timeOverlaySource).toContain("updateAnalogHands");
  });
});
