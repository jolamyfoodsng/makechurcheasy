import { describe, expect, it } from "vitest";
import type { BibleThemeSettings } from "../bible/types";
import { DEFAULT_TEXT_LOOK, isDefaultTextLook, nextTextAlign, SHADOW_ON_CSS, TEXT_BACKGROUNDS, textBackgroundPreset, withTextLook } from "./textLook";

const CLASSIC = { fontColor: "#ffffff", textShadow: "4px 5px 2px rgba(0,0,0,.9)", textAlign: "center" } as unknown as BibleThemeSettings;
const LAYERED = {
  ...CLASSIC,
  layout: {
    version: 1,
    format: "fullscreen",
    layers: [
      { id: "ref", type: "text", content: "{reference}", x: 0, y: 0, w: 1, h: "auto", anchor: "top-left", style: { fontSize: 60, color: "#facc15" } },
      { id: "verse", type: "text", content: "{text}", x: 0, y: 0, w: 1, h: 500, anchor: "top-left", style: { fontSize: 80, color: "#fff" } },
    ],
  },
} as unknown as BibleThemeSettings;

describe("studio text look", () => {
  it("leaves the theme alone by default", () => {
    expect(isDefaultTextLook(DEFAULT_TEXT_LOOK)).toBe(true);
    expect(withTextLook(CLASSIC, DEFAULT_TEXT_LOOK)).toBe(CLASSIC);
  });

  it("sets colour, shadow and alignment on a classic theme", () => {
    const out = withTextLook(CLASSIC, { ...DEFAULT_TEXT_LOOK, color: "#ffd166", shadow: "on", align: "left" }) as unknown as Record<string, unknown>;
    expect(out.fontColor).toBe("#ffd166");
    expect(out.textShadow).toBe(SHADOW_ON_CSS);
    expect(out.textAlign).toBe("left");
    expect(withTextLook(CLASSIC, { ...DEFAULT_TEXT_LOOK, shadow: "off" }).textShadow).toBe("none");
  });

  it("changes only the words of a layer theme, not the reference", () => {
    const out = withTextLook(LAYERED, { ...DEFAULT_TEXT_LOOK, color: "#00ff00", align: "right" });
    const [ref, verse] = out.layout!.layers;
    expect(ref.style.color).toBe("#facc15");
    expect(verse.style.color).toBe("#00ff00");
    expect(verse.style.align).toBe("right");
  });

  it("turns a background preset into the Dock's background fields", () => {
    const out = withTextLook(CLASSIC, { ...DEFAULT_TEXT_LOOK, background: "black" }) as unknown as Record<string, unknown>;
    expect(out.backgroundType).toBe("color");
    expect(out.backgroundColor).toBe("#000000");
    expect(out.backgroundColorEnd).toBe("");
    const gradient = withTextLook(CLASSIC, { ...DEFAULT_TEXT_LOOK, background: "midnight" }) as unknown as Record<string, unknown>;
    expect(gradient.backgroundColorEnd).toBe("#1d3a85");
    expect(textBackgroundPreset("theme")).toBeNull();
    expect(TEXT_BACKGROUNDS[0].id).toBe("theme");
  });

  it("cycles the alignment", () => {
    expect(["theme", "left", "center", "right"].map((a) => nextTextAlign(a as never))).toEqual(["left", "center", "right", "theme"]);
  });
});
