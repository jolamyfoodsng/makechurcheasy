import {
  loadDockPreference,
  readDockPreference,
  saveDockPreference,
  writeDockPreference,
} from "../services/dockPreferenceStorage";
import { readNativeDockSetting } from "../services/localDockSettings";

export interface DockFontFamilyOption {
  id: string;
  label: string;
  family: string;
  group: DockFontFamilyGroup;
}

export type DockFontFamilyGroup =
  | "Unicode & regional"
  | "Clean & readable"
  | "Modern & geometric"
  | "Condensed & display"
  | "Classic serif"
  | "Decorative";

export const DOCK_FONT_FAMILY_GROUPS: readonly DockFontFamilyGroup[] = [
  "Unicode & regional",
  "Clean & readable",
  "Modern & geometric",
  "Condensed & display",
  "Classic serif",
  "Decorative",
];

const DOCK_FONT_FAMILY_STORAGE_KEY = "ocs-dock-font-family";
const DOCK_FONT_SCALE_STORAGE_KEY = "ocs-dock-font-scale";
const DOCK_TYPOGRAPHY_STORAGE_KEY = "ocs-dock-typography";

export interface DockTypographyPreferences {
  [key: string]: unknown;
  fontFamily: string;
  fontScale: number;
  updatedAt?: string;
}

export const DEFAULT_DOCK_FONT_SCALE = 1;
export const DOCK_FONT_SCALE_OPTIONS = [
  { id: "small", label: "Small (90%)", value: 0.9 },
  { id: "default", label: "Default (100%)", value: 1 },
  { id: "large", label: "Large (110%)", value: 1.1 },
  { id: "extra-large", label: "Extra large (125%)", value: 1.25 },
] as const;

export const DEFAULT_DOCK_FONT_FAMILY = '"CMG Sans Black", "CMG Sans", "Charis SIL", "Noto Sans", sans-serif';
const GENERIC_FONT_FAMILIES = new Set([
  "cursive",
  "fantasy",
  "monospace",
  "sans-serif",
  "serif",
  "system-ui",
]);

/**
 * These fallbacks are deliberately kept after the selected family and before
 * a generic family. CSS falls back per glyph, so a pasted symbol or emoji is
 * rendered by a font that contains it instead of being substituted with an
 * unrelated character.
 */
export const DOCK_UNICODE_FALLBACK_FAMILY = [
  '"Charis SIL"',
  '"Noto Sans"',
  '"Noto Sans Symbols 2"',
  '"Noto Sans Symbols"',
  '"Segoe UI Symbol"',
  '"Apple Symbols"',
  '"Arial Unicode MS"',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
  '"Noto Color Emoji"',
  "sans-serif",
].join(", ");

