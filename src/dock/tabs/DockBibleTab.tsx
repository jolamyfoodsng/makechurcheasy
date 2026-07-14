/**
 * DockBibleTab.tsx — Bible tab for the OBS Browser Dock
 *
 * Smart search: type "gen1vs1", "g11", "jn3:16", "ps23" etc.
 * Resolves straight into a fast chapter reader with stage / live actions per verse.
 */

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SearchResult as BibleKeywordResult } from "../../bible/bibleData";
import { addFavorite, getFavorites, removeFavorite } from "../../bible/bibleDb";
import { BUILTIN_THEMES } from "../../bible/themes/builtinThemes";
import {
  DEFAULT_THEME_SETTINGS,
  BOOK_ABBREVS,
  LOWER_THIRD_SIZE_PRESETS,
  type BiblePassage,
  type BibleTheme,
  type BibleThemeSettings,
} from "../../bible/types";
import { dockClient, type DockStateMessage } from "../../services/dockBridge";
import type { DockProductionModuleSettings } from "../../services/productionSettings";
import {
  createVoiceBibleDockCommand,
  getVoiceBibleResultKey,
  loadVoiceBibleDockState,
  postVoiceBibleDockCommand,
} from "../../services/voiceBibleDockInterop";
import type {
  VoiceBibleCandidate,
  VoiceBibleResult,
  VoiceBibleSnapshot,
} from "../../services/voiceBibleTypes";
import {
  parseBibleSearch,
  type BibleSearchResult,
} from "../bibleSearchParser";
import {
  normalizeScriptureReference,
  getConceptVerses,
} from "../../bible/scriptureReranker";
import { BibleDockContainer } from "../components/BibleDockUI";
import DockThemeSettingsModal from "../components/DockThemeSettingsModal";
import BibleHistoryScreen from "./BibleHistoryScreen";
import { addToBibleHistory } from "./bibleHistoryTypes";
import type { DockFullscreenQuickThemeSettings } from "../components/DockFullscreenThemeQuickSettings";
import {
  buildDockBackgroundPresetOverrides,
  type DockBackgroundPreset
} from "../dockConsoleTheme";
import Icon from "../DockIcon";
import DockBottomToolbar from "../components/DockBottomToolbar";
import {
  areQuickThemeSettingsEquivalent,
  buildLinkedLowerThirdQuickThemeSettings,
} from "../lowerThirdQuickSettings";
import { normalizeCompareThemeSettings } from "../compareThemeConfig";

import { ensureObsConnected } from "../obsConnectionGuard";
import { trackBiblePresent } from "../../services/tracking";
import { loadDockFavoriteBibleThemes } from "../dockThemeData";
import {
  BOOK_CHAPTERS,
  OT_BOOKS,
  type DockStagedItem,
} from "../dockTypes";
import { requireEntitlement } from "../dockEntitlement";
import { getUserScopedKey } from "../../services/userScopedStorage";
import { invoke } from "@tauri-apps/api/core";
import { dockObsClient } from "../dockObsClient";
import { themeSupportsBibleOverlayMode } from "../../bible/themeVariantSupport";

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  productionDefaults: DockProductionModuleSettings;
  initialVoiceBible?: VoiceBibleSnapshot | null;
  appConnected: boolean;
  isActive?: boolean;
  showHistory?: boolean;
  onHistoryClose?: () => void;
  compactToolbar?: boolean;
}

type OverlayMode = "fullscreen" | "lower-third";
type DisplayMode = "single" | "compare";
type CompareLayout = "line-by-line" | "side-by-side";
type ThemeSettingsTab = "text" | "background" | "compare";
const DOCK_BIBLE_PREFS_KEY = "ocs-dock-bible-preferences";
const DOCK_BIBLE_UI_PREFS_KEY = "ocs-dock-bible-ui-preferences";
const MAX_VERSE_LINES = 4;
const DEFAULT_VERSE_LINES = 1;
const QUICK_SELECT_VERSION_COUNT = 2;
const MIN_DOCK_KEYWORD_SEARCH_LENGTH = 2;
const DOCK_KEYWORD_SEARCH_LIMIT = 24;
const BIBLE_RECENT_SEARCHES_KEY = "ocs-dock-bible-recent-searches-v1";
const BIBLE_RECENT_SEARCH_LIMIT = 4;

interface DockBiblePreferences {
  overlayMode?: OverlayMode;
  displayMode?: DisplayMode;
  translation?: string;
  translations?: string[];
  translationA?: string;
  translationB?: string;
  compareEnabled?: boolean;
  compareLayout?: CompareLayout;
  verseLineCount?: number;
  fullscreenThemeId?: string;
  lowerThirdThemeId?: string;
  backgroundPreset?: DockBackgroundPreset;
  fullscreenQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickThemeSettingsLinkedToFullscreen?: boolean;
  selectedBook?: string;
  selectedChapter?: number;
}

interface DockBibleUiPreferences {
  controlsCollapsed?: boolean;
}

type ColumnTranslations = string[];
type LiveTranscriptWordChip = {
  id: string;
  text: string;
  lane: "start" | "end";
};

function normalizeColumnTranslations(
  values?: string[] | null,
  fallback = "KJV",
): ColumnTranslations {
  const source = Array.isArray(values) ? values.filter(Boolean) : [];
  return Array.from({ length: MAX_VERSE_LINES }, (_, index) => {
    const next = source[index] ?? source[0] ?? fallback;
    return next.toUpperCase();
  });
}

function createEmptyPassages(): Array<BiblePassage | null> {
  return Array.from({ length: MAX_VERSE_LINES }, () => null);
}

function createEmptyErrors(): string[] {
  return Array.from({ length: MAX_VERSE_LINES }, () => "");
}

function clampVerseLineCount(value?: number): number {
  if (!value || Number.isNaN(value)) return DEFAULT_VERSE_LINES;
  return Math.min(MAX_VERSE_LINES, Math.max(1, value));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function abbreviateBibleBook(book: string): string {
  const canonical = BOOK_ABBREVS[book]?.[0]?.trim();
  if (!canonical) {
    return book
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => (/^\d+$/.test(part) ? part : part.slice(0, 3)))
      .join("")
      .toLowerCase();
  }

  return canonical.replace(/\s+/g, "").toLowerCase();
}

function extractFullscreenQuickThemeSettings(
  settings: BibleThemeSettings,
  backgroundType?: DockFullscreenQuickThemeSettings["backgroundType"],
): DockFullscreenQuickThemeSettings {
  const compareSettings = normalizeCompareThemeSettings(settings as unknown as Record<string, unknown>);
  return {
    backgroundType,
    fontSize: clampNumber(settings.fontSize, 28, 200),
    fontFamily: settings.fontFamily || DEFAULT_THEME_SETTINGS.fontFamily || "",
    refFontSize: clampNumber(settings.refFontSize, 14, 150),
    refFontWeight: settings.refFontWeight || DEFAULT_THEME_SETTINGS.refFontWeight,
    fontColor: settings.fontColor || DEFAULT_THEME_SETTINGS.fontColor,
    refFontColor: settings.refFontColor || settings.fontColor || DEFAULT_THEME_SETTINGS.refFontColor,
    refPosition: settings.refPosition || DEFAULT_THEME_SETTINGS.refPosition,
    refTextTransform: settings.refTextTransform || DEFAULT_THEME_SETTINGS.refTextTransform,
    refLetterSpacing: clampNumber(settings.refLetterSpacing, 0, 10),
    refOpacity: clampNumber(settings.refOpacity, 0, 1),
    refTextAlign: settings.refTextAlign || DEFAULT_THEME_SETTINGS.refTextAlign,
    refSpacing: clampNumber(settings.refSpacing, 0, 80),
    fullscreenShadeColor:
      settings.fullscreenShadeColor || DEFAULT_THEME_SETTINGS.fullscreenShadeColor,
    fullscreenShadeOpacity: clampNumber(settings.fullscreenShadeOpacity, 0, 1),
    textAlign: settings.textAlign || DEFAULT_THEME_SETTINGS.textAlign,
    lineHeight: clampNumber(settings.lineHeight, 1.05, 1.8),
    fontWeight: settings.fontWeight || DEFAULT_THEME_SETTINGS.fontWeight,
    fontStyle: settings.fontStyle || DEFAULT_THEME_SETTINGS.fontStyle,
    textTransform: settings.textTransform || DEFAULT_THEME_SETTINGS.textTransform,
    textShadow: settings.textShadow ?? DEFAULT_THEME_SETTINGS.textShadow,
    animation: settings.animation ?? DEFAULT_THEME_SETTINGS.animation,
    animationDuration: settings.animationDuration ?? DEFAULT_THEME_SETTINGS.animationDuration,
    backgroundImage: settings.backgroundImage ?? "",
    backgroundImageFilePath: settings.backgroundImageFilePath ?? "",
    backgroundVideo: settings.backgroundVideo ?? "",
    backgroundVideoFilePath: settings.backgroundVideoFilePath ?? "",
    backgroundOpacity: clampNumber(settings.backgroundOpacity ?? 1, 0, 1),
    backgroundColor: settings.backgroundColor || DEFAULT_THEME_SETTINGS.backgroundColor || "#0B1426",
    backgroundColorEnd: settings.backgroundColorEnd || DEFAULT_THEME_SETTINGS.backgroundColorEnd || "#162040",
    bgGradientAngle: clampNumber(settings.bgGradientAngle ?? DEFAULT_THEME_SETTINGS.bgGradientAngle ?? 180, 0, 360),
    referenceBackgroundEnabled: settings.referenceBackgroundEnabled ?? false,
    referenceBackgroundColor: settings.referenceBackgroundColor || DEFAULT_THEME_SETTINGS.referenceBackgroundColor,
    referenceBackgroundStyle: settings.referenceBackgroundStyle || DEFAULT_THEME_SETTINGS.referenceBackgroundStyle,
    referenceBackgroundRadius: clampNumber(settings.referenceBackgroundRadius ?? 12, 0, 40),
    lowerThirdPosition: settings.lowerThirdPosition || DEFAULT_THEME_SETTINGS.lowerThirdPosition,
    lowerThirdSize: settings.lowerThirdSize || DEFAULT_THEME_SETTINGS.lowerThirdSize,
    lowerThirdWidthPreset: settings.lowerThirdWidthPreset || DEFAULT_THEME_SETTINGS.lowerThirdWidthPreset,
    lowerThirdOffsetX: clampNumber(settings.lowerThirdOffsetX ?? 0, -500, 500),
    backgroundPattern: settings.backgroundPattern ?? "",
    lowerThirdCaptionPosition: settings.lowerThirdCaptionPosition || "bottom",
    compareTranslationWidth: settings.compareTranslationWidth ?? DEFAULT_THEME_SETTINGS.compareTranslationWidth,
    ...compareSettings,
  };
}

function buildDefaultLowerThirdQuickThemeSettings(
  settings: BibleThemeSettings,
  backgroundType?: DockFullscreenQuickThemeSettings["backgroundType"],
): DockFullscreenQuickThemeSettings {
  const base = extractFullscreenQuickThemeSettings(settings, backgroundType);
  const sizePreset =
    LOWER_THIRD_SIZE_PRESETS[settings.lowerThirdSize || DEFAULT_THEME_SETTINGS.lowerThirdSize] ||
    LOWER_THIRD_SIZE_PRESETS.medium;

  return {
    ...base,
    fontSize: sizePreset.fontSize,
    refFontSize: sizePreset.refFontSize,
    lineHeight: sizePreset.lineHeight,
    refSpacing: sizePreset.refSpacing,
    referenceBackgroundEnabled: false,
    lowerThirdWidthPreset:
      base.lowerThirdWidthPreset === "full" ? "md" : base.lowerThirdWidthPreset,
  };
}

function applyLowerThirdQuickThemeSettings(
  theme: BibleTheme,
  quickSettings: DockFullscreenQuickThemeSettings | null,
): BibleTheme {
  const themed = applyFullscreenQuickThemeSettings(theme, quickSettings);
  const sizePreset =
    LOWER_THIRD_SIZE_PRESETS[quickSettings?.lowerThirdSize || DEFAULT_THEME_SETTINGS.lowerThirdSize] ||
    LOWER_THIRD_SIZE_PRESETS.medium;
  return {
    ...themed,
    settings: {
      ...themed.settings,
      padding: sizePreset.padding,
      safeArea: sizePreset.safeArea,
    },
  };
}

function sanitizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value.trim())
    ? value.trim().toUpperCase()
    : fallback;
}

function sanitizeFullscreenQuickThemeSettings(
  value: unknown,
): DockFullscreenQuickThemeSettings | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<DockFullscreenQuickThemeSettings>;
  const fontWeight =
    source.fontWeight === "light" || source.fontWeight === "normal" || source.fontWeight === "bold"
      ? source.fontWeight
      : DEFAULT_THEME_SETTINGS.fontWeight;
  const fontStyle =
    source.fontStyle === "normal" || source.fontStyle === "italic"
      ? source.fontStyle
      : DEFAULT_THEME_SETTINGS.fontStyle;
  const textAlign =
    source.textAlign === "left" || source.textAlign === "center" || source.textAlign === "right"
      ? source.textAlign
      : DEFAULT_THEME_SETTINGS.textAlign;
  const textTransform =
    source.textTransform === "none" ||
      source.textTransform === "uppercase" ||
      source.textTransform === "lowercase" ||
      source.textTransform === "capitalize"
      ? source.textTransform
      : DEFAULT_THEME_SETTINGS.textTransform;

  const validAnimations = ["none", "fade", "slide-up", "slide-left", "scale-in", "reveal-bg-then-text"] as const;
  const animation = validAnimations.includes(source.animation as typeof validAnimations[number])
    ? source.animation as typeof validAnimations[number]
    : DEFAULT_THEME_SETTINGS.animation;
  const compareSettings = normalizeCompareThemeSettings(source as Record<string, unknown>);

  return {
    fontSize: clampNumber(Number(source.fontSize ?? DEFAULT_THEME_SETTINGS.fontSize), 28, 200),
    fontFamily: typeof source.fontFamily === "string" ? source.fontFamily : (DEFAULT_THEME_SETTINGS.fontFamily || ""),
    refFontSize: clampNumber(
      Number(source.refFontSize ?? DEFAULT_THEME_SETTINGS.refFontSize),
      14,
      150,
    ),
    refFontWeight: (source.refFontWeight as BibleThemeSettings["refFontWeight"]) || DEFAULT_THEME_SETTINGS.refFontWeight,
    fontColor: sanitizeColor(source.fontColor, DEFAULT_THEME_SETTINGS.fontColor),
    refFontColor: sanitizeColor(source.refFontColor, DEFAULT_THEME_SETTINGS.refFontColor),
    refPosition: (source.refPosition as BibleThemeSettings["refPosition"]) || DEFAULT_THEME_SETTINGS.refPosition,
    refTextTransform: (source.refTextTransform as BibleThemeSettings["refTextTransform"]) || DEFAULT_THEME_SETTINGS.refTextTransform,
    refLetterSpacing: clampNumber(Number(source.refLetterSpacing ?? DEFAULT_THEME_SETTINGS.refLetterSpacing), 0, 10),
    refOpacity: clampNumber(Number(source.refOpacity ?? DEFAULT_THEME_SETTINGS.refOpacity), 0, 1),
    refTextAlign: (source.refTextAlign as BibleThemeSettings["refTextAlign"]) || DEFAULT_THEME_SETTINGS.refTextAlign,
    refSpacing: clampNumber(Number(source.refSpacing ?? DEFAULT_THEME_SETTINGS.refSpacing), 0, 80),
    fullscreenShadeColor: sanitizeColor(
      source.fullscreenShadeColor,
      DEFAULT_THEME_SETTINGS.fullscreenShadeColor,
    ),
    fullscreenShadeOpacity: clampNumber(
      Number(source.fullscreenShadeOpacity ?? DEFAULT_THEME_SETTINGS.fullscreenShadeOpacity),
      0,
      1,
    ),
    textAlign,
    lineHeight: clampNumber(
      Number(source.lineHeight ?? DEFAULT_THEME_SETTINGS.lineHeight),
      1.05,
      1.8,
    ),
    fontWeight,
    fontStyle,
    textTransform,
    textShadow: typeof source.textShadow === "string" ? source.textShadow : DEFAULT_THEME_SETTINGS.textShadow,
    animation,
    animationDuration: clampNumber(
      Number(source.animationDuration ?? DEFAULT_THEME_SETTINGS.animationDuration),
      100,
      2000,
    ),
    backgroundImage: typeof source.backgroundImage === "string" ? source.backgroundImage : "",
    backgroundImageFilePath: typeof source.backgroundImageFilePath === "string" ? source.backgroundImageFilePath : "",
    backgroundVideo: typeof source.backgroundVideo === "string" ? source.backgroundVideo : "",
    backgroundVideoFilePath: typeof source.backgroundVideoFilePath === "string" ? source.backgroundVideoFilePath : "",
    backgroundOpacity: clampNumber(
      Number(source.backgroundOpacity ?? 1),
      0,
      1,
    ),
    backgroundColor: sanitizeColor(source.backgroundColor, DEFAULT_THEME_SETTINGS.backgroundColor || "#0B1426"),
    backgroundColorEnd: sanitizeColor(source.backgroundColorEnd, DEFAULT_THEME_SETTINGS.backgroundColorEnd || "#162040"),
    bgGradientAngle: clampNumber(Number(source.bgGradientAngle ?? DEFAULT_THEME_SETTINGS.bgGradientAngle ?? 180), 0, 360),
    referenceBackgroundEnabled: source.referenceBackgroundEnabled === true,
    referenceBackgroundColor: sanitizeColor(
      source.referenceBackgroundColor,
      DEFAULT_THEME_SETTINGS.referenceBackgroundColor,
    ),
    referenceBackgroundStyle:
      source.referenceBackgroundStyle === "solid" ||
        source.referenceBackgroundStyle === "pill" ||
        source.referenceBackgroundStyle === "outline"
        ? source.referenceBackgroundStyle
        : DEFAULT_THEME_SETTINGS.referenceBackgroundStyle,
    referenceBackgroundRadius: clampNumber(
      Number(source.referenceBackgroundRadius ?? 12),
      0,
      40,
    ),
    lowerThirdPosition:
      source.lowerThirdPosition === "left" ||
        source.lowerThirdPosition === "center" ||
        source.lowerThirdPosition === "right"
        ? source.lowerThirdPosition
        : DEFAULT_THEME_SETTINGS.lowerThirdPosition,
    lowerThirdSize:
      source.lowerThirdSize === "smallest" ||
        source.lowerThirdSize === "smaller" ||
        source.lowerThirdSize === "small" ||
        source.lowerThirdSize === "medium" ||
        source.lowerThirdSize === "big" ||
        source.lowerThirdSize === "bigger" ||
        source.lowerThirdSize === "biggest"
        ? source.lowerThirdSize
        : DEFAULT_THEME_SETTINGS.lowerThirdSize,
    lowerThirdWidthPreset:
      source.lowerThirdWidthPreset === "sm" ||
        source.lowerThirdWidthPreset === "md" ||
        source.lowerThirdWidthPreset === "lg" ||
        source.lowerThirdWidthPreset === "xl" ||
        source.lowerThirdWidthPreset === "xxl"
        ? source.lowerThirdWidthPreset
        : source.lowerThirdWidthPreset === "full"
          ? "md"
          : DEFAULT_THEME_SETTINGS.lowerThirdWidthPreset,
    lowerThirdOffsetX: clampNumber(
      Number(source.lowerThirdOffsetX ?? 0),
      -500,
      500,
    ),
    backgroundPattern: typeof source.backgroundPattern === "string" ? source.backgroundPattern : "",
    lowerThirdCaptionPosition:
      source.lowerThirdCaptionPosition === "top" || source.lowerThirdCaptionPosition === "bottom"
        ? source.lowerThirdCaptionPosition
        : "bottom",
    compareTranslationWidth: clampNumber(Number(source.compareTranslationWidth ?? DEFAULT_THEME_SETTINGS.compareTranslationWidth), 30, 50),
    backgroundType: source.backgroundType,
    ...compareSettings,
  };
}

