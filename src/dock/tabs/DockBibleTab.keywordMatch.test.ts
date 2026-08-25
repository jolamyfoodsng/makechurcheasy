import { describe, expect, it } from "vitest";
import dockBibleTabSource from "./DockBibleTab.tsx?raw";
import dockPageSource from "../DockPage.tsx?raw";
import keywordPreferenceSource from "../dockBibleKeywordPreference.ts?raw";

describe("DockBibleTab keyword-match direct output", () => {
  it("uses one persisted preference from the Dock sidebar", () => {
    expect(dockBibleTabSource).toContain("keywordMatchPushDirectlyToObs?: boolean");
    expect(dockBibleTabSource).toContain("setKeywordMatchPushDirectlyToObs(prefs.keywordMatchPushDirectlyToObs === true)");
    expect(dockBibleTabSource).toContain("DOCK_BIBLE_KEYWORD_MATCH_CHANGED_EVENT");
    expect(dockBibleTabSource).not.toContain("onKeywordMatchPushDirectlyToObsChange");
    expect(dockBibleTabSource).not.toContain("dock-bible-keyword-modal__direct-push");
    expect(dockPageSource).toContain("Auto-send keyword matches");
    expect(dockPageSource).toContain("updateKeywordMatchDirectPush");
    expect(keywordPreferenceSource).toContain("updateDockBibleKeywordMatchPreference");
  });

  it("pushes keyword and concept matches directly when the preference is enabled", () => {
    expect(dockBibleTabSource).toContain("if (keywordMatchPushDirectlyToObs)");
    expect(dockBibleTabSource).toContain("await goLiveVerse(result.book, result.chapter, result.verse");
    expect(dockBibleTabSource).toContain("setKeywordActionResult(result)");
  });

  it("waits for a settled query before running expensive keyword search", () => {
    expect(dockBibleTabSource).toContain("const MIN_DOCK_KEYWORD_SEARCH_LENGTH = 3;");
    expect(dockBibleTabSource).toContain("const DOCK_SEARCH_DEBOUNCE_MS = 600;");
    expect(dockBibleTabSource).toContain("const debouncedSearchQuery = useDebouncedValue(searchQuery, DOCK_SEARCH_DEBOUNCE_MS);");
    expect(dockBibleTabSource).toContain("const matches = await searchBible(trimmed, activeBibleSearchTranslation, DOCK_KEYWORD_SEARCH_LIMIT);");
    expect(dockBibleTabSource).not.toContain("}, 350);");
  });
});
