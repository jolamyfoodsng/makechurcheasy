import { describe, expect, it } from "vitest";
import { bibleSlides, noteSlides, previewFrameUrl, programFrameUrl, themeSettingsForMode, withoutAnimation } from "./studioEngine";
import { DEFAULT_THEME_SETTINGS, type BibleTheme } from "../bible/types";

describe("studio slides", () => {
  it("makes one Bible slide per verse with a full reference", () => {
    const s = bibleSlides("John", 3, "KJV", [{ verse: 16, text: "For God so loved" }, { verse: 17, text: "For God sent" }]);
    expect(s.length).toBe(2);
    expect(s[0].reference).toBe("John 3:16 (KJV)");
    expect(s[0].label).toBe("16");
    expect(s[1].module).toBe("bible");
  });

  it("splits notes on blank lines", () => {
    const s = noteSlides("n1", "Sermon", "Point one\nline two\n\n\nPoint two\n\n  ");
    expect(s.length).toBe(2);
    expect(s[1].text).toBe("Point two");
    expect(s[0].module).toBe("notes");
  });
});

describe("studio frames", () => {
  it("preview ignores the relay and carries its packet in the hash", () => {
    const url = previewFrameUrl("http://127.0.0.1:45678", { module: "worship", data: { slide: null }, css: "" }, "worship");
    expect(url.startsWith("http://127.0.0.1:45678/mce-worship-overlay.html?")).toBe(true);
    expect(url.includes("mceRelay=0")).toBe(true);
    expect(url.includes("mceSource=studio-preview-worship")).toBe(true);
    expect(url.includes("#data=")).toBe(true);
  });

  it("program is the output page in monitor mode", () => {
    expect(programFrameUrl("http://x")).toBe("http://x/studio-output.html?monitor=1");
  });
});

describe("studio themes", () => {
  const layout = { version: 1 as const, format: "fullscreen" as const, layers: [{ id: "a", name: "a", type: "box" as const, anchor: "top-left" as const, x: 0, y: 0, w: 1, h: 1, style: {}, in: { preset: "fade" as const, duration: 400, delay: 0, easing: "out-expo" as const }, out: { preset: "fade" as const, duration: 300, delay: 0, easing: "out-expo" as const } }] };

  it("Cut removes classic and layer animations", () => {
    const cut = withoutAnimation({ ...DEFAULT_THEME_SETTINGS, layout });
    expect(cut.animation).toBe("none");
    expect(cut.layout?.layers[0].in.preset).toBe("none");
    expect(cut.layout?.layers[0].out.preset).toBe("none");
  });

  it("picks the look for the mode", () => {
    const fs = { ...DEFAULT_THEME_SETTINGS, fontSize: 70 };
    const lt = { ...DEFAULT_THEME_SETTINGS, fontSize: 30 };
    const theme = { id: "t", name: "t", templateType: "fullscreen", settings: fs, variants: { fullscreen: { settings: fs }, lowerThird: { settings: lt } } } as unknown as BibleTheme;
    expect(themeSettingsForMode(theme, "lower-third")?.fontSize).toBe(30);
    expect(themeSettingsForMode(theme, "fullscreen")?.fontSize).toBe(70);
  });
});
