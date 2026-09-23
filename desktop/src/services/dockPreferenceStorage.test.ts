import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
}));

vi.mock("./localDockSettings", () => ({
  hydrateNativeDockSettings: vi.fn(async () => undefined),
  readNativeDockSetting: vi.fn((key: string) => native.values.get(key)),
  removeNativeDockSetting: vi.fn((key: string) => native.values.delete(key)),
  writeNativeDockSetting: vi.fn((key: string, value: unknown) => native.values.set(key, value)),
}));

import {
  loadDockPreference,
  loadDockPreferenceList,
  readDockPreference,
  readDockPreferenceList,
  saveDockPreference,
  saveDockPreferenceList,
} from "./dockPreferenceStorage";

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe("dockPreferenceStorage", () => {
  beforeEach(() => {
    native.values.clear();
    storageMap.clear();
  });

  it("writes and reads preferences from the native settings source", async () => {
    const value = await saveDockPreference<Record<string, unknown>>("ocs-dock-bible-preferences", {
      fullscreenQuickThemeSettings: { fontSize: 74 },
    });

    expect(readDockPreference("ocs-dock-bible-preferences")).toMatchObject({
      fullscreenQuickThemeSettings: { fontSize: 74 },
    });
    expect(value.updatedAt).toBeTruthy();
    expect(native.values.get("ocs-dock-bible-preferences")).toMatchObject(value);
  });

  it("hydrates the current native record without browser-storage repair", async () => {
    native.values.set("ocs-dock-bible-preferences", {
      updatedAt: "2026-08-09T00:00:00.000Z",
      fullscreenQuickThemeSettings: { fontSize: 88 },
    });

    await expect(loadDockPreference<Record<string, unknown>>("ocs-dock-bible-preferences"))
      .resolves.toMatchObject({ fullscreenQuickThemeSettings: { fontSize: 88 } });
  });

  it("migrates a legacy preference key into the current native key", async () => {
    const baseKey = "ocs-dock-worship-preferences";
    const legacyKey = "dock-worship-preferences";
    native.values.set(legacyKey, {
      updatedAt: "2026-08-09T00:00:00.000Z",
      lowerThirdQuickThemeSettings: { lowerThirdWidthPreset: "lg" },
    });

    const value = await loadDockPreference<Record<string, unknown>>(baseKey, [legacyKey]);

    expect(value).toMatchObject({
      lowerThirdQuickThemeSettings: { lowerThirdWidthPreset: "lg" },
    });
    const current = readDockPreference<Record<string, unknown>>(baseKey);
    if (!value || !current) throw new Error("Expected the migrated native preference to be readable");
    expect(current).toMatchObject(value);
    expect(native.values.has(legacyKey)).toBe(false);
  });

  it("stores picker style lists in the native settings source", async () => {
    const baseKey = "dtb-bg-picker-local-styles:bible:fullscreen";
    const styles = [{ id: "style-1", name: "Bible Full Screen Style 1" }];

    await saveDockPreferenceList(baseKey, styles);

    expect(readDockPreferenceList<typeof styles[number]>(baseKey)).toEqual(styles);
    await expect(loadDockPreferenceList<typeof styles[number]>(baseKey)).resolves.toEqual(styles);
  });

  it("keeps an intentional empty native list distinct from a missing list", async () => {
    const baseKey = "dock-mv-saved";
    native.values.set(baseKey, { items: [], updatedAt: "2026-08-09T00:00:00.000Z" });

    expect(readDockPreferenceList(baseKey)).toEqual([]);
    await expect(loadDockPreferenceList(baseKey)).resolves.toEqual([]);
  });

  it("reads instantly from localStorage fast cache when native setting is not yet in-memory", () => {
    const baseKey = "ocs-dock-bible-preferences";
    localStorage.setItem(
      `__mce_dock_fast_pref:${baseKey}`,
      JSON.stringify({ selectedBook: "John", selectedChapter: 3, overlayMode: "lower-third" }),
    );

    // Native settings has not been populated
    expect(native.values.has(baseKey)).toBe(false);

    // Instant read on render 0 returns the fast cache
    expect(readDockPreference(baseKey)).toMatchObject({
      selectedBook: "John",
      selectedChapter: 3,
      overlayMode: "lower-third",
    });
  });

  it("mirrors saveDockPreference writes into localStorage fast cache", async () => {
    const baseKey = "ocs-dock-worship-preferences";
    await saveDockPreference(baseKey, {
      selectedThemeId: "theme-royal-blue",
      fontSize: 56,
    });

    const fastCached = localStorage.getItem(`__mce_dock_fast_pref:${baseKey}`);
    expect(fastCached).toBeTruthy();
    expect(JSON.parse(fastCached!)).toMatchObject({
      selectedThemeId: "theme-royal-blue",
      fontSize: 56,
    });
  });
});

