import { describe, it, expect, beforeEach } from "vitest";
import {
  formatHoursAndMinutes,
  getMultistreamUsageInfo,
  recordMultistreamElapsed,
  recordMultistreamHeartbeat,
  resetMultistreamUsage,
  MULTISTREAM_USAGE_STORAGE_KEY,
} from "./broadcastUsageService";

describe("broadcastUsageService", () => {
  beforeEach(() => {
    resetMultistreamUsage();
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(MULTISTREAM_USAGE_STORAGE_KEY);
    }
  });

  it("formatHoursAndMinutes formats hours and minutes accurately", () => {
    expect(formatHoursAndMinutes(0)).toBe("0h");
    expect(formatHoursAndMinutes(1800)).toBe("30m");
    expect(formatHoursAndMinutes(3600)).toBe("1h");
    expect(formatHoursAndMinutes(7200)).toBe("2h");
    expect(formatHoursAndMinutes(7320)).toBe("2h 2m");
    expect(formatHoursAndMinutes(72000)).toBe("20h");
  });

  it("calculates initial usage accurately for Growth 20h plan", () => {
    const info = getMultistreamUsageInfo(20);
    expect(info.totalHours).toBe(20);
    expect(info.usedSeconds).toBe(0);
    expect(info.remainingHours).toBe(20);
    expect(info.formattedRemaining).toBe("20h");
    expect(info.isExhausted).toBe(false);
  });

  it("records elapsed stream time and subtracts from remaining", () => {
    // Stream for 1 hour (3600 seconds)
    const updated = recordMultistreamElapsed(3600, 20);
    expect(updated.usedSeconds).toBe(3600);
    expect(updated.usedHours).toBe(1);
    expect(updated.remainingHours).toBe(19);
    expect(updated.formattedRemaining).toBe("19h");
    expect(updated.isExhausted).toBe(false);

    // Stream for another 30 mins (1800 seconds)
    const updated2 = recordMultistreamElapsed(1800, 20);
    expect(updated2.usedSeconds).toBe(5400);
    expect(updated2.formattedRemaining).toBe("18h 30m");
    expect(updated2.formattedUsed).toBe("1h 30m");
  });

  it("detects when quota is exhausted", () => {
    // Record all 20 hours (72,000 seconds)
    const exhausted = recordMultistreamElapsed(72000, 20);
    expect(exhausted.remainingSeconds).toBe(0);
    expect(exhausted.remainingHours).toBe(0);
    expect(exhausted.formattedRemaining).toBe("0h");
    expect(exhausted.isExhausted).toBe(true);
  });

  it("recordMultistreamHeartbeat deduplicates rapid calls from multiple windows", () => {
    // First heartbeat records ~2 seconds
    const first = recordMultistreamHeartbeat(20);
    expect(first.usedSeconds).toBe(2);

    // Immediate second heartbeat (within 1.5s, e.g. from second window) is ignored
    const second = recordMultistreamHeartbeat(20);
    expect(second.usedSeconds).toBe(2);
  });
});
