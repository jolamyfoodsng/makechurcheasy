/**
 * shortcuts.ts — the Studio's keyboard shortcuts: what they are, how a key press is matched, and
 * the ones the user changed (kept on this computer).
 *
 * Combos are written as text, e.g. "Mod+K", "Alt+B", "Mod+Shift+1", "Space", "PageDown".
 *   Mod  = Cmd on a Mac, Ctrl on Windows.
 * Keys are read from the physical key (event.code), so Option+B on a Mac and a non-English
 * keyboard layout still match.
 *
 * Plain letters and digits are NOT shortcuts here: typing anywhere starts the search.
 * The defaults are the usual ones from other apps (Cmd/Ctrl+1..4 for tabs, Cmd/Ctrl+K search,
 * Cmd/Ctrl+, settings, Cmd/Ctrl +/- zoom, F11 full screen, Space / arrows / Page keys for slides).
 */
import { useSyncExternalStore } from "react";

export type ShortcutGroup = "Go to" | "On the screen" | "Look and content" | "Windows and app";

export interface ShortcutDef {
  id: string;
  label: string;
  group: ShortcutGroup;
  /** Default combos (an action can have more than one). */
  keys: readonly string[];
  /** Works while the cursor is in a text box (search, settings, switching section). */
  whileTyping?: boolean;
  /** Keeps firing while the key is held (arrows, Space). */
  repeat?: boolean;
  /** One short line shown under the name. */
  hint?: string;
}

