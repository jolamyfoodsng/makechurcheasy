import { describe, it, expect, vi, beforeEach } from "vitest";

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
  getDeviceApiBaseCandidates: () => ["https://api.makechurcheazy.com"],
  getDeviceId: () => "vc_current_dev",
  getDeviceSecret: () => "sec_123",
  getSession: () => ({ user: { id: "user_123", email: "pastor@church.org" } }),
  rememberSessionApiBase: vi.fn(),
}));

import {
  getLockScreenConfig,
  disconnectOtherDevicesAndUnlock,
  type LicensePayload,
} from "./licenseGuard";

describe("LicenseGuard device limit and disconnect flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage.clear();
  });

  it("configures clear takeover messaging for Free plan with specific other device", () => {
    const payload: Partial<LicensePayload> = {
      plan: "free",
      maxDevices: 1,
      deviceCount: 2,
      otherDevices: [
        { deviceId: "vc_other_1", deviceName: "Media PC" },
      ],
    };

    const config = getLockScreenConfig("too_many_devices", payload as LicensePayload);
    expect(config.title).toBe("Active on Media PC");
    expect(config.primaryAction).toBe("disconnect_others");
    expect(config.primaryLabel).toBe("Log Out & Continue");
    expect(config.description).toContain("Media PC");
    expect(config.description).toContain("1 computer at a time");
    expect(config.icon).toBe("devices");
  });

  it("configures clear takeover messaging for Free plan without other device name", () => {
    const payload: Partial<LicensePayload> = {
      plan: "free",
      maxDevices: 1,
      deviceCount: 2,
    };

    const config = getLockScreenConfig("too_many_devices", payload as LicensePayload);
    expect(config.title).toBe("Active on Another Computer");
    expect(config.primaryAction).toBe("disconnect_others");
    expect(config.primaryLabel).toBe("Log Out & Continue");
    expect(config.description).toContain("1 computer at a time");
  });

  it("configures messaging for paid plan exceeding device slots", () => {
    const payload: Partial<LicensePayload> = {
      plan: "basic",
      maxDevices: 3,
      deviceCount: 4,
    };

    const config = getLockScreenConfig("too_many_devices", payload as LicensePayload);
    expect(config.title).toBe("Device Limit Reached");
    expect(config.primaryAction).toBe("disconnect_others");
    expect(config.primaryLabel).toBe("Log Out & Continue");
    expect(config.description).toContain("basic");
    expect(config.description).toContain("3");
  });

  it("configures transferred session messaging for device disconnected by other computer", () => {
    const config = getLockScreenConfig("device_disconnected_by_other", null);
    expect(config.title).toBe("Logged Out on Another Computer");
    expect(config.primaryAction).toBe("reconnect");
    expect(config.primaryLabel).toBe("Sign In & Use Here");
    expect(config.description).toContain("opened on another computer");
    expect(config.description).toContain("1 computer at a time");
  });

  it("calls /api/device/disconnect-others and re-verifies", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/device/disconnect-others")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, count: 1 }),
        });
      }
      if (url.includes("/api/device/license")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            license: {
              accountStatus: "active",
              subscriptionStatus: "active",
              plan: "free",
              trialActive: false,
              trialEndsAt: null,
              subscriptionEndsAt: null,
              renewalDate: null,
              paymentStatus: "paid",
              internetVerificationDays: 14,
              verificationIntervalHours: 6,
              lastVerifiedAt: new Date().toISOString(),
              serverTime: new Date().toISOString(),
              lockReason: null,
              tooManyDevices: false,
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await disconnectOtherDevicesAndUnlock();
    expect(result.success).toBe(true);

    const disconnectCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/device/disconnect-others")
    );
    expect(disconnectCall).toBeDefined();
    expect(disconnectCall?.[1]?.method).toBe("POST");
    expect(disconnectCall?.[1]?.headers?.["X-Device-Id"]).toBe("vc_current_dev");
  });
});
