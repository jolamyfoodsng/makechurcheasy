import { describe, expect, it, vi } from "vitest";
import { dockObsClient, getMcePresentationVisibilityKeepSet } from "./dockObsClient";
import routingSource from "./dockSceneRouting.ts?raw";
import routingControlSource from "./components/DockSceneRoutingControl.tsx?raw";
import bibleTabSource from "./tabs/DockBibleTab.tsx?raw";
import worshipTabSource from "./tabs/DockWorshipTab.tsx?raw";
import notesTabSource from "./tabs/DockNotesTab.tsx?raw";
import mediaTabSource from "./tabs/DockMediaTab.tsx?raw";
import ministryTabSource from "./tabs/DockMinistryTab.tsx?raw";
import countdownTabSource from "./tabs/DockCountdownsTab.tsx?raw";
import dockPageSource from "./DockPage.tsx?raw";
import obsClientSource from "./dockObsClient.ts?raw";
import bibleOverlaySource from "../../public/mce-bible-overlay.html?raw";
import presentationOverlaySource from "../../public/presentation.html?raw";
import presentationBridgeSource from "../services/presentationDockBridge.ts?raw";
import worshipOverlaySource from "../../public/mce-worship-overlay.html?raw";
import notesOverlaySource from "../../public/mce-note.html?raw";
import lowerThirdOverlaySource from "../../public/lower-third-overlay.html?raw";
import { getDockSceneRouteTargets, normalizeDockSceneRoute } from "./dockSceneRouting";

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
    expect(routingSource).toContain("readNativeDockSetting<StoredSceneRoutes>(SCENE_ROUTING_STORAGE_KEY)");
    expect(routingSource).toContain('export type DockSceneOutputMode = "inherit" | "fullscreen" | "lower-third"');
    expect(routingSource).toContain("targets: DockSceneRouteTarget[]");
  });

  it("migrates the legacy single-scene route and preserves per-scene formats", () => {
    expect(normalizeDockSceneRoute({ enabled: true, sceneName: "Camera", syncPresentation: false })).toEqual({
      enabled: true,
      sceneName: "Camera",
      targets: [{ sceneName: "Camera", mode: "inherit" }],
      syncPresentation: false,
    });

    const route = normalizeDockSceneRoute({
      enabled: true,
      targets: [
        { sceneName: "Full Screen", mode: "fullscreen" },
        { sceneName: "Lower Third", mode: "lower-third" },
        { sceneName: "Full Screen", mode: "inherit" },
      ],
      syncPresentation: true,
    });
    expect(route.sceneName).toBe("Full Screen");
    expect(getDockSceneRouteTargets(route)).toEqual([
      { sceneName: "Full Screen", mode: "fullscreen" },
      { sceneName: "Lower Third", mode: "lower-third" },
    ]);
  });

  it("uses a small, stable URL and targets packets to the independent browser input", () => {
    const methodStart = obsClientSource.indexOf("private async pushSceneRouteBrowserSource(");
    const methodEnd = obsClientSource.indexOf("\n  async clearSceneRouteSource", methodStart);
    const methodSource = obsClientSource.slice(methodStart, methodEnd);

    expect(methodSource).toContain("ensureOverlaySource(sceneName, sourceName");
    expect(methodSource).toContain("buildSceneRouteOverlayUrl(options.url, sourceName)");
    expect(methodSource).toContain("const documentNeedsLoad = needsRouteReconciliation");
    expect(methodSource).toContain("await this.hasBrowserSourceUrlChanged(sourceName, stableSourceUrl)");
    expect(methodSource).toContain("if (documentNeedsLoad) await this.sleep(220)");
    expect(methodSource).toContain("const needsRouteReconciliation = !routeWasRecentlyPrepared || !hasStableLoadedDocument");
    expect(obsClientSource).toContain("SCENE_ROUTE_SOURCE_RECONCILE_MS");
    expect(methodSource).toContain("emitBrowserOverlayPacket(");
    expect(methodSource).toContain("this.buildOverlayUrlFromPayload(stableSourceUrl, options.overlayPacket)");
    expect(methodSource).toContain("if (documentNeedsLoad) {");
  });

  it("keeps route packets isolated from the shared MCE Presentation overlays", () => {
    expect(obsClientSource).toContain("...(targetSource ? { targetSource } : {})");
    expect(obsClientSource).toContain('event_name: "mce-overlay-packet"');
    expect(obsClientSource).toContain("event_data: {\n                tab: tabType,");
    for (const overlaySource of [bibleOverlaySource, worshipOverlaySource, notesOverlaySource]) {
      expect(overlaySource).toContain("const _routeSource");
      expect(overlaySource).toContain("const _routeSuffix = _routeSource");
      expect(overlaySource).toContain("if (_routeSource && targetSource !== _routeSource) return false;");
    }
    expect(lowerThirdOverlaySource).toContain("const routeSource");
    expect(lowerThirdOverlaySource).toContain("const lowerThirdChannel");
    expect(lowerThirdOverlaySource).toContain("targetSource !== routeSource");
  });

  it("isolates only MCE-owned sources when a new presentation source is activated", () => {
    const methodStart = obsClientSource.indexOf("private async ensureActiveMceOverlaySource(");
    const methodEnd = obsClientSource.indexOf("\n  private invalidateActiveMceOverlayState", methodStart);
    const methodSource = obsClientSource.slice(methodStart, methodEnd);

    expect(methodSource).toContain("isMcePresentationManagedSource(item.sourceName)");
    expect(methodSource).toContain('addVisibilityRequest(PRESENTATION_SCENE_NAME, item.sceneItemId, false)');
    expect(methodSource).toContain("presentationSourceVisibility");
    expect(methodSource).toContain("lowerThirdSourceVisibility");
    expect(methodSource).toContain("PRESENTATION_SCENE_NAME");
    expect(methodSource).toContain("MCE Presentation only");
  });

  it("updates the clicked module before focusing its shared output source", () => {
    expect(obsClientSource).toContain('focusMcePresentationModule("bible")');
    expect(obsClientSource).toContain('focusMcePresentationModule("worship")');
    expect(obsClientSource).toContain('focusMcePresentationModule("notes")');
    expect(obsClientSource).toContain("Deliver the new verse while the source is still hidden");
    expect(obsClientSource).toContain("The packet is now current.");
    expect(obsClientSource).toContain("Only after that do we isolate this tab's");
    expect(obsClientSource).toContain("focusMcePresentationModule(\"media\")");
    expect(mediaTabSource).toContain("How the slideshow works");
    expect(mediaTabSource).toContain('useState("MC slideshow")');
    expect(mediaTabSource).toContain('const sourceName = playlistName.trim() || "MC slideshow"');
  });

  it("does not reorder the active source when only the verse payload changes", () => {
    const methodStart = obsClientSource.indexOf("private async ensureActiveMceOverlaySource(");
    const methodEnd = obsClientSource.indexOf("\n  /** Apply the operator's MCE-only visibility preference", methodStart);
    const methodSource = obsClientSource.slice(methodStart, methodEnd);
    const stateCheckIndex = methodSource.indexOf("if (this._activeMceOverlayStateByScene[targetScene] === stateSignature) return;");
    const firstOrderingIndex = methodSource.indexOf("await this.ensureTickerAboveSource(targetScene, primary)");

    expect(stateCheckIndex).toBeGreaterThan(-1);
    expect(firstOrderingIndex).toBeGreaterThan(stateCheckIndex);
  });

  it("removes legacy single-Bible content before compare output is shown", () => {
    expect(obsClientSource).toContain("hideLegacyBibleContentSources");
    expect(obsClientSource).toContain('getMcePresentationSourceFamily(item.sourceName) !== "bible"');
    expect(obsClientSource).toContain("if (compareEnabled)");
    expect(obsClientSource).toContain("PRESENTATION_SCENE_NAME, sceneName");
    expect(bibleOverlaySource).toContain("visibility: hidden;");
  });

  it("sends a compare selection through one authoritative Bible projection path", () => {
    const comparePushStart = bibleTabSource.indexOf("const publishComparePassageOutput");
    const comparePushEnd = bibleTabSource.indexOf("const handleComparePassageNavigation", comparePushStart);
    const comparePushSource = bibleTabSource.slice(comparePushStart, comparePushEnd);

    expect(comparePushSource).toContain("await pushLive()");
    expect(comparePushSource).not.toContain("primeBibleOverlay(");
  });

  it("keeps an already-live Bible source visible across a Dock refresh", () => {
    expect(obsClientSource).toContain('const MCE_PRESENTATION_ACTIVE_MODULE_KEY = "ocs-dock-presentation-active-module-v1"');
    expect(obsClientSource).toContain("writeNativeDockSetting(MCE_PRESENTATION_ACTIVE_MODULE_KEY, module)");
    expect(obsClientSource).toContain("private async tryPushRestoredLiveBiblePacket");
    expect(obsClientSource).toContain("if (await this.tryPushRestoredLiveBiblePacket(data)) return;");
    expect(obsClientSource).toContain("await this.deliverCssOverlayPacket(sourceName, \"bible\", packet, baseUrl, themeCss)");
    expect(obsClientSource).toContain("const preserveExistingLiveBibleSource = !data.targetScene");
    expect(obsClientSource).toContain('MCE_PRESENTATION_ACTIVE_MODULE_KEY) === "bible"');
    expect(obsClientSource).toContain('this._ensureFullscreenScene("bible", mode, preserveExistingLiveBibleSource)');
  });

  it("paints Worship from native and cached local state before background refresh", () => {
    expect(worshipTabSource).toContain("useState<DockSong[]>(() => loadCachedSongs())");
    expect(worshipTabSource).toContain("applyPreferences(loadDockWorshipPreferences(), BUILTIN_THEMES)");
    expect(worshipTabSource).toContain("if (!preferencesHydrated || !prefsReadyRef.current) return;");
  });

  it("verifies the live OBS browser source painted the new font", () => {
    const methodStart = obsClientSource.indexOf("async refreshOutputTypography(): Promise<void>");
    const methodEnd = obsClientSource.indexOf("\n  private extractOverlayPacketFromCss", methodStart);
    const methodSource = obsClientSource.slice(methodStart, methodEnd);
    const restartStart = obsClientSource.indexOf("private async setBrowserSourceCssAndRestart");
    const restartEnd = obsClientSource.indexOf("\n  /**", restartStart);
    const restartSource = obsClientSource.slice(restartStart, restartEnd);

    expect(methodSource).toContain("await this.connect().catch");
    expect(methodSource).toContain("waitForOverlayRenderAck");
    expect(methodSource).toContain("setBrowserSourceCssAndRestart");
    expect(restartSource).toContain("restart_cef: true");
    expect(restartSource).toContain("restart_cef: false");
  });

  it("keeps the active MCE content family and structural program reference only", () => {
    const keepSet = getMcePresentationVisibilityKeepSet("MCE Browser - Bible", [
      { sourceName: "MCE Program Scene Reference", sceneItemIndex: 0 },
      { sourceName: "MCE Browser - Bible", sceneItemIndex: 1 },
      { sourceName: "MCE BG - Bible", sceneItemIndex: 2 },
      { sourceName: "MCE Browser - Worship", sceneItemIndex: 3 },
      { sourceName: "MCE Ticker", sceneItemIndex: 4 },
      { sourceName: "User Camera", sceneItemIndex: 5 },
    ]);

    expect(keepSet.has("MCE Browser - Bible")).toBe(true);
    expect(keepSet.has("MCE BG - Bible")).toBe(true);
    expect(keepSet.has("MCE Program Scene Reference")).toBe(true);
    expect(keepSet.has("MCE Browser - Worship")).toBe(false);
    expect(keepSet.has("MCE Ticker")).toBe(false);
    expect(keepSet.has("User Camera")).toBe(false);
  });

  it("keeps the first MCE layer only when the lower-third preference asks for it", () => {
    const items = [
      { sourceName: "MCE Browser - Bible", sceneItemIndex: 0 },
      { sourceName: "MCE Lower Third", sceneItemIndex: 1 },
      { sourceName: "MCE Ticker", sceneItemIndex: 2 },
    ];

    const keepFirst = getMcePresentationVisibilityKeepSet("MCE Lower Third", items, "keep-first");
    const activeOnly = getMcePresentationVisibilityKeepSet("MCE Lower Third", items, "active-only");

    expect(keepFirst.has("MCE Browser - Bible")).toBe(true);
    expect(activeOnly.has("MCE Browser - Bible")).toBe(false);
    expect(keepFirst.has("MCE Ticker")).toBe(false);
    expect(activeOnly.has("MCE Ticker")).toBe(false);
  });

  it("exposes the same scene picker in every requested output area", () => {
    expect(routingControlSource).toContain("Send to another scene");
    expect(routingControlSource).toContain("Also update MCE Presentation");
    expect(routingControlSource).toContain("Target scenes");
    expect(routingControlSource).toContain("Full screen");
    expect(routingControlSource).toContain("Lower third");
    expect(bibleTabSource).toContain('module="bible"');
    expect(worshipTabSource).toContain('module="worship"');
    expect(notesTabSource).toContain('module="notes"');
    expect(ministryTabSource).toContain('module="ticker"');
    expect(ministryTabSource).toContain('module="lower-third"');
    expect(countdownTabSource).toContain('module="countdown"');
  });

  it("routes each tab through its independent sender before optionally syncing MCE Presentation", () => {
    expect(obsClientSource).toContain("async pushBibleToScene");
    expect(obsClientSource).toContain("async pushBibleToScenes");
    expect(obsClientSource).toContain("async pushWorshipToScene");
    expect(obsClientSource).toContain("async pushNotesToScene");
    expect(obsClientSource).toContain("async pushTickerToScene");
    expect(obsClientSource).toContain("async pushLowerThirdOverlayUrlToScene");
    expect(countdownTabSource).toContain("getObsTargets(cd)");
    expect(ministryTabSource).toContain("tickerSceneRoute.syncPresentation");
    expect(ministryTabSource).toContain("lowerThirdSceneRoute.syncPresentation");
  });

  it("keeps every routed Bible target inside one latest-only mutation", async () => {
    const client = dockObsClient as unknown as Record<string, any>;
    const previousInternal = client.pushBibleToSceneInternal;
    const previousTail = client._bibleMutationTail;
    const previousCounter = client._bibleMutationCounter;
    const sentScenes: string[] = [];

    client._bibleMutationTail = Promise.resolve();
    client._bibleMutationCounter = 0;
    client.pushBibleToSceneInternal = vi.fn(async (_data: unknown, sceneName: string) => {
      sentScenes.push(sceneName);
    });

    try {
      await client.pushBibleToScenes([
        {
          sceneName: "General",
          data: { book: "John", chapter: 3, verse: 16, translation: "KJV" },
        },
        {
          sceneName: "Live Stream",
          data: { book: "John", chapter: 3, verse: 16, translation: "KJV" },
        },
      ]);

      expect(sentScenes).toEqual(["General", "Live Stream"]);
    } finally {
      client.pushBibleToSceneInternal = previousInternal;
      client._bibleMutationTail = previousTail;
      client._bibleMutationCounter = previousCounter;
    }
  });

  it("keeps linked Bible presentation output aligned with two- and three-passage compare", () => {
    expect(presentationBridgeSource).toContain(".slice(0, 3)");
    expect(presentationBridgeSource).toContain("presentationCompareColumns.length >= 2");
    expect(presentationOverlaySource).toContain(".slice(0, 3)");
    expect(presentationOverlaySource).toContain("const columnCount = Math.max(2, Math.min(3, columns.length));");
    expect(presentationOverlaySource).toContain("compareColumns.length >= 2");
    expect(bibleOverlaySource).toContain("applyFullscreenCompareLayoutMode(currentCompareLayout);");
  });

  it("keeps the Dock typography control separate from the CMG Sans OBS default", () => {
    expect(dockPageSource).toContain("page.dockFontFamily");
    expect(dockPageSource).toContain("page.dockFontSize");
    expect(dockPageSource).not.toContain("page.obsFontFamily");
    expect(dockPageSource).not.toContain("dock-output-font-family");
    expect(dockPageSource).not.toContain("OBS output size");
    expect(obsClientSource).toContain("loadDockOutputFontFamily");
    expect(obsClientSource).toContain("async refreshOutputTypography");
    expect(bibleOverlaySource).toContain("--mce-output-font-family");
    expect(bibleOverlaySource).toContain("'--mce-output-font-family'");
    expect(presentationBridgeSource).toContain("loadDockOutputFontFamily");
  });

  it("re-fits Bible text responsively when the mobile viewport or line count changes", () => {
    expect(bibleOverlaySource).toContain('width=device-width');
    expect(bibleOverlaySource).toContain("document.addEventListener('DOMContentLoaded', fit");
    expect(bibleOverlaySource).toContain("function getVisualScale");
    expect(bibleOverlaySource).toContain("const absoluteFloor = Math.max(fallback, 16)");
    expect(bibleTabSource).toContain("void handleSyncBibleBrowserSettings({}, safeLineCount);");
    expect(bibleTabSource).toContain("Line count changes the actual passage layout");
  });

  it("publishes linked compare navigation to the active OBS or presentation route", () => {
    expect(bibleTabSource).toContain("const nextDrafts = comparePassageDrafts.map");
    expect(bibleTabSource).toContain("draftsOverride: nextDrafts");
    expect(bibleTabSource).toContain("void publishComparePassageOutput({");
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
    expect(methodSource).toContain("this.rememberCssOverlayTransport(sourceName, parsed.payload, parsed.baseUrl, \"\", \"lower-third\")");
  });
});
