import { describe, expect, it } from "vitest";
import {
  adjustLive,
  createRundown,
  createTimer,
  currentValue,
  displayText,
  formatDuration,
  goToTimer,
  makeLive,
  parseDuration,
  pauseLive,
  progressFraction,
  resetLive,
  shouldAutoAdvance,
  startLive,
  warnLevel,
} from "./rundownEngine";

describe("parseDuration", () => {
  it("treats a bare number as minutes", () => expect(parseDuration("10")).toBe(600));
  it("parses mm:ss and h:mm:ss", () => {
    expect(parseDuration("5:30")).toBe(330);
    expect(parseDuration("1:05:00")).toBe(3900);
  });
  it("rejects junk", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("a:b")).toBeNull();
    expect(parseDuration("1:2:3:4")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats minutes, hours and overtime", () => {
    expect(formatDuration(125)).toBe("02:05");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("-00:05");
  });
});

describe("live state", () => {
  const rd = createRundown();
  rd.timers = [
    createTimer({ name: "A", durationSeconds: 100, autoNext: true }),
    createTimer({ name: "B", durationSeconds: 50 }),
  ];

  it("counts down only while running", () => {
    const idle = makeLive(rd, 0, 0);
    expect(currentValue(idle, 10_000)).toBe(100);
    const running = startLive(idle, 0);
    expect(currentValue(running, 10_000)).toBe(90);
    const paused = pauseLive(running, 10_000);
    expect(currentValue(paused, 50_000)).toBe(90);
  });

  it("goes negative (overtime) and adjusts", () => {
    const running = startLive(makeLive(rd, 0, 0), 0);
    expect(currentValue(running, 110_000)).toBe(-10);
    expect(currentValue(adjustLive(running, 30, 10_000), 10_000)).toBe(120);
  });

  it("counts up", () => {
    const r = createRundown();
    r.timers = [createTimer({ kind: "countup", durationSeconds: 0 })];
    const live = startLive(makeLive(r, 0, 0), 0);
    expect(currentValue(live, 7_000)).toBe(7);
    expect(displayText(live, 7_000)).toBe("00:07");
  });

  it("resets to the initial value", () => {
    const running = startLive(makeLive(rd, 0, 0), 0);
    const reset = resetLive(running, 5_000);
    expect(reset.status).toBe("idle");
    expect(reset.value).toBe(100);
  });

  it("auto-advances at zero when asked and keeps the message", () => {
    const live = startLive(makeLive(rd, 0, 0), 0);
    expect(shouldAutoAdvance(live, 99_000)).toBe(false);
    expect(shouldAutoAdvance(live, 100_000)).toBe(true);
    const msg = { id: "m", text: "hi", color: "white" as const, bold: false, flash: false };
    const next = goToTimer(rd, { ...live, message: msg }, 1, 100_000, true);
    expect(next.index).toBe(1);
    expect(next.status).toBe("running");
    expect(next.message).toEqual(msg);
    expect(shouldAutoAdvance(next, 200_000)).toBe(false);
  });
});

describe("warnLevel / progress", () => {
  it("goes green → yellow → red", () => {
    expect(warnLevel("countdown", 120, 300, 60, 15)).toBe("green");
    expect(warnLevel("countdown", 60, 300, 60, 15)).toBe("yellow");
    expect(warnLevel("countdown", 15, 300, 60, 15)).toBe("red");
    expect(warnLevel("countdown", -3, 300, 0, 0)).toBe("red");
  });
  it("uses the cap for count-up and stays green without one", () => {
    expect(warnLevel("countup", 250, 300, 60, 15)).toBe("yellow");
    expect(warnLevel("countup", 250, 0, 60, 15)).toBe("green");
    expect(warnLevel("timeofday", 0, 0, 60, 15)).toBe("green");
  });
  it("clamps progress", () => {
    expect(progressFraction("countdown", 75, 300)).toBeCloseTo(0.75);
    expect(progressFraction("countdown", -10, 300)).toBe(1);
    expect(progressFraction("countup", 30, 0)).toBe(0);
  });
});
