import type { DockFullscreenQuickThemeSettings } from "./components/DockFullscreenThemeQuickSettings";

/**
 * The readable starting point for lower-third fit mode.  Fit mode may reduce
 * a larger preset to this value, but it must never collapse below it.
 */
export const LOWER_THIRD_FIT_MIN_FONT_SIZE = 45;
export const LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE = 16;
/**
 * Lower-third typography is intentionally independent from fullscreen sizing.
 * Keep this high enough for the 2XL/3XL quick presets (128px/160px), while
 * still preventing malformed preferences from creating an unusable payload.
 */
export const LOWER_THIRD_FONT_SIZE_MAX = 320;
export const LOWER_THIRD_REFERENCE_FONT_SIZE_MAX = 160;

export interface DockOverlayFontFitMeasurement {
  mode?: "fullscreen" | "lower-third";
  fontSize?: number;
  refFontSize?: number;
  translationFontSize?: number;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Notes uses the font size selected by the operator as the source of truth.
 * It still needs a safe lower bound, but it must not be reduced to the shared
 * lower-third fit range before it reaches the browser overlay.
 */
export function normalizeExplicitOutputFontSettings(
  settings: DockFullscreenQuickThemeSettings,
  mode: "fullscreen" | "lower-third",
): DockFullscreenQuickThemeSettings {
  const minFontSize = mode === "fullscreen" ? 28 : LOWER_THIRD_FIT_MIN_FONT_SIZE;
  const minRefFontSize = mode === "fullscreen" ? 14 : LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE;
  const requestedFontSize = Number(settings.fontSize);
  const requestedRefFontSize = Number(settings.refFontSize);

  return {
    ...settings,
    autoFontScale: false,
    fontSize: Number.isFinite(requestedFontSize)
      ? Math.max(minFontSize, Math.round(requestedFontSize))
      : minFontSize,
    refFontSize: Number.isFinite(requestedRefFontSize)
      ? Math.max(minRefFontSize, Math.round(requestedRefFontSize))
      : minRefFontSize,
  };
}

export function normalizeLowerThirdFitSettings(
  settings: DockFullscreenQuickThemeSettings,
): DockFullscreenQuickThemeSettings {
  return {
    ...settings,
    // Lower thirds always use the bounded auto-fit path. Keep this invariant
    // here so legacy saved settings cannot re-enable overflowing text.
    autoFontScale: true,
    fontSize: clampNumber(
      settings.fontSize,
      LOWER_THIRD_FIT_MIN_FONT_SIZE,
      LOWER_THIRD_FONT_SIZE_MAX,
    ),
    refFontSize: clampNumber(
      settings.refFontSize,
      LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE,
      LOWER_THIRD_REFERENCE_FONT_SIZE_MAX,
    ),
  };
}

/**
 * Apply a fullscreen fit measurement without changing the operator's lower-
 * third preset. Lower-thirds fit the current slide in the browser source, but
 * that temporary result must not turn a selected 2XL/3XL size into a
 * permanently smaller preference.
 */
export function applyMeasuredFontFitSettings(
  settings: DockFullscreenQuickThemeSettings,
  measurement: DockOverlayFontFitMeasurement | null | undefined,
): DockFullscreenQuickThemeSettings {
  if (!measurement) return settings;

  if (measurement.mode === "lower-third") {
    return { ...settings, autoFontScale: true };
  }

  const next = { ...settings, autoFontScale: true };
  const measuredFontSize = Number(measurement.fontSize);
  const measuredRefFontSize = Number(measurement.refFontSize);

  if (Number.isFinite(measuredFontSize) && measuredFontSize > 0) {
    next.fontSize = Math.min(next.fontSize, Math.round(measuredFontSize));
  }
  if (Number.isFinite(measuredRefFontSize) && measuredRefFontSize > 0) {
    next.refFontSize = Math.min(next.refFontSize, Math.round(measuredRefFontSize));
  }

  return next;
}

const LINKED_LOWER_THIRD_INHERITED_KEYS: Array<keyof DockFullscreenQuickThemeSettings> = [
  "fontFamily",
  "fontSize",
  "refFontSize",
  "fontColor",
  "refFontColor",
  "refPosition",
  "refAnchor",
  "refTextTransform",
  "refLetterSpacing",
  "refOpacity",
  "refTextAlign",
  "refSpacing",
  "lineHeight",
  "referenceBackgroundEnabled",
  "referenceBackgroundColor",
  "referenceBackgroundStyle",
  "referenceBackgroundRadius",
  "fullscreenShadeColor",
  "fullscreenShadeOpacity",
  "textAlign",
  "fontWeight",
  "refFontWeight",
  "fontStyle",
  "textTransform",
  "textShadow",
  "animation",
  "animationDuration",
  "backgroundImage",
  "backgroundImageFilePath",
  "backgroundPattern",
  "backgroundVideo",
  "backgroundVideoFilePath",
  "backgroundOpacity",
  "backgroundColor",
  "backgroundColorEnd",
  "bgGradientAngle",
];

const SHARED_BACKGROUND_KEYS: Array<keyof DockFullscreenQuickThemeSettings> = [
  "backgroundType",
  "backgroundImage",
  "backgroundImageFilePath",
  "backgroundPattern",
  "backgroundVideo",
  "backgroundVideoFilePath",
  "backgroundOpacity",
  "backgroundColor",
  "backgroundColorEnd",
  "bgGradientAngle",
  "fullscreenShadeColor",
  "fullscreenShadeOpacity",
];

export function areQuickThemeSettingsEquivalent(
  left: DockFullscreenQuickThemeSettings | null | undefined,
  right: DockFullscreenQuickThemeSettings | null | undefined,
): boolean {
  if (!left || !right) return false;

  const keys = new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ] as Array<keyof DockFullscreenQuickThemeSettings>);

  for (const key of keys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

export function mergeQuickThemeBackground(
  base: DockFullscreenQuickThemeSettings,
  source: DockFullscreenQuickThemeSettings | null | undefined,
): DockFullscreenQuickThemeSettings {
  if (!source) return base;

  const next: DockFullscreenQuickThemeSettings = { ...base };
  const assignableNext = next as Record<
    keyof DockFullscreenQuickThemeSettings,
    DockFullscreenQuickThemeSettings[keyof DockFullscreenQuickThemeSettings] | undefined
  >;

  for (const key of SHARED_BACKGROUND_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      assignableNext[key] = value;
    }
  }

  return next;
}

