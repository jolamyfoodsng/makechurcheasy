import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  getByKey: vi.fn(),
  getCurrentUserId: vi.fn<() => string | null>(() => "style-user"),
  putRecord: vi.fn(() => Promise.resolve()),
  STORES: { APP_SETTINGS: "app_settings" },
}));

vi.mock("./db", () => dbMock);

import {
  loadDockPreference,
  loadDockPreferenceList,
  readDockPreference,
  saveDockPreference,
  saveDockPreferenceList,
} from "./dockPreferenceStorage";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

describe("dockPreferenceStorage", () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", {
      localStorage: storage,
      location: { pathname: "/dock.html" },
    });
    dbMock.getCurrentUserId.mockReturnValue("style-user");
    dbMock.getByKey.mockReset();
    dbMock.putRecord.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes the fast copy and the user-scoped IndexedDB copy", async () => {
    const value = await saveDockPreference("ocs-dock-bible-preferences", {
      fullscreenQuickThemeSettings: { fontSize: 74 },
    });

    expect(readDockPreference("ocs-dock-bible-preferences")).toMatchObject({
      fullscreenQuickThemeSettings: { fontSize: 74 },
    });
    expect(dbMock.putRecord).toHaveBeenCalledWith(
      "app_settings",
      value,
      "ocs-dock-bible-preferences:style-user",
    );
  });

  it("prefers a newer durable record and repairs localStorage", async () => {
    const baseKey = "ocs-dock-bible-preferences";
    const scopedKey = `${baseKey}:style-user`;
    localStorage.setItem(scopedKey, JSON.stringify({
      updatedAt: "2026-08-01T00:00:00.000Z",
      fullscreenQuickThemeSettings: { fontSize: 40 },
    }));
    dbMock.getByKey.mockImplementation((_store: string, key: string) => Promise.resolve(
      key === scopedKey
        ? {
            updatedAt: "2026-08-09T00:00:00.000Z",
            fullscreenQuickThemeSettings: { fontSize: 88 },
          }
        : undefined,
    ));

    const value = await loadDockPreference<Record<string, unknown>>(baseKey);

    expect(value).toMatchObject({
      fullscreenQuickThemeSettings: { fontSize: 88 },
    });
    expect(JSON.parse(localStorage.getItem(scopedKey) ?? "{}")).toMatchObject({
      fullscreenQuickThemeSettings: { fontSize: 88 },
    });
  });

  it("migrates Worship's legacy app-settings key into the current scoped key", async () => {
    const baseKey = "ocs-dock-worship-preferences";
    const legacyKey = "dock-worship-preferences";
    dbMock.getByKey.mockImplementation((_store: string, key: string) => Promise.resolve(
      key === legacyKey
        ? {
            updatedAt: "2026-08-09T00:00:00.000Z",
            lowerThirdQuickThemeSettings: { lowerThirdWidthPreset: "lg" },
          }
        : undefined,
    ));

    const value = await loadDockPreference<Record<string, unknown>>(baseKey, [legacyKey]);

    expect(value).toMatchObject({
      lowerThirdQuickThemeSettings: { lowerThirdWidthPreset: "lg" },
    });
    expect(dbMock.putRecord).toHaveBeenCalledWith(
      "app_settings",
      value,
      `${baseKey}:style-user`,
    );
    expect(readDockPreference<Record<string, unknown>>(baseKey)).toMatchObject({
      lowerThirdQuickThemeSettings: { lowerThirdWidthPreset: "lg" },
    });
  });

  it("mirrors saved picker styles into IndexedDB without breaking old array data", async () => {
    const baseKey = "dtb-bg-picker-local-styles:bible:fullscreen";
    const styles = [{ id: "style-1", name: "Bible Full Screen Style 1" }];

    await saveDockPreferenceList(baseKey, styles);

    expect(JSON.parse(localStorage.getItem(`${baseKey}:style-user`) ?? "{}")).toMatchObject({
      items: styles,
    });
    expect(dbMock.putRecord).toHaveBeenCalledWith(
      "app_settings",
      expect.objectContaining({ items: styles }),
      `${baseKey}:style-user`,
    );

    dbMock.getByKey.mockResolvedValue({ items: styles, updatedAt: "2026-08-09T00:00:00.000Z" });
    await expect(loadDockPreferenceList<typeof styles[number]>(baseKey)).resolves.toEqual(styles);
  });

  it("prefers a newer bare Multiview save over an older scoped copy after auth returns", async () => {
    const baseKey = "dock-mv-saved";
    const oldItems = [{ id: "mv-old", assignments: { slot_1: "Old Scene" }, slotModes: { slot_1: "scene" } }];
    const freshItems = [{ id: "mv-fresh", assignments: { slot_1: "Fresh Scene" }, slotModes: { slot_1: "scene" } }];

    localStorage.setItem(`${baseKey}:style-user`, JSON.stringify({
      items: oldItems,
      updatedAt: "2026-08-08T00:00:00.000Z",
    }));
    localStorage.setItem(baseKey, JSON.stringify({
      items: freshItems,
      updatedAt: "2026-08-09T00:00:00.000Z",
    }));
    dbMock.getByKey.mockResolvedValue(undefined);

    await expect(loadDockPreferenceList<typeof freshItems[number]>(baseKey)).resolves.toEqual(freshItems);
    expect(JSON.parse(localStorage.getItem(`${baseKey}:style-user`) ?? "{}")).toMatchObject({
      items: freshItems,
    });
  });

  it("recovers the latest scoped Multiview saved list when the dock refreshes before auth is ready", async () => {
    const baseKey = "dock-mv-saved";
    const staleItems = [{ id: "mv-old", assignments: { slot_1: "Old Scene" } }];
    const latestItems = [{ id: "mv-new", assignments: { slot_1: "Fresh Scene" }, slotModes: { slot_1: "scene" } }];

    dbMock.getCurrentUserId.mockReturnValue(null);
    localStorage.setItem(`${baseKey}:old-user`, JSON.stringify({
      items: staleItems,
      updatedAt: "2026-08-08T00:00:00.000Z",
    }));
    localStorage.setItem(`${baseKey}:style-user`, JSON.stringify({
      items: latestItems,
      updatedAt: "2026-08-09T00:00:00.000Z",
    }));
    dbMock.getByKey.mockResolvedValue(undefined);

    await expect(loadDockPreferenceList<typeof latestItems[number]>(baseKey)).resolves.toEqual(latestItems);
    expect(JSON.parse(localStorage.getItem(baseKey) ?? "{}")).toMatchObject({
      items: latestItems,
    });
  });
});
