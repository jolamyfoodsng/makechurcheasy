import type { DockFullscreenQuickThemeSettings } from "./components/DockFullscreenThemeQuickSettings";

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

  // Clamp font sizes to lower-third-safe ranges
  if (typeof assignableNext.fontSize === "number") {
    assignableNext.fontSize = clampNumber(assignableNext.fontSize, 14, 100);
  }
  if (typeof assignableNext.refFontSize === "number") {
    assignableNext.refFontSize = clampNumber(assignableNext.refFontSize, 10, 80);
  }

  return next;
}