export function buildLinkedLowerThirdQuickThemeSettings(
  base: DockFullscreenQuickThemeSettings,
  fullscreen: DockFullscreenQuickThemeSettings | null | undefined,
): DockFullscreenQuickThemeSettings {
  if (!fullscreen) {
    return base;
  }

  const next: DockFullscreenQuickThemeSettings = {
    ...base,
    backgroundType: fullscreen.backgroundType ?? base.backgroundType,
  };
  const assignableNext = next as Record<
    keyof DockFullscreenQuickThemeSettings,
    DockFullscreenQuickThemeSettings[keyof DockFullscreenQuickThemeSettings] | undefined
  >;

  for (const key of LINKED_LOWER_THIRD_INHERITED_KEYS) {
    const value = fullscreen[key];
    if (value !== undefined) {
      assignableNext[key] = value;
    }
  }

  // Keep linked lower-thirds within the shared, flexible range. The overlay
  // still fits the current text to the frame at render time.
  if (typeof assignableNext.fontSize === "number") {
    assignableNext.fontSize = clampNumber(
      assignableNext.fontSize,
      LOWER_THIRD_FIT_MIN_FONT_SIZE,
      LOWER_THIRD_FONT_SIZE_MAX,
    );
  }
  if (typeof assignableNext.refFontSize === "number") {
    assignableNext.refFontSize = clampNumber(
      assignableNext.refFontSize,
      LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE,
      LOWER_THIRD_REFERENCE_FONT_SIZE_MAX,
    );
  }

  return normalizeLowerThirdFitSettings(next);
}
