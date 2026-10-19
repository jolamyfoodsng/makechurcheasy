import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("../../services/localDockSettings", () => ({
  readNativeDockSetting: (key: string) => store.get(key),
  writeNativeDockSetting: async (key: string, value: unknown) => { store.set(key, value); },
}));

import { readSavedSyncScope } from "./DockThemeSettingsModal";

describe("Apply changes to: reopens on the last saved choice", () => {
  beforeEach(() => store.clear());

  it("is All Tabs & Scenes until something else is saved", () => {
    expect(readSavedSyncScope().mode).toBe("all");
  });

  it("returns the saved Current only / Custom choice", () => {
    store.set("dtb-theme-sync-scope", { mode: "current", tabs: { bible: true, worship: true, notes: true }, modes: { fullscreen: true, "lower-third": true } });
    expect(readSavedSyncScope().mode).toBe("current");
    store.set("dtb-theme-sync-scope", { mode: "custom", tabs: { bible: false, worship: true, notes: false }, modes: { fullscreen: false, "lower-third": true } });
    expect(readSavedSyncScope()).toEqual({ mode: "custom", tabs: { bible: false, worship: true, notes: false }, modes: { fullscreen: false, "lower-third": true } });
  });

  it("ignores a broken saved value", () => {
    store.set("dtb-theme-sync-scope", { mode: "everything" });
    expect(readSavedSyncScope().mode).toBe("all");
  });
});
