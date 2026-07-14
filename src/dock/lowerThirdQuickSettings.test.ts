import { describe, expect, it } from "vitest";
import type { DockFullscreenQuickThemeSettings } from "./components/DockFullscreenThemeQuickSettings";
import {
  areQuickThemeSettingsEquivalent,
  buildLinkedLowerThirdQuickThemeSettings,
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
  it("detects equivalent quick settings snapshots", () => {
    const left = makeSettings();
    const right = makeSettings();
    const different = makeSettings({ fontColor: "#FF0000" });

    expect(areQuickThemeSettingsEquivalent(left, right)).toBe(true);
    expect(areQuickThemeSettingsEquivalent(left, different)).toBe(false);
  });

  it("keeps lower-third sizing while inheriting shared fullscreen styling", () => {
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
    });

    const linked = buildLinkedLowerThirdQuickThemeSettings(
      lowerThirdDefaults,
      fullscreenSettings,
    );

    expect(linked.fontSize).toBe(lowerThirdDefaults.fontSize);
    expect(linked.refFontSize).toBe(lowerThirdDefaults.refFontSize);
    expect(linked.lineHeight).toBe(lowerThirdDefaults.lineHeight);
    expect(linked.fontColor).toBe(fullscreenSettings.fontColor);
    expect(linked.backgroundColor).toBe(fullscreenSettings.backgroundColor);
    expect(linked.backgroundType).toBe(fullscreenSettings.backgroundType);
  });
});
