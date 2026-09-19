import { beforeEach, describe, expect, it, vi } from "vitest";

const obsMock = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock("../dockObsClient", () => ({ dockObsClient: obsMock }));

import { updateMultiviewBackgroundSource } from "./DockMultiviewTab";

describe("Multi-View live background updates", () => {
  beforeEach(() => {
    obsMock.call.mockReset();
    obsMock.call.mockImplementation(async (requestType: string) => {
      if (requestType === "GetSceneItemList") {
        return { sceneItems: [{ sourceName: "mv_1::BACKGROUND", sceneItemId: 11 }] };
      }
      if (requestType === "GetInputList") {
        return { inputs: [{ inputName: "mv_1::BACKGROUND", inputKind: "image_source" }] };
      }
      if (requestType === "CreateInput") {
        throw new Error("input already exists");
      }
      if (requestType === "GetSceneItemId") {
        return { sceneItemId: 12 };
      }
      return {};
    });
  });

  it("updates an existing managed image source without rebuilding the layout", async () => {
    await updateMultiviewBackgroundSource(
      "MV: Multiview 1",
      "mv_1",
      { type: "image", color: "#0F172A", filePath: "/new/background.png", patternSrc: "", sceneName: "" },
      { type: "image", color: "#0F172A", filePath: "/old/background.png", patternSrc: "", sceneName: "" },
    );

    expect(obsMock.call).toHaveBeenCalledWith("RemoveSceneItem", {
      sceneName: "MV: Multiview 1",
      sceneItemId: 11,
    });
    expect(obsMock.call).toHaveBeenCalledWith("SetInputSettings", {
      inputName: "mv_1::BACKGROUND",
      inputSettings: { file: "/new/background.png", width: 1920, height: 1080 },
    });
    expect(obsMock.call).toHaveBeenCalledWith("AddSceneItem", {
      sceneName: "MV: Multiview 1",
      sourceName: "mv_1::BACKGROUND",
    });
    expect(obsMock.call).toHaveBeenCalledWith("SetSceneItemTransform", expect.objectContaining({
      sceneName: "MV: Multiview 1",
      sceneItemId: 12,
    }));
  });
});
