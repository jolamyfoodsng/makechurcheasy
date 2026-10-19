import { describe, expect, it } from "vitest";
import { sceneChoices } from "./ScenePicker";

describe("What's on the screen choices", () => {
  it("offers all four for the words", () => {
    expect(sceneChoices().map((c) => c.id)).toEqual(["fullscreen", "lower-third", "camera", "camera-lt"]);
  });

  it("offers the picture or the camera on Media and Docs", () => {
    expect(sceneChoices("Media").map((c) => [c.id, c.label])).toEqual([["fullscreen", "Media"], ["camera", "Camera"]]);
    expect(sceneChoices("Document")[0].label).toBe("Document");
  });
});
