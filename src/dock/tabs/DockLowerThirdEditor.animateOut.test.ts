import { describe, expect, it } from "vitest";
import dockObsClientSource from "../dockObsClient.ts?raw";
import editorSource from "./DockLowerThirdEditor.tsx?raw";
import ministrySource from "./DockMinistryTab.tsx?raw";
import lowerThirdOverlayHtml from "../../../public/lower-third-overlay.html?raw";

describe("Dock lower-third animate out wiring", () => {
  it("routes animate out through the dock client instead of discarding the prepared URL", () => {
    expect(editorSource).toContain("onAnimateOut(url)");
    expect(ministrySource).toContain("animateLowerThirdOverlayUrlOut(url, exitDuration)");
    expect(ministrySource).not.toContain("onAnimateOut={async (url) => {\n                      void url;");
  });

  it("uses an OBS browser event for lower-third exit before falling back to URL updates", () => {
    const methodStart = dockObsClientSource.indexOf("async animateLowerThirdOverlayUrlOut(");
    const methodEnd = dockObsClientSource.indexOf("\n  // ── Worship lyrics overlay ──", methodStart);
    const methodSource = dockObsClientSource.slice(methodStart, methodEnd);
    const eventIndex = methodSource.indexOf('emitBrowserOverlayPacket("lower-third"');
    const fallbackIndex = methodSource.indexOf('buildBlankedOverlayUrlFromCurrentSource(resources.ltSource, "")');
    expect(eventIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(-1);
    expect(eventIndex).toBeLessThan(fallbackIndex);
    expect(methodSource).toContain("_url: string");
  });

  it("replaces a live Ministry lower third without reloading the OBS browser URL", () => {
    const replaceIndex = ministrySource.indexOf("await dockObsClient.replaceLiveLowerThirdOverlayUrl(url, sourceSize, exitDuration);");
    const firstPushIndex = ministrySource.indexOf("await dockObsClient.pushLowerThirdOverlayUrl(url, sourceSize);");
    expect(replaceIndex).toBeGreaterThan(-1);
    expect(firstPushIndex).toBeGreaterThan(-1);
    expect(replaceIndex).toBeLessThan(firstPushIndex);
    expect(dockObsClientSource).toContain("async replaceLiveLowerThirdOverlayUrl");
    expect(dockObsClientSource).toContain('emitBrowserOverlayPacket("lower-third", nextPacket, overlayCss)');
  });

  it("keeps theme-defined exit animations as the default", () => {
    expect(editorSource).toContain('const overlayExitStyle = exitStyle === "fade" ? undefined : exitStyle;');
  });

  it("injects theme CSS before blanked/out rendering", () => {
    const cssInjectionIndex = lowerThirdOverlayHtml.indexOf("injectThemeCss(data);");
    const blankedIndex = lowerThirdOverlayHtml.indexOf("if (blanked) {");
    expect(cssInjectionIndex).toBeGreaterThan(-1);
    expect(blankedIndex).toBeGreaterThan(-1);
    expect(cssInjectionIndex).toBeLessThan(blankedIndex);
  });

  it("listens for OBS browser lower-third exit events without reloading the browser source", () => {
    expect(lowerThirdOverlayHtml).toContain('window.addEventListener("mce-overlay-packet", readFromObsBrowserEvent)');
    expect(lowerThirdOverlayHtml).toContain('if (packet.action === "animate-out")');
    expect(lowerThirdOverlayHtml).toContain("if (isExiting) return true;");
    expect(lowerThirdOverlayHtml).toContain("pendingThemePayload");
    expect(lowerThirdOverlayHtml).toContain("readCssOverlayData");
    expect(lowerThirdOverlayHtml).toContain('writeRenderAck(packet, "lower-third")');
  });

  it("keeps the source visible until the exit duration completes", () => {
    expect(dockObsClientSource).toContain("async animateLowerThirdOverlayUrlOut");
    expect(dockObsClientSource).toContain("sceneItemEnabled: true");
    expect(dockObsClientSource).toContain("await this.sleep(delivered ? waitMs : 0)");
    expect(dockObsClientSource).toContain("await this.hideOverlaySource(sceneName, resources.ltSource)");
  });
});
