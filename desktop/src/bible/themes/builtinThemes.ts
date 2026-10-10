/**
 * builtinThemes.ts — Built-in overlay themes for Bible and Worship presentation.
 */

import type { BibleTheme, BibleThemeSettings } from "../types";
import { DEFAULT_THEME_SETTINGS } from "../types";
import { LAYOUT_PRESET_THEMES } from "../../themes/layout/presetThemes";

// ---------------------------------------------------------------------------
// Default Dark Fullscreen
// ---------------------------------------------------------------------------

const defaultDarkFullscreenSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Charis SIL", "Noto Sans", "CMG Sans", sans-serif',
  fontSize: 56,
  fontWeight: "black",
  fontColor: "#F7F8FB",
  lineHeight: 1.58,
  textAlign: "center",
  textShadow: "4px 5px 2px rgba(0, 0, 0, 0.95)",
  textOutline: true,
  textOutlineColor: "#000000",
  textOutlineWidth: 4,

  refFontSize: 38,
  refFontColor: "#F7F8FB",
  refFontWeight: "black",
  refPosition: "bottom",

  backgroundColor: "#06070B",
  backgroundImage: "",
  backgroundVideo: "",
  backgroundOpacity: 1,
  fullscreenShadeColor: "#05060A",
  fullscreenShadeOpacity: 0.46,
  fullscreenShadeEnabled: true,

  logoUrl: "",
  logoPosition: "bottom-right",
  logoSize: 54,

  padding: 88,
  safeArea: 48,
  borderRadius: 0,
  boxBackground: "transparent",
  boxOpacity: 0,
  boxBackgroundImage: "",

  animation: "fade",
  animationDuration: 420,
};

const defaultDarkFullscreen: BibleTheme = {
  id: "default-dark-fullscreen",
  name: "Default Dark Fullscreen",
  description:
    "Clean dark fullscreen theme for first-time setups with bright verse text and calm contrast.",
  source: "builtin",
  templateType: "fullscreen",
  category: "general",
  categories: ["bible", "worship", "general"],
  settings: defaultDarkFullscreenSettings,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Default Dark Lower Third
// ---------------------------------------------------------------------------

const defaultDarkLowerThirdSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Charis SIL", "Noto Sans", "CMG Sans", sans-serif',
  fontSize: 40,
  fontWeight: "black",
  fontColor: "#F6F8FC",
  lineHeight: 1.42,
  textAlign: "center",
  textShadow: "4px 5px 2px rgba(0, 0, 0, 0.95)",
  textOutline: true,
  textOutlineColor: "#000000",
  textOutlineWidth: 4,

  refFontSize: 28,
  refFontColor: "#F6F8FC",
  refFontWeight: "black",
  refPosition: "bottom",

  backgroundColor: "#0B0E14",
  backgroundImage: "",
  backgroundVideo: "",
  backgroundOpacity: 1,
  fullscreenShadeColor: "#06080C",
  fullscreenShadeOpacity: 0.28,
  fullscreenShadeEnabled: true,

  logoUrl: "",
  logoPosition: "bottom-right",
  logoSize: 44,

  padding: 28,
  safeArea: 34,
  borderRadius: 10,
  boxBackground: "rgba(10, 12, 18, 0.88)",
  boxOpacity: 0.94,
  boxBackgroundImage: "",

  animation: "slide-up",
  animationDuration: 320,
};

const defaultDarkLowerThird: BibleTheme = {
  id: "default-dark-lower-third",
  name: "Default Dark Lower Third",
  description:
    "Dark lower-third theme with a restrained panel and strong readability for live production.",
  source: "builtin",
  templateType: "lower-third",
  category: "general",
  categories: ["bible", "worship", "general"],
  settings: defaultDarkLowerThirdSettings,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Classic Dark
// ---------------------------------------------------------------------------

const classicDarkSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Charis SIL", "Noto Sans", "CMG Sans", sans-serif',
  fontSize: 52,
  fontWeight: "black",
  fontColor: "#FFFFFF",
  lineHeight: 1.7,
  textAlign: "center",
  textShadow: "4px 5px 2px rgba(0, 0, 0, 0.95)",
  textOutline: true,
  textOutlineColor: "#000000",
  textOutlineWidth: 4,

  refFontSize: 36,
  refFontColor: "#FFFFFF",
  refFontWeight: "black",
  refPosition: "bottom",

  backgroundColor: "#0a0a14",
  backgroundImage: "",
  backgroundVideo: "",
  backgroundOpacity: 1,

  logoUrl: "",
  logoPosition: "bottom-right",
  logoSize: 60,

  padding: 80,
  safeArea: 50,
  borderRadius: 0,
  boxBackground: "transparent",
  boxOpacity: 0,

  animation: "fade",
  animationDuration: 500,
};

