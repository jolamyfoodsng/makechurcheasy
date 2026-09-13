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

  it("keeps the OBS overlay live for both display modes and targeted packets", () => {
    expect(timeOverlaySource).toContain("mode-fullscreen");
    expect(timeOverlaySource).toContain("mode-lower-third");
    expect(timeOverlaySource).toContain("placement-left");
    expect(timeOverlaySource).toContain("placement-right");
    expect(timeOverlaySource).toContain('data.tab !== "time"');
    expect(timeOverlaySource).toContain('window.setInterval(render, 250)');
  });

  it("uses Countdown-style transparent, centered text for full-screen output", () => {
    expect(timeOverlaySource).toContain("#time-card.mode-fullscreen {\n      inset: 0;");
    expect(timeOverlaySource).toContain("#time-card.mode-fullscreen .accent { display: none; }");
    expect(timeOverlaySource).toContain("background: transparent;");
    expect(timeOverlaySource).toContain("font-size: clamp(80px, 16vw, 360px);");
  });
});