function applyFullscreenQuickThemeSettings(
  theme: BibleTheme,
  quickSettings: DockFullscreenQuickThemeSettings | null,
): BibleTheme {
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
  const compareSettings = normalizeCompareThemeSettings(quickSettings as Record<string, unknown>);
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
      referenceBackgroundEnabled: quickSettings.referenceBackgroundEnabled,
      referenceBackgroundColor: quickSettings.referenceBackgroundColor,
      referenceBackgroundStyle: quickSettings.referenceBackgroundStyle,
      referenceBackgroundRadius: quickSettings.referenceBackgroundRadius,
      fontStyle: quickSettings.fontStyle,
      lowerThirdPosition: quickSettings.lowerThirdPosition,
      lowerThirdSize: quickSettings.lowerThirdSize,
      lowerThirdWidthPreset: quickSettings.lowerThirdWidthPreset,
      lowerThirdOffsetX: quickSettings.lowerThirdOffsetX,
      ...compareSettings,
    },
  };
}

function buildFullscreenLiveOverridesForQuickSettings(
  themeSettings: BibleThemeSettings,
  preset: DockBackgroundPreset,
  backgroundType?: DockFullscreenQuickThemeSettings["backgroundType"],
): Record<string, unknown> | null {
  if (backgroundType && backgroundType !== "theme") {
    return null;
  }
  return buildDockBackgroundPresetOverrides(themeSettings, preset) as Record<string, unknown> | null;
}

function loadDockBiblePreferences(): DockBiblePreferences {
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_BIBLE_PREFS_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DockBiblePreferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDockBiblePreferences(next: DockBiblePreferences): void {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_BIBLE_PREFS_KEY), JSON.stringify(next));
  } catch {
    // ignore persistence failures in OBS CEF
  }
}

function loadDockBibleUiPreferences(): DockBibleUiPreferences {
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_BIBLE_UI_PREFS_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DockBibleUiPreferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDockBibleUiPreferences(next: DockBibleUiPreferences): void {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_BIBLE_UI_PREFS_KEY), JSON.stringify(next));
  } catch {
    // ignore persistence failures in OBS CEF
  }
}

function normalizeTranscriptStackWord(word: string): string {
  return word.toLowerCase().replace(/^[^\w']+|[^\w']+$/g, "");
}

function splitTranscriptStackWords(transcript: string): string[] {
  return transcript
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function extractTranscriptWordTail(previousWords: string[], nextWords: string[]): string[] {
  if (nextWords.length === 0) return [];
  if (previousWords.length === 0) return nextWords;

  const normalizedPrevious = previousWords.map(normalizeTranscriptStackWord).filter(Boolean);
  const normalizedNext = nextWords.map(normalizeTranscriptStackWord).filter(Boolean);
  const maxOverlap = Math.min(normalizedPrevious.length, normalizedNext.length, 18);

  for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (
        normalizedPrevious[normalizedPrevious.length - overlap + index] !==
        normalizedNext[index]
      ) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return nextWords.slice(overlap);
    }
  }

  return nextWords;
}

function isReferenceLikeBibleQuery(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return false;
  return (
    /\d/.test(trimmed) ||
    /[:.-]/.test(trimmed) ||
    /\b(vs|verse|verses|chapter|chap)\b/.test(trimmed)
  );
}

type DockBibleSearchOption =
  | ({ kind: "reference" } & BibleSearchResult)
  | {
    kind: "keyword";
    book: string;
    chapter: number;
    verse: number;
    label: string;
    snippet: string;
    text: string;
    query: string;
  }
  | {
    kind: "concept";
    book: string;
    chapter: number;
    verse: number;
    label: string;
    snippet: string;
    text: string;
    query: string;
  };

function emptyVoiceBibleSnapshot(): VoiceBibleSnapshot {
  return {
    status: "idle",
    inputLevel: 0,
    modelReady: false,
    semanticReady: false,
    candidates: [],
    lastResult: null,
  };
}

function readRecentBibleSearches(): string[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(BIBLE_RECENT_SEARCHES_KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeRecentBibleSearches(items: string[]): void {
  try {
    localStorage.setItem(getUserScopedKey(BIBLE_RECENT_SEARCHES_KEY), JSON.stringify(items.slice(0, BIBLE_RECENT_SEARCH_LIMIT)));
  } catch {
    // ignore OBS CEF storage failures
  }
}

function pushRecentBibleSearch(label: string): string[] {
  const normalized = label.trim();
  if (!normalized) return readRecentBibleSearches();
  const next = [
    normalized,
    ...readRecentBibleSearches().filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, BIBLE_RECENT_SEARCH_LIMIT);
  writeRecentBibleSearches(next);
  return next;
}

function getKeywordSearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9']+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  );
}

function renderHighlightedKeywordText(text: string, query: string): React.ReactNode {
  const terms = getKeywordSearchTerms(query);
  if (terms.length === 0) return text;

  const escapedTerms = terms
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);
  if (escapedTerms.length === 0) return text;

  const splitPattern = new RegExp(`(${escapedTerms.join("|")})`, "ig");
  const exactPattern = new RegExp(`^(?:${escapedTerms.join("|")})$`, "i");
  const segments = text.split(splitPattern);

  return segments.map((segment, index) => (
    exactPattern.test(segment) ? (
      <mark key={`${segment}-${index}`} className="dock-search-dropdown__highlight">
        {segment}
      </mark>
    ) : (
      <span key={`${segment}-${index}`}>{segment}</span>
    )
  ));
}

