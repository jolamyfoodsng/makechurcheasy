import { describe, expect, it } from "vitest";
import type { DockFullscreenQuickThemeSettings } from "./components/DockFullscreenThemeQuickSettings";
import {
  applyMeasuredFontFitSettings,
  areQuickThemeSettingsEquivalent,
  buildLinkedLowerThirdQuickThemeSettings,
  mergeQuickThemeBackground,
  normalizeLowerThirdFitSettings,
} from "./lowerThirdQuickSettings";

function makeSettings(
  overrides: Partial<DockFullscreenQuickThemeSettings> = {},
): DockFullscreenQuickThemeSettings {
  return {
    fontSize: 56,
    fontFamily: "Inter, system-ui, sans-serif",
    refFontSize: 24,
    refFontWeight: "normal",
    fontColor: "#FFFFFF",
    refFontColor: "#D1D5DB",
    refPosition: "bottom",
    refTextTransform: "none",
    refLetterSpacing: 0,
    refOpacity: 1,
    refTextAlign: "match",
    refSpacing: 24,
    fullscreenShadeColor: "#0F172A",
    fullscreenShadeOpacity: 0.4,
    textAlign: "center",
    lineHeight: 1.3,
    fontWeight: "bold",
    fontStyle: "normal",
    textTransform: "none",
    textShadow: "none",
    animation: "fade",
    animationDuration: 400,
    backgroundImage: "",
    backgroundImageFilePath: "",
    backgroundPattern: "",
    backgroundVideo: "",
    backgroundVideoFilePath: "",
    backgroundOpacity: 1,
    backgroundColor: "#0B1426",
    backgroundColorEnd: "#162040",
    bgGradientAngle: 180,
    referenceBackgroundEnabled: false,
    referenceBackgroundColor: "#D1D5DB",
    referenceBackgroundStyle: "solid",
    referenceBackgroundRadius: 12,
    lowerThirdPosition: "left",
    lowerThirdSize: "medium",
    lowerThirdWidthPreset: "md",
    lowerThirdOffsetX: 0,
    lowerThirdCaptionPosition: "bottom",
    compareTranslationWidth: 40,
    compareTranslationGap: 40,
    backgroundType: "theme",
    ...overrides,
  };
}

describe("lowerThirdQuickSettings", () => {
  it("keeps fit-to-frame lower thirds at a readable 45px minimum", () => {
    const normalized = normalizeLowerThirdFitSettings(makeSettings({
      autoFontScale: true,
      fontSize: 32,
      refFontSize: 10,
    }));

    expect(normalized.fontSize).toBe(45);
    expect(normalized.refFontSize).toBe(16);
  });

  it("migrates legacy lower thirds into always-on fit mode", () => {
    const normalized = normalizeLowerThirdFitSettings(makeSettings({
      autoFontScale: false,
      fontSize: 32,
      refFontSize: 10,
    }));

    expect(normalized.autoFontScale).toBe(true);
    expect(normalized.fontSize).toBe(45);
    expect(normalized.refFontSize).toBe(16);
  });

  it("detects equivalent quick settings snapshots", () => {
    const left = makeSettings();
    const right = makeSettings();
    const different = makeSettings({ fontColor: "#FF0000" });

    expect(areQuickThemeSettingsEquivalent(left, right)).toBe(true);
    expect(areQuickThemeSettingsEquivalent(left, different)).toBe(false);
  });

  it("keeps the selected lower-third size when the browser fits a long slide", () => {
    const fitted = applyMeasuredFontFitSettings(
      makeSettings({ fontSize: 160, refFontSize: 80 }),
      { mode: "lower-third", fontSize: 78, refFontSize: 30 },
    );

    expect(fitted.fontSize).toBe(160);
    expect(fitted.refFontSize).toBe(80);
  });

  it("keeps the requested size when the rendered frame already fits", () => {
    const fitted = applyMeasuredFontFitSettings(
      makeSettings({ fontSize: 56, refFontSize: 24 }),
      { mode: "fullscreen", fontSize: 64, refFontSize: 30 },
    );

    expect(fitted.fontSize).toBe(56);
    expect(fitted.refFontSize).toBe(24);
  });

  it("inherits shared fullscreen styling while keeping lower-third layout settings", () => {
    const lowerThirdDefaults = makeSettings({
      fontSize: 38,
      refFontSize: 18,
      lineHeight: 1.18,
      lowerThirdWidthPreset: "md",
      backgroundColor: "#112233",
      fontColor: "#EEEEEE",
    });
    const fullscreenSettings = makeSettings({
      fontSize: 72,
      refFontSize: 32,
      lineHeight: 1.55,
      fontColor: "#00FF88",
      backgroundColor: "#AA0000",
      backgroundType: "color",
      refSpacing: 32,
      referenceBackgroundEnabled: true,
      referenceBackgroundColor: "#F4D17B",
      referenceBackgroundStyle: "pill",
      referenceBackgroundRadius: 24,
    });

    const linked = buildLinkedLowerThirdQuickThemeSettings(
      lowerThirdDefaults,
      fullscreenSettings,
    );

    expect(linked.fontSize).toBe(fullscreenSettings.fontSize);
    expect(linked.refFontSize).toBe(fullscreenSettings.refFontSize);
    expect(linked.lineHeight).toBe(lowerThirdDefaults.lineHeight);
    expect(linked.fontColor).toBe(fullscreenSettings.fontColor);
    expect(linked.backgroundColor).toBe(fullscreenSettings.backgroundColor);
    expect(linked.backgroundType).toBe(fullscreenSettings.backgroundType);
    expect(linked.refSpacing).toBe(fullscreenSettings.refSpacing);
    expect(linked.referenceBackgroundEnabled).toBe(true);
    expect(linked.referenceBackgroundColor).toBe(fullscreenSettings.referenceBackgroundColor);
    expect(linked.referenceBackgroundStyle).toBe(fullscreenSettings.referenceBackgroundStyle);
    expect(linked.referenceBackgroundRadius).toBe(fullscreenSettings.referenceBackgroundRadius);
  });

  it("carries a custom background across Full/LT without changing LT layout", () => {
    const lowerThirdDefaults = makeSettings({
      backgroundType: "theme",
      backgroundColor: "#112233",
      lowerThirdPosition: "right",
      lowerThirdCardPadding: "12px 20px",
    });
    const fullscreenSettings = makeSettings({
      backgroundType: "pattern",
      backgroundPattern: "/patterns/soft-grid.png",
      backgroundColor: "",
      backgroundColorEnd: "",
      backgroundOpacity: 0.82,
      fullscreenShadeColor: "#050505",
      fullscreenShadeOpacity: 0.28,
    });

    const switched = mergeQuickThemeBackground(lowerThirdDefaults, fullscreenSettings);

    expect(switched.backgroundType).toBe("pattern");
    expect(switched.backgroundPattern).toBe(fullscreenSettings.backgroundPattern);
    expect(switched.backgroundOpacity).toBe(fullscreenSettings.backgroundOpacity);
    expect(switched.fullscreenShadeColor).toBe(fullscreenSettings.fullscreenShadeColor);
    expect(switched.fullscreenShadeOpacity).toBe(fullscreenSettings.fullscreenShadeOpacity);
    expect(switched.lowerThirdPosition).toBe(lowerThirdDefaults.lowerThirdPosition);
    expect(switched.lowerThirdCardPadding).toBe(lowerThirdDefaults.lowerThirdCardPadding);
  });
});
