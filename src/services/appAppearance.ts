import { useSyncExternalStore } from "react";
import {
  readUserScopedStorage,
  writeUserScopedStorage,
} from "./userScopedStorage";

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

export interface AppAppearancePreferences {
  palette: AppAppearancePaletteId;
  customAccent: string;
  updatedAt: number;
}

export type AppAppearanceMode = "dark" | "light";

export const APP_APPEARANCE_STORAGE_KEY = "ocs-app-appearance";
export const DEFAULT_APP_APPEARANCE: AppAppearancePreferences = {
  palette: "classic-blue",
  customAccent: "#1D4ED8",
  updatedAt: 0,
};

export const APP_APPEARANCE_PALETTES: readonly AppAppearancePalette[] = [
  {
    id: "classic-blue",
    label: "Classic Blue",
    description: "Focused and familiar",
    accent: "#1D4ED8",
    swatches: ["#0F172A", "#1D4ED8", "#334155"],
  },
  {
    id: "ocean-teal",
    label: "Ocean Teal",
    description: "Calm and modern",
    accent: "#0F766E",
    swatches: ["#062A2A", "#0F766E", "#2DD4BF"],
  },
  {
    id: "royal-purple",
    label: "Royal Purple",
    description: "Warm and expressive",
    accent: "#6D28D9",
    swatches: ["#17112A", "#6D28D9", "#A78BFA"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Grounded and peaceful",
    accent: "#15803D",
    swatches: ["#092117", "#15803D", "#4ADE80"],
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm without being loud",
    accent: "#C2410C",
    swatches: ["#291208", "#C2410C", "#FB923C"],
  },
  {
    id: "slate",
    label: "Slate",
    description: "Quiet and professional",
    accent: "#475569",
    swatches: ["#0F172A", "#475569", "#94A3B8"],
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

export function normalizeAppAppearance(value: unknown): AppAppearancePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_APP_APPEARANCE };
  }
  const candidate = value as Partial<AppAppearancePreferences>;
  const palette = isPaletteId(candidate.palette) ? candidate.palette : DEFAULT_APP_APPEARANCE.palette;
  const updatedAt = typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
    ? candidate.updatedAt
    : 0;
  return {
    palette,
    customAccent: normalizeHex(candidate.customAccent, DEFAULT_APP_APPEARANCE.customAccent),
    updatedAt,
  };
}

export function loadAppAppearance(): AppAppearancePreferences {
  const raw = readUserScopedStorage(APP_APPEARANCE_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_APP_APPEARANCE };
  try {
    return normalizeAppAppearance(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_APP_APPEARANCE };
  }
}

let currentAppearance = loadAppAppearance();
const listeners = new Set<() => void>();
let appearanceChannel: BroadcastChannel | null = null;

if (typeof window !== "undefined") {
  try {
    appearanceChannel = new BroadcastChannel("mce-app-appearance");
    appearanceChannel.addEventListener("message", () => {
      currentAppearance = loadAppAppearance();
      listeners.forEach((listener) => listener());
    });
  } catch {
    appearanceChannel = null;
  }
  window.addEventListener("storage", (event) => {
    const scopedKey = `${APP_APPEARANCE_STORAGE_KEY}:`;
    if (event.key !== APP_APPEARANCE_STORAGE_KEY && !event.key?.startsWith(scopedKey)) return;
    currentAppearance = loadAppAppearance();
    listeners.forEach((listener) => listener());
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
  writeUserScopedStorage(APP_APPEARANCE_STORAGE_KEY, JSON.stringify(currentAppearance));
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
      bg: "#F8FAFC",
      bgSecondary: "#F1F5F9",
      surface: "#FFFFFF",
      surfaceRaised: "#F8FAFC",
      surfaceHover: "#F1F5F9",
      surfaceOverlay: "#F1F5F9",
      border: "#CBD5E1",
      borderSubtle: "#F1F5F9",
      text: "#0F172A",
      textSecondary: "#334155",
      textMuted: "#64748B",
      inputBg: "#FFFFFF",
      inputBorder: "#CBD5E1",
    }
    : {
      bg: "#0F172A",
      bgSecondary: "#111827",
      surface: "#111827",
      surfaceRaised: "#1F2937",
      surfaceHover: "#334155",
      surfaceOverlay: "#1E2937",
      border: "#334155",
      borderSubtle: "#1E2937",
      text: "#F8FAFC",
      textSecondary: "#CBD5E1",
      textMuted: "#94A3B8",
      inputBg: "#0F172A",
      inputBorder: "#334155",
    };

  const tinted = {
    bg: mixHex(base.bg, accent, isLight ? 0.035 : 0.08),
    bgSecondary: mixHex(base.bgSecondary, accent, isLight ? 0.04 : 0.1),
    surface: mixHex(base.surface, accent, isLight ? 0.018 : 0.08),
    surfaceRaised: mixHex(base.surfaceRaised, accent, isLight ? 0.045 : 0.12),
    surfaceHover: mixHex(base.surfaceHover, accent, isLight ? 0.08 : 0.16),
    surfaceOverlay: mixHex(base.surfaceOverlay, accent, isLight ? 0.05 : 0.12),
    border: mixHex(base.border, accent, isLight ? 0.08 : 0.18),
    borderSubtle: mixHex(base.borderSubtle, accent, isLight ? 0.04 : 0.08),
  };
  const primarySoft = rgba(accent, isLight ? 0.07 : 0.13);
  const primarySoftBorder = rgba(accent, isLight ? 0.22 : 0.34);
  const activeSurface = rgba(accent, isLight ? 0.07 : 0.14);

  return {
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
    "--border": tinted.border,
    "--border-subtle": tinted.borderSubtle,
    "--border-primary": primarySoftBorder,
    "--border-strong": accentHover,
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
    "--dock-text-disabled": isLight ? "#94A3B8" : "#64748B",
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
}
