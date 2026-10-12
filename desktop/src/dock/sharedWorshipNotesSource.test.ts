import { describe, it, expect } from "vitest";
import { getMcePresentationVisibilityKeepSet } from "./dockObsClient";
import {
  BG_SOURCE_NAMES,
  FULLSCREEN_BG_SOURCE_NAMES,
  FULLSCREEN_SOURCE_NAMES,
  LEGACY_NOTES_SOURCE_NAMES,
  SOURCE_NAMES,
} from "../services/PresentationSceneManager";

describe("Worship and Notes share one OBS source", () => {
  it("uses the Worship source and background for Notes too", () => {
    expect(SOURCE_NAMES.NOTES).toBe(SOURCE_NAMES.WORSHIP);
    expect(FULLSCREEN_SOURCE_NAMES.NOTES).toBe(FULLSCREEN_SOURCE_NAMES.WORSHIP);
    expect(BG_SOURCE_NAMES.NOTES).toBe(BG_SOURCE_NAMES.WORSHIP);
    expect(FULLSCREEN_BG_SOURCE_NAMES.NOTES).toBe(FULLSCREEN_BG_SOURCE_NAMES.WORSHIP);
    expect(SOURCE_NAMES.NOTES).toBe("Worship - MCE Presentation");
  });

  it("lists the old separate Notes sources so they can be removed", () => {
    expect(LEGACY_NOTES_SOURCE_NAMES).toContain("Notes - MCE Presentation");
    expect(LEGACY_NOTES_SOURCE_NAMES).toContain("Notes BG - MCE Presentation");
  });

  it("keeps the shared source and its background when either module is active", () => {
    const items = [
      { sourceName: "Worship - MCE Presentation", sceneItemIndex: 0 },
      { sourceName: "Worship BG - MCE Presentation", sceneItemIndex: 1 },
      { sourceName: "Bible - MCE Presentation", sceneItemIndex: 2 },
    ];
    const keepForNotes = getMcePresentationVisibilityKeepSet(SOURCE_NAMES.NOTES, items);
    expect(keepForNotes.has("Worship - MCE Presentation")).toBe(true);
    expect(keepForNotes.has("Worship BG - MCE Presentation")).toBe(true);
    expect(keepForNotes.has("Bible - MCE Presentation")).toBe(false);
  });
});