export default function DockBibleTab({
  staged,
  onStage,
  productionDefaults,
  initialVoiceBible,
  appConnected,
  isActive = true,
  showHistory,
  onHistoryClose,
  compactToolbar,
}: Props) {
  const { t } = useTranslation();
  const [selectedBook, setSelectedBook] = useState<string | null>(OT_BOOKS[0] ?? null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(1);
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [columnTranslations, setColumnTranslations] = useState<ColumnTranslations>(() => normalizeColumnTranslations());
  const [verseLineCount, setVerseLineCount] = useState(DEFAULT_VERSE_LINES);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBibleTheme, setSelectedBibleTheme] = useState<BibleTheme>(
    productionDefaults.fullscreenTheme ?? BUILTIN_THEMES[0],
  );
  const [selectedLowerThirdTheme, setSelectedLowerThirdTheme] = useState<BibleTheme>(
    productionDefaults.lowerThirdTheme ?? BUILTIN_THEMES[0],
  );
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(productionDefaults.defaultMode);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("single");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareLayout, setCompareLayout] = useState<CompareLayout>("line-by-line");
  const [translationA, setTranslationA] = useState("KJV");
  const [translationB, setTranslationB] = useState("NIV");
  const [availableTranslations, setAvailableTranslations] = useState<Array<{ value: string; label: string }>>([
    { value: "KJV", label: "KJV" },
  ]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [keywordActionResult, setKeywordActionResult] = useState<Extract<DockBibleSearchOption, { kind: "keyword" | "concept" }> | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentBibleSearches());
  const [activeIdx, setActiveIdx] = useState(-1);
  const [keywordResults, setKeywordResults] = useState<BibleKeywordResult[]>([]);
  const [isKeywordSearching, setIsKeywordSearching] = useState(false);
  const [, setVerseText] = useState<string | null>(null);
  const [verseCount, setVerseCount] = useState(30);
  const [voiceBible, setVoiceBible] = useState<VoiceBibleSnapshot>(
    () => initialVoiceBible ?? emptyVoiceBibleSnapshot(),
  );
  const [, setLiveTranscriptWords] = useState<LiveTranscriptWordChip[]>([]);
  const [modeMorphing, setModeMorphing] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [backgroundPreset, setBackgroundPreset] = useState<DockBackgroundPreset>("theme");
  const [savedFullscreenQuickThemeSettings, setSavedFullscreenQuickThemeSettings] =
    useState<DockFullscreenQuickThemeSettings | null>(null);
  const [fullscreenQuickThemeSettings, setFullscreenQuickThemeSettings] =
    useState<DockFullscreenQuickThemeSettings | null>(null);
  const [savedLowerThirdQuickThemeSettings, setSavedLowerThirdQuickThemeSettings] =
    useState<DockFullscreenQuickThemeSettings | null>(null);
  const [lowerThirdQuickThemeSettings, setLowerThirdQuickThemeSettings] =
    useState<DockFullscreenQuickThemeSettings | null>(null);
  const [lowerThirdQuickThemeSettingsLinkedToFullscreen, setLowerThirdQuickThemeSettingsLinkedToFullscreen] =
    useState(false);
  const [chapterPassages, setChapterPassages] = useState<Array<BiblePassage | null>>(() => createEmptyPassages());
  const [comparePassages, setComparePassages] = useState<{ translationA: BiblePassage | null; translationB: BiblePassage | null }>(() => ({
    translationA: null,
    translationB: null,
  }));
  const [compareChapterLoading, setCompareChapterLoading] = useState(false);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterErrors, setChapterErrors] = useState<string[]>(() => createEmptyErrors());
  const [compareChapterErrors, setCompareChapterErrors] = useState<[string, string]>(["", ""]);
  const [highlightVerse, setHighlightVerse] = useState<number | null>(null);
  const [favoriteRefs, setFavoriteRefs] = useState<Set<string>>(new Set());
  const [isUtilityCollapsed, _setIsUtilityCollapsed] = useState(
    () => loadDockBibleUiPreferences().controlsCollapsed ?? false,
  );
  const [bibleBgOnly, setBibleBgOnly] = useState(false);
  const liveVerseRequestIdRef = useRef(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const verseGridRef = useRef<HTMLDivElement>(null);
  const verseLinePopoverRef = useRef<HTMLDivElement>(null);
  const comparePopoverRef = useRef<HTMLDivElement>(null);
  const [showComparePopover, setShowComparePopover] = useState(false);
  const voiceHeldRef = useRef(false);
  const voiceBridgeTimeoutRef = useRef<number | null>(null);
  const voiceFallbackReadyRef = useRef(false);
  const lastVoiceResultKeyRef = useRef(getVoiceBibleResultKey(initialVoiceBible?.lastResult));
  const lastVoiceEventTimestampRef = useRef(0);
  const pendingScrollVerseRef = useRef<number | null>(null);
  const suppressNextVerseLineRestageRef = useRef(false);
  const prefsReadyRef = useRef(false);
  const suppressAutoStageRef = useRef(true);
  const previousStagedRef = useRef(staged);
  const suppressAutoStageTimerRef = useRef<number | null>(null);
  const latestStagedRef = useRef(staged);
  const selectedBibleThemeRef = useRef(selectedBibleTheme);
  const selectedLowerThirdThemeRef = useRef(selectedLowerThirdTheme);
  const backgroundPresetRef = useRef(backgroundPreset);
  const fullscreenQuickSettingsDebounceRef = useRef<number | null>(null);
  const lowerThirdQuickSettingsDebounceRef = useRef<number | null>(null);
  const prefsSaveDebounceRef = useRef<number | null>(null);
  const liveTranscriptWordCounterRef = useRef(0);
  const lastTranscriptWordsRef = useRef<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [compactLayout, setCompactLayout] = useState(false);
  const [isBookDropdownOpen, setIsBookDropdownOpen] = useState(false);
  const [isChapterDropdownOpen, setIsChapterDropdownOpen] = useState(false);
  const [isVerseDropdownOpen, setIsVerseDropdownOpen] = useState(false);
  const [showVerseLinePopover, setShowVerseLinePopover] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [themeSettingsInitialTab, setThemeSettingsInitialTab] = useState<ThemeSettingsTab>("text");
  const [showBibleHistory, setShowBibleHistory] = useState(false);

  // Compact layout when container height ≤ 450px
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCompactLayout(entry.contentRect.height <= 450);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sync external showHistory prop with local state
  useEffect(() => {
    if (showHistory !== undefined) setShowBibleHistory(showHistory);
  }, [showHistory]);
  const [showSearchBar, _setShowSearchBar] = useState(true);
  const [isTopbarExpanded, setIsTopbarExpanded] = useState(false);
  const activeColumnIndex = Math.min(Math.max(selectedColumn, 0), QUICK_SELECT_VERSION_COUNT - 1);
  const activeTranslation = columnTranslations[activeColumnIndex] ?? columnTranslations[0];
  const quickTranslations = useMemo(
    () => columnTranslations.slice(0, QUICK_SELECT_VERSION_COUNT),
    [columnTranslations],
  );
  const activeChapterPassage = chapterPassages[activeColumnIndex] ?? null;
  const getLoadedPassageForTranslation = useCallback((translation: string): BiblePassage | null => {
    const normalized = translation.toUpperCase();
    const quickIndex = columnTranslations.findIndex((value) => value.toUpperCase() === normalized);
    if (quickIndex >= 0) {
      return chapterPassages[quickIndex] ?? null;
    }
    if (translationA.toUpperCase() === normalized) {
      return comparePassages.translationA ?? null;
    }
    if (translationB.toUpperCase() === normalized) {
      return comparePassages.translationB ?? null;
    }
    return null;
  }, [chapterPassages, columnTranslations, comparePassages.translationA, comparePassages.translationB, translationA, translationB]);
  const selectedPassageForFavorite = useMemo(() => {
    if (!selectedBook || !selectedChapter || !selectedVerse || !activeChapterPassage) {
      return null;
    }

    const startIndex = activeChapterPassage.verses.findIndex((entry) => entry.verse === selectedVerse);
    if (startIndex === -1) {
      return null;
    }

    const selection = activeChapterPassage.verses.slice(
      startIndex,
      startIndex + clampVerseLineCount(verseLineCount),
    );
    if (selection.length === 0) {
      return null;
    }

    const endVerse = selection[selection.length - 1]?.verse ?? selectedVerse;
    const verseRange = endVerse === selectedVerse ? `${selectedVerse}` : `${selectedVerse}-${endVerse}`;

    return {
      ...activeChapterPassage,
      reference: `${selectedBook} ${selectedChapter}:${verseRange}`,
      startVerse: selectedVerse,
      endVerse,
      verses: selection,
      translation: activeTranslation,
    } satisfies BiblePassage;
  }, [
    activeChapterPassage,
    activeTranslation,
    selectedBook,
    selectedChapter,
    selectedVerse,
    verseLineCount,
  ]);
  const isCurrentPassageFavorite = selectedPassageForFavorite
    ? favoriteRefs.has(selectedPassageForFavorite.reference)
    : false;

  const scheduleAutoStageResume = useCallback(() => {
    suppressAutoStageRef.current = true;
    if (suppressAutoStageTimerRef.current !== null) {
      window.clearTimeout(suppressAutoStageTimerRef.current);
    }
    suppressAutoStageTimerRef.current = window.setTimeout(() => {
      suppressAutoStageRef.current = false;
      suppressAutoStageTimerRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const isPicker = target?.closest(
        ".dock-bible-browser__book-picker, .dock-bible-browser__chapter-picker, .dock-bible-browser__verse-picker, .dock-bible-version-bar__slot, .dock-bible-controls__book-card, .dock-bible-controls__chapter-picker, .dock-bible-controls__verse-picker",
      );
      if (isPicker) return;

      setIsBookDropdownOpen(false);
      setIsChapterDropdownOpen(false);
      setIsVerseDropdownOpen(false);
      if (verseLinePopoverRef.current && !verseLinePopoverRef.current.contains(event.target as Node)) {
        setShowVerseLinePopover(false);
      }
      if (comparePopoverRef.current && !comparePopoverRef.current.contains(event.target as Node)) {
        setShowComparePopover(false);
      }
      if (showOptionsModal && !target?.closest(".dock-bible-options-modal")) {
        setShowOptionsModal(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showOptionsModal]);

  useEffect(() => {
    const transcript = voiceBible.transcript?.trim() ?? "";
    if (!transcript) {
      return;
    }

    const nextWords = splitTranscriptStackWords(transcript);
    if (nextWords.length === 0) {
      return;
    }

    const appendedWords = extractTranscriptWordTail(
      lastTranscriptWordsRef.current,
      nextWords,
    );
    lastTranscriptWordsRef.current = nextWords;

    if (appendedWords.length === 0) {
      return;
    }

    setLiveTranscriptWords((current) => {
      const next = [...current];
      for (const word of appendedWords) {
        const absoluteIndex = liveTranscriptWordCounterRef.current;
        next.push({
          id: `voice-word-${absoluteIndex}-${word}`,
          text: word,
          lane: absoluteIndex % 2 === 0 ? "start" : "end",
        });
        liveTranscriptWordCounterRef.current += 1;
      }
      return next.slice(-28);
    });
  }, [voiceBible.transcript]);

  useEffect(() => {
    let cancelled = false;

    void getFavorites()
      .then((favorites) => {
        if (cancelled) return;
        setFavoriteRefs(new Set(favorites.map((passage) => passage.reference)));
      })
      .catch(() => {
        if (!cancelled) {
          setFavoriteRefs(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scheduleAutoStageResume();
    prefsReadyRef.current = false;
    const prefs = loadDockBiblePreferences();
    const initialBook =
      prefs.selectedBook && BOOK_CHAPTERS[prefs.selectedBook]
        ? prefs.selectedBook
        : (OT_BOOKS[0] ?? null);
    const maxInitialChapter = initialBook ? (BOOK_CHAPTERS[initialBook] ?? 1) : 1;
    const initialChapter = Math.min(
      Math.max(prefs.selectedChapter ?? 1, 1),
      maxInitialChapter,
    );
    setSelectedBibleTheme(productionDefaults.fullscreenTheme ?? BUILTIN_THEMES[0]);
    setSelectedLowerThirdTheme(productionDefaults.lowerThirdTheme ?? BUILTIN_THEMES[0]);
    setOverlayMode(prefs.overlayMode ?? productionDefaults.defaultMode);
    const restoredCompareEnabled = typeof prefs.compareEnabled === "boolean"
      ? prefs.compareEnabled
      : prefs.displayMode === "compare";
    setCompareEnabled(restoredCompareEnabled);
    setDisplayMode(restoredCompareEnabled ? "compare" : "single");
    setCompareLayout(prefs.compareLayout ?? "line-by-line");
    setTranslationA(prefs.translationA ?? "KJV");
    setTranslationB(prefs.translationB ?? "NIV");
    setColumnTranslations(
      normalizeColumnTranslations(
        prefs.translations ?? (prefs.translation ? [prefs.translation] : undefined),
      ),
    );
    setVerseLineCount(clampVerseLineCount(prefs.verseLineCount));
    setBackgroundPreset(prefs.backgroundPreset ?? "theme");
    const storedQuickSettings = sanitizeFullscreenQuickThemeSettings(
      prefs.fullscreenQuickThemeSettings,
    );
    const rawStoredLowerThirdQuickSettings = sanitizeFullscreenQuickThemeSettings(
      prefs.lowerThirdQuickThemeSettings,
    );
    const storedLowerThirdQuickSettings =
      areQuickThemeSettingsEquivalent(storedQuickSettings, rawStoredLowerThirdQuickSettings)
        ? null
        : rawStoredLowerThirdQuickSettings;
    const storedLowerThirdLinked = false;
    setSavedFullscreenQuickThemeSettings(storedQuickSettings);
    setFullscreenQuickThemeSettings(storedQuickSettings);
    setSavedLowerThirdQuickThemeSettings(storedLowerThirdQuickSettings);
    setLowerThirdQuickThemeSettings(
      storedLowerThirdLinked ? (storedQuickSettings ?? storedLowerThirdQuickSettings) : storedLowerThirdQuickSettings,
    );
    setLowerThirdQuickThemeSettingsLinkedToFullscreen(storedLowerThirdLinked);
    setSelectedBook(initialBook);
    setSelectedChapter(initialBook ? initialChapter : null);
    setSelectedVerse(null);
    setSelectedColumn(0);

    let cancelled = false;
    const applyStoredThemes = async () => {
      scheduleAutoStageResume();
      const allFavorites = await loadDockFavoriteBibleThemes();

      if (cancelled) return;

      const storedFullscreen = allFavorites.find(
        (theme) => theme.id === prefs.fullscreenThemeId
          && themeSupportsBibleOverlayMode(theme, "fullscreen"),
      );
      const storedLowerThird = allFavorites.find(
        (theme) => theme.id === prefs.lowerThirdThemeId
          && themeSupportsBibleOverlayMode(theme, "lower-third"),
      );

      if (storedFullscreen) {
        setSelectedBibleTheme(storedFullscreen);
      }

      if (storedLowerThird) {
        setSelectedLowerThirdTheme(storedLowerThird);
      }

      prefsReadyRef.current = true;
      scheduleAutoStageResume();
    };

    void applyStoredThemes().catch(() => {
      prefsReadyRef.current = true;
      scheduleAutoStageResume();
    });
    return () => {
      cancelled = true;
    };
  }, [
    productionDefaults.defaultMode,
    productionDefaults.fullscreenTheme,
    productionDefaults.lowerThirdTheme,
    scheduleAutoStageResume,
  ]);

  useEffect(() => () => {
    if (suppressAutoStageTimerRef.current !== null) {
      window.clearTimeout(suppressAutoStageTimerRef.current);
    }
    if (fullscreenQuickSettingsDebounceRef.current !== null) {
      window.clearTimeout(fullscreenQuickSettingsDebounceRef.current);
    }
    if (lowerThirdQuickSettingsDebounceRef.current !== null) {
      window.clearTimeout(lowerThirdQuickSettingsDebounceRef.current);
    }
    if (prefsSaveDebounceRef.current !== null) {
      window.clearTimeout(prefsSaveDebounceRef.current);
    }
  }, []);

  useEffect(() => {
    if (!prefsReadyRef.current) return;
    if (prefsSaveDebounceRef.current !== null) {
      window.clearTimeout(prefsSaveDebounceRef.current);
    }
    prefsSaveDebounceRef.current = window.setTimeout(() => {
      prefsSaveDebounceRef.current = null;
      saveDockBiblePreferences({
        overlayMode,
        displayMode,
        translation: activeTranslation,
        translations: [...columnTranslations],
        translationA,
        translationB,
        compareEnabled,
        compareLayout,
        verseLineCount,
        fullscreenThemeId: selectedBibleTheme.id,
        lowerThirdThemeId: selectedLowerThirdTheme.id,
        backgroundPreset,
        fullscreenQuickThemeSettings: savedFullscreenQuickThemeSettings,
        lowerThirdQuickThemeSettings: savedLowerThirdQuickThemeSettings,
        lowerThirdQuickThemeSettingsLinkedToFullscreen,
        selectedBook: selectedBook ?? undefined,
        selectedChapter: selectedChapter ?? undefined,
      });
    }, 300);
  }, [
    activeTranslation,
    backgroundPreset,
    displayMode,
    translationA,
    translationB,
    compareEnabled,
    compareLayout,
    savedLowerThirdQuickThemeSettings,
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
    columnTranslations,
    overlayMode,
    savedFullscreenQuickThemeSettings,
    verseLineCount,
    selectedBibleTheme.id,
    selectedBook,
    selectedChapter,
    selectedLowerThirdTheme.id,
  ]);

  useEffect(() => {
    saveDockBibleUiPreferences({
      controlsCollapsed: isUtilityCollapsed,
    });
  }, [isUtilityCollapsed]);

  const loadTranslations = useCallback(async () => {
    try {
      const remote = await fetch("/uploads/dock-bible-translations.json");
      if (remote.ok) {
        const payload = await remote.json() as Array<{ abbr: string; name: string }>;
        if (Array.isArray(payload) && payload.length > 0) {
          setAvailableTranslations([
            { value: "KJV", label: "KJV" },
            ...payload
              .filter((entry) => entry.abbr && entry.abbr.toUpperCase() !== "KJV")
              .map((entry) => ({ value: entry.abbr.toUpperCase(), label: entry.abbr.toUpperCase() })),
          ]);
          return;
        }
      }
    } catch {
      // Fall through to local IndexedDB fallback.
    }

    try {
      const { getInstalledTranslations } = await import("../../bible/bibleDb");
      const installed = await getInstalledTranslations();
      setAvailableTranslations([
        { value: "KJV", label: "KJV" },
        ...installed
          .filter((entry) => entry.abbr && entry.abbr.toUpperCase() !== "KJV")
          .map((entry) => ({ value: entry.abbr.toUpperCase(), label: entry.abbr.toUpperCase() })),
      ]);
    } catch {
      setAvailableTranslations([{ value: "KJV", label: "KJV" }]);
    }
  }, []);

  useEffect(() => {
    void loadTranslations();
  }, [loadTranslations]);

  useEffect(() => {
    const allowed = new Set(availableTranslations.map((entry) => entry.value.toUpperCase()));
    setColumnTranslations((current) => {
      const next = current.map((value) =>
        allowed.has(value.toUpperCase()) ? value.toUpperCase() : "KJV",
      );
      return current.every((value, index) => value === next[index]) ? current : next;
    });
  }, [availableTranslations]);

  // Resolve the base theme for each mode from the unified theme's variants
  const baseFullscreenTheme = useMemo(() => {
    const variant = selectedBibleTheme.variants?.fullscreen;
    return variant
      ? { ...selectedBibleTheme, settings: variant.settings, rawTemplate: variant.rawTemplate }
      : selectedBibleTheme;
  }, [selectedBibleTheme]);

  const baseLowerThirdTheme = useMemo(() => {
    const variant = selectedLowerThirdTheme.variants?.lowerThird;
    return variant
      ? { ...selectedLowerThirdTheme, settings: variant.settings, rawTemplate: variant.rawTemplate }
      : selectedLowerThirdTheme;
  }, [selectedLowerThirdTheme]);

  const effectiveSelectedBibleTheme = useMemo(
    () =>
      applyFullscreenQuickThemeSettings(
        baseFullscreenTheme,
        fullscreenQuickThemeSettings,
      ),
    [fullscreenQuickThemeSettings, baseFullscreenTheme],
  );

  const activeFullscreenQuickThemeSettings = useMemo(
    () => extractFullscreenQuickThemeSettings(effectiveSelectedBibleTheme.settings, fullscreenQuickThemeSettings?.backgroundType ?? "theme"),
    [effectiveSelectedBibleTheme.settings, fullscreenQuickThemeSettings?.backgroundType],
  );

  const defaultFullscreenQuickThemeSettings = useMemo(
    () => extractFullscreenQuickThemeSettings(baseFullscreenTheme.settings, "theme"),
    [baseFullscreenTheme.settings],
  );

  const defaultLowerThirdQuickThemeSettings = useMemo(
    () => buildDefaultLowerThirdQuickThemeSettings(baseLowerThirdTheme.settings, "theme"),
    [baseLowerThirdTheme.settings],
  );

  const effectiveLowerThirdQuickThemeSettings = useMemo(() => {
    if (lowerThirdQuickThemeSettingsLinkedToFullscreen) {
      return buildLinkedLowerThirdQuickThemeSettings(
        defaultLowerThirdQuickThemeSettings,
        fullscreenQuickThemeSettings,
      );
    }

    return lowerThirdQuickThemeSettings ?? defaultLowerThirdQuickThemeSettings;
  }, [
    defaultLowerThirdQuickThemeSettings,
    fullscreenQuickThemeSettings,
    lowerThirdQuickThemeSettings,
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
  ]);

  const effectiveSelectedLowerThirdTheme = useMemo(() => {
    return applyLowerThirdQuickThemeSettings(
      baseLowerThirdTheme,
      effectiveLowerThirdQuickThemeSettings,
    );
  }, [baseLowerThirdTheme, effectiveLowerThirdQuickThemeSettings]);

  const activeLowerThirdQuickThemeSettings = useMemo(
    () => extractFullscreenQuickThemeSettings(
      effectiveSelectedLowerThirdTheme.settings,
      effectiveLowerThirdQuickThemeSettings.backgroundType ?? defaultLowerThirdQuickThemeSettings.backgroundType,
    ),
    [
      defaultLowerThirdQuickThemeSettings.backgroundType,
      effectiveLowerThirdQuickThemeSettings.backgroundType,
      effectiveSelectedLowerThirdTheme.settings,
    ],
  );

  const fullscreenLiveOverrides = useMemo(
    () => buildFullscreenLiveOverridesForQuickSettings(
      effectiveSelectedBibleTheme.settings,
      backgroundPreset,
      fullscreenQuickThemeSettings?.backgroundType,
    ),
    [backgroundPreset, effectiveSelectedBibleTheme.settings, fullscreenQuickThemeSettings?.backgroundType],
  );

  const handleBackgroundPresetChange = useCallback((preset: DockBackgroundPreset) => {
    backgroundPresetRef.current = preset;
    setBackgroundPreset(preset);
  }, []);

  // ── Fetch verse count when chapter changes ──
  useEffect(() => {
    if (!selectedBook || !selectedChapter) { setVerseCount(30); return; }
    let cancelled = false;
    (async () => {
      try {
        const { getVerseCount } = await import("../../bible/bibleData");
        const count = await getVerseCount(selectedBook, selectedChapter, activeTranslation);
        if (!cancelled) setVerseCount(count || 30);
      } catch { if (!cancelled) setVerseCount(30); }
    })();
    return () => { cancelled = true; };
  }, [activeTranslation, selectedBook, selectedChapter]);

  // ── Fetch actual verse text helper ──
  const fetchVerseText = useCallback(async (book: string, chapter: number, verse: number, trans: string): Promise<string> => {
    try {
      const { getVerse } = await import("../../bible/bibleData");
      const result = await getVerse(book, chapter, verse, trans);
      if (!result?.text) {
        console.warn(`[DockBibleTab] getVerse returned no text for ${book} ${chapter}:${verse} (${trans})`);
      }
      return result?.text || `${book} ${chapter}:${verse}`;
    } catch (err) {
      console.error(`[DockBibleTab] fetchVerseText failed for ${book} ${chapter}:${verse}:`, err);
      return `${book} ${chapter}:${verse}`;
    }
  }, []);

  const focusReference = useCallback((
    book: string,
    chapter: number,
    verse?: number | null,
    options?: { reveal?: boolean },
  ) => {
    setSelectedBook(book);
    setSelectedChapter(chapter);
    setSelectedVerse(verse ?? null);
    pendingScrollVerseRef.current = options?.reveal === false ? null : (verse ?? null);
  }, []);

  const focusReferenceWithoutReload = useCallback((
    _book: string,
    _chapter: number,
    verse: number | null,
    options?: { reveal?: boolean },
  ) => {
    setSelectedVerse(verse);
    pendingScrollVerseRef.current = options?.reveal === false ? null : verse;
  }, []);

  useEffect(() => {
    if (!selectedBook || !selectedChapter) {
      setChapterPassages(createEmptyPassages());
      setChapterLoading(false);
      setChapterErrors(createEmptyErrors());
      return;
    }

    let cancelled = false;
    setChapterLoading(true);
    setChapterErrors(createEmptyErrors());
    (async () => {
      try {
        const { getChapter } = await import("../../bible/bibleData");
        const uniqueTranslations = Array.from(
          new Set(quickTranslations.map((value) => value.toUpperCase())),
        );
        const passageMap = new Map<string, BiblePassage>();
        const errorMap = new Map<string, string>();

        await Promise.all(
          uniqueTranslations.map(async (version) => {
            try {
              const passage = await getChapter(selectedBook, selectedChapter, version);
              passageMap.set(version, passage);
            } catch (error) {
              errorMap.set(
                version,
                error instanceof Error ? error.message : t("bible.unableToLoadVersion"),
              );
            }
          }),
        );
        if (cancelled) return;
        const nextPassages = createEmptyPassages();
        const nextErrors = createEmptyErrors();
        columnTranslations.forEach((version, index) => {
          nextPassages[index] = passageMap.get(version) ?? null;
          nextErrors[index] = errorMap.get(version) ?? "";
        });
        setChapterPassages(nextPassages);
        setChapterErrors(nextErrors);

        // Update the shared Bible reading state so mobile can show the same chapter
        const primaryPassage = nextPassages[0];
        if (primaryPassage && !cancelled) {
          const verses = (primaryPassage.verses ?? []).map((v) => ({
            verse: v.verse,
            text: v.text,
          }));
          invoke("set_bible_reading_state", {
            translation: primaryPassage.translation ?? quickTranslations[0] ?? "KJV",
            book: selectedBook,
            chapter: selectedChapter,
            verses,
            selectedVerse: selectedVerse ?? null,
          }).catch(() => { });
        }
      } catch (error) {
        if (cancelled) return;
        const nextErrors = createEmptyErrors();
        nextErrors[0] = error instanceof Error ? error.message : t("bible.unableToLoad");
        setChapterPassages(createEmptyPassages());
        setChapterErrors(nextErrors);
      } finally {
        if (!cancelled) {
          setChapterLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [columnTranslations, quickTranslations, selectedBook, selectedChapter]);

  useEffect(() => {
    if (!compareEnabled || !selectedBook || !selectedChapter) {
      setComparePassages({ translationA: null, translationB: null });
      setCompareChapterErrors(["", ""]);
      setCompareChapterLoading(false);
      return;
    }

    let cancelled = false;
    setCompareChapterLoading(true);
    setCompareChapterErrors(["", ""]);

    (async () => {
      try {
        const { getChapter } = await import("../../bible/bibleData");
        const [passageA, passageB] = await Promise.all([
          getChapter(selectedBook, selectedChapter, translationA),
          getChapter(selectedBook, selectedChapter, translationB),
        ]);
        if (cancelled) return;
        setComparePassages({ translationA: passageA, translationB: passageB });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : t("bible.unableToLoad");
        setComparePassages({ translationA: null, translationB: null });
        setCompareChapterErrors([message, message]);
      } finally {
        if (!cancelled) {
          setCompareChapterLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [compareEnabled, selectedBook, selectedChapter, translationA, translationB, t]);

  const resolveVerseSelection = useCallback(
    async (
      book: string,
      chapter: number,
      verse: number,
      translation: string,
      lineCount: number,
      explicitVerseEnd?: number | null,
      existingPassage?: BiblePassage | null,
    ): Promise<{ text: string; verseRange: string; verseEnd: number }> => {
      const safeLineCount = clampVerseLineCount(lineCount);

      let passage = existingPassage ?? null;
      if (!passage) {
        try {
          const { getChapter } = await import("../../bible/bibleData");
          passage = await getChapter(book, chapter, translation);
        } catch {
          passage = null;
        }
      }

      const verses = passage?.verses ?? [];
      const startIndex = verses.findIndex((entry) => entry.verse === verse);
      if (startIndex === -1) {
        const text = await fetchVerseText(book, chapter, verse, translation);
        return { text, verseRange: String(verse), verseEnd: verse };
      }

      const explicitEndIndex =
        explicitVerseEnd && explicitVerseEnd >= verse
          ? verses.findIndex((entry) => entry.verse === explicitVerseEnd)
          : -1;
      const selection =
        explicitEndIndex >= startIndex
          ? verses.slice(startIndex, explicitEndIndex + 1)
          : verses.slice(startIndex, startIndex + safeLineCount);
      const verseEnd = selection[selection.length - 1]?.verse ?? verse;
      const text =
        selection.length <= 1
          ? (selection[0]?.text ?? `${book} ${chapter}:${verse}`)
          : selection.map((entry) => `${entry.verse}. ${entry.text}`).join("\n");
      const verseRange = verseEnd === verse ? String(verse) : `${verse}-${verseEnd}`;
      return { text, verseRange, verseEnd };
    },
    [fetchVerseText],
  );

  const stageVerse = useCallback(
    async (
      book: string,
      chapter: number,
      verse: number,
      options?: {
        translation?: string;
        columnIndex?: number;
        reveal?: boolean;
        rangeEndVerse?: number | null;
        lineCount?: number;
      },
    ) => {
      const effectiveTranslation = options?.translation ?? activeTranslation;
      const effectiveLineCount = clampVerseLineCount(options?.lineCount ?? verseLineCount);
      if (book !== selectedBook || chapter !== selectedChapter) {
        focusReference(book, chapter, verse, { reveal: options?.reveal });
      } else {
        focusReferenceWithoutReload(book, chapter, verse, { reveal: options?.reveal });
      }
      if (typeof options?.columnIndex === "number") {
        setSelectedColumn(Math.min(Math.max(options.columnIndex, 0), QUICK_SELECT_VERSION_COUNT - 1));
      }
      setActionError("");
      const existingPrimaryPassage =
        book === selectedBook && chapter === selectedChapter
          ? getLoadedPassageForTranslation(effectiveTranslation)
          : null;
      const selection = await resolveVerseSelection(
        book,
        chapter,
        verse,
        effectiveTranslation,
        effectiveLineCount,
        options?.rangeEndVerse ?? null,
        existingPrimaryPassage,
      );
      setVerseText(selection.text);
      const referenceLabel = `${book} ${chapter}:${selection.verseRange}`;
      const columnIndex = typeof options?.columnIndex === "number"
        ? Math.min(Math.max(options.columnIndex, 0), QUICK_SELECT_VERSION_COUNT - 1)
        : activeColumnIndex;
      const compareMode = compareEnabled;

      let stageData: Record<string, unknown>;
      let stageLabel = referenceLabel;
      let stageSubtitle = selection.text;

      if (compareMode) {
        const [selectionA, selectionB] = await Promise.all([
          resolveVerseSelection(
            book,
            chapter,
            verse,
            translationA,
            effectiveLineCount,
            options?.rangeEndVerse ?? null,
          ),
          resolveVerseSelection(
            book,
            chapter,
            verse,
            translationB,
            effectiveLineCount,
            options?.rangeEndVerse ?? null,
          ),
        ]);
        const compareReferenceLabel = `${book} ${chapter}:${selectionA.verseRange}`;
        stageLabel = compareReferenceLabel;
        stageSubtitle = selectionA.text;
        stageData = {
          book,
          chapter,
          verse,
          columnIndex,
          verseEnd: selectionA.verseEnd,
          verseRange: selectionA.verseRange,
          referenceLabel: compareReferenceLabel,
          lineCount: effectiveLineCount,
          translation: translationA,
          translationA,
          translationB,
          compareEnabled: true,
          compareLayout,
          verseText: selectionA.text,
          overlayMode,
          theme: overlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id,
          bibleThemeSettings: (
            overlayMode === "fullscreen"
              ? effectiveSelectedBibleTheme.settings
              : effectiveSelectedLowerThirdTheme.settings
          ) as unknown as Record<string, unknown>,
          liveOverrides:
            overlayMode === "fullscreen"
              ? (fullscreenLiveOverrides as Record<string, unknown> | null)
              : null,
          backgroundOnly: bibleBgOnly,
          reveal: options?.reveal !== false,
          compare: {
            enabled: true,
            layout: compareLayout,
            columns: [
              {
                book,
                chapter,
                verse,
                verseEnd: selectionA.verseEnd,
                verseRange: selectionA.verseRange,
                referenceLabel: compareReferenceLabel,
                translation: translationA,
                verseText: selectionA.text,
              },
              {
                book,
                chapter,
                verse,
                verseEnd: selectionB.verseEnd,
                verseRange: selectionB.verseRange,
                referenceLabel: compareReferenceLabel,
                translation: translationB,
                verseText: selectionB.text,
              },
            ],
          },
        };
      } else {
        stageData = {
          book,
          chapter,
          verse,
          columnIndex,
          verseEnd: selection.verseEnd,
          verseRange: selection.verseRange,
          referenceLabel,
          lineCount: effectiveLineCount,
          translation: effectiveTranslation,
          verseText: selection.text,
          overlayMode,
          theme: overlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id,
          bibleThemeSettings: (
            overlayMode === "fullscreen"
              ? effectiveSelectedBibleTheme.settings
              : effectiveSelectedLowerThirdTheme.settings
          ) as unknown as Record<string, unknown>,
          liveOverrides:
            overlayMode === "fullscreen"
              ? (fullscreenLiveOverrides as Record<string, unknown> | null)
              : null,
          backgroundOnly: bibleBgOnly,
          reveal: options?.reveal !== false,
        };
      }

      onStage({
        type: "bible",
        label: stageLabel,
        subtitle: stageSubtitle,
        data: stageData,
      });
    },
    [
      focusReference,
      focusReferenceWithoutReload,
      compareEnabled,
      compareLayout,
      fullscreenLiveOverrides,
      onStage,
      overlayMode,
      resolveVerseSelection,
      translationA,
      translationB,
      effectiveSelectedBibleTheme.id,
      effectiveSelectedBibleTheme.settings,
      effectiveSelectedLowerThirdTheme.settings,
      selectedLowerThirdTheme.id,
      activeTranslation,
      activeColumnIndex,
      bibleBgOnly,
      chapterPassages,
      verseLineCount,
    ],
  );

  const goLiveVerse = useCallback(
    async (
      book: string,
      chapter: number,
      verse: number,
      options?: {
        translation?: string;
        columnIndex?: number;
        reveal?: boolean;
        rangeEndVerse?: number | null;
        lineCount?: number;
      },
    ) => {
      const requestId = ++liveVerseRequestIdRef.current;
      const effectiveTranslation = options?.translation ?? activeTranslation;
      const effectiveLineCount = clampVerseLineCount(options?.lineCount ?? verseLineCount);
      const sameChapter = book === selectedBook && chapter === selectedChapter;
      const existingPrimaryPassage = sameChapter
        ? getLoadedPassageForTranslation(effectiveTranslation)
        : null;

      if (typeof options?.columnIndex === "number") {
        setSelectedColumn(Math.min(Math.max(options.columnIndex, 0), QUICK_SELECT_VERSION_COUNT - 1));
      }
      setActionError("");

      const selection = await resolveVerseSelection(
        book,
        chapter,
        verse,
        effectiveTranslation,
        effectiveLineCount,
        options?.rangeEndVerse ?? null,
        existingPrimaryPassage,
      );
      if (requestId !== liveVerseRequestIdRef.current) return;

      setVerseText(selection.text);
      const referenceLabel = `${book} ${chapter}:${selection.verseRange}`;
      const columnIndex = typeof options?.columnIndex === "number"
        ? Math.min(Math.max(options.columnIndex, 0), QUICK_SELECT_VERSION_COUNT - 1)
        : activeColumnIndex;
      const compareMode = compareEnabled;

      let stageData: Record<string, unknown>;
      let stageLabel = referenceLabel;
      let stageSubtitle = selection.text;

      if (compareMode) {
        const [selectionA, selectionB] = await Promise.all([
          resolveVerseSelection(
            book,
            chapter,
            verse,
            translationA,
            effectiveLineCount,
            options?.rangeEndVerse ?? null,
            sameChapter ? getLoadedPassageForTranslation(translationA) : null,
          ),
          resolveVerseSelection(
            book,
            chapter,
            verse,
            translationB,
            effectiveLineCount,
            options?.rangeEndVerse ?? null,
            sameChapter ? getLoadedPassageForTranslation(translationB) : null,
          ),
        ]);
        if (requestId !== liveVerseRequestIdRef.current) return;

        const compareReferenceLabel = `${book} ${chapter}:${selectionA.verseRange}`;
        stageLabel = compareReferenceLabel;
        stageSubtitle = selectionA.text;
        stageData = {
          book,
          chapter,
          verse,
          columnIndex,
          verseEnd: selectionA.verseEnd,
          verseRange: selectionA.verseRange,
          referenceLabel: compareReferenceLabel,
          lineCount: effectiveLineCount,
          translation: translationA,
          translationA,
          translationB,
          compareEnabled: true,
          compareLayout,
          verseText: selectionA.text,
          overlayMode,
          theme: overlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id,
          bibleThemeSettings: (
            overlayMode === "fullscreen"
              ? effectiveSelectedBibleTheme.settings
              : effectiveSelectedLowerThirdTheme.settings
          ) as unknown as Record<string, unknown>,
          liveOverrides:
            overlayMode === "fullscreen"
              ? (fullscreenLiveOverrides as Record<string, unknown> | null)
              : null,
          backgroundOnly: bibleBgOnly,
          reveal: options?.reveal !== false,
          _dockLive: true,
          compare: {
            enabled: true,
            layout: compareLayout,
            columns: [
              {
                book,
                chapter,
                verse,
                verseEnd: selectionA.verseEnd,
                verseRange: selectionA.verseRange,
                referenceLabel: compareReferenceLabel,
                translation: translationA,
                verseText: selectionA.text,
              },
              {
                book,
                chapter,
                verse,
                verseEnd: selectionB.verseEnd,
                verseRange: selectionB.verseRange,
                referenceLabel: compareReferenceLabel,
                translation: translationB,
                verseText: selectionB.text,
              },
            ],
          },
        };
      } else {
        stageData = {
          book,
          chapter,
          verse,
          columnIndex,
          verseEnd: selection.verseEnd,
          verseRange: selection.verseRange,
          referenceLabel,
          lineCount: effectiveLineCount,
          translation: effectiveTranslation,
          verseText: selection.text,
          overlayMode,
          theme: overlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id,
          bibleThemeSettings: (
            overlayMode === "fullscreen"
              ? effectiveSelectedBibleTheme.settings
              : effectiveSelectedLowerThirdTheme.settings
          ) as unknown as Record<string, unknown>,
          liveOverrides:
            overlayMode === "fullscreen"
              ? (fullscreenLiveOverrides as Record<string, unknown> | null)
              : null,
          backgroundOnly: bibleBgOnly,
          reveal: options?.reveal !== false,
          _dockLive: true,
        };
      }

      if (requestId !== liveVerseRequestIdRef.current) return;

      onStage({
        type: "bible",
        label: stageLabel,
        subtitle: stageSubtitle,
        data: stageData,
      });

      const lowerThirdPayload = {
        verseText: stageData.verseText as string | undefined,
        referenceText: stageData.referenceLabel as string | undefined,
        verseRange: stageData.verseRange as string | undefined,
        bibleThemeSettings: stageData.bibleThemeSettings as Record<string, unknown> | null | undefined,
        liveOverrides: null,
        themeId: stageData.theme as string | undefined,
        compareEnabled: Boolean(stageData.compareEnabled),
        compareLayout: stageData.compareLayout as CompareLayout | undefined,
        compare: stageData.compare as Record<string, unknown> | null | undefined,
        translationA: stageData.translationA as string | undefined,
        translationB: stageData.translationB as string | undefined,
      };

      // Fire-and-forget OBS push — UI is already updated via onStage.
      ensureObsConnected()
        .then(() => {
          if (requestId !== liveVerseRequestIdRef.current) return;
          return overlayMode === "lower-third"
            ? dockObsClient.pushBibleOverlayFast(lowerThirdPayload)
            : dockObsClient.pushBible(stageData as Parameters<typeof dockObsClient.pushBible>[0]);
        })
        .then(() => {
          if (requestId !== liveVerseRequestIdRef.current) return;
          trackBiblePresent(selection.text);
        })
        .catch((err) => {
          if (requestId !== liveVerseRequestIdRef.current) return;
          const message = err instanceof Error ? err.message : String(err);
          const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
          if (!isTransient) {
            console.warn("[DockBibleTab] Go live verse failed:", err);
            setActionError(message);
          } else {
            console.warn("[DockBibleTab] Go live verse failed (transient):", message);
          }
        });

      if (book && chapter && verse) {
        const verseData = existingPrimaryPassage?.verses.find((entry) => entry.verse === verse)
          ?? chapterPassages[activeColumnIndex]?.verses.find((entry) => entry.verse === verse);
        addToBibleHistory(book, chapter, verse, verseData?.text ?? "");
      }
    },
    [
      compareEnabled,
      compareLayout,
      fullscreenLiveOverrides,
      onStage,
      overlayMode,
      resolveVerseSelection,
      getLoadedPassageForTranslation,
      selectedBook,
      selectedChapter,
      translationA,
      translationB,
      effectiveSelectedBibleTheme.id,
      effectiveSelectedBibleTheme.settings,
      effectiveSelectedLowerThirdTheme.settings,
      selectedLowerThirdTheme.id,
      activeTranslation,
      verseLineCount,
    ],
  );

  const handleSaveFullscreenQuickThemeSettings = useCallback((nextSettings: DockFullscreenQuickThemeSettings) => {
    const nextSavedSettings = { ...nextSettings };
    startTransition(() => {
      setFullscreenQuickThemeSettings(nextSavedSettings);
      setSavedFullscreenQuickThemeSettings(nextSavedSettings);
      if (lowerThirdQuickThemeSettingsLinkedToFullscreen) {
        setLowerThirdQuickThemeSettings(null);
        setSavedLowerThirdQuickThemeSettings(null);
      }
    });
    // Direct OBS push: use ref-based theme to avoid stale closure when theme
    // selection and save happen in the same rAF callback (modal handleSave).
    try {
      const staged = latestStagedRef.current;
      if (staged && staged.type === "bible") {
        const d = staged.data as Record<string, unknown> | undefined;
        if (d) {
          const merged = applyFullscreenQuickThemeSettings(selectedBibleThemeRef.current, nextSavedSettings);
          const liveOverrides = buildFullscreenLiveOverridesForQuickSettings(
            merged.settings,
            backgroundPresetRef.current,
            nextSavedSettings.backgroundType,
          );
          const pushData = {
            book: (d.book as string) ?? "",
            chapter: (d.chapter as number) ?? 1,
            verse: (d.verse as number) ?? 1,
            verseEnd: d.verseEnd as number | undefined,
            verseRange: d.verseRange as string | undefined,
            referenceLabel: d.referenceLabel as string | undefined,
            translation: (d.translation as string) ?? "KJV",
            verseText: d.verseText as string | undefined,
            overlayMode: (d.overlayMode as "fullscreen" | "lower-third") ?? "fullscreen",
            theme: d.theme as string | undefined,
            bibleThemeSettings: merged.settings as unknown as Record<string, unknown>,
            liveOverrides,
            backgroundOnly: Boolean(d.backgroundOnly),
            compareEnabled: Boolean(d.compareEnabled),
            compareLayout: (d.compareLayout as CompareLayout | undefined) ?? compareLayout,
            compare: d.compare as Record<string, unknown> | undefined,
          };
          void ensureObsConnected().then(() => dockObsClient.pushBible(pushData)).catch(() => { });
        }
      }
    } catch { /* ignore save push errors */ }
  }, [compareLayout, lowerThirdQuickThemeSettingsLinkedToFullscreen]);

  const handlePreviewFullscreenQuickThemeSettings = useCallback((nextSettings: DockFullscreenQuickThemeSettings) => {
    const nextPreviewSettings = { ...nextSettings };
    setFullscreenQuickThemeSettings(nextPreviewSettings);
    if (lowerThirdQuickThemeSettingsLinkedToFullscreen) {
      setLowerThirdQuickThemeSettings(null);
    }
    // Best-effort live preview: push updated theme settings to OBS for the
    // currently staged Bible item so background changes appear immediately.
    try {
      const staged = latestStagedRef.current;
      if (staged && staged.type === "bible") {
        const d = staged.data as Record<string, unknown> | undefined;
        if (d) {
          const merged = applyFullscreenQuickThemeSettings(selectedBibleThemeRef.current, nextPreviewSettings);
          const liveOverrides = buildFullscreenLiveOverridesForQuickSettings(
            merged.settings,
            backgroundPresetRef.current,
            nextPreviewSettings.backgroundType,
          );
          const pushData = {
            book: (d.book as string) ?? "",
            chapter: (d.chapter as number) ?? 1,
            verse: (d.verse as number) ?? 1,
            verseEnd: d.verseEnd as number | undefined,
            verseRange: d.verseRange as string | undefined,
            referenceLabel: d.referenceLabel as string | undefined,
            translation: (d.translation as string) ?? "KJV",
            verseText: d.verseText as string | undefined,
            overlayMode: (d.overlayMode as "fullscreen" | "lower-third") ?? "fullscreen",
            theme: d.theme as string | undefined,
            bibleThemeSettings: merged.settings as unknown as Record<string, unknown>,
            liveOverrides,
            backgroundOnly: Boolean(d.backgroundOnly),
            compareEnabled: Boolean(d.compareEnabled),
            compareLayout: (d.compareLayout as CompareLayout | undefined) ?? compareLayout,
            compare: d.compare as Record<string, unknown> | undefined,
          };
          void ensureObsConnected().then(() => dockObsClient.pushBible(pushData)).catch(() => { });
        }
      }
    } catch { /* ignore preview errors */ }
  }, [compareLayout, lowerThirdQuickThemeSettingsLinkedToFullscreen]);

  const handleSaveLowerThirdQuickThemeSettings = useCallback((nextSettings: DockFullscreenQuickThemeSettings) => {
    const nextSavedSettings = { ...nextSettings };
    startTransition(() => {
      setLowerThirdQuickThemeSettingsLinkedToFullscreen(false);
      setLowerThirdQuickThemeSettings(nextSavedSettings);
      setSavedLowerThirdQuickThemeSettings(nextSavedSettings);
    });
    // Direct OBS push for lower-third: use ref-based theme.
    try {
      const staged = latestStagedRef.current;
      if (staged && staged.type === "bible") {
        const d = staged.data as Record<string, unknown> | undefined;
        if (d) {
          const merged = applyLowerThirdQuickThemeSettings(selectedLowerThirdThemeRef.current, nextSavedSettings);
          const payload = {
            verseText: d.verseText as string | undefined,
            referenceText: d.referenceLabel as string | undefined,
            verseRange: d.verseRange as string | undefined,
            bibleThemeSettings: merged.settings as unknown as Record<string, unknown>,
            liveOverrides: null,
            themeId: selectedLowerThirdThemeRef.current.id,
            compareEnabled: Boolean(d.compareEnabled),
            compareLayout: (d.compareLayout as CompareLayout | undefined) ?? compareLayout,
            compare: d.compare as Record<string, unknown> | null | undefined,
            translationA: d.translationA as string | undefined,
            translationB: d.translationB as string | undefined,
          };
          void ensureObsConnected().then(() => dockObsClient.pushBibleOverlayFast(payload)).catch(() => { });
        }
      }
    } catch { /* ignore lower-third save push errors */ }
  }, [compareLayout]);

  const handlePreviewLowerThirdQuickThemeSettings = useCallback((nextSettings: DockFullscreenQuickThemeSettings) => {
    startTransition(() => {
      setLowerThirdQuickThemeSettingsLinkedToFullscreen(false);
      setLowerThirdQuickThemeSettings({ ...nextSettings });
    });
    // Lightweight preview for lower-third: update CSS overlay on the browser source.
    try {
      const staged = latestStagedRef.current;
      if (staged && staged.type === "bible") {
        const d = staged.data as Record<string, unknown> | undefined;
        if (d) {
          const merged = applyLowerThirdQuickThemeSettings(selectedLowerThirdThemeRef.current, nextSettings);
          const payload = {
            verseText: d.verseText as string | undefined,
            referenceText: d.referenceLabel as string | undefined,
            verseRange: d.verseRange as string | undefined,
            bibleThemeSettings: merged.settings as unknown as Record<string, unknown>,
            liveOverrides: null,
            themeId: d.theme as string | undefined,
          };
          void ensureObsConnected().then(() => dockObsClient.pushBibleOverlayFast(payload)).catch(() => { });
        }
      }
    } catch { /* ignore preview errors */ }
  }, []);

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode);
    setCompareEnabled(mode === "compare");
  }, []);

  const handleCompareEnabledChange = useCallback((enabled: boolean) => {
    setCompareEnabled(enabled);
    setDisplayMode(enabled ? "compare" : "single");
  }, []);

  // ── Re-fetch verse text when the active column translation changes ──
  const prevActiveTranslation = useRef(activeTranslation);
  const selectedVerseRef = useRef(selectedVerse);
  useEffect(() => {
    selectedVerseRef.current = selectedVerse;
  }, [selectedVerse]);
  useEffect(() => {
    selectedBibleThemeRef.current = selectedBibleTheme;
  }, [selectedBibleTheme]);
  useEffect(() => {
    selectedLowerThirdThemeRef.current = selectedLowerThirdTheme;
  }, [selectedLowerThirdTheme]);
  useEffect(() => {
    backgroundPresetRef.current = backgroundPreset;
  }, [backgroundPreset]);

  useEffect(() => {
    const changed = prevActiveTranslation.current !== activeTranslation;
    prevActiveTranslation.current = activeTranslation;
    if (!changed) return;
    if (suppressAutoStageRef.current) return;

    const verse = selectedVerseRef.current;
    if (!selectedBook || !selectedChapter || !verse) return;

    let cancelled = false;
    (async () => {
      await stageVerse(selectedBook, selectedChapter, verse, {
        translation: activeTranslation,
        columnIndex: activeColumnIndex,
      });
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [
    activeColumnIndex,
    activeTranslation,
    selectedBook,
    selectedChapter,
    stageVerse,
  ]);

  // ── Re-render live verse when overlay mode changes (Full ↔ LT morphing) ──
  const prevOverlayMode = useRef(overlayMode);
  useEffect(() => {
    const changed = prevOverlayMode.current !== overlayMode;
    prevOverlayMode.current = overlayMode;
    if (!changed) return;
    if (suppressAutoStageRef.current) return;

    const verse = selectedVerseRef.current;
    if (!selectedBook || !selectedChapter || !verse) return;

    // If a verse is already live, re-push it immediately in the new mode.
    // goLiveVerse() handles the full OBS scene transition (fade-out old,
    // fade-in new) so the operator doesn't need to click the verse again.
    const liveData = latestStagedRef.current;
    if (liveData?.type === "bible") {
      const d = liveData.data as Record<string, unknown> | undefined;
      if (d) {
        // Trigger morphing pulse on the mode switcher
        setModeMorphing(true);
        const morphTimer = setTimeout(() => setModeMorphing(false), 400);

        void goLiveVerse(
          (d.book as string) ?? selectedBook,
          (d.chapter as number) ?? selectedChapter,
          (d.verse as number) ?? verse,
          {
            translation: (d.translation as string) ?? activeTranslation,
            columnIndex: typeof d.columnIndex === "number" ? d.columnIndex : activeColumnIndex,
            lineCount: typeof d.lineCount === "number" ? d.lineCount : verseLineCount,
            reveal: false,
          },
        ).finally(() => clearTimeout(morphTimer));
        return;
      }
    }

    // Nothing live yet — just stage so it's ready to go live
    void stageVerse(selectedBook, selectedChapter, verse, {});
  }, [
    activeColumnIndex,
    activeTranslation,
    goLiveVerse,
    overlayMode,
    selectedBook,
    selectedChapter,
    stageVerse,
    verseLineCount,
  ]);

  const prevThemeSignature = useRef(`${selectedBibleTheme.id}:${selectedLowerThirdTheme.id}`);
  useEffect(() => {
    const nextSignature = `${selectedBibleTheme.id}:${selectedLowerThirdTheme.id}`;
    const changed = prevThemeSignature.current !== nextSignature;
    prevThemeSignature.current = nextSignature;
    if (!changed) return;
    if (suppressAutoStageRef.current) return;

    const verse = selectedVerseRef.current;
    if (!selectedBook || !selectedChapter || !verse) return;

    void stageVerse(selectedBook, selectedChapter, verse, {});
  }, [selectedBibleTheme, selectedLowerThirdTheme, selectedBook, selectedChapter, stageVerse]);

  const prevBackgroundPreset = useRef(backgroundPreset);
  useEffect(() => {
    if (prevBackgroundPreset.current === backgroundPreset) return;
    prevBackgroundPreset.current = backgroundPreset;

    const verse = selectedVerseRef.current;
    if (!selectedBook || !selectedChapter || !verse) return;
    if (overlayMode !== "fullscreen") return;

    void stageVerse(selectedBook, selectedChapter, verse, {});
  }, [
    backgroundPreset,
    overlayMode,
    selectedBook,
    selectedChapter,
    stageVerse,
  ]);

  const prevFullscreenQuickSettingsSignature = useRef(
    JSON.stringify(activeFullscreenQuickThemeSettings),
  );
  useEffect(() => {
    const nextSignature = JSON.stringify(activeFullscreenQuickThemeSettings);
    const changed = prevFullscreenQuickSettingsSignature.current !== nextSignature;
    prevFullscreenQuickSettingsSignature.current = nextSignature;
    if (!changed) return;
    if (suppressAutoStageRef.current) return;

    if (overlayMode !== "fullscreen") return;
    const verse = selectedVerseRef.current;
    if (!selectedBook || !selectedChapter || !verse) return;

    void stageVerse(selectedBook, selectedChapter, verse, {
      translation: activeTranslation,
      columnIndex: activeColumnIndex,
    });

    // Debounce OBS push (100ms Rule 8) — rapid slider changes should not spam OBS
    if (fullscreenQuickSettingsDebounceRef.current !== null) {
      window.clearTimeout(fullscreenQuickSettingsDebounceRef.current);
    }
    fullscreenQuickSettingsDebounceRef.current = window.setTimeout(() => {
      fullscreenQuickSettingsDebounceRef.current = null;
      const data = latestStagedRef.current;
      if (data?.type === "bible") {
        const d = data.data as Record<string, unknown> | undefined;
        if (d) {
          const pushData = {
            book: (d.book as string) ?? "",
            chapter: (d.chapter as number) ?? 1,
            verse: (d.verse as number) ?? 1,
            verseEnd: d.verseEnd as number | undefined,
            verseRange: d.verseRange as string | undefined,
            referenceLabel: d.referenceLabel as string | undefined,
            translation: (d.translation as string) ?? "KJV",
            translationA: d.translationA as string | undefined,
            translationB: d.translationB as string | undefined,
            verseText: d.verseText as string | undefined,
            overlayMode: (d.overlayMode as "fullscreen" | "lower-third") ?? "fullscreen",
            theme: d.theme as string | undefined,
            bibleThemeSettings: effectiveSelectedBibleTheme.settings as unknown as Record<string, unknown>,
            liveOverrides: fullscreenLiveOverrides as Record<string, unknown> | null,
            backgroundOnly: Boolean(d.backgroundOnly),
            compareEnabled: Boolean(d.compareEnabled),
            compareLayout: (d.compareLayout as CompareLayout | undefined) ?? compareLayout,
            compare: d.compare as Record<string, unknown> | undefined,
          };
          ensureObsConnected()
            .then(() => dockObsClient.pushBible(pushData))
            .catch((err) => {
              console.warn("[DockBibleTab] Auto-push on quick settings change failed:", err);
            });
        }
      }
    }, 100);
  }, [
    activeColumnIndex,
    activeFullscreenQuickThemeSettings,
    activeTranslation,
    compareLayout,
    effectiveSelectedBibleTheme.settings,
    fullscreenLiveOverrides,
    overlayMode,
    selectedBook,
    selectedChapter,
    stageVerse,
  ]);

  // Push lower-third Bible to OBS whenever its own quick settings change.
  const prevLowerThirdFsSignature = useRef(
    JSON.stringify(effectiveSelectedLowerThirdTheme.settings),
  );
  useEffect(() => {
    const nextSignature = JSON.stringify(effectiveSelectedLowerThirdTheme.settings);
    const changed = prevLowerThirdFsSignature.current !== nextSignature;
    prevLowerThirdFsSignature.current = nextSignature;
    if (!changed) return;
    if (overlayMode !== "lower-third") return;
    if (suppressAutoStageRef.current) return;

    // Debounce OBS push (100ms Rule 8) — rapid slider changes should not spam OBS
    if (lowerThirdQuickSettingsDebounceRef.current !== null) {
      window.clearTimeout(lowerThirdQuickSettingsDebounceRef.current);
    }
    lowerThirdQuickSettingsDebounceRef.current = window.setTimeout(() => {
      lowerThirdQuickSettingsDebounceRef.current = null;
      const data = latestStagedRef.current;
      if (!data || data.type !== "bible") return;
      const d = data.data as Record<string, unknown> | undefined;
      if (!d) return;

      const verseRange = (d.verseRange as string) ?? String(d.verse ?? "1");
      const refLabel = (d.referenceLabel as string) ?? `${d.book ?? ""} ${d.chapter ?? ""}:${verseRange}`;

      const payload = {
        verseText: d.verseText as string | undefined,
        referenceText: refLabel,
        verseRange,
        bibleThemeSettings: effectiveSelectedLowerThirdTheme.settings as unknown as Record<string, unknown>,
        liveOverrides: null,
        themeId: selectedLowerThirdTheme.id,
        compareEnabled: Boolean(d.compareEnabled),
        compareLayout: (d.compareLayout as CompareLayout | undefined) ?? compareLayout,
        compare: d.compare as Record<string, unknown> | null | undefined,
        translationA: d.translationA as string | undefined,
        translationB: d.translationB as string | undefined,
      };

      ensureObsConnected()
        .then(() => dockObsClient.pushBibleOverlayFast(payload))
        .catch((err) => {
          console.warn("[DockBibleTab] Lower-third auto-push on quick settings change failed:", err);
        });
    }, 100);
  }, [
    compareLayout,
    effectiveSelectedLowerThirdTheme.settings,
    selectedLowerThirdTheme.id,
  ]);

  const prevVerseLineCount = useRef(verseLineCount);
  useEffect(() => {
    const changed = prevVerseLineCount.current !== verseLineCount;
    prevVerseLineCount.current = verseLineCount;
    if (!changed) return;

    if (suppressNextVerseLineRestageRef.current) {
      suppressNextVerseLineRestageRef.current = false;
      return;
    }
    if (suppressAutoStageRef.current) return;

    const verse = selectedVerseRef.current;
    if (!selectedBook || !selectedChapter || !verse) return;

    void stageVerse(selectedBook, selectedChapter, verse, {
      translation: activeTranslation,
      columnIndex: activeColumnIndex,
    });
  }, [
    activeColumnIndex,
    activeTranslation,
    selectedBook,
    selectedChapter,
    stageVerse,
    verseLineCount,
  ]);

  useEffect(() => {
    if (!initialVoiceBible) return;
    setVoiceBible(initialVoiceBible);
  }, [initialVoiceBible]);

  // Keep latestStagedRef in sync so background-push effects can read staged
  // data without adding `staged` to their dependency arrays (which would
  // cause extra re-renders or loops).
  useEffect(() => {
    latestStagedRef.current = staged;
  }, [compareLayout, staged]);

  useEffect(() => {
    if (staged === previousStagedRef.current) return;
    previousStagedRef.current = staged;
    if (!staged || staged.type !== "bible") return;
    scheduleAutoStageResume();
    const data = (staged.data ?? null) as Record<string, unknown> | null;
    if (!data) return;

    const book = typeof data.book === "string" ? data.book : null;
    const chapter = typeof data.chapter === "number" ? data.chapter : null;
    const verse = typeof data.verse === "number" ? data.verse : null;
    const translation = typeof data.translation === "string" ? data.translation.toUpperCase() : null;
    const stagedColumnIndex =
      typeof data.columnIndex === "number"
        ? Math.min(Math.max(data.columnIndex, 0), QUICK_SELECT_VERSION_COUNT - 1)
        : null;
    const lineCount = typeof data.lineCount === "number" ? clampVerseLineCount(data.lineCount) : null;
    const shouldReveal = data.reveal !== false;
    const nextOverlayMode =
      data.overlayMode === "fullscreen" || data.overlayMode === "lower-third"
        ? (data.overlayMode as OverlayMode)
        : null;

    const currentVerse = selectedVerseRef.current;
    const isSameFocusedReference =
      book === selectedBook &&
      chapter === selectedChapter &&
      verse === currentVerse;

    if (book && BOOK_CHAPTERS[book] && book !== selectedBook) {
      setSelectedBook(book);
    }
    if (chapter && chapter !== selectedChapter) {
      setSelectedChapter(chapter);
    }
    if (verse && verse !== currentVerse) {
      setSelectedVerse(verse);
      selectedVerseRef.current = verse;
    }
    if (verse && !isSameFocusedReference) {
      pendingScrollVerseRef.current = shouldReveal ? verse : null;
    }
    if (translation) {
      setColumnTranslations((current) => {
        const targetIndex = stagedColumnIndex ?? activeColumnIndex;
        if ((current[targetIndex] ?? "").toUpperCase() === translation) {
          return current;
        }
        const next = [...current];
        next[targetIndex] = translation;
        return next;
      });
    }
    if (lineCount) {
      suppressNextVerseLineRestageRef.current = true;
      setVerseLineCount(lineCount);
    }
    if (nextOverlayMode) {
      setOverlayMode(nextOverlayMode);
    }
  }, [scheduleAutoStageResume, staged]);

  const applyVoiceResult = useCallback(
    (result: VoiceBibleResult | null) => {
      if (!result) return;

      if (result.action === "set-translation" && result.translation) {
        setColumnTranslations((current) => {
          const next = [...current];
          next[activeColumnIndex] = result.translation!.toUpperCase();
          return next;
        });
        return;
      }

      if (result.action === "set-chapter" && result.book && result.chapter) {
        setSelectedBook(result.book);
        setSelectedChapter(result.chapter);
        setSelectedVerse(null);
        setSearchQuery("");
        setShowDropdown(false);
        pendingScrollVerseRef.current = null;
        return;
      }

      if (
        result.action === "stage-verse" &&
        result.book &&
        result.chapter &&
        result.verse
      ) {
        if (result.translation && result.translation !== activeTranslation) {
          setColumnTranslations((current) => {
            const next = [...current];
            next[activeColumnIndex] = result.translation!.toUpperCase();
            return next;
          });
        }
        // Fire-and-forget — UI updates via onStage inside stageVerse (Rule 1)
        void stageVerse(result.book, result.chapter, result.verse, {
          translation: result.translation ?? activeTranslation,
          columnIndex: activeColumnIndex,
        });
      }
    },
    [activeColumnIndex, activeTranslation, stageVerse],
  );

  useEffect(() => {
    const unsub = dockClient.onState((msg: DockStateMessage) => {
      if (msg.type === "state:update") {
        const payload = msg.payload as Record<string, unknown>;
        if (payload.voiceBible) {
          if (voiceBridgeTimeoutRef.current) {
            clearTimeout(voiceBridgeTimeoutRef.current);
            voiceBridgeTimeoutRef.current = null;
          }
          voiceFallbackReadyRef.current = true;
          lastVoiceEventTimestampRef.current = Math.max(lastVoiceEventTimestampRef.current, msg.timestamp);
          lastVoiceResultKeyRef.current = getVoiceBibleResultKey(
            (payload.voiceBible as VoiceBibleSnapshot).lastResult,
          );
          setVoiceBible(payload.voiceBible as VoiceBibleSnapshot);
        }
        return;
      }

      if (msg.type === "state:voice-bible-status") {
        if (voiceBridgeTimeoutRef.current) {
          clearTimeout(voiceBridgeTimeoutRef.current);
          voiceBridgeTimeoutRef.current = null;
        }
        voiceFallbackReadyRef.current = true;
        lastVoiceEventTimestampRef.current = Math.max(lastVoiceEventTimestampRef.current, msg.timestamp);
        lastVoiceResultKeyRef.current = getVoiceBibleResultKey(
          (msg.payload as VoiceBibleSnapshot).lastResult,
        );
        setVoiceBible(msg.payload as VoiceBibleSnapshot);
        return;
      }

      if (msg.type === "state:voice-bible-candidates") {
        if (voiceBridgeTimeoutRef.current) {
          clearTimeout(voiceBridgeTimeoutRef.current);
          voiceBridgeTimeoutRef.current = null;
        }
        voiceFallbackReadyRef.current = true;
        lastVoiceEventTimestampRef.current = Math.max(lastVoiceEventTimestampRef.current, msg.timestamp);
        const payload = msg.payload as {
          transcript?: string;
          detail?: string;
          candidates?: VoiceBibleCandidate[];
        };
        setVoiceBible((current) => ({
          ...current,
          transcript: payload.transcript ?? current.transcript,
          detail: payload.detail ?? current.detail,
          candidates: payload.candidates ?? [],
        }));
        return;
      }

      if (msg.type === "state:voice-bible-result") {
        if (voiceBridgeTimeoutRef.current) {
          clearTimeout(voiceBridgeTimeoutRef.current);
          voiceBridgeTimeoutRef.current = null;
        }
        voiceFallbackReadyRef.current = true;
        lastVoiceEventTimestampRef.current = Math.max(lastVoiceEventTimestampRef.current, msg.timestamp);
        const payload = (msg.payload ?? null) as VoiceBibleResult | null;
        lastVoiceResultKeyRef.current = getVoiceBibleResultKey(payload);
        void applyVoiceResult(payload);
      }
    });

    return unsub;
  }, [applyVoiceResult]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    let timeoutId: number | null = null;
    let consecutiveMisses = 0;

    const pollVoiceState = async () => {
      if (cancelled) return;
      const fallback = await loadVoiceBibleDockState();
      if (!fallback || cancelled) {
        consecutiveMisses++;
        // Back off: after 3 misses, slow to 30s. Reset on next success.
        const nextDelay = consecutiveMisses >= 3
          ? 30_000
          : appConnected ? 5000 : 3000;
        timeoutId = window.setTimeout(() => { void pollVoiceState(); }, nextDelay);
        return;
      }

      consecutiveMisses = 0;
      if (fallback.updatedAt <= lastVoiceEventTimestampRef.current) {
        timeoutId = window.setTimeout(() => { void pollVoiceState(); }, appConnected ? 5000 : 3000);
        return;
      }

      lastVoiceEventTimestampRef.current = fallback.updatedAt;
      if (voiceBridgeTimeoutRef.current) {
        clearTimeout(voiceBridgeTimeoutRef.current);
        voiceBridgeTimeoutRef.current = null;
      }

      const resultKey = getVoiceBibleResultKey(fallback.snapshot.lastResult);
      const shouldSkipInitialReplay =
        !voiceFallbackReadyRef.current &&
        !voiceHeldRef.current &&
        voiceBible.status === "idle";

      voiceFallbackReadyRef.current = true;
      setVoiceBible(fallback.snapshot);

      if (shouldSkipInitialReplay) {
        lastVoiceResultKeyRef.current = resultKey;
      } else if (resultKey && resultKey !== lastVoiceResultKeyRef.current) {
        lastVoiceResultKeyRef.current = resultKey;
        await applyVoiceResult(fallback.snapshot.lastResult ?? null);
      } else if (!resultKey) {
        lastVoiceResultKeyRef.current = "";
      }

      timeoutId = window.setTimeout(() => { void pollVoiceState(); }, appConnected ? 5000 : 3000);
    };

    void pollVoiceState();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [appConnected, applyVoiceResult, isActive, voiceBible.status]);

  // ── Listen for LM Dock navigate commands via raw BroadcastChannel ──
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("ocs-dock-commands");
      channel.onmessage = (ev) => {
        const cmd = ev.data as { type?: string; payload?: unknown } | null;
        if (cmd?.type === "lm:navigate") {
          const payload = cmd.payload as {
            book?: string;
            chapter?: number;
            verse?: number;
            translation?: string;
          };
          if (payload.book && payload.chapter) {
            focusReference(payload.book, payload.chapter, payload.verse ?? null);
            void stageVerse(payload.book, payload.chapter, payload.verse ?? 1, {
              translation: payload.translation,
            });
          }
        }
      };
    } catch { /* BroadcastChannel not available */ }
    return () => { channel?.close(); };
  }, [focusReference, stageVerse]);

  useEffect(() => () => {
    voiceHeldRef.current = false;
    if (voiceBridgeTimeoutRef.current) {
      clearTimeout(voiceBridgeTimeoutRef.current);
      voiceBridgeTimeoutRef.current = null;
    }
    const command = createVoiceBibleDockCommand("voice-bible:cancel");
    dockClient.sendCommand(command);
    void postVoiceBibleDockCommand(command).catch(() => { });
  }, []);

  // ── Smart search results ──
  const referenceResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    // 1. Try spoken/STT normalization first (e.g., "first samuel 17 45" → "1 Samuel 17:45")
    const normalized = normalizeScriptureReference(searchQuery);
    if (normalized) {
      const parsed = parseBibleSearch(normalized);
      if (parsed.length > 0) {
        return parsed.map((result) => ({
          ...result,
          kind: "reference" as const,
        }));
      }
    }

    // 2. Fall back to standard parser (e.g., "gen1vs1", "jn3:16")
    return parseBibleSearch(searchQuery).map((result) => ({
      ...result,
      kind: "reference" as const,
    }));
  }, [searchQuery]);

  // ── Concept-based search (e.g., "love", "faith", "hope") ──
  const conceptResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    if (isReferenceLikeBibleQuery(searchQuery)) return [];

    const conceptRefs = getConceptVerses(searchQuery);
    if (conceptRefs.length === 0) return [];

    const results: Array<{ kind: "concept"; book: string; chapter: number; verse: number; label: string; snippet: string; text: string; query: string }> = [];
    const seen = new Set<string>();

    for (const ref of conceptRefs.slice(0, 8)) {
      const match = ref.match(/^(.+)\s+(\d+):(\d+)$/);
      if (!match) continue;
      const [, book, chStr, vsStr] = match;
      const key = `${book} ${chStr}:${vsStr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        kind: "concept",
        book,
        chapter: parseInt(chStr, 10),
        verse: parseInt(vsStr, 10),
        label: `${book} ${chStr}:${vsStr}`,
        snippet: "",
        text: "",
        query: searchQuery,
      });
    }

    return results;
  }, [searchQuery]);

  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (!trimmed || trimmed.length < MIN_DOCK_KEYWORD_SEARCH_LENGTH) {
      setKeywordResults([]);
      setIsKeywordSearching(false);
      return;
    }

    if (isReferenceLikeBibleQuery(trimmed) && referenceResults.length > 0) {
      setKeywordResults([]);
      setIsKeywordSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsKeywordSearching(true);
      try {
        const { searchBible } = await import("../../bible/bibleData");
        const matches = await searchBible(trimmed, activeTranslation, DOCK_KEYWORD_SEARCH_LIMIT);
        if (!cancelled) {
          setKeywordResults(matches);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[DockBibleTab] Keyword search failed:", err);
          setKeywordResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsKeywordSearching(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTranslation, referenceResults.length, searchQuery]);

  const searchResults = useMemo<DockBibleSearchOption[]>(() => {
    const keywordMatches = keywordResults.map((result) => ({
      kind: "keyword" as const,
      book: result.book,
      chapter: result.chapter,
      verse: result.verse,
      label: `${result.book} ${result.chapter}:${result.verse} — ${activeTranslation}`,
      snippet: result.snippet,
      text: result.text,
      query: searchQuery,
    }));

    // Priority: reference > keyword > concept
    if (referenceResults.length > 0) {
      return keywordMatches.length > 0
        ? [...referenceResults, ...keywordMatches]
        : referenceResults;
    }

    if (keywordMatches.length > 0) {
      return conceptResults.length > 0
        ? [...keywordMatches, ...conceptResults]
        : keywordMatches;
    }

    return conceptResults;
  }, [activeTranslation, keywordResults, referenceResults, conceptResults, searchQuery]);

  // ── Close dropdown when clicking outside ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setShowRecentSearches(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Search change handler ──
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setShowDropdown(val.trim().length > 0);
    setShowRecentSearches(val.trim().length === 0);
    setActiveIdx(-1);
  }, []);

  // ── Pick a search result ──
  const handlePickResult = useCallback(
    async (result: DockBibleSearchOption) => {
      setRecentSearches(pushRecentBibleSearch(result.label));
      setSearchQuery("");
      setShowDropdown(false);
      setShowRecentSearches(false);
      setActiveIdx(-1);

      if (result.kind === "keyword" || result.kind === "concept") {
        focusReference(result.book, result.chapter, result.verse);
        setKeywordActionResult(result);
        return;
      } else if (result.chapter !== null && result.verse !== null) {
        const impliedLineCount = clampVerseLineCount(
          result.endVerse && result.endVerse > result.verse
            ? result.endVerse - result.verse + 1
            : 1,
        );
        suppressNextVerseLineRestageRef.current = true;
        setVerseLineCount(impliedLineCount);
        focusReference(result.book, result.chapter, result.verse);
        await stageVerse(result.book, result.chapter, result.verse, {
          lineCount: impliedLineCount,
          rangeEndVerse: result.endVerse ?? null,
          translation: activeTranslation,
          columnIndex: activeColumnIndex,
        });
      } else if (result.chapter !== null) {
        focusReference(result.book, result.chapter, 1);
      } else {
        setSelectedBook(result.book);
        setSelectedChapter(1);
        setSelectedVerse(null);
        pendingScrollVerseRef.current = null;
      }
    },
    [activeColumnIndex, activeTranslation, focusReference, stageVerse]
  );

  const applyRecentBibleSearch = useCallback(
    (query: string) => {
      const recentResult = parseBibleSearch(query)[0];
      setSearchQuery("");
      setShowRecentSearches(false);
      setShowDropdown(false);
      setActiveIdx(-1);

      if (recentResult) {
        void handlePickResult({ ...recentResult, kind: "reference" });
      }
    },
    [handlePickResult],
  );

  // ── Keyboard navigation ──
  const handleClearVerse = useCallback(() => {
    setSelectedVerse(null);
    setVerseText(null);
    setActionError("");
    pendingScrollVerseRef.current = null;
    onStage(null);
    ensureObsConnected().then(() => dockObsClient.clearBible()).catch((err) =>
      console.warn("[DockBibleTab] clearBible failed:", err)
    );
  }, [onStage]);

  const handleClearBible = useCallback(() => {
    setActionError("");
    // Fire-and-forget OBS clear — UI is already cleared via onStage(null) (Rule 1)
    ensureObsConnected()
      .then(() => dockObsClient.clearBible())
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
        if (!isTransient) {
          console.warn("[DockBibleTab] clearBible failed:", err);
          setActionError(message);
        }
      });
  }, []);

  const handleTranslationAChange = useCallback((newTranslation: string) => {
    if (newTranslation === translationB) {
      setTranslationB(translationA);
    }
    setTranslationA(newTranslation);
  }, [translationA, translationB]);

  const handleTranslationBChange = useCallback((newTranslation: string) => {
    if (newTranslation === translationA) {
      setTranslationA(translationB);
    }
    setTranslationB(newTranslation);
  }, [translationA, translationB]);

  const openThemeSettings = useCallback((tab: ThemeSettingsTab = "text") => {
    setThemeSettingsInitialTab(tab);
    setShowComparePopover(false);
    setShowThemeSettings(true);
  }, []);

  const handleSendCompareToObs = useCallback(async () => {
    if (!compareEnabled || !selectedBook || !selectedChapter || !selectedVerse) return;
    setActionError("");
    try {
      const lineCount = clampVerseLineCount(verseLineCount);
      const [selA, selB] = await Promise.all([
        resolveVerseSelection(selectedBook, selectedChapter, selectedVerse, translationA, lineCount),
        resolveVerseSelection(selectedBook, selectedChapter, selectedVerse, translationB, lineCount),
      ]);
      const refA = `${selectedBook} ${selectedChapter}:${selA.verseRange}`;
      const refB = `${selectedBook} ${selectedChapter}:${selB.verseRange}`;
      const theme = overlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id;
      const stageData = {
        book: selectedBook,
        chapter: selectedChapter,
        verse: selectedVerse,
        verseEnd: selA.verseEnd,
        verseRange: selA.verseRange,
        referenceLabel: refA,
        lineCount,
        translation: translationA,
        translationA,
        translationB,
        compareEnabled: true,
        compareLayout,
        verseText: selA.text,
        overlayMode,
        theme,
        bibleThemeSettings: (
          overlayMode === "fullscreen"
            ? effectiveSelectedBibleTheme.settings
            : effectiveSelectedLowerThirdTheme.settings
        ) as unknown as Record<string, unknown>,
        liveOverrides:
          overlayMode === "fullscreen"
            ? (fullscreenLiveOverrides as Record<string, unknown> | null)
            : null,
        backgroundOnly: bibleBgOnly,
        reveal: true,
        _dockLive: true,
        compare: {
          enabled: true,
          layout: compareLayout,
          columns: [
            {
              book: selectedBook,
              chapter: selectedChapter,
              verse: selectedVerse,
              verseEnd: selA.verseEnd,
              verseRange: selA.verseRange,
              referenceLabel: refA,
              translation: translationA,
              verseText: selA.text,
            },
            {
              book: selectedBook,
              chapter: selectedChapter,
              verse: selectedVerse,
              verseEnd: selB.verseEnd,
              verseRange: selB.verseRange,
              referenceLabel: refB,
              translation: translationB,
              verseText: selB.text,
            },
          ],
        },
      };
      onStage({
        type: "bible",
        label: `${translationA} vs ${translationB}`,
        subtitle: selA.text,
        data: stageData,
      });
      ensureObsConnected()
        .then(() => dockObsClient.pushBible(stageData as Parameters<typeof dockObsClient.pushBible>[0]))
        .then(() => trackBiblePresent(selA.text))
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
          if (!isTransient) {
            console.warn("[DockBibleTab] Compare push to OBS failed:", err);
            setActionError(message);
          } else {
            console.warn("[DockBibleTab] Compare push to OBS failed (transient):", message);
          }
        });
      setShowComparePopover(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[DockBibleTab] Compare resolve failed:", err);
      setActionError(message);
    }
  }, [
    selectedBook,
    selectedChapter,
    selectedVerse,
    translationA,
    translationB,
    verseLineCount,
    resolveVerseSelection,
    overlayMode,
    effectiveSelectedBibleTheme.id,
    effectiveSelectedBibleTheme.settings,
    effectiveSelectedLowerThirdTheme.settings,
    selectedLowerThirdTheme.id,
    fullscreenLiveOverrides,
    bibleBgOnly,
    onStage,
  ]);
  void handleSendCompareToObs;

  const handleToggleBibleBgOnly = useCallback(async () => {
    setBibleBgOnly((prev) => {
      const next = !prev;
      if (staged?.type === "bible") {
        const data = staged.data as Record<string, unknown> | undefined;
        if (data) {
          ensureObsConnected().then(() => dockObsClient.pushBible({
            book: (data.book as string) ?? "",
            chapter: (data.chapter as number) ?? 1,
            verse: (data.verse as number) ?? 1,
            verseEnd: data.verseEnd as number | undefined,
            verseRange: data.verseRange as string | undefined,
            referenceLabel: data.referenceLabel as string | undefined,
            translation: (data.translation as string) ?? "KJV",
            translationA: data.translationA as string | undefined,
            translationB: data.translationB as string | undefined,
            verseText: data.verseText as string | undefined,
            overlayMode: (data.overlayMode as "fullscreen" | "lower-third") ?? "fullscreen",
            theme: data.theme as string | undefined,
            bibleThemeSettings: data.bibleThemeSettings as Record<string, unknown> | null | undefined,
            liveOverrides: data.liveOverrides as Record<string, unknown> | null | undefined,
            backgroundOnly: next,
            compareEnabled: Boolean(data.compareEnabled),
            compareLayout: (data.compareLayout as CompareLayout | undefined) ?? compareLayout,
            compare: data.compare as Record<string, unknown> | undefined,
          })).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
            if (!isTransient) {
              console.warn("[DockBibleTab] toggleBgOnly failed:", err);
              setActionError(message);
            }
          });
        }
      }
      return next;
    });
  }, [staged]);

  const handleOverlayModeChange = useCallback((nextMode: OverlayMode) => {
    // Just update state — the overlayMode useEffect (line ~1623) detects the
    // change and re-pushes via goLiveVerse. Pushing here AND in the useEffect
    // causes triple-flicker (two redundant OBS pushes).
    setOverlayMode(nextMode);
  }, []);

  const handleToggleFavoritePassage = useCallback(async () => {
    if (!selectedPassageForFavorite) {
      return;
    }

    const reference = selectedPassageForFavorite.reference;
    const nextIsFavorite = !favoriteRefs.has(reference);
    setFavoriteRefs((current) => {
      const next = new Set(current);
      if (nextIsFavorite) {
        next.add(reference);
      } else {
        next.delete(reference);
      }
      return next;
    });

    try {
      if (nextIsFavorite) {
        await addFavorite(selectedPassageForFavorite);
      } else {
        await removeFavorite(reference);
      }
    } catch (error) {
      setFavoriteRefs((current) => {
        const next = new Set(current);
        if (nextIsFavorite) {
          next.delete(reference);
        } else {
          next.add(reference);
        }
        return next;
      });
      setActionError(error instanceof Error ? error.message : t("bible.unableToUpdateFavorites"));
    }
  }, [favoriteRefs, selectedPassageForFavorite]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget instanceof HTMLInputElement) {
          e.currentTarget.select();
        }
        return;
      }

      if (!showDropdown || searchResults.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const picked = searchResults[activeIdx >= 0 ? activeIdx : 0];
        if (picked) {
          void handlePickResult(picked);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (showDropdown) {
          setShowDropdown(false);
          return;
        }
        handleClearVerse();
      }
    },
    [showDropdown, searchResults, activeIdx, handleClearVerse, handlePickResult]
  );

  const handleVerseClick = useCallback(
    (v: number, columnIndex: number, version: string) => {
      if (!selectedBook || !selectedChapter) return;
      setSelectedVerse(v);
      selectedVerseRef.current = v;
      pendingScrollVerseRef.current = null;

      void goLiveVerse(selectedBook, selectedChapter, v, {
        translation: version,
        columnIndex,
        reveal: false,
      });
    },
    [selectedBook, selectedChapter, goLiveVerse],
  );

  const stopVerseActionEvent = useCallback((event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleVerseRowDelegated = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      const targetElement =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-verse-row]")
          : null;
      if (!targetElement) return;
      if (event.type === "keydown") {
        const ke = event as React.KeyboardEvent;
        if (ke.key !== "Enter" && ke.key !== " ") return;
        ke.preventDefault();
      }
      if (event.type === "click") {
        const ce = event as React.MouseEvent;
        if (ce.detail > 1) return;
      }
      const verseNum = Number(targetElement.dataset.verseRow);
      if (!verseNum) return;
      void handleVerseClick(verseNum, activeColumnIndex, activeTranslation);
    },
    [activeColumnIndex, activeTranslation, handleVerseClick],
  );

  const handleQuickVersionChange = useCallback((columnIndex: number, version: string) => {
    const nextValue = version.toUpperCase();
    setColumnTranslations((current) => {
      const next = [...current];
      next[columnIndex] = nextValue;
      return next;
    });
    setIsBookDropdownOpen(false);
    setIsChapterDropdownOpen(false);
    setIsVerseDropdownOpen(false);
  }, []);

  const handleBookSelect = useCallback((book: string) => {
    if (!BOOK_CHAPTERS[book]) return;
    setIsBookDropdownOpen(false);
    setIsChapterDropdownOpen(false);
    setIsVerseDropdownOpen(false);
    const nextChapter = Math.min(selectedChapter ?? 1, BOOK_CHAPTERS[book] ?? 1);
    setSelectedBook(book);
    setSelectedChapter(nextChapter);
    setSelectedVerse(null);
    setHighlightVerse(null);
    setActionError("");
    pendingScrollVerseRef.current = null;
  }, [selectedChapter]);
  const handleBookToggle = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!selectedBook) return;

    setIsChapterDropdownOpen(false);
    setIsVerseDropdownOpen(false);
    setIsBookDropdownOpen((current) => !current);
  }, [selectedBook]);
  const handleChapterToggle = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedBook || !selectedChapter) return;
    setIsBookDropdownOpen(false);
    setIsVerseDropdownOpen(false);
    setIsChapterDropdownOpen((current) => !current);
  }, [selectedBook, selectedChapter]);

  const handleChapterSelect = useCallback((chapter: number) => {
    if (!selectedBook) return;
    setIsBookDropdownOpen(false);
    setIsChapterDropdownOpen(false);
    setIsVerseDropdownOpen(false);
    if (chapter === selectedChapter) return;
    setSelectedChapter(chapter);
    setSelectedVerse(null);
    setHighlightVerse(null);
    setActionError("");
    pendingScrollVerseRef.current = null;
  }, [selectedBook, selectedChapter]);

  const handleVerseToggle = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedBook || !selectedChapter || verseCount <= 0) return;
    setIsBookDropdownOpen(false);
    setIsChapterDropdownOpen(false);
    setIsVerseDropdownOpen((current) => !current);
  }, [selectedBook, selectedChapter, verseCount]);

  const handleVerseSelect = useCallback((verse: number) => {
    if (!selectedBook || !selectedChapter) return;
    setIsBookDropdownOpen(false);
    setIsChapterDropdownOpen(false);
    setIsVerseDropdownOpen(false);
    setSelectedVerse(verse);
    setHighlightVerse(verse);
    setActionError("");
    pendingScrollVerseRef.current = verse;
    void stageVerse(selectedBook, selectedChapter, verse, {
      translation: activeTranslation,
      columnIndex: activeColumnIndex,
    });
  }, [activeColumnIndex, activeTranslation, selectedBook, selectedChapter, stageVerse]);

  const handleSelectFullscreenTheme = useCallback((theme: BibleTheme) => {
    setSelectedBibleTheme(theme);
    selectedBibleThemeRef.current = theme;
    setOverlayMode("fullscreen");
  }, []);

  const handleSelectLowerThirdTheme = useCallback((theme: BibleTheme) => {
    setSelectedLowerThirdTheme(theme);
    selectedLowerThirdThemeRef.current = theme;
    setOverlayMode("lower-third");
  }, []);

  // Each mode keeps its own selected theme so switching to lower-third does
  // not accidentally keep reusing a fullscreen-only theme.
  const activeThemePickerProps =
    overlayMode === "fullscreen"
      ? {
        selectedThemeId: selectedBibleTheme.id,
        onSelect: handleSelectFullscreenTheme,
        label: t("bible.fullscreenTheme"),
        templateType: "fullscreen" as const,
      }
      : {
        selectedThemeId: selectedLowerThirdTheme.id,
        onSelect: handleSelectLowerThirdTheme,
        label: t("bible.lowerThirdTheme"),
        templateType: "lower-third" as const,
      };
  const resolveThemeQuickSettings = useCallback((theme: BibleTheme): DockFullscreenQuickThemeSettings => {
    const variant = overlayMode === "lower-third"
      ? theme.variants?.lowerThird
      : theme.variants?.fullscreen;
    const themeSettings = variant?.settings ?? theme.settings;
    return overlayMode === "fullscreen"
      ? extractFullscreenQuickThemeSettings(themeSettings, "theme")
      : buildDefaultLowerThirdQuickThemeSettings(themeSettings, "theme");
  }, [overlayMode]);
  const navigateVerse = useCallback(
    async (delta: 1 | -1) => {
      if (!selectedBook || !selectedChapter) return;

      let nextChapter = selectedChapter;
      let nextVerse = selectedVerse ?? 1;
      let nextVerseCount = verseCount;

      if (delta > 0) {
        if (nextVerse < verseCount) {
          nextVerse += 1;
        } else {
          const maxChapter = BOOK_CHAPTERS[selectedBook] ?? selectedChapter;
          if (selectedChapter >= maxChapter) return;
          nextChapter = selectedChapter + 1;
          try {
            const { getVerseCount } = await import("../../bible/bibleData");
            nextVerseCount = await getVerseCount(selectedBook, nextChapter, activeTranslation) || 30;
          } catch {
            nextVerseCount = 30;
          }
          nextVerse = 1;
        }
      } else if (nextVerse > 1) {
        nextVerse -= 1;
      } else {
        if (selectedChapter <= 1) return;
        nextChapter = selectedChapter - 1;
        try {
          const { getVerseCount } = await import("../../bible/bibleData");
          nextVerseCount = await getVerseCount(selectedBook, nextChapter, activeTranslation) || 30;
        } catch {
          nextVerseCount = 30;
        }
        nextVerse = nextVerseCount;
      }

      if (nextChapter !== selectedChapter) {
        setSelectedChapter(nextChapter);
        setVerseCount(nextVerseCount);
      }

      setSelectedVerse(nextVerse);
      selectedVerseRef.current = nextVerse;

      await goLiveVerse(selectedBook, nextChapter, nextVerse, {
        translation: activeTranslation,
        columnIndex: activeColumnIndex,
      });
    },
    [
      activeColumnIndex,
      activeTranslation,
      goLiveVerse,
      selectedBook,
      selectedChapter,
      selectedVerse,
      verseCount,
    ],
  );

  const sendSelectedVerseToShow = useCallback(async () => {
    if (!selectedBook || !selectedChapter || !selectedVerse) return;
    if (!(await requireEntitlement("bibleVersions", 0))) return;
    await stageVerse(selectedBook, selectedChapter, selectedVerse, {
      translation: activeTranslation,
      columnIndex: activeColumnIndex,
      reveal: false,
    });
  }, [activeColumnIndex, activeTranslation, selectedBook, selectedChapter, selectedVerse, stageVerse]);

  const handleGoToChapter = useCallback(() => {
    if (!selectedBook || !selectedChapter) return;
    setSelectedVerse(1);
    pendingScrollVerseRef.current = 1;
    window.setTimeout(() => {
      const verseRow = verseGridRef.current?.querySelector<HTMLElement>(
        `[data-verse-row="1"]`,
      );
      if (verseRow) {
        const container = verseGridRef.current;
        if (container) {
          const verseRect = verseRow.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const targetScrollTop = container.scrollTop + (verseRect.top - containerRect.top) - containerRect.height * 0.1;
          container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
        }
      }
      pendingScrollVerseRef.current = null;
    }, 150);
  }, [selectedBook, selectedChapter]);

  useEffect(() => {
    const pendingVerseToReveal = pendingScrollVerseRef.current;
    const verseToReveal = pendingVerseToReveal ?? selectedVerse;
    if (verseToReveal === null) return;

    const timer = window.setTimeout(() => {
      const verseRow = verseGridRef.current?.querySelector<HTMLElement>(
        `[data-verse-row="${verseToReveal}"]`,
      );
      if (verseRow) {
        const container = verseGridRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const verseRect = verseRow.getBoundingClientRect();
          const containerTop = containerRect.top + container.scrollTop;
          const verseTop = verseRect.top + container.scrollTop;
          const verseHeight = verseRect.height;
          const verseCenter = verseTop + verseHeight / 2;
          const containerCenter = containerTop + containerRect.height * 0.4;

          const tolerance = containerRect.height * 0.15;
          const isNearTarget = Math.abs(verseCenter - containerCenter) < tolerance;

          if (!isNearTarget) {
            const targetScrollTop = container.scrollTop + (verseCenter - containerCenter);
            container.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: "smooth",
            });
          }
        }
      }
      setHighlightVerse(verseToReveal);
      pendingScrollVerseRef.current = null;
    }, 150);

    const highlightClear = window.setTimeout(() => {
      setHighlightVerse((current) => (current === verseToReveal ? null : current));
    }, 1800);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(highlightClear);
    };
  }, [chapterPassages, selectedVerse]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement = target instanceof Element ? target : null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Escape") {
        if (targetElement?.closest(".dtb-modal")) return;
        event.preventDefault();
        setShowDropdown(false);
        setIsVerseDropdownOpen(false);
        handleClearVerse();
        return;
      }

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (!selectedBook || !selectedChapter) return;

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        void navigateVerse(1);
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        void navigateVerse(-1);
      } else if (event.key === "Enter" && selectedVerse !== null) {
        event.preventDefault();
        void sendSelectedVerseToShow();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClearVerse, navigateVerse, selectedBook, selectedChapter, selectedVerse, sendSelectedVerseToShow]);

  const currentChapterLabel =
    selectedBook && selectedChapter ? `${selectedBook} ${selectedChapter}` : t("bible.defaultTitle");
  const chapterCount = selectedBook ? BOOK_CHAPTERS[selectedBook] ?? 0 : 0;
  const activePassage = chapterPassages[activeColumnIndex] ?? null;
  const activeChapterError = chapterErrors[activeColumnIndex] ?? "";
  const comparePassageA = comparePassages.translationA;
  const comparePassageB = comparePassages.translationB;
  const compareVerseRows = compareEnabled
    ? (comparePassageA?.verses ?? activePassage?.verses ?? [])
    : (activePassage?.verses ?? []);
  const readerLoading = compareEnabled ? compareChapterLoading : chapterLoading;
  const readerError = compareEnabled
    ? (compareChapterErrors.find((message) => Boolean(message)) ?? "")
    : activeChapterError;
  const hasReaderVerses = compareVerseRows.length > 0;
  const compareDisplayLabel = compareEnabled
    ? `${translationA} vs ${translationB}`
    : activeTranslation;
  const currentVerseNumber = selectedVerse ?? activePassage?.verses[0]?.verse ?? null;
  const currentReferenceLabel = selectedBook && selectedChapter
    ? `${selectedBook} ${selectedChapter}${currentVerseNumber ? `:${currentVerseNumber}` : ""}${verseLineCount > 1 && currentVerseNumber
      ? `–${Math.min(currentVerseNumber + verseLineCount - 1, verseCount)}`
      : ""
    }`
    : t("bible.defaultTitle");
  const _selectedReferenceLabel = selectedPassageForFavorite?.reference
    ?? (selectedBook && selectedChapter && selectedVerse
      ? `${selectedBook} ${selectedChapter}:${selectedVerse}`
      : null);
  void _selectedReferenceLabel;

  return (
    <BibleDockContainer
      ref={containerRef}
      isCompact={compactLayout}
      isTopbarExpanded={isTopbarExpanded}
      setIsTopbarExpanded={setIsTopbarExpanded}
      selectedBook={selectedBook}
      selectedChapter={selectedChapter}
      selectedVerse={selectedVerse}
      activeTranslation={activeTranslation}
      compareEnabled={compareEnabled}
      chapterCount={chapterCount}
      verseCount={verseCount}
      isBookDropdownOpen={isBookDropdownOpen}
      isChapterDropdownOpen={isChapterDropdownOpen}
      isVerseDropdownOpen={isVerseDropdownOpen}
      availableTranslations={availableTranslations}
      onBookToggle={handleBookToggle}
      onBookSelect={handleBookSelect}
      onChapterToggle={handleChapterToggle}
      onChapterSelect={handleChapterSelect}
      onVerseToggle={handleVerseToggle}
      onVerseSelect={handleVerseSelect}
      onVersionChange={(version) => handleQuickVersionChange(activeColumnIndex, version)}
      onOptionsClick={() => setShowOptionsModal(true)}
      onGoToChapter={handleGoToChapter}
      onTranslationsChanged={loadTranslations}
      abbreviateBook={abbreviateBibleBook}
      BOOK_CHAPTERS={BOOK_CHAPTERS}
      headerActions={
        <div className="dock-bible-compare-trigger" ref={comparePopoverRef}>
          <button
            type="button"
            className={`dock-bible-compare-trigger__btn${showComparePopover ? " dock-bible-compare-trigger__btn--active" : ""}`}
            onClick={() => setShowComparePopover((prev) => !prev)}
            title={t("dock.compare.toggle", "Compare Translations")}
          >
            <Icon name="swap_horiz" size={14} />
          </button>
          {showComparePopover && (
            <div className="dock-bible-compare-popover">
              <div className="dock-bible-compare-popover__header">{t("dock.compare.title", "Compare Translations")}</div>
              <div className="dock-bible-compare-popover__section">
                <div className="dock-bible-compare-popover__toggle-row">
                  <div className="dock-bible-compare-popover__toggle-copy">
                    <div className="dock-bible-compare-popover__label">{t("dock.compare.enable", "Enable Compare Translations")}</div>
                    <div className="dock-bible-compare-popover__hint">{t("dock.compare.enableHint", "Load two translations and keep the reader in compare mode.")}</div>
                  </div>
                  <button
                    type="button"
                    className={`dtb-toggle${compareEnabled ? " dtb-toggle--on" : ""}`}
                    onClick={() => handleCompareEnabledChange(!compareEnabled)}
                    role="switch"
                    aria-checked={compareEnabled}
                    aria-label={t("dock.compare.enable", "Enable Compare Translations")}
                    title={compareEnabled ? t("dock.compare.disableCompare", "Disable compare mode") : t("dock.compare.enableCompare", "Enable compare mode")}
                  >
                    <span className="dtb-toggle__knob" />
                  </button>
                </div>
              </div>
              <div className="dock-bible-compare-popover__section">
                <div className="dock-bible-compare-popover__label-row">
                  <div className="dock-bible-compare-popover__label">{t("dock.compare.layout", "Layout")}</div>
                  <button
                    type="button"
                    className="dock-bible-compare-popover__settings"
                    onClick={() => openThemeSettings("compare")}
                    disabled={!compareEnabled}
                    aria-label={t("dock.compare.openCompareSettings", "Open compare design settings")}
                    title={
                      compareEnabled
                        ? t("dock.compare.openCompareSettings", "Open compare design settings")
                        : t("dock.compare.enableCompareFirst", "Enable compare mode first")
                    }
                  >
                    <Icon name="settings" size={12} />
                  </button>
                </div>
                <select
                  className="dock-select dock-bible-compare-popover__select"
                  value={compareLayout}
                  onChange={(e) => setCompareLayout(e.target.value as CompareLayout)}
                  disabled={!compareEnabled}
                >
                  <option value="line-by-line">{t("dock.compare.lineByLine", "Line By Line")}</option>
                  <option value="side-by-side">{t("dock.compare.sideBySide", "Side By Side")}</option>
                </select>
              </div>
              <div className="dock-bible-compare-popover__row">
                <label className="dock-bible-compare-popover__label">{t("dock.compare.translationA", "Translation A")}</label>
                <select
                  className="dock-select dock-bible-compare-popover__select"
                  value={translationA}
                  onChange={(e) => handleTranslationAChange(e.target.value)}
                >
                  {availableTranslations.map((tr) => (
                    <option key={tr.value} value={tr.value}>{tr.label}</option>
                  ))}
                </select>
              </div>
              <div className="dock-bible-compare-popover__row">
                <label className="dock-bible-compare-popover__label">{t("dock.compare.translationB", "Translation B")}</label>
                <select
                  className="dock-select dock-bible-compare-popover__select"
                  value={translationB}
                  onChange={(e) => handleTranslationBChange(e.target.value)}
                >
                  {availableTranslations.map((tr) => (
                    <option key={tr.value} value={tr.value}>{tr.label}</option>
                  ))}
                </select>
              </div>
              <div className="dock-bible-compare-popover__row">

              </div>
            </div>
          )}
        </div>
      }
      searchSection={
        showSearchBar ? (
          <section className="dock-bible-search-bar">
            <div
              className="dock-search dock-search--smart dock-search--console"
              style={{ flex: 1, marginBottom: 0 }}
              ref={searchRef}
            >
              {/* <Icon name="search" size={14} className="dock-search__icon" /> */}
              <input
                className="dock-input dock_search__input"
                placeholder={t("bible.searchPlaceholder")}
                aria-label={t("bible.searchPlaceholder")}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => {
                  if (searchQuery.trim()) setShowDropdown(true);
                  else if (recentSearches.length > 0) setShowRecentSearches(true);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="dock-search__clear"
                  onClick={() => {
                    setSearchQuery("");
                    setShowDropdown(false);
                    setShowRecentSearches(recentSearches.length > 0);
                  }}
                  aria-label={t("bible.clearSearchShort")}
                  title={t("bible.clearSearchShort")}
                >
                  <Icon name="close" size={13} />
                </button>
              )}

              {showDropdown && searchResults.length > 0 && (
                <div className="dock-search-dropdown">
                  {searchResults.map((result, i) => (
                    <button
                      key={result.label + i}
                      className={`dock-search-dropdown__item${i === activeIdx ? " dock-search-dropdown__item--active" : ""}`}
                      onClick={() => void handlePickResult(result)}
                      onMouseEnter={() => setActiveIdx(i)}
                      title={t("common.search")}>
                      <Icon
                        name={
                          result.kind === "keyword"
                            ? "search"
                            : result.verse !== null
                              ? "format_quote"
                              : result.chapter !== null
                                ? "menu_book"
                                : "auto_stories"
                        }
                        size={14}
                        style={{ opacity: 0.5 }}
                      />
                      <span className="dock-search-dropdown__content">
                        <span className="dock-search-dropdown__label">{result.label}</span>
                        {result.kind === "keyword" && result.snippet ? (
                          <span className="dock-search-dropdown__snippet">
                            {renderHighlightedKeywordText(result.text, result.query)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {showRecentSearches && !searchQuery.trim() && recentSearches.length > 0 && (
                <div className="dock-search-dropdown dock-search-dropdown--recent">
                  <div className="dock-search-dropdown__heading">{t("bible.recentSearches")}</div>
                  {recentSearches.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className="dock-search-dropdown__item dock-search-dropdown__item--recent"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyRecentBibleSearch(item)}
                      title={t("common.search")}>
                      <Icon name="refresh" size={13} style={{ opacity: 0.5 }} />
                      <span className="dock-search-dropdown__content">
                        <span className="dock-search-dropdown__label">{item}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && searchQuery.trim() && searchResults.length === 0 && (
                <div className="dock-search-dropdown">
                  <div className="dock-search-dropdown__empty">
                    {isKeywordSearching
                      ? t("bible.searching")
                      : t("bible.noMatches", { query: searchQuery })}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null
      }
    >
      <section className="dock-console-panel dock-console-panel--workspace" data-toolbar-collapsed={toolbarCollapsed || undefined}>
        <div className="dock-bible-reader" ref={verseGridRef} onClick={handleVerseRowDelegated} onKeyDown={handleVerseRowDelegated}>
          {hasReaderVerses && (
            <div className="dock-bible-reader__ref-header">
              <div>
                <span className="dock-bible-reader__ref-header-label">{t("bible.reading")}</span>
                <button
                  type="button"
                  className={`dock-favorites-inline dock-bible-reader__ref-header-fav${isCurrentPassageFavorite ? " dock-bible-reader__ref-header-fav--active" : ""}`}
                  onClick={handleToggleFavoritePassage}
                  disabled={!selectedPassageForFavorite}
                  title={isCurrentPassageFavorite ? t("bible.favRemove") : t("bible.favAdd")}
                >
                  <Icon name={isCurrentPassageFavorite ? "star" : "star_border"} size={12} />
                </button>

              </div>
              <span className="dock-bible-reader__ref-header-reference">{currentReferenceLabel}</span>
              {compareEnabled ? (
                <span className="dock-bible-reader__ref-header-translation dock-bible-reader__ref-header-translation--compare">
                  {compareDisplayLabel}
                </span>
              ) : (
                <span className="dock-bible-reader__ref-header-translation">{activeTranslation}</span>
              )}
              <button
                type="button"
                className={` dock-favorites dock-bible-reader__ref-header-fav${isCurrentPassageFavorite ? " dock-bible-reader__ref-header-fav--active" : ""}`}
                onClick={handleToggleFavoritePassage}
                disabled={!selectedPassageForFavorite}
                title={isCurrentPassageFavorite ? t("bible.favRemove") : t("bible.favAdd")}
              >
                <Icon name={isCurrentPassageFavorite ? "star" : "star_border"} size={12} />
              </button>
            </div>
          )}
          {readerLoading && !hasReaderVerses && (
            <div className="dock-console-placeholder">{t("common.loading")} {currentChapterLabel}...</div>
          )}

          {readerLoading && readerError && !hasReaderVerses && (
            <div className="dock-action-error dock-action-error--console">
              <Icon name="warning" size={14} />
              <span style={{ flex: 1 }}>{readerError}</span>
            </div>
          )}

          {!readerLoading && !hasReaderVerses && !readerError && (
            <div className="dock-console-placeholder">
              {t("bible.noVersesAvailable")}
            </div>
          )}

          {compareVerseRows.map((verse) => {
            const verseA = comparePassageA?.verses.find((entry) => entry.verse === verse.verse) ?? verse;
            const verseB = comparePassageB?.verses.find((entry) => entry.verse === verse.verse) ?? verseA;
            const isSelected = selectedVerse === verse.verse;
            const isHighlighted = highlightVerse === verse.verse;
            const rowClassName = [
              "dock-bible-verse-row",
              compareEnabled ? "dock-bible-verse-row--compare" : "",
              isSelected ? "dock-bible-verse-row--selected" : "",
              isHighlighted ? "dock-bible-verse-row--highlighted" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={verse.verse}
                data-verse-row={verse.verse}
                className={rowClassName}
                onDoubleClick={stopVerseActionEvent}
                tabIndex={0}
                role="button"
                aria-current={isSelected ? "true" : undefined}
                aria-label={
                  compareEnabled
                    ? `${selectedBook} ${selectedChapter}:${verse.verse} ${translationA} ${verseA.text} ${translationB} ${verseB.text}`
                    : t("bible.verseAriaLabel", { verse: verse.verse, translation: activeTranslation, text: verse.text })
                }
                title={
                  compareEnabled
                    ? `${selectedBook} ${selectedChapter}:${verse.verse} — ${translationA} / ${translationB}`
                    : `${activeTranslation} ${selectedBook} ${selectedChapter}:${verse.verse} — Click to view in OBS`
                }
              >
                <div className="dock-bible-verse-row__num">{verse.verse}</div>
                {compareEnabled ? (
                  compareLayout === "side-by-side" ? (
                    <div className="dock-bible-compare-grid">
                      <div className="dock-bible-compare-card">
                        <span className="translation-badge">{translationA}</span>
                        <div className="dock-bible-compare-card__text">{verseA.text}</div>
                      </div>
                      <div className="dock-bible-compare-card">
                        <span className="translation-badge">{translationB}</span>
                        <div className="dock-bible-compare-card__text">{verseB.text}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="dock-bible-compare-stack">
                      <div className="dock-bible-compare-block">
                        <span className="translation-badge">{translationA}</span>
                        <div className="dock-bible-compare-block__text">{verseA.text}</div>
                      </div>
                      <div className="dock-bible-compare-block">
                        <span className="translation-badge">{translationB}</span>
                        <div className="dock-bible-compare-block__text">{verseB.text}</div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="dock-bible-verse-row__main">
                    <span className="dock-bible-verse-row__text">{verse.text}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {actionError && (
          <div className="dock-action-error dock-action-error--console">
            <Icon name="warning" size={14} />
            <span style={{ flex: 1 }}>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError("")}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
              title={t("common.close")}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        {/* ── Toolbar ── */}
        <DockBottomToolbar
          overlayMode={overlayMode}
          onModeChange={handleOverlayModeChange}
          displayMode={displayMode}
          onDisplayModeChange={handleDisplayModeChange}
          morphing={modeMorphing}
          clearLabel={t("common.clear")}
          onClear={handleClearBible}
          clearDisabled={false}
          collapsed={toolbarCollapsed}
          onCollapseChange={setToolbarCollapsed}
          compact={compactToolbar}
        >
          <button
            type="button"
            className={`dock-btm-toolbar__icon-btn${bibleBgOnly ? " dock-btm-toolbar__icon-btn--active" : ""}`}
            onClick={handleToggleBibleBgOnly}
            disabled={!staged || staged.type !== "bible" || overlayMode === "lower-third"}
            title={bibleBgOnly ? t("bible.showWithText") : t("bible.backgroundOnly")}
          >
            <Icon name="image" size={14} />
          </button>

          <div
            className={`dock-line-popover dock-line-popover--toolbar${showVerseLinePopover ? " is-open" : ""}`}
            ref={verseLinePopoverRef}
          >
            <button
              type="button"
              className={`dock-btm-toolbar__icon-btn${showVerseLinePopover ? " dock-btm-toolbar__icon-btn--active" : ""}`}
              onClick={() => setShowVerseLinePopover((current) => !current)}
              aria-haspopup="dialog"
              aria-expanded={showVerseLinePopover}
              title={t("bible.linesPerStage")}
            >
              <Icon name="text_fields" size={14} />
            </button>

            {showVerseLinePopover && (
              <div className="dock-line-popover__menu" role="dialog" aria-label={t("bible.lineCount")}>
                <div className="dock-line-popover__title">{t("bible.linesPerStage")}</div>
                <div className="dock-line-popover__grid dock-line-popover__grid--compact">
                  {Array.from({ length: MAX_VERSE_LINES }, (_, index) => index + 1).map((count) => (
                    <button
                      key={`verse-line-choice-${count}`}
                      type="button"
                      className={`dock-line-popover__option${verseLineCount === count ? " dock-line-popover__option--active" : ""}`}
                      onClick={() => {
                        setVerseLineCount(count);
                        setShowVerseLinePopover(false);
                      }}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="dock-btm-toolbar__icon-btn"
            onClick={() => openThemeSettings("text")}
            title={t("bible.quickEdits")}
          >
            <Icon name="edit" size={14} />
          </button>

        </DockBottomToolbar>

        {/* ── Footer actions ── */}

      </section>

      {/* ── Options modal ── */}
      {
        showOptionsModal && (
          <div className="dock-dialog-backdrop" role="presentation" onClick={() => setShowOptionsModal(false)}>
            <div
              className="dock-bible-options-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bible-options-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dock-dialog__header">
                <div>
                  <div className="dock-dialog__eyebrow">{t("bible.settings")}</div>
                  <h2 id="bible-options-title" className="dock-dialog__title">{t("bible.options")}</h2>
                </div>
                <button
                  type="button"
                  className="dock-dialog__close"
                  onClick={() => setShowOptionsModal(false)}
                  aria-label={t("bible.closeOptions")}
                  title={t("common.close")}>
                  <Icon name="close" size={14} />
                </button>
              </div>

              <div className="dock-dialog__body">
                {/* Overlay mode */}
                <div className="dock-bible-options__section">
                  <label className="dock-bible-options__label">{t("bible.overlayMode")}</label>
                  <div
                    className={`dock-console-segmented dock-console-segmented--compact${modeMorphing ? " dock-console-segmented--morphing" : ""}`}
                    role="group"
                    aria-label={t("bible.overlayMode")}
                  >
                    <button
                      type="button"
                      className={`dock-console-segmented__item${overlayMode === "fullscreen" ? " dock-console-segmented__item--active" : ""}`}
                      onClick={() => handleOverlayModeChange("fullscreen")}
                      aria-pressed={overlayMode === "fullscreen"}
                      title={t("bible.full")}>
                      <span>{t("bible.full")}</span>
                    </button>
                    <button
                      type="button"
                      className={`dock-console-segmented__item${overlayMode === "lower-third" ? " dock-console-segmented__item--active" : ""}`}
                      onClick={() => handleOverlayModeChange("lower-third")}
                      aria-pressed={overlayMode === "lower-third"}
                      title={t("bible.lt")}>
                      <span>{t("bible.lt")}</span>
                    </button>
                  </div>
                </div>

                {/* Theme settings */}
                <div className="dock-bible-options__section">
                  <label className="dock-bible-options__label">{t("bible.theme")}</label>
                  <button
                    type="button"
                    className="dock-btn dock-btn--ghost dock-btn--compact"
                    onClick={() => { setShowOptionsModal(false); openThemeSettings("text"); }}
                    style={{ width: "100%" }}
                    title={t("bible.openThemeSettings")}>
                    <Icon name="palette" size={14} />
                    {t("bible.openThemeSettings")}
                  </button>
                </div>

                {/* Lines per stage */}
                <div className="dock-bible-options__section">
                  <label className="dock-bible-options__label">{t("bible.linesPerStage")}</label>
                  <div className="dock-bible-options__line-grid">
                    {Array.from({ length: MAX_VERSE_LINES }, (_, index) => index + 1).map((count) => (
                      <button
                        key={`options-line-${count}`}
                        type="button"
                        className={`dock-bible-options__line-btn${verseLineCount === count ? " dock-bible-options__line-btn--active" : ""}`}
                        onClick={() => setVerseLineCount(count)}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        keywordActionResult && (
          <div
            className="dock-dialog-backdrop"
            role="presentation"
            onClick={() => setKeywordActionResult(null)}
          >
            <div
              className="dock-dialog dock-dialog--compact"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dock-bible-keyword-action-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dock-dialog__header">
                <div>
                  <div className="dock-dialog__eyebrow">{t("bible.keywordMatch")}</div>
                  <h2 id="dock-bible-keyword-action-title" className="dock-dialog__title">
                    {keywordActionResult.label}
                  </h2>
                </div>
                <button
                  type="button"
                  className="dock-dialog__close"
                  onClick={() => setKeywordActionResult(null)}
                  aria-label={t("bible.closeKeywordActionDialog")}
                  title={t("common.close")}>
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div className="dock-dialog__body">
                <div className="dock-bible-keyword-modal__text">
                  {renderHighlightedKeywordText(keywordActionResult.text, keywordActionResult.query)}
                </div>
              </div>
              <div className="dock-dialog__footer dock-bible-keyword-modal__footer">
                <button
                  type="button"
                  className="dock-btn dock-btn--ghost dock-btn--compact"
                  onClick={() => {
                    focusReference(keywordActionResult.book, keywordActionResult.chapter, keywordActionResult.verse);
                    setKeywordActionResult(null);
                    window.setTimeout(() => {
                      const verseRow = verseGridRef.current?.querySelector<HTMLElement>(
                        `[data-verse-row="${keywordActionResult.verse}"]`,
                      );
                      if (verseRow) {
                        const container = verseGridRef.current;
                        if (container) {
                          const verseRect = verseRow.getBoundingClientRect();
                          const containerRect = container.getBoundingClientRect();
                          const targetScrollTop = container.scrollTop + (verseRect.top - containerRect.top) - containerRect.height * 0.1;
                          container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
                        }
                      }
                    }, 150);
                  }}
                  title={t("bible.goToChapter")}>
                  <Icon name="menu_book" size={14} />
                  {t("bible.goToChapter")}
                </button>
                <button
                  type="button"
                  className="dock-btn dock-btn--primary dock-btn--compact"
                  onClick={() => {
                    void goLiveVerse(
                      keywordActionResult.book,
                      keywordActionResult.chapter,
                      keywordActionResult.verse,
                      { translation: activeTranslation },
                    );
                    setKeywordActionResult(null);
                  }}
                  title={t("common.show")}>
                  <Icon name="cast" size={14} />
                  {t("common.show")}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* ── Standalone Theme Settings Modal ── */}
      <DockThemeSettingsModal
        selectedThemeId={activeThemePickerProps.selectedThemeId}
        onSelect={activeThemePickerProps.onSelect}
        allowedCategories={["bible", "general"]}
        quickSettings={
          overlayMode === "fullscreen"
            ? activeFullscreenQuickThemeSettings
            : activeLowerThirdQuickThemeSettings
        }
        defaultQuickSettings={
          overlayMode === "fullscreen"
            ? defaultFullscreenQuickThemeSettings
            : defaultLowerThirdQuickThemeSettings
        }
        onQuickSettingsSave={
          overlayMode === "fullscreen"
            ? handleSaveFullscreenQuickThemeSettings
            : handleSaveLowerThirdQuickThemeSettings
        }
        onQuickSettingsChange={
          overlayMode === "fullscreen"
            ? handlePreviewFullscreenQuickThemeSettings
            : handlePreviewLowerThirdQuickThemeSettings
        }
        resolveThemeQuickSettings={resolveThemeQuickSettings}
        displayMode={displayMode}
        title={t("bible.quickSettings")}
        subtitle={t("bible.quickSettingsSubtitle")}
        isOpen={showThemeSettings}
        onClose={() => setShowThemeSettings(false)}
        onBackgroundPresetChange={handleBackgroundPresetChange}
        overlayMode={overlayMode}
        initialTab={themeSettingsInitialTab}
      />

      {showBibleHistory && (
        <BibleHistoryScreen
          onBack={() => {
            setShowBibleHistory(false);
            onHistoryClose?.();
          }}
          onNavigateToVerse={(book, chapter, verse) => {
            setSelectedBook(book);
            setSelectedChapter(chapter);
            setHighlightVerse(verse);
            setShowBibleHistory(false);
            onHistoryClose?.();
          }}
        />
      )}
    </BibleDockContainer >
  );
}
