import { describe, expect, it } from "vitest";
import {
  FREE_DOCK_OBS_MUTATION_MESSAGE,
  isDockObsCommand,
  isDockObsMutationRequest,
} from "./dockMutationPolicy";

describe("dock mutation policy", () => {
  it("treats OBS reads as safe and all Dock writes as mutations", () => {
    expect(isDockObsMutationRequest("GetSceneList")).toBe(false);
    expect(isDockObsMutationRequest("GetSceneItemList")).toBe(false);
    expect(isDockObsMutationRequest("CreateScene")).toBe(true);
    expect(isDockObsMutationRequest("CreateInput")).toBe(true);
    expect(isDockObsMutationRequest("SetInputSettings")).toBe(true);
  });

  it("recognizes legacy Dock commands that can reach OBS services", () => {
    expect(isDockObsCommand("bible:go-live")).toBe(true);
    expect(isDockObsCommand("speaker:clear")).toBe(true);
    expect(isDockObsCommand("worship:save-preferences")).toBe(false);
    expect(isDockObsCommand("ping")).toBe(false);
  });

  it("keeps the user-facing Free-plan explanation stable", () => {
    expect(FREE_DOCK_OBS_MUTATION_MESSAGE).toContain("MCE Presentation");
    expect(FREE_DOCK_OBS_MUTATION_MESSAGE).toContain("Free plan");
  });
});
