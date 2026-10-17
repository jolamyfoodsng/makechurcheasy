import { useSyncExternalStore } from "react";
import { readNativeDockSetting, writeNativeDockSetting } from "./localDockSettings";
import { buildDockFontFamilyStack, normalizeDockFontFamily } from "../dock/dockFontFamily";

export type AppAppearancePaletteId =
  | "classic-blue"
  | "ocean-teal"
  | "royal-purple"
  | "forest"
  | "ember"
  | "slate"
  | "custom";

export interface AppAppearancePalette {
  id: Exclude<AppAppearancePaletteId, "custom">;
  label: string;
  description: string;
  accent: string;
  swatches: readonly [string, string, string];
}

export interface DockVisualPreferences {
  glassSurface: boolean;
  radialGlow: boolean;
  softShadow: boolean;
  motion: boolean;
}

export interface AppAppearancePreferences {
  palette: AppAppearancePaletteId;
  customAccent: string;
  /**
   * Interface font for the desktop app. Holds one of the bundled families from
   * DOCK_FONT_FAMILY_OPTIONS, or "" to keep the platform's system font.
   */
  fontFamily: string;
  dockVisuals: DockVisualPreferences;
  updatedAt: number;
}

export type AppAppearanceMode = "dark" | "light";

export const APP_APPEARANCE_STORAGE_KEY = "ocs-app-appearance";
export const DEFAULT_DOCK_VISUALS: DockVisualPreferences = {
  glassSurface: false,
  radialGlow: false,
  softShadow: true,
  motion: true,
};
export const DEFAULT_APP_APPEARANCE: AppAppearancePreferences = {
  palette: "classic-blue",
  customAccent: "#0067C0",
  fontFamily: "",
  dockVisuals: { ...DEFAULT_DOCK_VISUALS },
  updatedAt: 0,
};

export const APP_APPEARANCE_PALETTES: readonly AppAppearancePalette[] = [
  {
    id: "classic-blue",
    label: "System Blue",
    description: "Neutral surfaces with familiar blue controls",
    accent: "#0067C0",
    swatches: ["#18181B", "#0067C0", "#2C2C30"],
  },
  {
    id: "ocean-teal",
    label: "Ocean Teal",
    description: "Calm and modern",
    accent: "#0F766E",
    swatches: ["#18181B", "#0F766E", "#2C2C30"],
  },
  {
    id: "royal-purple",
    label: "Royal Purple",
    description: "Warm and expressive",
    accent: "#6D28D9",
    swatches: ["#18181B", "#6D28D9", "#2C2C30"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Grounded and peaceful",
    accent: "#15803D",
    swatches: ["#18181B", "#15803D", "#2C2C30"],
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm amber tone",
    accent: "#D97706",
    swatches: ["#18181B", "#D97706", "#2C2C30"],
  },
  {
    id: "slate",
    label: "Slate",
    description: "Quiet and professional",
    accent: "#6366F1",
    swatches: ["#18181B", "#6366F1", "#2C2C30"],
  },
] as const;

type Rgb = { r: number; g: number; b: number };

function parseHex(value: string): Rgb | null {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function mixHex(first: string, second: string, amount: number): string {
  const a = parseHex(first) ?? { r: 0, g: 0, b: 0 };
  const b = parseHex(second) ?? { r: 255, g: 255, b: 255 };
  const ratio = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

function rgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex) ?? { r: 29, g: 78, b: 216 };
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function luminance({ r, g, b }: Rgb): number {
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const a = luminance(parseHex(first) ?? { r: 0, g: 0, b: 0 });
  const b = luminance(parseHex(second) ?? { r: 255, g: 255, b: 255 });
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

/** Keep white text readable on buttons even when a user chooses a bright custom color. */
function ensureWhiteTextContrast(value: string): string {
  let candidate = value;
  for (let index = 0; index < 10 && contrastRatio(candidate, "#FFFFFF") < 4.5; index += 1) {
    candidate = mixHex(candidate, "#000000", 0.12);
  }
  return candidate;
}

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const parsed = parseHex(value);
  return parsed ? rgbToHex(parsed) : fallback;
}

function isPaletteId(value: unknown): value is AppAppearancePaletteId {
  return value === "custom" || APP_APPEARANCE_PALETTES.some((palette) => palette.id === value);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeAppAppearance(value: unknown): AppAppearancePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_APP_APPEARANCE };
  }
  const candidate = value as Partial<AppAppearancePreferences>;
  const palette = isPaletteId(candidate.palette) ? candidate.palette : DEFAULT_APP_APPEARANCE.palette;
  const dockVisualsCandidate = candidate.dockVisuals && typeof candidate.dockVisuals === "object" && !Array.isArray(candidate.dockVisuals)
    ? candidate.dockVisuals as Partial<DockVisualPreferences>
    : {};
  const updatedAt = typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
    ? candidate.updatedAt
    : 0;
  return {
    palette,
    customAccent: normalizeHex(candidate.customAccent, DEFAULT_APP_APPEARANCE.customAccent),
    fontFamily: normalizeDockFontFamily(candidate.fontFamily),
    dockVisuals: {
      glassSurface: normalizeBoolean(dockVisualsCandidate.glassSurface, DEFAULT_DOCK_VISUALS.glassSurface),
      radialGlow: normalizeBoolean(dockVisualsCandidate.radialGlow, DEFAULT_DOCK_VISUALS.radialGlow),
      softShadow: normalizeBoolean(dockVisualsCandidate.softShadow, DEFAULT_DOCK_VISUALS.softShadow),
      motion: normalizeBoolean(dockVisualsCandidate.motion, DEFAULT_DOCK_VISUALS.motion),
    },
    updatedAt,
  };
}

