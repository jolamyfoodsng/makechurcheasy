import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  local: null as Record<string, unknown> | null,
  durable: null as Record<string, unknown> | null,
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
  readUserScopedStorage: vi.fn(() => null),
  writeUserScopedStorage: vi.fn(),
}));

import {
  hydrateDockOutputTypographyPreferences,
  loadDockOutputFontFamily,
  loadDockOutputFontScale,
  saveDockOutputFontFamily,
  saveDockOutputFontScale,
} from "./dockOutputTypography";

describe("dock OBS output typography persistence", () => {
  beforeEach(() => {
    storage.local = null;
    storage.durable = null;
  });

  it("keeps the selected output size in the durable preference record", async () => {
    saveDockOutputFontScale(1.25);
    await Promise.resolve();

    expect(loadDockOutputFontScale()).toBe(1.25);
    expect(storage.durable).toMatchObject({ fontScale: 1.25 });
  });

  it("keeps the selected OBS font family in the durable preference record", async () => {
    const oswald = '"Oswald", "Arial Narrow", sans-serif';
    saveDockOutputFontFamily(oswald);
    await Promise.resolve();

    expect(loadDockOutputFontFamily()).toBe(oswald);
    expect(storage.durable).toMatchObject({ fontFamily: oswald });
  });

  it("hydrates the saved output size after a fresh Dock bootstrap", async () => {
    storage.durable = {
      fontFamily: '"Inter", "Segoe UI", sans-serif',
      fontScale: 0.8,
      updatedAt: "2026-08-14T00:00:00.000Z",
    };

    const preferences = await hydrateDockOutputTypographyPreferences();

    expect(preferences.fontFamily).toBe('"Inter", "Segoe UI", sans-serif');
    expect(loadDockOutputFontFamily()).toBe('"Inter", "Segoe UI", sans-serif');
    expect(preferences.fontScale).toBe(0.8);
    expect(loadDockOutputFontScale()).toBe(0.8);
  });
});
