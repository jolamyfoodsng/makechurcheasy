/**
 * contentSlots.ts — CG-style content slot persistence for lower-thirds
 *
 * 10 memory slots per lower-third, stored in localStorage.
 * Slots store ONLY variable values (not theme, not design settings).
 * Key format: `mce-lt-slots-{themeId}-{editorId}`
 */

import type { LowerThirdTheme } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single content slot — stores variable key→value snapshot */
export interface ContentSlot {
  /** Slot index (0-9) */
  index: number;
  /** Variable values snapshot */
  values: Record<string, string>;
  /** Display label (auto-generated from first text value or "Slot N") */
  label: string;
  /** Timestamp when saved */
  savedAt: number;
}

/** Result of a save operation */
export interface SaveSlotResult {
  slot: ContentSlot;
  index: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_SLOTS = 10;
const STORAGE_PREFIX = "mce-lt-slots";

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function storageKey(themeId: string, editorId: string): string {
  return `${STORAGE_PREFIX}-${themeId}-${editorId}`;
}

/**
 * Load all slots for a given theme+editor combination.
 * Returns an array of length MAX_SLOTS (empty slots are null).
 */
export function loadSlots(themeId: string, editorId: string): (ContentSlot | null)[] {
  try {
    const raw = localStorage.getItem(storageKey(themeId, editorId));
    if (!raw) return Array(MAX_SLOTS).fill(null);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return Array(MAX_SLOTS).fill(null);
    // Pad to MAX_SLOTS
    const slots: (ContentSlot | null)[] = parsed.slice(0, MAX_SLOTS);
    while (slots.length < MAX_SLOTS) slots.push(null);
    return slots;
  } catch {
    return Array(MAX_SLOTS).fill(null);
  }
}

/**
 * Save a slot at a specific index.
 * Returns the saved ContentSlot.
 */
export function saveSlot(
  themeId: string,
  editorId: string,
  index: number,
  values: Record<string, string>,
  theme: LowerThirdTheme
): ContentSlot {
  if (index < 0 || index >= MAX_SLOTS) throw new Error(`Invalid slot index: ${index}`);

  const label = generateSlotLabel(values, theme, index);
  const slot: ContentSlot = {
    index,
    values: { ...values },
    label,
    savedAt: Date.now(),
  };

  const slots = loadSlots(themeId, editorId);
  slots[index] = slot;
  localStorage.setItem(storageKey(themeId, editorId), JSON.stringify(slots));

  return slot;
}

/**
 * Delete a slot at a specific index.
 */
export function deleteSlot(themeId: string, editorId: string, index: number): void {
  if (index < 0 || index >= MAX_SLOTS) return;
  const slots = loadSlots(themeId, editorId);
  slots[index] = null;
  localStorage.setItem(storageKey(themeId, editorId), JSON.stringify(slots));
}

/**
 * Get all populated (non-null) slots.
 */
export function getPopulatedSlots(
  themeId: string,
  editorId: string
): ContentSlot[] {
  return loadSlots(themeId, editorId).filter((s): s is ContentSlot => s !== null);
}

/**
 * Get the next populated slot after (and including) startIndex.
 * Wraps around. Returns null if no populated slots.
 */
export function getNextPopulatedSlot(
  themeId: string,
  editorId: string,
  startIndex: number = 0
): ContentSlot | null {
  const slots = loadSlots(themeId, editorId);
  if (slots.every((s) => s === null)) return null;

  // Search from startIndex to end, then wrap to beginning
  for (let i = startIndex; i < MAX_SLOTS; i++) {
    if (slots[i]) return slots[i]!;
  }
  for (let i = 0; i < startIndex; i++) {
    if (slots[i]) return slots[i]!;
  }
  return null;
}

/**
 * Get the first empty slot index, or -1 if all full.
 */
export function getFirstEmptySlot(themeId: string, editorId: string): number {
  const slots = loadSlots(themeId, editorId);
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (slots[i] === null) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Auto-generate a label from variable values.
 * Uses the first non-empty text value, or falls back to "Slot N".
 */
function generateSlotLabel(
  values: Record<string, string>,
  theme: LowerThirdTheme,
  index: number
): string {
  const vars = theme.variables;
  // Try to find first text-type variable with a value
  for (const v of vars) {
    if (v.type === "text" || v.type === "list") {
      const val = values[v.key];
      if (val && val.trim()) {
        // Truncate to 30 chars
        const text = val.trim();
        return text.length > 30 ? text.substring(0, 27) + "..." : text;
      }
    }
  }
  // Fallback
  return `Slot ${index + 1}`;
}
