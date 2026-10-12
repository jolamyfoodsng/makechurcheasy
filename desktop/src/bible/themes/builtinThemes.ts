/**
 * builtinThemes.ts — Built-in overlay themes for Bible and Worship presentation.
 */

import type { BibleTheme, BibleThemeSettings } from "../types";
import { DEFAULT_THEME_SETTINGS } from "../types";
import { LAYOUT_PRESET_THEMES, STARTER_DEFAULT_THEME_ID } from "../../themes/layout/presetThemes";

// ---------------------------------------------------------------------------
// Retired classic themes (Oct 2026): Default Dark Fullscreen / Lower Third,
// Classic Dark, Modern Lower Third, Cinematic and Clean Minimal were plain
// placeholder looks. Saved selections that still point at them fall back to
// the starter theme (see resolveBuiltinThemeId).
// ---------------------------------------------------------------------------

export const RETIRED_BUILTIN_THEME_IDS: readonly string[] = [
  "default-dark-fullscreen",
  "default-dark-lower-third",
  "classic-dark",
  "modern-lower-third",
  "cinematic",
  "clean-minimal",
];

// Retired layer themes (Oct 2026): the Violet Split list entry became the Violet
// Praise starter, and Crimson Texture was removed.
const REPLACED_BUILTIN_THEME_IDS: Record<string, string> = {
  "preset-violet-split": "starter-violet-praise",
  "preset-crimson-texture": STARTER_DEFAULT_THEME_ID,
};

/** Theme every module uses until someone picks one (also replaces retired ids). */
export const DEFAULT_BUILTIN_THEME_ID = STARTER_DEFAULT_THEME_ID;

/** A saved theme id, with retired built-ins swapped for the default theme. */
export function resolveBuiltinThemeId(id: string | null | undefined): string {
  if (!id || RETIRED_BUILTIN_THEME_IDS.includes(id)) return DEFAULT_BUILTIN_THEME_ID;
  if (REPLACED_BUILTIN_THEME_IDS[id]) return REPLACED_BUILTIN_THEME_IDS[id];
  return id;
}

// ---------------------------------------------------------------------------
// Curated Reference Lower Thirds
// ---------------------------------------------------------------------------

const sageForestBadgeSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Inter", sans-serif',
  fontSize: 34,
  fontWeight: "normal",
  fontColor: "#FFFFFF",
  lineHeight: 1.35,
  textAlign: "center",
  boxBackground: "#264E41",
  borderRadius: 6,
  padding: 24,
  safeArea: 40,
  refPosition: "top",
  refTextAlign: "left",
  refFontSize: 20,
  refFontColor: "#FFFFFF",
  refFontFamily: '"Cinzel", "Playfair Display", "Georgia", serif',
  refFontWeight: "bold",
  refTextTransform: "uppercase",
  refLetterSpacing: 1.5,
  refSpacing: 14,
  referenceBackgroundEnabled: true,
  referenceBackgroundColor: "#000000",
  referenceBackgroundStyle: "solid",
  referenceBackgroundRadius: 3,
  lowerThirdPosition: "center",
  lowerThirdWidthPreset: "lg",
  lowerThirdSize: "medium",
};

const sageForestBadge: BibleTheme = {
  id: "sage-forest-badge",
  name: "Sage Forest Badge",
  description: "Deep sage green card with high-contrast top-left black scripture badge.",
  source: "builtin",
  templateType: "lower-third",
  category: "bible",
  categories: ["bible"],
  settings: sageForestBadgeSettings,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

const obsidianFloatingHeaderSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Inter", sans-serif',
  fontSize: 34,
  fontWeight: "normal",
  fontColor: "#FFFFFF",
  lineHeight: 1.4,
  textAlign: "center",
  boxBackground: "#0D0D11",
  borderRadius: 4,
  padding: 22,
  safeArea: 40,
  refPosition: "top",
  refTextAlign: "right",
  refFontSize: 18,
  refFontColor: "#CBD5E1",
  refFontWeight: "bold",
  refTextTransform: "uppercase",
  refLetterSpacing: 2,
  refSpacing: 12,
  referenceBackgroundEnabled: false,
  lowerThirdPosition: "center",
  lowerThirdWidthPreset: "lg",
  lowerThirdSize: "medium",
};