/** Font families bundled with the desktop app and available to OBS overlays. */
export const DOCK_FONT_FAMILY_OPTIONS: readonly DockFontFamilyOption[] = [
  { id: "questrial", label: "Questrial (Pan-African)", family: '"Questrial", "Charis SIL", "Noto Sans", sans-serif', group: "Unicode & regional" },
  { id: "charis-sil", label: "Charis SIL (African languages)", family: '"Charis SIL", "Noto Sans", "CMG Sans", sans-serif', group: "Unicode & regional" },
  { id: "cmg-sans-black", label: "CMG Sans Black", family: '"CMG Sans Black", "CMG Sans", "Charis SIL", "Noto Sans", sans-serif', group: "Unicode & regional" },
  { id: "cmg-sans", label: "CMG Sans", family: '"CMG Sans", "Noto Sans", sans-serif', group: "Unicode & regional" },
  { id: "noto-sans", label: "Noto Sans", family: '"Noto Sans", "Segoe UI", sans-serif', group: "Unicode & regional" },
  { id: "inter", label: "Inter", family: '"Inter", "Segoe UI", sans-serif', group: "Clean & readable" },
  { id: "work-sans", label: "Work Sans", family: '"Work Sans", "Segoe UI", sans-serif', group: "Clean & readable" },
  { id: "karla", label: "Karla", family: '"Karla", "Segoe UI", sans-serif', group: "Clean & readable" },
  { id: "source-sans-3", label: "Source Sans 3", family: '"Source Sans 3", "Segoe UI", sans-serif', group: "Clean & readable" },
  { id: "montserrat", label: "Montserrat", family: '"Montserrat", "Segoe UI", sans-serif', group: "Modern & geometric" },
  { id: "outfit", label: "Outfit", family: '"Outfit", "Segoe UI", sans-serif', group: "Modern & geometric" },
  { id: "sora", label: "Sora", family: '"Sora", "Segoe UI", sans-serif', group: "Modern & geometric" },
  { id: "space-grotesk", label: "Space Grotesk", family: '"Space Grotesk", "Segoe UI", sans-serif', group: "Modern & geometric" },
  { id: "rajdhani", label: "Rajdhani", family: '"Rajdhani", "Segoe UI", sans-serif', group: "Modern & geometric" },
  { id: "orbitron", label: "Orbitron", family: '"Orbitron", "Segoe UI", sans-serif', group: "Modern & geometric" },
  { id: "oswald", label: "Oswald", family: '"Oswald", "Arial Narrow", sans-serif', group: "Condensed & display" },
  { id: "roboto-condensed", label: "Roboto Condensed", family: '"Roboto Condensed", "Arial Narrow", sans-serif', group: "Condensed & display" },
  { id: "barlow-condensed", label: "Barlow Condensed", family: '"Barlow Condensed", "Arial Narrow", sans-serif', group: "Condensed & display" },
  { id: "bebas-neue", label: "Bebas Neue", family: '"Bebas Neue", "Arial Narrow", sans-serif', group: "Condensed & display" },
  { id: "source-serif-4", label: "Source Serif 4", family: '"Source Serif 4", Georgia, serif', group: "Classic serif" },
  { id: "libre-baskerville", label: "Libre Baskerville", family: '"Libre Baskerville", Georgia, serif', group: "Classic serif" },
  { id: "eb-garamond", label: "EB Garamond", family: '"EB Garamond", Georgia, serif', group: "Classic serif" },
  { id: "playfair-display", label: "Playfair Display", family: '"Playfair Display", Georgia, serif', group: "Classic serif" },
  { id: "cormorant-garamond", label: "Cormorant Garamond", family: '"Cormorant Garamond", Georgia, serif', group: "Classic serif" },
  { id: "cinzel", label: "Cinzel", family: '"Cinzel", Georgia, serif', group: "Classic serif" },
  { id: "caveat", label: "Caveat", family: '"Caveat", cursive', group: "Decorative" },
  { id: "dancing-script", label: "Dancing Script", family: '"Dancing Script", cursive', group: "Decorative" },
  { id: "satisfy", label: "Satisfy", family: '"Satisfy", cursive', group: "Decorative" },
  { id: "great-vibes", label: "Great Vibes", family: '"Great Vibes", cursive', group: "Decorative" },
];

export function normalizeDockFontFamily(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return DOCK_FONT_FAMILY_OPTIONS.find((option) => option.family === trimmed)?.family ?? "";
}

/** Return the selected family with a glyph-safe fallback chain appended. */
export function buildDockFontFamilyStack(value: unknown): string {
  const normalized = normalizeDockFontFamily(value) || DEFAULT_DOCK_FONT_FAMILY;
  const families = normalized
    .split(",")
    .map((family) => family.trim())
    .filter(Boolean);
  const genericFamilies = families.filter((family) => GENERIC_FONT_FAMILIES.has(family.toLowerCase()));
  const concreteFamilies = families.filter((family) => !GENERIC_FONT_FAMILIES.has(family.toLowerCase()));
  return [...new Set([
    ...concreteFamilies,
    ...DOCK_UNICODE_FALLBACK_FAMILY.split(", ").filter((family) => !concreteFamilies.includes(family)),
    ...genericFamilies,
  ])].join(", ");
}

