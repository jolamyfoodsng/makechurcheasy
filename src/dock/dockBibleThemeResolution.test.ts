import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";
import { LOWER_THIRD_SIZE_PRESETS } from "../bible/types";
import { themeSupportsBibleOverlayMode } from "../bible/themeVariantSupport";
import {
  DOCK_BIBLE_PREFS_KEY,
  resolveDockBibleReferenceLabels,
  resolveDockBibleThemeForOverlayMode,
} from "./dockBibleThemeResolution";

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

function installStorage(userId = "theme-user"): Storage {
  const storage = createMemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    location: { pathname: "/dock.html" },
  });
  storage.setItem("mce-auth-session", JSON.stringify({
    expiresAt: Date.now() + 60_000,
    user: { id: userId },
  }));
  return storage;
}

function firstThemeFor(mode: "fullscreen" | "lower-third") {
  const theme = BUILTIN_THEMES.find((item) => themeSupportsBibleOverlayMode(item, mode));
  if (!theme) throw new Error(`No built-in ${mode} theme found`);
  return theme;
}

describe("dock Bible theme resolution", () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the user-scoped saved fullscreen stream style and resolves full theme settings", async () => {
    const theme = firstThemeFor("fullscreen");
    localStorage.setItem(`${DOCK_BIBLE_PREFS_KEY}:theme-user`, JSON.stringify({
      fullscreenThemeId: theme.id,
      backgroundPreset: "dark",
      fullscreenQuickThemeSettings: {
        fontSize: 74,
        autoFontScale: true,
        fontFamily: "'Georgia', serif",
        fontColor: "#ffeeaa",
        refFontColor: "#aabbcc",
        animation: "none",
        backgroundType: "theme",
      },
    }));

    const resolved = await resolveDockBibleThemeForOverlayMode("fullscreen");

    expect(resolved.themeId).toBe(theme.id);
    expect(resolved.themeSettings.fontSize).toBe(74);
    expect(resolved.themeSettings.autoFontScale).toBe(true);
    expect(resolved.themeSettings.fontFamily).toContain("Georgia");
    expect(resolved.themeSettings.fontColor).toBe("#FFEEAA");
    expect(resolved.themeSettings.refFontColor).toBe("#AABBCC");
    expect(resolved.themeSettings.animation).toBe("none");
    expect(resolved.liveOverrides?.backgroundColor).toBe("#060812");
  });

  it("resolves lower-third quick settings into the same complete payload OBS expects", async () => {
    const theme = firstThemeFor("lower-third");
    localStorage.setItem(`${DOCK_BIBLE_PREFS_KEY}:theme-user`, JSON.stringify({
      lowerThirdThemeId: theme.id,
      lowerThirdQuickThemeSettings: {
        fontSize: 44,
        refFontSize: 18,
        lowerThirdSize: "biggest",
        backgroundType: "color",
        backgroundColor: "#102030",
        fontColor: "#ffffff",
      },
    }));

    const resolved = await resolveDockBibleThemeForOverlayMode("lower-third");

    expect(resolved.themeId).toBe(theme.id);
    expect(resolved.themeSettings.fontSize).toBe(44);
    expect(resolved.themeSettings.refFontSize).toBe(18);
    expect(resolved.themeSettings.lowerThirdSize).toBe("biggest");
    expect(resolved.themeSettings.backgroundColor).toBe("#102030");
    expect(resolved.themeSettings.padding).toBe(LOWER_THIRD_SIZE_PRESETS.biggest.padding);
    expect(resolved.themeSettings.safeArea).toBe(LOWER_THIRD_SIZE_PRESETS.biggest.safeArea);
    expect(resolved.themeSettings.lowerThirdBarMaxHeight).toBe(LOWER_THIRD_SIZE_PRESETS.biggest.maxHeight);
    expect(resolved.liveOverrides).toBeNull();
  });

  it("uses the saved Bible reference display rules for LM-pushed verses", () => {
    localStorage.setItem(`${DOCK_BIBLE_PREFS_KEY}:theme-user`, JSON.stringify({
      referenceFormat: "short",
      referenceVersionVisible: false,
    }));

    expect(resolveDockBibleReferenceLabels("1 Corinthians", 3, "10", "KJV")).toEqual({
      rawReferenceLabel: "1 Corinthians 3:10",
      referenceBaseLabel: "ICOR 3:10",
      displayReferenceLabel: "ICOR 3:10",
    });
  });
});
