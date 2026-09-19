import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  local: null as Record<string, unknown> | null,
  durable: null as Record<string, unknown> | null,
  legacy: new Map<string, string>(),
}));

vi.mock("../services/dockPreferenceStorage", () => ({
  loadDockPreference: vi.fn(async () => storage.durable),
  readDockPreference: vi.fn(() => storage.local),
  saveDockPreference: vi.fn(async (_key: string, value: Record<string, unknown>) => {
    storage.durable = value;
    return value;
  }),
  writeDockPreference: vi.fn((_key: string, value: Record<string, unknown>) => {
    storage.local = value;
  }),
}));

vi.mock("../services/userScopedStorage", () => ({
  readUserScopedStorage: vi.fn((key: string) => storage.legacy.get(key) ?? null),
  writeUserScopedStorage: vi.fn((key: string, value: string) => {
    storage.legacy.set(key, value);
  }),
}));

import {
  DOCK_FONT_FAMILY_OPTIONS,
  DEFAULT_DOCK_FONT_SCALE,
  hydrateDockTypographyPreferences,
  loadDockFontFamily,
  loadDockFontScale,
  saveDockFontFamily,
  saveDockFontScale,
} from "./dockFontFamily";

describe("dock font preference persistence", () => {
  beforeEach(() => {
    storage.local = null;
    storage.durable = null;
    storage.legacy.clear();
  });

  it("keeps the selected family and size in the structured durable record", async () => {
    const inter = DOCK_FONT_FAMILY_OPTIONS.find((option) => option.id === "inter")?.family;
    expect(inter).toBeTruthy();

    saveDockFontFamily(inter ?? "");
    saveDockFontScale(1.25);
    await Promise.resolve();

    expect(loadDockFontFamily()).toBe(inter);
    expect(loadDockFontScale()).toBe(1.25);
    expect(storage.durable).toMatchObject({
      fontFamily: inter,
      fontScale: 1.25,
    });
  });

  it("hydrates the durable choice after a fresh Dock bootstrap", async () => {
    const oswald = DOCK_FONT_FAMILY_OPTIONS.find((option) => option.id === "oswald")?.family;
    storage.durable = {
      fontFamily: oswald,
      fontScale: 1.1,
      updatedAt: "2026-08-11T00:00:00.000Z",
    };

    const preferences = await hydrateDockTypographyPreferences();

    expect(preferences.fontFamily).toBe(oswald);
    expect(preferences.fontScale).toBe(1.1);
    expect(loadDockFontFamily()).toBe(oswald);
    expect(loadDockFontScale()).toBe(1.1);
  });

  it("preserves an explicit source-default reset", () => {
    const inter = DOCK_FONT_FAMILY_OPTIONS.find((option) => option.id === "inter")?.family ?? "";
    saveDockFontFamily(inter);
    saveDockFontFamily("");

    expect(loadDockFontFamily()).toBe("");
    expect(loadDockFontScale()).toBe(DEFAULT_DOCK_FONT_SCALE);
  });
});
