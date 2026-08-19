/**
 * useKeyboardShortcuts.ts — Centralized keyboard shortcut manager for the dock UI.
 *
 * Supports the Dock's primary Command/Ctrl shortcuts plus the legacy ALT + SHIFT + KEY
 * namespace used for utility actions.
 * Supports:
 * - Focus detection (ignores shortcuts when typing in inputs)
 * - Emergency action double-trigger logic
 * - Visual toast feedback
 * - Remappable shortcuts (future-ready)
 */

import { useEffect, useRef, useCallback, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

export type ShortcutKey = string;
export type ShortcutHandler = () => void;
export type ShortcutModifier = "altShift" | "primary";

export interface ShortcutDefinition {
  key: ShortcutKey;
  handler: ShortcutHandler;
  label: string;
  category: ShortcutCategory;
  modifier?: ShortcutModifier;
  dangerous?: boolean;
}

export type ShortcutCategory =
  | "Navigation"
  | "Bible"
  | "Worship"
  | "Media"
  | "Live Tools"
  | "Emergency"
  | "Monitoring"
  | "Utility";

export interface ShortcutToast {
  id: number;
  label: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const EMERGENCY_DOUBLE_TRIGGER_WINDOW_MS = 500;
const TOAST_DURATION_MS = 1200;
let toastIdCounter = 0;

// ── Focus Detection ─────────────────────────────────────────────────────────

function isTypingInInput(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (active.getAttribute("contenteditable") === "true") return true;
  if (active.closest("[contenteditable]")) return true;
  return false;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useKeyboardShortcuts(
  shortcuts: ShortcutDefinition[],
  enabled = true,
) {
  const [toasts, setToasts] = useState<ShortcutToast[]>([]);
  const emergencyTimersRef = useRef<Map<string, number>>(new Map());
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const showToast = useCallback((label: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, label }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingInInput()) return;

      const key = event.key.toLowerCase();
      const defs = shortcutsRef.current;
      const def = defs.find((d) => d.key.toLowerCase() === key);
      if (!def) return;

      const modifier = def.modifier ?? "altShift";
      const hasPrimaryModifier = event.metaKey || event.ctrlKey;
      const modifierMatches = modifier === "primary"
        ? hasPrimaryModifier && !event.altKey && !event.shiftKey
        : event.altKey && event.shiftKey && !hasPrimaryModifier;
      if (!modifierMatches) return;

      event.preventDefault();
      event.stopPropagation();

      // Emergency actions require double-trigger
      if (def.dangerous) {
        const now = Date.now();
        const lastTrigger = emergencyTimersRef.current.get(def.key) ?? 0;
        if (now - lastTrigger < EMERGENCY_DOUBLE_TRIGGER_WINDOW_MS) {
          emergencyTimersRef.current.delete(def.key);
          def.handler();
          showToast(def.label);
        } else {
          emergencyTimersRef.current.set(def.key, now);
          showToast(`Press ${def.key.toUpperCase()} again to confirm`);
        }
        return;
      }

      def.handler();
      showToast(def.label);
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, showToast]);

  return { toasts, showToast };
}

// ── Shortcut Map (for reference in settings/help overlay) ───────────────────

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  "Navigation",
  "Bible",
  "Worship",
  "Media",
  "Live Tools",
  "Emergency",
  "Monitoring",
  "Utility",
];

export function formatShortcut(key: string, modifier: ShortcutModifier = "altShift"): string {
  if (modifier === "primary") {
    const platform = typeof navigator === "undefined"
      ? ""
      : `${navigator.platform} ${navigator.userAgent}`;
    return `${/Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘" : "Ctrl"} + ${key.toUpperCase()}`;
  }
  return `Alt + Shift + ${key.toUpperCase()}`;
}
