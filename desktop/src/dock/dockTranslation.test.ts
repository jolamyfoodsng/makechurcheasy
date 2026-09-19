import { describe, expect, it } from "vitest";
import {
  getOrderedTranslationParts,
  getDockTranslationSourceSignature,
  normalizeDockTranslationOrder,
} from "./dockTranslation";

describe("dock translation ordering", () => {
  it("keeps the original above the translation by default", () => {
    expect(getOrderedTranslationParts("Original", "Translated", true)).toEqual([
      { kind: "original", text: "Original" },
      { kind: "translation", text: "Translated" },
    ]);
  });

  it("puts the translation first when selected", () => {
    expect(getOrderedTranslationParts("Original", "Translated", true, "translation-first")).toEqual([
      { kind: "translation", text: "Translated" },
      { kind: "original", text: "Original" },
    ]);
  });

  it("shows only the translated text when the original is hidden", () => {
    expect(getOrderedTranslationParts("Original", "Translated", false, "translation-first")).toEqual([
      { kind: "translation", text: "Translated" },
    ]);
  });

  it("falls back to original-first for older saved translation state", () => {
    expect(normalizeDockTranslationOrder(undefined)).toBe("original-first");
    expect(normalizeDockTranslationOrder("unexpected")).toBe("original-first");
  });

  it("creates a stable source signature for a translated set of sections", () => {
    expect(getDockTranslationSourceSignature([
      { id: "slide-1", text: "First" },
      { id: "slide-2", text: "Second" },
    ])).toBe("slide-1:First\u001fslide-2:Second");
  });
});
