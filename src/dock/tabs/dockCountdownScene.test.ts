import { describe, expect, it } from "vitest";
import {
  DOCK_COUNTDOWN_DEDICATED_SCENE_NAME,
  DOCK_COUNTDOWN_SOURCE_NAME,
  DOCK_PRESENTATION_SCENE_NAME,
  resolveCountdownTargetScene,
} from "./dockCountdownScene";

describe("resolveCountdownTargetScene", () => {
  it("falls back to MCE Presentation when no dedicated scene is selected", () => {
    expect(resolveCountdownTargetScene("")).toBe(DOCK_PRESENTATION_SCENE_NAME);
    expect(resolveCountdownTargetScene("   ")).toBe(DOCK_PRESENTATION_SCENE_NAME);
    expect(resolveCountdownTargetScene(undefined)).toBe(DOCK_PRESENTATION_SCENE_NAME);
  });

  it("maps the legacy colliding scene name to the dedicated countdown scene", () => {
    expect(resolveCountdownTargetScene(DOCK_COUNTDOWN_SOURCE_NAME)).toBe(DOCK_COUNTDOWN_DEDICATED_SCENE_NAME);
  });

  it("preserves explicit custom scene names", () => {
    expect(resolveCountdownTargetScene("Service Countdown")).toBe("Service Countdown");
  });
});
