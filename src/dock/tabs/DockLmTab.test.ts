import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useAppTheme", () => ({
  useAppTheme: () => ({ appearance: { theme: "dark" }, setTheme: vi.fn() }),
}));
import {
  getLmCandidateKey,
  getSelectedTranscriptEntries,
  isLmAutoPushSuppressed,
  isLmCompactHeight,
  LM_COMPACT_HEIGHT_PX,
  mergeRetainedLmQueue,
  normalizeLmOverlayMode,
} from "./DockLmTab";
import { retainSuggestionsUntilReplacement } from "../../services/lmDockService";
import dockLmTabSource from "./DockLmTab.tsx?raw";
import speechToScripturePageSource from "../../pages/SpeechToScripturePage.tsx?raw";
import lmDockServiceSource from "../../services/lmDockService.ts?raw";
import type { VoiceBibleCandidate } from "../../services/voiceBibleTypes";
import dockBibleTabSource from "./DockBibleTab.tsx?raw";

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
  it("uses the requested short-height breakpoint for the vertical tab rail", () => {
    expect(LM_COMPACT_HEIGHT_PX).toBe(400);
    expect(isLmCompactHeight(399)).toBe(true);
    expect(isLmCompactHeight(400)).toBe(false);
    expect(isLmCompactHeight(0)).toBe(false);
  });

  it("uses icon-only vertical tabs and keeps overlay mode in settings", () => {
    expect(dockLmTabSource).toContain('aria-orientation={isCompactHeight ? "vertical" : "horizontal"}');
    expect(dockLmTabSource).toContain('data-testid={`lm-tab-${tab}`}');
    expect(dockLmTabSource).toMatch(/tabBarCompact:\s*\{[\s\S]*?height: "100%"[\s\S]*?boxSizing: "border-box"[\s\S]*?overflow: "hidden"/);
    expect(dockLmTabSource).toMatch(/tabCompact:\s*\{[\s\S]*?flex: "1 1 0"/);
    expect(dockLmTabSource).not.toContain("style={S.emptyState}");
    expect(dockLmTabSource).not.toContain("!presentationLinkMode && renderOverlayModeSwitch()");
    expect(dockLmTabSource).toContain("{renderOverlayModeSwitch()}");
  });

  it("opens interaction instructions from the help icon instead of a permanent hint bar", () => {
    expect(dockLmTabSource).toContain('data-testid="lm-interaction-help"');
    expect(dockLmTabSource).toContain('data-testid="lm-interaction-help-modal"');
    expect(dockLmTabSource).toContain('t("lm.interactionHelpCopy", "Click a transcript line to copy it.")');
    expect(dockLmTabSource).not.toContain("style={S.hintBar}");
  });

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

  it("keeps a suggestion through a temporary empty live-search result", () => {
    const first = candidate("Psalms", 91, 1);
    const replacement = candidate("Psalms", 91, 2);

    expect(retainSuggestionsUntilReplacement([first], [])).toEqual([first]);
    expect(retainSuggestionsUntilReplacement([first], [replacement])).toEqual([replacement]);
  });

  it("keeps transcript selection attached to entry IDs when new lines arrive", () => {
    const firstEntries = ["one", "two", "three"].map((text) => ({
      id: text,
      text,
      finalized: true,
    }));
    const selectedIds = new Set(["one", "two", "three"]);
    const updatedEntries = [
      ...firstEntries,
      { id: "four", text: "four", finalized: true },
    ];

    expect(getSelectedTranscriptEntries(updatedEntries, selectedIds).map((entry) => entry.id))
      .toEqual(["one", "two", "three"]);
  });

  it("tracks actual pushed verses as the live card source", () => {
    expect(dockLmTabSource).toContain("setLiveVerse(candidate)");
    expect(dockLmTabSource).toContain("pushBibleCandidateToOutput(live, settings.overlayMode)");
  });

  it("takes clickable history references to Bible and requests an OBS preview push", () => {
    expect(dockLmTabSource).toContain("onNavigateToBible?.()");
    expect(dockLmTabSource).toContain("navigateBibleDock({");
    expect(dockLmTabSource).toContain("pushToPreview: true");
    expect(dockBibleTabSource).toContain("payload.pushToPreview");
    expect(dockBibleTabSource).toContain('preparePlannerOutput("bible", false)');
    expect(dockBibleTabSource).toContain("recordHistory: false");
  });

  it("renders the queue without guided target attributes", () => {
    const guidedTargetAttr = ["data", "onboarding"].join("-");
    expect(dockLmTabSource).not.toContain(`${guidedTargetAttr}=`);
  });

  it("keeps queue previews compact while preserving the verse reference", () => {
    expect(dockLmTabSource).toContain("WebkitLineClamp: 2");
    expect(dockLmTabSource).toContain("fontSize: 12");
  });

  it("uses the saved Bible stream style when pushing LM verses", () => {
    expect(dockLmTabSource).toContain("resolveDockBibleThemeForOverlayMode(overlayMode)");
    expect(dockLmTabSource).toContain("resolveDockBibleReferenceLabels(");
    expect(dockLmTabSource).toContain("bibleThemeSettings: bibleTheme.themeSettings");
    expect(dockLmTabSource).toContain("liveOverrides: bibleTheme.liveOverrides");
    expect(dockLmTabSource).toContain("displayReferenceLabel: referenceLabels.displayReferenceLabel");
    expect(dockLmTabSource).not.toContain("loadBiblePrefs()");
  });

  it("renders and wires the auto-push controls", () => {
    expect(dockLmTabSource).toContain("AUTO-PUSH");
    expect(dockLmTabSource).toContain('t("lm.autoPushQueue")');
    expect(dockLmTabSource).toContain('updateSetting("autoPushQueue", e.target.checked)');
    expect(dockLmTabSource).toContain('t("lm.autoPushSuggestions")');
    expect(dockLmTabSource).toContain('updateSetting("autoPushSuggestions", e.target.checked)');
    expect(dockLmTabSource).toContain("isLmAutoPushSuppressed");
  });

  it("keeps speech startup cancellable while slow native mic startup is pending", () => {
    expect(lmDockServiceSource).toContain("void this.scriptureEngine.preload()");
    expect(lmDockServiceSource).toContain("MIC_START_TIMEOUT_MS");
    expect(lmDockServiceSource).toContain("Microphone start timed out.");

    expect(dockLmTabSource).toContain('"Cancel start"');
    expect(dockLmTabSource).not.toContain('disabled={lmStatus === "connecting" || lmStatus === "requesting-mic"}');

    expect(speechToScripturePageSource).toContain("const canStopListening = isListening || isConnecting;");
    expect(speechToScripturePageSource).toContain("onClick={canStopListening ? handleStop : handleStart}");
    expect(speechToScripturePageSource).not.toContain("disabled={isConnecting || checkingAccess");
  });
});