const DEFS = [
  // ── Go to ──
  { id: "section-bible", label: "Go to Bible", group: "Go to", keys: ["Mod+1"], whileTyping: true },
  { id: "section-text", label: "Go to Text (songs and notes)", group: "Go to", keys: ["Mod+2"], whileTyping: true },
  { id: "section-media", label: "Go to Media", group: "Go to", keys: ["Mod+3"], whileTyping: true },
  { id: "section-docs", label: "Go to Docs", group: "Go to", keys: ["Mod+4"], whileTyping: true },
  { id: "section-ministry", label: "Go to Ministry (ticker, countdown, clock)", group: "Go to", keys: ["Mod+5"], whileTyping: true },
  { id: "text-songs", label: "Text: Songs", group: "Go to", keys: ["Mod+Shift+1"] },
  { id: "text-notes", label: "Text: Notes", group: "Go to", keys: ["Mod+Shift+2"] },
  { id: "search", label: "Search everything", group: "Go to", keys: ["Mod+K", "Mod+F"], whileTyping: true, hint: "Or just start typing" },
  { id: "toggle-schedule", label: "Show or hide the Schedule", group: "Go to", keys: ["Mod+Shift+S"] },
  { id: "graphics", label: "Open Broadcast graphics", group: "Go to", keys: ["Mod+G"] },
  { id: "panel-verseai", label: "Open Verse AI", group: "Go to", keys: ["Mod+J"] },
  { id: "vai-tab", label: "Verse AI: Queue, Transcript, History", group: "Go to", keys: ["Alt+Q"], hint: "Each press shows the next tab" },
  { id: "fold-panel", label: "Fold or open the side panel", group: "Go to", keys: ["Mod+B"] },
  { id: "themes", label: "Choose a theme", group: "Go to", keys: ["Mod+T"] },
  { id: "edit-theme", label: "Edit the theme in use", group: "Go to", keys: ["Mod+Shift+T"] },
  { id: "new-song", label: "New song", group: "Go to", keys: ["Mod+N"] },

  // ── On the screen ──
  { id: "send-screen", label: "Send Preview to Screen", group: "On the screen", keys: ["Enter", "Mod+Enter"] },
  { id: "go-live-next", label: "Show Preview, then the next one", group: "On the screen", keys: ["Space", "PageDown"], repeat: true },
  { id: "go-live-prev", label: "Show the one before", group: "On the screen", keys: ["PageUp", "Shift+Space"], repeat: true },
  { id: "select-next", label: "Select the next slide or verse", group: "On the screen", keys: ["ArrowDown", "ArrowRight"], repeat: true },
  { id: "select-prev", label: "Select the one before", group: "On the screen", keys: ["ArrowUp", "ArrowLeft"], repeat: true },
  { id: "clear-screen", label: "Clear the screen", group: "On the screen", keys: ["Mod+Backspace"], hint: "Takes everything off" },
  { id: "black-screen", label: "Black screen", group: "On the screen", keys: ["Alt+B"] },
  { id: "logo-screen", label: "Logo screen", group: "On the screen", keys: ["Alt+L"] },
  { id: "next-schedule", label: "Next item in the Schedule", group: "On the screen", keys: ["Alt+N"] },
  { id: "add-schedule", label: "Add to Schedule", group: "On the screen", keys: ["Mod+D"] },
  { id: "close-graphic", label: "Close the graphic on the screen", group: "On the screen", keys: ["Alt+G"] },
  { id: "look-fullscreen", label: "Full screen (words, no camera)", group: "On the screen", keys: ["Alt+1"] },
  { id: "look-lowerthird", label: "Lower third (words, no camera)", group: "On the screen", keys: ["Alt+2"] },
  { id: "scene-camera", label: "Camera only", group: "On the screen", keys: ["Alt+3"] },
  { id: "scene-camera-lt", label: "Camera + lower third", group: "On the screen", keys: ["Alt+4"] },
  { id: "queue-project", label: "Project the next verse in the Queue", group: "On the screen", keys: ["Alt+Enter"] },
  { id: "monitor-toggle", label: "Monitor: Preview or Output", group: "On the screen", keys: ["Alt+O"] },

  // ── Look and content ──
  { id: "preview-first", label: "Preview first / Straight to screen", group: "Look and content", keys: ["Alt+P"] },
  { id: "transition", label: "Fade or Cut between slides", group: "Look and content", keys: ["Alt+T"] },
  { id: "auto", label: "Auto mode on or off", group: "Look and content", keys: ["Alt+A"] },
  { id: "listen", label: "Start or stop listening (Verse AI)", group: "Look and content", keys: ["Alt+M"] },
  { id: "text-bigger", label: "Bigger text", group: "Look and content", keys: ["Mod+=", "Mod+Shift+="], repeat: true },
  { id: "text-smaller", label: "Smaller text", group: "Look and content", keys: ["Mod+-"], repeat: true },
  { id: "text-reset", label: "Text size back to normal", group: "Look and content", keys: ["Mod+0"] },

  // ── Windows and app ──
  { id: "output-open", label: "Open the output on the screen", group: "Windows and app", keys: ["Mod+Shift+O"] },
  { id: "output-stop", label: "Stop the output", group: "Windows and app", keys: ["Mod+Shift+X"] },
  { id: "settings", label: "Open Settings", group: "Windows and app", keys: ["Mod+,"], whileTyping: true },
  { id: "shortcuts", label: "Show the keyboard shortcuts", group: "Windows and app", keys: ["Mod+/"], whileTyping: true },
  { id: "fullscreen", label: "Full screen window", group: "Windows and app", keys: ["F11"], whileTyping: true },
  { id: "back", label: "Back to the previous page", group: "Windows and app", keys: ["Mod+["] },
] as const;

export type ShortcutId = (typeof DEFS)[number]["id"];

export const SHORTCUT_DEFS: ReadonlyArray<ShortcutDef & { id: ShortcutId }> = DEFS;
export const SHORTCUT_GROUPS: ShortcutGroup[] = ["Go to", "On the screen", "Look and content", "Windows and app"];

export function shortcutDef(id: string): (ShortcutDef & { id: ShortcutId }) | undefined {
  return SHORTCUT_DEFS.find((d) => d.id === id);
}

export type ShortcutBindings = Record<ShortcutId, string[]>;

// ───────────────────────────── combos ─────────────────────────────

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
}

