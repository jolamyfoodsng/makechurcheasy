import { readUserScopedStorage, writeUserScopedStorage } from "../services/userScopedStorage";

export interface DockFontFamilyOption {
  id: string;
  label: string;
  family: string;
}

const DOCK_FONT_FAMILY_STORAGE_KEY = "ocs-dock-font-family";

/** Font families bundled with the desktop app and available to OBS overlays. */
export const DOCK_FONT_FAMILY_OPTIONS: readonly DockFontFamilyOption[] = [
  { id: "inter", label: "Inter", family: '"Inter", "Segoe UI", sans-serif' },
  { id: "noto-sans", label: "Noto Sans", family: '"Noto Sans", "Segoe UI", sans-serif' },
  { id: "montserrat", label: "Montserrat", family: '"Montserrat", "Segoe UI", sans-serif' },
  { id: "work-sans", label: "Work Sans", family: '"Work Sans", "Segoe UI", sans-serif' },
  { id: "outfit", label: "Outfit", family: '"Outfit", "Segoe UI", sans-serif' },
  { id: "sora", label: "Sora", family: '"Sora", "Segoe UI", sans-serif' },
  { id: "space-grotesk", label: "Space Grotesk", family: '"Space Grotesk", "Segoe UI", sans-serif' },
  { id: "oswald", label: "Oswald", family: '"Oswald", "Arial Narrow", sans-serif' },
  { id: "source-serif-4", label: "Source Serif 4", family: '"Source Serif 4", Georgia, serif' },
  { id: "charis-sil", label: "Charis SIL (African languages)", family: '"Charis SIL", "Noto Sans", "CMG Sans", sans-serif' },
  { id: "cmg-sans", label: "CMG Sans", family: '"CMG Sans", "Noto Sans", sans-serif' },
];

export function normalizeDockFontFamily(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return DOCK_FONT_FAMILY_OPTIONS.find((option) => option.family === trimmed)?.family ?? "";
}

export function loadDockFontFamily(): string {
  return normalizeDockFontFamily(readUserScopedStorage(DOCK_FONT_FAMILY_STORAGE_KEY));
}

export function saveDockFontFamily(value: unknown): void {
  writeUserScopedStorage(DOCK_FONT_FAMILY_STORAGE_KEY, normalizeDockFontFamily(value));
}

/** CSS applied after an overlay theme so the General setting wins. */
export function buildDockFontFamilyCss(value: unknown): string {
  const family = normalizeDockFontFamily(value);
  if (!family) return "";

  return [
    `:root { --font-family: ${family}; --ref-font-family: ${family}; --compare-font-family: ${family}; }`,
    `body, body *:not(.material-icons):not(.material-icons-outlined):not(.material-icons-round):not(.material-icons-sharp):not(.material-symbols-outlined):not(.fa):not([class^="fa-"]):not([class*=" fa-"]) { font-family: ${family} !important; }`,
  ].join("\n");
}