const obsidianFloatingHeader: BibleTheme = {
  id: "obsidian-floating-header",
  name: "Obsidian Floating Header",
  description: "Minimal obsidian black card with floating uppercase header reference anchored on the top-right.",
  source: "builtin",
  templateType: "lower-third",
  category: "bible",
  categories: ["bible"],
  settings: obsidianFloatingHeaderSettings,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

const midnightPlumCrestSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Inter", sans-serif',
  fontSize: 34,
  fontWeight: "normal",
  fontColor: "#FFFFFF",
  lineHeight: 1.38,
  textAlign: "center",
  boxBackground: "#231936",
  borderRadius: 6,
  padding: 24,
  safeArea: 40,
  refPosition: "top",
  refTextAlign: "center",
  refFontSize: 20,
  refFontColor: "#311B45",
  refFontWeight: "bold",
  refTextTransform: "uppercase",
  refLetterSpacing: 1.5,
  refSpacing: 14,
  referenceBackgroundEnabled: true,
  referenceBackgroundColor: "#FFFFFF",
  referenceBackgroundStyle: "solid",
  referenceBackgroundRadius: 4,
  lowerThirdPosition: "center",
  lowerThirdWidthPreset: "lg",
  lowerThirdSize: "medium",
};

const midnightPlumCrest: BibleTheme = {
  id: "midnight-plum-crest",
  name: "Midnight Plum Crest",
  description: "Royal midnight plum lower third crowned with a centered white scripture reference badge.",
  source: "builtin",
  templateType: "lower-third",
  category: "bible",
  categories: ["bible"],
  settings: midnightPlumCrestSettings,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

const cobaltCompactCardSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Montserrat", sans-serif',
  fontSize: 32,
  fontWeight: "bold",
  fontColor: "#FFFFFF",
  textTransform: "uppercase",
  lineHeight: 1.28,
  textAlign: "center",
  boxBackground: "#162C7A",
  borderRadius: 4,
  padding: 22,
  safeArea: 40,
  refPosition: "bottom",
  refTextAlign: "right",
  refFontSize: 18,
  refFontColor: "#93C5FD",
  refFontWeight: "bold",
  refTextTransform: "uppercase",
  refLetterSpacing: 1.2,
  refSpacing: 14,
  referenceBackgroundEnabled: true,
  referenceBackgroundColor: "#080F26",
  referenceBackgroundStyle: "solid",
  referenceBackgroundRadius: 4,
  lowerThirdPosition: "center",
  lowerThirdWidthPreset: "md",
  lowerThirdSize: "medium",
};

const cobaltCompactCard: BibleTheme = {
  id: "cobalt-compact-card",
  name: "Cobalt Compact Card",
  description: "Punchy cobalt blue card with bold uppercase verse and bottom-right navy reference badge.",
  source: "builtin",
  templateType: "lower-third",
  category: "bible",
  categories: ["bible"],
  settings: cobaltCompactCardSettings,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

const cyanWaveBroadcastSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Inter", sans-serif',
  fontSize: 30,
  fontWeight: "bold",
  fontColor: "#FFFFFF",
  textTransform: "uppercase",
  lineHeight: 1.28,
  textAlign: "center",
  boxBackground: "#0A1838",
  borderRadius: 0,
  padding: 20,
  safeArea: 0,
  refPosition: "top",
  refTextAlign: "left",
  refFontSize: 24,
  refFontColor: "#22D3EE",
  refFontWeight: "black",
  refTextTransform: "uppercase",
  refLetterSpacing: 1,
  refSpacing: 8,
  referenceBackgroundEnabled: false,
  lowerThirdPosition: "center",
  lowerThirdWidthPreset: "full",
  lowerThirdSize: "medium",
  boxBorderTop: "3px solid #06B6D4",
  boxShadow: "0 -4px 20px rgba(6, 182, 212, 0.35)",
};

const cyanWaveBroadcast: BibleTheme = {
  id: "cyan-wave-broadcast",
  name: "Cyan Wave Broadcast",
  description: "Full-width live broadcast banner with a glowing cyan wave accent and two-column scripture presentation.",
  source: "builtin",
  templateType: "lower-third",
  category: "bible",
  categories: ["bible"],
  settings: cyanWaveBroadcastSettings,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const BUILTIN_THEMES: BibleTheme[] = [
  // Layer themes first: the six starters (Caption Rule is the default), then
  // the reference sets, so they lead the Themes page and the Dock pickers.
  ...LAYOUT_PRESET_THEMES,
  sageForestBadge,
  obsidianFloatingHeader,
  midnightPlumCrest,
  cobaltCompactCard,
  cyanWaveBroadcast,
];
