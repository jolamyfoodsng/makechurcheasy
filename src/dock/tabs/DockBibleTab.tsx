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
import { dockObsClient } from "../dockObsClient";
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

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  productionDefaults: DockProductionModuleSettings;
  initialVoiceBible?: VoiceBibleSnapshot | null;
  appConnected: boolean;
  showHistory?: boolean;
  onHistoryClose?: () => void;
}

type OverlayMode = "fullscreen" | "lower-third";
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
  translation?: string;
  translations?: string[];
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
): DockFullscreenQuickThemeSettings {
  return {
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
      source.lowerThirdWidthPreset === "full" ||
        source.lowerThirdWidthPreset === "sm" ||
        source.lowerThirdWidthPreset === "md" ||
        source.lowerThirdWidthPreset === "lg" ||
        source.lowerThirdWidthPreset === "xl" ||
        source.lowerThirdWidthPreset === "xxl"
        ? source.lowerThirdWidthPreset
        : DEFAULT_THEME_SETTINGS.lowerThirdWidthPreset,
    lowerThirdOffsetX: clampNumber(
      Number(source.lowerThirdOffsetX ?? 0),
      -500,
      500,
    ),
  };
}

function applyFullscreenQuickThemeSettings(
  theme: BibleTheme,
  quickSettings: DockFullscreenQuickThemeSettings | null,
): BibleTheme {
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
      backgroundImage: quickSettings.backgroundImage,
      backgroundImageFilePath: quickSettings.backgroundImageFilePath,
      backgroundVideo: quickSettings.backgroundVideo,
      backgroundVideoFilePath: quickSettings.backgroundVideoFilePath,
      backgroundOpacity: quickSettings.backgroundOpacity,
      backgroundColor: quickSettings.backgroundColor,
      backgroundColorEnd: quickSettings.backgroundColorEnd,
      bgGradientAngle: quickSettings.bgGradientAngle,
      referenceBackgroundEnabled: quickSettings.referenceBackgroundEnabled,
      referenceBackgroundColor: quickSettings.referenceBackgroundColor,
      referenceBackgroundStyle: quickSettings.referenceBackgroundStyle,
      referenceBackgroundRadius: quickSettings.referenceBackgroundRadius,
      lowerThirdPosition: quickSettings.lowerThirdPosition,
      lowerThirdSize: quickSettings.lowerThirdSize,
      lowerThirdWidthPreset: quickSettings.lowerThirdWidthPreset,
      lowerThirdOffsetX: quickSettings.lowerThirdOffsetX,
    },
  };
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
  showHistory,
  onHistoryClose,
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
  const [sending, setSending] = useState(false);
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
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterErrors, setChapterErrors] = useState<string[]>(() => createEmptyErrors());
  const [highlightVerse, setHighlightVerse] = useState<number | null>(null);
  const [favoriteRefs, setFavoriteRefs] = useState<Set<string>>(new Set());
  const [isUtilityCollapsed, _setIsUtilityCollapsed] = useState(
    () => loadDockBibleUiPreferences().controlsCollapsed ?? false,
  );
  const [bibleBgOnly, setBibleBgOnly] = useState(false);
  const liveVerseActionInFlightRef = useRef(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const verseGridRef = useRef<HTMLDivElement>(null);
  const verseLinePopoverRef = useRef<HTMLDivElement>(null);
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
  const liveTranscriptWordCounterRef = useRef(0);
  const lastTranscriptWordsRef = useRef<string[]>([]);
  const [isBookDropdownOpen, setIsBookDropdownOpen] = useState(false);
  const [isChapterDropdownOpen, setIsChapterDropdownOpen] = useState(false);
  const [isVerseDropdownOpen, setIsVerseDropdownOpen] = useState(false);
  const [showVerseLinePopover, setShowVerseLinePopover] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [showBibleHistory, setShowBibleHistory] = useState(false);

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
    const storedLowerThirdQuickSettings = sanitizeFullscreenQuickThemeSettings(
      prefs.lowerThirdQuickThemeSettings,
    );
    const storedLowerThirdLinked =
      typeof prefs.lowerThirdQuickThemeSettingsLinkedToFullscreen === "boolean"
        ? prefs.lowerThirdQuickThemeSettingsLinkedToFullscreen
        : storedLowerThirdQuickSettings == null;
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

      const storedFullscreen = allFavorites.find((theme) => theme.id === prefs.fullscreenThemeId);
      const storedLowerThird = allFavorites.find((theme) => theme.id === prefs.lowerThirdThemeId);

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
    availableTranslations,
    productionDefaults.defaultMode,
    productionDefaults.fullscreenTheme,
    productionDefaults.lowerThirdTheme,
    scheduleAutoStageResume,
  ]);

  useEffect(() => () => {
    if (suppressAutoStageTimerRef.current !== null) {
      window.clearTimeout(suppressAutoStageTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!prefsReadyRef.current) return;
    saveDockBiblePreferences({
      overlayMode,
      translation: activeTranslation,
      translations: [...columnTranslations],
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
  }, [
    activeTranslation,
    backgroundPreset,
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
    () => extractFullscreenQuickThemeSettings(effectiveSelectedBibleTheme.settings),
    [effectiveSelectedBibleTheme.settings],
  );

  const defaultFullscreenQuickThemeSettings = useMemo(
    () => extractFullscreenQuickThemeSettings(baseFullscreenTheme.settings),
    [baseFullscreenTheme.settings],
  );

  const defaultLowerThirdQuickThemeSettings = useMemo(
    () => extractFullscreenQuickThemeSettings(baseLowerThirdTheme.settings),
    [baseLowerThirdTheme.settings],
  );

  // Lower-third theme — uses fullscreen settings as base so all properties
  // (referenceBackgroundEnabled, shade, etc.) work automatically.
  // LT-specific overrides (position, size) are layered on top.
  const effectiveSelectedLowerThirdTheme = useMemo(() => {
    const mergedQuickSettings = { ...fullscreenQuickThemeSettings, ...lowerThirdQuickThemeSettings } as DockFullscreenQuickThemeSettings;
    return applyFullscreenQuickThemeSettings(baseLowerThirdTheme, mergedQuickSettings);
  }, [fullscreenQuickThemeSettings, lowerThirdQuickThemeSettings, baseLowerThirdTheme]);

  const activeLowerThirdQuickThemeSettings = useMemo(
    () => extractFullscreenQuickThemeSettings(effectiveSelectedLowerThirdTheme.settings),
    [effectiveSelectedLowerThirdTheme.settings],
  );

  const fullscreenLiveOverrides = useMemo(
    () => buildDockBackgroundPresetOverrides(effectiveSelectedBibleTheme.settings, backgroundPreset),
    [backgroundPreset, effectiveSelectedBibleTheme.settings],
  );

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
                error instanceof Error ? error.message : "Unable to load this version.",
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
      } catch (error) {
        if (cancelled) return;
        const nextErrors = createEmptyErrors();
        nextErrors[0] = error instanceof Error ? error.message : "Unable to load the selected chapter.";
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
      const selection = await resolveVerseSelection(
        book,
        chapter,
        verse,
        effectiveTranslation,
        effectiveLineCount,
        options?.rangeEndVerse ?? null,
      );
      setVerseText(selection.text);
      const referenceLabel = `${book} ${chapter}:${selection.verseRange}`;

      const stageData = {
        book,
        chapter,
        verse,
        columnIndex:
          typeof options?.columnIndex === "number"
            ? Math.min(Math.max(options.columnIndex, 0), QUICK_SELECT_VERSION_COUNT - 1)
            : activeColumnIndex,
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

      onStage({
        type: "bible",
        label: referenceLabel,
        subtitle: selection.text,
        data: stageData,
      });
    },
    [
      focusReference,
      focusReferenceWithoutReload,
      fullscreenLiveOverrides,
      onStage,
      overlayMode,
      resolveVerseSelection,
      effectiveSelectedBibleTheme.id,
      effectiveSelectedBibleTheme.settings,
      effectiveSelectedLowerThirdTheme.settings,
      selectedLowerThirdTheme.id,
      activeTranslation,
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
      if (liveVerseActionInFlightRef.current) return;
      liveVerseActionInFlightRef.current = true;
      setSending(true);
      try {
        const effectiveTranslation = options?.translation ?? activeTranslation;
        const effectiveLineCount = clampVerseLineCount(options?.lineCount ?? verseLineCount);
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
        );
        setVerseText(selection.text);
        const referenceLabel = `${book} ${chapter}:${selection.verseRange}`;

        const stageData = {
          book,
          chapter,
          verse,
          columnIndex:
            typeof options?.columnIndex === "number"
              ? Math.min(Math.max(options.columnIndex, 0), QUICK_SELECT_VERSION_COUNT - 1)
              : activeColumnIndex,
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

        onStage({
          type: "bible",
          label: referenceLabel,
          subtitle: selection.text,
          data: stageData,
        });

        try {
          await ensureObsConnected();
          await dockObsClient.pushBible(stageData);
          trackBiblePresent(selection.text);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
          if (!isTransient) {
            console.warn("[DockBibleTab] Go live verse failed:", err);
            setActionError(message);
          } else {
            console.warn("[DockBibleTab] Go live verse failed (transient):", message);
          }
        }

        // Track Bible history
        if (book && chapter && verse) {
          const verseData = chapterPassages[activeColumnIndex]?.verses.find(v => v.verse === verse);
          addToBibleHistory(book, chapter, verse, verseData?.text ?? "");
        }
      } finally {
        liveVerseActionInFlightRef.current = false;
        setSending(false);
      }
    },
    [
      fullscreenLiveOverrides,
      onStage,
      overlayMode,
      resolveVerseSelection,
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
        setLowerThirdQuickThemeSettings({ ...nextSavedSettings });
        setSavedLowerThirdQuickThemeSettings({ ...nextSavedSettings });
      }
    });

    // Push to OBS when Save is clicked (backgroundPreset changes are deferred to this point)
    if (overlayMode !== "fullscreen") return;
    const data = latestStagedRef.current;
    if (!data || data.type !== "bible") return;
    const d = data.data as Record<string, unknown> | undefined;
    if (!d) return;

    // Merge new settings into the base theme directly instead of using the
    // stale memoized effectiveSelectedBibleTheme (which hasn't re-rendered yet).
    const mergedSettings = applyFullscreenQuickThemeSettings(selectedBibleTheme, nextSavedSettings);

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
      bibleThemeSettings: mergedSettings.settings as unknown as Record<string, unknown>,
      liveOverrides: fullscreenLiveOverrides as Record<string, unknown> | null,
      backgroundOnly: Boolean(d.backgroundOnly),
    };

    ensureObsConnected()
      .then(() => dockObsClient.pushBible(pushData))
      .catch((err) => {
        console.warn("[DockBibleTab] Save push failed:", err);
      });
  }, [fullscreenLiveOverrides, lowerThirdQuickThemeSettingsLinkedToFullscreen, overlayMode, selectedBibleTheme]);

  const handlePreviewFullscreenQuickThemeSettings = useCallback((nextSettings: DockFullscreenQuickThemeSettings) => {
    const nextPreviewSettings = { ...nextSettings };
    setFullscreenQuickThemeSettings(nextPreviewSettings);
    if (lowerThirdQuickThemeSettingsLinkedToFullscreen) {
      setLowerThirdQuickThemeSettings({ ...nextPreviewSettings });
    }
  }, [lowerThirdQuickThemeSettingsLinkedToFullscreen]);

  const handleSaveLowerThirdQuickThemeSettings = useCallback((nextSettings: DockFullscreenQuickThemeSettings) => {
    const nextSavedSettings = { ...nextSettings };
    startTransition(() => {
      setLowerThirdQuickThemeSettingsLinkedToFullscreen(false);
      setLowerThirdQuickThemeSettings(nextSavedSettings);
      setSavedLowerThirdQuickThemeSettings(nextSavedSettings);
    });

    // Push to OBS so the live lower-third reflects the new settings immediately.
    const data = latestStagedRef.current;
    if (!data || data.type !== "bible") return;
    const d = data.data as Record<string, unknown> | undefined;
    if (!d) return;

    // Build merged settings from the LT base theme + the new quick settings.
    // BG comes from nextSettings directly (no stale fullscreen override).
    const mergedSettings = applyFullscreenQuickThemeSettings(selectedLowerThirdTheme, nextSavedSettings);

    const pushData = {
      book: (d.book as string) ?? "",
      chapter: (d.chapter as number) ?? 1,
      verse: (d.verse as number) ?? 1,
      verseEnd: d.verseEnd as number | undefined,
      verseRange: d.verseRange as string | undefined,
      referenceLabel: d.referenceLabel as string | undefined,
      translation: (d.translation as string) ?? "KJV",
      verseText: d.verseText as string | undefined,
      overlayMode: "lower-third" as const,
      theme: d.theme as string | undefined,
      bibleThemeSettings: mergedSettings.settings as unknown as Record<string, unknown>,
      liveOverrides: null,
      backgroundOnly: Boolean(d.backgroundOnly),
    };

    ensureObsConnected()
      .then(() => dockObsClient.pushBible(pushData))
      .catch((err) => {
        console.warn("[DockBibleTab] Lower-third save push failed:", err);
      });
  }, [selectedLowerThirdTheme]);

  const handlePreviewLowerThirdQuickThemeSettings = useCallback((nextSettings: DockFullscreenQuickThemeSettings) => {
    startTransition(() => {
      setLowerThirdQuickThemeSettingsLinkedToFullscreen(false);
      setLowerThirdQuickThemeSettings({ ...nextSettings });
    });
  }, []);

  // ── Re-fetch verse text when the active column translation changes ──
  const prevActiveTranslation = useRef(activeTranslation);
  const selectedVerseRef = useRef(selectedVerse);
  useEffect(() => {
    selectedVerseRef.current = selectedVerse;
  }, [selectedVerse]);

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

    // Auto-push to OBS when quick settings change (background, theme, sliders)
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
          verseText: d.verseText as string | undefined,
          overlayMode: (d.overlayMode as "fullscreen" | "lower-third") ?? "fullscreen",
          theme: d.theme as string | undefined,
          bibleThemeSettings: effectiveSelectedBibleTheme.settings as unknown as Record<string, unknown>,
          liveOverrides: fullscreenLiveOverrides as Record<string, unknown> | null,
          backgroundOnly: Boolean(d.backgroundOnly),
        };
        ensureObsConnected()
          .then(() => dockObsClient.pushBible(pushData))
          .catch((err) => {
            console.warn("[DockBibleTab] Auto-push on quick settings change failed:", err);
          });
      }
    }
  }, [
    activeColumnIndex,
    activeFullscreenQuickThemeSettings,
    activeTranslation,
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

    const data = latestStagedRef.current;
    if (!data || data.type !== "bible") return;
    const d = data.data as Record<string, unknown> | undefined;
    if (!d) return;

    const pushData = {
      book: (d.book as string) ?? "",
      chapter: (d.chapter as number) ?? 1,
      verse: (d.verse as number) ?? 1,
      verseEnd: d.verseEnd as number | undefined,
      verseRange: d.verseRange as string | undefined,
      referenceLabel: d.referenceLabel as string | undefined,
      translation: (d.translation as string) ?? "KJV",
      verseText: d.verseText as string | undefined,
      overlayMode: "lower-third" as const,
      theme: selectedLowerThirdTheme.id,
      bibleThemeSettings: effectiveSelectedLowerThirdTheme.settings as unknown as Record<string, unknown>,
      liveOverrides: null,
      backgroundOnly: Boolean(d.backgroundOnly),
    };
    ensureObsConnected()
      .then(() => dockObsClient.pushBible(pushData))
      .catch((err) => {
        console.warn("[DockBibleTab] Lower-third auto-push on quick settings change failed:", err);
      });
  }, [
    effectiveSelectedLowerThirdTheme.settings,
    overlayMode,
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
  }, [staged]);

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
    async (result: VoiceBibleResult | null) => {
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
        await stageVerse(result.book, result.chapter, result.verse, {
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
    let cancelled = false;

    const pollVoiceState = async () => {
      const fallback = await loadVoiceBibleDockState();
      if (!fallback || cancelled) return;
      if (fallback.updatedAt <= lastVoiceEventTimestampRef.current) return;

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
        return;
      }

      if (resultKey && resultKey !== lastVoiceResultKeyRef.current) {
        lastVoiceResultKeyRef.current = resultKey;
        await applyVoiceResult(fallback.snapshot.lastResult ?? null);
        return;
      }

      if (!resultKey) {
        lastVoiceResultKeyRef.current = "";
      }
    };

    void pollVoiceState();
    const intervalId = window.setInterval(() => {
      void pollVoiceState();
    }, appConnected ? 5000 : 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [appConnected, applyVoiceResult, voiceBible.status]);

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

  const handleClearBible = useCallback(async () => {
    setActionError("");
    try {
      await ensureObsConnected();
      await dockObsClient.clearBible();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn("[DockBibleTab] clearBible failed:", err);
        setActionError(message);
      }
    }
  }, []);

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
            verseText: data.verseText as string | undefined,
            overlayMode: (data.overlayMode as "fullscreen" | "lower-third") ?? "fullscreen",
            theme: data.theme as string | undefined,
            bibleThemeSettings: data.bibleThemeSettings as Record<string, unknown> | null | undefined,
            liveOverrides: data.liveOverrides as Record<string, unknown> | null | undefined,
            backgroundOnly: next,
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
      setActionError(error instanceof Error ? error.message : "Unable to update favorites.");
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
      if (sending || liveVerseActionInFlightRef.current) return;
      setSelectedVerse(v);
      selectedVerseRef.current = v;
      pendingScrollVerseRef.current = null;

      void goLiveVerse(selectedBook, selectedChapter, v, {
        translation: version,
        columnIndex,
        reveal: false,
      });
    },
    [selectedBook, selectedChapter, goLiveVerse, sending],
  );

  const stopVerseActionEvent = useCallback((event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

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
    // Set both modes to the same unified theme — variant is resolved at render time
    setSelectedBibleTheme(theme);
    setSelectedLowerThirdTheme(theme);
    setOverlayMode("fullscreen");
  }, []);

  const handleSelectLowerThirdTheme = useCallback((theme: BibleTheme) => {
    // Set both modes to the same unified theme — variant is resolved at render time
    setSelectedBibleTheme(theme);
    setSelectedLowerThirdTheme(theme);
    setOverlayMode("lower-third");
  }, []);

  // Use the same theme ID regardless of mode — the selected theme is unified
  const activeThemePickerProps =
    overlayMode === "fullscreen"
      ? {
        selectedThemeId: selectedBibleTheme.id,
        onSelect: handleSelectFullscreenTheme,
        label: t("bible.fullscreenTheme"),
        templateType: "fullscreen" as const,
      }
      : {
        selectedThemeId: selectedBibleTheme.id,
        onSelect: handleSelectLowerThirdTheme,
        label: t("bible.lowerThirdTheme"),
        templateType: "lower-third" as const,
      };
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
      selectedBook,
      selectedChapter,
      selectedVerse,
      stageVerse,
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
      isTopbarExpanded={isTopbarExpanded}
      setIsTopbarExpanded={setIsTopbarExpanded}
      selectedBook={selectedBook}
      selectedChapter={selectedChapter}
      selectedVerse={selectedVerse}
      activeTranslation={activeTranslation}
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
        <></>
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
                     title="Search">
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
                     title="Search">
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
                      ? `Searching "${searchQuery}"...`
                      : `No matches for "${searchQuery}"`}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null
      }
    >
      <section className="dock-console-panel dock-console-panel--workspace" data-toolbar-collapsed={toolbarCollapsed || undefined}>
        <div className="dock-bible-reader" ref={verseGridRef}>
          {activePassage && activePassage.verses.length > 0 && (
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
              <span className="dock-bible-reader__ref-header-translation">{activeTranslation}</span>
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
          {chapterLoading && !activePassage?.verses.length && (
            <div className="dock-console-placeholder">{t("common.loading")} {currentChapterLabel}...</div>
          )}

          {chapterLoading && activeChapterError && !activePassage?.verses.length && (
            <div className="dock-action-error dock-action-error--console">
              <Icon name="warning" size={14} />
              <span style={{ flex: 1 }}>{activeChapterError}</span>
            </div>
          )}

          {!chapterLoading && !activePassage?.verses.length && !activeChapterError && (
            <div className="dock-console-placeholder">
              {t("bible.noVersesAvailable")}
            </div>
          )}

          {activePassage?.verses.map((verse) => (
            <div
              key={verse.verse}
              data-verse-row={verse.verse}
              className={[
                "dock-bible-verse-row",
                selectedVerse === verse.verse ? "dock-bible-verse-row--selected" : "",
                highlightVerse === verse.verse ? "dock-bible-verse-row--highlighted" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onDoubleClick={stopVerseActionEvent}
              onClick={(event) => {
                if (event.detail > 1) return;
                void handleVerseClick(verse.verse, activeColumnIndex, activeTranslation);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                void handleVerseClick(verse.verse, activeColumnIndex, activeTranslation);
              }}
              tabIndex={0}
              role="button"
              aria-current={selectedVerse === verse.verse ? "true" : undefined}
              aria-label={t("bible.verseAriaLabel", { verse: verse.verse, translation: activeTranslation, text: verse.text })}
              title={`${activeTranslation} ${selectedBook} ${selectedChapter}:${verse.verse}`}
            >
              <div className="dock-bible-verse-row__main">
                <span className="dock-bible-verse-row__num">{verse.verse}</span>
                <span className="dock-bible-verse-row__text">{verse.text}</span>
              </div>


            </div>
          ))}
        </div>

        {actionError && (
          <div className="dock-action-error dock-action-error--console">
            <Icon name="warning" size={14} />
            <span style={{ flex: 1 }}>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError("")}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
             title="Close">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        {/* ── Toolbar ── */}
        <DockBottomToolbar
          overlayMode={overlayMode}
          onModeChange={setOverlayMode}
          morphing={modeMorphing}
          clearLabel={t("common.clear")}
          onClear={handleClearBible}
          clearDisabled={sending}
          collapsed={toolbarCollapsed}
          onCollapseChange={setToolbarCollapsed}
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
            onClick={() => setShowThemeSettings(true)}
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
                 title="Close">
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
                      onClick={() => setOverlayMode("fullscreen")}
                      aria-pressed={overlayMode === "fullscreen"}
                     title="Full">
                      <span>{t("bible.full")}</span>
                    </button>
                    <button
                      type="button"
                      className={`dock-console-segmented__item${overlayMode === "lower-third" ? " dock-console-segmented__item--active" : ""}`}
                      onClick={() => setOverlayMode("lower-third")}
                      aria-pressed={overlayMode === "lower-third"}
                     title="Lt">
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
                    onClick={() => { setShowOptionsModal(false); setShowThemeSettings(true); }}
                    style={{ width: "100%" }}
                   title="Open Theme Settings">
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
                 title="Close">
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
                    focusReference(keywordActionResult.book, keywordActionResult.chapter, 1);
                    setKeywordActionResult(null);
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
                    }, 150);
                  }}
                 title="Go To Chapter">
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
                 title="Show">
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
        title={t("bible.quickSettings")}
        subtitle={t("bible.quickSettingsSubtitle")}
        isOpen={showThemeSettings}
        onClose={() => setShowThemeSettings(false)}
        onBackgroundPresetChange={setBackgroundPreset}
        overlayMode={overlayMode}
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
