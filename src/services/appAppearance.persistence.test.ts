import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("app appearance hydration", () => {
  beforeEach(() => {
    const localStorage = createStorage();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", {
      localStorage,
      location: { pathname: "/settings" },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("BroadcastChannel", undefined);
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("rehydrates a saved palette after the auth scope becomes available", async () => {
    vi.resetModules();
    const appearance = await import("./appAppearance");
    expect(appearance.loadAppAppearance().palette).toBe("classic-blue");

    localStorage.setItem("mce-auth-session", JSON.stringify({
      user: { id: "user-1" },
      expiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem("ocs-app-appearance:user-1", JSON.stringify({
      palette: "ember",
      customAccent: "#C2410C",
      updatedAt: Date.now(),
    }));

    expect(appearance.refreshAppAppearance().palette).toBe("ember");
  });
});
