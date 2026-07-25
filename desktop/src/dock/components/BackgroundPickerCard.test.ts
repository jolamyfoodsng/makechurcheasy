import { describe, it, expect } from "vitest";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";
import type { BibleThemeSettings } from "../../bible/types";
import overlayHtml from "../../../public/mce-bible-overlay.html?raw";
import backgroundOverlayHtml from "../../../public/bible-overlay-bg.html?raw";
import backgroundPickerSource from "./BackgroundPickerCard.tsx?raw";

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
  const bgType = quickSettings.backgroundType
    ?? (quickSettings.backgroundVideo
      ? "video"
      : quickSettings.backgroundImage
        ? "image"
        : quickSettings.backgroundPattern
          ? "pattern"
          : quickSettings.backgroundColor && quickSettings.backgroundColor !== "transparent"
            ? "color"
            : "theme");
  const useThemeBg = bgType === "theme";
  const useNoBg = bgType === "off";
  const useColorBg = bgType === "color";
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
      backgroundImage: useNoBg ? "" : useThemeBg ? (theme.settings.backgroundImage ?? "") : quickSettings.backgroundImage,
      backgroundImageFilePath: useNoBg ? "" : useThemeBg ? (theme.settings.backgroundImageFilePath ?? "") : quickSettings.backgroundImageFilePath,
      backgroundVideo: useNoBg ? "" : useThemeBg ? (theme.settings.backgroundVideo ?? "") : quickSettings.backgroundVideo,
      backgroundVideoFilePath: useNoBg ? "" : useThemeBg ? (theme.settings.backgroundVideoFilePath ?? "") : quickSettings.backgroundVideoFilePath,
      backgroundOpacity: useNoBg ? 0 : useThemeBg ? (theme.settings.backgroundOpacity ?? 1) : quickSettings.backgroundOpacity,
      backgroundColor: useNoBg
        ? "transparent"
        : useThemeBg
          ? (theme.settings.backgroundColor || "#0B1426")
          : useColorBg
            ? (quickSettings.backgroundColor || "#0B1426")
            : (quickSettings.backgroundColor || "transparent"),
      backgroundColorEnd: useNoBg
        ? "transparent"
        : useThemeBg
          ? (theme.settings.backgroundColorEnd || "#162040")
          : useColorBg
            ? (quickSettings.backgroundColorEnd || "#162040")
            : (quickSettings.backgroundColorEnd || ""),
      bgGradientAngle: useThemeBg ? (theme.settings.bgGradientAngle ?? 180) : quickSettings.bgGradientAngle,
      backgroundPattern: useNoBg ? "" : useThemeBg ? (theme.settings.backgroundPattern ?? "") : quickSettings.backgroundPattern,
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

  it("image background does not get overridden by fallback gradient colors", () => {
    const quickSettings: DockFullscreenQuickThemeSettings = {
      ...BASE,
      backgroundType: "image",
      backgroundImage: "/uploads/example.png",
      backgroundColor: "",
      backgroundColorEnd: "",
    };
    const themed = applyFullscreenQuickThemeSettings(baseTheme, quickSettings);
    expect(themed.settings.backgroundImage).toBe("/uploads/example.png");
    expect(themed.settings.backgroundColor).toBe("transparent");
    expect(themed.settings.backgroundColorEnd).toBe("");
  });

  it("video background keeps the video source and does not inject gradient defaults", () => {
    const quickSettings: DockFullscreenQuickThemeSettings = {
      ...BASE,
      backgroundType: "video",
      backgroundVideo: "/uploads/example.mp4",
      backgroundColor: "",
      backgroundColorEnd: "",
    };
    const themed = applyFullscreenQuickThemeSettings(baseTheme, quickSettings);
    expect(themed.settings.backgroundVideo).toBe("/uploads/example.mp4");
    expect(themed.settings.backgroundColor).toBe("transparent");
    expect(themed.settings.backgroundColorEnd).toBe("");
  });

  it("survives 50 sequential font and background changes without dropping the latest values", () => {
    const variants: Array<{
      backgroundType: DockFullscreenQuickThemeSettings["backgroundType"];
      backgroundColor: string;
      backgroundColorEnd: string;
      backgroundImage: string;
      backgroundVideo: string;
      backgroundPattern: string;
    }> = [
        {
          backgroundType: "color",
          backgroundColor: "#102030",
          backgroundColorEnd: "#405060",
          backgroundImage: "",
          backgroundVideo: "",
          backgroundPattern: "",
        },
        {
          backgroundType: "image",
          backgroundColor: "",
          backgroundColorEnd: "",
          backgroundImage: "/uploads/stress-image.png",
          backgroundVideo: "",
          backgroundPattern: "",
        },
        {
          backgroundType: "video",
          backgroundColor: "",
          backgroundColorEnd: "",
          backgroundImage: "",
          backgroundVideo: "/uploads/stress-video.mp4",
          backgroundPattern: "",
        },
        {
          backgroundType: "pattern",
          backgroundColor: "transparent",
          backgroundColorEnd: "",
          backgroundImage: "",
          backgroundVideo: "",
          backgroundPattern: "diagonal-lines",
        },
        {
          backgroundType: "off",
          backgroundColor: "transparent",
          backgroundColorEnd: "transparent",
          backgroundImage: "",
          backgroundVideo: "",
          backgroundPattern: "",
        },
      ];

    const baseTheme = {
      settings: {
        fontSize: 48,
        fontColor: "#ffffff",
        textAlign: "center",
        lineHeight: 1.4,
        fontWeight: "normal",
        fontStyle: "normal",
        textTransform: "none",
        refFontSize: 20,
        refFontWeight: "normal",
        refFontColor: "#ffffff",
        refPosition: "bottom",
        refTextTransform: "none",
        refLetterSpacing: 0,
        refOpacity: 1,
        refTextAlign: "match",
        refSpacing: 24,
        fullscreenShadeColor: "#000000",
        fullscreenShadeOpacity: 0,
        fullscreenShadeEnabled: false,
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
      } as unknown as BibleThemeSettings,
    };

    for (let index = 0; index < 50; index += 1) {
      const variant = variants[index % variants.length];
      const fontSize = 48 + index;
      const quickSettings: DockFullscreenQuickThemeSettings = {
        ...BASE,
        fontSize,
        fontColor: `#${(0x110000 + index).toString(16).padStart(6, "0").slice(-6)}`,
        backgroundType: variant.backgroundType,
        backgroundColor: variant.backgroundColor,
        backgroundColorEnd: variant.backgroundColorEnd,
        backgroundImage: variant.backgroundImage,
        backgroundVideo: variant.backgroundVideo,
        backgroundPattern: variant.backgroundPattern,
      };

      const themed = applyFullscreenQuickThemeSettings(baseTheme, quickSettings);
      const extracted = extractFullscreenQuickThemeSettings(themed.settings);

      expect(themed.settings.fontSize).toBe(fontSize);
      expect(extracted.fontSize).toBe(fontSize);
      expect(themed.settings.fontColor).toBe(quickSettings.fontColor);
      expect(extracted.fontColor).toBe(quickSettings.fontColor);
      switch (variant.backgroundType) {
        case "color":
          expect(themed.settings.backgroundColor).toBe(variant.backgroundColor);
          expect(themed.settings.backgroundColorEnd).toBe(variant.backgroundColorEnd);
          break;
        case "image":
          expect(themed.settings.backgroundImage).toBe(variant.backgroundImage);
          expect(themed.settings.backgroundColor).toBe("transparent");
          break;
        case "video":
          expect(themed.settings.backgroundVideo).toBe(variant.backgroundVideo);
          expect(themed.settings.backgroundColor).toBe("transparent");
          break;
        case "pattern":
          expect(themed.settings.backgroundPattern).toBe(variant.backgroundPattern);
          expect(themed.settings.backgroundColor).toBe("transparent");
          break;
        case "off":
          expect(themed.settings.backgroundColor).toBe("transparent");
          expect(themed.settings.backgroundImage).toBe("");
          expect(themed.settings.backgroundVideo).toBe("");
          expect(themed.settings.backgroundPattern).toBe("");
          expect(themed.settings.backgroundOpacity).toBe(0);
          break;
        default:
          break;
      }
    }
  });
});