export function normalizeDockFontScale(value: unknown): number {
  if (value === null || value === undefined || value === "") return DEFAULT_DOCK_FONT_SCALE;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_DOCK_FONT_SCALE;
  const nearest = DOCK_FONT_SCALE_OPTIONS.reduce((best, option) =>
    Math.abs(option.value - numeric) < Math.abs(best - numeric) ? option.value : best,
    DEFAULT_DOCK_FONT_SCALE,
  );
  return nearest;
}

function readLegacyTypographyPreferences(): DockTypographyPreferences {
  return {
    fontFamily: normalizeDockFontFamily(readNativeDockSetting<string>(DOCK_FONT_FAMILY_STORAGE_KEY)),
    fontScale: normalizeDockFontScale(readNativeDockSetting<unknown>(DOCK_FONT_SCALE_STORAGE_KEY)),
  };
}

function normalizeTypographyPreferences(value: Partial<DockTypographyPreferences> | null | undefined): DockTypographyPreferences {
  const legacy = readLegacyTypographyPreferences();
  const hasFontFamily = Boolean(value && Object.prototype.hasOwnProperty.call(value, "fontFamily"));
  return {
    fontFamily: hasFontFamily
      ? normalizeDockFontFamily(value?.fontFamily)
      : (legacy.fontFamily || DEFAULT_DOCK_FONT_FAMILY),
    fontScale: value?.fontScale === undefined
      ? legacy.fontScale
      : normalizeDockFontScale(value.fontScale),
    ...(value?.updatedAt ? { updatedAt: value.updatedAt } : {}),
  };
}

function readLocalTypographyPreferences(): DockTypographyPreferences {
  return normalizeTypographyPreferences(
    readDockPreference<DockTypographyPreferences>(DOCK_TYPOGRAPHY_STORAGE_KEY),
  );
}

function persistTypographyPreferences(value: Partial<DockTypographyPreferences>): void {
  const next = normalizeTypographyPreferences({
    ...readLocalTypographyPreferences(),
    ...value,
    updatedAt: new Date().toISOString(),
  });

  writeDockPreference(DOCK_TYPOGRAPHY_STORAGE_KEY, next);
  void saveDockPreference(DOCK_TYPOGRAPHY_STORAGE_KEY, next);
}

export function loadDockFontFamily(): string {
  return readLocalTypographyPreferences().fontFamily;
}

export function saveDockFontFamily(value: unknown): void {
  persistTypographyPreferences({ fontFamily: normalizeDockFontFamily(value) });
}

export function loadDockFontScale(): number {
  return readLocalTypographyPreferences().fontScale;
}

export function saveDockFontScale(value: unknown): void {
  persistTypographyPreferences({ fontScale: normalizeDockFontScale(value) });
}

/**
 * Hydrate the first-paint local copy from IndexedDB after Dock auth resolves.
 * This covers browser-cache cleanup and refreshes that happen before the
 * standalone Dock has finished resolving its user scope.
 */
export async function hydrateDockTypographyPreferences(): Promise<DockTypographyPreferences> {
  const durable = await loadDockPreference<DockTypographyPreferences>(DOCK_TYPOGRAPHY_STORAGE_KEY).catch(() => null);
  const next = normalizeTypographyPreferences(durable ?? readLocalTypographyPreferences());

  if (durable || next.fontFamily || next.fontScale !== DEFAULT_DOCK_FONT_SCALE) {
    persistTypographyPreferences(next);
  }

  return next;
}

/** CSS applied after an overlay theme so the General setting wins. */
export function buildDockFontFamilyCss(value: unknown): string {
  const family = normalizeDockFontFamily(value);
  if (!family) return "";
  const safeFamily = buildDockFontFamilyStack(family);

  return [
    `:root { --font-family: ${safeFamily}; --ref-font-family: ${safeFamily}; --compare-font-family: ${safeFamily}; --mce-output-font-family: ${safeFamily}; }`,
    `body, body *:not(.material-icons):not(.material-icons-outlined):not(.material-icons-round):not(.material-icons-sharp):not(.material-symbols-outlined):not(.fa):not([class^="fa-"]):not([class*=" fa-"]) { font-family: ${safeFamily} !important; }`,
  ].join("\n");
}
