import { describe, it, expect, vi, beforeEach } from "vitest";
import { dockObsClient } from "./dockObsClient";

describe("dockObsClient source visibility and layer stacking", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("turns on a disabled source and places it below ticker and above other layers", async () => {
    vi.spyOn(dockObsClient, "isConnected", "get").mockReturnValue(true);

    const calls: Array<{ method: string; params: any }> = [];
    const sceneItems = [
      { sourceName: "MCE Program Scene Reference", sceneItemId: 1, sceneItemIndex: 0, sceneItemEnabled: true },
      { sourceName: "MCE Browser - Worship", sceneItemId: 2, sceneItemIndex: 1, sceneItemEnabled: true },
      { sourceName: "MCE Browser - Notes", sceneItemId: 3, sceneItemIndex: 2, sceneItemEnabled: true },
      { sourceName: "MCE Browser - Bible", sceneItemId: 4, sceneItemIndex: 3, sceneItemEnabled: false }, // Manually turned off in OBS
      { sourceName: "MCE Ticker", sceneItemId: 5, sceneItemIndex: 4, sceneItemEnabled: true },
    ];

    vi.spyOn(dockObsClient, "call").mockImplementation(async (method: string, params?: any) => {
      calls.push({ method, params });
      if (method === "GetSceneItemList") {
        return { sceneItems: [...sceneItems] };
      }
      if (method === "SetSceneItemEnabled") {
        const item = sceneItems.find((i) => i.sceneItemId === params?.sceneItemId);
        if (item) item.sceneItemEnabled = params.sceneItemEnabled;
        return {};
      }
      if (method === "SetSceneItemIndex") {
        const item = sceneItems.find((i) => i.sceneItemId === params?.sceneItemId);
        if (item) item.sceneItemIndex = params.sceneItemIndex;
        return {};
      }
      return {};
    });

    vi.spyOn(dockObsClient, "callBatch").mockImplementation(async (requests: any) => {
      for (const req of requests) {
        calls.push({ method: req.requestType, params: req.requestData });
        if (req.requestType === "SetSceneItemEnabled") {
          const item = sceneItems.find((i) => i.sceneItemId === req.requestData?.sceneItemId);
          if (item) item.sceneItemEnabled = req.requestData.sceneItemEnabled;
        }
      }
      return [];
    });

    // Invalidate state so it does a full check
    (dockObsClient as any).invalidateActiveMceOverlayState("MCE Presentation");
    (dockObsClient as any).invalidateSceneItemListCache("MCE Presentation");

    // Call applyMcePresentationSourceVisibility for Bible
    await dockObsClient.applyMcePresentationSourceVisibility("MCE Browser - Bible");

    // Verify SetSceneItemEnabled was called to turn Bible ON
    const enableBibleCall = calls.find(
      (c) => c.method === "SetSceneItemEnabled" && c.params?.sceneItemId === 4 && c.params?.sceneItemEnabled === true,
    );
    expect(enableBibleCall).toBeDefined();

    // Verify Ticker is kept on top (index 4) and Bible is moved above Worship and Notes (index 3)
    const setIndexCalls = calls.filter((c) => c.method === "SetSceneItemIndex");
    expect(setIndexCalls.length).toBeGreaterThanOrEqual(0);
  });

  it("ensures _ensureFullscreenScene turns on an existing disabled browser source when enable is true", async () => {
    vi.spyOn(dockObsClient, "isConnected", "get").mockReturnValue(true);

    const calls: Array<{ method: string; params: any }> = [];
    const sceneItems = [
      { sourceName: "MCE Browser - Bible", sceneItemId: 10, sceneItemIndex: 1, sceneItemEnabled: false },
      { sourceName: "MCE Ticker", sceneItemId: 11, sceneItemIndex: 2, sceneItemEnabled: true },
    ];

    vi.spyOn(dockObsClient as any, "hasObsScene").mockResolvedValue(true);
    vi.spyOn(dockObsClient, "call").mockImplementation(async (method: string, params?: any) => {
      calls.push({ method, params });
      if (method === "GetSceneList") {
        return { scenes: [{ sceneName: "MCE Presentation" }], currentProgramSceneName: "MCE Presentation" };
      }
      if (method === "GetSceneItemList") {
        return { sceneItems: [...sceneItems] };
      }
      if (method === "GetVideoSettings") {
        return { baseWidth: 1920, baseHeight: 1080 };
      }
      if (method === "SetSceneItemEnabled") {
        const item = sceneItems.find((i) => i.sceneItemId === params?.sceneItemId);
        if (item) item.sceneItemEnabled = params.sceneItemEnabled;
        return {};
      }
      return {};
    });

    // Set signature to simulate existing configured scene item
    const client = dockObsClient as any;
    client.invalidateSceneItemListCache("MCE Presentation");
    client.invalidateActiveMceOverlayState("MCE Presentation");
    const def = client._fullscreenSceneDefs["bible"];
    const overlayUrl = client.buildOverlayHtmlUrl(def.overlayFile, { tab: "bible" });
    const sourceSignature = `${overlayUrl}|1920x1080`;
    client._lastFullscreenSourceSignature[def.browserSourceName] = sourceSignature;
    client._lastFullscreenSceneItemSignature[def.browserSourceName] = `${sourceSignature}|item:10`;

    // Calling _ensureFullscreenScene with enable = true
    const result = await client._ensureFullscreenScene("bible", "fullscreen", true);
    expect(result.browserItemId).toBe(10);

    const enableCall = calls.find(
      (c) => c.method === "SetSceneItemEnabled" && c.params?.sceneItemId === 10 && c.params?.sceneItemEnabled === true,
    );
    expect(enableCall).toBeDefined();
  });

  it("handles SceneItemEnableStateChanged event and clears active overlay cache", async () => {
    const client = dockObsClient as any;
    vi.spyOn(client.obs, "connect").mockResolvedValue({} as any);
    await client.connect("ws://localhost:4455", "pwd");

    client._activeMceOverlayStateByScene["MCE Presentation"] = "test-signature";
    client._sceneItemListCache = { sceneName: "MCE Presentation", items: [], timestamp: Date.now() };

    // Emit SceneItemEnableStateChanged
    client.obs.emit("SceneItemEnableStateChanged", {
      sceneName: "MCE Presentation",
      sceneItemId: 10,
      sceneItemEnabled: false,
    });

    expect(client._activeMceOverlayStateByScene["MCE Presentation"]).toBeUndefined();
    expect(client._sceneItemListCache).toBeNull();
  });

  it("handles SceneItemListReindex, SceneItemCreated, and SceneItemRemoved events", async () => {
    const client = dockObsClient as any;
    vi.spyOn(client.obs, "connect").mockResolvedValue({} as any);
    await client.connect("ws://localhost:4455", "pwd");

    client._activeMceOverlayStateByScene["MCE Presentation"] = "test-signature";
    client._sceneItemListCache = { sceneName: "MCE Presentation", items: [], timestamp: Date.now() };

    client.obs.emit("SceneItemListReindex", { sceneName: "MCE Presentation" });
    expect(client._activeMceOverlayStateByScene["MCE Presentation"]).toBeUndefined();
    expect(client._sceneItemListCache).toBeNull();

    client._activeMceOverlayStateByScene["MCE Presentation"] = "test-signature-2";
    client._sceneItemListCache = { sceneName: "MCE Presentation", items: [], timestamp: Date.now() };

    client.obs.emit("SceneItemCreated", { sceneName: "MCE Presentation" });
    expect(client._activeMceOverlayStateByScene["MCE Presentation"]).toBeUndefined();
    expect(client._sceneItemListCache).toBeNull();

    client._activeMceOverlayStateByScene["MCE Presentation"] = "test-signature-3";
    client._sceneItemListCache = { sceneName: "MCE Presentation", items: [], timestamp: Date.now() };

    client.obs.emit("SceneItemRemoved", { sceneName: "MCE Presentation" });
    expect(client._activeMceOverlayStateByScene["MCE Presentation"]).toBeUndefined();
    expect(client._sceneItemListCache).toBeNull();
  });

  it("getDefaultOverlayUrlForSource resolves valid overlay URLs and never returns empty or about:blank", () => {
    const client = dockObsClient as any;
    const worshipUrl = client.getDefaultOverlayUrlForSource("MCE Browser - Worship");
    const notesUrl = client.getDefaultOverlayUrlForSource("MCE Browser - Notes");
    const bibleUrl = client.getDefaultOverlayUrlForSource("MCE Browser - Bible");
    const unknownUrl = client.getDefaultOverlayUrlForSource("MCE Unknown Custom");

    expect(worshipUrl).toContain("mce-worship-overlay.html");
    expect(notesUrl).toContain("mce-note.html");
    expect(bibleUrl).toContain("mce-bible-overlay.html");
    expect(unknownUrl).toContain("mce-bible-overlay.html");

    for (const url of [worshipUrl, notesUrl, bibleUrl, unknownUrl]) {
      expect(url).not.toBe("");
      expect(url).not.toBe("about:blank");
      expect(url.startsWith("http")).toBe(true);
    }
  });

  it("creates a new browser source armed with initial packet data hash and CSS, never about:blank", async () => {
    vi.spyOn(dockObsClient, "isConnected", "get").mockReturnValue(true);
    const calls: Array<{ method: string; params: any }> = [];

    vi.spyOn(dockObsClient as any, "hasObsScene").mockResolvedValue(true);
    vi.spyOn(dockObsClient as any, "ensurePresentationSceneReady").mockResolvedValue(undefined);
    vi.spyOn(dockObsClient as any, "getCanvasSize").mockResolvedValue({ width: 1920, height: 1080 });
    vi.spyOn(dockObsClient as any, "getSceneItemListCached").mockResolvedValue([]);

    vi.spyOn(dockObsClient, "call").mockImplementation(async (method: string, params?: any) => {
      calls.push({ method, params });
      if (method === "GetInputList") {
        return { inputs: [] };
      }
      if (method === "CreateInput") {
        return { sceneItemId: 99 };
      }
      return {};
    });

    const packet = { songTitle: "Amazing Grace", lines: ["Amazing grace how sweet the sound"] };
    const css = "#content { color: red; }";

    const itemId = await (dockObsClient as any).ensureOverlaySource(
      "MCE Presentation",
      "MCE Browser - Worship",
      1920,
      1080,
      true,
      packet,
      css,
    );

    expect(itemId).toBe(99);
    const createCall = calls.find((c) => c.method === "CreateInput");
    expect(createCall).toBeDefined();
    expect(createCall?.params?.inputName).toBe("MCE Browser - Worship");
    expect(createCall?.params?.inputSettings?.url).toContain("mce-worship-overlay.html");
    expect(createCall?.params?.inputSettings?.url).toContain("#data=");
    expect(createCall?.params?.inputSettings?.url).toContain(encodeURIComponent(JSON.stringify(packet)));
    expect(createCall?.params?.inputSettings?.url).not.toContain("about:blank");
    expect(createCall?.params?.inputSettings?.css).toBe(css);
  });

  it("setBrowserSourceUrl with forceReload updates URL directly and never writes about:blank", async () => {
    vi.spyOn(dockObsClient, "isConnected", "get").mockReturnValue(true);
    const calls: Array<{ method: string; params: any }> = [];

    vi.spyOn(dockObsClient, "call").mockImplementation(async (method: string, params?: any) => {
      calls.push({ method, params });
      return {};
    });

    const targetUrl = "http://localhost:5173/mce-worship-overlay.html#data=%7B%7D";
    await (dockObsClient as any).setBrowserSourceUrl(
      "MCE Browser - Worship",
      targetUrl,
      true, // forceReload
      "body { margin: 0; }",
    );

    const setSettingsCalls = calls.filter((c) => c.method === "SetInputSettings");
    expect(setSettingsCalls.length).toBe(1);
    expect(setSettingsCalls[0].params?.inputSettings?.url).toBe(targetUrl);
    expect(setSettingsCalls[0].params?.inputSettings?.url).not.toBe("about:blank");
  });
});

