/**
 * DockWorshipTab.tsx — Worship tab for the MakeChurchEasy Dock
 *
 * Dense operator console for song browsing, lyric cueing, and live transport.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { DockStagedItem, DockWorshipSection } from "../dockTypes";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import { BUILTIN_THEMES } from "../../bible/themes/builtinThemes";
import {
  DEFAULT_THEME_SETTINGS,
  type BibleTheme,
  type BibleThemeSettings,
} from "../../bible/types";
import { dockClient } from "../../services/dockBridge";
import type { DockProductionModuleSettings } from "../../services/productionSettings";
import { track } from "../../services/analytics";
import { trackWorshipSongPresented } from "../../services/tracking";
import {
  createWorshipDockSongSaveCommand,
  loadWorshipDockSongSaveResult,
  postWorshipDockSongSaveCommand,
  type WorshipDockSongSavePayload,
} from "../../services/worshipDockInterop";
import { generateSlides } from "../../worship/slideEngine";
import type { Song } from "../../worship/types";
import { nextAutoSongTitle } from "../../worship/songTitleAutoGen";
import {
  formatOnlineLyricsSearchError,
  searchOnlineSongLyrics,
  type OnlineLyricsSearchResult,
} from "../../worship/onlineLyricsService";
import type { DockFullscreenQuickThemeSettings } from "../components/DockFullscreenThemeQuickSettings";
import { loadDockFavoriteBibleThemes } from "../dockThemeData";
import Icon from "../DockIcon";
import DockBottomToolbar from "../components/DockBottomToolbar";
import DockThemeSettingsModal from "../components/DockThemeSettingsModal";
import { requireEntitlement } from "../dockEntitlement";
import { getUserScopedKey } from "../../services/userScopedStorage";

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  productionDefaults: DockProductionModuleSettings;
}

type OverlayMode = "fullscreen" | "lower-third";

interface DockSong {
  id: string;
  title: string;
  artist: string;
  lyrics: string;
  importSourceName?: string;
  importSourceType?: "manual" | "online";
  importSourceUrl?: string;
}

interface DockWorshipPreferences {
  overlayMode?: OverlayMode;
  fullscreenThemeId?: string;
  lowerThirdThemeId?: string;
  linesPerSlide?: number;
  fullscreenQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickThemeSettingsLinkedToFullscreen?: boolean;
  updatedAt?: string;
}

interface DockWorshipUiPreferences {
  toolbarCollapsed?: boolean;
}

const DOCK_WORSHIP_PREFS_KEY = "ocs-dock-worship-preferences";
const DOCK_WORSHIP_PREFS_APP_KEY = "dock-worship-preferences";
const DOCK_WORSHIP_UI_PREFS_KEY = "ocs-dock-worship-ui-preferences";
const DOCK_WORSHIP_SONG_DEFAULTS_KEY = "ocs-dock-worship-song-defaults-v1";
const DOCK_WORSHIP_RECENT_SEARCHES_KEY = "ocs-dock-worship-recent-searches-v1";
const MIN_LINES_PER_SLIDE = 1;
const MAX_LINES_PER_SLIDE = 12;
const DEFAULT_LINES_PER_SLIDE = 2;
const DOCK_WORSHIP_SAVE_TIMEOUT_MS = 3500;
const DOCK_WORSHIP_SAVE_FALLBACK_DELAY_MS = 350;
const DOCK_WORSHIP_SAVE_RESULT_POLL_MS = 250;
const DOCK_WORSHIP_RECENT_SEARCH_LIMIT = 6;

interface DockSongDraft {
  title: string;
  artist: string;
  lyrics: string;
}

interface DockSongDefault extends DockSongDraft {
  importSourceName?: string;
  importSourceType?: "manual" | "online";
  importSourceUrl?: string;
}

type DockSongDefaults = Record<string, DockSongDefault>;
type DockToastTone = "info" | "success" | "error";

interface DockToast {
  id: string;
  message: string;
  tone: DockToastTone;
}

function clampLinesPerSlide(value?: number): number {
  if (!value || Number.isNaN(value)) return DEFAULT_LINES_PER_SLIDE;
  return Math.min(MAX_LINES_PER_SLIDE, Math.max(MIN_LINES_PER_SLIDE, Math.trunc(value)));
}

function readRecentWorshipSearches(): string[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_WORSHIP_RECENT_SEARCHES_KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeRecentWorshipSearches(items: string[]): void {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_WORSHIP_RECENT_SEARCHES_KEY), JSON.stringify(items.slice(0, DOCK_WORSHIP_RECENT_SEARCH_LIMIT)));
  } catch {
    // ignore OBS CEF storage failures
  }
}

function pushRecentWorshipSearch(label: string): string[] {
  const normalized = label.trim();
  if (!normalized) return readRecentWorshipSearches();
  const next = [
    normalized,
    ...readRecentWorshipSearches().filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, DOCK_WORSHIP_RECENT_SEARCH_LIMIT);
  writeRecentWorshipSearches(next);
  return next;
}

function createDockSongId(): string {
  return crypto.randomUUID?.() ?? `dock-song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readDockSongDefaults(): DockSongDefaults {
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_WORSHIP_SONG_DEFAULTS_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DockSongDefaults;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDockSongDefaults(next: DockSongDefaults): void {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_WORSHIP_SONG_DEFAULTS_KEY), JSON.stringify(next));
  } catch {
    // ignore OBS CEF storage failures
  }
}

function rememberDockSongDefault(song: DockSong): void {
  const defaults = readDockSongDefaults();
  if (defaults[song.id]) return;
  defaults[song.id] = {
    title: song.title,
    artist: song.artist,
    lyrics: song.lyrics,
    importSourceName: song.importSourceName,
    importSourceType: song.importSourceType,
    importSourceUrl: song.importSourceUrl,
  };
  writeDockSongDefaults(defaults);
}

function rememberDockSongDefaults(songs: DockSong[]): void {
  const defaults = readDockSongDefaults();
  let changed = false;
  for (const song of songs) {
    if (defaults[song.id]) continue;
    defaults[song.id] = {
      title: song.title,
      artist: song.artist,
      lyrics: song.lyrics,
      importSourceName: song.importSourceName,
      importSourceType: song.importSourceType,
      importSourceUrl: song.importSourceUrl,
    };
    changed = true;
  }
  if (changed) writeDockSongDefaults(defaults);
}

function mapAppSongToDockSong(song: {
  id: string;
  metadata: { title: string; artist?: string };
  lyrics?: string;
  importSourceName?: string;
  importSourceType?: "manual" | "online";
  importSourceUrl?: string;
}): DockSong {
  return {
    id: song.id,
    title: song.metadata.title,
    artist: song.metadata.artist || "",
    lyrics: song.lyrics || "",
    importSourceName: song.importSourceName,
    importSourceType: song.importSourceType,
    importSourceUrl: song.importSourceUrl,
  };
}

function loadDockWorshipPreferences(): DockWorshipPreferences {
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_WORSHIP_PREFS_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DockWorshipPreferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDockWorshipPreferences(next: DockWorshipPreferences): void {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_WORSHIP_PREFS_KEY), JSON.stringify(next));
  } catch {
    // ignore OBS CEF storage failures
  }
}

function saveDockWorshipUiPreferences(next: DockWorshipUiPreferences): void {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_WORSHIP_UI_PREFS_KEY), JSON.stringify(next));
  } catch {
    // ignore OBS CEF storage failures
  }
}

async function loadDockWorshipPreferencesFromApp(): Promise<DockWorshipPreferences | null> {
  try {
    const { getByKey, STORES } = await import("../../services/db");
    const raw = await getByKey<unknown>(STORES.APP_SETTINGS, DOCK_WORSHIP_PREFS_APP_KEY);
    if (!raw || typeof raw !== "object") return null;
    return raw as DockWorshipPreferences;
  } catch {
    return null;
  }
}

function parseLyricSections(lyrics: string, linesPerSlide: number): DockWorshipSection[] {
  if (!lyrics.trim()) return [];
  return generateSlides(lyrics, linesPerSlide, false).map((slide) => ({
    id: slide.id,
    label: slide.isContinuation ? "" : slide.label,
    text: slide.content,
  }));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sanitizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value.trim())
    ? value.trim().toUpperCase()
    : fallback;
}

function extractQuickThemeSettings(settings: BibleThemeSettings): DockFullscreenQuickThemeSettings {
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
    lowerThirdPosition: settings.lowerThirdPosition || "left",
    lowerThirdSize: settings.lowerThirdSize || "medium",
    lowerThirdWidthPreset: settings.lowerThirdWidthPreset || "full",
    lowerThirdOffsetX: clampNumber(settings.lowerThirdOffsetX ?? 0, -50, 50),
  };
}

function sanitizeQuickThemeSettings(
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
    refTextAlign: (source.refTextAlign as BibleThemeSettings["refTextAlign"]) || DEFAULT_THEME_SETTINGS.textAlign,
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
      source.lowerThirdPosition === "left" || source.lowerThirdPosition === "center" || source.lowerThirdPosition === "right"
        ? source.lowerThirdPosition
        : "left",
    lowerThirdSize:
      source.lowerThirdSize === "smallest" || source.lowerThirdSize === "smaller" || source.lowerThirdSize === "small" || source.lowerThirdSize === "medium" || source.lowerThirdSize === "big" || source.lowerThirdSize === "bigger" || source.lowerThirdSize === "biggest"
        ? source.lowerThirdSize
        : "medium",
    lowerThirdWidthPreset:
      source.lowerThirdWidthPreset === "full" || source.lowerThirdWidthPreset === "xl" || source.lowerThirdWidthPreset === "lg" || source.lowerThirdWidthPreset === "md" || source.lowerThirdWidthPreset === "sm"
        ? source.lowerThirdWidthPreset
        : "full",
    lowerThirdOffsetX: clampNumber(
      Number(source.lowerThirdOffsetX ?? 0),
      -50,
      50,
    ),
  };
}

function applyQuickThemeSettings(
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
      fullscreenShadeColor: quickSettings.fullscreenShadeColor,
      fullscreenShadeOpacity: quickSettings.fullscreenShadeOpacity,
      fullscreenShadeEnabled: quickSettings.fullscreenShadeOpacity > 0,
      textAlign: quickSettings.textAlign,
      lineHeight: quickSettings.lineHeight,
      fontWeight: quickSettings.fontWeight,
      refFontWeight: quickSettings.fontWeight,
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

function cleanWorshipSectionLabel(label: string): string {
  const normalized = label.trim();
  if (!normalized) return "";
  return /^verse\s+\d+$/i.test(normalized) ? "" : normalized;
}

function stageItemLabel(song: DockSong, section: DockWorshipSection): string {
  const displayLabel = cleanWorshipSectionLabel(section.label);
  return displayLabel || song.title;
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function DockWorshipTab({ staged, onStage, productionDefaults }: Props) {
  const [songs, setSongs] = useState<DockSong[]>([]);
  const rawSongsRef = useRef<DockSong[]>([]);
  // Initialize from localStorage so the limit is known immediately
  const [songLimit, setSongLimit] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("ocs-dock-song-limit");
      if (stored !== null) {
        const parsed = Number(stored);
        if (!isNaN(parsed) && parsed > 0 && parsed < 9999) return parsed;
      }
    } catch { /* ignore */ }
    return 0;
  });
  const songLimitRef = useRef(songLimit);
  // Keep the ref in sync so callbacks (openNewSongModal, handleSaveNewSong)
  // always read the latest limit even though they can't depend on state directly.
  useEffect(() => { songLimitRef.current = songLimit; }, [songLimit]);
  // Skip auto-selecting a song from the persisted staged item on first mount.
  // The staged item is restored from localStorage on reload; we only want to
  // navigate into a song when the user explicitly stages a new one.
  const isInitialMount = useRef(true);
  useEffect(() => { isInitialMount.current = false; }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [lyricsSearchQuery, setLyricsSearchQuery] = useState("");
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [showLineCountPopover, setShowLineCountPopover] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentWorshipSearches());
  const [selectedSong, setSelectedSong] = useState<DockSong | null>(null);
  const [visibleIdx, setVisibleIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [selectedFSTheme, setSelectedFSTheme] = useState<BibleTheme>(
    productionDefaults.fullscreenTheme ?? BUILTIN_THEMES[0],
  );
  const [selectedLTTheme, setSelectedLTTheme] = useState<BibleTheme>(
    productionDefaults.lowerThirdTheme ?? BUILTIN_THEMES[0],
  );
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(productionDefaults.defaultMode);
  const [linesPerSlide, setLinesPerSlide] = useState<number>(2);
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
  const [, setSending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [songEditor, setSongEditor] = useState<DockSong | null>(null);
  const [songDraft, setSongDraft] = useState<DockSongDraft>({ title: "", artist: "", lyrics: "" });
  const [newSongDraft, setNewSongDraft] = useState<DockSongDraft>({ title: "", artist: "", lyrics: "" });
  const [newSongSource, setNewSongSource] = useState<Pick<DockSong, "importSourceName" | "importSourceType" | "importSourceUrl"> | null>(null);
  const [isNewSongModalOpen, setIsNewSongModalOpen] = useState(false);
  const [slideEditor, setSlideEditor] = useState<{ index: number; label: string; text: string } | null>(null);
  const [onlineSearchOpen, setOnlineSearchOpen] = useState(false);
  const [onlineSearchQuery, setOnlineSearchQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState<OnlineLyricsSearchResult[]>([]);
  const [onlineSearchLoading, setOnlineSearchLoading] = useState(false);
  const [onlineSearchError, setOnlineSearchError] = useState("");
  const [hiddenSectionIndexes, setHiddenSectionIndexes] = useState<Set<number>>(() => new Set());
  const [showWorshipBackgroundOnly, setShowWorshipBackgroundOnly] = useState(false);
  const [savingSong, setSavingSong] = useState(false);
  const [toasts, setToasts] = useState<DockToast[]>([]);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const lineCountPopoverRef = useRef<HTMLDivElement>(null);
  const prefsReadyRef = useRef(false);
  const suppressAutoProjectionRef = useRef(true);
  const suppressAutoProjectionTimerRef = useRef<number | null>(null);

  const selectedSongSections = useMemo(
    () => (selectedSong ? parseLyricSections(selectedSong.lyrics, linesPerSlide) : []),
    [linesPerSlide, selectedSong],
  );
  const searchableSongs = useMemo(
    () =>
      songs.map((song) => ({
        song,
        searchText: `${song.title}\n${song.artist}\n${song.lyrics}`.toLowerCase(),
      })),
    [songs],
  );
  const persistedPrefs = useMemo<DockWorshipPreferences>(() => ({
    overlayMode,
    fullscreenThemeId: selectedFSTheme.id,
    lowerThirdThemeId: selectedLTTheme.id,
    linesPerSlide,
    fullscreenQuickThemeSettings: savedFullscreenQuickThemeSettings,
    lowerThirdQuickThemeSettings: savedLowerThirdQuickThemeSettings,
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
    updatedAt: new Date().toISOString(),
  }), [
    linesPerSlide,
    overlayMode,
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
    savedFullscreenQuickThemeSettings,
    savedLowerThirdQuickThemeSettings,
    selectedFSTheme.id,
    selectedLTTheme.id,
  ]);
  const visibleSectionIndexes = useMemo(
    () => selectedSongSections.map((_, index) => index).filter((index) => !hiddenSectionIndexes.has(index)),
    [hiddenSectionIndexes, selectedSongSections],
  );

  const lyricsFilteredSectionIndexes = useMemo(() => {
    if (!lyricsSearchQuery.trim()) return visibleSectionIndexes;
    const query = lyricsSearchQuery.trim();
    return visibleSectionIndexes.filter((idx) => {
      const section = selectedSongSections[idx];
      if (!section) return false;
      const label = cleanWorshipSectionLabel(section.label);
      return fuzzyMatch(query, section.text) || (label && fuzzyMatch(query, label));
    });
  }, [lyricsSearchQuery, visibleSectionIndexes, selectedSongSections]);

  const showToast = useCallback((message: string, tone: DockToastTone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 1500);
    toastTimersRef.current.push(timer);
  }, []);

  useEffect(() => () => {
    toastTimersRef.current.forEach((timer) => clearTimeout(timer));
    toastTimersRef.current = [];
  }, []);

  const scheduleAutoProjectionResume = useCallback(() => {
    suppressAutoProjectionRef.current = true;
    if (suppressAutoProjectionTimerRef.current !== null) {
      window.clearTimeout(suppressAutoProjectionTimerRef.current);
    }
    suppressAutoProjectionTimerRef.current = window.setTimeout(() => {
      suppressAutoProjectionRef.current = false;
      suppressAutoProjectionTimerRef.current = null;
    }, 0);
  }, []);

  useEffect(() => () => {
    if (suppressAutoProjectionTimerRef.current !== null) {
      window.clearTimeout(suppressAutoProjectionTimerRef.current);
    }
  }, []);

  // Use primitive IDs as effect dependencies to avoid re-running when the backend
  // sends new object references for themes that haven't actually changed.
  const _fsThemeDepId = productionDefaults.fullscreenTheme?.id;
  const _ltThemeDepId = productionDefaults.lowerThirdTheme?.id;

  useEffect(() => {
    scheduleAutoProjectionResume();
    prefsReadyRef.current = false;
    let cancelled = false;
    const applyPreferences = async (prefs: DockWorshipPreferences) => {
      scheduleAutoProjectionResume();
      setSelectedFSTheme(productionDefaults.fullscreenTheme ?? BUILTIN_THEMES[0]);
      setSelectedLTTheme(productionDefaults.lowerThirdTheme ?? BUILTIN_THEMES[0]);
      setOverlayMode(prefs.overlayMode ?? productionDefaults.defaultMode);
      setLinesPerSlide(typeof prefs.linesPerSlide === "number" ? clampLinesPerSlide(prefs.linesPerSlide) : DEFAULT_LINES_PER_SLIDE);
      const storedFullscreenQuickSettings = sanitizeQuickThemeSettings(
        prefs.fullscreenQuickThemeSettings,
      );
      const storedLowerThirdQuickSettings = sanitizeQuickThemeSettings(
        prefs.lowerThirdQuickThemeSettings,
      );
      const storedLowerThirdLinked =
        typeof prefs.lowerThirdQuickThemeSettingsLinkedToFullscreen === "boolean"
          ? prefs.lowerThirdQuickThemeSettingsLinkedToFullscreen
          : storedLowerThirdQuickSettings == null;
      setSavedFullscreenQuickThemeSettings(storedFullscreenQuickSettings);
      setFullscreenQuickThemeSettings(storedFullscreenQuickSettings);
      setSavedLowerThirdQuickThemeSettings(storedLowerThirdQuickSettings);
      setLowerThirdQuickThemeSettings(
        storedLowerThirdLinked ? (storedFullscreenQuickSettings ?? storedLowerThirdQuickSettings) : storedLowerThirdQuickSettings,
      );
      setLowerThirdQuickThemeSettingsLinkedToFullscreen(storedLowerThirdLinked);

      const [fullscreenFavorites, lowerThirdFavorites] = await Promise.all([
        loadDockFavoriteBibleThemes("fullscreen"),
        loadDockFavoriteBibleThemes("lower-third"),
      ]);

      if (cancelled) return;

      const storedFullscreen = fullscreenFavorites.find((theme) => theme.id === prefs.fullscreenThemeId);
      const storedLowerThird = lowerThirdFavorites.find((theme) => theme.id === prefs.lowerThirdThemeId);

      if (storedFullscreen) setSelectedFSTheme(storedFullscreen);
      if (storedLowerThird) setSelectedLTTheme(storedLowerThird);
      prefsReadyRef.current = true;
      scheduleAutoProjectionResume();
    };

    const localPrefs = loadDockWorshipPreferences();

    void applyPreferences(localPrefs).catch(() => {
      prefsReadyRef.current = true;
    });

    void loadDockWorshipPreferencesFromApp().then((appPrefs) => {
      if (cancelled || !appPrefs) return;
      const localUpdatedAt = Date.parse(localPrefs.updatedAt ?? "");
      const appUpdatedAt = Date.parse(appPrefs.updatedAt ?? "");
      if (Number.isFinite(localUpdatedAt) && Number.isFinite(appUpdatedAt) && appUpdatedAt <= localUpdatedAt) {
        return;
      }
      prefsReadyRef.current = false;
      void applyPreferences(appPrefs).catch(() => {
        prefsReadyRef.current = true;
        scheduleAutoProjectionResume();
      });
    }).catch(() => { });

    return () => {
      cancelled = true;
    };
  }, [
    productionDefaults.defaultMode,
    _fsThemeDepId,
    _ltThemeDepId,
    scheduleAutoProjectionResume,
  ]);

  useEffect(() => {
    if (!prefsReadyRef.current) return;
    const persist = () => {
      saveDockWorshipPreferences(persistedPrefs);
      dockClient.sendCommand({
        type: "worship:save-preferences",
        payload: persistedPrefs,
        timestamp: Date.now(),
      });
    };
    const timer = window.setTimeout(persist, 0);
    return () => window.clearTimeout(timer);
  }, [persistedPrefs]);

  useEffect(() => {
    saveDockWorshipUiPreferences({
      toolbarCollapsed,
    });
  }, [toolbarCollapsed]);

  const mapSongs = useCallback(
    (all: Array<{
      id: string;
      metadata: { title: string; artist?: string };
      lyrics?: string;
      importSourceName?: string;
      importSourceType?: "manual" | "online";
      importSourceUrl?: string;
    }>): DockSong[] => all.map(mapAppSongToDockSong),
    [],
  );

  const applySongLimit = useCallback((nextSongs: DockSong[]) => {
    rawSongsRef.current = nextSongs;
    let limit = songLimitRef.current;
    // Fallback: read from localStorage if ref is still unset
    if (!limit || limit <= 0 || limit >= 9999) {
      try {
        const stored = localStorage.getItem("ocs-dock-song-limit");
        if (stored !== null) {
          const parsed = Number(stored);
          if (!isNaN(parsed) && parsed > 0 && parsed < 9999) {
            limit = parsed;
            songLimitRef.current = parsed;
            setSongLimit(parsed);
          }
        }
      } catch { /* ignore */ }
    }
    // Show all songs — locked ones will be visually gated by lockedSongIds
    setSongs(nextSongs);
  }, []);

  const loadSongs = useCallback(async (allowJsonFallback = true) => {
    dockClient.sendCommand({ type: "request-library-data", timestamp: Date.now() });

    if (!allowJsonFallback) return;

    // Wait briefly for BroadcastChannel response before falling back to JSON
    await new Promise((r) => setTimeout(r, 800));

    // If BroadcastChannel already delivered songs, skip the JSON fallback
    // to avoid overwriting the plan-limited list with the full unfiltered set
    if (rawSongsRef.current.length > 0) {
      return;
    }

    try {
      const res = await fetch("/uploads/dock-worship-songs.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const all = await res.json();
      if (Array.isArray(all) && all.length > 0) {
        // Read the plan limit from localStorage (set by main app) so we
        // can enforce it even when BroadcastChannel hasn't delivered yet.
        try {
          const stored = localStorage.getItem("ocs-dock-song-limit");
          if (stored !== null) {
            const parsed = Number(stored);
            if (!isNaN(parsed)) {
              songLimitRef.current = parsed;
              setSongLimit(parsed);
            }
          }
        } catch { /* ignore */ }
        const nextSongs = mapSongs(all);
        rememberDockSongDefaults(nextSongs);
        applySongLimit(nextSongs);
        return;
      }
    } catch { /* JSON fetch failed */ }
  }, [mapSongs]);

  useEffect(() => {
    void loadSongs();
  }, [loadSongs]);

  // Re-filter when songLimit changes
  useEffect(() => {
    if (rawSongsRef.current.length > 0) {
      applySongLimit(rawSongsRef.current);
    }
  }, [songLimit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsub = dockClient.onState((msg) => {
      if (msg.type === "state:song-limit" && typeof msg.payload === "number") {
        songLimitRef.current = msg.payload;
        setSongLimit(msg.payload);
        return;
      }
      if (msg.type === "state:songs-data" && Array.isArray(msg.payload)) {
        const nextSongs = mapSongs(msg.payload as Parameters<typeof mapSongs>[0]);
        rememberDockSongDefaults(nextSongs);
        applySongLimit(nextSongs);
        return;
      }
      if (msg.type === "state:library-updated") {
        void loadSongs();
      }
    });
    return unsub;
  }, [loadSongs]);

  // Fallback polling: refresh songs every 30s in case event-based sync fails
  useEffect(() => {
    const interval = setInterval(() => {
      void loadSongs(false);
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadSongs]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowRecentSearches(false);
      }
      if (lineCountPopoverRef.current && !lineCountPopoverRef.current.contains(event.target as Node)) {
        setShowLineCountPopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) {
      return songs;
    }
    const needle = searchQuery.toLowerCase();
    return searchableSongs
      .filter((entry) => entry.searchText.includes(needle))
      .map((entry) => entry.song);
  }, [searchQuery, searchableSongs, songs]);

  // ── Plan-locked songs: songs beyond the plan limit get a blur + padlock ──
  const lockedSongIds = useMemo(() => {
    const locked = new Set<string>();
    const isUnlimited = !songLimit || songLimit <= 0 || songLimit >= 9999;
    if (isUnlimited) return locked;

    // Also check server-provided entitlements for consistency
    let effectiveLimit = songLimit;
    try {
      const raw = localStorage.getItem("ocs-dock-entitlements");
      if (raw) {
        const ent = JSON.parse(raw);
        if (typeof ent.songs === "number" && (ent.songs === -1 || ent.songs >= 0)) {
          effectiveLimit = ent.songs === -1 ? 0 : ent.songs;
        }
      }
    } catch { /* ignore */ }

    if (effectiveLimit <= 0) return locked;

    let count = 0;
    for (const song of songs) {
      if (count >= effectiveLimit) locked.add(song.id);
      count++;
    }
    return locked;
  }, [songs, songLimit]);

  const effectiveSelectedFSTheme = useMemo(
    () => applyQuickThemeSettings(selectedFSTheme, fullscreenQuickThemeSettings),
    [fullscreenQuickThemeSettings, selectedFSTheme],
  );
  // Lower-third theme — uses fullscreen settings as base, LT overrides on top.
  const effectiveSelectedLTTheme = useMemo(() => {
    const mergedQuickSettings = { ...fullscreenQuickThemeSettings, ...lowerThirdQuickThemeSettings } as DockFullscreenQuickThemeSettings;
    return applyQuickThemeSettings(selectedLTTheme, mergedQuickSettings);
  }, [fullscreenQuickThemeSettings, lowerThirdQuickThemeSettings, selectedLTTheme]);
  const activeFullscreenQuickThemeSettings = useMemo(
    () => extractQuickThemeSettings(effectiveSelectedFSTheme.settings),
    [effectiveSelectedFSTheme.settings],
  );

  const buildSectionPayload = useCallback(
    (idx: number, options?: { backgroundOnly?: boolean }) => {
      if (!selectedSong) return null;
      const section = selectedSongSections[idx];
      if (!section) return null;

      const displayLabel = cleanWorshipSectionLabel(section.label);
      const theme = overlayMode === "fullscreen" ? effectiveSelectedFSTheme : effectiveSelectedLTTheme;
      const backgroundOnly = options?.backgroundOnly ?? showWorshipBackgroundOnly;

      const stageData = {
        song: selectedSong,
        sectionIdx: idx,
        artist: selectedSong.artist,
        sectionLabel: displayLabel,
        sectionText: section.text,
        overlayMode,
        linesPerSlide,
        theme: theme.id,
        bibleThemeSettings: theme.settings as unknown as Record<string, unknown>,
        liveOverrides: null,
        backgroundOnly: Boolean(backgroundOnly),
      };

      return {
        section,
        stageItem: {
          type: "worship" as const,
          label: stageItemLabel(selectedSong, section),
          subtitle: selectedSong.title,
          data: stageData,
        },
        obsData: {
          sectionText: section.text,
          sectionLabel: displayLabel,
          songTitle: selectedSong.title,
          artist: selectedSong.artist,
          overlayMode,
          bibleThemeSettings: theme.settings as unknown as Record<string, unknown>,
          liveOverrides: null,
          backgroundOnly: Boolean(backgroundOnly),
        },
      };
    },
    [
      linesPerSlide,
      overlayMode,
      effectiveSelectedFSTheme,
      effectiveSelectedLTTheme,
      selectedSong,
      selectedSongSections,
      showWorshipBackgroundOnly,
    ],
  );

  const pushSection = useCallback(
    async (idx: number, options?: { backgroundOnly?: boolean }) => {
      const payload = buildSectionPayload(idx, options);
      if (!payload) return;

      setActionError("");
      setSelectedIdx(idx);
      setVisibleIdx(idx);

      onStage(payload.stageItem);
    },
    [buildSectionPayload, onStage],
  );

  const goLiveSection = useCallback(
    async (idx: number, options?: { backgroundOnly?: boolean }) => {
      const payload = buildSectionPayload(idx, options);
      if (!payload) return;

      setActionError("");
      setSelectedIdx(idx);
      setVisibleIdx(idx);

      onStage(payload.stageItem);

      try {
        await ensureObsConnected();
      } catch {
        return;
      }

      setSending(true);
      try {
        await dockObsClient.pushWorshipLyrics(payload.obsData);
        track("song_presented");
        trackWorshipSongPresented();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
        if (!isTransient) {
          console.warn("[DockWorshipTab] Push worship failed:", err);
          setActionError(message);
        } else {
          console.warn("[DockWorshipTab] Push worship failed (transient):", message);
        }
      } finally {
        setSending(false);
      }
    },
    [buildSectionPayload, onStage],
  );

  const saveSongInMainApp = useCallback(
    (payload: WorshipDockSongSavePayload): Promise<DockSong> =>
      new Promise((resolve, reject) => {
        const command = createWorshipDockSongSaveCommand(payload);
        let fallbackPosted = false;
        let fallbackError: Error | null = null;
        let fallbackTimer: number | null = null;
        let resultPollTimer: number | null = null;
        let timeoutTimer: number | null = null;
        let unsubscribe = () => { };
        let settled = false;

        const cleanup = () => {
          if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
          if (resultPollTimer !== null) window.clearInterval(resultPollTimer);
          if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
          unsubscribe();
        };

        const complete = (result: {
          ok?: boolean;
          song?: Song;
          error?: string;
        }) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (!result.ok || !result.song) {
            reject(new Error(result.error || "Song save failed."));
            return;
          }
          resolve(mapAppSongToDockSong(result.song));
        };

        unsubscribe = dockClient.onState((msg) => {
          if (msg.type !== "state:worship-song-save-result") return;
          const result = msg.payload as {
            commandId?: string;
            ok?: boolean;
            song?: Song;
            error?: string;
          };
          if (result.commandId !== command.commandId) return;
          complete(result);
        });

        const postFallback = () => {
          fallbackPosted = true;
          void postWorshipDockSongSaveCommand(command).catch((err) => {
            fallbackError = err instanceof Error ? err : new Error(String(err));
            console.warn("[DockWorshipTab] Fallback song save command failed:", err);
          });
        };

        fallbackTimer = window.setTimeout(postFallback, DOCK_WORSHIP_SAVE_FALLBACK_DELAY_MS);
        resultPollTimer = window.setInterval(() => {
          if (!fallbackPosted || settled) return;
          void loadWorshipDockSongSaveResult(command.commandId).then((result) => {
            if (!result) return;
            complete(result);
          }).catch(() => { });
        }, DOCK_WORSHIP_SAVE_RESULT_POLL_MS);

        timeoutTimer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(fallbackError ?? new Error("Main app did not confirm the song save."));
        }, DOCK_WORSHIP_SAVE_TIMEOUT_MS);

        dockClient.sendCommand({
          type: "worship:song-save",
          payload,
          commandId: command.commandId,
          timestamp: command.timestamp,
        });
      }),
    [],
  );

  const persistSong = useCallback(
    async (
      songId: string,
      draft: DockSongDraft,
      source?: Pick<DockSong, "importSourceName" | "importSourceType" | "importSourceUrl">,
    ) => {
      const title = draft.title.trim();
      const lyrics = draft.lyrics.trim();
      if (!title || !lyrics) return null;

      const dockSong = await saveSongInMainApp({
        id: songId,
        title,
        artist: draft.artist.trim(),
        lyrics,
        importSourceName: source?.importSourceName,
        importSourceType: source?.importSourceType ?? "manual",
        importSourceUrl: source?.importSourceUrl,
      });

      setSongs((current) => {
        const withoutSong = current.filter((song) => song.id !== dockSong.id);
        const updated = [dockSong, ...withoutSong];
        rawSongsRef.current = updated;
        return updated;
      });
      setSelectedSong((current) => (current?.id === dockSong.id ? dockSong : current));
      return dockSong;
    },
    [saveSongInMainApp],
  );

  const openSongEditor = useCallback((song: DockSong) => {
    rememberDockSongDefault(song);
    setSongEditor(song);
    setSongDraft({
      title: song.title,
      artist: song.artist,
      lyrics: song.lyrics,
    });
    setActionError("");
  }, []);

  const handleSaveSongEditor = useCallback(async () => {
    if (!songEditor) return;
    if (!(await requireEntitlement("songs", rawSongsRef.current.length))) return;
    setSavingSong(true);
    setActionError("");
    try {
      await persistSong(songEditor.id, songDraft, songEditor);
      showToast("Song saved", "success");
      setSongEditor(null);
      track("song_created", { autoSplit: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn("[DockWorshipTab] save song edit failed:", err);
        setActionError(message);
      }
    } finally {
      setSavingSong(false);
    }
  }, [persistSong, showToast, songDraft, songEditor]);

  const handleResetSongEditor = useCallback(() => {
    if (!songEditor) return;
    const defaults = readDockSongDefaults();
    const fallback = defaults[songEditor.id] ?? songEditor;
    setSongDraft({
      title: fallback.title,
      artist: fallback.artist,
      lyrics: fallback.lyrics,
    });
    showToast("Default restored in editor");
  }, [showToast, songEditor]);

  const openNewSongModal = useCallback(async (draft?: Partial<DockSongDraft>) => {
    if (!(await requireEntitlement("songs", rawSongsRef.current.length))) return;
    setNewSongDraft({
      title: draft?.title ?? nextAutoSongTitle(),
      artist: draft?.artist ?? "",
      lyrics: draft?.lyrics ?? "",
    });
    setNewSongSource({ importSourceType: "manual" });
    setIsNewSongModalOpen(true);
    setActionError("");
  }, [showToast]);

  const handleSaveNewSong = useCallback(async () => {
    if (!(await requireEntitlement("songs", rawSongsRef.current.length))) {
      setIsNewSongModalOpen(false);
      return;
    }
    setSavingSong(true);
    setActionError("");
    try {
      const newSong = await persistSong(createDockSongId(), newSongDraft, newSongSource ?? { importSourceType: "manual" });
      if (newSong) {
        rememberDockSongDefault(newSong);
        setIsNewSongModalOpen(false);
        setNewSongSource(null);
        setSelectedSong(newSong);
        setSelectedIdx(0);
        setVisibleIdx(null);
        setHiddenSectionIndexes(new Set());
        showToast(newSong.importSourceType === "online" ? "Import saved" : "Song added", "success");
        track("song_created", { autoSplit: false });
        track("song_imported", { source: newSong.importSourceType ?? "manual" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn("[DockWorshipTab] add song failed:", err);
        setActionError(message);
      }
    } finally {
      setSavingSong(false);
    }
  }, [newSongDraft, newSongSource, persistSong, showToast]);

  useEffect(() => {
    if (!selectedSong) return;
    const maxIndex = visibleSectionIndexes.length - 1;
    const fallbackIndex = visibleSectionIndexes[0] ?? null;
    const clampToVisible = (current: number | null) => {
      if (current === null) return fallbackIndex;
      if (visibleSectionIndexes.includes(current)) return current;
      if (maxIndex < 0) return null;
      return visibleSectionIndexes.find((index) => index > current) ?? visibleSectionIndexes[maxIndex] ?? null;
    };

    setSelectedIdx((current) => clampToVisible(current));
    setVisibleIdx((current) => (current === null ? null : clampToVisible(current)));
  }, [selectedSong, visibleSectionIndexes]);

  useEffect(() => {
    if (!staged || staged.type !== "worship") return;
    // Skip auto-select on initial mount — only react to new staging actions
    if (isInitialMount.current) return;
    scheduleAutoProjectionResume();

    const data = staged.data as Record<string, unknown>;
    const stageSong = data.song as DockSong | undefined;
    const stageIdx = typeof data.sectionIdx === "number" ? data.sectionIdx : null;
    const stageBackgroundOnly = Boolean(data.backgroundOnly);

    if (stageSong) {
      setSelectedSong((current) => {
        if (current?.id === stageSong.id) return current;
        const existing = songs.find((song) => song.id === stageSong.id);
        return existing ?? stageSong;
      });
    }

    if (stageIdx !== null) {
      setSelectedIdx(stageIdx);
      setVisibleIdx(stageIdx);
    }

    setShowWorshipBackgroundOnly(stageBackgroundOnly);
  }, [scheduleAutoProjectionResume, songs, staged]);

  const activeSectionIndex = useMemo(() => {
    if (!selectedSong || visibleSectionIndexes.length === 0) return null;
    if (selectedIdx !== null && visibleSectionIndexes.includes(selectedIdx)) return selectedIdx;
    if (visibleIdx !== null && visibleSectionIndexes.includes(visibleIdx)) return visibleIdx;
    return visibleSectionIndexes[0] ?? null;
  }, [visibleIdx, selectedIdx, selectedSong, visibleSectionIndexes]);


  const handleSelectSong = useCallback((song: DockSong) => {
    setRecentSearches(pushRecentWorshipSearch(`song: ${song.title}`));
    setShowRecentSearches(false);
    setSelectedSong(song);
    setSelectedIdx(0);
    setVisibleIdx(null);
    setHiddenSectionIndexes(new Set());
    setActionError("");
  }, []);

  const applyRecentWorshipSearch = useCallback(
    (recentLabel: string) => {
      const title = recentLabel.replace(/^song:\s*/i, "").trim();
      setShowRecentSearches(false);
      if (!title) return;

      const exactSong = songs.find((song) => song.title.toLowerCase() === title.toLowerCase());
      if (exactSong) {
        setSearchQuery("");
        handleSelectSong(exactSong);
        return;
      }

      setSearchQuery(title);
    },
    [handleSelectSong, songs],
  );

  const handleBackToSongList = useCallback(() => {
    setSelectedSong(null);
    setSelectedIdx(null);
    setVisibleIdx(null);
    setLyricsSearchQuery("");
    setActionError("");
  }, []);

  const handleSectionClick = useCallback(
    (idx: number) => {
      void goLiveSection(idx);
    },
    [goLiveSection],
  );

  const openSlideEditor = useCallback(
    (idx: number) => {
      const section = selectedSongSections[idx];
      if (!section) return;
      setSlideEditor({
        index: idx,
        label: cleanWorshipSectionLabel(section.label) || `Slide ${idx + 1}`,
        text: section.text,
      });
    },
    [selectedSongSections],
  );

  const handleSaveSlideEditor = useCallback(async () => {
    if (!selectedSong || !slideEditor) return;
    const nextSections = selectedSongSections.map((section, index) =>
      index === slideEditor.index ? { ...section, text: slideEditor.text.trim() } : section,
    );
    const nextLyrics = nextSections
      .map((section) => section.text.trim())
      .filter(Boolean)
      .join("\n\n");

    if (!nextLyrics.trim()) return;

    setSavingSong(true);
    setActionError("");
    try {
      const updatedSong = await persistSong(selectedSong.id, {
        title: selectedSong.title,
        artist: selectedSong.artist,
        lyrics: nextLyrics,
      }, selectedSong);
      if (updatedSong) {
        setSelectedSong(updatedSong);
        setSelectedIdx(slideEditor.index);
      }
      showToast("Slide updated", "success");
      setSlideEditor(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn("[DockWorshipTab] save slide edit failed:", err);
        setActionError(message);
      }
    } finally {
      setSavingSong(false);
    }
  }, [persistSong, selectedSong, selectedSongSections, showToast, slideEditor]);

  const handleLinesPerSlideChange = useCallback((nextLinesPerSlide: number) => {
    setLinesPerSlide(clampLinesPerSlide(nextLinesPerSlide));
    setHiddenSectionIndexes(new Set());
    setSelectedIdx(0);
    setVisibleIdx(null);
    setShowLineCountPopover(false);
  }, []);

  const handleImportOnlineResult = useCallback(
    (result: OnlineLyricsSearchResult) => {
      setOnlineSearchOpen(false);
      setOnlineSearchError("");
      setOnlineResults([]);
      setOnlineSearchQuery("");
      setNewSongDraft({
        title: result.title,
        artist: result.artist,
        lyrics: result.lyrics,
      });
      setNewSongSource({
        importSourceName: result.sourceName,
        importSourceType: "online",
        importSourceUrl: result.url,
      });
      setIsNewSongModalOpen(true);
    },
    [],
  );

  useEffect(() => {
    if (!onlineSearchOpen) return;

    const query = onlineSearchQuery.trim();
    if (query.length < 3) {
      setOnlineResults([]);
      setOnlineSearchError("");
      setOnlineSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setOnlineSearchLoading(true);
      setOnlineSearchError("");
      searchOnlineSongLyrics(query)
        .then((results) => {
          if (cancelled) return;
          setOnlineResults(results);
          if (results.length === 0) setOnlineSearchError("No online lyric matches found.");
        })
        .catch((err) => {
          if (cancelled) return;
          setOnlineSearchError(formatOnlineLyricsSearchError(err));
          setOnlineResults([]);
        })
        .finally(() => {
          if (!cancelled) setOnlineSearchLoading(false);
        });
    }, 40);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onlineSearchOpen, onlineSearchQuery]);

  const navigateSection = useCallback(
    async (delta: 1 | -1) => {
      if (!selectedSong || visibleSectionIndexes.length === 0) return;
      const currentIdx = activeSectionIndex ?? 0;
      const currentVisibleIndex = visibleSectionIndexes.indexOf(currentIdx);
      const currentPosition = currentVisibleIndex >= 0 ? currentVisibleIndex : 0;
      const nextPosition = Math.max(0, Math.min(visibleSectionIndexes.length - 1, currentPosition + delta));
      const nextIdx = visibleSectionIndexes[nextPosition] ?? currentIdx;
      if (nextIdx === currentIdx) return;
      if (dockObsClient.isConnected) {
        await goLiveSection(nextIdx);
        return;
      }
      await pushSection(nextIdx);
    },
    [activeSectionIndex, goLiveSection, pushSection, selectedSong, visibleSectionIndexes],
  );

  const handleShowCurrent = useCallback(async () => {
    if (activeSectionIndex === null) return;
    await pushSection(activeSectionIndex);
  }, [activeSectionIndex, pushSection]);

  const handleClearLyrics = useCallback(async () => {
    setActionError("");
    setVisibleIdx(null);
    setSelectedIdx(null);
    setShowWorshipBackgroundOnly(false);
    onStage(null);
    showToast("Worship cleared");

    try {
      await ensureObsConnected();
      await dockObsClient.clearWorshipLyrics();
    } catch (err) {
      console.warn("[DockWorshipTab] clear worship failed:", err);
    }
  }, [onStage, showToast]);

  const handleShowWorshipBackgroundOnly = useCallback(async () => {
    if (activeSectionIndex === null) return;
    const nextBackgroundOnly = !showWorshipBackgroundOnly;
    setShowWorshipBackgroundOnly(nextBackgroundOnly);
    setActionError("");

    await goLiveSection(activeSectionIndex, { backgroundOnly: nextBackgroundOnly });
  }, [activeSectionIndex, goLiveSection, showWorshipBackgroundOnly]);

  const restageCurrent = useCallback(
    async () => {
      if (activeSectionIndex === null || !selectedSong) return;
      await goLiveSection(activeSectionIndex);
    },
    [activeSectionIndex, goLiveSection, selectedSong],
  );

  const prevOverlayMode = useRef(overlayMode);
  useEffect(() => {
    const changed = prevOverlayMode.current !== overlayMode;
    prevOverlayMode.current = overlayMode;
    if (!changed) return;
    if (suppressAutoProjectionRef.current) return;
    if (selectedSong && activeSectionIndex !== null) {
      void restageCurrent();
    }
  }, [activeSectionIndex, overlayMode, restageCurrent, selectedSong]);

  const prevThemeSignature = useRef(`${selectedFSTheme.id}:${selectedLTTheme.id}`);
  useEffect(() => {
    const nextSignature = `${selectedFSTheme.id}:${selectedLTTheme.id}`;
    const changed = prevThemeSignature.current !== nextSignature;
    prevThemeSignature.current = nextSignature;
    if (!changed) return;
    if (suppressAutoProjectionRef.current) return;
    if (selectedSong && activeSectionIndex !== null) {
      void restageCurrent();
    }
  }, [activeSectionIndex, restageCurrent, selectedFSTheme.id, selectedLTTheme.id, selectedSong]);

  const prevFullscreenQuickSettingsSignature = useRef(
    JSON.stringify(activeFullscreenQuickThemeSettings),
  );
  useEffect(() => {
    const nextSignature = JSON.stringify(activeFullscreenQuickThemeSettings);
    const changed = prevFullscreenQuickSettingsSignature.current !== nextSignature;
    prevFullscreenQuickSettingsSignature.current = nextSignature;
    if (!changed) return;
    if (suppressAutoProjectionRef.current) return;
    if (overlayMode === "fullscreen" && selectedSong && activeSectionIndex !== null) {
      void restageCurrent();
    }
  }, [
    activeSectionIndex,
    activeFullscreenQuickThemeSettings,
    overlayMode,
    restageCurrent,
    selectedSong,
  ]);

  // Push lower-third worship to OBS whenever its own quick settings change.
  const prevLowerThirdFsSignature = useRef(
    JSON.stringify(effectiveSelectedLTTheme.settings),
  );
  useEffect(() => {
    const nextSignature = JSON.stringify(effectiveSelectedLTTheme.settings);
    const changed = prevLowerThirdFsSignature.current !== nextSignature;
    prevLowerThirdFsSignature.current = nextSignature;
    if (!changed) return;
    if (overlayMode !== "lower-third") return;
    if (suppressAutoProjectionRef.current) return;

    if (!selectedSong || activeSectionIndex === null) return;
    const section = selectedSongSections[activeSectionIndex];
    if (!section) return;

    const obsData = {
      sectionText: section.text,
      sectionLabel: cleanWorshipSectionLabel(section.label),
      songTitle: selectedSong.title,
      artist: selectedSong.artist,
      overlayMode: "lower-third" as const,
      bibleThemeSettings: effectiveSelectedLTTheme.settings as unknown as Record<string, unknown>,
      liveOverrides: null,
      backgroundOnly: showWorshipBackgroundOnly,
    };
    ensureObsConnected()
      .then(() => dockObsClient.pushWorshipLyrics(obsData))
      .catch((err) => {
        console.warn("[DockWorshipTab] Lower-third auto-push on quick settings change failed:", err);
      });
  }, [
    activeSectionIndex,
    effectiveSelectedLTTheme.settings,
    overlayMode,
    selectedSong,
    selectedSongSections,
    showWorshipBackgroundOnly,
  ]);

  const prevLinesPerSlide = useRef(linesPerSlide);
  useEffect(() => {
    const changed = prevLinesPerSlide.current !== linesPerSlide;
    prevLinesPerSlide.current = linesPerSlide;
    if (!changed) return;
    if (suppressAutoProjectionRef.current) return;
    if (selectedSong && activeSectionIndex !== null) {
      void restageCurrent();
    }
  }, [activeSectionIndex, linesPerSlide, restageCurrent, selectedSong]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement = target instanceof Element ? target : null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Escape") {
        if (songEditor || slideEditor || isNewSongModalOpen || onlineSearchOpen) {
          event.preventDefault();
          setSongEditor(null);
          setSlideEditor(null);
          setIsNewSongModalOpen(false);
          setOnlineSearchOpen(false);
          setNewSongSource(null);
          return;
        }
        if (targetElement?.closest(".dtb-modal, .dock-dialog")) return;
        event.preventDefault();
        handleClearLyrics();
        return;
      }

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (!selectedSong || visibleSectionIndexes.length === 0) return;

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        void navigateSection(1);
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        void navigateSection(-1);
      } else if (event.key === "Enter" && activeSectionIndex !== null) {
        event.preventDefault();
        void handleShowCurrent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeSectionIndex,
    handleClearLyrics,
    handleShowCurrent,
    isNewSongModalOpen,
    navigateSection,
    onlineSearchOpen,
    selectedSong,
    slideEditor,
    songEditor,
    visibleSectionIndexes.length,
  ]);

  return (
    <div className="dock-module dock-module--worship">
      {/* Song Browser (when no song selected) */}
      {!selectedSong ? (
        <>
          <section className="dock-console-panel dock-console-panel--toolbar">
            <div className="dock-console-header">
              <div>
                <div className="dock-console-header__eyebrow"></div>
                <div className="dock-console-header__eyebrow"></div>
                <div className="dock-console-header__eyebrow"></div>
                <div className="dock-console-header__eyebrow">Song Browser</div>
                <div className="dock-console-header__eyebrow"></div>

              </div>
              <div className="dock-console-actions dock-console-actions--song-browser">
                <button
                  type="button"
                  className="dock-console-toggle"
                  onClick={() => {
                    setOnlineSearchQuery(searchQuery.trim());
                    setOnlineSearchOpen(true);
                    setOnlineSearchError("");
                  }}
                  title="Search Online"
                  aria-label="Search Online"
                >
                  <Icon name="travel_explore" size={13} />
                  <span className="dock-console-toggle__label">Search Online</span>
                </button>
                <button
                  type="button"
                  className="dock-console-toggle"
                  onClick={() => openNewSongModal()}
                  title="Add Song"
                  aria-label="Add Song"
                >
                  <Icon name="add" size={13} />
                  <span className="dock-console-toggle__label">Add Song</span>
                </button>
              </div>
            </div>
            <div className="dock-search dock-search--console" style={{ marginBottom: 0 }} ref={searchRef}>
              <Icon name="search" size={14} className="dock-search__icon" />
              <input
                className="dock-input"
                placeholder="Search title or artist..."
                value={searchQuery}
                onChange={(event) => {
                  const next = event.target.value;
                  setSearchQuery(next);
                  setShowRecentSearches(next.trim().length === 0 && recentSearches.length > 0);
                }}
                onFocus={() => {
                  if (!searchQuery.trim() && recentSearches.length > 0) {
                    setShowRecentSearches(true);
                  }
                }}
                aria-label="Search songs"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="dock-search__clear"
                  onClick={() => {
                    setSearchQuery("");
                    setShowRecentSearches(recentSearches.length > 0);
                  }}
                  aria-label="Clear song search"
                  title="Clear song search"
                >
                  <Icon name="close" size={13} />
                </button>
              )}
              {showRecentSearches && !searchQuery.trim() && recentSearches.length > 0 && (
                <div className="dock-search-dropdown dock-search-dropdown--recent">
                  <div className="dock-search-dropdown__heading">Recent searches</div>
                  {recentSearches.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className="dock-search-dropdown__item dock-search-dropdown__item--recent"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyRecentWorshipSearch(item)}
                    >
                      <span className="dock-search-dropdown__content">
                        <span className="dock-search-dropdown__label">{item}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="dock-console-panel dock-console-panel--workspace dock-worship-workspace" data-toolbar-collapsed={toolbarCollapsed || undefined}>
            {filteredSongs.length === 0 ? (
              <div className="dock-empty dock-worship-workspace__empty">
                <Icon name={songs.length === 0 ? "music_off" : "search_off"} size={20} />
                <div className="dock-empty__title">
                  {songs.length === 0 ? "No Songs Yet" : "No Matches"}
                </div>
                <div className="dock-empty__text">
                  {songs.length === 0
                    ? "Load songs in the main app to use them in the dock."
                    : `No songs match "${searchQuery}".`}
                </div>
              </div>
            ) : (
              <div className="dock-console-list dock-worship-workspace__list">
                {filteredSongs.map((song) => {
                  const isLocked = lockedSongIds.has(song.id);
                  return (
                    <div
                      key={song.id}
                      className={`dock-card dock-card--console dock-song-card${isLocked ? " dock-song-card--locked" : ""}`}
                    >
                      <button
                        type="button"
                        className="dock-song-card__main"
                        onClick={() => {
                          if (isLocked) {
                            void requireEntitlement("songs", 0);
                            return;
                          }
                          handleSelectSong(song);
                        }}
                      >
                        <span className="dock-card__title">{song.title}</span>
                        <span className="dock-card__subtitle">
                          {song.artist || "Unknown artist"}
                        </span>
                        {isLocked && (
                          <span className="dock-song-card__lock-badge">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            Upgrade
                          </span>
                        )}
                      </button>
                      {!isLocked && (
                        <button
                          type="button"
                          className="dock-song-card__edit"
                          onClick={(event) => {
                            event.stopPropagation();
                            openSongEditor(song);
                          }}
                          aria-label={`Edit ${song.title}`}
                          title="Edit song"
                        >
                          <Icon name="edit" size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {/* Song Summary Header */}
          <section className="dock-console-panel dock-console-panel--toolbar dock-worship-summary">
            <div className="dock-worship-summary__header">
              <div className="dock-worship-summary__left">
                <button
                  type="button"
                  className="dock-worship-back-btn"
                  onClick={handleBackToSongList}
                >
                  <Icon name="arrow_back" size={14} />
                  {/* <span>Back to Songs</span> */}
                </button>
                <div className="dock-worship-summary__copy">
                  <div className="dock-worship-summary__title">{selectedSong.title}</div>
                  {selectedSong.artist && (
                    <div className="dock-worship-summary__artist">{selectedSong.artist}</div>
                  )}
                  <div className="dock-worship-summary__meta">
                    <span>{selectedSongSections.length} slides</span>
                    <span className="dock-worship-summary__meta-dot">·</span>
                    <span>{linesPerSlide} lines/slide</span>
                  </div>
                </div>
              </div>
              <div className="dock-worship-summary__actions">
                <button
                  type="button"
                  className="dock-shell-icon-btn"
                  onClick={() => openSongEditor(selectedSong)}
                  title="Edit song"
                >
                  <Icon name="edit" size={14} />
                </button>
              </div>
            </div>
          </section>

          {/* Lyrics Search */}
          <section className="dock-console-panel dock-console-panel--toolbar dock-worship-lyrics-search">
            <div className="dock-media-search">
              <Icon name="search" size={14} className="dock-media-search__icon" />
              <input
                className="dock-media-search__input"
                placeholder="Search lyrics..."
                value={lyricsSearchQuery}
                onChange={(e) => setLyricsSearchQuery(e.target.value)}
                aria-label="Search lyrics"
              />
              {lyricsSearchQuery && (
                <button
                  type="button"
                  className="dock-media-search__clear"
                  onClick={() => setLyricsSearchQuery("")}
                  aria-label="Clear lyrics search"
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
          </section>

          {/* Cue List */}
          <section className="dock-console-panel dock-console-panel--workspace dock-worship-workspace" data-toolbar-collapsed={toolbarCollapsed || undefined}>


            {selectedSongSections.length === 0 || visibleSectionIndexes.length === 0 ? (
              <div className="dock-empty dock-worship-workspace__empty">
                <Icon name="lyrics" size={18} />
                <div className="dock-empty__text">
                  {selectedSongSections.length === 0
                    ? "This song does not have any slideable lyrics yet."
                    : "All slides are hidden for this line setting."}
                </div>
              </div>
            ) : lyricsFilteredSectionIndexes.length === 0 ? (
              <div className="dock-empty dock-worship-workspace__empty">
                <Icon name="search_off" size={18} />
                <div className="dock-empty__text">
                  {`No slides match "${lyricsSearchQuery}".`}
                </div>
              </div>
            ) : (
              <div className="dock-console-list dock-worship-workspace__list dock-worship-slide-queue">
                {lyricsFilteredSectionIndexes.map((idx) => {
                  const section = selectedSongSections[idx];
                  if (!section) return null;
                  const displayLabel = cleanWorshipSectionLabel(section.label);
                  const isVisible = visibleIdx === idx;
                  const isSelected = selectedIdx === idx;
                  return (
                    <div
                      key={section.id}
                      className={`dock-worship-slide-card${isVisible ? " dock-worship-slide-card--visible" : ""}${isSelected && !isVisible ? " dock-worship-slide-card--selected" : ""}`}
                    >
                      <button
                        type="button"
                        className="dock-worship-slide-card__main"
                        onClick={() => handleSectionClick(idx)}
                      >
                        <div className="dock-worship-slide-card__header">
                          <div className="dock-worship-slide-card__label">
                            {displayLabel ? (
                              <span className="dock-worship-slide-card__name">{displayLabel}</span>
                            ) : (
                              <span className="dock-worship-slide-card__name dock-worship-slide-card__name--muted">
                                Slide {idx + 1}
                              </span>
                            )}
                            <span className="dock-worship-slide-card__index">{idx + 1}</span>
                          </div>
                          <div className="dock-worship-slide-card__badges">
                            {isVisible && (
                              <span className="dock-worship-slide-card__badge dock-worship-slide-card__badge--visible">
                                <Icon name="visibility" size={8} />
                                Showing
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="dock-worship-slide-card__text">{section.text}</div>
                      </button>
                      <div className="dock-worship-slide-card__actions">
                        <button
                          type="button"
                          className="dock-worship-slide-card__action"
                          onClick={() => openSlideEditor(idx)}
                          title="Edit slide"
                        >
                          <Icon name="edit" size={12} />
                        </button>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Output Controls */}
          {selectedSong && (
            <section className="dock-console-panel dock-console-panel--deck dock-console-panel--deck-static dock-console-panel--deck-worship">
              {actionError && (
                <div className="dock-action-error dock-action-error--console">
                  <Icon name="warning" size={14} />
                  <span style={{ flex: 1 }}>{actionError}</span>
                  <button
                    type="button"
                    onClick={() => setActionError("")}
                    style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              )}

              <div className="dock-worship-toolbar">
                <DockBottomToolbar
                  overlayMode={overlayMode}
                  onModeChange={setOverlayMode}
                  clearLabel="Clear"
                  onClear={handleClearLyrics}
                  collapsed={toolbarCollapsed}
                  onCollapseChange={setToolbarCollapsed}
                >
                  <button
                    type="button"
                    className={`dock-btm-toolbar__icon-btn${showWorshipBackgroundOnly ? " dock-btm-toolbar__icon-btn--active" : ""}`}
                    onClick={handleShowWorshipBackgroundOnly}
                    title={showWorshipBackgroundOnly ? "Show with lyrics" : "Background only"}
                  >
                    <Icon name={showWorshipBackgroundOnly ? "visibility_off" : "visibility"} size={14} />
                  </button>

                  <div
                    className={`dock-line-popover dock-line-popover--toolbar${showLineCountPopover ? " is-open" : ""}`}
                    ref={lineCountPopoverRef}
                  >
                    <button
                      type="button"
                      className={`dock-btm-toolbar__icon-btn${showLineCountPopover ? " dock-btm-toolbar__icon-btn--active" : ""}`}
                      onClick={() => setShowLineCountPopover((current) => !current)}
                      aria-haspopup="dialog"
                      aria-expanded={showLineCountPopover}
                      title="Lines per slide"
                    >
                      <Icon name="text_fields" size={14} />
                    </button>

                    {showLineCountPopover && (
                      <div className="dock-line-popover__menu" role="dialog" aria-label="Worship line count">
                        <div className="dock-line-popover__title">Lines per slide</div>
                        <div className="dock-line-popover__grid">
                          {Array.from(
                            { length: MAX_LINES_PER_SLIDE - MIN_LINES_PER_SLIDE + 1 },
                            (_, index) => MIN_LINES_PER_SLIDE + index,
                          ).map((count) => (
                            <button
                              key={`worship-line-choice-${count}`}
                              type="button"
                              className={`dock-line-popover__option${linesPerSlide === count ? " dock-line-popover__option--active" : ""}`}
                              onClick={() => handleLinesPerSlideChange(count)}
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
                    title="Quick Edits"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                </DockBottomToolbar>
              </div>
            </section>
          )}
        </>
      )}

      {songEditor && (
        <div className="dock-dialog-backdrop" role="presentation">
          <div className="dock-dialog" role="dialog" aria-modal="true" aria-labelledby="dock-song-editor-title">
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">Edit Song</div>
                <h2 id="dock-song-editor-title" className="dock-dialog__title">Song details</h2>
              </div>
              <button
                type="button"
                className="dock-dialog__close"
                onClick={() => setSongEditor(null)}
                aria-label="Close song editor"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              <div className="dock-dialog__row dock-dialog__row--two">
                <label className="dock-dialog-field">
                  <span className="dock-dialog-field__label">
                    <span>Title</span>
                    <span className="dock-dialog-field__tag dock-dialog-field__tag--required">Required</span>
                  </span>
                  <input
                    className="dock-input"
                    value={songDraft.title}
                    onChange={(event) => setSongDraft((draft) => ({ ...draft, title: event.target.value }))}
                  />
                </label>
                <label className="dock-dialog-field">
                  <span className="dock-dialog-field__label">
                    <span>Artist</span>
                    <span className="dock-dialog-field__tag">Optional</span>
                  </span>
                  <input
                    className="dock-input"
                    value={songDraft.artist}
                    onChange={(event) => setSongDraft((draft) => ({ ...draft, artist: event.target.value }))}
                  />
                </label>
              </div>
              <label className="dock-dialog-field dock-dialog-field--lyrics">
                <span>Lyrics</span>
                <textarea
                  className="dock-input dock-dialog-textarea"
                  value={songDraft.lyrics}
                  onChange={(event) => setSongDraft((draft) => ({ ...draft, lyrics: event.target.value }))}
                />
              </label>
            </div>
            <div className="dock-dialog__footer">
              <button type="button" className="dock-btn dock-btn--ghost" onClick={handleResetSongEditor}>
                Reset to Default
              </button>
              <button
                type="button"
                className="dock-btn dock-btn--primary"
                onClick={() => void handleSaveSongEditor()}
                disabled={savingSong || !songDraft.title.trim() || !songDraft.lyrics.trim()}
              >
                {savingSong ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {slideEditor && (
        <div className="dock-dialog-backdrop" role="presentation">
          <div className="dock-dialog dock-dialog--compact" role="dialog" aria-modal="true" aria-labelledby="dock-slide-editor-title">
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">Quick Edit</div>
                <h2 id="dock-slide-editor-title" className="dock-dialog__title">{slideEditor.label}</h2>
              </div>
              <button
                type="button"
                className="dock-dialog__close"
                onClick={() => setSlideEditor(null)}
                aria-label="Close slide editor"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              <label className="dock-dialog-field">
                <span>Slide text</span>
                <textarea
                  className="dock-input dock-dialog-textarea dock-dialog-textarea--short"
                  value={slideEditor.text}
                  onChange={(event) => setSlideEditor((draft) => draft ? { ...draft, text: event.target.value } : draft)}
                />
              </label>
            </div>
            <div className="dock-dialog__footer">
              <button type="button" className="dock-btn dock-btn--ghost" onClick={() => setSlideEditor(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="dock-btn dock-btn--primary"
                onClick={() => void handleSaveSlideEditor()}
                disabled={savingSong || !slideEditor.text.trim()}
              >
                {savingSong ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isNewSongModalOpen && (
        <div className="dock-dialog-backdrop" role="presentation">
          <div className="dock-dialog" role="dialog" aria-modal="true" aria-labelledby="dock-new-song-title">
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">{newSongSource?.importSourceType === "online" ? "Review Import" : "Add Song"}</div>
                <h2 id="dock-new-song-title" className="dock-dialog__title">
                  {newSongSource?.importSourceType === "online" ? "Review lyrics before saving" : "New worship song"}
                </h2>
              </div>
              <button
                type="button"
                className="dock-dialog__close"
                onClick={() => {
                  setIsNewSongModalOpen(false);
                  setNewSongSource(null);
                }}
                aria-label="Close add song dialog"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              <div className="dock-dialog__row dock-dialog__row--two">
                <label className="dock-dialog-field">
                  <span className="dock-dialog-field__label">
                    <span>Title</span>
                    <span className="dock-dialog-field__tag dock-dialog-field__tag--required">Required</span>
                  </span>
                  <input
                    className="dock-input"
                    value={newSongDraft.title}
                    onChange={(event) => setNewSongDraft((draft) => ({ ...draft, title: event.target.value }))}
                  />
                </label>
                <label className="dock-dialog-field">
                  <span className="dock-dialog-field__label">
                    <span>Artist</span>
                    <span className="dock-dialog-field__tag">Optional</span>
                  </span>
                  <input
                    className="dock-input"
                    value={newSongDraft.artist}
                    onChange={(event) => setNewSongDraft((draft) => ({ ...draft, artist: event.target.value }))}
                  />
                </label>
              </div>
              <label className="dock-dialog-field dock-dialog-field--lyrics">
                <span>Lyrics</span>
                <textarea
                  className="dock-input dock-dialog-textarea"
                  value={newSongDraft.lyrics}
                  onChange={(event) => setNewSongDraft((draft) => ({ ...draft, lyrics: event.target.value }))}
                />
              </label>
            </div>
            <div className="dock-dialog__footer">
              <button
                type="button"
                className="dock-btn dock-btn--ghost"
                onClick={() => {
                  setIsNewSongModalOpen(false);
                  setNewSongSource(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dock-btn dock-btn--primary"
                onClick={() => void handleSaveNewSong()}
                disabled={savingSong || !newSongDraft.title.trim() || !newSongDraft.lyrics.trim()}
              >
                {savingSong ? "Saving..." : "Save Song"}
              </button>
            </div>
          </div>
        </div>
      )}

      {onlineSearchOpen && (
        <div className="dock-dialog-backdrop" role="presentation">
          <div className="dock-dialog" role="dialog" aria-modal="true" aria-labelledby="dock-online-song-title">
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">Search Online</div>
                <h2 id="dock-online-song-title" className="dock-dialog__title">Import lyrics</h2>
              </div>
              <button
                type="button"
                className="dock-dialog__close"
                onClick={() => setOnlineSearchOpen(false)}
                aria-label="Close online search"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              <div className="dock-search dock-search--console">
                <Icon name="search" size={14} className="dock-search__icon" />
                <input
                  className="dock-input"
                  placeholder="Type to start searching..."
                  value={onlineSearchQuery}
                  onChange={(event) => setOnlineSearchQuery(event.target.value)}
                  aria-label="Search online lyrics"
                  autoFocus
                />
                {onlineSearchQuery && (
                  <button
                    type="button"
                    className="dock-search__clear"
                    onClick={() => setOnlineSearchQuery("")}
                    aria-label="Clear online lyrics search"
                    title="Clear online lyrics search"
                  >
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>
              {onlineSearchLoading && (
                <div className="dock-dialog__status">
                  <Icon name="sync" size={13} />
                  Searching online sources...
                </div>
              )}
              {onlineSearchError && <div className="dock-dialog__error">{onlineSearchError}</div>}
              <div className="dock-dialog-results">
                {onlineResults.map((result) => (
                  <div className="dock-dialog-result" key={result.id}>
                    <div className="dock-dialog-result__body">
                      <span className="dock-dialog-result__title">{result.title}</span>
                      <span className="dock-dialog-result__meta">
                        {[result.artist, result.sourceName].filter(Boolean).join(" · ") || "Online lyrics"}
                      </span>
                      {result.preview && <span className="dock-dialog-result__preview">{result.preview}</span>}
                    </div>
                    <button
                      type="button"
                      className="dock-btn dock-btn--ghost dock-dialog-result__action"
                      onClick={() => handleImportOnlineResult(result)}
                    >
                      Import
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theme Settings Modal */}
      <DockThemeSettingsModal
        selectedThemeId={null}
        onSelect={() => { }}
        allowedCategories={["worship", "general"]}
        quickSettings={
          overlayMode === "fullscreen"
            ? savedFullscreenQuickThemeSettings ?? extractQuickThemeSettings(effectiveSelectedFSTheme.settings)
            : savedLowerThirdQuickThemeSettings ?? extractQuickThemeSettings(effectiveSelectedLTTheme.settings)
        }
        defaultQuickSettings={
          overlayMode === "fullscreen"
            ? extractQuickThemeSettings(effectiveSelectedFSTheme.settings)
            : extractQuickThemeSettings(effectiveSelectedLTTheme.settings)
        }
        onQuickSettingsSave={(next) => {
          if (overlayMode === "fullscreen") {
            setSavedFullscreenQuickThemeSettings(next);
          } else {
            setSavedLowerThirdQuickThemeSettings(next);
          }
        }}
        onQuickSettingsChange={(next) => {
          if (overlayMode === "fullscreen") {
            setFullscreenQuickThemeSettings(next);
          } else {
            setLowerThirdQuickThemeSettings(next);
          }
        }}
        title="Quick Settings"
        subtitle="Adjust verse text, spacing, and colors for your worship overlay."
        isOpen={showThemeSettings}
        onClose={() => setShowThemeSettings(false)}
        overlayMode={overlayMode}
        showReferences={false}
      />

      {toasts.length > 0 && (
        <div className="dock-toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`dock-toast dock-toast--${toast.tone}`}>
              {toast.tone === "success" && <Icon name="check" size={13} />}
              {toast.tone === "error" && <Icon name="warning" size={13} />}
              {toast.tone === "info" && <Icon name="check_circle" size={13} />}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
