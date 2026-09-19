import { describe, expect, it } from "vitest";
import dockBibleTabSource from "./DockBibleTab.tsx?raw";
import dockLmTabSource from "./DockLmTab.tsx?raw";
import lmDockServiceSource from "../../services/lmDockService.ts?raw";

describe("LM Bible history preview handoff", () => {
  it("sends clickable history references to Bible with preview intent", () => {
    expect(dockLmTabSource).toContain("onNavigateToBible?.()");
    expect(dockLmTabSource).toContain("navigateBibleDock({");
    expect(dockLmTabSource).toContain("pushToPreview: true");
  });

  it("prepares OBS Preview and publishes the requested verse", () => {
    expect(dockBibleTabSource).toContain("payload.pushToPreview");
    expect(dockBibleTabSource).toContain('preparePlannerOutput("bible", false)');
    expect(dockBibleTabSource).toContain("recordHistory: false");
    expect(lmDockServiceSource).toContain('dockBridge.sendCommand({');
    expect(lmDockServiceSource).toContain('type: "lm:navigate"');
    expect(dockLmTabSource).toContain("commandId:");
    expect(dockBibleTabSource).toContain("api/lm-bible-navigation");
    expect(dockBibleTabSource).toContain("await goLiveVerse(result.book, result.chapter, result.verse");
  });
});
