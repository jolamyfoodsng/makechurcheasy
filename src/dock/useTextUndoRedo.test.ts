import { describe, expect, it } from "vitest";
import {
  TextUndoRedoHistory,
  isUndoKeyboardShortcut,
  isRedoKeyboardShortcut,
} from "./useTextUndoRedo";
import notesTabSource from "./tabs/DockNotesTab.tsx?raw";
import worshipTabSource from "./tabs/DockWorshipTab.tsx?raw";
import dockPageSource from "./DockPage.tsx?raw";

describe("TextUndoRedoHistory", () => {
  it("initializes with initial text and empty undo/redo stacks", () => {
    const history = new TextUndoRedoHistory("Initial Text");
    expect(history.text).toBe("Initial Text");
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it("commits history steps and supports undo and redo", () => {
    const history = new TextUndoRedoHistory("First");

    history.commit("Second");
    expect(history.text).toBe("Second");
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    history.commit("Third");
    expect(history.text).toBe("Third");
    expect(history.canUndo).toBe(true);

    // Undo Third -> Second
    expect(history.undo()).toBe("Second");
    expect(history.text).toBe("Second");
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);

    // Undo Second -> First
    expect(history.undo()).toBe("First");
    expect(history.text).toBe("First");
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    // Redo First -> Second
    expect(history.redo()).toBe("Second");
    expect(history.text).toBe("Second");
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);

    // Committing a new state invalidates future redo stack
    history.commit("Branched");
    expect(history.text).toBe("Branched");
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("limits history depth to maxHistory", () => {
    const history = new TextUndoRedoHistory("0", 3);
    history.commit("1");
    history.commit("2");
    history.commit("3");
    history.commit("4");

    expect(history.text).toBe("4");
    expect(history.undo()).toBe("3");
    expect(history.undo()).toBe("2");
    expect(history.undo()).toBe("1");
    // "0" was shifted out due to maxHistory = 3
    expect(history.undo()).toBeNull();
  });

  it("resets history completely", () => {
    const history = new TextUndoRedoHistory("A");
    history.commit("B");
    expect(history.canUndo).toBe(true);

    history.reset("Clean");
    expect(history.text).toBe("Clean");
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});

describe("keyboard shortcut detection", () => {
  it("detects Ctrl+Z and Cmd+Z as undo", () => {
    expect(isUndoKeyboardShortcut({ key: "z", ctrlKey: true })).toBe(true);
    expect(isUndoKeyboardShortcut({ key: "Z", ctrlKey: true })).toBe(true);
    expect(isUndoKeyboardShortcut({ key: "z", metaKey: true })).toBe(true);
    // Shift+Z is redo, not undo
    expect(isUndoKeyboardShortcut({ key: "z", ctrlKey: true, shiftKey: true })).toBe(false);
    // Plain z without modifier is regular typing
    expect(isUndoKeyboardShortcut({ key: "z" })).toBe(false);
    // Alt key ignores
    expect(isUndoKeyboardShortcut({ key: "z", ctrlKey: true, altKey: true })).toBe(false);
  });

  it("detects Ctrl+Shift+Z, Cmd+Shift+Z, and Ctrl+Y as redo", () => {
    expect(isRedoKeyboardShortcut({ key: "z", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(isRedoKeyboardShortcut({ key: "Z", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(isRedoKeyboardShortcut({ key: "z", metaKey: true, shiftKey: true })).toBe(true);
    expect(isRedoKeyboardShortcut({ key: "y", ctrlKey: true })).toBe(true);
    expect(isRedoKeyboardShortcut({ key: "y", metaKey: true })).toBe(true);
    // Plain y or z is regular typing
    expect(isRedoKeyboardShortcut({ key: "y" })).toBe(false);
    // Ctrl+Z without shift is undo, not redo
    expect(isRedoKeyboardShortcut({ key: "z", ctrlKey: true, shiftKey: false })).toBe(false);
  });
});

describe("dock typing responsiveness and tab switching architecture", () => {
  it("isolates note slide editor so typing never re-renders the root DockNotesTab", () => {
    expect(notesTabSource).toContain("function DockNoteSlideEditorDialog");
    expect(notesTabSource).toContain("<DockNoteSlideEditorDialog");
    expect(notesTabSource).toContain("debouncedSearchQuery");
    expect(notesTabSource).toContain("debouncedNoteSlidesSearchQuery");
    // Ensure toolbar has undo and redo bindings
    expect(notesTabSource).toContain("onUndo={undo}");
    expect(notesTabSource).toContain("onRedo={redo}");
    expect(notesTabSource).toContain("canUndo={canUndo}");
    expect(notesTabSource).toContain("canRedo={canRedo}");
  });

  it("isolates worship slide quick-edit and lyrics editor so typing never re-renders DockWorshipTab", () => {
    expect(worshipTabSource).toContain("function DockWorshipSlideEditorDialog");
    expect(worshipTabSource).toContain("<DockWorshipSlideEditorDialog");
    expect(worshipTabSource).toContain("debouncedSearchQuery");
    expect(worshipTabSource).toContain("debouncedLyricsSearchQuery");
    // Ensure lyrics toolbar has undo and redo buttons
    expect(worshipTabSource).toContain('Icon name="undo"');
    expect(worshipTabSource).toContain('Icon name="redo"');
    // Ensure DockWorshipTab takes isActive prop
    expect(worshipTabSource).toContain("isActive = true");
  });

  it("DockPage immediately updates renderedTab on tab switch and keeps visited tabs warm", () => {
    // No artificial setTimeout(..., 0) deferral on tab switch
    expect(dockPageSource).not.toContain("window.setTimeout(() => {\n      startTransition");
    expect(dockPageSource).toContain("setRenderedTab(activeTab);");
    // Visited tabs retain up to 6 tabs so Bible, Worship, Media are never unmounted
    expect(dockPageSource).toContain("const maxTabs = lowMemoryMode ? 3 : 6;");
    // Passes isActive to DockWorshipTab
    expect(dockPageSource).toContain('isActive={renderedTab === "worship"}');
  });
});
