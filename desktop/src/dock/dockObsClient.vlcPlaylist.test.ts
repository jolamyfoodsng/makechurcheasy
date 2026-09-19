import { afterEach, describe, expect, it, vi } from "vitest";
import { dockObsClient } from "./dockObsClient";

describe("dockObsClient.pushVlcPlaylist", () => {
  const client = dockObsClient as unknown as Record<string, any>;
  const originalMethods: Record<string, unknown> = {};

  afterEach(() => {
    for (const [name, method] of Object.entries(originalMethods)) {
      client[name] = method;
    }
    for (const name of Object.keys(originalMethods)) delete originalMethods[name];
  });

  it("sends media locations in OBS's VLC value field", async () => {
    for (const name of ["call", "getCanvasSize", "getPresentationTargetScene", "ensureTickerAboveSource", "isRemotePresentationSession"]) {
      originalMethods[name] = client[name];
    }

    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    client.getCanvasSize = vi.fn(async () => ({ width: 1920, height: 1080 }));
    client.getPresentationTargetScene = vi.fn(async () => ({ sceneName: "MCE Presentation" }));
    client.isRemotePresentationSession = vi.fn(() => false);
    client.ensureTickerAboveSource = vi.fn(async () => {});
    client.call = vi.fn(async (method: string, payload: Record<string, unknown> = {}) => {
      calls.push({ method, payload });
      if (method === "GetSceneItemList") return { sceneItems: [] };
      if (method === "CreateInput") return { sceneItemId: 42 };
      return {};
    });

    await dockObsClient.pushVlcPlaylist({
      sourceName: "Sunday Videos",
      playlist: ["/Users/example/first.mp4", "/Users/example/second.mp4"],
    });

    const createInput = calls.find((entry) => entry.method === "CreateInput");
    expect(createInput?.payload.inputKind).toBe("vlc_source");
    expect(createInput?.payload.inputSettings).toMatchObject({
      playlist: [
        { hidden: false, selected: false, value: "/Users/example/first.mp4" },
        { hidden: false, selected: false, value: "/Users/example/second.mp4" },
      ],
    });

    const transform = calls.find((entry) => entry.method === "SetSceneItemTransform");
    expect(transform?.payload.sceneItemTransform).toMatchObject({
      boundsType: "OBS_BOUNDS_SCALE_OUTER",
      boundsWidth: 1920,
      boundsHeight: 1080,
    });
  });
});
