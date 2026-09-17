import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DockObsClient } from "./dockObsClient";
import { isDockFreePlan, isDockTrialActive, TRIAL_ACTIVE_KEY } from "./dockEntitlement";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
  };
}

describe("Dock Free Plan Cleanup & Source Filtering", () => {
  let memoryStorage: Storage;

  beforeEach(() => {
    memoryStorage = createMemoryStorage();
    vi.stubGlobal("localStorage", memoryStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("DockObsClient.isMCESource", () => {
    it("identifies MCE, MCA, and OCS sources created by the app", () => {
      expect(DockObsClient.isMCESource("MCE Presentation")).toBe(true);
      expect(DockObsClient.isMCESource("MCE Lower Thirds")).toBe(true);
      expect(DockObsClient.isMCESource("MCE Ticker")).toBe(true);
      expect(DockObsClient.isMCESource("MCE Stage Display")).toBe(true);
      expect(DockObsClient.isMCESource("MCE Media - Video")).toBe(true);
      expect(DockObsClient.isMCESource("MCE Media - Audio")).toBe(true);
      expect(DockObsClient.isMCESource("MCE LT Background")).toBe(true);
      expect(DockObsClient.isMCESource("MCE_Remote_Media")).toBe(true);
      expect(DockObsClient.isMCESource("MCA Presentation")).toBe(true);
      expect(DockObsClient.isMCESource("MCA_Live")).toBe(true);
      expect(DockObsClient.isMCESource("OCS Lower Thirds")).toBe(true);
      expect(DockObsClient.isMCESource("OCS_Ticker")).toBe(true);
      expect(DockObsClient.isMCESource("⚡ Quick Merge")).toBe(true);
      expect(DockObsClient.isMCESource("MV: Multiview 1")).toBe(true);
      expect(DockObsClient.isMCESource("mce lower thirds")).toBe(true);
    });

    it("does not match user-owned sources", () => {
      expect(DockObsClient.isMCESource("Camera 1")).toBe(false);
      expect(DockObsClient.isMCESource("Microphone")).toBe(false);
      expect(DockObsClient.isMCESource("Video Capture Device")).toBe(false);
      expect(DockObsClient.isMCESource("Logitech Brio")).toBe(false);
      expect(DockObsClient.isMCESource("Display Capture")).toBe(false);
      expect(DockObsClient.isMCESource("Audio Input Capture")).toBe(false);
      expect(DockObsClient.isMCESource("Worship Lyrics Custom")).toBe(false);
      expect(DockObsClient.isMCESource("")).toBe(false);
    });
  });

  describe("isDockFreePlan & isDockTrialActive", () => {
    it("treats free plan with active trial as NOT free plan", () => {
      memoryStorage.setItem("ocs-dock-plan", "free");
      memoryStorage.setItem(TRIAL_ACTIVE_KEY, "true");

      expect(isDockTrialActive()).toBe(true);
      expect(isDockFreePlan()).toBe(false);
    });

    it("treats free plan with expired/inactive trial as free plan", () => {
      memoryStorage.setItem("ocs-dock-plan", "free");
      memoryStorage.setItem(TRIAL_ACTIVE_KEY, "false");

      expect(isDockTrialActive()).toBe(false);
      expect(isDockFreePlan()).toBe(true);
    });

    it("treats basic and growth plans as NOT free plan even without trial", () => {
      memoryStorage.setItem("ocs-dock-plan", "growth");
      memoryStorage.setItem(TRIAL_ACTIVE_KEY, "false");

      expect(isDockFreePlan()).toBe(false);

      memoryStorage.setItem("ocs-dock-plan", "basic");
      expect(isDockFreePlan()).toBe(false);
    });
  });

  describe("clearMCESourcesForFreePlan", () => {
    it("removes MCE inputs and scene items without deleting scenes or user sources", async () => {
      const client = new DockObsClient();

      // Mock client methods
      const calls: Array<{ type: string; data?: Record<string, unknown>; options?: any }> = [];

      vi.spyOn(client, "isConnected", "get").mockReturnValue(true);

      vi.spyOn(client, "call").mockImplementation(async (requestType, requestData, options) => {
        calls.push({ type: requestType, data: requestData, options });

        if (requestType === "GetInputList") {
          return {
            inputs: [
              { inputName: "MCE Presentation", inputKind: "browser_source" },
              { inputName: "Camera 1", inputKind: "dshow_input" },
              { inputName: "MCE Media - Audio", inputKind: "ffmpeg_source" },
              { inputName: "Microphone", inputKind: "wasapi_input_capture" },
            ],
          };
        }

        if (requestType === "GetSceneItemList") {
          const scene = (requestData as any)?.sceneName;
          if (scene === "MCE Presentation") {
            return {
              sceneItems: [
                { sceneItemId: 1, sourceName: "MCE Presentation" },
                { sceneItemId: 2, sourceName: "Camera 1" },
              ],
            };
          }
          if (scene === "User Scene") {
            return {
              sceneItems: [
                { sceneItemId: 10, sourceName: "MCE Lower Thirds" },
                { sceneItemId: 11, sourceName: "Microphone" },
              ],
            };
          }
          return { sceneItems: [] };
        }

        return {};
      });

      vi.spyOn(client as any, "getObsSceneNames").mockResolvedValue(["MCE Presentation", "User Scene"]);

      const result = await client.clearMCESourcesForFreePlan();

      // Should have cleaned:
      // Inputs: "MCE Presentation", "MCE Media - Audio" (2)
      // Scene items: "MCE Presentation" (in MCE Presentation scene), "MCE Lower Thirds" (in User Scene) (2)
      // Total = 4
      expect(result.cleanedSources).toBe(4);

      // Verify RemoveInput was called only on MCE sources
      const removeInputCalls = calls.filter((c) => c.type === "RemoveInput");
      expect(removeInputCalls).toHaveLength(2);
      expect(removeInputCalls[0].data).toEqual({ inputName: "MCE Presentation" });
      expect(removeInputCalls[0].options?.bypassFreeMutationGate).toBe(true);
      expect(removeInputCalls[1].data).toEqual({ inputName: "MCE Media - Audio" });
      expect(removeInputCalls[1].options?.bypassFreeMutationGate).toBe(true);

      // Verify RemoveScene was NEVER called (scenes must be left intact)
      const removeSceneCalls = calls.filter((c) => c.type === "RemoveScene");
      expect(removeSceneCalls).toHaveLength(0);

      // Verify RemoveSceneItem was called only on MCE scene items
      const removeSceneItemCalls = calls.filter((c) => c.type === "RemoveSceneItem");
      expect(removeSceneItemCalls).toHaveLength(2);
      expect(removeSceneItemCalls[0].data).toEqual({
        sceneName: "MCE Presentation",
        sceneItemId: 1,
      });
      expect(removeSceneItemCalls[0].options?.bypassFreeMutationGate).toBe(true);
      expect(removeSceneItemCalls[1].data).toEqual({
        sceneName: "User Scene",
        sceneItemId: 10,
      });
      expect(removeSceneItemCalls[1].options?.bypassFreeMutationGate).toBe(true);
    });
  });
});