describe("Active OBS Bible overlay wiring", () => {
  it("consumes compare layout fields emitted by BackgroundPickerCard", () => {
    expect(overlayHtml).toContain("s.compareLeftWidth");
    expect(overlayHtml).toContain("s.compareRightWidth");
    expect(overlayHtml).toContain("s.compareOuterPaddingTop");
    expect(overlayHtml).toContain("s.compareOuterPaddingRight");
    expect(overlayHtml).toContain("s.compareOuterPaddingBottom");
    expect(overlayHtml).toContain("s.compareOuterPaddingLeft");
    expect(overlayHtml).toContain("s.comparePanelInnerPadding");
    expect(overlayHtml).toContain("s.compareReferencePositionLeft");
    expect(overlayHtml).toContain("s.compareReferencePositionRight");
    expect(overlayHtml).toContain("s.compareReferenceAlignmentLeft");
    expect(overlayHtml).toContain("s.compareReferenceAlignmentRight");
  });

  it("renders compare reference and bible version as one label", () => {
    expect(overlayHtml).toContain("function formatCompareReference");
    expect(overlayHtml).toContain("formatCompareReference(l.reference, l.translation)");
    expect(overlayHtml).toContain("formatCompareReference(r.reference, r.translation)");
    expect(overlayHtml).toContain("compareTranslationLeft.textContent = ''");
    expect(overlayHtml).toContain("compareTranslationRight.textContent = ''");
  });

  it("orders scripture reference above or below the verse without DOM reshuffling", () => {
    expect(overlayHtml).toContain("#reference.top");
    expect(overlayHtml).toContain("#lt-bar #ref-text.top");
    expect(overlayHtml).toContain("order: 0");
    expect(overlayHtml).toContain("order: 2");
  });

  it("hides reference background controls from lower-third reference options", () => {
    expect(backgroundPickerSource).toContain('overlayMode !== "lower-third"');
    expect(backgroundPickerSource).toContain("<ReferenceBackgroundSection");
  });

  it("keeps background picker color/image/pattern/video fields wired into the active overlay", () => {
    expect(overlayHtml).toContain("theme.backgroundVideo");
    expect(overlayHtml).toContain("theme.backgroundPattern");
    expect(overlayHtml).toContain("theme.backgroundImage");
    expect(overlayHtml).toContain("theme.backgroundColor");
    expect(overlayHtml).toContain("theme.backgroundColorEnd");
    expect(overlayHtml).toContain("theme.bgGradientAngle");
    expect(overlayHtml).toContain("theme.backgroundOpacity");
  });

  it("keeps mce-bible-overlay background behavior aligned with bible-overlay-bg", () => {
    [
      "diagonal-lines",
      "horizontal-lines",
      "vertical-lines",
      "chevrons",
      "cross-hatch",
      "subtle-noise",
      "star-field",
    ].forEach((patternName) => {
      expect(backgroundOverlayHtml).toContain(patternName);
      expect(overlayHtml).toContain(patternName);
    });

    expect(overlayHtml).toContain("function applyFullscreenBackground");
    expect(overlayHtml).toContain("function readInjectedCssVar");
    expect(overlayHtml).toContain("const bgVideoUrl = String(theme.backgroundVideo || '').trim()");
    expect(overlayHtml).toContain("const patternCss = resolvePatternCss(theme.backgroundPattern)");
    expect(overlayHtml).toContain("if (hasGradient)");
    expect(overlayHtml).toContain("const rawBgImage = String(theme.backgroundImage || '').trim()");
    expect(overlayHtml).toContain("value === '__FROM_CSS__'");
    expect(overlayHtml).toContain("url(\"${value.replace(/\"/g, '\\\\\"')}\")");

    expect(backgroundOverlayHtml).toContain("function readInjectedCssVar");
    expect(backgroundOverlayHtml).toContain("value === '__FROM_CSS__'");
    expect(backgroundOverlayHtml).toContain("backgroundVideoEl.load()");
    expect(backgroundOverlayHtml).toContain("const patternCss = resolvePatternCss(theme.backgroundPattern)");

    const videoIndex = overlayHtml.indexOf("const bgVideoUrl = String(theme.backgroundVideo || '').trim()");
    const patternIndex = overlayHtml.indexOf("const patternCss = resolvePatternCss(theme.backgroundPattern)");
    const gradientIndex = overlayHtml.indexOf("if (hasGradient)");
    const imageIndex = overlayHtml.indexOf("const rawBgImage = String(theme.backgroundImage || '').trim()");
    expect(videoIndex).toBeLessThan(patternIndex);
    expect(patternIndex).toBeLessThan(gradientIndex);
    expect(gradientIndex).toBeLessThan(imageIndex);
  });
});
