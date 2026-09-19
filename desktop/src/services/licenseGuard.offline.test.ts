import { describe, expect, it, beforeEach, vi } from "vitest";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

const mockStorage = createStorage();
vi.stubGlobal("localStorage", mockStorage);
vi.stubGlobal("window", {
  localStorage: mockStorage,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

vi.mock("./authService", () => ({
  getDeviceApiBaseCandidates: () => ["https://api.creatorstudioslabs.stream"],
  getDeviceId: () => "device-123",
  getDeviceSecret: () => "secret-abc",
  getSession: () => ({ user: { id: "user-123", email: "test@example.com" } }),
  rememberSessionApiBase: vi.fn(),
}));

import {
  getState,
  getLockScreenConfig,
  OFFLINE_WARNING_DAYS,
  OFFLINE_LOCK_DAYS,
  __testSetLastVerifiedMs,
  recordOnlineSuccess,
} from "./licenseGuard";

describe("licenseGuard offline grace period and warnings", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    mockStorage.clear();
  });

  it("verifies thresholds are 14 days (2 weeks) and 21 days (3 weeks)", () => {
    expect(OFFLINE_WARNING_DAYS).toBe(14);
    expect(OFFLINE_LOCK_DAYS).toBe(21);
  });

  it("allows normal offline operation under 14 days without warning or lock", () => {
    const sevenDaysAgo = Date.now() - 7 * DAY_MS;
    __testSetLastVerifiedMs(sevenDaysAgo);

    const state = getState();
    expect(state.unlocked).toBe(true);
    expect(state.lockReason).toBeNull();
    expect(state.offlineWarning).toBe(false);
    expect(state.daysOffline).toBe(7);
  });

  it("triggers offline warning at 14 days (2 weeks) while keeping the app unlocked", () => {
    const fourteenDaysAgo = Date.now() - 14 * DAY_MS;
    __testSetLastVerifiedMs(fourteenDaysAgo);

    const state = getState();
    expect(state.unlocked).toBe(true);
    expect(state.lockReason).toBeNull();
    expect(state.offlineWarning).toBe(true);
    expect(state.daysOffline).toBe(14);
  });

  it("maintains offline warning up to 20 days while keeping the app unlocked", () => {
    const twentyDaysAgo = Date.now() - 20 * DAY_MS;
    __testSetLastVerifiedMs(twentyDaysAgo);

    const state = getState();
    expect(state.unlocked).toBe(true);
    expect(state.lockReason).toBeNull();
    expect(state.offlineWarning).toBe(true);
    expect(state.daysOffline).toBe(20);
  });

  it("triggers internet_required lock screen at 21 days (full 3 weeks)", () => {
    const twentyOneDaysAgo = Date.now() - 21 * DAY_MS;
    __testSetLastVerifiedMs(twentyOneDaysAgo);

    const state = getState();
    expect(state.unlocked).toBe(false);
    expect(state.lockReason).toBe("internet_required");
    expect(state.offlineWarning).toBe(false);
    expect(state.daysOffline).toBe(21);

    const lockConfig = getLockScreenConfig("internet_required", null);
    expect(lockConfig.title).toBe("Internet Connection Required");
    expect(lockConfig.description).toContain("3 weeks");
    expect(lockConfig.primaryAction).toBe("retry");
    expect(lockConfig.primaryLabel).toBe("Check Connection");
  });

  it("clears the lock and warning when connection is restored", () => {
    const twentyTwoDaysAgo = Date.now() - 22 * DAY_MS;
    __testSetLastVerifiedMs(twentyTwoDaysAgo);
    expect(getState().unlocked).toBe(false);

    recordOnlineSuccess();
    __testSetLastVerifiedMs(Date.now());

    const state = getState();
    expect(state.unlocked).toBe(true);
    expect(state.lockReason).toBeNull();
    expect(state.offlineWarning).toBe(false);
    expect(state.daysOffline).toBe(0);
  });
});
