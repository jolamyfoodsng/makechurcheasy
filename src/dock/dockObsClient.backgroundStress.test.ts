import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dockObsClient } from "./dockObsClient";

type BackgroundTheme = Record<string, unknown>;
type InputState = {
  inputKind: string;
  inputSettings: Record<string, unknown>;
};
type SceneItemState = {
  sourceName: string;
  sceneItemId: number;
  sceneItemIndex: number;
  enabled: boolean;
};

function makeBackgroundTheme(overrides: Partial<BackgroundTheme>): BackgroundTheme {
  return {
    backgroundColor: "transparent",
    backgroundColorEnd: "",
    backgroundImage: "",
    backgroundImageFilePath: "",
    backgroundPattern: "",
    backgroundVideo: "",
    backgroundVideoFilePath: "",
    backgroundOpacity: 1,
    ...overrides,
  };
}

function decodeBackgroundPacket(url: string): Record<string, unknown> {
  const encoded = url.split("#data=")[1] ?? "";
  return JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
}

describe("dockObsClient background reflection stress", () => {
  const client = dockObsClient as unknown as Record<string, any>;
  let originalMethods: Record<string, unknown>;
  let inputs: Map<string, InputState>;
  let sceneItems: Map<string, Map<string, SceneItemState>>;
  let nextSceneItemId: number;
  let callLog: Array<{ method: string; payload: Record<string, unknown> }>;
  let currentProgramSceneName: string;
  let currentPreviewSceneName: string;
  let studioModeEnabled: boolean;

  const fullscreenVariants = [
    {
      expectedKind: "color_source_v3",
      theme: makeBackgroundTheme({
        backgroundColor: "#123456",
        backgroundColorEnd: "#123456",
      }),
      assertInput: (input: InputState) => {
        expect(input.inputSettings.color).toBeTypeOf("number");
      },
    },
    {
      expectedKind: "image_source",
      theme: makeBackgroundTheme({
        backgroundImage: "/uploads/fullscreen-a.png",
        backgroundImageFilePath: "/tmp/fullscreen-a.png",
      }),
      assertInput: (input: InputState) => {
        expect(input.inputSettings.file).toBe("/tmp/fullscreen-a.png");
      },
    },
    {
      expectedKind: "ffmpeg_source",
      theme: makeBackgroundTheme({
        backgroundVideo: "file:///tmp/fullscreen-a.mp4",
        backgroundVideoFilePath: "/tmp/fullscreen-a.mp4",
      }),
      assertInput: (input: InputState) => {
        expect(input.inputSettings.local_file).toBe("/tmp/fullscreen-a.mp4");
      },
    },
    {
      expectedKind: "browser_source",
      theme: makeBackgroundTheme({
        backgroundColor: "#101820",
        backgroundColorEnd: "#203040",
      }),
      assertInput: (input: InputState) => {
        const packet = decodeBackgroundPacket(String(input.inputSettings.url || ""));
        expect((packet.theme as Record<string, unknown>).backgroundColor).toBe("#101820");
        expect((packet.theme as Record<string, unknown>).backgroundColorEnd).toBe("#203040");
      },
    },
    {
      expectedKind: "browser_source",
      theme: makeBackgroundTheme({
        backgroundPattern: "diagonal-lines",
      }),
      assertInput: (input: InputState) => {
        const packet = decodeBackgroundPacket(String(input.inputSettings.url || ""));
        expect((packet.theme as Record<string, unknown>).backgroundPattern).toBe("diagonal-lines");
      },
    },
  ] as const;

  const lowerThirdVariants = [
    {
      theme: makeBackgroundTheme({
        backgroundColor: "#112233",
      }),
      assertTheme: (theme: Record<string, unknown>) => {
        expect(theme.backgroundColor).toBe("#112233");
      },
    },
    {
      theme: makeBackgroundTheme({
        backgroundColor: "#112233",
        backgroundColorEnd: "#334455",
      }),
      assertTheme: (theme: Record<string, unknown>) => {
        expect(theme.backgroundColor).toBe("#112233");
        expect(theme.backgroundColorEnd).toBe("#334455");
      },
    },
    {
      theme: makeBackgroundTheme({
        backgroundImage: "/uploads/lower-third-image.png",
      }),
      assertTheme: (theme: Record<string, unknown>) => {
        expect(theme.backgroundImage).toBe("/uploads/lower-third-image.png");
      },
    },
    {
      theme: makeBackgroundTheme({
        backgroundVideo: "/uploads/lower-third-video.mp4",
      }),
      assertTheme: (theme: Record<string, unknown>) => {
        expect(theme.backgroundVideo).toBe("/uploads/lower-third-video.mp4");
      },
    },
    {
      theme: makeBackgroundTheme({
        backgroundPattern: "cross-hatch",
      }),
      assertTheme: (theme: Record<string, unknown>) => {
        expect(theme.backgroundPattern).toBe("cross-hatch");
      },
    },
  ] as const;

  beforeEach(() => {
    originalMethods = {
      call: client.call,
      getCanvasSize: client.getCanvasSize,
      getSceneItemListCached: client.getSceneItemListCached,
      invalidateSceneItemListCache: client.invalidateSceneItemListCache,
      buildOverlayHtmlUrl: client.buildOverlayHtmlUrl,
      bringBibleOverlayForward: client.bringBibleOverlayForward,
      publishFullscreenOverlayPacket: client.publishFullscreenOverlayPacket,
      deliverCssOverlayPacket: client.deliverCssOverlayPacket,
      getPresentationTargetScene: client.getPresentationTargetScene,
      fitSceneSourceToLowerThirdWindow: client.fitSceneSourceToLowerThirdWindow,
      ensureTickerAboveSource: client.ensureTickerAboveSource,
      promotePresentationScene: client.promotePresentationScene,
      ensurePresentationPreviewActive: client.ensurePresentationPreviewActive,
      ensurePresentationSceneReady: client.ensurePresentationSceneReady,
      ensureDedicatedScene: client.ensureDedicatedScene,
      getCurrentProgramSceneName: client.getCurrentProgramSceneName,
      waitForSceneMatch: client.waitForSceneMatch,
      prepareFastOverlayScene: client.prepareFastOverlayScene,
      pushWorshipLyrics: client.pushWorshipLyrics,
      pushNotesLyrics: client.pushNotesLyrics,
      readSceneMode: client.readSceneMode,
      isStudioModeEnabled: client.isStudioModeEnabled,
      sleep: client.sleep,
      _status: client._status,
    };

    inputs = new Map();
    sceneItems = new Map();
    nextSceneItemId = 1;
    callLog = [];
    currentProgramSceneName = "Main";
    currentPreviewSceneName = "Preview";
    studioModeEnabled = false;

    client.resetPresentationSceneState();
    client._status = "connected";

    client.getCanvasSize = vi.fn(async () => ({ width: 1920, height: 1080 }));
    client.sleep = vi.fn(async () => {});
    client.buildOverlayHtmlUrl = vi.fn((file: string) => `http://overlay.test/${file}`);
    client.invalidateSceneItemListCache = vi.fn();
    client.getSceneItemListCached = vi.fn(async (sceneName: string) => {
      const items = Array.from(sceneItems.get(sceneName)?.values() ?? []);
      return items.map((item) => ({
        sourceName: item.sourceName,
        sceneItemId: item.sceneItemId,
        sceneItemIndex: item.sceneItemIndex,
      }));
    });
    client.call = vi.fn(async (method: string, payload: Record<string, unknown> = {}) => {
      callLog.push({ method, payload });

      switch (method) {
        case "GetInputList":
          return {
            inputs: Array.from(inputs.entries()).map(([inputName, input]) => ({
              inputName,
              inputKind: input.inputKind,
            })),
          };
        case "CreateInput":
          inputs.set(String(payload.inputName), {
            inputKind: String(payload.inputKind),
            inputSettings: { ...(payload.inputSettings as Record<string, unknown>) },
          });
          return {};
        case "SetInputSettings": {
          const inputName = String(payload.inputName);
          const existing = inputs.get(inputName);
          if (!existing) throw new Error(`Missing input ${inputName}`);
          existing.inputSettings = { ...(payload.inputSettings as Record<string, unknown>) };
          return {};
        }
        case "GetInputSettings": {
          const inputName = String(payload.inputName);
          const existing = inputs.get(inputName);
          if (!existing) throw new Error(`Missing input ${inputName}`);
          return { inputSettings: existing.inputSettings };
        }
        case "CallVendorRequest":
          return {};
        case "RemoveInput":
          inputs.delete(String(payload.inputName));
          return {};
        case "GetSceneItemList": {
          const items = Array.from(sceneItems.get(String(payload.sceneName))?.values() ?? []);
          return {
            sceneItems: items.map((item) => ({
            sourceName: item.sourceName,
            sceneItemId: item.sceneItemId,
            sceneItemIndex: item.sceneItemIndex,
            sceneItemEnabled: item.enabled,
          })),
        };
        }
        case "GetSceneList":
          return {
            scenes: Array.from(sceneItems.keys()).map((sceneName) => ({ sceneName })),
          };
        case "CreateScene":
          if (!sceneItems.has(String(payload.sceneName))) {
            sceneItems.set(String(payload.sceneName), new Map());
          }
          return {};
        case "GetStudioModeEnabled":
          return { studioModeEnabled };
        case "GetCurrentProgramScene":
          return { currentProgramSceneName };
        case "SetCurrentProgramScene":
          currentProgramSceneName = String(payload.sceneName);
          return {};
        case "GetCurrentPreviewScene":
          return { currentPreviewSceneName };
        case "SetCurrentPreviewScene":
          currentPreviewSceneName = String(payload.sceneName);
          return {};
        case "CreateSceneItem": {
          const sceneName = String(payload.sceneName);
          const sourceName = String(payload.sourceName);
          const item: SceneItemState = {
            sourceName,
            sceneItemId: nextSceneItemId++,
            sceneItemIndex: 0,
            enabled: payload.sceneItemEnabled !== false,
          };
          if (!sceneItems.has(sceneName)) sceneItems.set(sceneName, new Map());
          sceneItems.get(sceneName)!.set(sourceName, item);
          return { sceneItemId: item.sceneItemId };
        }
        case "SetSceneItemTransform":
          return {};
        case "SetSceneItemIndex": {
          const sceneName = String(payload.sceneName);
          const sceneItemId = Number(payload.sceneItemId);
          const item = Array.from(sceneItems.get(sceneName)?.values() ?? []).find((entry) => entry.sceneItemId === sceneItemId);
          if (item) item.sceneItemIndex = Number(payload.sceneItemIndex);
          return {};
        }
        case "SetSceneItemEnabled": {
          const sceneName = String(payload.sceneName);
          const sceneItemId = Number(payload.sceneItemId);
          const item = Array.from(sceneItems.get(sceneName)?.values() ?? []).find((entry) => entry.sceneItemId === sceneItemId);
          if (item) item.enabled = Boolean(payload.sceneItemEnabled);
          return {};
        }
        case "RemoveSceneItem": {
          const sceneName = String(payload.sceneName);
          const sceneItemId = Number(payload.sceneItemId);
          const target = Array.from(sceneItems.get(sceneName)?.entries() ?? []).find(([, item]) => item.sceneItemId === sceneItemId);
          if (target) sceneItems.get(sceneName)!.delete(target[0]);
          return {};
        }
        default:
          throw new Error(`Unhandled OBS call: ${method}`);
      }
    });
  });

  afterEach(() => {
    Object.assign(client, originalMethods);
    client.resetPresentationSceneState();
    vi.restoreAllMocks();
  });

  it("reflects 50 sequential fullscreen background changes across OBS source types", async () => {
    for (let index = 0; index < 50; index += 1) {
      const variant = fullscreenVariants[index % fullscreenVariants.length];
      const beforeCalls = callLog.length;

      await client._ensureFullscreenBgSource("bible", variant.theme);

      expect(callLog.length).toBeGreaterThan(beforeCalls);

      const names = client._bgSourceNames("bible");
      const activeSlot = client._bgActiveSlot["bible"] || "A";
      const activeName = activeSlot === "A" ? names.a : names.b;
      const activeInput = inputs.get(activeName);

      expect(activeInput?.inputKind).toBe(variant.expectedKind);
      variant.assertInput(activeInput!);
      expect(client._activeFullscreenBgSignature["bible"]).not.toBe("__hidden__");
    }
  });

  it("switches OBS Preview to MCE Presentation when Studio Mode is enabled", async () => {
    studioModeEnabled = true;
    currentProgramSceneName = "Pastor Camera";
    currentPreviewSceneName = "Offering";
    sceneItems.set("MCE Presentation", new Map());
    sceneItems.set("Pastor Camera", new Map());
    client.ensurePresentationSceneReady = vi.fn(async () => {});
    client.readSceneMode = vi.fn(() => "no-clone");

    await client.promotePresentationScene("bible");

    expect(callLog).toContainEqual({
      method: "SetCurrentPreviewScene",
      payload: { sceneName: "MCE Presentation" },
    });
    expect(callLog).not.toContainEqual({
      method: "SetCurrentProgramScene",
      payload: { sceneName: "MCE Presentation" },
    });
  });

  it("switches OBS Program to MCE Presentation when Studio Mode is disabled", async () => {
    studioModeEnabled = false;
    currentProgramSceneName = "Pastor Camera";
    currentPreviewSceneName = "";
    sceneItems.set("MCE Presentation", new Map([
      ["MCE Worship", { sourceName: "MCE Worship", sceneItemId: 10, sceneItemIndex: 1, enabled: true }],
    ]));
    sceneItems.set("Pastor Camera", new Map());
    client.ensurePresentationSceneReady = vi.fn(async () => {});
    client.readSceneMode = vi.fn(() => "auto-duplicate");

    await client.promotePresentationScene("worship");

    expect(sceneItems.get("MCE Presentation")?.has("Pastor Camera")).toBe(true);
    expect(callLog).toContainEqual({
      method: "SetCurrentProgramScene",
      payload: { sceneName: "MCE Presentation" },
    });
    expect(callLog.some((entry) => (
      entry.method === "CreateSceneItem" &&
      entry.payload.sceneName === "Pastor Camera" &&
      entry.payload.sourceName === "MCE Presentation"
    ))).toBe(false);
  });

  it("removes Program scene nesting when Program background is turned off", async () => {
    sceneItems.set("MCE Presentation", new Map([
      ["Pastor Camera", { sourceName: "Pastor Camera", sceneItemId: 10, sceneItemIndex: 0, enabled: true }],
      ["MCE Worship", { sourceName: "MCE Worship", sceneItemId: 11, sceneItemIndex: 1, enabled: true }],
    ]));
    sceneItems.set("Pastor Camera", new Map([
      ["MCE Presentation", { sourceName: "MCE Presentation", sceneItemId: 20, sceneItemIndex: 3, enabled: true }],
    ]));
    client.readSceneMode = vi.fn(() => "no-clone");
    client.ensurePresentationSceneReady = vi.fn(async () => {});
    client.getCurrentProgramSceneName = vi.fn(async () => "Pastor Camera");

    await client.applyProjectionSettings({ allowSceneMutation: true });

    expect(sceneItems.get("MCE Presentation")?.has("Pastor Camera")).toBe(false);
    expect(sceneItems.get("MCE Presentation")?.has("MCE Worship")).toBe(true);
    expect(sceneItems.get("Pastor Camera")?.has("MCE Presentation")).toBe(false);
  });

  it("replaces the previous Program scene underlay instead of stacking program scenes", async () => {
    sceneItems.set("MCE Presentation", new Map([
      ["Pastor Camera", { sourceName: "Pastor Camera", sceneItemId: 10, sceneItemIndex: 0, enabled: true }],
      ["MCE Worship", { sourceName: "MCE Worship", sceneItemId: 11, sceneItemIndex: 1, enabled: true }],
    ]));
    sceneItems.set("Pastor Camera", new Map());
    sceneItems.set("Camera 2", new Map());
    client.readSceneMode = vi.fn(() => "auto-duplicate");
    client.isStudioModeEnabled = vi.fn(async () => true);
    client.ensurePresentationSceneReady = vi.fn(async () => {});
    client.getCurrentProgramSceneName = vi.fn(async () => "Camera 2");

    await client.ensureProgramSceneAsSourceInPresentation(true);

    const presentationItems = sceneItems.get("MCE Presentation");
    expect(presentationItems?.has("Pastor Camera")).toBe(false);
    expect(presentationItems?.has("Camera 2")).toBe(true);
    expect(presentationItems?.has("MCE Worship")).toBe(true);
    expect(Array.from(presentationItems?.values() ?? []).filter((item) => (
      item.sourceName === "Pastor Camera" || item.sourceName === "Camera 2"
    ))).toHaveLength(1);
  });

  it("reuses the current Program scene underlay when it is already correct", async () => {
    sceneItems.set("MCE Presentation", new Map([
      ["Camera 2", { sourceName: "Camera 2", sceneItemId: 10, sceneItemIndex: 0, enabled: true }],
      ["MCE Worship", { sourceName: "MCE Worship", sceneItemId: 11, sceneItemIndex: 1, enabled: true }],
    ]));
    sceneItems.set("Camera 2", new Map());
    client.readSceneMode = vi.fn(() => "auto-duplicate");
    client.isStudioModeEnabled = vi.fn(async () => true);
    client.ensurePresentationSceneReady = vi.fn(async () => {});
    client.getCurrentProgramSceneName = vi.fn(async () => "Camera 2");

    await client.ensureProgramSceneAsSourceInPresentation();
    const callsAfterFirstPass = callLog.length;
    await client.ensureProgramSceneAsSourceInPresentation();

    const presentationItems = sceneItems.get("MCE Presentation");
    expect(presentationItems?.has("Camera 2")).toBe(true);
    expect(presentationItems?.has("MCE Worship")).toBe(true);
    expect(callLog.some((entry) => (
      entry.method === "CreateSceneItem" &&
      entry.payload.sceneName === "MCE Presentation" &&
      entry.payload.sourceName === "Camera 2"
    ))).toBe(false);
    expect(callLog.some((entry) => (
      entry.method === "RemoveSceneItem" &&
      entry.payload.sceneName === "MCE Presentation" &&
      entry.payload.sceneItemId === 10
    ))).toBe(false);
    expect(callLog).toHaveLength(callsAfterFirstPass);
  });

  it("keeps the copied Program scene underlay when MCE Presentation is already Program", async () => {
    sceneItems.set("MCE Presentation", new Map([
      ["Pastor Camera", { sourceName: "Pastor Camera", sceneItemId: 10, sceneItemIndex: 0, enabled: true }],
      ["MCE Worship", { sourceName: "MCE Worship", sceneItemId: 11, sceneItemIndex: 1, enabled: true }],
    ]));
    sceneItems.set("Pastor Camera", new Map());
    client.readSceneMode = vi.fn(() => "auto-duplicate");
    client.isStudioModeEnabled = vi.fn(async () => true);
    client.ensurePresentationSceneReady = vi.fn(async () => {});
    client.getCurrentProgramSceneName = vi.fn(async () => "MCE Presentation");

    await client.ensureProgramSceneAsSourceInPresentation(true);

    expect(sceneItems.get("MCE Presentation")?.has("Pastor Camera")).toBe(true);
    expect(sceneItems.get("MCE Presentation")?.has("MCE Worship")).toBe(true);
    expect(callLog.some((entry) => (
      entry.method === "RemoveSceneItem" &&
      entry.payload.sceneName === "MCE Presentation" &&
      entry.payload.sceneItemId === 10
    ))).toBe(false);
  });

  it("keeps routing live on repeated fast overlay sends while layout prep stays cached", async () => {
    const fitSource = vi.fn(async () => {});
    client.promotePresentationScene = vi.fn(async () => {});
    client.ensureTickerAboveSource = vi.fn(async () => {});
    client.getPresentationTargetScene = vi.fn(async () => ({ sceneName: "MCE Presentation" }));

    await client.prepareFastOverlayScene("bible", "MCE Browser - Bible", fitSource);
    await client.prepareFastOverlayScene("bible", "MCE Browser - Bible", fitSource);

    expect(client.promotePresentationScene).toHaveBeenCalledTimes(2);
    expect(fitSource).toHaveBeenCalledTimes(2);
  });

  it("does not copy managed multiview Program scenes into MCE Presentation", async () => {
    sceneItems.set("MCE Presentation", new Map([
      ["Pastor Camera", { sourceName: "Pastor Camera", sceneItemId: 10, sceneItemIndex: 0, enabled: true }],
      ["MCE Worship", { sourceName: "MCE Worship", sceneItemId: 11, sceneItemIndex: 1, enabled: true }],
    ]));
    sceneItems.set("Pastor Camera", new Map());
    sceneItems.set("MV: Multiview 1", new Map());
    client.readSceneMode = vi.fn(() => "auto-duplicate");
    client.isStudioModeEnabled = vi.fn(async () => true);
    client.ensurePresentationSceneReady = vi.fn(async () => {});
    client.getCurrentProgramSceneName = vi.fn(async () => "MV: Multiview 1");

    await client.ensureProgramSceneAsSourceInPresentation(true);

    const presentationItems = sceneItems.get("MCE Presentation");
    expect(presentationItems?.has("Pastor Camera")).toBe(false);
    expect(presentationItems?.has("MV: Multiview 1")).toBe(false);
    expect(presentationItems?.has("MCE Worship")).toBe(true);
    expect(callLog.some((entry) => (
      entry.method === "CreateSceneItem" &&
      entry.payload.sceneName === "MCE Presentation" &&
      entry.payload.sourceName === "MV: Multiview 1"
    ))).toBe(false);
  });

  it("turns multiview scenes off immediately without fade filters", async () => {
    sceneItems.set("MV: Multiview 1", new Map([
      ["mv_a", { sourceName: "mv_a", sceneItemId: 10, sceneItemIndex: 0, enabled: true }],
      ["mv_b", { sourceName: "mv_b", sceneItemId: 11, sceneItemIndex: 1, enabled: true }],
    ]));

    await client.fadeOutAllSceneItems("MV: Multiview 1");

    expect(Array.from(sceneItems.get("MV: Multiview 1")?.values() ?? []).every((item) => item.enabled === false)).toBe(true);
    expect(callLog.some((entry) => (
      entry.method === "CreateSourceFilter" ||
      entry.method === "SetSourceFilterSettings" ||
      entry.method === "RemoveSourceFilter"
    ))).toBe(false);
  });

  it("does not rewrite the Bible browser URL when OBS already has the overlay document loaded", async () => {
    const sourceName = "MCE Browser - Bible";
    const baseUrl = "http://overlay.test/mce-bible-overlay.html?v=2026-07-29-1-lt-bg-image&tab=bible";
    inputs.set(sourceName, {
      inputKind: "browser_source",
      inputSettings: {
        url: `${baseUrl}#data=${encodeURIComponent(JSON.stringify({ mode: "fullscreen", slide: { text: "Old verse" } }))}`,
        css: "",
      },
    });
    client._lastBrowserSourceUrlBySource[sourceName] = "";

    await client.deliverCssOverlayPacket(
      sourceName,
      "bible",
      {
        slide: { id: "dock-bible-slide", reference: "Acts 3:1 (KJV)", text: "Now Peter and John went up together.", verseRange: "1" },
        theme: makeBackgroundTheme({ backgroundPattern: "diagonal-lines" }),
        live: true,
        blanked: false,
        timestamp: 123,
        mode: "fullscreen",
      },
      baseUrl,
      "",
    );

    const urlWrites = callLog.filter((entry) =>
      entry.method === "SetInputSettings" &&
      Object.prototype.hasOwnProperty.call(entry.payload.inputSettings as Record<string, unknown>, "url")
    );

    expect(urlWrites).toHaveLength(0);
    expect(callLog.some((entry) => entry.method === "GetInputSettings" && entry.payload.inputName === sourceName)).toBe(true);
    expect(callLog.some((entry) => entry.method === "CallVendorRequest")).toBe(true);
    expect(client._lastBrowserSourceUrlBySource[sourceName]).toBe(baseUrl);
  });

  it("delivers Bible background changes as live events without rewriting OBS browser CSS", async () => {
    const sourceName = "MCE Browser - Bible";
    const baseUrl = "http://overlay.test/mce-bible-overlay.html?v=2026-07-29-1-lt-bg-image&tab=bible";
    inputs.set(sourceName, {
      inputKind: "browser_source",
      inputSettings: { url: baseUrl, css: "" },
    });
    client._lastBrowserSourceUrlBySource[sourceName] = baseUrl;
    client._lastCssOverlayPacketBySource[sourceName] = {
      slide: { id: "dock-bible-slide", reference: "Acts 3:1 (KJV)", text: "Old verse", verseRange: "1" },
      theme: makeBackgroundTheme({ backgroundColor: "#000000" }),
      live: true,
      blanked: false,
      timestamp: 122,
      mode: "fullscreen",
    };
    client._lastCssOverlayBaseUrlBySource[sourceName] = baseUrl;
    client._lastCssOverlayThemeCssBySource[sourceName] = "";

    await client.deliverCssOverlayPacket(
      sourceName,
      "bible",
      {
        slide: { id: "dock-bible-slide", reference: "Acts 3:1 (KJV)", text: "Old verse", verseRange: "1" },
        theme: makeBackgroundTheme({ backgroundPattern: "diagonal-lines" }),
        live: true,
        blanked: false,
        timestamp: 124,
        mode: "fullscreen",
      },
      baseUrl,
      ":root { --bg-pattern-data: url(\"data:image/svg+xml,%3Csvg%2F%3E\"); }",
    );

    const sourceWrites = callLog.filter((entry) => entry.method === "SetInputSettings");

    expect(sourceWrites).toHaveLength(0);
    expect(callLog.some((entry) => entry.method === "CallVendorRequest")).toBe(true);
    expect(client._lastCssOverlayThemeCssBySource[sourceName]).toContain("--bg-pattern-data");
  });

  it("falls back to a durable CSS packet when a live Bible click event is not acknowledged", async () => {
    const sourceName = "MCE Browser - Bible";
    const baseUrl = "http://overlay.test/mce-bible-overlay.html?v=2026-07-29-1-lt-bg-image&tab=bible";
    const theme = makeBackgroundTheme({ backgroundColor: "#000000" });

    inputs.set(sourceName, {
      inputKind: "browser_source",
      inputSettings: { url: baseUrl, css: "" },
    });
    client._lastBrowserSourceUrlBySource[sourceName] = baseUrl;
    client._lastCssOverlayPacketBySource[sourceName] = {
      slide: { id: "dock-bible-slide", reference: "Acts 3:1 (KJV)", text: "Old verse", verseRange: "1" },
      theme,
      live: true,
      blanked: false,
      timestamp: 122,
      mode: "fullscreen",
    };
    client._lastCssOverlayBaseUrlBySource[sourceName] = baseUrl;
    client._lastCssOverlayThemeCssBySource[sourceName] = "";

    await client.deliverCssOverlayPacket(
      sourceName,
      "bible",
      {
        slide: { id: "dock-bible-slide", reference: "Acts 3:2 (KJV)", text: "A new visible verse", verseRange: "2" },
        theme,
        live: true,
        blanked: false,
        timestamp: 124,
        mode: "fullscreen",
      },
      baseUrl,
      "",
    );

    const cssWrites = callLog.filter((entry) =>
      entry.method === "SetInputSettings" &&
      Object.prototype.hasOwnProperty.call(entry.payload.inputSettings as Record<string, unknown>, "css")
    );

    expect(callLog.some((entry) => entry.method === "CallVendorRequest")).toBe(true);
    expect(cssWrites).toHaveLength(1);
    expect(String((cssWrites[0].payload.inputSettings as Record<string, unknown>).css)).toContain("A%20new%20visible%20verse");
  });

  it("keeps Bible fullscreen setup stable when only background settings change", () => {
    const firstSignature = client.buildBibleFullscreenSetupSignature(
      "MCE Presentation",
      "Camera",
      makeBackgroundTheme({ backgroundPattern: "diagonal-lines" }),
    );
    const nextSignature = client.buildBibleFullscreenSetupSignature(
      "MCE Presentation",
      "Camera",
      makeBackgroundTheme({ backgroundPattern: "cross-hatch", backgroundOpacity: 0.75 }),
    );

    expect(nextSignature).toBe(firstSignature);
  });

  it.each([
    {
      label: "Worship",
      tab: "worship",
      sourceName: "MCE Worship",
      baseUrl: "http://overlay.test/mce-worship-overlay.html",
      initializedKey: "_worshipInitialized",
      fastMethod: "pushWorshipOverlayFast",
      fallbackMethod: "pushWorshipLyrics",
    },
    {
      label: "Notes",
      tab: "notes",
      sourceName: "MCE Notes",
      baseUrl: "http://overlay.test/mce-note.html",
      initializedKey: "_notesInitialized",
      fastMethod: "pushNotesOverlayFast",
      fallbackMethod: "pushNotesLyrics",
    },
  ] as const)("reuses the loaded $label overlay document after a dock reload", async ({
    tab,
    sourceName,
    baseUrl,
    initializedKey,
    fastMethod,
    fallbackMethod,
  }) => {
    inputs.set(sourceName, {
      inputKind: "browser_source",
      inputSettings: {
        url: `${baseUrl}#data=${encodeURIComponent(JSON.stringify({ mode: "lower-third", slide: { text: "Old text" } }))}`,
        css: "",
      },
    });
    sceneItems.set("MCE Presentation", new Map([
      [sourceName, { sourceName, sceneItemId: 100, sceneItemIndex: 0, enabled: true }],
    ]));
    client[initializedKey] = false;
    client._lastBrowserSourceUrlBySource[sourceName] = "";
    client[fallbackMethod] = vi.fn(async () => {});
    client.prepareFastOverlayScene = vi.fn(async () => {});

    await client[fastMethod]({
      sectionText: "Keep this text live",
      sectionLabel: "Verse 1",
      songTitle: "Reload Check",
      bibleThemeSettings: makeBackgroundTheme({ backgroundPattern: "diagonal-lines" }),
    });

    const sourceWrites = callLog.filter((entry) => entry.method === "SetInputSettings");

    expect(client[fallbackMethod]).not.toHaveBeenCalled();
    expect(client[initializedKey]).toBe(true);
    expect(client._lastBrowserSourceUrlBySource[sourceName]).toBe(baseUrl);
    expect(client.prepareFastOverlayScene).toHaveBeenCalledWith(tab, sourceName, expect.any(Function));
    expect(callLog.some((entry) => entry.method === "GetInputSettings" && entry.payload.inputName === sourceName)).toBe(true);
    expect(callLog.some((entry) => entry.method === "CallVendorRequest")).toBe(true);
    expect(sourceWrites).toHaveLength(0);
  });

  it.each([
    {
      label: "Worship",
      sourceName: "MCE Worship",
      baseUrl: "http://overlay.test/mce-worship-overlay.html",
      initializedKey: "_worshipInitialized",
      primeMethod: "primeWorshipOverlay",
    },
    {
      label: "Notes",
      sourceName: "MCE Notes",
      baseUrl: "http://overlay.test/mce-note.html",
      initializedKey: "_notesInitialized",
      primeMethod: "primeNotesOverlay",
    },
  ] as const)("does not double-publish $label while priming a loaded overlay document", async ({
    sourceName,
    baseUrl,
    initializedKey,
    primeMethod,
  }) => {
    inputs.set(sourceName, {
      inputKind: "browser_source",
      inputSettings: {
        url: `${baseUrl}#data=${encodeURIComponent(JSON.stringify({ mode: "lower-third", slide: { text: "Already live" } }))}`,
        css: "",
      },
    });
    sceneItems.set("MCE Presentation", new Map([
      [sourceName, { sourceName, sceneItemId: 110, sceneItemIndex: 0, enabled: true }],
    ]));
    client[initializedKey] = false;
    client._lastBrowserSourceUrlBySource[sourceName] = "";
    client.publishFullscreenOverlayPacket = vi.fn();

    await client[primeMethod]({
      sectionText: "Do not flash this",
      sectionLabel: "Verse 1",
      songTitle: "Reload Check",
      overlayMode: "lower-third",
      bibleThemeSettings: makeBackgroundTheme({ backgroundPattern: "diagonal-lines" }),
    });

    const sourceWrites = callLog.filter((entry) => entry.method === "SetInputSettings");

    expect(client.publishFullscreenOverlayPacket).not.toHaveBeenCalled();
    expect(callLog.some((entry) => entry.method === "CallVendorRequest")).toBe(false);
    expect(sourceWrites).toHaveLength(0);
    expect(client[initializedKey]).toBe(true);
    expect(client._lastBrowserSourceUrlBySource[sourceName]).toBe(baseUrl);
    expect(client._lastCssOverlayBaseUrlBySource[sourceName]).toBe(baseUrl);
  });

	  it("reflects 50 sequential Bible lower-third background changes through the fast overlay path", async () => {
    client._bibleLtInitialized = true;
    client._lastBibleMode = "lower-third";
    client._lastBrowserSourceUrlBySource[client._fullscreenSceneDefs.bible.browserSourceName] = "http://overlay.test/existing";
    client.bringBibleOverlayForward = vi.fn(async () => {});
    client.publishFullscreenOverlayPacket = vi.fn();
    const packets: Array<Record<string, unknown>> = [];
    client.deliverCssOverlayPacket = vi.fn(async (_source: string, _type: string, packet: Record<string, unknown>) => {
      packets.push(packet);
    });
    client.getPresentationTargetScene = vi.fn(async () => ({ sceneName: "Preview Scene" }));
    client.fitSceneSourceToLowerThirdWindow = vi.fn(async () => {});
    client.promotePresentationScene = vi.fn(async () => {});

    for (let index = 0; index < 50; index += 1) {
      const variant = lowerThirdVariants[index % lowerThirdVariants.length];
      await client.pushBibleOverlayFast({
        verseText: `Stress verse ${index + 1}`,
        referenceText: "John 3:16 (KJV)",
        verseRange: "16",
        bibleThemeSettings: variant.theme,
      });

      const packet = packets[packets.length - 1];
      expect(packet).toBeTruthy();
      const theme = packet!.theme as Record<string, unknown>;
      variant.assertTheme(theme);
      expect(packet!.mode).toBe("lower-third");
    }
  });

  it("reflects 50 sequential Worship lower-third background changes through the fast overlay path", async () => {
    const sourceName = "MCE Worship";
    client._worshipInitialized = true;
    client._lastOverlayMode[sourceName] = "lower-third";
    client._lastBrowserSourceUrlBySource[sourceName] = "http://overlay.test/existing";
    client.publishFullscreenOverlayPacket = vi.fn();
    const packets: Array<Record<string, unknown>> = [];
    client.deliverCssOverlayPacket = vi.fn(async (_source: string, _type: string, packet: Record<string, unknown>) => {
      packets.push(packet);
    });
    client.getPresentationTargetScene = vi.fn(async () => ({ sceneName: "Preview Scene" }));
    client.fitSceneSourceToLowerThirdWindow = vi.fn(async () => {});
    client.promotePresentationScene = vi.fn(async () => {});

    for (let index = 0; index < 50; index += 1) {
      const variant = lowerThirdVariants[index % lowerThirdVariants.length];
      await client.pushWorshipOverlayFast({
        sectionText: `Stress worship section ${index + 1}`,
        sectionLabel: "Verse",
        songTitle: "Stress Song",
        bibleThemeSettings: variant.theme,
      });

      const packet = packets[packets.length - 1];
      expect(packet).toBeTruthy();
      const theme = packet!.theme as Record<string, unknown>;
      variant.assertTheme(theme);
      expect(packet!.mode).toBe("lower-third");
    }
  });

  it("preserves Worship lower-third text case through the fast overlay path", async () => {
    const sourceName = "MCE Worship";
    client._worshipInitialized = true;
    client._lastOverlayMode[sourceName] = "lower-third";
    client._lastBrowserSourceUrlBySource[sourceName] = "http://overlay.test/existing";
    client.publishFullscreenOverlayPacket = vi.fn();
    const packets: Array<Record<string, unknown>> = [];
    client.deliverCssOverlayPacket = vi.fn(async (_source: string, _type: string, packet: Record<string, unknown>) => {
      packets.push(packet);
    });
    client.fitSceneSourceToLowerThirdWindow = vi.fn(async () => {});

    await client.pushWorshipOverlayFast({
      sectionText: "saved by grace",
      sectionLabel: "Chorus",
      songTitle: "Case Test",
      bibleThemeSettings: makeBackgroundTheme({
        textTransform: "uppercase",
        fontColor: "#ffffff",
        fontSize: 56,
      }),
    });

    const packet = packets[packets.length - 1];
    expect(packet).toBeTruthy();
    expect((packet!.theme as Record<string, unknown>).textTransform).toBe("uppercase");
    expect((packet!.slide as Record<string, unknown>).text).toBe("saved by grace");
  });
});
