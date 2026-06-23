/**
 * speakerThemeUtils.ts — Shared utility for detecting speaker/pastor themes
 *
 * Used by both SpeakerModule (Service Hub) and DockLowerThirdEditor (Dock).
 */

import type { LowerThirdTheme } from "./types";

const SPEAKER_DETECTION_TAGS = new Set([
  "speaker", "pastor", "preacher", "minister", "guest-speaker", "guest",
]);

/**
 * Detect whether a theme is speaker/pastor-oriented.
 *
 * Checks (in order):
 *  1. Tags containing "speaker", "pastor", "preacher", "minister", etc.
 *  2. Category === "speaker"
 *  3. Theme name containing "speaker"
 *  4. Variable keys matching speaker-pattern names (name + title)
 */
export function isSpeakerTheme(theme: LowerThirdTheme): boolean {
  // 1. Tags
  if (Array.isArray(theme.tags)) {
    for (const tag of theme.tags) {
      const t = String(tag).trim().toLowerCase();
      if (SPEAKER_DETECTION_TAGS.has(t)) return true;
    }
  }

  // 2. Category
  const cat = String(theme.category || "").toLowerCase();
  if (cat === "speaker" || cat === "pastor" || cat === "preacher") return true;

  // 3. Name
  const name = String(theme.name || "").toLowerCase();
  if (name.includes("speaker") || name.includes("pastor") || name.includes("identity")) return true;

  // 4. Variable key heuristic: if the theme has both "name" and "title" variables
  //    with speaker-like labels, it's likely a speaker theme
  if (Array.isArray(theme.variables) && theme.variables.length >= 2) {
    const keys = theme.variables.map((v) => String(v.key || "").toLowerCase());
    const labels = theme.variables.map((v) => String(v.label || "").toLowerCase());
    const hasNameKey = keys.includes("name") || labels.some((l) => l.includes("name") || l.includes("speaker"));
    const hasTitleKey = keys.includes("title") || labels.some((l) => l.includes("title") || l.includes("role"));
    if (hasNameKey && hasTitleKey) return true;
  }

  return false;
}
