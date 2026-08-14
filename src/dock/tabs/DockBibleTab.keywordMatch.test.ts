import { describe, expect, it } from "vitest";
import dockBibleTabSource from "./DockBibleTab.tsx?raw";

describe("DockBibleTab keyword-match direct output", () => {
  it("uses one persisted preference for the modal and the sidebar settings", () => {
    expect(dockBibleTabSource).toContain("keywordMatchPushDirectlyToObs?: boolean");
    expect(dockBibleTabSource).toContain("setKeywordMatchPushDirectlyToObs(prefs.keywordMatchPushDirectlyToObs === true)");
    expect(dockBibleTabSource).toContain("onKeywordMatchPushDirectlyToObsChange");
    expect(dockBibleTabSource).toContain("dock-bible-keyword-modal__direct-push");
    expect(dockBibleTabSource).toContain("bible-keyword-match-direct-push-description");
  });

  it("pushes keyword and concept matches directly when the preference is enabled", () => {
    expect(dockBibleTabSource).toContain("if (keywordMatchPushDirectlyToObs)");
    expect(dockBibleTabSource).toContain("await goLiveVerse(result.book, result.chapter, result.verse");
    expect(dockBibleTabSource).toContain("setKeywordActionResult(result)");
  });
});
