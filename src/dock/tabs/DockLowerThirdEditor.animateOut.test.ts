import { describe, expect, it } from "vitest";
import dockObsClientSource from "../dockObsClient.ts?raw";
import editorSource from "./DockLowerThirdEditor.tsx?raw";
import ministrySource from "./DockMinistryTab.tsx?raw";
import lowerThirdOverlayHtml from "../../../public/lower-third-overlay.html?raw";

describe("Dock lower-third animate out wiring", () => {
  it("passes the prepared blanked URL to OBS instead of discarding it", () => {
    expect(editorSource).toContain("onAnimateOut(url)");
    expect(ministrySource).toContain("animateLowerThirdOverlayUrlOut(url, exitDuration)");
    expect(ministrySource).not.toContain("onAnimateOut={async (url) => {\n                      void url;");
  });

  it("keeps theme-defined exit animations as the default", () => {
    expect(editorSource).toContain('const overlayExitStyle = exitStyle === "fade" ? undefined : exitStyle;');
  });

  it("injects theme CSS before blanked/out rendering", () => {
    const cssInjectionIndex = lowerThirdOverlayHtml.indexOf("cssEl.textContent = compactEntryMotionCss(css);");
    const blankedIndex = lowerThirdOverlayHtml.indexOf("if (blanked) {");
    expect(cssInjectionIndex).toBeGreaterThan(-1);
    expect(blankedIndex).toBeGreaterThan(-1);
    expect(cssInjectionIndex).toBeLessThan(blankedIndex);
  });

  it("keeps the source visible until the exit duration completes", () => {
    expect(dockObsClientSource).toContain("async animateLowerThirdOverlayUrlOut");
    expect(dockObsClientSource).toContain("sceneItemEnabled: true");
    expect(dockObsClientSource).toContain("await this.sleep(waitMs)");
    expect(dockObsClientSource).toContain("await this.hideOverlaySource(sceneName, resources.ltSource)");
  });
});