const NAMED_KEYS: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Home: "Home",
  End: "End",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Minus: "-",
  NumpadSubtract: "-",
  Equal: "=",
  NumpadAdd: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Backslash: "\\",
};

/** The key part of a combo from a key event ("B", "1", "F11", "PageDown", ","…), or null for a bare modifier. */
function keyName(e: Pick<KeyboardEvent, "code" | "key">): string | null {
  const code = e.code || "";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (NAMED_KEYS[code]) return NAMED_KEYS[code];
  if (!code && e.key) {
    // Some webviews give no code: fall back to the typed character.
    if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
    if (/^[0-9]$/.test(e.key)) return e.key;
    if (e.key === " ") return "Space";
    if (e.key === "PageUp" || e.key === "PageDown" || e.key.startsWith("Arrow") || /^F\d+$/.test(e.key)) return e.key;
    if (e.key === "Enter" || e.key === "Escape" || e.key === "Backspace" || e.key === "Delete") return e.key;
  }
  return null;
}

type KeyLike = Pick<KeyboardEvent, "code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** The combo for a key press ("Mod+Shift+1"), or null when it is only a modifier, or an unsupported key. */
export function eventToCombo(e: KeyLike, mac: boolean = isMacPlatform()): string | null {
  const key = keyName(e);
  if (!key) return null;
  // The "other" modifier (Ctrl on a Mac, the Windows key on a PC) is not used, so it never fires a shortcut.
  if (mac ? e.ctrlKey : e.metaKey) return null;
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/** Same combo, written one way (modifiers in a fixed order, key upper case). */
export function normalizeCombo(combo: string): string {
  const parts = combo.split("+").map((p) => p.trim()).filter(Boolean);
  // A "+" key itself would have been split away; treat "Mod++" as Mod and "=".
  const mods = { Mod: false, Alt: false, Shift: false };
  let key = "";
  for (const part of parts) {
    if (part === "Mod" || part === "Alt" || part === "Shift") mods[part] = true;
    else key = part.length === 1 ? part.toUpperCase() : part;
  }
  return [mods.Mod ? "Mod" : "", mods.Alt ? "Alt" : "", mods.Shift ? "Shift" : "", key].filter(Boolean).join("+");
}

const KEY_TEXT_MAC: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Backspace: "⌫", Enter: "↩", Escape: "Esc", PageUp: "Page Up", PageDown: "Page Down" };
const KEY_TEXT_PC: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", PageUp: "Page Up", PageDown: "Page Down" };

/** The pieces of a combo as people read them: ["⌘", "K"] on a Mac, ["Ctrl", "K"] on Windows. */
export function comboParts(combo: string, mac: boolean = isMacPlatform()): string[] {
  const parts = normalizeCombo(combo).split("+");
  const texts = mac ? KEY_TEXT_MAC : KEY_TEXT_PC;
  return parts.map((p) => {
    if (p === "Mod") return mac ? "⌘" : "Ctrl";
    if (p === "Alt") return mac ? "⌥" : "Alt";
    if (p === "Shift") return mac ? "⇧" : "Shift";
    return texts[p] ?? p;
  });
}

export function comboLabel(combo: string, mac: boolean = isMacPlatform()): string {
  const parts = comboParts(combo, mac);
  return mac ? parts.join("") : parts.join("+");
}

/** Why a combo can't be used, or "" when it can. */
export function comboProblem(combo: string): string {
  const parts = normalizeCombo(combo).split("+");
  const key = parts[parts.length - 1];
  const hasMod = parts.includes("Mod");
  const hasAlt = parts.includes("Alt");
  const typingKey = /^[A-Z0-9]$/.test(key) || [",", ".", "/", "-", "=", "[", "]", ";", "'", "`", "\\"].includes(key);
  if (typingKey && !hasMod && !hasAlt) return "Add Ctrl/Cmd or Alt, so it does not clash with typing to search.";
  if (key === "Tab") return "Tab is used to move between buttons.";
  if (hasMod && !hasAlt && !parts.includes("Shift") && ["C", "V", "X", "A", "Z", "Y"].includes(key)) return "That one is for copy, paste, select all and undo.";
  if (hasMod && !hasAlt && ["Q", "W", "M", "H"].includes(key)) return "That one belongs to the computer (quit, close, minimise, hide).";
  return "";
}

