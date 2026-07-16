export type CompareLayoutPresetId =
  | "compact"
  | "balanced"
  | "wide"
  | "equal-columns"
  | "left-emphasis"
  | "right-emphasis"
  | "custom";

export type CompareGapPresetId = "compact" | "balanced" | "spacious" | "custom";
export type CompareFontWeight = "regular" | "medium" | "semibold" | "bold" | "extrabold";
export type CompareTextAlign = "left" | "center" | "right" | "justify";
export type CompareTextTransform = "none" | "uppercase" | "lowercase" | "capitalize";
export type CompareOverflowBehavior = "auto-fit" | "shrink-to-fit" | "scroll" | "clip";
export type CompareVerticalAlign = "top" | "center" | "bottom";
export type ComparePanelHeightMode = "match-tallest" | "equal-fixed-height" | "fit-content" | "fill-available-height";
export type CompareMetadataPosition = "above-verse" | "same-row" | "below-verse" | "hidden";
export type CompareMetadataAlign = "left" | "center" | "right";

export interface CompareThemeSettings {
  compareLayoutPreset: CompareLayoutPresetId;
  compareGapPreset: CompareGapPresetId;
  gap: number;
  compareTranslationGap: number;
  compareLeftWidth: number;
  compareRightWidth: number;
  compareLockWidths: boolean;
  compareOuterPaddingTop: number;
  compareOuterPaddingBottom: number;
  compareOuterPaddingLeft: number;
  compareOuterPaddingRight: number;
  compareLinkPadding: boolean;
  comparePanelInnerPadding: number;
  compareReferenceVerseSpacing: number;
  compareParagraphSpacing: number;
  compareFontFamilyLeft: string;
  compareFontFamilyRight: string;
  compareVerseFontSizeLeft: number;
  compareVerseFontSizeRight: number;
  compareReferenceFontSizeLeft: number;
  compareReferenceFontSizeRight: number;
  compareBadgeFontSizeLeft: number;
  compareBadgeFontSizeRight: number;
  compareFontWeightLeft: CompareFontWeight;
  compareFontWeightRight: CompareFontWeight;
  compareLineHeightLeft: number;
  compareLineHeightRight: number;
  compareLetterSpacingLeft: number;
  compareLetterSpacingRight: number;
  compareTextAlignLeft: CompareTextAlign;
  compareTextAlignRight: CompareTextAlign;
  compareReferenceTextTransformLeft: CompareTextTransform;
  compareReferenceTextTransformRight: CompareTextTransform;
  compareBadgeTextTransformLeft: CompareTextTransform;
  compareBadgeTextTransformRight: CompareTextTransform;
  compareOverflowBehavior: CompareOverflowBehavior;
  compareAutoFitMinFontSize: number;
  compareAutoFitMaxFontSize: number;
  compareKeepSameFontSize: boolean;
  compareVerticalAlignLeft: CompareVerticalAlign;
  compareVerticalAlignRight: CompareVerticalAlign;
  comparePanelHeightMode: ComparePanelHeightMode;
  compareSyncPanelStyles: boolean;
  comparePanelBgColorLeft: string;
  comparePanelBgColorRight: string;
  comparePanelBgOpacityLeft: number;
  comparePanelBgOpacityRight: number;
  comparePanelBorderColorLeft: string;
  comparePanelBorderColorRight: string;
  comparePanelBorderWidthLeft: number;
  comparePanelBorderWidthRight: number;
  comparePanelRadiusLeft: number;
  comparePanelRadiusRight: number;
  comparePanelShadowLeft: boolean;
  comparePanelShadowRight: boolean;
  compareDividerVisible: boolean;
  compareDividerColor: string;
  compareDividerThickness: number;
  compareReferencePositionLeft: CompareMetadataPosition;
  compareReferencePositionRight: CompareMetadataPosition;
  compareBadgePositionLeft: CompareMetadataPosition;
  compareBadgePositionRight: CompareMetadataPosition;
  compareReferenceAlignmentLeft: CompareMetadataAlign;
  compareReferenceAlignmentRight: CompareMetadataAlign;
  compareBadgeAlignmentLeft: CompareMetadataAlign;
  compareBadgeAlignmentRight: CompareMetadataAlign;
  compareMetaGapLeft: number;
  compareMetaGapRight: number;
  compareMetaBottomSpacingLeft: number;
  compareMetaBottomSpacingRight: number;
}

