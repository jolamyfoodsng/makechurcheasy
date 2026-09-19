import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProjectionSettings, saveProjectionSettings } from "./dockProjectionSettings";
import dockPageSource from "./DockPage.tsx?raw";
import { removeNativeDockSetting, writeNativeDockSetting } from "../services/localDockSettings";

const PROJECTION_SETTINGS_KEY = "ocs-dock-projection-settings";

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
    removeNativeDockSetting(PROJECTION_SETTINGS_KEY);
  });

  afterEach(() => {
    removeNativeDockSetting(PROJECTION_SETTINGS_KEY);
    vi.unstubAllGlobals();
  });

  it("defaults Program background off for new users", () => {
    expect(loadProjectionSettings().sceneMode).toBe("no-clone");
  });

  it("defaults to isolating the active MCE source while preserving the lower-third first-source option", () => {
    expect(loadProjectionSettings().presentationSourceVisibility).toBe("active-only");
    expect(loadProjectionSettings().lowerThirdSourceVisibility).toBe("keep-first");
  });

  it("migrates the removed Mirror Program mode to Program background on", () => {
    writeNativeDockSetting(PROJECTION_SETTINGS_KEY, { sceneMode: "reference" });

    expect(loadProjectionSettings().sceneMode).toBe("auto-duplicate");
  });

  it("treats the old unversioned Program background on value as the old default", () => {
    writeNativeDockSetting(PROJECTION_SETTINGS_KEY, { sceneMode: "auto-duplicate" });

    expect(loadProjectionSettings().sceneMode).toBe("no-clone");
  });

  it("ignores a stale browser copy once the native setting is present", () => {
    localStorage.setItem(PROJECTION_SETTINGS_KEY, JSON.stringify({ sceneMode: "auto-duplicate" }));
    writeNativeDockSetting(PROJECTION_SETTINGS_KEY, {
      sceneMode: "no-clone",
      settingsVersion: 3,
      programBackgroundOptIn: false,
    });

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

  it("persists the return-to-previous-scene choice", () => {
    saveProjectionSettings({
      ...loadProjectionSettings(),
      restoreOriginalScene: true,
    });

    expect(loadProjectionSettings().restoreOriginalScene).toBe(true);
  });

  it("persists source visibility choices", () => {
    saveProjectionSettings({
      ...loadProjectionSettings(),
      presentationSourceVisibility: "keep-visible",
      lowerThirdSourceVisibility: "active-only",
    });

    expect(loadProjectionSettings().presentationSourceVisibility).toBe("keep-visible");
    expect(loadProjectionSettings().lowerThirdSourceVisibility).toBe("active-only");
  });

  it("shows Program background routing as one compact dropdown in the dock sidebar", () => {
    const routingPanel = dockPageSource.slice(
      dockPageSource.indexOf("{/* Advanced OBS Output */}"),
      dockPageSource.indexOf("{/* History */}"),
    );
    expect(dockPageSource).toContain("page.programBackground");
    expect(dockPageSource).toContain('className="dock-sidebar__select dock-sidebar__select--routing"');
    expect(dockPageSource).toContain('<option value="no-clone">');
    expect(dockPageSource).toContain('<option value="auto-duplicate">');
    expect(dockPageSource).toContain('updateProjectionSceneMode(event.target.value as ProjectionSettings["sceneMode"])');
    expect(dockPageSource).toContain("updateProjectionSettings({ restoreOriginalScene: e.target.checked })");
    expect(dockPageSource).toContain("presentationSourceVisibility");
    expect(dockPageSource).toContain("lowerThirdSourceVisibility");
    expect(dockPageSource).toContain("Your own OBS sources are untouched");
    expect(dockPageSource).not.toContain("setProjectionSettings((s) => ({ ...s, restoreOriginalScene: e.target.checked }))");
    expect(routingPanel).not.toContain("dock-sidebar__radio");
    expect(routingPanel).not.toContain("aria-pressed");
    expect(routingPanel).not.toContain("Mirror Program");
    expect(routingPanel).not.toContain("page.mirrorProgram");
    expect(routingPanel).not.toContain("Direct Program");
  });

  it("does not persist the startup snapshot back over the native setting", () => {
    expect(dockPageSource).not.toContain("saveProjectionSettings(projectionSettings)");
    expect(dockPageSource).toContain("saveProjectionSettings(next)");
  });

  it("hydrates the native database before mounting DockPageContent", () => {
    expect(dockPageSource.indexOf("function DockPageContent")).toBeLessThan(
      dockPageSource.indexOf("export default function DockPage"),
    );
    expect(dockPageSource).toContain("Loading saved Dock settings…");
    expect(dockPageSource).toContain("return <DockPageContent {...props} />");
  });
});
