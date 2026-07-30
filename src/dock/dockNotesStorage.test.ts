import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendTextToDockNotes,
  loadDockNotes,
  resolveDockNotesPresentationSettings,
  saveDockNotesPreferences,
} from "./dockNotesStorage";
import type { DockFullscreenQuickThemeSettings } from "./components/DockFullscreenThemeQuickSettings";

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

  it("creates visible note cards from LM saves instead of hiding them in an old daily note", () => {
    const first = appendTextToDockNotes("First saved line");
    const second = appendTextToDockNotes("Second saved line");

    expect(first?.note.title).toContain("First saved line");
    expect(second?.note.title).toContain("Second saved line");

    const notes = loadDockNotes();
    expect(notes).toHaveLength(2);
    expect(notes[0].content).toBe("Second saved line");
    expect(notes[1].content).toBe("First saved line");
  });

  it("moves an explicitly appended note to the top after updating it", () => {
    appendTextToDockNotes("Original first", "Shared Note");
    appendTextToDockNotes("Other note", "Other Note");
    appendTextToDockNotes("New content", "Shared Note");

    const notes = loadDockNotes();
    expect(notes).toHaveLength(2);
    expect(notes[0].title).toBe("Shared Note");
    expect(notes[0].content).toContain("Original first");
    expect(notes[0].content).toContain("New content");
  });

  it("does not duplicate the same relayed LM note command", () => {
    appendTextToDockNotes("Relayed line", "Relayed Note", { sourceId: "lm-command-1" });
    appendTextToDockNotes("Relayed line", "Relayed Note", { sourceId: "lm-command-1" });

    const notes = loadDockNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Relayed Note");
    expect(notes[0].content).toBe("Relayed line");
    expect(notes[0].sourceId).toBe("lm-command-1");
  });

  it("resolves Notes lower-third quick pattern settings into the final overlay theme", async () => {
    const quickSettings: DockFullscreenQuickThemeSettings = {
      fontSize: 42,
      fontFamily: "Inter, system-ui, sans-serif",
      refFontSize: 18,
      refFontWeight: "normal",
      fontColor: "#ffffff",
      refFontColor: "#ffffff",
      refPosition: "bottom",
      refTextTransform: "none",
      refLetterSpacing: 0,
      refOpacity: 1,
      refTextAlign: "match",
      refSpacing: 16,
      fullscreenShadeColor: "#000000",
      fullscreenShadeOpacity: 0.42,
      textAlign: "center",
      lineHeight: 1.32,
      fontWeight: "bold",
      fontStyle: "normal",
      textTransform: "none",
      textShadow: "none",
      animation: "fade",
      animationDuration: 300,
      backgroundImage: "",
      backgroundImageFilePath: "",
      backgroundPattern: "diagonal-lines",
      backgroundVideo: "",
      backgroundVideoFilePath: "",
      backgroundOpacity: 1,
      backgroundColor: "",
      backgroundColorEnd: "",
      bgGradientAngle: 180,
      referenceBackgroundEnabled: false,
      referenceBackgroundColor: "#ffffff",
      referenceBackgroundStyle: "solid",
      referenceBackgroundRadius: 12,
      lowerThirdPosition: "left",
      lowerThirdSize: "medium",
      lowerThirdWidthPreset: "md",
      lowerThirdOffsetX: 0,
      lowerThirdCaptionPosition: "bottom",
      compareTranslationWidth: 40,
      compareTranslationGap: 40,
      backgroundType: "pattern",
    };

    saveDockNotesPreferences({
      overlayMode: "lower-third",
      lowerThirdQuickSettings: quickSettings,
    });

    const settings = await resolveDockNotesPresentationSettings("lower-third");

    expect(settings.overlayMode).toBe("lower-third");
    expect(settings.themeSettings?.backgroundPattern).toBe("diagonal-lines");
    expect(settings.themeSettings?.backgroundColor).toBe("transparent");
    expect(settings.themeSettings?.boxBackground).toBeTruthy();
  });
});
