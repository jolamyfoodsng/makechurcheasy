import { describe, expect, it } from "vitest";
import { isVerseTextPattern } from "./content";
import { headingLayers } from "./heading";
import { SET3_PRESETS } from "./presetsSet3";
import { LAYOUT_PRESET_THEMES } from "./presetThemes";
import type { ThemeLayout } from "./types";

function check(l: ThemeLayout, format: ThemeLayout["format"]) {
  expect(l.format).toBe(format);
  const ids = l.layers.map((x) => x.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const x of l.layers) {
    if (x.parentId) expect(ids.indexOf(x.parentId) > -1 && ids.indexOf(x.parentId) < ids.indexOf(x.id)).toBe(true);
  }
  expect(l.layers.filter((x) => x.type === "text" && isVerseTextPattern(x.content)).length).toBe(1);
}

describe("third reference set (Confetti Frame)", () => {
  it("has a lower third and a hand-made full screen", () => {
    expect(SET3_PRESETS.length).toBe(1);
    for (const p of SET3_PRESETS) {
      check(p.layout, "lower-third");
      check(p.companion, "fullscreen");
    }
  });

  it("hides pill, rule, reference and translation together", () => {
    for (const p of SET3_PRESETS) {
      for (const l of [p.layout, p.companion]) {
        const h = headingLayers(l);
        expect([...h.text].sort()).toEqual(["reference", "translation", "verses"]);
        expect([...h.decor].sort()).toEqual(["rule-1", "rule-2", "rule-3", "rule-4"]);
      }
    }
  });

  it("brings its own flecks so no moving pattern is added behind the card", () => {
    const fsl = SET3_PRESETS[0].companion.layers.map((x) => x.id);
    expect(fsl.filter((id) => id === "mce-pattern").length).toBe(1);
    expect(fsl.includes("mce-pattern-glow")).toBe(false);
  });

  it("is registered as a built-in with both variants", () => {
    const t = LAYOUT_PRESET_THEMES.find((x) => x.id === "preset-confetti-frame");
    expect(t).toBeTruthy();
    expect(t!.enabledVariants).toEqual(expect.arrayContaining(["fullscreen", "lower-third"]));
  });
});