export const COMPARE_LAYOUT_PRESETS: Array<{
  id: Exclude<CompareLayoutPresetId, "custom">;
  label: string;
  leftWidth: number;
  rightWidth: number;
  gap: number;
  outerPadding: number;
  innerPadding: number;
}> = [
  { id: "compact", label: "Compact", leftWidth: 44, rightWidth: 44, gap: 16, outerPadding: 24, innerPadding: 20 },
  { id: "balanced", label: "Balanced", leftWidth: 40, rightWidth: 40, gap: 24, outerPadding: 40, innerPadding: 24 },
  { id: "wide", label: "Wide", leftWidth: 36, rightWidth: 36, gap: 40, outerPadding: 60, innerPadding: 32 },
  { id: "equal-columns", label: "Equal Columns", leftWidth: 40, rightWidth: 40, gap: 24, outerPadding: 24, innerPadding: 20 },
  { id: "left-emphasis", label: "Left Emphasis", leftWidth: 48, rightWidth: 32, gap: 24, outerPadding: 24, innerPadding: 20 },
  { id: "right-emphasis", label: "Right Emphasis", leftWidth: 32, rightWidth: 48, gap: 24, outerPadding: 24, innerPadding: 20 },
];

export const COMPARE_GAP_PRESETS: Array<{
  id: Exclude<CompareGapPresetId, "custom">;
  label: string;
  value: number;
}> = [
  { id: "compact", label: "Compact", value: 16 },
  { id: "balanced", label: "Balanced", value: 24 },
  { id: "spacious", label: "Spacious", value: 40 },
];

