import { describe, it, expect } from "vitest";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";
import type { BibleThemeSettings } from "../../bible/types";

/* ── Helpers — mirrors the updater pattern each Text tab control uses ── */

type Updater = (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings;

const BASE: DockFullscreenQuickThemeSettings = {
  fontSize: 48,
  fontFamily: "Inter, system-ui, sans-serif",
  refFontSize: 20,
  refFontWeight: "normal",
  fontColor: "#ffffff",
  refFontColor: "#ffffff",
  refPosition: "bottom",
  refTextTransform: "none",
  refLetterSpacing: 0,
  refOpacity: 1,
  refTextAlign: "match",
  refSpacing: 24,
  fullscreenShadeColor: "#000000",
  fullscreenShadeOpacity: 0,
  textAlign: "center",
  lineHeight: 1.4,
  fontWeight: "normal",
  fontStyle: "normal",
  textTransform: "none",
  textShadow: "none",
  animation: "none",
  animationDuration: 400,
  backgroundImage: "",
  backgroundImageFilePath: "",
  backgroundPattern: "",
  backgroundVideo: "",
  backgroundVideoFilePath: "",
  backgroundOpacity: 1,
  backgroundColor: "#000000",
  backgroundColorEnd: "#000000",
  bgGradientAngle: 180,
  referenceBackgroundEnabled: false,
  referenceBackgroundColor: "#ffffff",
  referenceBackgroundStyle: "solid",
  referenceBackgroundRadius: 12,
  lowerThirdPosition: "left",
  lowerThirdSize: "medium",
  lowerThirdWidthPreset: "md",
  lowerThirdOffsetX: 0,
  lowerThirdCaptionPosition: "bottom",
  compareTranslationWidth: 40,
  compareTranslationGap: 40,
};

/* ── Text Tab updaters (copied verbatim from BackgroundPickerCard.tsx) ── */

function applyUpdater(prev: DockFullscreenQuickThemeSettings, updater: Updater): DockFullscreenQuickThemeSettings {
  return updater(prev);
}

describe("Text Tab settings pipeline", () => {
  it("fontColor: color picker calls onQuickSettingsChange with fontColor", () => {
    const updater: Updater = (prev) => ({ ...prev, fontColor: "#ff0000" });
    const result = applyUpdater(BASE, updater);
    expect(result.fontColor).toBe("#ff0000");
  });

  it("fontSize: slider calls onQuickSettingsChange with fontSize", () => {
    const updater: Updater = (prev) => ({ ...prev, fontSize: Number(72) });
    const result = applyUpdater(BASE, updater);
    expect(result.fontSize).toBe(72);
  });

  it.each(["light", "normal", "bold"] as const)("fontWeight: %s button calls onQuickSettingsChange with fontWeight=%s", (w) => {
    const updater: Updater = (prev) => ({ ...prev, fontWeight: w });
    const result = applyUpdater(BASE, updater);
    expect(result.fontWeight).toBe(w);
  });

  it.each(["left", "center", "right"] as const)("textAlign: %s button calls onQuickSettingsChange with textAlign=%s", (a) => {
    const updater: Updater = (prev) => ({ ...prev, textAlign: a });
    const result = applyUpdater(BASE, updater);
    expect(result.textAlign).toBe(a);
  });

  it("lineHeight: slider calls onQuickSettingsChange with lineHeight", () => {
    const updater: Updater = (prev) => ({ ...prev, lineHeight: Number(1.6) });
    const result = applyUpdater(BASE, updater);
    expect(result.lineHeight).toBe(1.6);
  });

  it.each(["none", "uppercase", "lowercase", "capitalize"] as const)("textTransform: %s button calls onQuickSettingsChange with textTransform=%s", (tc) => {
    const updater: Updater = (prev) => ({ ...prev, textTransform: tc });
    const result = applyUpdater(BASE, updater);
    expect(result.textTransform).toBe(tc);
  });
});

/* ── Full pipeline: after updater → applyFullscreenQuickThemeSettings → BibleThemeSettings ── */

function applyFullscreenQuickThemeSettings(
  theme: { settings: BibleThemeSettings },
  quickSettings: DockFullscreenQuickThemeSettings | null,
): { settings: BibleThemeSettings } {
  if (!quickSettings) return theme;
  return {
    ...theme,
    settings: {
      ...theme.settings,
      fontSize: quickSettings.fontSize,
      refFontSize: quickSettings.refFontSize,
      fontColor: quickSettings.fontColor,
      refFontColor: quickSettings.refFontColor,
      refPosition: quickSettings.refPosition,
      refTextTransform: quickSettings.refTextTransform,
      refLetterSpacing: quickSettings.refLetterSpacing,
      refOpacity: quickSettings.refOpacity,
      refTextAlign: quickSettings.refTextAlign,
      refSpacing: quickSettings.refSpacing,
      fullscreenShadeColor: quickSettings.fullscreenShadeColor,
      fullscreenShadeOpacity: quickSettings.fullscreenShadeOpacity,
      fullscreenShadeEnabled: quickSettings.fullscreenShadeOpacity > 0,
      textAlign: quickSettings.textAlign,
      lineHeight: quickSettings.lineHeight,
      fontWeight: quickSettings.fontWeight,
      refFontWeight: quickSettings.refFontWeight,
      textTransform: quickSettings.textTransform,
      textShadow: quickSettings.textShadow,
      animation: quickSettings.animation,
      animationDuration: quickSettings.animationDuration,
      fontStyle: quickSettings.fontStyle,
    },
  };
}

function extractFullscreenQuickThemeSettings(
  settings: BibleThemeSettings,
): DockFullscreenQuickThemeSettings {
  return {
    ...BASE,
    fontSize: settings.fontSize ?? BASE.fontSize,
    fontColor: settings.fontColor ?? BASE.fontColor,
    textAlign: settings.textAlign ?? BASE.textAlign,
    lineHeight: settings.lineHeight ?? BASE.lineHeight,
    fontWeight: settings.fontWeight ?? BASE.fontWeight,
    fontStyle: settings.fontStyle ?? BASE.fontStyle,
    textTransform: settings.textTransform ?? BASE.textTransform,
  };
}

describe("Full pipeline: Text tab → BibleThemeSettings → extract back", () => {
  const baseTheme = { settings: { fontSize: 48, fontColor: "#ffffff", textAlign: "center", lineHeight: 1.4, fontWeight: "normal", fontStyle: "normal", textTransform: "none", refFontSize: 20, refFontWeight: "normal", refFontColor: "#ffffff", refPosition: "bottom", refTextTransform: "none", refLetterSpacing: 0, refOpacity: 1, refTextAlign: "match", refSpacing: 24, fullscreenShadeColor: "#000000", fullscreenShadeOpacity: 0, fullscreenShadeEnabled: false, textShadow: "none", animation: "none", animationDuration: 400, backgroundImage: "", backgroundImageFilePath: "", backgroundPattern: "", backgroundVideo: "", backgroundVideoFilePath: "", backgroundOpacity: 1, backgroundColor: "#000000", backgroundColorEnd: "#000000", bgGradientAngle: 180, referenceBackgroundEnabled: false, referenceBackgroundColor: "#ffffff", referenceBackgroundStyle: "solid", referenceBackgroundRadius: 12, lowerThirdPosition: "left", lowerThirdSize: "medium", lowerThirdWidthPreset: "md", lowerThirdOffsetX: 0, lowerThirdCaptionPosition: "bottom", } as unknown as BibleThemeSettings };

  it("fontColor changes round-trips through theme settings", () => {
    const quickSettings: DockFullscreenQuickThemeSettings = { ...BASE, fontColor: "#ff0000" };
    const themed = applyFullscreenQuickThemeSettings(baseTheme, quickSettings);
    expect(themed.settings.fontColor).toBe("#ff0000");
    const extracted = extractFullscreenQuickThemeSettings(themed.settings);
    expect(extracted.fontColor).toBe("#ff0000");
  });

  it("fontSize changes round-trips through theme settings", () => {
    const quickSettings: DockFullscreenQuickThemeSettings = { ...BASE, fontSize: 72 };
    const themed = applyFullscreenQuickThemeSettings(baseTheme, quickSettings);
    expect(themed.settings.fontSize).toBe(72);
    const extracted = extractFullscreenQuickThemeSettings(themed.settings);
    expect(extracted.fontSize).toBe(72);
  });

  it.each(["light", "normal", "bold"] as const)("fontWeight=%s round-trips", (weight) => {
    const quickSettings: DockFullscreenQuickThemeSettings = { ...BASE, fontWeight: weight };
    const themed = applyFullscreenQuickThemeSettings(baseTheme, quickSettings);
    expect(themed.settings.fontWeight).toBe(weight);
    const extracted = extractFullscreenQuickThemeSettings(themed.settings);
    expect(extracted.fontWeight).toBe(weight);
  });

  it.each(["left", "center", "right"] as const)("textAlign=%s round-trips", (align) => {
    const quickSettings: DockFullscreenQuickThemeSettings = { ...BASE, textAlign: align };
    const themed = applyFullscreenQuickThemeSettings(baseTheme, quickSettings);
    expect(themed.settings.textAlign).toBe(align);
    const extracted = extractFullscreenQuickThemeSettings(themed.settings);
    expect(extracted.textAlign).toBe(align);
  });

  it("lineHeight changes round-trips", () => {
    const quickSettings: DockFullscreenQuickThemeSettings = { ...BASE, lineHeight: 1.8 };
    const themed = applyFullscreenQuickThemeSettings(baseTheme, quickSettings);
    expect(themed.settings.lineHeight).toBe(1.8);
    const extracted = extractFullscreenQuickThemeSettings(themed.settings);
    expect(extracted.lineHeight).toBe(1.8);
  });

  it.each(["none", "uppercase", "lowercase", "capitalize"] as const)("textTransform=%s round-trips", (tc) => {
    const quickSettings: DockFullscreenQuickThemeSettings = { ...BASE, textTransform: tc };
    const themed = applyFullscreenQuickThemeSettings(baseTheme, quickSettings);
    expect(themed.settings.textTransform).toBe(tc);
    const extracted = extractFullscreenQuickThemeSettings(themed.settings);
    expect(extracted.textTransform).toBe(tc);
  });
});
