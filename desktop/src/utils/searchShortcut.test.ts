import { describe, it, expect, vi } from "vitest";
import {
  isSearchKeyboardShortcut,
  findSearchInputElement,
  triggerTabSearchInput,
} from "./searchShortcut";

function createMockKeyboardEvent(init: {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent {
  return {
    key: init.key ?? "",
    code: init.code ?? "",
    ctrlKey: Boolean(init.ctrlKey),
    metaKey: Boolean(init.metaKey),
    altKey: Boolean(init.altKey),
    shiftKey: Boolean(init.shiftKey),
  } as unknown as KeyboardEvent;
}

describe("searchShortcut", () => {
  describe("isSearchKeyboardShortcut", () => {
    it("detects Command+F on macOS (metaKey)", () => {
      const event = createMockKeyboardEvent({
        key: "f",
        code: "KeyF",
        metaKey: true,
      });
      expect(isSearchKeyboardShortcut(event)).toBe(true);
    });

    it("detects Control+F on Windows/Linux (ctrlKey)", () => {
      const event = createMockKeyboardEvent({
        key: "f",
        code: "KeyF",
        ctrlKey: true,
      });
      expect(isSearchKeyboardShortcut(event)).toBe(true);
    });

    it("detects uppercase F with Command or Control (e.g. CapsLock or Shift)", () => {
      const eventMeta = createMockKeyboardEvent({
        key: "F",
        code: "KeyF",
        metaKey: true,
      });
      expect(isSearchKeyboardShortcut(eventMeta)).toBe(true);

      const eventCtrl = createMockKeyboardEvent({
        key: "F",
        code: "KeyF",
        ctrlKey: true,
      });
      expect(isSearchKeyboardShortcut(eventCtrl)).toBe(true);
    });

    it("ignores Alt+F", () => {
      const event = createMockKeyboardEvent({
        key: "f",
        code: "KeyF",
        altKey: true,
      });
      expect(isSearchKeyboardShortcut(event)).toBe(false);

      const eventCtrlAlt = createMockKeyboardEvent({
        key: "f",
        code: "KeyF",
        ctrlKey: true,
        altKey: true,
      });
      expect(isSearchKeyboardShortcut(eventCtrlAlt)).toBe(false);
    });

    it("ignores plain F without modifiers", () => {
      const event = createMockKeyboardEvent({
        key: "f",
        code: "KeyF",
      });
      expect(isSearchKeyboardShortcut(event)).toBe(false);
    });

    it("ignores other keys with Command/Ctrl (e.g. Cmd+K, Cmd+S)", () => {
      const eventK = createMockKeyboardEvent({
        key: "k",
        code: "KeyK",
        metaKey: true,
      });
      expect(isSearchKeyboardShortcut(eventK)).toBe(false);

      const eventS = createMockKeyboardEvent({
        key: "s",
        code: "KeyS",
        ctrlKey: true,
      });
      expect(isSearchKeyboardShortcut(eventS)).toBe(false);
    });
  });

  describe("findSearchInputElement & triggerTabSearchInput", () => {
    function mockElement(tag: string, attrs: Record<string, string | boolean> = {}): any {
      const el: any = {
        tagName: tag.toUpperCase(),
        hasAttribute: (name: string) => name in attrs,
        getAttribute: (name: string) => attrs[name] ?? null,
        closest: (_sel: string) => null,
        offsetWidth: 100,
        offsetHeight: 30,
        disabled: false,
        focus: vi.fn(),
        select: vi.fn(),
        scrollIntoView: vi.fn(),
        getBoundingClientRect: () => ({ width: 100, height: 30, top: 0, left: 0 }),
      };
      return el;
    }

    it("finds matching search input from selectors", () => {
      const inputEl = mockElement("input");
      const fakeContainer: any = {
        querySelectorAll: (sel: string) => {
          if (sel === "input.dock_search__input") return [inputEl];
          return [];
        },
      };

      const found = findSearchInputElement(fakeContainer);
      expect(found).toBe(inputEl);
    });

    it("triggers focus and select on found search input", () => {
      const inputEl = mockElement("input");
      const fakePanel: any = {
        querySelector: (sel: string) => (sel.includes("dock-media-search__input") ? inputEl : null),
        querySelectorAll: (sel: string) => (sel === "input.dock-media-search__input" ? [inputEl] : []),
      };

      // Mock global document
      const origDoc = (globalThis as any).document;
      (globalThis as any).document = {
        querySelector: (sel: string) => {
          if (sel.includes("dock-tab-panel")) return fakePanel;
          return null;
        },
      };

      try {
        const triggered = triggerTabSearchInput();
        expect(triggered).toBe(true);
        expect(inputEl.focus).toHaveBeenCalledTimes(1);
        expect(inputEl.select).toHaveBeenCalledTimes(1);
      } finally {
        (globalThis as any).document = origDoc;
      }
    });

    it("returns false if no search inputs are found", () => {
      const origDoc = (globalThis as any).document;
      (globalThis as any).document = {
        querySelector: () => null,
        querySelectorAll: () => [],
      };

      try {
        const triggered = triggerTabSearchInput();
        expect(triggered).toBe(false);
      } finally {
        (globalThis as any).document = origDoc;
      }
    });
  });
});
