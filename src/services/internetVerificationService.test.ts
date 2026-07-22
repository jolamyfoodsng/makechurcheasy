import { beforeEach, describe, expect, it, vi } from "vitest";

type MockUser = { id: string; plan?: string; trial?: { endsAt?: string | null } } | null;

let mockUser: MockUser = null;
let mockPlan = "free";
let mockInTrial = false;
let mockConfig = {
  security: {
    internetVerificationEnabled: true,
    maxOfflineDays: 28,
    verificationIntervalHours: 4,
  },
};

vi.mock("./userScopedStorage", () => ({
  getUserScopedKey: (key: string) => key,
}));

vi.mock("./desktopConfig", () => ({
  getDesktopConfig: vi.fn(async () => mockConfig),
}));

vi.mock("./authService", () => ({
  getDeviceId: vi.fn(() => "device-1"),
  getDeviceSecret: vi.fn(() => null),
  getStoredUser: vi.fn(() => mockUser),
}));

vi.mock("./licenseService", () => ({
  getEffectivePlan: vi.fn(() => mockPlan),
  isInTrial: vi.fn(() => mockInTrial),
}));

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

function seedOfflineDays(days: number): void {
  localStorage.setItem(
    "ocs-internet-verification-last",
    String(Date.now() - days * 24 * 60 * 60 * 1000),
  );
}

async function loadService() {
  vi.resetModules();
  return import("./internetVerificationService");
}

beforeEach(() => {
  mockUser = { id: "user-1", plan: "free" };
  mockPlan = "free";
  mockInTrial = false;
  mockConfig = {
    security: {
      internetVerificationEnabled: true,
      maxOfflineDays: 28,
      verificationIntervalHours: 4,
    },
  };

  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  vi.stubGlobal("window", {
    setInterval,
    clearInterval,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    visibilityState: "visible",
  });
  vi.stubGlobal("navigator", { onLine: true });
});

describe("internetVerificationService", () => {
  it("uses free-trial thresholds: warning on day 10", async () => {
    mockUser = {
      id: "trial-user",
      plan: "free",
      trial: { endsAt: "2026-07-30T00:00:00.000Z" },
    };
    mockPlan = "growth";
    mockInTrial = true;
    seedOfflineDays(10);

    const service = await loadService();
    const state = await service.initVerification();

    expect(state.planScope).toBe("trial");
    expect(state.tier).toBe("warning");
    expect(state.requiredDays).toBe(14);

    service.destroyVerification();
  });

  it("uses free-trial thresholds: dismissible modal on day 13", async () => {
    mockUser = {
      id: "trial-user",
      plan: "free",
      trial: { endsAt: "2026-07-30T00:00:00.000Z" },
    };
    mockPlan = "growth";
    mockInTrial = true;
    seedOfflineDays(13);

    const service = await loadService();
    const state = await service.initVerification();

    expect(state.planScope).toBe("trial");
    expect(state.tier).toBe("critical");
    expect(state.modalDismissible).toBe(true);

    service.destroyVerification();
  });

  it("uses free-trial thresholds: reconnect required on day 14", async () => {
    mockUser = {
      id: "trial-user",
      plan: "free",
      trial: { endsAt: "2026-07-30T00:00:00.000Z" },
    };
    mockPlan = "growth";
    mockInTrial = true;
    seedOfflineDays(14);

    const service = await loadService();
    const state = await service.initVerification();

    expect(state.planScope).toBe("trial");
    expect(state.tier).toBe("required");
    expect(state.modalDismissible).toBe(false);

    service.destroyVerification();
  });

  it("uses free-plan thresholds: warning on day 5 and required on day 7", async () => {
    seedOfflineDays(5);

    let service = await loadService();
    let state = await service.initVerification();
    expect(state.planScope).toBe("free");
    expect(state.tier).toBe("warning");
    service.destroyVerification();

    localStorage.clear();
    seedOfflineDays(7);

    service = await loadService();
    state = await service.initVerification();
    expect(state.planScope).toBe("free");
    expect(state.tier).toBe("required");
    expect(state.requiredDays).toBe(7);
    service.destroyVerification();
  });

  it("uses basic-plan thresholds: dismissible modal on day 18 and required on day 21", async () => {
    mockUser = { id: "basic-user", plan: "basic" };
    mockPlan = "basic";

    seedOfflineDays(18);
    let service = await loadService();
    let state = await service.initVerification();
    expect(state.planScope).toBe("basic");
    expect(state.tier).toBe("critical");
    expect(state.modalDismissible).toBe(true);
    service.destroyVerification();

    localStorage.clear();
    seedOfflineDays(21);

    service = await loadService();
    state = await service.initVerification();
    expect(state.planScope).toBe("basic");
    expect(state.tier).toBe("required");
    expect(state.modalDismissible).toBe(false);
    expect(state.requiredDays).toBe(21);
    service.destroyVerification();
  });
});
