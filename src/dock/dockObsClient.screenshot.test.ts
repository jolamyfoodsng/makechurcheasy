import { describe, it, expect, vi, beforeEach } from "vitest";
import { dockObsClient } from "./dockObsClient";

describe("dockObsClient.captureScreenshot", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null if client is disconnected", async () => {
    vi.spyOn(dockObsClient, "isConnected", "get").mockReturnValue(false);
    const result = await dockObsClient.captureScreenshot();
    expect(result).toBeNull();
  });

  it("calls GetSourceScreenshot when connected and returns imageData", async () => {
    vi.spyOn(dockObsClient, "isConnected", "get").mockReturnValue(true);
    vi.spyOn(dockObsClient as any, "getObsSceneNames").mockResolvedValue(["MCE Presentation", "Live Scene"]);

    const callSpy = vi.spyOn(dockObsClient, "call").mockImplementation(async (method: string, _params?: unknown) => {
      if (method === "GetSourceScreenshot") {
        return {
          imageData: "data:image/jpeg;base64,mockImageData123",
          imageWidth: 1280,
          imageHeight: 720,
        };
      }
      return {};
    });

    const result = await dockObsClient.captureScreenshot();
    expect(result).toBe("data:image/jpeg;base64,mockImageData123");
    expect(callSpy).toHaveBeenCalledWith("GetSourceScreenshot", {
      sourceName: "MCE Presentation",
      imageFormat: "jpeg",
      imageWidth: 1280,
      imageCompressionQuality: 80,
    });
  });

  it("falls back to current program scene if MCE Presentation does not exist", async () => {
    vi.spyOn(dockObsClient, "isConnected", "get").mockReturnValue(true);
    vi.spyOn(dockObsClient as any, "getObsSceneNames").mockResolvedValue(["Main Program Scene"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dockObsClient as any, "getCurrentProgramSceneName").mockResolvedValue("Main Program Scene");

    const callSpy = vi.spyOn(dockObsClient, "call").mockImplementation(async (method: string) => {
      if (method === "GetSourceScreenshot") {
        return {
          imageData: "data:image/jpeg;base64,programSceneData",
        };
      }
      return {};
    });

    const result = await dockObsClient.captureScreenshot();
    expect(result).toBe("data:image/jpeg;base64,programSceneData");
    expect(callSpy).toHaveBeenCalledWith("GetSourceScreenshot", {
      sourceName: "Main Program Scene",
      imageFormat: "jpeg",
      imageWidth: 1280,
      imageCompressionQuality: 80,
    });
  });

  it("handles OBS errors gracefully without throwing", async () => {
    vi.spyOn(dockObsClient, "isConnected", "get").mockReturnValue(true);
    vi.spyOn(dockObsClient as any, "getObsSceneNames").mockResolvedValue(["MCE Presentation"]);
    vi.spyOn(dockObsClient, "call").mockRejectedValue(new Error("OBS source not active"));

    const result = await dockObsClient.captureScreenshot();
    expect(result).toBeNull();
  });
});
