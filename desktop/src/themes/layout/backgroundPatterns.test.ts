import { describe, expect, it } from "vitest";
import {
  PATTERN_GLOW_LAYER_ID,
  PATTERN_KINDS,
  PATTERN_LAYER_ID,
  patternCss,
  patternKindFor,
  withAnimatedBackground,
} from "./backgroundPatterns";
import { LAYOUT_PRESET_THEMES, STARTER_THEMES } from "./presetThemes";
import type { ThemeLayout } from "./types";

const none = { preset: "none" as const, duration: 0, delay: 0, easing: "out-cubic" as const };
const fsLayout = (fill: string): ThemeLayout => ({
  version: 1,
  format: "fullscreen",
  swap: "content",
  layers: [
    { id: "bg", name: "Background", type: "box", anchor: "top-left", x: 0, y: 0, w: 1920, h: 1080, style: { fill }, in: none, out: none },
    { id: "verse", name: "Verse", type: "text", anchor: "top-left", x: 100, y: 100, w: 1000, h: 500, content: "{text}", style: {}, in: none, out: none },
  ],
});

describe("withAnimatedBackground", () => {
  it("adds the moving pattern and glow right above the background", () => {
    const out = withAnimatedBackground(fsLayout("#123456"), "t1");
    expect(out.layers.map((l) => l.id)).toEqual(["bg", PATTERN_LAYER_ID, PATTERN_GLOW_LAYER_ID, "verse"]);
    expect(out.layers[1].loop?.preset).toBe("drift");
    expect(out.layers[2].loop?.preset).toBe("pulse");
  });

  it("is safe to call twice and leaves lower thirds alone", () => {
    const once = withAnimatedBackground(fsLayout("#123456"), "t1");
    expect(withAnimatedBackground(once, "t1")).toBe(once);
    const lt: ThemeLayout = { ...fsLayout("#123456"), format: "lower-third" };
    expect(withAnimatedBackground(lt, "t1")).toBe(lt);
  });

  it("uses a dark tint on light backgrounds and a white tint on dark ones", () => {
    const dark = withAnimatedBackground(fsLayout("#101020"), "t1").layers[1].style.fill!;
    const light = withAnimatedBackground(fsLayout("#f4f1ea"), "t1").layers[1].style.fill!;
    expect(dark).toContain("rgba(255,255,255");
    expect(light).toContain("rgba(20,20,40");
  });

  it("picks a stable pattern per theme and every pattern has CSS", () => {
    expect(patternKindFor("starter-violet-praise")).toBe(patternKindFor("starter-violet-praise"));
    for (const kind of PATTERN_KINDS) expect(patternCss(kind, [255, 255, 255], 0.07).length).toBeGreaterThan(20);
  });
});

describe("built-in full screens", () => {
  it("every starter's full screen moves", () => {
    for (const t of STARTER_THEMES) {
      const layout = t.variants!.fullscreen!.settings.layout!;
      expect(layout.layers.some((l) => l.id === PATTERN_LAYER_ID)).toBe(true);
    }
  });

  it("most built-in full screens move, none ever gets two patterns", () => {
    let moving = 0;
    for (const t of LAYOUT_PRESET_THEMES) {
      const layers = t.variants!.fullscreen!.settings.layout!.layers;
      const n = layers.filter((l) => l.id === PATTERN_LAYER_ID).length;
      expect(n).toBeLessThanOrEqual(1);
      moving += n;
    }
    expect(moving).toBeGreaterThanOrEqual(Math.ceil(LAYOUT_PRESET_THEMES.length * 0.8));
  });
});