export function loadAppAppearance(): AppAppearancePreferences {
  return normalizeAppAppearance(readNativeDockSetting(APP_APPEARANCE_STORAGE_KEY));
}

let currentAppearance = loadAppAppearance();
const listeners = new Set<() => void>();
let appearanceChannel: BroadcastChannel | null = null;

export function refreshAppAppearance(): AppAppearancePreferences {
  const next = loadAppAppearance();
  if (JSON.stringify(next) === JSON.stringify(currentAppearance)) return currentAppearance;
  currentAppearance = next;
  listeners.forEach((listener) => listener());
  return currentAppearance;
}

if (typeof window !== "undefined") {
  try {
    appearanceChannel = new BroadcastChannel("mce-app-appearance");
    appearanceChannel.addEventListener("message", () => {
      refreshAppAppearance();
    });
  } catch {
    appearanceChannel = null;
  }
  window.addEventListener("storage", (event) => {
    const scopedKey = `${APP_APPEARANCE_STORAGE_KEY}:`;
    if (event.key !== APP_APPEARANCE_STORAGE_KEY && !event.key?.startsWith(scopedKey)) return;
    refreshAppAppearance();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AppAppearancePreferences {
  return currentAppearance;
}

export function setAppAppearance(patch: Partial<AppAppearancePreferences>): AppAppearancePreferences {
  currentAppearance = normalizeAppAppearance({
    ...currentAppearance,
    ...patch,
    updatedAt: Date.now(),
  });
  writeNativeDockSetting(APP_APPEARANCE_STORAGE_KEY, currentAppearance);
  try {
    appearanceChannel?.postMessage({ type: "appearance-updated" });
  } catch {
    // BroadcastChannel is an enhancement; localStorage remains authoritative.
  }
  listeners.forEach((listener) => listener());
  return currentAppearance;
}

export function useAppAppearance(): {
  appearance: AppAppearancePreferences;
  setAppearance: typeof setAppAppearance;
} {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { appearance, setAppearance: setAppAppearance };
}

function getAccent(preferences: AppAppearancePreferences): string {
  if (preferences.palette === "custom") return preferences.customAccent;
  return APP_APPEARANCE_PALETTES.find((palette) => palette.id === preferences.palette)?.accent
    ?? DEFAULT_APP_APPEARANCE.customAccent;
}

export function getAppAppearanceCssVariables(
  preferences: AppAppearancePreferences,
  mode: AppAppearanceMode,
): Record<string, string> {
  const accent = ensureWhiteTextContrast(getAccent(preferences));
  const accentHover = ensureWhiteTextContrast(mixHex(accent, "#FFFFFF", 0.1));
  const accentPressed = mixHex(accent, "#000000", 0.15);
  const accentBlue = mode === "dark" ? mixHex(accent, "#FFFFFF", 0.28) : accent;
  const accentBlueHover = mode === "dark" ? mixHex(accent, "#FFFFFF", 0.42) : accentHover;
  const isLight = mode === "light";
  const base = isLight
    ? {
      bg: "#F3F3F3",
      bgSecondary: "#EBEBED",
      surface: "#FFFFFF",
      surfaceRaised: "#F7F7F8",
      surfaceHover: "#E8E8EB",
      surfaceOverlay: "#FFFFFF",
      border: "#D1D1D6",
      borderSubtle: "#E5E5EA",
      borderStrong: "#8E8E93",
      text: "#1C1C1E",
      textSecondary: "#48484A",
      textMuted: "#636366",
      textDisabled: "#8E8E93",
      inputBg: "#FFFFFF",
      inputBorder: "#B8B8BD",
    }
    : {
      bg: "#18181B",
      bgSecondary: "#202023",
      surface: "#202023",
      surfaceRaised: "#2C2C30",
      surfaceHover: "#38383D",
      surfaceOverlay: "#2C2C30",
      border: "#36363B",
      borderSubtle: "#2C2C30",
      borderStrong: "#505057",
      text: "#F4F4F5",
      textSecondary: "#D1D1D6",
      textMuted: "#A1A1AA",
      textDisabled: "#71717A",
      inputBg: "#252528",
      inputBorder: "#505057",
    };

  // Neutral surfaces are shared across every page. Accent is reserved for actions.
  const tinted = {
    bg: base.bg,
    bgSecondary: base.bgSecondary,
    surface: base.surface,
    surfaceRaised: base.surfaceRaised,
    surfaceHover: base.surfaceHover,
    surfaceOverlay: base.surfaceOverlay,
    border: base.border,
    borderSubtle: base.borderSubtle,
  };
  const primarySoft = rgba(accent, isLight ? 0.06 : 0.14);
  const primarySoftBorder = rgba(accent, isLight ? 0.2 : 0.32);
  const activeSurface = rgba(accent, isLight ? 0.06 : 0.16);

  const fontVariables: Record<string, string> = {};
  if (preferences.fontFamily) {
    // Same glyph-safe stack the Dock uses, so African-language and symbol
    // characters still render when the chosen font lacks them.
    const stack = buildDockFontFamilyStack(preferences.fontFamily);
    fontVariables["--font-body"] = stack;
    fontVariables["--font-heading"] = stack;
    fontVariables["--font-headline"] = stack;
    // Stylesheets that kept their own font (Settings, modals, Studio, Transcripts…)
    // read this first, so the chosen font reaches every screen.
    fontVariables["--font-user"] = stack;
  }

  return {
    ...fontVariables,
    // Main application tokens
    "--primary": accent,
    "--primary-hover": accentHover,
    "--primary-pressed": accentPressed,
    "--primary-rgb": parseHex(accent) ? `${parseHex(accent)!.r}, ${parseHex(accent)!.g}, ${parseHex(accent)!.b}` : "29, 78, 216",
    "--primary-soft": primarySoft,
    "--primary-soft-border": primarySoftBorder,
    "--accent-blue": accentBlue,
    "--accent-blue-hover": accentBlueHover,
    "--accent-blue-rgb": parseHex(accentBlue) ? `${parseHex(accentBlue)!.r}, ${parseHex(accentBlue)!.g}, ${parseHex(accentBlue)!.b}` : "96, 165, 250",
    "--bg": tinted.bg,
    "--bg-secondary": tinted.bgSecondary,
    "--bg-dark": tinted.bg,
    "--surface": tinted.surface,
    "--surface-dark": tinted.surface,
    "--surface-raised": tinted.surfaceRaised,
    "--surface-hover": tinted.surfaceHover,
    "--surface-overlay": tinted.surfaceOverlay,
    "--surface-active": activeSurface,
    "--card-bg": tinted.surface,
    "--card-bg-hover": tinted.surfaceRaised,
    "--toolbar-bg": tinted.surface,
    "--toolbar-border": tinted.border,
    "--text": base.text,
    "--text-primary": base.text,
    "--text-secondary": base.textSecondary,
    "--text-muted": base.textMuted,
    "--text-disabled": base.textDisabled,
    "--input-text": base.text,
    "--input-placeholder": base.textMuted,
    "--tab-text-active": base.text,
    "--tab-text-inactive": base.textSecondary,
    "--tab-disabled": base.textDisabled,
    "--sidebar-nav-active-bg": activeSurface,
    "--sidebar-nav-active-border": primarySoftBorder,
    "--sidebar-nav-active-color": base.text,
    "--sidebar-nav-active-icon": accentBlue,
    "--sidebar-nav-hover-bg": base.surfaceHover,
    "--sidebar-nav-hover-color": base.text,
    "--border": tinted.border,
    "--border-subtle": tinted.borderSubtle,
    "--border-primary": primarySoftBorder,
    "--border-strong": base.borderStrong,
    "--input-bg": base.inputBg,
    "--input-border": base.inputBorder,
    "--input-focus": accent,
    "--active-selected-state": accent,
    "--active-selected-surface": activeSurface,
    "--preview-state": accent,
    "--focus-ring": rgba(accent, isLight ? 0.24 : 0.38),
    "--tab-hover-bg": rgba(accent, isLight ? 0.06 : 0.1),
    "--tab-indicator": accent,
    "--accent-color": accent,
    "--accent-rgb": parseHex(accent) ? `${parseHex(accent)!.r}, ${parseHex(accent)!.g}, ${parseHex(accent)!.b}` : "29, 78, 216",

    // Settings page aliases
    "--bg-app": tinted.bg,
    "--bg-sidebar": tinted.surface,
    "--bg-header": tinted.bg,
    "--bg-card": tinted.surface,
    "--bg-card-hover": tinted.surfaceRaised,
    "--bg-input": base.inputBg,
    "--bg-hover": tinted.surfaceHover,
    "--border-color": tinted.border,
    "--text-on-accent": "#FFFFFF",
    "--bg-accent-light": primarySoft,

    // Dock tokens. DockPage also mirrors these onto its root for embedded OBS.
    "--dock-bg": tinted.bg,
    "--dock-bg-secondary": tinted.bgSecondary,
    "--dock-surface": tinted.surface,
    "--dock-surface-alt": tinted.surfaceRaised,
    "--dock-surface-hover": tinted.surfaceHover,
    "--dock-surface-overlay": tinted.surfaceOverlay,
    "--dock-border": tinted.border,
    "--dock-border-soft": tinted.borderSubtle,
    "--dock-border-active": accentHover,
    "--dock-text": base.text,
    "--dock-text-secondary": base.textSecondary,
    "--dock-text-dim": base.textMuted,
    "--dock-text-muted": base.textMuted,
    "--dock-text-disabled": base.textDisabled,
    "--dock-accent": accent,
    "--dock-accent-hover": accentHover,
    "--dock-accent-pressed": accentPressed,
    "--dock-accent-soft": primarySoft,
    "--dock-accent-soft-border": primarySoftBorder,
    "--dock-input-bg": base.inputBg,
    "--dock-input-border": base.inputBorder,
  };
}

export function getDockAppearanceCssVariables(
  preferences: AppAppearancePreferences,
  mode: AppAppearanceMode,
): Record<string, string> {
  const all = getAppAppearanceCssVariables(preferences, mode);
  return Object.fromEntries(
    Object.entries(all).filter(([key]) => key.startsWith("--dock-") || key === "--input-placeholder"),
  );
}

export function applyAppAppearanceToDOM(
  preferences: AppAppearancePreferences,
  mode: AppAppearanceMode,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const variables = getAppAppearanceCssVariables(preferences, mode);
  for (const [key, value] of Object.entries(variables)) {
    root.style.setProperty(key, value);
  }
  // Back to the platform's system font: drop any inline override so the
  // stylesheet's :root[data-platform] stack applies again.
  if (!preferences.fontFamily) {
    root.style.removeProperty("--font-body");
    root.style.removeProperty("--font-heading");
    root.style.removeProperty("--font-headline");
    root.style.removeProperty("--font-user");
  }
}
