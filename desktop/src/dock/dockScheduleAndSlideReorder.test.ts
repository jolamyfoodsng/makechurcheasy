import { describe, expect, it } from "vitest";
import {
  addWorshipToActiveSchedule,
  addWholeWorshipSongToActiveSchedule,
  addNoteToActiveSchedule,
  addWholeNoteToActiveSchedule,
  getPendingWorshipSongSelection,
  setPendingWorshipSongSelection,
  getPendingNoteSelection,
  setPendingNoteSelection,
} from "./dockScheduleService";
import {
  calculateReorderTargetIndex,
  reorderWorshipSections,
} from "../worship/slideEngine";

describe("Dock Schedule and Slide Reordering", () => {
  it("allows adding an entire worship song to schedule", () => {
    const item = addWholeWorshipSongToActiveSchedule({
      songTitle: "Way Maker",
      artist: "Sinach",
      lyrics: "You are here, moving in our midst\nI worship You, I worship You\n\nYou are here, working in this place",
      songId: "song-wm-1",
      overlayMode: "lower-third",
    });

    expect(item.type).toBe("worship");
    expect(item.label).toBe("Way Maker");
    expect(item.notes).toBe("Sinach");
    expect(item.payloadSnapshot.songTitle).toBe("Way Maker");
    expect(item.payloadSnapshot.sectionText).toContain("You are here");
  });

  it("allows adding a specific worship section to schedule", () => {
    const item = addWorshipToActiveSchedule({
      songTitle: "10,000 Reasons",
      sectionLabel: "Chorus",
      sectionText: "Bless the Lord, O my soul\nO my soul, worship His holy name",
      artist: "Matt Redman",
      songId: "song-10k-1",
      sectionIdx: 0,
      overlayMode: "fullscreen",
    });

    expect(item.type).toBe("worship");
    expect(item.label).toBe("10,000 Reasons · Chorus");
    expect(item.payloadSnapshot.sectionLabel).toBe("Chorus");
  });

  it("allows adding an entire note document to schedule", () => {
    const item = addWholeNoteToActiveSchedule({
      noteTitle: "Walking in Faith",
      noteContent: "Faith is the substance of things hoped for.\nEvidence of things not seen.\n\nHebrews 11:1",
      noteId: "note-faith-1",
      overlayMode: "lower-third",
    });

    expect(item.type).toBe("sermon");
    expect(item.label).toBe("Walking in Faith");
    expect(item.payloadSnapshot.isNoteSlide).toBe(true);
    expect(item.payloadSnapshot.slideText).toContain("Faith is the substance");
  });

  it("allows adding an individual note slide to schedule", () => {
    const item = addNoteToActiveSchedule({
      noteTitle: "Sermon Points",
      slideIndex: 1,
      slideText: "Point 2: Trust God through the storm",
      overlayMode: "fullscreen",
    });

    expect(item.type).toBe("sermon");
    expect(item.label).toBe("Sermon Points · Slide 2");
    expect(item.payloadSnapshot.isNoteSlide).toBe(true);
    expect(item.payloadSnapshot.slideIndex).toBe(1);
  });

  it("reorders slide to the very top (target 0)", () => {
    const sections = [
      { id: "s1", label: "Verse 1", text: "Line 1" },
      { id: "s2", label: "Chorus", text: "Line 2" },
      { id: "s3", label: "Verse 2", text: "Line 3" },
      { id: "s4", label: "Bridge", text: "Line 4" },
    ];

    // Drag Bridge (index 3) to very top (index 0)
    const reordered = reorderWorshipSections(sections, 3, 0);
    expect(reordered[0].id).toBe("s4");
    expect(reordered[1].id).toBe("s1");
    expect(reordered[2].id).toBe("s2");
    expect(reordered[3].id).toBe("s3");
  });

  it("reorders slide to the very bottom (last index)", () => {
    const sections = [
      { id: "s1", label: "Verse 1", text: "Line 1" },
      { id: "s2", label: "Chorus", text: "Line 2" },
      { id: "s3", label: "Verse 2", text: "Line 3" },
    ];

    // Drag Verse 1 (index 0) to very bottom (index 2)
    const reordered = reorderWorshipSections(sections, 0, 2);
    expect(reordered[0].id).toBe("s2");
    expect(reordered[1].id).toBe("s3");
    expect(reordered[2].id).toBe("s1");
  });

  it("calculates reorder indices correctly for above and below drop positions", () => {
    // Drop above index 0 -> target 0
    expect(calculateReorderTargetIndex(2, 0, "above", 4)).toBe(0);
    // Drop below last index 3 -> target 3
    expect(calculateReorderTargetIndex(0, 3, "below", 4)).toBe(3);
    // Drop above index 2 when source is 0 -> target 1
    expect(calculateReorderTargetIndex(0, 2, "above", 4)).toBe(1);
    // Drop below index 1 when source is 3 -> target 2
    expect(calculateReorderTargetIndex(3, 1, "below", 4)).toBe(2);
  });

  it("sets and retrieves pending worship song selection", () => {
    setPendingWorshipSongSelection({ songId: "song-123", songTitle: "Amazing Grace" });
    expect(getPendingWorshipSongSelection()).toEqual({
      songId: "song-123",
      songTitle: "Amazing Grace",
    });
    setPendingWorshipSongSelection(null);
    expect(getPendingWorshipSongSelection()).toBeNull();
  });

  it("sets and retrieves pending note selection", () => {
    setPendingNoteSelection({ noteId: "note-456", noteTitle: "Sunday Sermon" });
    expect(getPendingNoteSelection()).toEqual({
      noteId: "note-456",
      noteTitle: "Sunday Sermon",
    });
    setPendingNoteSelection(null);
    expect(getPendingNoteSelection()).toBeNull();
  });

  it("identifies whole worship song and whole note in payload snapshot", () => {
    const worshipItem = addWholeWorshipSongToActiveSchedule({
      songTitle: "10,000 Reasons",
      lyrics: "Bless the Lord, O my soul",
      songId: "song-10k",
    });
    expect(worshipItem.payloadSnapshot.isWholeSong).toBe(true);
    expect(worshipItem.payloadSnapshot.songId).toBe("song-10k");

    const noteItem = addWholeNoteToActiveSchedule({
      noteTitle: "Faith and Grace",
      noteContent: "Point 1: Walk in love",
      noteId: "note-fg",
    });
    expect(noteItem.payloadSnapshot.isWholeNote).toBe(true);
    expect(noteItem.payloadSnapshot.isNoteSlide).toBe(true);
    expect(noteItem.payloadSnapshot.noteId).toBe("note-fg");
  });
});