// ───────────────────────────── recording a new key ─────────────────────────────

let recordingNow = false;

/** True while the settings are waiting for a key to be pressed (so Esc cancels that, not the dialog). */
export function setRecordingShortcut(on: boolean): void {
  recordingNow = on;
}
export function isRecordingShortcut(): boolean {
  return recordingNow;
}

// ───────────────────────────── bindings ─────────────────────────────

const STORAGE_KEY = "mce-studio-shortcuts";

function readOverrides(): Partial<Record<ShortcutId, string[]>> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: Partial<Record<ShortcutId, string[]>> = {};
    for (const def of SHORTCUT_DEFS) {
      const value = (raw as Record<string, unknown>)[def.id];
      if (Array.isArray(value)) out[def.id] = value.filter((v): v is string => typeof v === "string").map(normalizeCombo).filter(Boolean);
    }
    return out;
  } catch {
    return {};
  }
}

function writeOverrides(overrides: Partial<Record<ShortcutId, string[]>>): void {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

/** Defaults with the user's changes on top. */
export function buildBindings(overrides: Partial<Record<ShortcutId, string[]>> = {}): ShortcutBindings {
  const out = {} as ShortcutBindings;
  for (const def of SHORTCUT_DEFS) out[def.id] = [...(overrides[def.id] ?? def.keys.map(normalizeCombo))];
  return out;
}

let overridesNow: Partial<Record<ShortcutId, string[]>> = readOverrides();
let snapshot: ShortcutBindings = buildBindings(overridesNow);
const listeners = new Set<() => void>();

function commit(next: Partial<Record<ShortcutId, string[]>>): void {
  overridesNow = next;
  snapshot = buildBindings(next);
  writeOverrides(next);
  listeners.forEach((fn) => fn());
}

export function getBindings(): ShortcutBindings {
  return snapshot;
}

export function subscribeBindings(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The live bindings: re-renders when the user changes one. */
export function useShortcutBindings(): ShortcutBindings {
  return useSyncExternalStore(subscribeBindings, getBindings, getBindings);
}

export function isCustomised(id: ShortcutId): boolean {
  return overridesNow[id] !== undefined;
}

export function anyCustomised(): boolean {
  return Object.keys(overridesNow).length > 0;
}

/** Set the combos for one action ([] = no key). Putting the defaults back removes the override. */
export function setShortcut(id: ShortcutId, combos: string[]): void {
  const def = shortcutDef(id);
  if (!def) return;
  const clean = Array.from(new Set(combos.map(normalizeCombo).filter(Boolean)));
  const same = clean.length === def.keys.length && def.keys.every((k) => clean.includes(normalizeCombo(k)));
  const next = { ...overridesNow };
  if (same) delete next[id];
  else next[id] = clean;
  commit(next);
}

export function resetShortcut(id: ShortcutId): void {
  if (overridesNow[id] === undefined) return;
  const next = { ...overridesNow };
  delete next[id];
  commit(next);
}

export function resetAllShortcuts(): void {
  commit({});
}

/** Which other action already uses this combo. */
export function findConflict(bindings: ShortcutBindings, id: ShortcutId, combo: string): ShortcutId | null {
  const wanted = normalizeCombo(combo);
  for (const def of SHORTCUT_DEFS) {
    if (def.id !== id && bindings[def.id].includes(wanted)) return def.id;
  }
  return null;
}

/** The action a combo triggers (the first one, if two share it). */
export function matchShortcut(combo: string, bindings: ShortcutBindings): ShortcutId | null {
  for (const def of SHORTCUT_DEFS) {
    if (bindings[def.id].includes(combo)) return def.id;
  }
  return null;
}
