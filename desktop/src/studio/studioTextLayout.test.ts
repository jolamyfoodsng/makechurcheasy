import { describe, expect, it } from "vitest";
import { applyTranslation, chunkLines, clampLines, noteLinesOf, reflowSlides, translationFits, translationSections } from "./studioTextLayout";
import type { StudioSlide } from "./studioEngine";
import { getDockTranslationSourceSignature } from "../dock/dockTranslation";
import type { DockTranslationValue } from "../dock/components/DockTranslationControls";

const slide = (key: string, text: string): StudioSlide => ({
  key, module: "worship", label: "Verse 1", text, reference: "", itemTitle: "Song",
  origin: { kind: "song", id: "s1", index: 0 },
});

describe("lines per slide", () => {
  it("clamps to Original (0) or 1-6", () => {
    expect(clampLines(0)).toBe(0);
    expect(clampLines(-3)).toBe(0);
    expect(clampLines("x")).toBe(0);
    expect(clampLines(3.9)).toBe(3);
    expect(clampLines(99)).toBe(6);
  });

  it("cuts text into pieces and leaves short text alone", () => {
    expect(chunkLines("a\nb\nc\nd\ne", 2)).toEqual(["a\nb", "c\nd", "e"]);
    expect(chunkLines("a\nb", 4)).toEqual(["a\nb"]);
    expect(chunkLines("a\nb\nc", 0)).toEqual(["a\nb\nc"]);
  });

  it("re-splits long slides, keeps origin, never merges short ones", () => {
    const out = reflowSlides([slide("k1", "1\n2\n3\n4\n5"), slide("k2", "x")], 2);
    expect(out.map((s) => s.text)).toEqual(["1\n2", "3\n4", "5", "x"]);
    expect(out.map((s) => s.key)).toEqual(["k1", "k1~2", "k1~3", "k2"]);
    expect(out[1].origin?.index).toBe(0);
    expect(out[1].label).toBe("Verse 1 · 2");
    expect(reflowSlides([slide("k1", "1\n2\n3")], 0)).toHaveLength(1);
  });

  it("reads a note's own setting (shared with the Dock)", () => {
    expect(noteLinesOf({ autoSplit: false, linesPerSlide: 3 })).toBe(0);
    expect(noteLinesOf({ autoSplit: true, linesPerSlide: 3 })).toBe(3);
    expect(noteLinesOf({ autoSplit: true })).toBe(4);
    expect(noteLinesOf(null)).toBe(0);
  });
});

describe("translation", () => {
  const slides = [slide("a", "Hello"), slide("b", "World")];
  const value = (patch: Partial<DockTranslationValue> = {}): DockTranslationValue => ({
    targetLanguage: "yo", targetLanguageLabel: "Yoruba", showBoth: true, translationOrder: "original-first",
    translatedSections: { a: "Pele", b: "Aye" },
    sourceSignature: getDockTranslationSourceSignature(translationSections(slides)),
    ...patch,
  });

  it("shows original then translation, or the reverse, or only the translation", () => {
    expect(applyTranslation(slides, value()).map((s) => s.text)).toEqual(["Hello\n\nPele", "World\n\nAye"]);
    expect(applyTranslation(slides, value({ translationOrder: "translation-first" }))[0].text).toBe("Pele\n\nHello");
    expect(applyTranslation(slides, value({ showBoth: false })).map((s) => s.text)).toEqual(["Pele", "Aye"]);
  });

  it("ignores a translation made for different slides", () => {
    const stale = value({ sourceSignature: "old" });
    expect(translationFits(stale, slides)).toBe(false);
    expect(applyTranslation(slides, stale)).toBe(slides);
    expect(applyTranslation(slides, null)).toBe(slides);
  });
});
