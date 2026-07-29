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
      promotePresentationScene: client.promotePresentationScene,
      ensurePresentationPreviewActive: client.ensurePresentationPreviewActive,
      ensureDedicatedScene: client.ensureDedicatedScene,
      getCurrentProgramSceneName: client.getCurrentProgramSceneName,
      ensureMCEPresentationInScene: client.ensureMCEPresentationInScene,
      waitForSceneMatch: client.waitForSceneMatch,
      prepareFastOverlayScene: client.prepareFastOverlayScene,
      pushWorshipLyrics: client.pushWorshipLyrics,
      pushNotesLyrics: client.pushNotesLyrics,
    };

    inputs = new Map();
    sceneItems = new Map();
    nextSceneItemId = 1;
    callLog = [];

    client.resetPresentationSceneState();

    client.getCanvasSize = vi.fn(async () => ({ width: 1920, height: 1080 }));
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
            })),
          };
        }
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

  it("does not switch Program to MCE Presentation when promoting dock Bible output", async () => {
    client.ensurePresentationPreviewActive = vi.fn(async () => false);
    client.ensureDedicatedScene = vi.fn(async () => {});
    client.getCurrentProgramSceneName = vi.fn(async () => "Pastor Camera");
    client.ensureMCEPresentationInScene = vi.fn(async () => {});
    client.waitForSceneMatch = vi.fn(async () => {});

    await client.promotePresentationScene("bible");

    expect(client.ensureMCEPresentationInScene).toHaveBeenCalledWith("Pastor Camera");
    expect(callLog).not.toContainEqual({
      method: "SetCurrentProgramScene",
      payload: { sceneName: "MCE Presentation" },
    });
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
});
