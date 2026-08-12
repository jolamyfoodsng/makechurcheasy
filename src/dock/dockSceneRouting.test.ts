import { describe, expect, it } from "vitest";
import { dockObsClient } from "./dockObsClient";
import routingSource from "./dockSceneRouting.ts?raw";
import routingControlSource from "./components/DockSceneRoutingControl.tsx?raw";
import bibleTabSource from "./tabs/DockBibleTab.tsx?raw";
import worshipTabSource from "./tabs/DockWorshipTab.tsx?raw";
import notesTabSource from "./tabs/DockNotesTab.tsx?raw";
import ministryTabSource from "./tabs/DockMinistryTab.tsx?raw";
import countdownTabSource from "./tabs/DockCountdownsTab.tsx?raw";
import obsClientSource from "./dockObsClient.ts?raw";
import bibleOverlaySource from "../../public/mce-bible-overlay.html?raw";
import worshipOverlaySource from "../../public/mce-worship-overlay.html?raw";
import notesOverlaySource from "../../public/mce-note.html?raw";
import lowerThirdOverlaySource from "../../public/lower-third-overlay.html?raw";

describe("dock scene routing", () => {
  it("gives every selected-scene overlay its own stable source name", () => {
    expect(dockObsClient.getSceneRouteSourceName("bible", "Livestream Scene"))
      .toBe("MCE Bible - Livestream Scene");
    expect(dockObsClient.getSceneRouteSourceName("lower-third", "Livestream Scene"))
      .toBe("MCE Lower Third - Livestream Scene");
    expect(dockObsClient.getSceneRouteSourceName("countdown", "Livestream Scene", "Background"))
      .toBe("MCE Countdown Background - Livestream Scene");
  });

  it("persists an independent target and an explicit MCE Presentation sync choice per module", () => {
    expect(routingSource).toContain('const SCENE_ROUTING_STORAGE_KEY = "dock-scene-routing-v1"');
    expect(routingSource).toContain("syncPresentation: candidate.syncPresentation === true");
    expect(routingSource).toContain("getUserScopedKey(SCENE_ROUTING_STORAGE_KEY)");
  });

  it("uses a small, stable URL and targets packets to the independent browser input", () => {
    const methodStart = obsClientSource.indexOf("private async pushSceneRouteBrowserSource(");
    const methodEnd = obsClientSource.indexOf("\n  async clearSceneRouteSource", methodStart);
    const methodSource = obsClientSource.slice(methodStart, methodEnd);

    expect(methodSource).toContain("ensureOverlaySource(sceneName, sourceName");
    expect(methodSource).toContain("buildSceneRouteOverlayUrl(options.url, sourceName)");
    expect(methodSource).toContain('options.overlayPacket ? "" : options.css');
    expect(methodSource).toContain("emitBrowserOverlayPacket(");
    expect(methodSource).toContain("this.buildOverlayUrlFromPayload(sourceUrl, options.overlayPacket)");
  });

  it("keeps route packets isolated from the shared MCE Presentation overlays", () => {
    expect(obsClientSource).toContain("...(targetSource ? { targetSource } : {})");
    for (const overlaySource of [bibleOverlaySource, worshipOverlaySource, notesOverlaySource]) {
      expect(overlaySource).toContain("const _routeSource");
      expect(overlaySource).toContain("const _routeSuffix = _routeSource");
      expect(overlaySource).toContain("targetSource !== _routeSource");
      expect(overlaySource).toContain("targetSource !== _routeSource : Boolean(targetSource)");
    }
    expect(lowerThirdOverlaySource).toContain("const routeSource");
    expect(lowerThirdOverlaySource).toContain("const lowerThirdChannel");
    expect(lowerThirdOverlaySource).toContain("targetSource !== routeSource");
  });

  it("isolates only MCE-owned sources when a new presentation source is activated", () => {
    const methodStart = obsClientSource.indexOf("private async ensureActiveMceOverlaySource(");
    const methodEnd = obsClientSource.indexOf("\n  private invalidateActiveMceOverlayState", methodStart);
    const methodSource = obsClientSource.slice(methodStart, methodEnd);

    expect(methodSource).toContain('item.sourceName.startsWith("MCE ")');
    expect(methodSource).toContain('sceneItemEnabled: false');
    expect(methodSource).toContain("presentationSourceVisibility");
    expect(methodSource).toContain("lowerThirdSourceVisibility");
  });

  it("exposes the same scene picker in every requested output area", () => {
    expect(routingControlSource).toContain("Send to another scene");
    expect(routingControlSource).toContain("Also update MCE Presentation");
    expect(bibleTabSource).toContain('module="bible"');
    expect(worshipTabSource).toContain('module="worship"');
    expect(notesTabSource).toContain('module="notes"');
    expect(ministryTabSource).toContain('module="ticker"');
    expect(ministryTabSource).toContain('module="lower-third"');
    expect(countdownTabSource).toContain('module="countdown"');
  });

  it("routes each tab through its independent sender before optionally syncing MCE Presentation", () => {
    expect(obsClientSource).toContain("async pushBibleToScene");
    expect(obsClientSource).toContain("async pushWorshipToScene");
    expect(obsClientSource).toContain("async pushNotesToScene");
    expect(obsClientSource).toContain("async pushTickerToScene");
    expect(obsClientSource).toContain("async pushLowerThirdOverlayUrlToScene");
    expect(countdownTabSource).toContain("getObsTargets(cd)");
    expect(ministryTabSource).toContain("tickerSceneRoute.syncPresentation");
    expect(ministryTabSource).toContain("lowerThirdSceneRoute.syncPresentation");
  });

  it("keeps the Bible overlay fit cache tied to the active theme mode", () => {
    expect(bibleOverlaySource).toContain("lastAppliedThemeKeyByMode[activeMode] || ''");
    expect(bibleOverlaySource).not.toContain("lastAppliedThemeKey,\n");
  });

  it("updates Notes slides in place without restarting a full-layer fade", () => {
    expect(notesOverlaySource).not.toContain("mce-preview-slide-fade");
    expect(notesOverlaySource).not.toContain("restartPreviewFade");
  });

  it("delivers every routed lower-third update as a complete targeted packet", () => {
    const methodStart = obsClientSource.indexOf("async pushLowerThirdOverlayUrlToScene(");
    const methodEnd = obsClientSource.indexOf("\n  /**\n   * Push a Bible verse", methodStart);
    const methodSource = obsClientSource.slice(methodStart, methodEnd);

    expect(methodSource).toContain("const parsed = this.parseOverlayPayloadUrl(url);");
    expect(methodSource).toContain("url: parsed.baseUrl");
    expect(methodSource).toContain("overlayPacket: parsed.payload");
    expect(methodSource).toContain('overlayTab: "lower-third"');
    expect(methodSource).toContain("this.rememberCssOverlayTransport(sourceName, parsed.payload, parsed.baseUrl, \"\")");
  });
});
