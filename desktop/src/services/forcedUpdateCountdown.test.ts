import { describe, expect, it, vi } from "vitest";

// The countdown helpers are pure; keep the network/Tauri modules out of the way.
vi.mock("./desktopConfig", () => ({
  getDesktopConfig: vi.fn(),
  readDesktopConfigCache: vi.fn(() => null),
  refreshDesktopConfig: vi.fn(),
}));
vi.mock("./updateService", () => ({
  fetchLatestPublishedRelease: vi.fn(),
}));

import {
  FINAL_DAY_HOURS,
  formatTimeLeft,
  getLiveCountdown,
  type ForcedUpdateState,
} from "./forcedUpdateService";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);

function countdownState(
  hoursLeft: number,
  overrides: Partial<ForcedUpdateState> = {},
): Pick<ForcedUpdateState, "active" | "blocked" | "lockAt" | "gracePeriodHours" | "hoursRemaining"> {
  return {
    active: true,
    blocked: false,
    gracePeriodHours: 168,
    hoursRemaining: hoursLeft,
    lockAt: new Date(NOW + hoursLeft * HOUR).toISOString(),
    ...overrides,
  };
}

describe("getLiveCountdown", () => {
  it("counts whole days down 7, 6, 5 ... and leaves the modal closable", () => {
    expect(getLiveCountdown(countdownState(6 * 24 + 3), NOW)).toMatchObject({
      daysLeft: 7,
      finalDay: false,
      modalLocked: false,
      expired: false,
    });
    expect(getLiveCountdown(countdownState(5 * 24 + 1), NOW).daysLeft).toBe(6);
  });

  it("marks the final 24 hours but keeps the modal closable", () => {
    expect(getLiveCountdown(countdownState(FINAL_DAY_HOURS + 0.5), NOW)).toMatchObject({
      finalDay: false,
      modalLocked: false,
    });
    expect(getLiveCountdown(countdownState(23.9), NOW)).toMatchObject({
      finalDay: true,
      modalLocked: false,
      expired: false,
    });
    expect(getLiveCountdown(countdownState(1), NOW).modalLocked).toBe(false);
  });

  it("locks the modal in the last 30 minutes", () => {
    expect(getLiveCountdown(countdownState(0.4), NOW)).toMatchObject({
      finalDay: true,
      modalLocked: true,
      expired: false,
    });
    expect(getLiveCountdown(countdownState(0.51), NOW).modalLocked).toBe(false);
  });

  it("is expired and locked once the deadline has passed", () => {
    expect(getLiveCountdown(countdownState(-2), NOW)).toMatchObject({
      expired: true,
      modalLocked: true,
      hoursRemaining: 0,
    });
  });

  it("always locks a hard block", () => {
    expect(
      getLiveCountdown(
        { active: true, blocked: true, gracePeriodHours: null, hoursRemaining: null, lockAt: null },
        NOW,
      ).modalLocked,
    ).toBe(true);
  });

  it("does nothing when no forced update is active", () => {
    expect(
      getLiveCountdown(
        { active: false, blocked: false, gracePeriodHours: null, hoursRemaining: null, lockAt: null },
        NOW,
      ),
    ).toMatchObject({ modalLocked: false, daysLeft: null });
  });
});

describe("formatTimeLeft", () => {
  it("shows days while there is more than a day left", () => {
    expect(formatTimeLeft(6.2 * 24)).toBe("7 days left");
    expect(formatTimeLeft(24.5)).toBe("2 days left");
  });

  it("switches to hours and minutes on the final day", () => {
    expect(formatTimeLeft(23.5)).toBe("23h 30m left");
    expect(formatTimeLeft(2)).toBe("2h left");
    expect(formatTimeLeft(0.5)).toBe("30m left");
  });

  it("says an update is required once time is up", () => {
    expect(formatTimeLeft(0)).toBe("Update required");
  });
});
