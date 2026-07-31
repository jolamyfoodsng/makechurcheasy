import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProjectionSettings, saveProjectionSettings } from "./dockProjectionSettings";
import dockPageSource from "./DockPage.tsx?raw";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

describe("dock projection settings", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults Program background off for new users", () => {
    expect(loadProjectionSettings().sceneMode).toBe("no-clone");
  });

  it("migrates the removed Mirror Program mode to Program background on", () => {
    localStorage.setItem("ocs-dock-projection-settings", JSON.stringify({ sceneMode: "reference" }));

    expect(loadProjectionSettings().sceneMode).toBe("auto-duplicate");
  });

  it("treats the old unversioned Program background on value as the old default", () => {
    localStorage.setItem("ocs-dock-projection-settings", JSON.stringify({ sceneMode: "auto-duplicate" }));

    expect(loadProjectionSettings().sceneMode).toBe("no-clone");
  });

  it("keeps an explicitly saved Program background on choice", () => {
    saveProjectionSettings({
      ...loadProjectionSettings(),
      sceneMode: "auto-duplicate",
    });

    expect(loadProjectionSettings().sceneMode).toBe("auto-duplicate");
  });

  it("saves the overlay-only routing mode", () => {
    saveProjectionSettings({
      ...loadProjectionSettings(),
      sceneMode: "no-clone",
    });

    expect(loadProjectionSettings().sceneMode).toBe("no-clone");
  });

  it("shows only the two Program background routing choices in the dock sidebar", () => {
    expect(dockPageSource).toContain("page.programBackgroundOn");
    expect(dockPageSource).toContain("page.programBackgroundOff");
    expect(dockPageSource).toContain("updateProjectionSceneMode(mode)");
    expect(dockPageSource).not.toContain("Mirror Program");
    expect(dockPageSource).not.toContain("page.mirrorProgram");
    expect(dockPageSource).not.toContain("Direct Program");
  });
});
