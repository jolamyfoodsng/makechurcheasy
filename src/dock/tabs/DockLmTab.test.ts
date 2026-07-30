import { describe, expect, it } from "vitest";
import {
  getLmCandidateKey,
  isLmAutoPushSuppressed,
  mergeRetainedLmQueue,
  normalizeLmOverlayMode,
} from "./DockLmTab";
import dockLmTabSource from "./DockLmTab.tsx?raw";
import type { VoiceBibleCandidate } from "../../services/voiceBibleTypes";

function candidate(book: string, chapter: number, verse: number): VoiceBibleCandidate {
  return {
    book,
    chapter,
    verse,
    translation: "KJV",
    label: `${book} ${chapter}:${verse}`,
    snippet: "Verse text",
    confidence: 0.95,
    source: "keyword",
  };
}

describe("DockLmTab settings helpers", () => {
  it("normalizes overlay mode values", () => {
    expect(normalizeLmOverlayMode("lower-third")).toBe("lower-third");
    expect(normalizeLmOverlayMode("fullscreen")).toBe("fullscreen");
    expect(normalizeLmOverlayMode("bad-mode", "lower-third")).toBe("lower-third");
  });

  it("suppresses repeated auto-pushes only inside the configured window", () => {
    expect(isLmAutoPushSuppressed(undefined, 10_000, 15)).toBe(false);
    expect(isLmAutoPushSuppressed(1_000, 10_000, 15)).toBe(true);
    expect(isLmAutoPushSuppressed(1_000, 20_000, 15)).toBe(false);
    expect(isLmAutoPushSuppressed(1_000, 10_000, 0)).toBe(false);
  });

  it("uses compact Full/LT mode labels", () => {
    expect(dockLmTabSource).toContain('label: "Full"');
    expect(dockLmTabSource).toContain('label: "LT"');
    expect(dockLmTabSource).not.toContain('label: t("dock.bottomToolbar.fullLabel", "FULL")');
    expect(dockLmTabSource).not.toContain('label: t("dock.bottomToolbar.ltLabel", "LT")');
    expect(dockLmTabSource).toContain("ariaLabel: t(\"lm.fullscreen\")");
    expect(dockLmTabSource).toContain("ariaLabel: t(\"lm.lowerThird\")");
  });

  it("retains detected queue items through temporary empty snapshots", () => {
    const first = candidate("Genesis", 1, 2);
    const retained = mergeRetainedLmQueue([], [first], 1_000, 90_000);
    const stillVisible = mergeRetainedLmQueue(retained, [], 45_000, 90_000);
    const expired = mergeRetainedLmQueue(retained, [], 92_000, 90_000);

    expect(getLmCandidateKey(first)).toBe("Genesis:1:2");
    expect(stillVisible).toHaveLength(1);
    expect(stillVisible[0].candidate.label).toBe("Genesis 1:2");
    expect(expired).toHaveLength(0);
  });

  it("tracks actual pushed verses as the live card source", () => {
    expect(dockLmTabSource).toContain("setLiveVerse(candidate)");
    expect(dockLmTabSource).toContain("pushBibleCandidateToOutput(live, settings.overlayMode)");
  });
});
