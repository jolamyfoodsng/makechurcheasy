import { describe, expect, it } from "vitest";
import {
  stripLeadingVerseMarker,
  calculateReorderTargetIndex,
  reorderWorshipSections,
} from "../worship/slideEngine";

describe("stripLeadingVerseMarker", () => {
  it("strips generic Verse markers from slide text", () => {
    expect(stripLeadingVerseMarker("Verse 1:\nPRAYER POINT:\nTHANK YOU JESUS")).toBe(
      "PRAYER POINT:\nTHANK YOU JESUS",
    );
    expect(stripLeadingVerseMarker("Verse 1: PRAYER POINT")).toBe("PRAYER POINT");
    expect(stripLeadingVerseMarker("[Verse 1]\nAmazing grace")).toBe("Amazing grace");
    expect(stripLeadingVerseMarker("V1: How sweet the sound")).toBe("How sweet the sound");
    expect(stripLeadingVerseMarker("Verse 32:\nFinal verse")).toBe("Final verse");
  });

  it("does not strip normal prayer points or text", () => {
    expect(stripLeadingVerseMarker("PRAYER POINT:\nTHANK YOU JESUS")).toBe(
      "PRAYER POINT:\nTHANK YOU JESUS",
    );
    expect(stripLeadingVerseMarker("Point 1: The Love of God")).toBe(
      "Point 1: The Love of God",
    );
  });
});

describe("calculateReorderTargetIndex", () => {
  it("calculates correct drop target index when dragging down", () => {
    // Dragging item at index 0 down to hover over index 2, below
    expect(calculateReorderTargetIndex(0, 2, "below", 4)).toBe(2);
    // Dragging item at index 0 down to hover over index 2, above
    expect(calculateReorderTargetIndex(0, 2, "above", 4)).toBe(1);
  });

  it("calculates correct drop target index when dragging up", () => {
    // Dragging item at index 2 up to hover over index 0, above
    expect(calculateReorderTargetIndex(2, 0, "above", 4)).toBe(0);
    // Dragging item at index 2 up to hover over index 0, below
    expect(calculateReorderTargetIndex(2, 0, "below", 4)).toBe(1);
  });
});

describe("reorderWorshipSections", () => {
  it("reorders sections and renumbers verses sequentially while preserving Chorus", () => {
    const sections = [
      { id: "1", label: "Verse 1", text: "Text 1" },
      { id: "2", label: "Chorus", text: "Chorus text" },
      { id: "3", label: "Verse 2", text: "Text 2" },
      { id: "4", label: "Verse 3", text: "Text 3" },
    ];

    // Drag Verse 3 (index 3) to above Verse 2 (new index 2)
    const reordered = reorderWorshipSections(sections, 3, 2);

    expect(reordered.map((s) => s.id)).toEqual(["1", "2", "4", "3"]);
    expect(reordered[0].label).toBe("Verse 1");
    expect(reordered[1].label).toBe("Chorus");
    expect(reordered[2].label).toBe("Verse 2");
    expect(reordered[3].label).toBe("Verse 3");
  });

  it("renumbers verses correctly when moving above Chorus", () => {
    const sections = [
      { id: "1", label: "Verse 1", text: "Text 1" },
      { id: "2", label: "Chorus", text: "Chorus text" },
      { id: "3", label: "Verse 2", text: "Text 2" },
    ];

    // Move Verse 2 (index 2) to top (index 0)
    const reordered = reorderWorshipSections(sections, 2, 0);

    expect(reordered.map((s) => s.id)).toEqual(["3", "1", "2"]);
    expect(reordered[0].label).toBe("Verse 1");
    expect(reordered[1].label).toBe("Verse 2");
    expect(reordered[2].label).toBe("Chorus");
  });
});
