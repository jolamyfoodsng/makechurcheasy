import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveDockNotesPresentationSettings,
  saveDockNotesPreferences,
} from "./dockNotesStorage";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
  };
}

describe("dock notes presentation settings", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("can force the caller-selected overlay mode over saved Notes preferences", async () => {
    saveDockNotesPreferences({ overlayMode: "lower-third" });

    const settings = await resolveDockNotesPresentationSettings("fullscreen", {
      forceOverlayMode: true,
    });

    expect(settings.overlayMode).toBe("fullscreen");
  });

  it("keeps saved Notes preferences when the caller does not force the mode", async () => {
    saveDockNotesPreferences({ overlayMode: "lower-third" });

    const settings = await resolveDockNotesPresentationSettings("fullscreen");

    expect(settings.overlayMode).toBe("lower-third");
  });
});
