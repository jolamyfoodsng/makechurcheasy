import { describe, expect, it } from "vitest";
import { resolveInitialCompareSlots } from "./DockBibleCompareVersesModal";
import type { BibleTranslationOption } from "../bibleTranslationAvailability";

describe("DockBibleCompareVersesModal - resolveInitialCompareSlots", () => {
  const threeInstalled: BibleTranslationOption[] = [
    { value: "KJV", label: "King James Version" },
    { value: "NLT", label: "New Living Translation" },
    { value: "AMP", label: "Amplified Bible" },
  ];

  it("pre-populates the first 3 installed translations with activeTranslation first", () => {
    const slots = resolveInitialCompareSlots(threeInstalled, "KJV", "NLT");
    expect(slots).toEqual(["KJV", "NLT", "AMP"]);
  });

  it("sets slot 0 to activeTranslation and slot 1 to secondaryTranslation when distinct", () => {
    const slots = resolveInitialCompareSlots(threeInstalled, "AMP", "KJV");
    expect(slots[0]).toBe("AMP");
    expect(slots[1]).toBe("KJV");
    expect(slots[2]).toBe("NLT");
  });

  it("picks distinct translations even if secondaryTranslation is not specified", () => {
    const slots = resolveInitialCompareSlots(threeInstalled, "KJV", undefined);
    expect(slots[0]).toBe("KJV");
    expect(slots[1]).toBe("NLT");
    expect(slots[2]).toBe("AMP");
  });

  it("handles 2 installed translations cleanly without crashing", () => {
    const twoInstalled: BibleTranslationOption[] = [
      { value: "KJV", label: "King James Version" },
      { value: "NLT", label: "New Living Translation" },
    ];
    const slots = resolveInitialCompareSlots(twoInstalled, "KJV", "NLT");
    expect(slots[0]).toBe("KJV");
    expect(slots[1]).toBe("NLT");
    // Slot 2 falls back to next available or active
    expect(slots[2]).toBe("NLT");
  });

  it("handles single installed translation cleanly", () => {
    const singleInstalled: BibleTranslationOption[] = [
      { value: "KJV", label: "King James Version" },
    ];
    const slots = resolveInitialCompareSlots(singleInstalled, "KJV", undefined);
    expect(slots).toEqual(["KJV", "KJV", "KJV"]);
  });

  it("normalizes case and handles uninstalled active translation gracefully", () => {
    const slots = resolveInitialCompareSlots(threeInstalled, "nonexistent", "nlt");
    expect(slots[0]).toBe("KJV"); // falls back to first installed
    expect(slots[1]).toBe("NLT");
    expect(slots[2]).toBe("AMP");
  });
});