const classicDark: BibleTheme = {
  id: "classic-dark",
  name: "Classic Dark",
  description:
    "Traditional white-on-dark presentation style. High contrast, highly legible for all congregation sizes.",
  source: "builtin",
  templateType: "fullscreen",
  settings: classicDarkSettings,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Modern Light
// ---------------------------------------------------------------------------

const modernLightSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Charis SIL", "Noto Sans", "CMG Sans", sans-serif',
  fontSize: 44,
  fontWeight: "bold",
  fontColor: "#FFFFFF",
  lineHeight: 1.5,
  textAlign: "center",
  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
  textOutline: false,
  textOutlineColor: "#000000",
  textOutlineWidth: 0,

  refFontSize: 32,
  refFontColor: "#FFFFFF",
  refFontWeight: "bold",
  refPosition: "bottom",

  backgroundColor: "#0F172A",
  backgroundImage: "",
  backgroundVideo: "",
  backgroundOpacity: 1,

  logoUrl: "",
  logoPosition: "bottom-right",
  logoSize: 60,

  padding: 40,
  safeArea: 30,
  borderRadius: 12,
  boxBackground: "rgba(26, 26, 46, 0.85)",
  boxOpacity: 0.9,

  animation: "slide-up",
  animationDuration: 400,
};

const modernLight: BibleTheme = {
  id: "modern-lower-third",
  name: "Modern Lower Third",
  description:
    "Contemporary lower-third overlay with semi-transparent box. Great for modern worship and youth services.",
  source: "builtin",
  templateType: "lower-third",
  settings: modernLightSettings,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Cinematic
// ---------------------------------------------------------------------------

const cinematicSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Charis SIL", "Noto Sans", "CMG Sans Bold", "CMG Sans", sans-serif',
  fontSize: 56,
  fontWeight: "black",
  fontColor: "#FFFFFF",
  lineHeight: 1.8,
  textAlign: "center",
  textShadow: "4px 5px 2px rgba(0, 0, 0, 0.95)",
  textOutline: true,
  textOutlineColor: "#000000",
  textOutlineWidth: 4,

  refFontSize: 38,
  refFontColor: "#FFFFFF",
  refFontWeight: "black",
  refPosition: "bottom",

  backgroundColor: "#000000",
  backgroundImage: "",
  backgroundVideo: "",
  backgroundOpacity: 1,

  logoUrl: "",
  logoPosition: "bottom-right",
  logoSize: 60,

  padding: 100,
  safeArea: 60,
  borderRadius: 0,
  boxBackground: "transparent",
  boxOpacity: 0,

  animation: "fade",
  animationDuration: 800,
};

const cinematic: BibleTheme = {
  id: "cinematic",
  name: "Cinematic",
  description:
    "Bold cinematic look with heavy shadows and gold reference text. Makes scripture feel epic.",
  source: "builtin",
  templateType: "fullscreen",
  settings: cinematicSettings,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Clean Minimal
// ---------------------------------------------------------------------------

const cleanMinimalSettings: BibleThemeSettings = {
  ...DEFAULT_THEME_SETTINGS,
  fontFamily: '"Charis SIL", "Noto Sans", "CMG Sans Light", "CMG Sans", sans-serif',
  fontSize: 40,
  fontWeight: "bold",
  fontColor: "#333333",
  lineHeight: 1.6,
  textAlign: "center",
  textShadow: "none",
  textOutline: false,
  textOutlineColor: "#000000",
  textOutlineWidth: 0,

  refFontSize: 28,
  refFontColor: "#333333",
  refFontWeight: "bold",
  refPosition: "bottom",

  backgroundColor: "#f8f8f8",
  backgroundImage: "",
  backgroundVideo: "",
  backgroundOpacity: 1,

  logoUrl: "",
  logoPosition: "bottom-right",
  logoSize: 50,

  padding: 80,
  safeArea: 50,
  borderRadius: 0,
  boxBackground: "transparent",
  boxOpacity: 0,

  animation: "fade",
  animationDuration: 300,
};

const cleanMinimal: BibleTheme = {
  id: "clean-minimal",
  name: "Clean Minimal",
  description:
    "Light, clean design with minimal decoration. Good for projectors and bright environments.",
  source: "builtin",
  templateType: "fullscreen",
  settings: cleanMinimalSettings,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

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
  defaultDarkFullscreen,
  defaultDarkLowerThird,
  classicDark,
  modernLight,
  cinematic,
  cleanMinimal,
  sageForestBadge,
  obsidianFloatingHeader,
  midnightPlumCrest,
  cobaltCompactCard,
  cyanWaveBroadcast,
  // Layout-based lower thirds (Aurora Glass, Chapter Number, Caption Rule,
  // Accent Card…), so they show on the Themes page and in the Dock pickers.
  ...LAYOUT_PRESET_THEMES,
];
