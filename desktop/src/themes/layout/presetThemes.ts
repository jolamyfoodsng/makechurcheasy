/**
 * The layout presets as BibleTheme records, so they show up anywhere the app
 * lists themes (Create Theme library, Themes page, dock pickers).
 *
 * Every preset ships both looks: its own format plus a matching companion
 * (see companions.ts), so a theme always works full screen and as a lower third.
 */
import { DEFAULT_THEME_SETTINGS, type BibleTheme } from "../../bible/types";
import { ROYAL_BLUE_GLOW, THEME_PRESETS } from "./presets";
import { presetPair } from "./companions";
import { withAnimatedBackground } from "./backgroundPatterns";
import {
  NAVY_SCRIPTURE,
  PAPER_CARD_FS,
  SET2_PRESETS,
  VIOLET_PLAIN_FS,
  VIOLET_SPLIT,
  WHITE_PILL,
} from "./presetsSet2";
import type { ThemeLayout } from "./types";

const PRESET_DATE = "2026-10-08T00:00:00.000Z";
const SET2_DATE = "2026-10-12T00:00:00.000Z";

function layoutTheme(
  id: string,
  name: string,
  primary: "fullscreen" | "lower-third",
  fullscreenLayout: ThemeLayout,
  lowerThirdLayout: ThemeLayout,
  date: string,
  description?: string,
): BibleTheme {
  // Full screens get the slow animated pattern + glow behind the text (backgroundPatterns.ts).
  const fullscreen = { ...DEFAULT_THEME_SETTINGS, layout: withAnimatedBackground(fullscreenLayout, id) };
  const lowerThird = { ...DEFAULT_THEME_SETTINGS, layout: lowerThirdLayout };
  return {
    id,
    name,
    description,
    source: "builtin",
    templateType: primary,
    category: "bible",
    categories: ["bible", "worship", "general"],
    settings: primary === "fullscreen" ? fullscreen : lowerThird,
    variants: { fullscreen: { settings: fullscreen }, lowerThird: { settings: lowerThird } },
    enabledVariants: ["fullscreen", "lower-third"],
    createdAt: date,
    updatedAt: date,
  };
}

/** Second reference set: lower thirds with hand-made full screens. */
const SET2_THEMES: BibleTheme[] = SET2_PRESETS.map(({ id, name, layout, companion }) =>
  layoutTheme(id, name, "lower-third", companion, layout, SET2_DATE),
);

function presetTheme({ id, name, layout }: { id: string; name: string; layout: ThemeLayout }): BibleTheme {
  const pair = presetPair(layout);
  return layoutTheme(id, name, layout.format, pair.fullscreen, pair.lowerThird, PRESET_DATE);
}

/** Ready-made themes promoted to starters (same ids as before, so saved picks keep working). */
const PRESET_STARTER_IDS = ["preset-caption-rule", "preset-broadcast-caption", "preset-chapter-number"];
const PRESET_STARTERS: BibleTheme[] = PRESET_STARTER_IDS.map((id) => presetTheme(THEME_PRESETS.find((p) => p.id === id)!));

// The promoted ones are listed once, as starters.
const FIRST_SET_THEMES: BibleTheme[] = THEME_PRESETS.filter((p) => !PRESET_STARTER_IDS.includes(p.id)).map(presetTheme);

/**
 * Starter themes a new account sees first: Caption Rule, Broadcast Caption and
 * Chapter Number, then three looks put together from the ready-made ones.
 * `STARTER_DEFAULT_THEME_ID` (Caption Rule) is what Bible, Worship and Notes use
 * until someone picks another theme.
 */
export const STARTER_DEFAULT_THEME_ID = "preset-caption-rule";
export const STARTER_THEMES: BibleTheme[] = [
  ...PRESET_STARTERS,
  layoutTheme("starter-glory-blue", "Glory Blue", "fullscreen", ROYAL_BLUE_GLOW, NAVY_SCRIPTURE, SET2_DATE,
    "Starter theme: Royal Blue Glow full screen with the Navy Scripture lower third."),
  layoutTheme("starter-clean-paper", "Clean Paper", "fullscreen", PAPER_CARD_FS, WHITE_PILL, SET2_DATE,
    "Starter theme: light paper card full screen with the White Pill lower third."),
  layoutTheme("starter-violet-praise", "Violet Praise", "fullscreen", VIOLET_PLAIN_FS, VIOLET_SPLIT, SET2_DATE,
    "Starter theme: plain violet full screen (reference on top, verse below) with the Violet Split lower third."),
];

/** Every ready-made layer theme: starters, then the newest set, then the first set. */
export const LAYOUT_PRESET_THEMES: BibleTheme[] = [...STARTER_THEMES, ...SET2_THEMES, ...FIRST_SET_THEMES];

/** Layout of a theme for a mode, if it is an editor-built theme. */
export function getThemeLayout(theme: Pick<BibleTheme, "settings" | "variants" | "templateType">) {
  return (
    theme.settings?.layout ??
    theme.variants?.lowerThird?.settings?.layout ??
    theme.variants?.fullscreen?.settings?.layout ??
    null
  );
}
