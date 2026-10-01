import { describe, expect, it } from "vitest";
import {
  addWorshipToActiveSchedule,
  addWholeWorshipSongToActiveSchedule,
  addNoteToActiveSchedule,
  addWholeNoteToActiveSchedule,
  addBibleToActiveSchedule,
  recordPresentationHistory,
  normalizeBibleReferenceLabel,
  getPendingWorshipSongSelection,
  setPendingWorshipSongSelection,
  getPendingNoteSelection,
  setPendingNoteSelection,
  getOrCreateActiveSchedule,
  getPresentationHistory,
  clearPresentationHistory,
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

  it("normalizes Bible reference labels and removes duplicated translation suffixes", () => {
    expect(normalizeBibleReferenceLabel("James 1:3 (KJV) (KJV)")).toBe("James 1:3 (KJV)");
    expect(normalizeBibleReferenceLabel("Isaiah 66:8 (KJV) (KJV) (KJV)")).toBe("Isaiah 66:8 (KJV)");
    expect(normalizeBibleReferenceLabel("Hosea 13:13 (NIV) (NIV)")).toBe("Hosea 13:13 (NIV)");
    expect(normalizeBibleReferenceLabel("John 3:16 (NKJV)")).toBe("John 3:16 (NKJV)");
    expect(normalizeBibleReferenceLabel("Psalm 23:1")).toBe("Psalm 23:1");
  });

  it("does not duplicate translation suffix when adding Bible to active schedule", () => {
    const bibleWithTranslationInRef = addBibleToActiveSchedule({
      book: "James",
      chapter: 1,
      verse: 3,
      reference: "James 1:3 (KJV)",
      translation: "KJV",
      text: "Knowing this, that the trying of your faith worketh patience.",
    });
    expect(bibleWithTranslationInRef.label).toBe("James 1:3 (KJV)");

    const bibleWithoutTranslationInRef = addBibleToActiveSchedule({
      book: "James",
      chapter: 1,
      verse: 4,
      reference: "James 1:4",
      translation: "KJV",
      text: "But let patience have her perfect work.",
    });
    expect(bibleWithoutTranslationInRef.label).toBe("James 1:4 (KJV)");
  });

  it("normalizes duplicated translation suffix when recording presentation history", () => {
    const historyItem = recordPresentationHistory({
      type: "bible",
      sourceKind: "bible-reference",
      label: "James 1:3 (KJV) (KJV)",
      subtitle: "Knowing this, that the trying of your faith worketh patience.",
      notes: "KJV",
      payloadSnapshot: {
        book: "James",
        chapter: 1,
        verse: 3,
        translation: "KJV",
      },
    });
    expect(historyItem.label).toBe("James 1:3 (KJV)");
  });

  it("caps schedule at 3 items for free users, acting like a rolling stack that removes the oldest", () => {
    // Add 1st item
    addBibleToActiveSchedule({
      book: "Genesis",
      chapter: 1,
      verse: 1,
      reference: "Genesis 1:1",
      translation: "KJV",
      text: "In the beginning God created the heaven and the earth.",
    });

    // Add 2nd item
    addBibleToActiveSchedule({
      book: "Genesis",
      chapter: 1,
      verse: 2,
      reference: "Genesis 1:2",
      translation: "KJV",
      text: "And the earth was without form, and void.",
    });

    // Add 3rd item
    addBibleToActiveSchedule({
      book: "Genesis",
      chapter: 1,
      verse: 3,
      reference: "Genesis 1:3",
      translation: "KJV",
      text: "And God said, Let there be light: and there was light.",
    });

    const { activePlan: planWith3 } = getOrCreateActiveSchedule();
    expect(planWith3.items.length).toBe(3);
    expect(planWith3.items[0].label).toBe("Genesis 1:3 (KJV)");
    expect(planWith3.items[2].label).toBe("Genesis 1:1 (KJV)");

    // Add 4th item (should push to index 0 and drop the 1st item Genesis 1:1)
    addBibleToActiveSchedule({
      book: "Genesis",
      chapter: 1,
      verse: 4,
      reference: "Genesis 1:4",
      translation: "KJV",
      text: "And God saw the light, that it was good.",
    });

    const { activePlan: planWith4 } = getOrCreateActiveSchedule();
    expect(planWith4.items.length).toBe(3);
    // Newly added item popped up first
    expect(planWith4.items[0].label).toBe("Genesis 1:4 (KJV)");
    expect(planWith4.items[1].label).toBe("Genesis 1:3 (KJV)");
    expect(planWith4.items[2].label).toBe("Genesis 1:2 (KJV)");
    // Oldest item Genesis 1:1 was removed from stack
    expect(planWith4.items.find((i) => i.label === "Genesis 1:1 (KJV)")).toBeUndefined();
  });

  it("restricts history to 1 item for free users, changing to the latest presented item", () => {
    clearPresentationHistory();

    // 1st presentation
    recordPresentationHistory({
      type: "bible",
      label: "John 3:16 (KJV)",
      payloadSnapshot: { book: "John", chapter: 3, verse: 16 },
    });

    let history = getPresentationHistory();
    expect(history.length).toBe(1);
    expect(history[0].label).toBe("John 3:16 (KJV)");

    // 2nd presentation (changes to this one type/item)
    recordPresentationHistory({
      type: "worship",
      label: "Amazing Grace",
      payloadSnapshot: { songTitle: "Amazing Grace" },
    });

    history = getPresentationHistory();
    expect(history.length).toBe(1);
    expect(history[0].label).toBe("Amazing Grace");
  });
});

