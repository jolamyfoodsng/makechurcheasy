import { describe, expect, it, vi, beforeEach } from "vitest";
import { dockObsClient } from "./dockObsClient";

describe("Dynamic Canvas Resolution Adaptation (720p / 1080p)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("queries OBS GetVideoSettings and caches canvas size dynamically", async () => {
    const callSpy = vi.spyOn(dockObsClient as any, "call").mockImplementation((async (method: string) => {
      if (method === "GetVideoSettings") {
        return { baseWidth: 1280, baseHeight: 720 };
      }
      return {};
    }) as any);

    // Clear cache
    (dockObsClient as any)._canvasCache = null;

    const size = await dockObsClient.getCanvasSize();
    expect(size).toEqual({ width: 1280, height: 720 });
    expect(callSpy).toHaveBeenCalledWith("GetVideoSettings");
  });

  it("calculates proportional lower third visible height and crop on 720p canvas", async () => {
    vi.spyOn(dockObsClient as any, "getCanvasSize").mockResolvedValue({ width: 1280, height: 720 });
    vi.spyOn(dockObsClient as any, "getSceneItemBySource").mockResolvedValue({ sceneItemId: 42 });

    const callSpy = vi.spyOn(dockObsClient as any, "call").mockResolvedValue({});

    await (dockObsClient as any).fitSceneSourceToLowerThirdWindow("TestScene", "Custom Lower Third");

    // 1. Should update input settings to match 720p canvas
    expect(callSpy).toHaveBeenCalledWith("SetInputSettings", {
      inputName: "Custom Lower Third",
      inputSettings: { width: 1280, height: 720 },
    });

    // 2. Should calculate 42% of 720 = 302, cropTop = 720 - 302 = 418
    expect(callSpy).toHaveBeenCalledWith("SetSceneItemTransform", {
      sceneName: "TestScene",
      sceneItemId: 42,
      sceneItemTransform: {
        positionX: 0,
        positionY: 418,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth: 1280,
        boundsHeight: 302,
        boundsAlignment: 0,
        cropLeft: 0,
        cropTop: 418,
        cropRight: 0,
        cropBottom: 0,
      },
    });
  });

  it("calculates proportional lower third visible height and crop on 1080p canvas", async () => {
    vi.spyOn(dockObsClient as any, "getCanvasSize").mockResolvedValue({ width: 1920, height: 1080 });
    vi.spyOn(dockObsClient as any, "getSceneItemBySource").mockResolvedValue({ sceneItemId: 99 });

    const callSpy = vi.spyOn(dockObsClient as any, "call").mockResolvedValue({});

    await (dockObsClient as any).fitSceneSourceToLowerThirdWindow("TestScene", "Custom Lower Third");

    // 1. Should update input settings to match 1080p canvas
    expect(callSpy).toHaveBeenCalledWith("SetInputSettings", {
      inputName: "Custom Lower Third",
      inputSettings: { width: 1920, height: 1080 },
    });

    // 2. Should calculate 42% of 1080 = 454, cropTop = 1080 - 454 = 626
    expect(callSpy).toHaveBeenCalledWith("SetSceneItemTransform", {
      sceneName: "TestScene",
      sceneItemId: 99,
      sceneItemTransform: {
        positionX: 0,
        positionY: 626,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth: 1920,
        boundsHeight: 454,
        boundsAlignment: 0,
        cropLeft: 0,
        cropTop: 626,
        cropRight: 0,
        cropBottom: 0,
      },
    });
  });
});