export const DEFAULT_COMPARE_THEME_SETTINGS: CompareThemeSettings = {
  compareLayoutPreset: "balanced",
  compareGapPreset: "balanced",
  gap: 24,
  compareTranslationGap: 24,
  compareLeftWidth: 40,
  compareRightWidth: 40,
  compareLockWidths: true,
  compareOuterPaddingTop: 24,
  compareOuterPaddingBottom: 24,
  compareOuterPaddingLeft: 24,
  compareOuterPaddingRight: 24,
  compareLinkPadding: true,
  comparePanelInnerPadding: 20,
  compareReferenceVerseSpacing: 10,
  compareParagraphSpacing: 12,
  compareFontFamilyLeft: "",
  compareFontFamilyRight: "",
  compareVerseFontSizeLeft: 40,
  compareVerseFontSizeRight: 40,
  compareReferenceFontSizeLeft: 22,
  compareReferenceFontSizeRight: 22,
  compareBadgeFontSizeLeft: 13,
  compareBadgeFontSizeRight: 13,
  compareFontWeightLeft: "regular",
  compareFontWeightRight: "regular",
  compareLineHeightLeft: 1.4,
  compareLineHeightRight: 1.4,
  compareLetterSpacingLeft: 0,
  compareLetterSpacingRight: 0,
  compareTextAlignLeft: "left",
  compareTextAlignRight: "left",
  compareReferenceTextTransformLeft: "uppercase",
  compareReferenceTextTransformRight: "uppercase",
  compareBadgeTextTransformLeft: "uppercase",
  compareBadgeTextTransformRight: "uppercase",
  compareOverflowBehavior: "auto-fit",
  compareAutoFitMinFontSize: 18,
  compareAutoFitMaxFontSize: 120,
  compareKeepSameFontSize: true,
  compareVerticalAlignLeft: "top",
  compareVerticalAlignRight: "top",
  comparePanelHeightMode: "fill-available-height",
  compareSyncPanelStyles: true,
  comparePanelBgColorLeft: "#081018",
  comparePanelBgColorRight: "#081018",
  comparePanelBgOpacityLeft: 0,
  comparePanelBgOpacityRight: 0,
  comparePanelBorderColorLeft: "#334155",
  comparePanelBorderColorRight: "#334155",
  comparePanelBorderWidthLeft: 0,
  comparePanelBorderWidthRight: 0,
  comparePanelRadiusLeft: 0,
  comparePanelRadiusRight: 0,
  comparePanelShadowLeft: false,
  comparePanelShadowRight: false,
  compareDividerVisible: false,
  compareDividerColor: "#475569",
  compareDividerThickness: 1,
  compareReferencePositionLeft: "above-verse",
  compareReferencePositionRight: "above-verse",
  compareBadgePositionLeft: "above-verse",
  compareBadgePositionRight: "above-verse",
  compareReferenceAlignmentLeft: "left",
  compareReferenceAlignmentRight: "left",
  compareBadgeAlignmentLeft: "left",
  compareBadgeAlignmentRight: "left",
  compareMetaGapLeft: 8,
  compareMetaGapRight: 8,
  compareMetaBottomSpacingLeft: 12,
  compareMetaBottomSpacingRight: 12,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function numberValue(source: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  return clamp(Number(source[key] ?? fallback), min, max);
}

function stringValue<T extends string>(source: Record<string, unknown>, key: string, fallback: T, allowed?: readonly T[]): T {
  const value = source[key];
  if (typeof value !== "string") return fallback;
  if (allowed && !allowed.includes(value as T)) return fallback;
  return value as T;
}

function boolValue(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof source[key] === "boolean" ? (source[key] as boolean) : fallback;
}

function colorValue(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeCompareThemeSettings(source: Record<string, unknown> | null | undefined): CompareThemeSettings {
  const data = source ?? {};
  const legacyWidth = numberValue(
    data,
    "compareTranslationWidth",
    DEFAULT_COMPARE_THEME_SETTINGS.compareLeftWidth,
    25,
    75,
  );
  const leftWidth = numberValue(data, "compareLeftWidth", legacyWidth, 25, 75);
  const rightWidth = numberValue(data, "compareRightWidth", legacyWidth, 25, 75);
  const minAutoFit = numberValue(
    data,
    "compareAutoFitMinFontSize",
    DEFAULT_COMPARE_THEME_SETTINGS.compareAutoFitMinFontSize,
    10,
    120,
  );
  const maxAutoFit = numberValue(
    data,
    "compareAutoFitMaxFontSize",
    DEFAULT_COMPARE_THEME_SETTINGS.compareAutoFitMaxFontSize,
    minAutoFit,
    160,
  );

  return {
    compareLayoutPreset: stringValue(data, "compareLayoutPreset", DEFAULT_COMPARE_THEME_SETTINGS.compareLayoutPreset, ["compact", "balanced", "wide", "equal-columns", "left-emphasis", "right-emphasis", "custom"]),
    compareGapPreset: stringValue(data, "compareGapPreset", DEFAULT_COMPARE_THEME_SETTINGS.compareGapPreset, ["compact", "balanced", "spacious", "custom"]),
    gap: numberValue(data, "compareTranslationGap", DEFAULT_COMPARE_THEME_SETTINGS.gap, 0, 100),
    compareTranslationGap: numberValue(data, "compareTranslationGap", DEFAULT_COMPARE_THEME_SETTINGS.compareTranslationGap, 0, 100),
    compareLeftWidth: leftWidth,
    compareRightWidth: rightWidth,
    compareLockWidths: boolValue(data, "compareLockWidths", DEFAULT_COMPARE_THEME_SETTINGS.compareLockWidths),
    compareOuterPaddingTop: numberValue(data, "compareOuterPaddingTop", DEFAULT_COMPARE_THEME_SETTINGS.compareOuterPaddingTop, 0, 150),
    compareOuterPaddingBottom: numberValue(data, "compareOuterPaddingBottom", DEFAULT_COMPARE_THEME_SETTINGS.compareOuterPaddingBottom, 0, 150),
    compareOuterPaddingLeft: numberValue(data, "compareOuterPaddingLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareOuterPaddingLeft, 0, 150),
    compareOuterPaddingRight: numberValue(data, "compareOuterPaddingRight", DEFAULT_COMPARE_THEME_SETTINGS.compareOuterPaddingRight, 0, 150),
    compareLinkPadding: boolValue(data, "compareLinkPadding", DEFAULT_COMPARE_THEME_SETTINGS.compareLinkPadding),
    comparePanelInnerPadding: numberValue(data, "comparePanelInnerPadding", DEFAULT_COMPARE_THEME_SETTINGS.comparePanelInnerPadding, 0, 80),
    compareReferenceVerseSpacing: numberValue(data, "compareReferenceVerseSpacing", DEFAULT_COMPARE_THEME_SETTINGS.compareReferenceVerseSpacing, 0, 40),
    compareParagraphSpacing: numberValue(data, "compareParagraphSpacing", DEFAULT_COMPARE_THEME_SETTINGS.compareParagraphSpacing, 0, 40),
    compareFontFamilyLeft: stringValue(data, "compareFontFamilyLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareFontFamilyLeft),
    compareFontFamilyRight: stringValue(data, "compareFontFamilyRight", DEFAULT_COMPARE_THEME_SETTINGS.compareFontFamilyRight),
    compareVerseFontSizeLeft: numberValue(data, "compareVerseFontSizeLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareVerseFontSizeLeft, 18, 120),
    compareVerseFontSizeRight: numberValue(data, "compareVerseFontSizeRight", DEFAULT_COMPARE_THEME_SETTINGS.compareVerseFontSizeRight, 18, 120),
    compareReferenceFontSizeLeft: numberValue(data, "compareReferenceFontSizeLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareReferenceFontSizeLeft, 10, 48),
    compareReferenceFontSizeRight: numberValue(data, "compareReferenceFontSizeRight", DEFAULT_COMPARE_THEME_SETTINGS.compareReferenceFontSizeRight, 10, 48),
    compareBadgeFontSizeLeft: numberValue(data, "compareBadgeFontSizeLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareBadgeFontSizeLeft, 8, 32),
    compareBadgeFontSizeRight: numberValue(data, "compareBadgeFontSizeRight", DEFAULT_COMPARE_THEME_SETTINGS.compareBadgeFontSizeRight, 8, 32),
    compareFontWeightLeft: stringValue(data, "compareFontWeightLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareFontWeightLeft, ["regular", "medium", "semibold", "bold", "extrabold"]),
    compareFontWeightRight: stringValue(data, "compareFontWeightRight", DEFAULT_COMPARE_THEME_SETTINGS.compareFontWeightRight, ["regular", "medium", "semibold", "bold", "extrabold"]),
    compareLineHeightLeft: numberValue(data, "compareLineHeightLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareLineHeightLeft, 0.9, 2),
    compareLineHeightRight: numberValue(data, "compareLineHeightRight", DEFAULT_COMPARE_THEME_SETTINGS.compareLineHeightRight, 0.9, 2),
    compareLetterSpacingLeft: numberValue(data, "compareLetterSpacingLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareLetterSpacingLeft, -2, 10),
    compareLetterSpacingRight: numberValue(data, "compareLetterSpacingRight", DEFAULT_COMPARE_THEME_SETTINGS.compareLetterSpacingRight, -2, 10),
    compareTextAlignLeft: stringValue(data, "compareTextAlignLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareTextAlignLeft, ["left", "center", "right", "justify"]),
    compareTextAlignRight: stringValue(data, "compareTextAlignRight", DEFAULT_COMPARE_THEME_SETTINGS.compareTextAlignRight, ["left", "center", "right", "justify"]),
    compareReferenceTextTransformLeft: stringValue(data, "compareReferenceTextTransformLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareReferenceTextTransformLeft, ["none", "uppercase", "lowercase", "capitalize"]),
    compareReferenceTextTransformRight: stringValue(data, "compareReferenceTextTransformRight", DEFAULT_COMPARE_THEME_SETTINGS.compareReferenceTextTransformRight, ["none", "uppercase", "lowercase", "capitalize"]),
    compareBadgeTextTransformLeft: stringValue(data, "compareBadgeTextTransformLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareBadgeTextTransformLeft, ["none", "uppercase", "lowercase", "capitalize"]),
    compareBadgeTextTransformRight: stringValue(data, "compareBadgeTextTransformRight", DEFAULT_COMPARE_THEME_SETTINGS.compareBadgeTextTransformRight, ["none", "uppercase", "lowercase", "capitalize"]),
    compareOverflowBehavior: stringValue(data, "compareOverflowBehavior", DEFAULT_COMPARE_THEME_SETTINGS.compareOverflowBehavior, ["auto-fit", "shrink-to-fit", "scroll", "clip"]),
    compareAutoFitMinFontSize: minAutoFit,
    compareAutoFitMaxFontSize: maxAutoFit,
    compareKeepSameFontSize: boolValue(data, "compareKeepSameFontSize", DEFAULT_COMPARE_THEME_SETTINGS.compareKeepSameFontSize),
    compareVerticalAlignLeft: stringValue(data, "compareVerticalAlignLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareVerticalAlignLeft, ["top", "center", "bottom"]),
    compareVerticalAlignRight: stringValue(data, "compareVerticalAlignRight", DEFAULT_COMPARE_THEME_SETTINGS.compareVerticalAlignRight, ["top", "center", "bottom"]),
    comparePanelHeightMode: stringValue(data, "comparePanelHeightMode", DEFAULT_COMPARE_THEME_SETTINGS.comparePanelHeightMode, ["match-tallest", "equal-fixed-height", "fit-content", "fill-available-height"]),
    compareSyncPanelStyles: boolValue(data, "compareSyncPanelStyles", DEFAULT_COMPARE_THEME_SETTINGS.compareSyncPanelStyles),
    comparePanelBgColorLeft: colorValue(data, "comparePanelBgColorLeft", DEFAULT_COMPARE_THEME_SETTINGS.comparePanelBgColorLeft),
    comparePanelBgColorRight: colorValue(data, "comparePanelBgColorRight", DEFAULT_COMPARE_THEME_SETTINGS.comparePanelBgColorRight),
    comparePanelBgOpacityLeft: 0,
    comparePanelBgOpacityRight: 0,
    comparePanelBorderColorLeft: colorValue(data, "comparePanelBorderColorLeft", DEFAULT_COMPARE_THEME_SETTINGS.comparePanelBorderColorLeft),
    comparePanelBorderColorRight: colorValue(data, "comparePanelBorderColorRight", DEFAULT_COMPARE_THEME_SETTINGS.comparePanelBorderColorRight),
    comparePanelBorderWidthLeft: 0,
    comparePanelBorderWidthRight: 0,
    comparePanelRadiusLeft: 0,
    comparePanelRadiusRight: 0,
    comparePanelShadowLeft: false,
    comparePanelShadowRight: false,
    compareDividerVisible: false,
    compareDividerColor: colorValue(data, "compareDividerColor", DEFAULT_COMPARE_THEME_SETTINGS.compareDividerColor),
    compareDividerThickness: numberValue(data, "compareDividerThickness", DEFAULT_COMPARE_THEME_SETTINGS.compareDividerThickness, 1, 12),
    compareReferencePositionLeft: stringValue(data, "compareReferencePositionLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareReferencePositionLeft, ["above-verse", "same-row", "below-verse", "hidden"]),
    compareReferencePositionRight: stringValue(data, "compareReferencePositionRight", DEFAULT_COMPARE_THEME_SETTINGS.compareReferencePositionRight, ["above-verse", "same-row", "below-verse", "hidden"]),
    compareBadgePositionLeft: stringValue(data, "compareBadgePositionLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareBadgePositionLeft, ["above-verse", "same-row", "below-verse", "hidden"]),
    compareBadgePositionRight: stringValue(data, "compareBadgePositionRight", DEFAULT_COMPARE_THEME_SETTINGS.compareBadgePositionRight, ["above-verse", "same-row", "below-verse", "hidden"]),
    compareReferenceAlignmentLeft: stringValue(data, "compareReferenceAlignmentLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareReferenceAlignmentLeft, ["left", "center", "right"]),
    compareReferenceAlignmentRight: stringValue(data, "compareReferenceAlignmentRight", DEFAULT_COMPARE_THEME_SETTINGS.compareReferenceAlignmentRight, ["left", "center", "right"]),
    compareBadgeAlignmentLeft: stringValue(data, "compareBadgeAlignmentLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareBadgeAlignmentLeft, ["left", "center", "right"]),
    compareBadgeAlignmentRight: stringValue(data, "compareBadgeAlignmentRight", DEFAULT_COMPARE_THEME_SETTINGS.compareBadgeAlignmentRight, ["left", "center", "right"]),
    compareMetaGapLeft: numberValue(data, "compareMetaGapLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareMetaGapLeft, 0, 40),
    compareMetaGapRight: numberValue(data, "compareMetaGapRight", DEFAULT_COMPARE_THEME_SETTINGS.compareMetaGapRight, 0, 40),
    compareMetaBottomSpacingLeft: numberValue(data, "compareMetaBottomSpacingLeft", DEFAULT_COMPARE_THEME_SETTINGS.compareMetaBottomSpacingLeft, 0, 40),
    compareMetaBottomSpacingRight: numberValue(data, "compareMetaBottomSpacingRight", DEFAULT_COMPARE_THEME_SETTINGS.compareMetaBottomSpacingRight, 0, 40),
  };
}
