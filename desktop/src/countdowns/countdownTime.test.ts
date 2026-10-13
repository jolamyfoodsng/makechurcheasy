import { describe, expect, it } from "vitest";
import { buildCountdownContent, durationTokens, clockTokens } from "./countdownTime";

describe("durationTokens", () => {
  it("formats minutes", () => {
    const t = durationTokens(298);
    expect(t.time).toBe("4:58");
    expect(t.tm).toBe("04:58");
    expect(t.tmm).toBe("00:04:58");
    expect(t.sign).toBe("");
  });
  it("formats hours and days", () => {
    expect(durationTokens(3725).time).toBe("1:02:05");
    const t = durationTokens(2 * 86400 + 3 * 3600 + 4 * 60 + 5);
    expect([t.dd, t.hh, t.mm, t.ss]).toEqual(["02", "03", "04", "05"]);
  });
  it("marks overtime", () => {
    const t = durationTokens(-5);
    expect(t.sign).toBe("-");
    expect(t.time).toBe("0:05");
  });
});

describe("clockTokens", () => {
  it("12 hour clock", () => {
    const t = clockTokens(new Date(2026, 0, 1, 15, 4, 9), true);
    expect(t.time).toBe("3:04:09");
    expect(t.ampm).toBe("PM");
  });
});

describe("buildCountdownContent", () => {
  it("has no level without thresholds", () => {
    expect(buildCountdownContent({ kind: "countdown", value: 100, durationSeconds: 300 }).live?.level).toBeUndefined();
  });
  it("levels and zones", () => {
    const base = { kind: "countdown" as const, durationSeconds: 300, warnYellowSeconds: 60, warnRedSeconds: 15 };
    expect(buildCountdownContent({ ...base, value: 200 }).live?.level).toBe("green");
    expect(buildCountdownContent({ ...base, value: 50 }).live?.level).toBe("yellow");
    const live = buildCountdownContent({ ...base, value: 10 }).live!;
    expect(live.level).toBe("red");
    expect(live.yellowFrom).toBeCloseTo(0.8);
    expect(live.redFrom).toBeCloseTo(0.95);
    expect(live.fraction).toBeCloseTo(290 / 300);
  });
});
