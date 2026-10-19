import { describe, expect, it } from "vitest";
import { HARDCODED_COUNTDOWNS } from "../dock/tabs/DockCountdownsTab";
import { createDefaultCountdown } from "../countdowns/countdownDefaults";
import {
  adjustCountdown,
  clockLayer,
  countdownLayers,
  countdownRemaining,
  DEFAULT_CLOCK,
  MINISTRY_LAYER_IDS,
  pauseCountdown,
  readClockSettings,
  resumeCountdown,
  startCountdown,
  tickerLayer,
  withTitle,
} from "./ministryLayers";

function readHash(url: string | undefined): Record<string, unknown> {
  const hash = String(url).split("#data=")[1];
  return JSON.parse(decodeURIComponent(hash)) as Record<string, unknown>;
}

describe("countdown timing", () => {
  it("counts down while running and holds while paused", () => {
    const live = startCountdown("d1", 300, 1_000);
    expect(countdownRemaining(live, 61_000)).toBe(240);
    const paused = pauseCountdown(live, 61_000);
    expect(paused.running).toBe(false);
    expect(countdownRemaining(paused, 999_000)).toBe(240);
    const resumed = resumeCountdown(paused, 100_000);
    expect(countdownRemaining(resumed, 110_000)).toBe(230);
  });

  it("adds and takes away time from what is left now, never below zero", () => {
    const live = startCountdown("d1", 120, 0);
    const plus = adjustCountdown(live, 60, 30_000);
    expect(countdownRemaining(plus, 30_000)).toBe(150);
    expect(countdownRemaining(adjustCountdown(live, -600, 30_000), 30_000)).toBe(0);
  });
});

describe("countdown layers", () => {
  it("draws a layer design with the countdown page only, carrying the time left", () => {
    const design = HARDCODED_COUNTDOWNS[0];
    const live = startCountdown(design.id, 600, 0);
    const layers = countdownLayers(design, live, "http://127.0.0.1:45678", { reveal: true, now: 60_000 });
    expect(layers.map((l) => l.id)).toEqual([MINISTRY_LAYER_IDS.countdown]);
    expect(layers[0].kind).toBe("page");
    expect(layers[0].pageUrl?.startsWith("/countdown-overlay.html#data=")).toBe(true);
    const payload = readHash(layers[0].pageUrl);
    expect(payload.sync).toEqual({ paused: false, remaining: 540 });
    expect(payload.reveal).toBe(true);
  });

  it("puts a classic design's background page underneath", () => {
    const design = createDefaultCountdown("custom", "classic-1");
    const layers = countdownLayers(design, startCountdown(design.id, 60, 0), "http://x", { reveal: false, now: 0 });
    expect(layers.map((l) => l.id)).toEqual([MINISTRY_LAYER_IDS.countdownBg, MINISTRY_LAYER_IDS.countdown]);
    expect(layers[0].pageUrl?.startsWith("/countdown-bg-overlay.html#data=")).toBe(true);
  });

  it("keeps the same page key between updates so the running page is not reloaded", () => {
    const design = HARDCODED_COUNTDOWNS[1];
    const live = startCountdown(design.id, 60, 0);
    const a = countdownLayers(design, live, "http://x", { reveal: true, now: 0 })[0];
    const b = countdownLayers(design, pauseCountdown(live, 5_000), "http://x", { reveal: false, now: 5_000 })[0];
    expect(a.pageKey).toBe(b.pageKey);
    expect(a.pageUrl).not.toBe(b.pageUrl);
  });

  it("uses the typed title", () => {
    const design = HARDCODED_COUNTDOWNS[0];
    expect(withTitle(design, "  Doors open in ").text.title).toBe("Doors open in");
    expect(withTitle(design, "  ")).toBe(design);
  });
});

describe("clock", () => {
  it("reads the Dock's saved clock settings and drops anything unknown", () => {
    expect(readClockSettings(null)).toEqual(DEFAULT_CLOCK);
    const clock = readClockSettings({ timer: {}, clock: { mode: "fullscreen", placement: "nowhere", color: "red;}", hour12: false, label: "Now" } });
    expect(clock.mode).toBe("fullscreen");
    expect(clock.placement).toBe(DEFAULT_CLOCK.placement);
    expect(clock.color).toBe(DEFAULT_CLOCK.color);
    expect(clock.hour12).toBe(false);
    expect(clock.label).toBe("Now");
  });

  it("sends the time overlay the same packet the Dock sends to OBS", () => {
    const layer = clockLayer({ ...DEFAULT_CLOCK, label: " Service " }, 42);
    expect(layer.pageUrl?.startsWith("/time-overlay.html#data=")).toBe(true);
    const packet = readHash(layer.pageUrl);
    expect(packet).toMatchObject({ tool: "clock", mode: "lower-third", placement: "bottom-right", label: "Service", timestamp: 42 });
    expect(packet.clock).toMatchObject({ theme: "digital-modern", hour12: true });
  });
});

describe("ticker", () => {
  it("is a strip along the chosen edge", () => {
    const layer = tickerLayer("<html></html>", "top", "k1");
    expect(layer).toMatchObject({ id: MINISTRY_LAYER_IDS.ticker, kind: "page", pageBox: "top", pageHeight: 80, pageKey: "k1", shown: true });
  });
});
