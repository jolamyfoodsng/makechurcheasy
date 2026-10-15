import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHORTCUT_DEFS,
  buildBindings,
  comboLabel,
  comboParts,
  comboProblem,
  eventToCombo,
  findConflict,
  matchShortcut,
  normalizeCombo,
} from "./shortcuts";

const key = (o: Partial<Pick<KeyboardEvent, "code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">>) => ({
  code: "", key: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o,
});

describe("default shortcuts", () => {
  it("never give two actions the same key", () => {
    const seen = new Map<string, string>();
    for (const def of SHORTCUT_DEFS) {
      for (const combo of def.keys) {
        const c = normalizeCombo(combo);
        expect(seen.get(c), `${c} is used by ${seen.get(c)} and ${def.id}`).toBeUndefined();
        seen.set(c, def.id);
      }
    }
  });

  it("have a label, a group and at least one key", () => {
    for (const def of SHORTCUT_DEFS) {
      expect(def.label.length).toBeGreaterThan(2);
      expect(def.keys.length).toBeGreaterThan(0);
    }
  });

  it("only use keys that are allowed", () => {
    for (const def of SHORTCUT_DEFS) {
      for (const combo of def.keys) expect(comboProblem(combo), `${def.id}: ${combo}`).toBe("");
    }
  });

  it("match the usual keys", () => {
    const b = buildBindings();
    expect(matchShortcut("Mod+1", b)).toBe("section-bible");
    expect(matchShortcut("Mod+2", b)).toBe("section-text");
    expect(matchShortcut("Mod+K", b)).toBe("search");
    expect(matchShortcut("Space", b)).toBe("go-live-next");
    expect(matchShortcut("Alt+B", b)).toBe("black-screen");
    expect(matchShortcut("F11", b)).toBe("fullscreen");
    expect(matchShortcut("B", b)).toBeNull();
  });
});

describe("key presses", () => {
  it("use Ctrl on Windows and Cmd on a Mac", () => {
    expect(eventToCombo(key({ code: "KeyK", ctrlKey: true }), false)).toBe("Mod+K");
    expect(eventToCombo(key({ code: "KeyK", metaKey: true }), true)).toBe("Mod+K");
    // The other one does not count.
    expect(eventToCombo(key({ code: "KeyK", metaKey: true }), false)).toBeNull();
    expect(eventToCombo(key({ code: "KeyK", ctrlKey: true }), true)).toBeNull();
  });

  it("read the physical key, so Option+B on a Mac is still Alt+B", () => {
    expect(eventToCombo(key({ code: "KeyB", key: "∫", altKey: true }), true)).toBe("Alt+B");
  });

  it("order the modifiers", () => {
    expect(eventToCombo(key({ code: "Digit1", ctrlKey: true, shiftKey: true, altKey: true }), false)).toBe("Mod+Alt+Shift+1");
  });

  it("ignore a bare modifier", () => {
    expect(eventToCombo(key({ code: "ShiftLeft", key: "Shift", shiftKey: true }), false)).toBeNull();
  });

  it("know the named keys", () => {
    expect(eventToCombo(key({ code: "Space", key: " " }), false)).toBe("Space");
    expect(eventToCombo(key({ code: "PageDown", key: "PageDown" }), false)).toBe("PageDown");
    expect(eventToCombo(key({ code: "F11", key: "F11" }), false)).toBe("F11");
    expect(eventToCombo(key({ code: "Equal", ctrlKey: true }), false)).toBe("Mod+=");
    expect(eventToCombo(key({ code: "Comma", ctrlKey: true }), false)).toBe("Mod+,");
  });

  it("fall back to the typed character when there is no code", () => {
    expect(eventToCombo(key({ key: "k", ctrlKey: true }), false)).toBe("Mod+K");
  });
});

describe("writing a combo", () => {
  it("is the same however it was typed", () => {
    expect(normalizeCombo("shift+mod+k".replace("shift", "Shift").replace("mod", "Mod"))).toBe("Mod+Shift+K");
    expect(normalizeCombo("Alt+b")).toBe("Alt+B");
  });

  it("shows ⌘ on a Mac and Ctrl on Windows", () => {
    expect(comboLabel("Mod+Shift+1", true)).toBe("⌘⇧1");
    expect(comboLabel("Mod+Shift+1", false)).toBe("Ctrl+Shift+1");
    expect(comboParts("PageDown", false)).toEqual(["Page Down"]);
    expect(comboParts("ArrowUp", true)).toEqual(["↑"]);
  });

  it("refuses keys that clash with typing or the computer", () => {
    expect(comboProblem("B")).not.toBe("");
    expect(comboProblem("1")).not.toBe("");
    expect(comboProblem("Tab")).not.toBe("");
    expect(comboProblem("Mod+C")).not.toBe("");
    expect(comboProblem("Mod+Q")).not.toBe("");
    expect(comboProblem("Mod+B")).toBe("");
    expect(comboProblem("Alt+B")).toBe("");
    expect(comboProblem("F5")).toBe("");
    expect(comboProblem("Space")).toBe("");
  });
});

describe("conflicts", () => {
  it("find the action that already has the key", () => {
    const b = buildBindings();
    expect(findConflict(b, "black-screen", "Mod+1")).toBe("section-bible");
    expect(findConflict(b, "section-bible", "Mod+1")).toBeNull();
    expect(findConflict(b, "black-screen", "Mod+Alt+Z")).toBeNull();
  });
});

describe("the user's own keys", () => {
  beforeEach(() => {
    vi.resetModules();
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
  });

  it("are kept, can be put back, and survive a restart", async () => {
    const mod = await import("./shortcuts");
    expect(mod.anyCustomised()).toBe(false);
    mod.setShortcut("black-screen", ["Alt+B", "Mod+Alt+K"]);
    expect(mod.getBindings()["black-screen"]).toEqual(["Alt+B", "Mod+Alt+K"]);
    expect(mod.isCustomised("black-screen")).toBe(true);
    expect(localStorage.getItem("mce-studio-shortcuts")).toContain("black-screen");

    vi.resetModules();
    const again = await import("./shortcuts");
    expect(again.getBindings()["black-screen"]).toEqual(["Alt+B", "Mod+Alt+K"]);

    again.resetShortcut("black-screen");
    expect(again.getBindings()["black-screen"]).toEqual(["Alt+B"]);
    expect(localStorage.getItem("mce-studio-shortcuts")).toBeNull();
  });

  it("drop the override when the usual keys are put in again", async () => {
    const mod = await import("./shortcuts");
    mod.setShortcut("black-screen", ["Mod+Alt+K"]);
    expect(mod.isCustomised("black-screen")).toBe(true);
    mod.setShortcut("black-screen", ["Alt+B"]);
    expect(mod.isCustomised("black-screen")).toBe(false);
  });

  it("can leave an action with no key, and put everything back", async () => {
    const mod = await import("./shortcuts");
    mod.setShortcut("section-bible", []);
    expect(mod.getBindings()["section-bible"]).toEqual([]);
    mod.setShortcut("logo-screen", ["Mod+Alt+L"]);
    mod.resetAllShortcuts();
    expect(mod.anyCustomised()).toBe(false);
    expect(mod.getBindings()["section-bible"]).toEqual(["Mod+1"]);
  });

  it("ignore a damaged saved value", async () => {
    localStorage.setItem("mce-studio-shortcuts", "{not json");
    const mod = await import("./shortcuts");
    expect(mod.getBindings()["section-bible"]).toEqual(["Mod+1"]);
  });
});
