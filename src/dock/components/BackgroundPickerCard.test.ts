import { describe, it, expect } from "vitest";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";
import type { BibleThemeSettings } from "../../bible/types";
import overlayHtml from "../../../public/mce-bible-overlay.html?raw";
import worshipOverlayHtml from "../../../public/mce-worship-overlay.html?raw";
import backgroundOverlayHtml from "../../../public/bible-overlay-bg.html?raw";
import noteOverlayHtml from "../../../public/mce-note.html?raw";
import backgroundPickerSource from "./BackgroundPickerCard.tsx?raw";
import dockThemeSettingsModalSource from "./DockThemeSettingsModal.tsx?raw";
import dockBibleTabSource from "../tabs/DockBibleTab.tsx?raw";
import dockWorshipTabSource from "../tabs/DockWorshipTab.tsx?raw";
import dockThemeDataSource from "../dockThemeData.ts?raw";
import themeCreatorSource from "../../pages/ThemeCreatorModal.tsx?raw";
import productionThemeSettingsSource from "../../pages/ProductionThemeSettingsPage.tsx?raw";
import productionSettingsSource from "../../services/productionSettings.ts?raw";
import bibleDbSource from "../../bible/bibleDb.ts?raw";

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
  });

  it("uses the compare text alignment for references without a separate reference alignment setting", () => {
    expect(overlayHtml).toContain("const compareReferenceAlign = compareTextAlignForReference(compareAlign)");
    expect(overlayHtml).toContain("root.style.setProperty('--compare-reference-align', compareReferenceAlign)");
    expect(overlayHtml).toContain("root.style.setProperty('--compare-inline-align', mapFlexAlign(compareReferenceAlign))");
    expect(overlayHtml).toContain("align-self: var(--compare-inline-align, center)");
    expect(overlayHtml).toContain("#compare-layout.is-line-by-line .compare-column__reference");
    expect(overlayHtml).toContain("compareLayout.classList.toggle('is-line-by-line', mode === 'line-by-line')");
    expect(backgroundPickerSource).not.toContain("Reference alignment");
    expect(backgroundPickerSource).not.toContain("compareReferenceAlignmentLeft");
    expect(backgroundPickerSource).not.toContain("compareReferenceAlignmentRight");
  });

  it("opens compare layout preset and gap controls from a compact icon trigger", () => {
    expect(backgroundPickerSource).toContain("function CompareLayoutPopover");
    expect(backgroundPickerSource).toContain("aria-label=\"Layout and gap\"");
    expect(backgroundPickerSource).toContain("label=\"Gap between columns\"");
    expect(backgroundPickerSource).toContain("label=\"Background\"");
    expect(backgroundPickerSource).not.toContain("label=\"Layout preset\"");
  });

  it("keeps compare-only quick settings compact without the single Compare tab or theme presets", () => {
    const comparePanelStart = backgroundPickerSource.indexOf("function CompareSettingsPanel");
    const comparePanelEnd = backgroundPickerSource.indexOf("/* ── Inline Color Picker ── */", comparePanelStart);
    const comparePanelSource = backgroundPickerSource.slice(comparePanelStart, comparePanelEnd);

    expect(backgroundPickerSource).toContain('const compareOnlyMode = hideBackgroundOnCompare && displayMode === "compare"');
    expect(backgroundPickerSource).toContain('{!compareOnlyMode && (');
    expect(backgroundPickerSource).toContain("dtb-bg-picker--compare-only");
    expect(backgroundPickerSource).toContain("const COMPARE_BG_OPTIONS = BG_OPTIONS.filter((option) => option.id !== \"theme\")");
    expect(comparePanelSource).toContain("resolvedCompareBackdropValue");
    expect(comparePanelSource).toContain("COMPARE_BG_OPTIONS.map");
    expect(comparePanelSource).not.toContain("<ThemeSection");
  });

  it("exposes lower-third bar placement and direction controls inside compare settings", () => {
    const comparePanelStart = backgroundPickerSource.indexOf("function CompareSettingsPanel");
    const comparePanelEnd = backgroundPickerSource.indexOf("/* ── Inline Color Picker ── */", comparePanelStart);
    const comparePanelSource = backgroundPickerSource.slice(comparePanelStart, comparePanelEnd);

    expect(comparePanelSource).toContain('overlayMode === "lower-third"');
    expect(comparePanelSource).toContain("compareLowerThirdTextDirection");
    expect(comparePanelSource).toContain("lowerThirdEdge: edge");
    expect(comparePanelSource).toContain("lowerThirdTextDirection: direction");
    expect(comparePanelSource).toContain("bgPicker.lowerThirdBar");
    expect(comparePanelSource).toContain("bgPicker.lowerThirdPlacement");
    expect(comparePanelSource).toContain("bgPicker.textDirection");
    expect(overlayHtml).toContain("const isCompare = sl.layout === 'compare' && cc.length === 2");
    expect(overlayHtml).toContain("ltBar.classList.add('lt-edge-' + edge)");
    expect(overlayHtml).toContain("ltBar.classList.toggle('lt-text-inverted'");
  });

  it("places compare font weight and text alignment side by side with compact icon controls", () => {
    const comparePanelStart = backgroundPickerSource.indexOf("function CompareSettingsPanel");
    const comparePanelEnd = backgroundPickerSource.indexOf("/* ── Inline Color Picker ── */", comparePanelStart);
    const comparePanelSource = backgroundPickerSource.slice(comparePanelStart, comparePanelEnd);

    expect(comparePanelSource).toContain('className="dtb-compare-style-grid"');
    expect(comparePanelSource).toContain('label="Font weight"');
    expect(comparePanelSource).toContain('label="Text alignment"');
    expect(comparePanelSource).toContain("getCompareWeightOptions()");
    expect(comparePanelSource).toContain("getCompareAlignOptions()");
  });

  it("keeps text weight, line height, and text case in the Text typography section", () => {
    const textSectionStart = backgroundPickerSource.indexOf("{/* ── Text Section ── */}");
    const referenceSectionStart = backgroundPickerSource.indexOf("{/* ── Reference Section ── */}", textSectionStart);
    const textSectionSource = backgroundPickerSource.slice(textSectionStart, referenceSectionStart);

    expect(textSectionSource).toContain("dtb-control-section--nested");
    expect(textSectionSource).toContain("sermon.typography");
    expect(textSectionSource).toContain("fontWeight: w");
    expect(textSectionSource).toContain("lineHeight: Number(e.target.value)");
    expect(textSectionSource).toContain("textTransform: tc");
    expect(textSectionSource).toContain("IconSegmentedControl<CompactFontWeight>");
    expect(textSectionSource).toContain("IconSegmentedControl<CompactTextCase>");
    expect(textSectionSource).not.toContain("common.moreOptions");
  });

  it("applies worship text case directly in the overlay renderer", () => {
    expect(worshipOverlayHtml).toContain("function applyDisplayTextTransform");
    expect(worshipOverlayHtml).toContain("case 'uppercase': return value.toLocaleUpperCase()");
    expect(worshipOverlayHtml).toContain("safeSupText(applyDisplayTextTransform(sl.text, data.theme && data.theme.textTransform))");
    expect(worshipOverlayHtml).toContain("safeSupText(applyDisplayTextTransform(l.text || '', textTransform))");
  });

  it("adds a Layout tab and groups text layout controls there", () => {
    const tabNavigationStart = backgroundPickerSource.indexOf("{/* Tab Navigation */}");
    const backgroundTabStart = backgroundPickerSource.indexOf("{/* Background Tab */}", tabNavigationStart);
    const tabNavigationSource = backgroundPickerSource.slice(tabNavigationStart, backgroundTabStart);

    expect(tabNavigationSource).toContain('setActiveTab("layout")');
    expect(tabNavigationSource).toContain('activeTab === "layout"');
    expect(tabNavigationSource).toContain("bgPicker.layout");

    const layoutSectionStart = backgroundPickerSource.indexOf("{/* Layout Tab */}");
    const compareTabStart = backgroundPickerSource.indexOf("{/* Compare Tab */}", layoutSectionStart);
    const layoutSectionSource = backgroundPickerSource.slice(layoutSectionStart, compareTabStart);
    const layoutIndex = layoutSectionSource.indexOf("bgPicker.layout");
    const textAlignIndex = layoutSectionSource.indexOf("textAlign: a");
    const lowerThirdBarIndex = layoutSectionSource.indexOf("bgPicker.lowerThirdBar");
    const spacingIndex = layoutSectionSource.indexOf("bgPicker.spacingAndShape");

    expect(layoutSectionSource).toContain('activeTab === "layout"');
    expect(layoutIndex).toBeGreaterThan(-1);
    expect(textAlignIndex).toBeGreaterThan(layoutIndex);
    expect(lowerThirdBarIndex).toBeGreaterThan(textAlignIndex);
    expect(spacingIndex).toBeGreaterThan(lowerThirdBarIndex);
    expect(layoutSectionSource).toContain("setSpacingShapeOpen");
    expect(layoutSectionSource).toContain("dtb-control-section--collapsible");
  });

  it("keeps reference typography in Text and moves reference layout controls into Layout", () => {
    const referenceSectionStart = backgroundPickerSource.indexOf("function ReferenceSection");
    const referenceSectionEnd = backgroundPickerSource.indexOf("/* ── Reference Layout Section ── */", referenceSectionStart);
    const referenceSectionSource = backgroundPickerSource.slice(referenceSectionStart, referenceSectionEnd);
    const colorIndex = referenceSectionSource.indexOf("refFontColor: v");
    const fontSizeIndex = referenceSectionSource.indexOf("Reference Font Size");
    const weightIndex = referenceSectionSource.indexOf("refFontWeight: w");
    const textCaseIndex = referenceSectionSource.indexOf("refTextTransform: tc");
    const moreOptionsIndex = referenceSectionSource.indexOf("common.moreOptions");

    expect(colorIndex).toBeGreaterThan(-1);
    expect(fontSizeIndex).toBeGreaterThan(-1);
    expect(fontSizeIndex).toBeGreaterThan(colorIndex);
    expect(weightIndex).toBeGreaterThan(fontSizeIndex);
    expect(textCaseIndex).toBeGreaterThan(weightIndex);
    expect(referenceSectionSource).toContain("IconSegmentedControl<CompactFontWeight>");
    expect(referenceSectionSource).toContain("IconSegmentedControl<CompactTextCase>");
    expect(moreOptionsIndex).toBeGreaterThan(textCaseIndex);
    expect(referenceSectionSource).not.toContain("refTextAlign: a");
    expect(referenceSectionSource).not.toContain("setReferencePlacement");
    expect(referenceSectionSource).not.toContain("Reference Placement");
    expect(referenceSectionSource).not.toContain("Reference Spacing");
    expect(referenceSectionSource).not.toContain("bgPicker.nearVersePosition");
    expect(referenceSectionSource).not.toContain("Near verse");

    const referenceLayoutStart = backgroundPickerSource.indexOf("function ReferenceLayoutSection");
    const referenceLayoutEnd = backgroundPickerSource.indexOf("/* ── Reference Background ── */", referenceLayoutStart);
    const referenceLayoutSource = backgroundPickerSource.slice(referenceLayoutStart, referenceLayoutEnd);
    const alignmentIndex = referenceLayoutSource.indexOf("refTextAlign: a");
    const placementIndex = referenceLayoutSource.indexOf("Reference Placement");
    const spacingIndex = referenceLayoutSource.indexOf("Reference Spacing");

    expect(referenceLayoutSource).toContain("bgPicker.reference");
    expect(referenceLayoutSource).toContain("bgPicker.layout");
    expect(referenceLayoutSource).toContain("IconSegmentedControl<CompactTextAlign>");
    expect(alignmentIndex).toBeGreaterThan(-1);
    expect(placementIndex).toBeGreaterThan(alignmentIndex);
    expect(spacingIndex).toBeGreaterThan(placementIndex);
    expect(referenceLayoutSource).toContain("setReferencePlacement");
    expect(referenceLayoutSource).toContain('"above-verse"');
    expect(referenceLayoutSource).toContain('"below-verse"');
    expect(referenceLayoutSource).toContain('"top-edge"');
    expect(referenceLayoutSource).toContain('"bottom-edge"');
  });

  it("centers Bible compare content by default while keeping edge-aware lower-third placement", () => {
    expect(overlayHtml).toContain("#compare-layout");
    expect(overlayHtml).toContain("align-content: center");
    expect(overlayHtml).toContain("function normalizeCompareVerticalAlign");
    expect(overlayHtml).toContain("compareGridVerticalAlign(leftVerticalAlign, 'center')");
    expect(overlayHtml).toContain("compareColumnVerticalAlign(index === 1 ? rightVerticalAlign : leftVerticalAlign, 'flex-start')");
    expect(overlayHtml).toContain("const edge = s.lowerThirdEdge === 'top' || s.lowerThirdEdge === 'left' || s.lowerThirdEdge === 'right' ? s.lowerThirdEdge : 'bottom'");
    expect(overlayHtml).toContain("ltBar.classList.add('lt-edge-' + edge)");
    expect(overlayHtml).toContain("ltBar.style.justifyContent = edge === 'left' || edge === 'right'");
    expect(overlayHtml).toContain("lowerThirdContentVerticalAlign(s.lowerThirdCaptionPosition)");
    expect(backgroundPickerSource).toContain('storageScope === "bible" || storageScope === "worship" || storageScope === "notes"');
  });

  it("renders compare reference and bible version as one label", () => {
    expect(overlayHtml).toContain("function formatCompareReference");
    expect(overlayHtml).toContain("formatCompareReference(l.reference, l.translation)");
    expect(overlayHtml).toContain("formatCompareReference(r.reference, r.translation)");
    expect(overlayHtml).toContain("compareTranslationLeft.textContent = ''");
    expect(overlayHtml).toContain("compareTranslationRight.textContent = ''");
    expect(overlayHtml).toContain("lt-compare-unit");
  });

  it("orders scripture reference above or below the verse without DOM reshuffling", () => {
    expect(overlayHtml).toContain("#reference.top");
    expect(overlayHtml).toContain("#lt-bar #ref-text.top");
    expect(overlayHtml).toContain("#lt-bar #ref-text:empty");
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
    expect(overlayHtml).toContain("function resolveBackgroundImageCss");
    expect(overlayHtml).toContain("const bgVideoUrl = String(theme.backgroundVideo || '').trim()");
    expect(overlayHtml).toContain("const patternCss = resolvePatternCss(theme.backgroundPattern)");
    expect(overlayHtml).toContain("const bgImageCss = resolveBackgroundImageCss(s.backgroundImage)");
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

  it("fades Bible content without fading the background layer", () => {
    expect(overlayHtml).toContain("@keyframes mce-preview-text-fade");
    expect(overlayHtml).toContain(".mce-preview-text-fade");
    expect(overlayHtml).toContain("animation: mce-preview-text-fade 520ms cubic-bezier(0.42, 0, 0.58, 1) both");
    expect(overlayHtml).toContain("50% { opacity: 0.28; }");
    expect(overlayHtml).toContain("const targets = mode === 'lower-third'");
    expect(overlayHtml).not.toContain("mode-layer.mce-preview-slide-fade");
  });

  it("does not re-apply the background when both Bible modes render a new verse", () => {
    expect(overlayHtml).toContain("const lastAppliedThemeKeyByMode = {");
    expect(overlayHtml).toContain("themeKey === lastAppliedThemeKeyByMode[targetMode]");
    expect(overlayHtml).toContain("lastAppliedThemeKeyByMode[targetMode] = themeKey");
  });

  it("updates OBS CSS variables without replacing the live stylesheet", () => {
    expect(overlayHtml).toContain("const propertyNames = [");
    expect(overlayHtml).toContain("rootRule.style.setProperty(name, value)");
    expect(overlayHtml).not.toContain("styleEl.textContent = cssText");
  });

  it("keeps notes lower-third pattern background behavior aligned with worship", () => {
    expect(noteOverlayHtml).toContain("function applyThemeLowerThird");
    expect(noteOverlayHtml).toContain("const bgPattern = String(s.backgroundPattern || '').trim()");
    expect(noteOverlayHtml).toContain("const pc = resolvePatternCss(bgPattern)");
    expect(noteOverlayHtml).toContain("ltBarBg.style.background = pc || 'transparent'");
  });

  it("sends the active theme with Bible full/lower-third staged payloads", () => {
    expect(dockBibleTabSource).toContain('theme: liveOverlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id');
    expect(dockBibleTabSource).toContain("liveOverlayMode === \"fullscreen\"\n              ? effectiveSelectedBibleTheme.settings\n              : effectiveSelectedLowerThirdTheme.settings");
    expect(dockBibleTabSource).toContain("fullscreenLiveOverrides as Record<string, unknown> | null");
    expect(dockBibleTabSource).toContain("saveDockBibleOverlayMode(nextMode)");
  });

  it("keeps theme/background draft changes local until the theme settings save commit", () => {
    const handleThemeSelectStart = dockThemeSettingsModalSource.indexOf("const handleThemeSelect");
    const handleSaveStart = dockThemeSettingsModalSource.indexOf("const handleSave", handleThemeSelectStart);
    const draftSelectionBlock = dockThemeSettingsModalSource.slice(handleThemeSelectStart, handleSaveStart);

    expect(handleThemeSelectStart).toBeGreaterThan(-1);
    expect(handleSaveStart).toBeGreaterThan(handleThemeSelectStart);
    expect(draftSelectionBlock).toContain("pendingBackgroundPresetRef.current = \"theme\"");
    expect(draftSelectionBlock).toContain("setDraftSettings(nextSettings)");
    expect(draftSelectionBlock).not.toContain("onSelect(theme)");
    expect(draftSelectionBlock).not.toContain("onBackgroundPresetChange?.(\"theme\")");

    const backgroundPickerPropsStart = dockThemeSettingsModalSource.indexOf("<BackgroundPickerCard");
    const sectionDividerStart = dockThemeSettingsModalSource.indexOf("{/* Spacer for sticky footer */}", backgroundPickerPropsStart);
    const backgroundPickerProps = dockThemeSettingsModalSource.slice(backgroundPickerPropsStart, sectionDividerStart);

    expect(backgroundPickerPropsStart).toBeGreaterThan(-1);
    expect(sectionDividerStart).toBeGreaterThan(backgroundPickerPropsStart);
    expect(backgroundPickerProps).toContain("pendingBackgroundPresetRef.current = preset");
    expect(backgroundPickerProps).not.toContain("onBackgroundPresetChange?.(preset)");

    const saveBlock = dockThemeSettingsModalSource.slice(handleSaveStart, dockThemeSettingsModalSource.indexOf("const handleReset", handleSaveStart));
    expect(saveBlock).toContain("onSelect(nextTheme)");
    expect(saveBlock).toContain("onBackgroundPresetChange?.(nextPreset)");
    expect(saveBlock).toContain("onQuickSettingsSave(nextSettings, {");
  });

  it("hydrates saved Bible dock background preferences before first render and persists saves immediately", () => {
    expect(dockBibleTabSource).toContain("initialPrefsRef.current = loadDockBiblePreferences()");
    expect(dockBibleTabSource).toContain("useState<DockBackgroundPreset>(");
    expect(dockBibleTabSource).toContain("initialPrefs.backgroundPreset ?? \"theme\"");
    expect(dockBibleTabSource).toContain("useState<DockFullscreenQuickThemeSettings | null>(initialFullscreenQuickThemeSettings)");
    expect(dockBibleTabSource).toContain("persistDockBiblePreferencesNow({");
    expect(dockBibleTabSource).toContain("fullscreenQuickThemeSettings: nextSavedSettings");
  });

  it("pairs dual-variant Bible theme selection so later lower-third uses the same theme", () => {
    const fullscreenSelectStart = dockBibleTabSource.indexOf("const handleSelectFullscreenTheme");
    const lowerThirdSelectStart = dockBibleTabSource.indexOf("const handleSelectLowerThirdTheme");
    const activePickerStart = dockBibleTabSource.indexOf("const activeThemePickerProps");
    const fullscreenSelectBlock = dockBibleTabSource.slice(fullscreenSelectStart, lowerThirdSelectStart);
    const lowerThirdSelectBlock = dockBibleTabSource.slice(lowerThirdSelectStart, activePickerStart);

    expect(fullscreenSelectStart).toBeGreaterThan(-1);
    expect(lowerThirdSelectStart).toBeGreaterThan(fullscreenSelectStart);
    expect(activePickerStart).toBeGreaterThan(lowerThirdSelectStart);
    expect(fullscreenSelectBlock).toContain("themeSupportsBibleOverlayMode(theme, \"lower-third\")");
    expect(fullscreenSelectBlock).toContain("setSelectedLowerThirdTheme(theme)");
    expect(fullscreenSelectBlock).toContain("setSavedLowerThirdQuickThemeSettings(nextLowerThirdQuickSettings)");
    expect(fullscreenSelectBlock).toContain("handleOverlayModeChange(\"fullscreen\")");
    expect(lowerThirdSelectBlock).toContain("themeSupportsBibleOverlayMode(theme, \"fullscreen\")");
    expect(lowerThirdSelectBlock).toContain("setSelectedBibleTheme(theme)");
    expect(lowerThirdSelectBlock).toContain("setSavedFullscreenQuickThemeSettings(nextFullscreenQuickSettings)");
    expect(dockBibleTabSource).toContain("function extractLowerThirdQuickThemeSettings");
    expect(dockBibleTabSource).toContain("return extractThemeQuickSettingsForOverlayMode(theme, effectiveOverlayMode)");
  });

  it("keeps custom Bible themes visible in the dock background theme picker", () => {
    expect(themeCreatorSource).toContain("await saveCustomTheme(themeToSave)");
    expect(themeCreatorSource).toContain("await addBibleFavorite(themeToSave.id)");
    expect(productionThemeSettingsSource).toContain("<ThemeCreatorModal");
    expect(productionThemeSettingsSource).toContain("onSaved={(theme) => void handleThemeSaved(theme)}");
    expect(productionSettingsSource).toContain("const customThemes = await getCustomThemes()");
    expect(productionSettingsSource).toContain("...customThemes.filter((theme) => !builtinIds.has(theme.id))");
    expect(bibleDbSource).toContain("syncCustomThemesToDock().catch");
    expect(bibleDbSource).toContain("syncFavoriteBibleThemesToDock().catch");
    expect(bibleDbSource).toContain('name: "dock-bible-themes"');
    expect(dockThemeDataSource).toContain("const customThemes = await loadDockCustomBibleThemes()");
    expect(dockThemeDataSource).toContain("const localThemes = [...favoritedBuiltins, ...uniqueCustom]");
    expect(backgroundPickerSource).toContain("const all = await loadDockFavoriteBibleThemes()");
    expect(backgroundPickerSource).toContain("themeSupportsBibleOverlayMode(theme, overlayMode)");
    expect(backgroundPickerSource).toContain("window.addEventListener(FAVORITE_THEMES_UPDATED_EVENT, refresh)");
    expect(dockBibleTabSource).toContain('allowedCategories={["bible", "general"]}');
    expect(dockWorshipTabSource).toContain('allowedCategories={["worship", "general"]}');
  });
});
