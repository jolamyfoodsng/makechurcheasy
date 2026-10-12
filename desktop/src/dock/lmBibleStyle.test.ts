import { describe, expect, it } from "vitest";
import {
  pickNewestLiveBibleSnapshot,
  resolveLmEffectiveOverlayMode,
  resolveLmReferencePrefs,
  resolveLmVerseLineCount,
} from "./lmBibleStyle";

describe("LM follows the Bible tab's style", () => {
  it("uses the Bible tab's live mode while following, LM's own button otherwise", () => {
    expect(resolveLmEffectiveOverlayMode({
      follow: true,
      lmMode: "fullscreen",
      hints: { overlayMode: "lower-third" },
    })).toBe("lower-third");
    expect(resolveLmEffectiveOverlayMode({
      follow: false,
      lmMode: "fullscreen",
      hints: { overlayMode: "lower-third" },
    })).toBe("fullscreen");
  });

  it("falls back to the saved Bible preferences, then to LM's own mode", () => {
    expect(resolveLmEffectiveOverlayMode({
      follow: true,
      lmMode: "fullscreen",
      hints: null,
      prefs: { overlayMode: "lower-third" },
    })).toBe("lower-third");
    expect(resolveLmEffectiveOverlayMode({
      follow: true,
      lmMode: "fullscreen",
      hints: { overlayMode: "nonsense" },
      prefs: {},
    })).toBe("fullscreen");
  });

  it("reads the verse line count for the mode being projected", () => {
    const hints = { fullscreenLineCount: 3, lowerThirdLineCount: 1 };
    expect(resolveLmVerseLineCount("fullscreen", hints, {})).toBe(3);
    expect(resolveLmVerseLineCount("lower-third", hints, {})).toBe(1);
    expect(resolveLmVerseLineCount("lower-third", null, { lowerThirdVerseLineCount: 2 })).toBe(2);
    // Older prefs only kept one count, for whichever mode was active.
    expect(resolveLmVerseLineCount("fullscreen", null, { overlayMode: "fullscreen", verseLineCount: 4 })).toBe(4);
    expect(resolveLmVerseLineCount("lower-third", null, { overlayMode: "fullscreen", verseLineCount: 4 })).toBeUndefined();
  });

  it("prefers the live reference settings over the saved ones", () => {
    expect(resolveLmReferencePrefs(
      { referenceFormat: "short", referenceVersionVisible: false },
      { referenceFormat: "full", referenceVersionVisible: true },
    )).toEqual({ referenceFormat: "short", referenceVersionVisible: false });
    expect(resolveLmReferencePrefs(null, { referenceFormat: "hidden" }))
      .toEqual({ referenceFormat: "hidden", referenceVersionVisible: undefined });
  });

  it("keeps the newer of two snapshots", () => {
    const older = { updatedAt: 10, id: "old" };
    const newer = { updatedAt: 20, id: "new" };
    expect(pickNewestLiveBibleSnapshot(older, newer)).toBe(newer);
    expect(pickNewestLiveBibleSnapshot(newer, older)).toBe(newer);
    expect(pickNewestLiveBibleSnapshot(null, older)).toBe(older);
    expect(pickNewestLiveBibleSnapshot(older, null)).toBe(older);
    expect(pickNewestLiveBibleSnapshot(null, null)).toBeNull();
  });
});
