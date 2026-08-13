/**
 * DockWorshipTab.tsx — Worship tab for the MakeChurchEasy Dock
 *
 * Dense operator console for song browsing, lyric cueing, and live transport.
 */

import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue, startTransition } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { DockStagedItem, DockWorshipSection } from "../dockTypes";
import type { DockPresentationOutputTarget } from "../dockPresentationTarget";
import { isPresentationLinkTarget } from "../dockPresentationTarget";
import { dockObsClient, type DockTabContentPushData } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import { BUILTIN_THEMES } from "../../bible/themes/builtinThemes";
import {
  DEFAULT_THEME_SETTINGS,
  type BibleTheme,
  type BibleThemeSettings,
} from "../../bible/types";
import { withScriptureFontFallback } from "../../bible/scriptureFont";
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
import {
  autoSplitLyricsText,
  extractStructuredTextTitle,
  generateSlides,
} from "../../worship/slideEngine";
import type { Song } from "../../worship/types";
import { nextAutoSongTitle } from "../../worship/songTitleAutoGen";
import {
  formatOnlineLyricsSearchError,
  searchOnlineSongLyrics,
  type OnlineLyricsSearchResult,
} from "../../worship/onlineLyricsService";
import { unicodeStripDiacritics } from "../../worship/unicodeUtils";
import type { DockFullscreenQuickThemeSettings } from "../components/DockFullscreenThemeQuickSettings";
import { loadDockFavoriteBibleThemes } from "../dockThemeData";
import Icon from "../DockIcon";
import DockBottomToolbar from "../components/DockBottomToolbar";
import DockSceneRoutingControl from "../components/DockSceneRoutingControl";
import DockThemeSettingsModal from "../components/DockThemeSettingsModal";
import DockTranslationControls, {
  type DockTranslationValue,
} from "../components/DockTranslationControls";
import DockOutputQuickActions, {
  DEFAULT_DOCK_OUTPUT_QUICK_ACTIONS_TOP,
  type DockOutputQuickTextSettings,
} from "../components/DockOutputQuickActions";
import { requireEntitlement } from "../dockEntitlement";
import {
  areQuickThemeSettingsEquivalent,
  buildLinkedLowerThirdQuickThemeSettings,
  mergeQuickThemeBackground,
} from "../lowerThirdQuickSettings";
import { getUserScopedKey } from "../../services/userScopedStorage";
import {
  loadDockPreference,
  readDockPreference,
  saveDockPreference,
} from "../../services/dockPreferenceStorage";
import { themeSupportsBibleOverlayMode } from "../../bible/themeVariantSupport";
import { normalizeCompareThemeSettings } from "../compareThemeConfig";
import { useDockSceneRoute } from "../dockSceneRouting";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import DockNotesTab from "./DockNotesTab";
import { getOrderedTranslationParts, normalizeDockTranslationOrder } from "../dockTranslation";
import { normalizeDockMultilineText } from "../textLineBreaks";

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  productionDefaults: DockProductionModuleSettings;
  isActive?: boolean;
  presentationOutputTarget?: DockPresentationOutputTarget;
  fullscreenOnly?: boolean;
}

type OverlayMode = "fullscreen" | "lower-third";

type WorshipSubTab = "worship" | "notes";

interface DockSong {
  id: string;
  title: string;
  artist: string;
  lyrics: string;
  importSourceName?: string;
  importSourceType?: "manual" | "online" | "document";
  importSourceUrl?: string;
  autoSplit?: boolean;
  linesPerSlide?: number;
  themeId?: string;
}

interface DockWorshipPreferences {
  [key: string]: unknown;
  overlayMode?: OverlayMode;
  fullscreenThemeId?: string;
  lowerThirdThemeId?: string;
  linesPerSlide?: number;
  linesPerSlideOverride?: boolean;
  fullscreenQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickThemeSettingsLinkedToFullscreen?: boolean;
  showPresentationMeta?: boolean;
  updatedAt?: string;
}

interface DockWorshipUiPreferences {
  toolbarCollapsed?: boolean;
  activeSubTab?: WorshipSubTab;
  quickActionsTop?: number;
  quickActionsLeft?: number | null;
  quickUpdateImmediately?: boolean;
}

const DOCK_WORSHIP_PREFS_KEY = "ocs-dock-worship-preferences";
const DOCK_WORSHIP_PREFS_APP_KEY = "dock-worship-preferences";
const DOCK_WORSHIP_UI_PREFS_KEY = "ocs-dock-worship-ui-preferences";
const DOCK_WORSHIP_SONG_DEFAULTS_KEY = "ocs-dock-worship-song-defaults-v1";
const DOCK_WORSHIP_CACHED_SONGS_KEY = "ocs-dock-worship-cached-songs-v1";
const DOCK_WORSHIP_RECENT_SEARCHES_KEY = "ocs-dock-worship-recent-searches-v1";
const MIN_LINES_PER_SLIDE = 1;
const MAX_LINES_PER_SLIDE = 12;
// A new line entered in the song editor is a new verse/slide by default.
// Operators can still choose a larger Auto Split layout when they explicitly
// want multiple lyric lines on one slide.
const DEFAULT_LINES_PER_SLIDE = 1;
const DOCK_WORSHIP_SAVE_TIMEOUT_MS = 15000;
const DOCK_WORSHIP_SAVE_FALLBACK_DELAY_MS = 750;
const DOCK_WORSHIP_SAVE_RESULT_POLL_MS = 500;
const DOCK_WORSHIP_RECENT_SEARCH_LIMIT = 6;

interface DockSongDraft {
  title: string;
  artist: string;
  lyrics: string;
  autoSplit?: boolean;
  linesPerSlide?: number;
}

interface DockSongDefault extends DockSongDraft {
  importSourceName?: string;
  importSourceType?: "manual" | "online" | "document";
  importSourceUrl?: string;
  themeId?: string;
}

type DockSongDefaults = Record<string, DockSongDefault>;
type DockToastTone = "info" | "success" | "error";
type LyricsFormatAction =
  | "autosplit"
  | "clean"
  | "remove-empty"
  | "remove-verse-numbers"
  | "uppercase"
  | "lowercase"
  | "capitalize";

interface DockToast {
  id: string;
  message: string;
  tone: DockToastTone;
}

interface DeletedWorshipSection {
  id: string;
  label: string;
  text: string;
  index: number;
  deletedAt: number;
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

function readScopedWorshipStorage(baseKey: string): string | null {
  try {
    const scopedKey = getUserScopedKey(baseKey);
    const scopedRaw = localStorage.getItem(scopedKey);
    if (scopedRaw !== null || scopedKey === baseKey) return scopedRaw;
    const legacyRaw = localStorage.getItem(baseKey);
    if (legacyRaw !== null) {
      try {
        localStorage.setItem(scopedKey, legacyRaw);
      } catch {
        // Ignore migration failures in OBS browser contexts.
      }
    }
    return legacyRaw;
  } catch {
    return null;
  }
}

function cacheSongsLocally(songs: DockSong[]): void {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_WORSHIP_CACHED_SONGS_KEY), JSON.stringify(songs));
  } catch {
    /* ignore */
  }
}

function loadCachedSongs(): DockSong[] {
  try {
    const raw = readScopedWorshipStorage(DOCK_WORSHIP_CACHED_SONGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
    autoSplit: song.autoSplit,
    linesPerSlide: song.linesPerSlide,
    themeId: song.themeId,
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
      autoSplit: song.autoSplit,
      linesPerSlide: song.linesPerSlide,
      themeId: song.themeId,
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
  importSourceType?: "manual" | "online" | "document";
  importSourceUrl?: string;
  autoSplit?: boolean;
  linesPerSlide?: number;
  themeId?: string;
}): DockSong {
  return {
    id: song.id,
    title: song.metadata.title,
    artist: song.metadata.artist || "",
    lyrics: song.lyrics || "",
    importSourceName: song.importSourceName,
    importSourceType: song.importSourceType,
    importSourceUrl: song.importSourceUrl,
    autoSplit: song.autoSplit,
    linesPerSlide: song.linesPerSlide,
    themeId: song.themeId,
  };
}

const DOCK_SONG_CARD_PREVIEW_LINES = 2;

function getSongCardLyricsPreview(lyrics: string): { lines: string[]; hasMore: boolean } {
  const body = extractStructuredTextTitle(normalizeDockMultilineText(lyrics)).body;
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    lines: lines.slice(0, DOCK_SONG_CARD_PREVIEW_LINES),
    hasMore: lines.length > DOCK_SONG_CARD_PREVIEW_LINES,
  };
}

function loadDockWorshipPreferences(): DockWorshipPreferences {
  return readDockPreference<DockWorshipPreferences>(DOCK_WORSHIP_PREFS_KEY) ?? {};
}

function readDockWorshipOverlayMode(): OverlayMode | null {
  const mode = loadDockWorshipPreferences().overlayMode;
  return mode === "fullscreen" || mode === "lower-third" ? mode : null;
}

function saveDockWorshipPreferences(next: DockWorshipPreferences): void {
  void saveDockPreference(DOCK_WORSHIP_PREFS_KEY, next);
}

function saveDockWorshipOverlayMode(mode: OverlayMode): void {
  saveDockWorshipPreferences({
    ...loadDockWorshipPreferences(),
    overlayMode: mode,
    updatedAt: new Date().toISOString(),
  });
}

function isWorshipSubTab(value: unknown): value is WorshipSubTab {
  return value === "worship" || value === "notes";
}

function loadDockWorshipUiPreferences(): DockWorshipUiPreferences {
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_WORSHIP_UI_PREFS_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DockWorshipUiPreferences;
    if (!parsed || typeof parsed !== "object") return {};
    return {
      toolbarCollapsed: parsed.toolbarCollapsed === true,
      activeSubTab: isWorshipSubTab(parsed.activeSubTab) ? parsed.activeSubTab : undefined,
      quickActionsTop: typeof parsed.quickActionsTop === "number" && Number.isFinite(parsed.quickActionsTop)
        ? parsed.quickActionsTop
        : undefined,
      quickActionsLeft: typeof parsed.quickActionsLeft === "number" && Number.isFinite(parsed.quickActionsLeft)
        ? parsed.quickActionsLeft
        : null,
      quickUpdateImmediately: parsed.quickUpdateImmediately !== false,
    };
  } catch {
    return {};
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
  return loadDockPreference<DockWorshipPreferences>(
    DOCK_WORSHIP_PREFS_KEY,
    [DOCK_WORSHIP_PREFS_APP_KEY],
  ).catch(() => null);
}

function parseLyricSections(
  lyrics: string,
  linesPerSlide: number,
  splitByLineCount = false,
  continuousLineCount = false,
): DockWorshipSection[] {
  if (!lyrics.trim()) return [];

  const effectiveLPS = Math.max(1, linesPerSlide || 2);

  return generateSlides(normalizeDockMultilineText(lyrics), effectiveLPS, splitByLineCount, { continuousLineCount }).map((slide) => ({
    id: slide.id,
    label: slide.isContinuation ? "" : slide.label,
    text: slide.content,
  }));
}

function serializeLyricSections(
  sections: Array<Pick<DockWorshipSection, "label" | "text">>,
  title?: string | null,
): string {
  const content = sections
    .map((section) => {
      const label = section.label.trim();
      return [label ? `${label}:` : "", normalizeDockMultilineText(section.text).trim()].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  return [title ? `[${title}]` : "", content].filter(Boolean).join("\n\n");
}

function capitalizeLyricsText(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line.replace(/\b([A-Za-z])([A-Za-z'’-]*)/g, (_, first: string, rest: string) =>
        `${first.toUpperCase()}${rest.toLowerCase()}`,
      ),
    )
    .join("\n");
}

function applyLyricsFormat(text: string, action: LyricsFormatAction, autosplitLines?: number): string {
  let result = text;

  switch (action) {
    case "clean": {
      result = result
        .split("\n")
        .map((line) => {
          let l = line;
          l = l.replace(/\t/g, " ");
          l = l.replace(/\s{2,}/g, " ");
          l = l.replace(/ ,/g, ",");
          l = l.replace(/ \./g, ".");
          l = l.replace(/ :/g, ":");
          l = l.replace(/([,:;.])([A-Za-z])/g, "$1 $2");
          l = l.replace(/\s+$/g, "");
          l = l.trimStart();
          return l;
        })
        .join("\n");
      break;
    }
    case "remove-empty": {
      const lines = result.split("\n");
      const collapsed: string[] = [];
      let blankCount = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        const isBlank = trimmed === "" || /^[^\w]+$/.test(trimmed);
        if (isBlank) {
          blankCount++;
          if (blankCount <= 1) collapsed.push("");
        } else {
          blankCount = 0;
          collapsed.push(line);
        }
      }
      result = collapsed.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
      break;
    }
    case "remove-verse-numbers": {
      result = result
        .replace(/^\d+[.)]\s*/gm, "")
        .replace(/^\[[\d]+\]\s*/gm, "")
        .replace(/^\([\d]+\)\s*/gm, "")
        .replace(/^Verse\s+\d+\s*:?\s*/gim, "");
      break;
    }
    case "autosplit": {
      const linesPerChunk = Math.max(1, Math.min(6, autosplitLines ?? 3));
      result = autoSplitLyricsText(result, linesPerChunk);
      break;
    }
    case "uppercase":
      result = result.toLocaleUpperCase();
      break;
    case "lowercase":
      result = result.toLocaleLowerCase();
      break;
    case "capitalize":
      result = capitalizeLyricsText(result);
      break;
  }

  return result;
}

interface DockLyricsEditorDialogProps {
  dialogId: string;
  eyebrow: string;
  title: string;
  initialDraft: DockSongDraft;
  saveLabel: string;
  cancelLabel: string;
  resetLabel?: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: DockSongDraft) => Promise<void>;
  onReset?: () => DockSongDraft | null;
  onDraftChange?: (draft: DockSongDraft) => void;
}

function DockLyricsEditorDialog({
  dialogId,
  eyebrow,
  title,
  initialDraft,
  saveLabel,
  cancelLabel,
  resetLabel,
  saving,
  onCancel,
  onSave,
  onReset,
  onDraftChange,
}: DockLyricsEditorDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DockSongDraft>(initialDraft);
  const [autoSplitOpen, setAutoSplitOpen] = useState(false);
  const autoSplitPopoverRef = useRef<HTMLDivElement>(null);
  const autoSplitSourceRef = useRef<string | null>(null);

  // Keep the live preview useful without sending the whole DockWorshipTab
  // through a render for every character typed in the editor.
  useEffect(() => {
    if (!onDraftChange) return;
    const timer = window.setTimeout(() => {
      startTransition(() => onDraftChange(draft));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [draft, onDraftChange]);

  useEffect(() => {
    if (!autoSplitOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (autoSplitPopoverRef.current && !autoSplitPopoverRef.current.contains(event.target as Node)) {
        setAutoSplitOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [autoSplitOpen]);

  const formatDraft = useCallback((action: LyricsFormatAction, autosplitLines?: number) => {
    setDraft((current) => {
      if (action === "autosplit") {
        const sourceLyrics = autoSplitSourceRef.current ?? current.lyrics;
        autoSplitSourceRef.current = sourceLyrics;
        return {
          ...current,
          lyrics: applyLyricsFormat(sourceLyrics, action, autosplitLines),
          autoSplit: true,
          linesPerSlide: Math.max(1, Math.min(6, autosplitLines ?? DEFAULT_LINES_PER_SLIDE)),
        };
      }
      autoSplitSourceRef.current = null;
      return { ...current, lyrics: applyLyricsFormat(current.lyrics, action, autosplitLines) };
    });
  }, []);

  const handleReset = useCallback(() => {
    const nextDraft = onReset?.();
    if (!nextDraft) return;
    autoSplitSourceRef.current = null;
    setDraft(nextDraft);
  }, [onReset]);

  const handleSave = useCallback(() => {
    if (saving || !draft.title.trim() || !draft.lyrics.trim()) return;
    void onSave(draft);
  }, [draft, onSave, saving]);

  return (
    <div className="dock-dialog-backdrop" role="presentation">
      <div className="dock-dialog" role="dialog" aria-modal="true" aria-labelledby={dialogId}>
        <div className="dock-dialog__header">
          <div>
            <div className="dock-dialog__eyebrow">{eyebrow}</div>
            <h2 id={dialogId} className="dock-dialog__title">{title}</h2>
          </div>
          <button
            type="button"
            className="dock-dialog__close"
            onClick={onCancel}
            aria-label={t('common.close')}
            title={t('common.close')}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="dock-dialog__body">
          <div className="dock-dialog__row dock-dialog__row--two">
            <label className="dock-dialog-field">
              <span className="dock-dialog-field__label">
                <span>{t('worship.songTitle')}</span>
                <span className="dock-dialog-field__tag dock-dialog-field__tag--required">{t('worship.required')}</span>
              </span>
              <input
                className="dock-input"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="dock-dialog-field">
              <span className="dock-dialog-field__label">
                <span>{t('worship.artist')}</span>
                <span className="dock-dialog-field__tag">{t('worship.optional')}</span>
              </span>
              <input
                className="dock-input"
                value={draft.artist}
                onChange={(event) => setDraft((current) => ({ ...current, artist: event.target.value }))}
              />
            </label>
          </div>
          <label className="dock-dialog-field dock-dialog-field--lyrics">
            <span>{t('worship.songLyrics')}</span>
            <div className="dock-lyrics-toolbar" role="toolbar" aria-label="Lyrics formatting tools">
              <div className="dock-lyrics-toolbar__actions">
                <div className="dock-lyrics-autosplit" ref={autoSplitPopoverRef}>
                  <button
                    type="button"
                    className={`dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--icon dock-lyrics-toolbar__btn--accent${autoSplitOpen ? " dock-lyrics-toolbar__btn--active" : ""}`}
                    onClick={() => setAutoSplitOpen((current) => !current)}
                    title="Auto Split"
                    aria-label="Auto Split"
                    aria-haspopup="menu"
                    aria-expanded={autoSplitOpen}
                  >
                    <Icon name="format_align_left" size={12} />
                    <span className="dock-lyrics-toolbar__caret">▾</span>
                  </button>
                  {autoSplitOpen && (
                    <div className="dock-lyrics-autosplit__menu" role="menu" aria-label="Auto split options">
                      {[2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          className="dock-lyrics-autosplit__option"
                          onClick={() => {
                            formatDraft("autosplit", count);
                            setAutoSplitOpen(false);
                          }}
                        >
                          {count} lines
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--icon"
                  onClick={() => formatDraft("clean")}
                  title="Clean Text"
                  aria-label="Clean Text">
                  <Icon name="auto_fix_high" size={12} />
                </button>
                <button
                  type="button"
                  className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--icon dock-lyrics-toolbar__btn--toggle"
                  onClick={() => formatDraft("remove-verse-numbers")}
                  title="Verse Numbers"
                  aria-label="Verse Numbers">
                  <Icon name="tag" size={12} />
                </button>
              </div>
              <div className="dock-lyrics-toolbar__group" role="group" aria-label="Text case controls">
                <button
                  type="button"
                  className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--case"
                  onClick={() => formatDraft("uppercase")}
                  title={t("bible.uppercase")}
                  aria-label={t("bible.uppercase")}>
                  <span>AA</span>
                </button>
                <button
                  type="button"
                  className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--case"
                  onClick={() => formatDraft("lowercase")}
                  title="Lowercase"
                  aria-label="Lowercase">
                  <span>aa</span>
                </button>
                <button
                  type="button"
                  className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--case"
                  onClick={() => formatDraft("capitalize")}
                  title={t("common.capitalize")}
                  aria-label={t("common.capitalize")}>
                  <span>Aa</span>
                </button>
              </div>
            </div>
            <textarea
              className="dock-input dock-dialog-textarea"
              value={draft.lyrics}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") event.stopPropagation();
              }}
              onChange={(event) => {
                autoSplitSourceRef.current = null;
                setDraft((current) => ({ ...current, lyrics: event.target.value }));
              }}
            />
          </label>
        </div>
        <div className="dock-dialog__footer">
          {resetLabel && onReset && (
            <button type="button" className="dock-btn dock-btn--ghost" onClick={handleReset} title={resetLabel}>
              {resetLabel}
            </button>
          )}
          <button type="button" className="dock-btn dock-btn--ghost" onClick={onCancel} title={cancelLabel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="dock-btn dock-btn--primary"
            onClick={handleSave}
            disabled={saving || !draft.title.trim() || !draft.lyrics.trim()}
            title={saveLabel}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
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

function sanitizeCssPadding(value: unknown, fallback = DEFAULT_THEME_SETTINGS.lowerThirdCardPadding ?? "18px 28px"): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^-?\d+(?:\.\d+)?px(?:\s+-?\d+(?:\.\d+)?px){0,3}$/.test(trimmed)
    ? trimmed
    : fallback;
}

function sanitizeLowerThirdEdge(value: unknown): BibleThemeSettings["lowerThirdEdge"] {
  return value === "top" || value === "bottom" || value === "left" || value === "right"
    ? value
    : DEFAULT_THEME_SETTINGS.lowerThirdEdge;
}

function sanitizeLowerThirdPaddingLinked(value: unknown): boolean {
  return typeof value === "boolean" ? value : Boolean(DEFAULT_THEME_SETTINGS.lowerThirdPaddingLinked);
}

function sanitizeLowerThirdCardRadius(value: unknown): number {
  return clampNumber(Number(value ?? DEFAULT_THEME_SETTINGS.lowerThirdCardRadius ?? 18), 0, 64);
}

function sanitizeLowerThirdTextDirection(value: unknown): BibleThemeSettings["lowerThirdTextDirection"] {
  return value === "inverted" ? "inverted" : "normal";
}

function extractQuickThemeSettings(settings: BibleThemeSettings): DockFullscreenQuickThemeSettings {
  const compareSettings = normalizeCompareThemeSettings(settings as unknown as Record<string, unknown>);
  return {
    fontSize: clampNumber(settings.fontSize, 28, 200),
    autoFontScale: settings.autoFontScale === true,
    fontFamily: withScriptureFontFallback(settings.fontFamily || DEFAULT_THEME_SETTINGS.fontFamily),
    refFontSize: clampNumber(settings.refFontSize, 14, 150),
    refFontWeight: settings.refFontWeight || DEFAULT_THEME_SETTINGS.refFontWeight,
    fontColor: settings.fontColor || DEFAULT_THEME_SETTINGS.fontColor,
    refFontColor: settings.refFontColor || settings.fontColor || DEFAULT_THEME_SETTINGS.refFontColor,
    refPosition: settings.refPosition || DEFAULT_THEME_SETTINGS.refPosition,
    refAnchor: settings.refAnchor || DEFAULT_THEME_SETTINGS.refAnchor || "normal",
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
    backgroundPattern: settings.backgroundPattern ?? "",
    lowerThirdCaptionPosition: settings.lowerThirdCaptionPosition || "bottom",
    lowerThirdEdge: sanitizeLowerThirdEdge(settings.lowerThirdEdge),
    lowerThirdCardPadding: sanitizeCssPadding(settings.lowerThirdCardPadding),
    lowerThirdPaddingLinked: sanitizeLowerThirdPaddingLinked(settings.lowerThirdPaddingLinked),
    lowerThirdCardRadius: sanitizeLowerThirdCardRadius(settings.lowerThirdCardRadius),
    lowerThirdTextDirection: sanitizeLowerThirdTextDirection(settings.lowerThirdTextDirection),
    compareTranslationWidth: compareSettings.compareLeftWidth,
    ...compareSettings,
  };
}

function buildDefaultLowerThirdQuickThemeSettings(
  settings: BibleThemeSettings,
  backgroundType?: DockFullscreenQuickThemeSettings["backgroundType"],
): DockFullscreenQuickThemeSettings {
  return {
    ...extractQuickThemeSettings(settings),
    backgroundType: backgroundType ?? "theme",
  };
}

function sanitizeQuickThemeSettings(
  value: unknown,
): DockFullscreenQuickThemeSettings | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<DockFullscreenQuickThemeSettings>;
  const fontWeight =
    source.fontWeight === "light" || source.fontWeight === "normal" || source.fontWeight === "bold" || source.fontWeight === "extrabold"
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
    // Preserve style fields introduced by newer builds instead of silently
    // dropping them the next time the dock hydrates and saves preferences.
    ...source,
    fontSize: clampNumber(Number(source.fontSize ?? DEFAULT_THEME_SETTINGS.fontSize), 28, 200),
    autoFontScale: source.autoFontScale === true,
    fontFamily: withScriptureFontFallback(
      typeof source.fontFamily === "string" ? source.fontFamily : DEFAULT_THEME_SETTINGS.fontFamily,
    ),
    refFontSize: clampNumber(
      Number(source.refFontSize ?? DEFAULT_THEME_SETTINGS.refFontSize),
      14,
      150,
    ),
    refFontWeight: (source.refFontWeight as BibleThemeSettings["refFontWeight"]) || DEFAULT_THEME_SETTINGS.refFontWeight,
    fontColor: sanitizeColor(source.fontColor, DEFAULT_THEME_SETTINGS.fontColor),
    refFontColor: sanitizeColor(source.refFontColor, DEFAULT_THEME_SETTINGS.refFontColor),
    refPosition: (source.refPosition as BibleThemeSettings["refPosition"]) || DEFAULT_THEME_SETTINGS.refPosition,
    refAnchor:
      source.refAnchor === "top" || source.refAnchor === "bottom" || source.refAnchor === "normal"
        ? source.refAnchor
        : (DEFAULT_THEME_SETTINGS.refAnchor ?? "normal"),
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
    backgroundPattern: typeof source.backgroundPattern === "string" ? source.backgroundPattern : "",
    lowerThirdCaptionPosition:
      source.lowerThirdCaptionPosition === "top" || source.lowerThirdCaptionPosition === "bottom"
        ? source.lowerThirdCaptionPosition
        : "bottom",
    lowerThirdEdge: sanitizeLowerThirdEdge(source.lowerThirdEdge),
    lowerThirdCardPadding: sanitizeCssPadding(source.lowerThirdCardPadding),
    lowerThirdPaddingLinked: sanitizeLowerThirdPaddingLinked(source.lowerThirdPaddingLinked),
    lowerThirdCardRadius: sanitizeLowerThirdCardRadius(source.lowerThirdCardRadius),
    lowerThirdTextDirection: sanitizeLowerThirdTextDirection(source.lowerThirdTextDirection),
    compareTranslationWidth: compareSettings.compareLeftWidth,
    backgroundType: source.backgroundType,
    ...compareSettings,
  };
}

function applyQuickThemeSettings(
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
  const useCustomBg = bgType !== "theme" && bgType !== "off";
  const effectiveShadeOpacity =
    useCustomBg && quickSettings.fullscreenShadeOpacity >= 1
      ? 0.42
      : quickSettings.fullscreenShadeOpacity;
  const compareSettings = normalizeCompareThemeSettings(quickSettings as Record<string, unknown>);
  return {
    ...theme,
    settings: {
      ...theme.settings,
      fontSize: quickSettings.fontSize,
      autoFontScale: quickSettings.autoFontScale === true,
      fontFamily: quickSettings.fontFamily,
      refFontSize: quickSettings.refFontSize,
      fontColor: quickSettings.fontColor,
      refFontColor: quickSettings.refFontColor,
      refPosition: quickSettings.refPosition,
      refAnchor: quickSettings.refAnchor ?? "normal",
      refTextTransform: quickSettings.refTextTransform,
      refLetterSpacing: quickSettings.refLetterSpacing,
      refOpacity: quickSettings.refOpacity,
      refTextAlign: quickSettings.refTextAlign,
      refSpacing: quickSettings.refSpacing,
      fullscreenShadeColor: quickSettings.fullscreenShadeColor,
      fullscreenShadeOpacity: effectiveShadeOpacity,
      fullscreenShadeEnabled: effectiveShadeOpacity > 0,
      textAlign: quickSettings.textAlign,
      lineHeight: quickSettings.lineHeight,
      fontWeight: quickSettings.fontWeight,
      refFontWeight: quickSettings.refFontWeight,
      textTransform: quickSettings.textTransform,
      textShadow: quickSettings.textShadow,
      fontStyle: quickSettings.fontStyle,
      animation: quickSettings.animation,
      animationDuration: quickSettings.animationDuration,
      // Keep the last pattern in quick settings so the picker can restore it
      // after a temporary color/video switch, but only send it to the overlay
      // while Pattern is the active background mode.
      backgroundPattern: useNoBg
        ? ""
        : useThemeBg
          ? (theme.settings.backgroundPattern ?? "")
          : bgType === "pattern"
            ? quickSettings.backgroundPattern
            : "",
      boxBackground: useNoBg ? "transparent" : (theme.settings.boxBackground || "rgba(0,0,0,0.7)"),
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
      referenceBackgroundEnabled: quickSettings.referenceBackgroundEnabled,
      referenceBackgroundColor: quickSettings.referenceBackgroundColor,
      referenceBackgroundStyle: quickSettings.referenceBackgroundStyle,
      referenceBackgroundRadius: quickSettings.referenceBackgroundRadius,
      lowerThirdPosition: quickSettings.lowerThirdPosition,
      lowerThirdSize: quickSettings.lowerThirdSize,
      lowerThirdWidthPreset: quickSettings.lowerThirdWidthPreset,
      lowerThirdOffsetX: quickSettings.lowerThirdOffsetX,
      lowerThirdCaptionPosition: quickSettings.lowerThirdCaptionPosition,
      lowerThirdEdge: quickSettings.lowerThirdEdge,
      lowerThirdCardPadding: quickSettings.lowerThirdCardPadding,
      lowerThirdPaddingLinked: quickSettings.lowerThirdPaddingLinked,
      lowerThirdCardRadius: quickSettings.lowerThirdCardRadius,
      lowerThirdTextDirection: quickSettings.lowerThirdTextDirection,
      ...compareSettings,
    },
  };
}

function cleanWorshipSectionLabel(label: string): string {
  const normalized = label.trim();
  if (!normalized) return "";
  return /^verse\s+\d+$/i.test(normalized) ? "" : normalized;
}

function stageItemLabel(song: DockSong, section: DockWorshipSection, titleOverride?: string): string {
  const displayLabel = cleanWorshipSectionLabel(section.label);
  return displayLabel || titleOverride || song.title;
}

function getWorshipSectionTranslation(
  sectionId: string,
  translation: DockTranslationValue | null,
): string {
  return normalizeDockMultilineText(translation?.translatedSections[sectionId] ?? "").trim();
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = unicodeStripDiacritics(query);
  const t = unicodeStripDiacritics(target);
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function DockWorshipTab({
  staged,
  onStage,
  productionDefaults,
  isActive = true,
  presentationOutputTarget = "obs",
  fullscreenOnly = false,
}: Props) {
  const { t } = useTranslation();
  const presentationLinkMode = isPresentationLinkTarget(presentationOutputTarget);
  const fullscreenOnlyMode = presentationLinkMode || fullscreenOnly;
  const [sceneRoute, updateSceneRoute] = useDockSceneRoute("worship");
  const hasSceneRoute = sceneRoute.enabled && Boolean(sceneRoute.sceneName);

  const pushWorshipToConfiguredOutput = useCallback(async (data: DockTabContentPushData) => {
    if (!hasSceneRoute) {
      await dockObsClient.pushWorshipLyrics(data);
      return;
    }
    await dockObsClient.pushWorshipToScene(data, sceneRoute.sceneName);
    if (sceneRoute.syncPresentation) await dockObsClient.pushWorshipLyrics(data);
  }, [hasSceneRoute, sceneRoute.sceneName, sceneRoute.syncPresentation]);

  const clearWorshipFromConfiguredOutput = useCallback(async () => {
    if (!hasSceneRoute) {
      await dockObsClient.clearWorshipLyrics();
      return;
    }
    await dockObsClient.clearSceneRouteSource("worship", sceneRoute.sceneName);
    if (sceneRoute.syncPresentation) await dockObsClient.clearWorshipLyrics();
  }, [hasSceneRoute, sceneRoute.sceneName, sceneRoute.syncPresentation]);
  const [songs, setSongs] = useState<DockSong[]>([]);
  const rawSongsRef = useRef<DockSong[]>([]);
  // Initialize from localStorage so the limit is known immediately
  const [songLimit, setSongLimit] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(getUserScopedKey("ocs-dock-song-limit"));
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

  // ── Plan-filtered songs: only songs within the user's plan limit ──
  const accessibleSongs = useMemo(() => {
    return songs;
  }, [songs, songLimit]);

  // Skip auto-selecting a song from the persisted staged item on first mount.
  // The staged item is restored from localStorage on reload; we only want to
  // navigate into a song when the user explicitly stages a new one.
  const isInitialMount = useRef(true);
  useEffect(() => { isInitialMount.current = false; }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [lyricsSearchQuery, setLyricsSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 220);
  const debouncedLyricsSearchQuery = useDebouncedValue(lyricsSearchQuery, 180);
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [showLineCountPopover, setShowLineCountPopover] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(
    () => loadDockWorshipUiPreferences().toolbarCollapsed === true,
  );
  const [quickActionsTop, setQuickActionsTop] = useState(
    () => loadDockWorshipUiPreferences().quickActionsTop ?? DEFAULT_DOCK_OUTPUT_QUICK_ACTIONS_TOP,
  );
  const [quickActionsLeft, setQuickActionsLeft] = useState<number | null>(
    () => loadDockWorshipUiPreferences().quickActionsLeft ?? null,
  );
  const [quickUpdateImmediately, setQuickUpdateImmediately] = useState(
    () => loadDockWorshipUiPreferences().quickUpdateImmediately !== false,
  );
  const [quickSettingsRefreshNonce, setQuickSettingsRefreshNonce] = useState(0);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [worshipSubTab, setWorshipSubTab] = useState<WorshipSubTab>(
    () => loadDockWorshipUiPreferences().activeSubTab ?? "worship",
  );
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentWorshipSearches());
  const [selectedSong, setSelectedSong] = useState<DockSong | null>(null);
  const [worshipTranslation, setWorshipTranslation] = useState<DockTranslationValue | null>(null);
  const [visibleIdx, setVisibleIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [worshipOverlayVisible, setWorshipOverlayVisible] = useState(true);
  const [selectedFSTheme, setSelectedFSTheme] = useState<BibleTheme>(
    productionDefaults.fullscreenTheme ?? BUILTIN_THEMES[0],
  );
  const [selectedLTTheme, setSelectedLTTheme] = useState<BibleTheme>(
    productionDefaults.lowerThirdTheme ?? BUILTIN_THEMES[0],
  );
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(
    () => readDockWorshipOverlayMode() ?? productionDefaults.defaultMode,
  );
  const [linesPerSlide, setLinesPerSlide] = useState<number>(2);
  const [linesPerSlideOverride, setLinesPerSlideOverride] = useState(false);
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
  const [actionError, setActionError] = useState("");
  const [songEditor, setSongEditor] = useState<DockSong | null>(null);
  const [songDraft, setSongDraft] = useState<DockSongDraft>({ title: "", artist: "", lyrics: "" });
  const [newSongDraft, setNewSongDraft] = useState<DockSongDraft>({ title: "", artist: "", lyrics: "" });
  const [newSongSource, setNewSongSource] = useState<Pick<DockSong, "importSourceName" | "importSourceType" | "importSourceUrl"> | null>(null);
  const [isNewSongModalOpen, setIsNewSongModalOpen] = useState(false);
  const [slideEditor, setSlideEditor] = useState<{ index: number; label: string; text: string } | null>(null);
  const [slideEditorAutoSplitPopoverOpen, setSlideEditorAutoSplitPopoverOpen] = useState(false);
  const slideEditorAutoSplitPopoverRef = useRef<HTMLDivElement>(null);
  const slideEditorAutoSplitSourceRef = useRef<string | null>(null);

  const closeSongEditor = useCallback(() => {
    setSongEditor(null);
  }, []);

  const closeSlideEditor = useCallback(() => {
    slideEditorAutoSplitSourceRef.current = null;
    setSlideEditorAutoSplitPopoverOpen(false);
    setSlideEditor(null);
  }, []);

  const closeNewSongModal = useCallback(() => {
    setIsNewSongModalOpen(false);
    setNewSongSource(null);
  }, []);
  const [deletedSections, setDeletedSections] = useState<DeletedWorshipSection[]>([]);
  const [showDeletedSectionsPopover, setShowDeletedSectionsPopover] = useState(false);
  const [onlineSearchOpen, setOnlineSearchOpen] = useState(false);
  const [onlineSearchQuery, setOnlineSearchQuery] = useState("");
  const [onlineSearchSubmittedQuery, setOnlineSearchSubmittedQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState<OnlineLyricsSearchResult[]>([]);
  const [onlineSearchLoading, setOnlineSearchLoading] = useState(false);
  const [onlineSearchError, setOnlineSearchError] = useState("");
  const [hiddenSectionIndexes, setHiddenSectionIndexes] = useState<Set<number>>(() => new Set());
  const [showWorshipBackgroundOnly, setShowWorshipBackgroundOnly] = useState(false);
  const [showPresentationMeta, setShowPresentationMeta] = useState(false);
  const [savingSong, setSavingSong] = useState(false);
  const [toasts, setToasts] = useState<DockToast[]>([]);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const selectedFSThemeRef = useRef<BibleTheme>(productionDefaults.fullscreenTheme ?? BUILTIN_THEMES[0]);
  const selectedLTThemeRef = useRef<BibleTheme>(productionDefaults.lowerThirdTheme ?? BUILTIN_THEMES[0]);
  const searchRef = useRef<HTMLDivElement>(null);
  const lineCountPopoverRef = useRef<HTMLDivElement>(null);
  const deletedSectionsPopoverRef = useRef<HTMLDivElement>(null);
  const deletedSectionsTriggerRef = useRef<HTMLButtonElement>(null);
  const [deletedSectionsPopoverPos, setDeletedSectionsPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const prefsReadyRef = useRef(false);
  const prefsLoadIdRef = useRef(0);
  const songsPollBusyRef = useRef(false);
  const liveSectionRequestIdRef = useRef(0);
  const liveSectionPushTailRef = useRef<Promise<void>>(Promise.resolve());
  const pendingQuickSettingsRefreshRef = useRef(false);
  const worshipTranslationChangeRef = useRef(false);

  // Keep the editor controlled by the immediate draft so the caret never waits
  // for slide parsing. The preview can safely follow at a lower priority.
  const deferredSongDraft = useDeferredValue(songDraft);

  // Preview sections from the draft lyrics when the song editor is open,
  // so the user sees the effect of their edits (auto-split, spacing, etc.)
  // in real time without having to save first.
  const effectiveLyrics = songEditor && deferredSongDraft.lyrics !== selectedSong?.lyrics
    ? deferredSongDraft.lyrics
    : (selectedSong?.lyrics ?? "");
  const effectiveLinesPerSlide = clampLinesPerSlide(
    songEditor && typeof deferredSongDraft.linesPerSlide === "number"
      ? deferredSongDraft.linesPerSlide
      : linesPerSlide,
  );
  const effectiveAutoSplit = songEditor && typeof deferredSongDraft.autoSplit === "boolean"
    ? deferredSongDraft.autoSplit
    : selectedSong?.autoSplit ?? false;
  const shouldSplitByLineCount = effectiveAutoSplit || linesPerSlideOverride;

  useEffect(() => {
    if (!selectedSong || linesPerSlideOverride) return;
    const songLineCount = typeof selectedSong.linesPerSlide === "number"
      ? clampLinesPerSlide(selectedSong.linesPerSlide)
      : DEFAULT_LINES_PER_SLIDE;
    setLinesPerSlide((current) => current === songLineCount ? current : songLineCount);
  }, [linesPerSlideOverride, selectedSong?.id, selectedSong?.linesPerSlide]);

  const structuredSongText = useMemo(
    () => extractStructuredTextTitle(normalizeDockMultilineText(effectiveLyrics)),
    [effectiveLyrics],
  );
  const selectedSongTitleMarker = structuredSongText.title;
  const selectedSongDisplayTitle = structuredSongText.title || selectedSong?.title || "";
  const selectedSongSections = useMemo(
    () => (selectedSong
      ? parseLyricSections(
        effectiveLyrics,
        effectiveLinesPerSlide,
        shouldSplitByLineCount,
        linesPerSlideOverride,
      )
      : []),
    [effectiveLyrics, effectiveLinesPerSlide, linesPerSlideOverride, selectedSong, shouldSplitByLineCount],
  );

  const totalLyricLines = useMemo(
    () => selectedSongSections.reduce((total, section) => {
      const nonEmpty = section.text.split("\n").filter((l) => l.trim().length > 0).length;
      return total + nonEmpty;
    }, 0),
    [selectedSongSections],
  );

  const searchableSongs = useMemo(
    () =>
      accessibleSongs.map((song) => ({
        song,
        searchText: `${song.title}\n${song.artist}\n${song.lyrics}`.toLowerCase(),
      })),
    [accessibleSongs],
  );
  const persistedPrefs = useMemo<DockWorshipPreferences>(() => ({
    overlayMode,
    fullscreenThemeId: selectedFSTheme.id,
    lowerThirdThemeId: selectedLTTheme.id,
    linesPerSlide,
    linesPerSlideOverride,
    fullscreenQuickThemeSettings: savedFullscreenQuickThemeSettings,
    lowerThirdQuickThemeSettings: savedLowerThirdQuickThemeSettings,
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
    showPresentationMeta,
    updatedAt: new Date().toISOString(),
  }), [
    linesPerSlide,
    linesPerSlideOverride,
    overlayMode,
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
    savedFullscreenQuickThemeSettings,
    savedLowerThirdQuickThemeSettings,
    selectedFSTheme.id,
    selectedLTTheme.id,
    showPresentationMeta,
  ]);
  const visibleSectionIndexes = useMemo(
    () => selectedSongSections.map((_, index) => index).filter((index) => !hiddenSectionIndexes.has(index)),
    [hiddenSectionIndexes, selectedSongSections],
  );

  const lyricsFilteredSectionIndexes = useMemo(() => {
    if (!debouncedLyricsSearchQuery.trim()) return visibleSectionIndexes;
    const query = debouncedLyricsSearchQuery.trim();
    return visibleSectionIndexes.filter((idx) => {
      const section = selectedSongSections[idx];
      if (!section) return false;
      const label = section.label.trim();
      return fuzzyMatch(query, section.text) || (label && fuzzyMatch(query, label));
    });
  }, [debouncedLyricsSearchQuery, visibleSectionIndexes, selectedSongSections]);

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

  // Use primitive IDs as effect dependencies to avoid re-running when the backend
  // sends new object references for themes that haven't actually changed.
  const _fsThemeDepId = productionDefaults.fullscreenTheme?.id;
  const _ltThemeDepId = productionDefaults.lowerThirdTheme?.id;

  useEffect(() => {
    const loadId = ++prefsLoadIdRef.current;
    prefsReadyRef.current = false;
    let cancelled = false;
    const applyPreferences = (
      prefs: DockWorshipPreferences,
      allFavorites: BibleTheme[],
    ) => {
      setSelectedFSTheme(productionDefaults.fullscreenTheme ?? BUILTIN_THEMES[0]);
      setSelectedLTTheme(productionDefaults.lowerThirdTheme ?? BUILTIN_THEMES[0]);
      setOverlayMode(readDockWorshipOverlayMode() ?? prefs.overlayMode ?? productionDefaults.defaultMode);
      setLinesPerSlide(typeof prefs.linesPerSlide === "number" ? clampLinesPerSlide(prefs.linesPerSlide) : DEFAULT_LINES_PER_SLIDE);
      setLinesPerSlideOverride(
        prefs.linesPerSlideOverride === true
          || (typeof prefs.linesPerSlide === "number"
            && clampLinesPerSlide(prefs.linesPerSlide) !== DEFAULT_LINES_PER_SLIDE),
      );
      const storedFullscreenQuickSettings = sanitizeQuickThemeSettings(
        prefs.fullscreenQuickThemeSettings,
      );
      const rawStoredLowerThirdQuickSettings = sanitizeQuickThemeSettings(
        prefs.lowerThirdQuickThemeSettings,
      );
      const storedLowerThirdQuickSettings =
        areQuickThemeSettingsEquivalent(storedFullscreenQuickSettings, rawStoredLowerThirdQuickSettings)
          ? null
          : rawStoredLowerThirdQuickSettings;
      const storedLowerThirdLinked =
        typeof prefs.lowerThirdQuickThemeSettingsLinkedToFullscreen === "boolean"
          ? prefs.lowerThirdQuickThemeSettingsLinkedToFullscreen
          : storedLowerThirdQuickSettings == null;
      setSavedFullscreenQuickThemeSettings(storedFullscreenQuickSettings);
      setFullscreenQuickThemeSettings(storedFullscreenQuickSettings);
      setSavedLowerThirdQuickThemeSettings(storedLowerThirdLinked ? null : storedLowerThirdQuickSettings);
      setLowerThirdQuickThemeSettings(storedLowerThirdLinked ? null : storedLowerThirdQuickSettings);
      setLowerThirdQuickThemeSettingsLinkedToFullscreen(storedLowerThirdLinked);
      setShowPresentationMeta(prefs.showPresentationMeta === true);

      const storedFullscreen = allFavorites.find(
        (theme) => theme.id === prefs.fullscreenThemeId
          && themeSupportsBibleOverlayMode(theme, "fullscreen"),
      );
      const storedLowerThird = allFavorites.find(
        (theme) => theme.id === prefs.lowerThirdThemeId
          && themeSupportsBibleOverlayMode(theme, "lower-third"),
      );

      if (storedFullscreen) setSelectedFSTheme(storedFullscreen);
      if (storedLowerThird) setSelectedLTTheme(storedLowerThird);
    };

    const hydratePreferences = async () => {
      const [allFavorites, appPrefs] = await Promise.all([
        loadDockFavoriteBibleThemes().catch(() => [] as BibleTheme[]),
        loadDockWorshipPreferencesFromApp().catch(() => null),
      ]);

      if (cancelled || loadId !== prefsLoadIdRef.current) return;

      // Local storage and the app bridge can both contain the same preference
      // record. Resolve them before applying anything so an older async result
      // cannot overwrite a newly selected background.
      const latestLocalPrefs = loadDockWorshipPreferences();
      const localUpdatedAt = Date.parse(latestLocalPrefs.updatedAt ?? "");
      const appUpdatedAt = Date.parse(appPrefs?.updatedAt ?? "");
      const prefs = appPrefs
        && Number.isFinite(appUpdatedAt)
        && (!Number.isFinite(localUpdatedAt) || appUpdatedAt > localUpdatedAt)
        ? appPrefs
        : latestLocalPrefs;

      applyPreferences(prefs, allFavorites);
      prefsReadyRef.current = true;
    };

    void hydratePreferences().catch(() => {
      if (!cancelled && loadId === prefsLoadIdRef.current) {
        prefsReadyRef.current = true;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    productionDefaults.defaultMode,
    _fsThemeDepId,
    _ltThemeDepId,
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
      activeSubTab: worshipSubTab,
      quickActionsTop,
      quickActionsLeft,
      quickUpdateImmediately,
    });
  }, [quickActionsLeft, quickActionsTop, quickUpdateImmediately, toolbarCollapsed, worshipSubTab]);

  const mapSongs = useCallback(
    (all: Array<{
      id: string;
      metadata: { title: string; artist?: string };
      lyrics?: string;
      importSourceName?: string;
      importSourceType?: "manual" | "online" | "document";
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
        const stored = localStorage.getItem(getUserScopedKey("ocs-dock-song-limit"));
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
    await new Promise((r) => setTimeout(r, 250));

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
          const stored = localStorage.getItem(getUserScopedKey("ocs-dock-song-limit"));
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

    // Last resort: load from localStorage cache
    const cached = loadCachedSongs();
    if (cached.length > 0) {
      applySongLimit(cached);
    }
  }, [mapSongs]);

  useEffect(() => {
    void loadSongs();
  }, [loadSongs]);

  // Persist songs to localStorage whenever they change (reliable fallback)
  useEffect(() => {
    if (songs.length > 0) cacheSongsLocally(songs);
  }, [songs]);

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
    if (!isActive) return;
    const interval = setInterval(() => {
      if (songsPollBusyRef.current) return;
      songsPollBusyRef.current = true;
      void loadSongs(false).finally(() => { songsPollBusyRef.current = false; });
    }, 30_000);
    return () => clearInterval(interval);
  }, [isActive, loadSongs]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowRecentSearches(false);
      }
      if (lineCountPopoverRef.current && !lineCountPopoverRef.current.contains(event.target as Node)) {
        setShowLineCountPopover(false);
      }
      if (
        showDeletedSectionsPopover &&
        !deletedSectionsPopoverRef.current?.contains(event.target as Node) &&
        !deletedSectionsTriggerRef.current?.contains(event.target as Node)
      ) {
        setShowDeletedSectionsPopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDeletedSectionsPopover]);

  const handleToggleDeletedSectionsPopover = useCallback(() => {
    setShowDeletedSectionsPopover((current) => {
      if (!current && deletedSectionsTriggerRef.current) {
        const rect = deletedSectionsTriggerRef.current.getBoundingClientRect();
        const popoverWidth = 320;
        const popoverHeight = 280;
        const top = rect.bottom + 6 + popoverHeight > window.innerHeight
          ? Math.max(8, rect.top - popoverHeight - 6)
          : rect.bottom + 6;
        const left = Math.max(8, Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - 8));
        setDeletedSectionsPopoverPos({ top, left });
      }
      return !current;
    });
  }, []);

  useEffect(() => {
    if (!showDeletedSectionsPopover) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDeletedSectionsPopover(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showDeletedSectionsPopover]);

  const filteredSongs = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return accessibleSongs;
    }
    const q = debouncedSearchQuery.trim();
    const qLower = q.toLowerCase();
    const numMatch = qLower.match(/(\d+)/);
    const searchNumber = numMatch ? numMatch[1] : null;

    let scored = searchableSongs
      .map((entry) => {
        const title = entry.song.title.toLowerCase();
        let score = 0;

        if (searchNumber) {
          const exactTitleRe = new RegExp(`^hymn\\s+${searchNumber}$`);
          const numDotRe = new RegExp(`^${searchNumber}[.\\s]`);
          const bareNumRe = new RegExp(`^${searchNumber}$`);
          if (exactTitleRe.test(title)) score += 10000;
          else if (bareNumRe.test(title)) score += 10000;
          else if (numDotRe.test(title)) score += 10000;
          else if (title.includes(`hymn ${searchNumber}`)) score += 5000;
          else if (title.includes(searchNumber)) score += 2000;
        }

        if (score === 0 && title.startsWith(qLower)) score += 3000;
        if (score === 0 && title.includes(qLower)) score += 1000;
        if (score === 0 && entry.searchText.includes(qLower)) score += 500;
        if (score === 0 && fuzzyMatch(q, entry.searchText)) score += 100;

        return { entry, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    // When real matches exist, suppress low-confidence fuzzy-only results
    const bestScore = scored.length > 0 ? scored[0].score : 0;
    if (bestScore >= 500) {
      scored = scored.filter((item) => item.score >= 500);
    }

    return scored.map((item) => item.entry.song);
  }, [debouncedSearchQuery, searchableSongs, accessibleSongs]);

  // ── Plan-locked songs: songs beyond the plan limit get a blur + padlock ──
  const lockedSongIds = useMemo(() => {
    const locked = new Set<string>();
    const isUnlimited = !songLimit || songLimit <= 0 || songLimit >= 9999;
    if (isUnlimited) return locked;

    // Also check server-provided entitlements for consistency
    let effectiveLimit = songLimit;
    try {
      const raw = localStorage.getItem(getUserScopedKey("ocs-dock-entitlements"));
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

  const baseFullscreenTheme = useMemo(() => {
    const variant = selectedFSTheme.variants?.fullscreen;
    return variant
      ? { ...selectedFSTheme, settings: variant.settings, rawTemplate: variant.rawTemplate }
      : selectedFSTheme;
  }, [selectedFSTheme]);
  const baseLowerThirdTheme = useMemo(() => {
    const variant = selectedLTTheme.variants?.lowerThird;
    return variant
      ? { ...selectedLTTheme, settings: variant.settings, rawTemplate: variant.rawTemplate }
      : selectedLTTheme;
  }, [selectedLTTheme]);

  const effectiveSelectedFSTheme = useMemo(
    () => applyQuickThemeSettings(baseFullscreenTheme, fullscreenQuickThemeSettings),
    [baseFullscreenTheme, fullscreenQuickThemeSettings],
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
  const effectiveSelectedLTTheme = useMemo(() => {
    return applyQuickThemeSettings(baseLowerThirdTheme, effectiveLowerThirdQuickThemeSettings);
  }, [baseLowerThirdTheme, effectiveLowerThirdQuickThemeSettings]);
  const activeFullscreenQuickThemeSettings = useMemo(
    () => ({
      ...extractQuickThemeSettings(effectiveSelectedFSTheme.settings),
      backgroundType: fullscreenQuickThemeSettings?.backgroundType ?? "theme",
    }),
    [effectiveSelectedFSTheme.settings, fullscreenQuickThemeSettings],
  );
  const defaultFullscreenQuickThemeSettings = useMemo(
    () => ({
      ...extractQuickThemeSettings(baseFullscreenTheme.settings),
      backgroundType: "theme" as const,
    }),
    [baseFullscreenTheme.settings],
  );
  const activeLowerThirdQuickThemeSettings = useMemo(
    () => ({
      ...extractQuickThemeSettings(effectiveSelectedLTTheme.settings),
      backgroundType: effectiveLowerThirdQuickThemeSettings.backgroundType ?? "theme",
    }),
    [
      effectiveLowerThirdQuickThemeSettings,
      effectiveSelectedLTTheme.settings,
    ],
  );
  const activeWorshipQuickSettings = fullscreenOnlyMode || overlayMode === "fullscreen"
    ? activeFullscreenQuickThemeSettings
    : activeLowerThirdQuickThemeSettings;
  const handleWorshipQuickCommit = useCallback((patch: Partial<DockOutputQuickTextSettings>, nextLineCount?: number) => {
    const nextFullscreenSettings = {
      ...(fullscreenQuickThemeSettings ?? defaultFullscreenQuickThemeSettings),
      ...patch,
    };
    setSavedFullscreenQuickThemeSettings(nextFullscreenSettings);
    setFullscreenQuickThemeSettings(nextFullscreenSettings);

    if (lowerThirdQuickThemeSettingsLinkedToFullscreen) {
      setSavedLowerThirdQuickThemeSettings(null);
      setLowerThirdQuickThemeSettings(null);
    } else {
      const nextLowerThirdSettings = {
        ...(lowerThirdQuickThemeSettings ?? defaultLowerThirdQuickThemeSettings),
        ...patch,
      };
      setSavedLowerThirdQuickThemeSettings(nextLowerThirdSettings);
      setLowerThirdQuickThemeSettings(nextLowerThirdSettings);
    }

    if (nextLineCount !== undefined) {
      setLinesPerSlide(clampLinesPerSlide(nextLineCount));
      setLinesPerSlideOverride(true);
      setHiddenSectionIndexes(new Set());
      setSelectedIdx(0);
      setVisibleIdx(null);
    }
    pendingQuickSettingsRefreshRef.current = true;
    setQuickSettingsRefreshNonce((current) => current + 1);
  }, [defaultFullscreenQuickThemeSettings, defaultLowerThirdQuickThemeSettings, fullscreenQuickThemeSettings, lowerThirdQuickThemeSettings, lowerThirdQuickThemeSettingsLinkedToFullscreen]);
  const handleWorshipQuickActionsPositionChange = useCallback((top: number, left: number | null) => {
    setQuickActionsTop(top);
    setQuickActionsLeft(left);
  }, []);
  const handleSelectFSTheme = useCallback((theme: BibleTheme) => {
    setSelectedFSTheme(theme);
    selectedFSThemeRef.current = theme;
  }, []);
  const handleSelectLTTheme = useCallback((theme: BibleTheme) => {
    setSelectedLTTheme(theme);
    selectedLTThemeRef.current = theme;
  }, []);
  const handleOverlayModeChange = useCallback((nextMode: OverlayMode) => {
    if (nextMode === overlayMode) return;

    const currentSettings = overlayMode === "fullscreen"
      ? (fullscreenQuickThemeSettings ?? activeFullscreenQuickThemeSettings)
      : (lowerThirdQuickThemeSettings ?? activeLowerThirdQuickThemeSettings);
    const targetSettings = nextMode === "fullscreen"
      ? fullscreenQuickThemeSettings
      : lowerThirdQuickThemeSettings;
    const targetUsesThemeBackground =
      !targetSettings || targetSettings.backgroundType == null || targetSettings.backgroundType === "theme";
    const sourceUsesCustomBackground = currentSettings.backgroundType !== undefined
      && currentSettings.backgroundType !== "theme";

    if (targetUsesThemeBackground && sourceUsesCustomBackground) {
      if (nextMode === "fullscreen") {
        const nextSettings = mergeQuickThemeBackground(defaultFullscreenQuickThemeSettings, currentSettings);
        setFullscreenQuickThemeSettings(nextSettings);
        setSavedFullscreenQuickThemeSettings(nextSettings);
      } else if (!lowerThirdQuickThemeSettingsLinkedToFullscreen) {
        const nextSettings = mergeQuickThemeBackground(defaultLowerThirdQuickThemeSettings, currentSettings);
        setLowerThirdQuickThemeSettings(nextSettings);
        setSavedLowerThirdQuickThemeSettings(nextSettings);
      }
    }

    setOverlayMode(nextMode);
    saveDockWorshipOverlayMode(nextMode);
    // Mode changes must republish the currently live slide. Otherwise the
    // OBS browser source keeps the previous mode/background until another
    // action happens to refresh it.
    pendingQuickSettingsRefreshRef.current = true;
    setQuickSettingsRefreshNonce((current) => current + 1);
  }, [
    activeFullscreenQuickThemeSettings,
    activeLowerThirdQuickThemeSettings,
    defaultFullscreenQuickThemeSettings,
    defaultLowerThirdQuickThemeSettings,
    fullscreenQuickThemeSettings,
    lowerThirdQuickThemeSettings,
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
    overlayMode,
  ]);
  const activeThemePickerProps = fullscreenOnlyMode || overlayMode === "fullscreen"
    ? { selectedThemeId: selectedFSTheme.id, onSelect: handleSelectFSTheme }
    : { selectedThemeId: selectedLTTheme.id, onSelect: handleSelectLTTheme };
  const resolveThemeQuickSettings = useCallback((theme: BibleTheme): DockFullscreenQuickThemeSettings => {
    const effectiveOverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayMode;
    const variant = effectiveOverlayMode === "lower-third"
      ? theme.variants?.lowerThird
      : theme.variants?.fullscreen;
    const themeSettings = variant?.settings ?? theme.settings;
    return effectiveOverlayMode === "lower-third"
      ? buildDefaultLowerThirdQuickThemeSettings(themeSettings, "theme")
      : {
        ...extractQuickThemeSettings(themeSettings),
        backgroundType: "theme",
      };
  }, [fullscreenOnlyMode, overlayMode]);

  useEffect(() => {
    selectedFSThemeRef.current = selectedFSTheme;
  }, [selectedFSTheme]);

  useEffect(() => {
    selectedLTThemeRef.current = selectedLTTheme;
  }, [selectedLTTheme]);

  const buildSectionPayload = useCallback(
    (idx: number, options?: { backgroundOnly?: boolean; showPresentationMeta?: boolean }) => {
      if (!selectedSong) return null;
      const section = selectedSongSections[idx];
      if (!section) return null;

      // Use the current rendered mode immediately. The persisted preference is
      // written asynchronously, so rereading it here can send the previous
      // mode during a Fullscreen -> Lower Third click.
      const liveOverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayMode;
      const displayLabel = cleanWorshipSectionLabel(section.label);
      const theme = liveOverlayMode === "fullscreen" ? effectiveSelectedFSTheme : effectiveSelectedLTTheme;
      const backgroundOnly = options?.backgroundOnly ?? showWorshipBackgroundOnly;
      const presentationMeta = options?.showPresentationMeta ?? showPresentationMeta;
      const sectionTextSource = normalizeDockMultilineText(section.text);
      const translatedSectionText = getWorshipSectionTranslation(section.id, worshipTranslation);
      const showBoth = Boolean(worshipTranslation?.showBoth && translatedSectionText);
      const sectionText = showBoth ? sectionTextSource : (translatedSectionText || sectionTextSource);
      const translationText = showBoth ? translatedSectionText : "";
      const translationOrder = normalizeDockTranslationOrder(worshipTranslation?.translationOrder);

      const stageData = {
        song: selectedSong,
        sectionIdx: idx,
        artist: selectedSong.artist,
        sectionLabel: displayLabel,
        sectionText,
        translationText,
        translationOrder,
        overlayMode: liveOverlayMode,
        linesPerSlide: effectiveLinesPerSlide,
        theme: theme.id,
        bibleThemeSettings: theme.settings as unknown as Record<string, unknown>,
        liveOverrides: null,
        backgroundOnly: Boolean(backgroundOnly),
        presentationShowMeta: presentationMeta,
      };

      return {
        section,
        stageItem: {
          type: "worship" as const,
          label: stageItemLabel(selectedSong, section, selectedSongDisplayTitle),
          subtitle: selectedSongDisplayTitle,
          data: stageData,
        },
        obsData: {
          sectionText,
          translationText,
          translationOrder,
          sectionLabel: displayLabel,
          songTitle: selectedSongDisplayTitle,
          artist: selectedSong.artist,
          overlayMode: liveOverlayMode,
          bibleThemeSettings: theme.settings as unknown as Record<string, unknown>,
          liveOverrides: null,
          backgroundOnly: Boolean(backgroundOnly),
        },
      };
    },
    [
      effectiveLinesPerSlide,
      overlayMode,
      fullscreenOnlyMode,
      effectiveSelectedFSTheme,
      effectiveSelectedLTTheme,
      selectedSong,
      selectedSongDisplayTitle,
      selectedSongSections,
      showPresentationMeta,
      showWorshipBackgroundOnly,
      worshipTranslation,
    ],
  );

  const pushSection = useCallback(
    async (idx: number, options?: { backgroundOnly?: boolean; showPresentationMeta?: boolean }) => {
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
    (idx: number, options?: { backgroundOnly?: boolean; showPresentationMeta?: boolean }) => {
      const payload = buildSectionPayload(idx, options);
      if (!payload) return;
      const requestId = ++liveSectionRequestIdRef.current;

      setActionError("");
      setSelectedIdx(idx);
      setVisibleIdx(idx);

      onStage(payload.stageItem);

      if (presentationLinkMode) {
        setWorshipOverlayVisible(true);
        track("song_presented");
        trackWorshipSongPresented();
        return;
      }

      const pushLive = () => hasSceneRoute
        ? pushWorshipToConfiguredOutput(payload.obsData)
        : pushWorshipToConfiguredOutput(payload.obsData);
      // Fullscreen and lower-third use different OBS paths. Queue them at the
      // dock boundary so a slower fullscreen mutation cannot finish after the
      // lower-third mutation and overwrite the active mode in OBS.
      const queuedPush = liveSectionPushTailRef.current
        .catch(() => undefined)
        .then(async () => {
          if (requestId !== liveSectionRequestIdRef.current) return;
          await pushLive();
        });
      liveSectionPushTailRef.current = queuedPush.catch(() => undefined);
      queuedPush
        .then(() => {
          if (requestId !== liveSectionRequestIdRef.current) return;
          setWorshipOverlayVisible(true);
          track("song_presented");
          trackWorshipSongPresented();
        })
        .catch((err) => {
          if (requestId !== liveSectionRequestIdRef.current) return;
          const message = err instanceof Error ? err.message : String(err);
          const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
          if (!isTransient) {
            console.warn("[DockWorshipTab] Push worship failed:", err);
            setActionError(message);
          } else {
            console.warn("[DockWorshipTab] Push worship failed (transient):", message);
          }
        });
    },
    [buildSectionPayload, hasSceneRoute, onStage, presentationLinkMode, pushWorshipToConfiguredOutput],
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

        const postFallback = async () => {
          try {
            await postWorshipDockSongSaveCommand(command);
            if (settled) return;
            fallbackPosted = true;
            void loadWorshipDockSongSaveResult(command.commandId).then((result) => {
              if (result) complete(result);
            }).catch(() => { });
          } catch (err) {
            fallbackError = err instanceof Error ? err : new Error(String(err));
            console.warn("[DockWorshipTab] Fallback song save command failed:", fallbackError);
          }
        };

        fallbackTimer = window.setTimeout(() => { void postFallback(); }, DOCK_WORSHIP_SAVE_FALLBACK_DELAY_MS);
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
      source?: Pick<DockSong, "importSourceName" | "importSourceType" | "importSourceUrl" | "autoSplit" | "linesPerSlide" | "themeId">,
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
        autoSplit: draft.autoSplit ?? source?.autoSplit,
        linesPerSlide: draft.linesPerSlide ?? source?.linesPerSlide,
        themeId: source?.themeId,
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
      autoSplit: true,
      linesPerSlide: DEFAULT_LINES_PER_SLIDE,
    });
    setActionError("");
  }, []);

  const handleSaveSongEditor = useCallback(async (draft: DockSongDraft) => {
    if (!songEditor) return;
    setSavingSong(true);
    setActionError("");
    try {
      await persistSong(songEditor.id, draft, songEditor);
      showToast(t('worship.songSaved'), "success");
      closeSongEditor();
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
  }, [closeSongEditor, persistSong, showToast, songEditor]);

  const handleResetSongEditor = useCallback((): DockSongDraft | null => {
    if (!songEditor) return null;
    const defaults = readDockSongDefaults();
    const fallback = defaults[songEditor.id] ?? songEditor;
    const nextDraft = {
      title: fallback.title,
      artist: fallback.artist,
      lyrics: fallback.lyrics,
      autoSplit: true,
      linesPerSlide: DEFAULT_LINES_PER_SLIDE,
    };
    setSongDraft(nextDraft);
    showToast(t('worship.defaultRestored'));
    return nextDraft;
  }, [showToast, songEditor]);

  const openNewSongModal = useCallback(async (draft?: Partial<DockSongDraft>) => {
    if (!(await requireEntitlement("songs", rawSongsRef.current.length))) return;
    setNewSongDraft({
      title: draft?.title ?? nextAutoSongTitle(),
      artist: draft?.artist ?? "",
      lyrics: draft?.lyrics ?? "",
      autoSplit: draft?.autoSplit ?? true,
      linesPerSlide: draft?.linesPerSlide ?? DEFAULT_LINES_PER_SLIDE,
    });
    setNewSongSource({ importSourceType: "manual" });
    setIsNewSongModalOpen(true);
    setActionError("");
  }, [showToast]);

  const handleSaveNewSong = useCallback(async (draft: DockSongDraft) => {
    if (!(await requireEntitlement("songs", rawSongsRef.current.length))) {
      closeNewSongModal();
      return;
    }
    setSavingSong(true);
    setActionError("");
    try {
      const newSong = await persistSong(createDockSongId(), draft, newSongSource ?? { importSourceType: "manual" });
      if (newSong) {
        rememberDockSongDefault(newSong);
        closeNewSongModal();
        setSelectedSong(newSong);
        setSelectedIdx(0);
        setVisibleIdx(null);
        setHiddenSectionIndexes(new Set());
        showToast(newSong.importSourceType === "online" ? t('worship.importSaved') : t('worship.songAdded'), "success");
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
  }, [closeNewSongModal, newSongSource, persistSong, showToast]);

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
  }, [songs, staged]);

  const activeSectionIndex = useMemo(() => {
    if (!selectedSong || visibleSectionIndexes.length === 0) return null;
    if (selectedIdx !== null && visibleSectionIndexes.includes(selectedIdx)) return selectedIdx;
    if (visibleIdx !== null && visibleSectionIndexes.includes(visibleIdx)) return visibleIdx;
    return visibleSectionIndexes[0] ?? null;
  }, [visibleIdx, selectedIdx, selectedSong, visibleSectionIndexes]);

  useEffect(() => {
    if (!pendingQuickSettingsRefreshRef.current || activeSectionIndex === null) return;
    pendingQuickSettingsRefreshRef.current = false;
    // Wait for the updated theme or line layout to render before refreshing OBS.
    goLiveSection(activeSectionIndex);
  }, [activeSectionIndex, goLiveSection, quickSettingsRefreshNonce]);

  useEffect(() => {
    if (!worshipTranslationChangeRef.current) return;
    worshipTranslationChangeRef.current = false;
    if (
      activeSectionIndex === null
      || !worshipOverlayVisible
      || visibleIdx === null
    ) return;
    void goLiveSection(activeSectionIndex);
  }, [activeSectionIndex, goLiveSection, visibleIdx, worshipOverlayVisible, worshipTranslation]);

  const handleSaveFullscreenQuickThemeSettings = useCallback((nextSettings: DockFullscreenQuickThemeSettings) => {
    const nextSavedSettings = { ...nextSettings };
    setSavedFullscreenQuickThemeSettings(nextSavedSettings);
    setFullscreenQuickThemeSettings(nextSavedSettings);
    if (lowerThirdQuickThemeSettingsLinkedToFullscreen) {
      setSavedLowerThirdQuickThemeSettings(null);
      setLowerThirdQuickThemeSettings(null);
    }
  }, [lowerThirdQuickThemeSettingsLinkedToFullscreen]);

  const handleSaveLowerThirdQuickThemeSettings = useCallback((nextSettings: DockFullscreenQuickThemeSettings) => {
    const nextSavedSettings = { ...nextSettings };
    setLowerThirdQuickThemeSettingsLinkedToFullscreen(false);
    setSavedLowerThirdQuickThemeSettings(nextSavedSettings);
    setLowerThirdQuickThemeSettings(nextSavedSettings);
  }, []);

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

      const exactSong = accessibleSongs.find((song) => song.title.toLowerCase() === title.toLowerCase());
      if (exactSong) {
        setSearchQuery("");
        handleSelectSong(exactSong);
        return;
      }

      setSearchQuery(title);
    },
    [handleSelectSong, accessibleSongs],
  );

  const handleBackToSongList = useCallback(() => {
    setSelectedSong(null);
    setSelectedIdx(null);
    setVisibleIdx(null);
    setDeletedSections([]);
    setShowDeletedSectionsPopover(false);
    setLyricsSearchQuery("");
    setActionError("");
  }, []);

  useEffect(() => {
    setDeletedSections([]);
    setShowDeletedSectionsPopover(false);
    worshipTranslationChangeRef.current = false;
    setWorshipTranslation(null);
  }, [selectedSong?.id]);

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
      slideEditorAutoSplitSourceRef.current = null;
      setSlideEditorAutoSplitPopoverOpen(false);
      setSlideEditor({
        index: idx,
        label: section.label.trim() || t('worship.slideNumber', { number: idx + 1 }),
        text: section.text,
      });
    },
    [selectedSongSections],
  );

  const handleFormatSlideEditor = useCallback((action: LyricsFormatAction, autosplitLines?: number) => {
    setSlideEditor((draft) => {
      if (!draft) return draft;
      if (action === "autosplit") {
        const sourceText = slideEditorAutoSplitSourceRef.current ?? draft.text;
        slideEditorAutoSplitSourceRef.current = sourceText;
        return { ...draft, text: applyLyricsFormat(sourceText, action, autosplitLines) };
      }
      slideEditorAutoSplitSourceRef.current = null;
      return { ...draft, text: applyLyricsFormat(draft.text, action, autosplitLines) };
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (slideEditorAutoSplitPopoverRef.current && !slideEditorAutoSplitPopoverRef.current.contains(event.target as Node)) {
        setSlideEditorAutoSplitPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSaveSlideEditor = useCallback(async () => {
    if (!selectedSong || !slideEditor) return;
    const nextSections = selectedSongSections.map((section, index) =>
      index === slideEditor.index ? { ...section, text: slideEditor.text.trim() } : section,
    );
    const nextLyrics = serializeLyricSections(nextSections, selectedSongTitleMarker);

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
      showToast(t('worship.slideUpdated'), "success");
      closeSlideEditor();
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
  }, [closeSlideEditor, persistSong, selectedSong, selectedSongSections, selectedSongTitleMarker, showToast, slideEditor]);

  const handleDeleteSection = useCallback(async (idx: number) => {
    if (!selectedSong || savingSong || selectedSongSections.length <= 1) return;
    const deletedSection = selectedSongSections[idx];
    if (!deletedSection) return;

    const nextSections = selectedSongSections.filter((_, index) => index !== idx);
    const nextLyrics = serializeLyricSections(nextSections, selectedSongTitleMarker);
    if (!nextLyrics.trim()) return;

    setSavingSong(true);
    setActionError("");
    try {
      const updatedSong = await persistSong(
        selectedSong.id,
        {
          title: selectedSong.title,
          artist: selectedSong.artist,
          lyrics: nextLyrics,
        },
        selectedSong,
      );

      if (updatedSong) {
        const nextIndex = nextSections.length > 0 ? Math.min(idx, nextSections.length - 1) : null;
        setSelectedSong(updatedSong);
        setSelectedIdx((current) => {
          if (nextIndex === null) return null;
          if (current === null) return nextIndex;
          if (current === idx) return nextIndex;
          return current > idx ? current - 1 : current;
        });
        setVisibleIdx((current) => {
          if (current === null) return null;
          if (current === idx) return null;
          return current > idx ? current - 1 : current;
        });
      }

      const deletedLabel =
        deletedSection.label.trim()
        || t("worship.slideNumber", { number: idx + 1 });
      setDeletedSections((current) => [
        {
          id: `${deletedSection.id}-${Date.now()}`,
          label: deletedLabel,
          text: deletedSection.text,
          index: idx,
          deletedAt: Date.now(),
        },
        ...current,
      ].slice(0, 12));
      setShowDeletedSectionsPopover(true);
      showToast(t("worship.slideDeleted", { defaultValue: "Slide removed" }), "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn("[DockWorshipTab] delete slide failed:", err);
        setActionError(message);
      }
    } finally {
      setSavingSong(false);
    }
  }, [
    persistSong,
    savingSong,
    selectedSong,
    selectedSongSections,
    selectedSongTitleMarker,
    showToast,
    t,
  ]);

  const handleRestoreDeletedSection = useCallback(async (item: DeletedWorshipSection) => {
    if (!selectedSong || savingSong) return;
    const insertIndex = Math.max(0, Math.min(item.index, selectedSongSections.length));
    const nextSections = [...selectedSongSections];
    nextSections.splice(insertIndex, 0, {
      id: item.id,
      label: item.label,
      text: item.text,
    });
    const nextLyrics = serializeLyricSections(nextSections, selectedSongTitleMarker);
    if (!nextLyrics.trim()) return;

    setSavingSong(true);
    setActionError("");
    try {
      const updatedSong = await persistSong(
        selectedSong.id,
        {
          title: selectedSong.title,
          artist: selectedSong.artist,
          lyrics: nextLyrics,
        },
        selectedSong,
      );

      if (updatedSong) {
        setSelectedSong(updatedSong);
        setSelectedIdx(insertIndex);
        setVisibleIdx((current) => (current === null ? null : current >= insertIndex ? current + 1 : current));
      }

      setDeletedSections((current) => current.filter((entry) => entry.id !== item.id));
      setShowDeletedSectionsPopover((current) => current && deletedSections.length > 1);
      showToast(t("worship.slideRestored", { defaultValue: "Slide restored" }), "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn("[DockWorshipTab] restore slide failed:", err);
        setActionError(message);
      }
    } finally {
      setSavingSong(false);
    }
  }, [
    deletedSections.length,
    persistSong,
    savingSong,
    selectedSong,
    selectedSongSections,
    selectedSongTitleMarker,
    showToast,
    t,
  ]);

  const handleLinesPerSlideChange = useCallback((nextLinesPerSlide: number) => {
    setLinesPerSlide(clampLinesPerSlide(nextLinesPerSlide));
    setLinesPerSlideOverride(true);
    setHiddenSectionIndexes(new Set());
    setSelectedIdx(0);
    setVisibleIdx(null);
    setShowLineCountPopover(false);
    pendingQuickSettingsRefreshRef.current = true;
    setQuickSettingsRefreshNonce((current) => current + 1);
  }, []);

  // Auto-clamp linesPerSlide when selected song has fewer lines than the current setting
  useEffect(() => {
    if (!selectedSong || totalLyricLines === 0) return;
    if (linesPerSlide > totalLyricLines) {
      setLinesPerSlide(clampLinesPerSlide(totalLyricLines));
    }
  }, [selectedSong, totalLyricLines, linesPerSlide]);

  const handleImportOnlineResult = useCallback(
    (result: OnlineLyricsSearchResult) => {
      setOnlineSearchOpen(false);
      setOnlineSearchError("");
      setOnlineResults([]);
      setOnlineSearchQuery("");
      setOnlineSearchSubmittedQuery("");
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

  const handleOnlineSearch = useCallback(() => {
    setOnlineResults([]);
    setOnlineSearchError("");
    setOnlineSearchSubmittedQuery(onlineSearchQuery.trim());
  }, [onlineSearchQuery]);

  useEffect(() => {
    if (!onlineSearchOpen) return;

    const query = onlineSearchSubmittedQuery.trim();
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
          if (results.length === 0) setOnlineSearchError(t('worship.noLyrics'));
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
  }, [onlineSearchOpen, onlineSearchSubmittedQuery]);

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
    setWorshipOverlayVisible(false);
    showToast(t('worship.clearOverlay'));

    if (presentationLinkMode) return;

    try {
      await ensureObsConnected();
      await clearWorshipFromConfiguredOutput();
    } catch (err) {
      console.warn("[DockWorshipTab] clear worship failed:", err);
    }
  }, [clearWorshipFromConfiguredOutput, onStage, presentationLinkMode, showToast, t]);

  const handleToggleWorshipVisibility = useCallback(async () => {
    setActionError("");

    if (presentationLinkMode) {
      if (worshipOverlayVisible) {
        onStage(null);
        setWorshipOverlayVisible(false);
      } else if (activeSectionIndex !== null) {
        await goLiveSection(activeSectionIndex);
      }
      return;
    }

    try {
      await ensureObsConnected();

      if (worshipOverlayVisible) {
        await clearWorshipFromConfiguredOutput();
        setWorshipOverlayVisible(false);
        return;
      }

      if (activeSectionIndex !== null) {
        await goLiveSection(activeSectionIndex);
      } else {
        if (!hasSceneRoute) {
          await dockObsClient.bringWorshipOverlayForward(fullscreenOnlyMode ? "fullscreen" : overlayMode);
        }
        setWorshipOverlayVisible(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn("[DockWorshipTab] toggle worship visibility failed:", err);
        setActionError(message);
      }
    }
  }, [activeSectionIndex, clearWorshipFromConfiguredOutput, fullscreenOnlyMode, goLiveSection, hasSceneRoute, onStage, overlayMode, presentationLinkMode, worshipOverlayVisible]);

  const handleShowWorshipBackgroundOnly = useCallback(async () => {
    if (activeSectionIndex === null) return;
    const nextBackgroundOnly = !showWorshipBackgroundOnly;
    setShowWorshipBackgroundOnly(nextBackgroundOnly);
    setActionError("");

    await goLiveSection(activeSectionIndex, { backgroundOnly: nextBackgroundOnly });
  }, [activeSectionIndex, goLiveSection, showWorshipBackgroundOnly]);

  const handleTogglePresentationMeta = useCallback(async () => {
    const nextShowMeta = !showPresentationMeta;
    setShowPresentationMeta(nextShowMeta);
    if (!presentationLinkMode || activeSectionIndex === null) return;
    await goLiveSection(activeSectionIndex, { showPresentationMeta: nextShowMeta });
  }, [activeSectionIndex, goLiveSection, presentationLinkMode, showPresentationMeta]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement = target instanceof Element ? target : null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Escape") {
        if (songEditor || slideEditor || isNewSongModalOpen || onlineSearchOpen) {
          event.preventDefault();
          closeSongEditor();
          closeSlideEditor();
          closeNewSongModal();
          setOnlineSearchOpen(false);
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
    closeNewSongModal,
    closeSlideEditor,
    closeSongEditor,
    handleClearLyrics,
    handleShowCurrent,
    isActive,
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
      <div className="dock-worship-subtab-bar">
        <button
          type="button"
          className={`dock-worship-subtab${worshipSubTab === "worship" ? " dock-worship-subtab--active" : ""}`}
          onClick={() => setWorshipSubTab("worship")}
        >
          <Icon name="music_note" size={13} />
          Worship
        </button>
        <button
          type="button"
          className={`dock-worship-subtab${worshipSubTab === "notes" ? " dock-worship-subtab--active" : ""}`}
          onClick={() => setWorshipSubTab("notes")}
        >
          <Icon name="edit_note" size={13} />
          Notes
        </button>
      </div>

      {worshipSubTab === "worship" ? (
        <>
      {/* Song Browser (when no song selected) */}
      {!selectedSong ? (
            <>
              <section className="dock-console-panel dock-console-panel--toolbar">
                <div className="dock-console-header">
                  <div>
                    <div className="dock-console-header__eyebrow"></div>
                    <div className="dock-console-header__eyebrow"></div>
                    <div className="dock-console-header__eyebrow"></div>
                    <div className="dock-console-header__eyebrow">{t('worship.searchSongs')}</div>
                    <div className="dock-console-header__eyebrow"></div>

                  </div>
	                  <div className="dock-console-actions dock-console-actions--song-browser">
	                    <button
	                      type="button"
                      className="dock-console-toggle dock-console-toggle--icon-only"
                      onClick={() => {
                        setOnlineSearchQuery(searchQuery.trim());
                        setOnlineSearchSubmittedQuery("");
                        setOnlineResults([]);
                        setOnlineSearchOpen(true);
                        setOnlineSearchError("");
                      }}
                      title={t('worship.importOnline')}
	                      aria-label={t('worship.importOnline')}
	                    >
	                      <Icon name="travel_explore" size={14} />
	                    </button>
	                    <button
	                      type="button"
	                      className="dock-console-toggle dock-console-toggle--icon-only"
	                      onClick={() => openNewSongModal()}
	                      title={t('worship.addSong')}
	                      aria-label={t('worship.addSong')}
	                    >
	                      <Icon name="add" size={14} />
	                    </button>
	                  </div>
	                </div>
	                <div className="dock-search dock-search--console dock-search--plain" style={{ marginBottom: 0 }} ref={searchRef}>
	                  <input
	                    className="dock-input"
	                    placeholder={t('worship.searchPlaceholder')}
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
                    aria-label={t('worship.searchSongs')}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="dock-search__clear"
                      onClick={() => {
                        setSearchQuery("");
                        setShowRecentSearches(recentSearches.length > 0);
                      }}
                      aria-label={t('common.clear')}
                      title={t('common.clear')}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  )}
                  {showRecentSearches && !searchQuery.trim() && recentSearches.length > 0 && (
                    <div className="dock-search-dropdown dock-search-dropdown--recent">
                      <div className="dock-search-dropdown__heading">{t('worship.recentSearches')}</div>
                      {recentSearches.map((item) => (
                        <button
                          type="button"
                          key={item}
                          className="dock-search-dropdown__item dock-search-dropdown__item--recent"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applyRecentWorshipSearch(item)}
                          title={t('common.search')}>
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
                      {songs.length === 0 ? t('worship.noSongs') : t('worship.noSongsMatch')}
                    </div>
                    <div className="dock-empty__text">
                      {songs.length === 0
                        ? t('worship.loadSongsHint')
                        : t('worship.noSongsMatchQuery', { query: searchQuery })}
                    </div>
                  </div>
                ) : (
                  <div className="dock-console-list dock-worship-workspace__list">
                    {filteredSongs.map((song) => {
                      const isLocked = lockedSongIds.has(song.id);
                      const lyricsPreview = getSongCardLyricsPreview(song.lyrics);
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
                                void requireEntitlement("songs", songs.length);
                                return;
                              }
                              handleSelectSong(song);
                            }}
                            title={isLocked ? t('common.locked') : song.title}>
                            <span className="dock-card__title">{song.title}</span>
                            {song.artist.trim() ? (
                              <span className="dock-card__subtitle">
                                {song.artist.trim()}
                              </span>
                            ) : null}
                            <span className="dock-song-card__lyrics-preview" aria-label={t('worship.songLyrics')}>
                              {lyricsPreview.lines.length > 0 ? (
                                <>
                                  {lyricsPreview.lines.map((line, index) => (
                                    <span className="dock-song-card__lyrics-line" key={`${song.id}-preview-${index}`}>
                                      {line}
                                    </span>
                                  ))}
                                  {lyricsPreview.hasMore && (
                                    <span className="dock-song-card__lyrics-more" aria-hidden="true">…</span>
                                  )}
                                </>
                              ) : (
                                <span className="dock-song-card__lyrics-empty">{t('worship.noLyrics')}</span>
                              )}
                            </span>
                            {isLocked && (
                              <span className="dock-song-card__lock-badge">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                {t('worship.upgrade')}
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
                              aria-label={`${t('common.edit')} ${song.title}`}
                              title={t('worship.editSong')}
                            >
                              <Icon name="edit" size={16} />
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
                  <button
                    type="button"
                    className="dock-worship-back-btn"
                    onClick={handleBackToSongList}
                    title={t('common.back')}
                  >
                    <Icon name="arrow_back" size={14} />
                  </button>
                  <div className="dock-worship-summary__copy">
                    <div className="dock-worship-summary__title">{selectedSongDisplayTitle}</div>
                    {selectedSong.artist && (
                      <div className="dock-worship-summary__artist">{selectedSong.artist}</div>
                    )}
                    <div className="dock-worship-summary__meta">
                      <span>{t('worship.slideCount', { count: selectedSongSections.length })}</span>
                      <span className="dock-worship-summary__meta-dot">·</span>
                      <span>{linesPerSlide} {linesPerSlide === 1 ? t('worship.linePerSlide', { defaultValue: 'line per slide' }) : t('worship.linesPerSlide')}</span>
                    </div>
                  </div>
                  <div className="dock-worship-summary__actions">
                    <DockTranslationControls
                      compact
                      sections={selectedSongSections.map((section) => ({ id: section.id, text: section.text }))}
                      value={worshipTranslation}
                      onChange={(next) => {
                        worshipTranslationChangeRef.current = true;
                        setWorshipTranslation(next);
                      }}
                    />
                    <button
                      type="button"
                      className="dock-shell-icon-btn"
                      onClick={() => openSongEditor(selectedSong)}
                      title={t('worship.editSong')}
                      aria-label={t('worship.editSong')}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                  </div>
                </div>
              </section>

	              {/* Lyrics Search */}
	              <section className="dock-console-panel dock-console-panel--toolbar dock-worship-lyrics-search">
	                <div className="dock-media-search dock-media-search--plain">
	                  <input
	                    className="dock-media-search__input"
	                    placeholder={t('worship.lyricsSearchPlaceholder')}
                    value={lyricsSearchQuery}
                    onChange={(e) => setLyricsSearchQuery(e.target.value)}
                    aria-label={t('worship.lyricsSearchPlaceholder')}
                  />
                  {lyricsSearchQuery && (
                    <button
                      type="button"
                      className="dock-media-search__clear"
                      onClick={() => setLyricsSearchQuery("")}
                      aria-label={t('common.clear')}
                      title={t('common.close')}>
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
                        ? t('worship.noLyrics')
                        : t('worship.allSlidesHidden')}
                    </div>
                  </div>
                ) : lyricsFilteredSectionIndexes.length === 0 ? (
                  <div className="dock-empty dock-worship-workspace__empty">
                    <Icon name="search_off" size={18} />
                    <div className="dock-empty__text">
                      {t('worship.noSlidesMatch', { query: lyricsSearchQuery })}
                    </div>
                  </div>
                ) : (
                  <div className="dock-console-list dock-worship-workspace__list dock-worship-slide-queue">
                    {lyricsFilteredSectionIndexes.map((idx) => {
                      const section = selectedSongSections[idx];
                      if (!section) return null;
                      const displayLabel = section.label.trim();
                      const isVisible = visibleIdx === idx;
                      const isSelected = selectedIdx === idx;
                      return (
                        <div
                          key={section.id}
                          className={`dock-worship-slide-card${isVisible ? " dock-worship-slide-card--visible" : ""}${isSelected && !isVisible ? " dock-worship-slide-card--selected" : ""}`}
                          title={presentationLinkMode ? "Click to show on presentation screen" : "Click to view in OBS"}
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
                                    {t('worship.slideNumber', { number: idx + 1 })}
                                  </span>
                                )}
                                <span className="dock-worship-slide-card__index">{idx + 1}</span>
                              </div>
                              <div className="dock-worship-slide-card__badges">

                              </div>
                            </div>
                            {getOrderedTranslationParts(
                              normalizeDockMultilineText(section.text),
                              getWorshipSectionTranslation(section.id, worshipTranslation),
                              worshipTranslation?.showBoth ?? false,
                              worshipTranslation?.translationOrder,
                            ).map((part, partIndex) => (
                              <div
                                key={`${section.id}-${part.kind}-${partIndex}`}
                                className={part.kind === "translation"
                                  ? `dock-worship-slide-card__translation${partIndex === 0 ? " dock-worship-slide-card__translation--first" : ""}`
                                  : "dock-worship-slide-card__text"}
                              >
                                {normalizeDockMultilineText(part.text)}
                              </div>
                            ))}
                          </button>
                          <div className="dock-worship-slide-card__actions">
                            <button
                              type="button"
                              className="dock-worship-slide-card__action"
                              onClick={(event) => {
                                event.stopPropagation();
                                openSlideEditor(idx);
                              }}
                              title={t('worship.quickEdit')}
                              aria-label={t('worship.quickEdit')}
                            >
                              <Icon name="edit" size={16} />
                            </button>
                            <button
                              type="button"
                              className="dock-worship-slide-card__action dock-worship-slide-card__action--danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteSection(idx);
                              }}
                              title={t("common.delete")}
                              disabled={savingSong || selectedSongSections.length <= 1}
                            >
                              <Icon name="delete_outline" size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <DockOutputQuickActions
                  textLabel="Song text"
                  lineLabel="Lines per slide"
                  settings={activeWorshipQuickSettings}
                  lineCount={linesPerSlide}
                  maxLineCount={MAX_LINES_PER_SLIDE}
                  minFontSize={fullscreenOnlyMode || overlayMode === "fullscreen" ? 28 : 14}
                  maxFontSize={fullscreenOnlyMode || overlayMode === "fullscreen" ? 180 : 100}
                  updateImmediately={quickUpdateImmediately}
                  top={quickActionsTop}
                  left={quickActionsLeft}
                  onPositionChange={handleWorshipQuickActionsPositionChange}
                  onCommit={handleWorshipQuickCommit}
                  onUpdateImmediatelyChange={setQuickUpdateImmediately}
                />
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
                        title={t('common.close')}>
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  )}

                  <div className="dock-worship-toolbar">
                    <DockBottomToolbar
                      overlayMode={fullscreenOnlyMode ? "fullscreen" : overlayMode}
                      onModeChange={handleOverlayModeChange}
                      hideOverlayModeToggle={fullscreenOnlyMode}
                      clearLabel={worshipOverlayVisible
                        ? t('worship.hideLyrics', { defaultValue: 'Hide lyrics' })
                        : t('worship.showLyrics', { defaultValue: 'Show lyrics' })}
                      onClear={handleToggleWorshipVisibility}
                      sourceVisible={worshipOverlayVisible}
                      collapsed={toolbarCollapsed}
                      onCollapseChange={setToolbarCollapsed}
                      inlineAction={
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <DockSceneRoutingControl
                            module="worship"
                            route={sceneRoute}
                            onRouteChange={updateSceneRoute}
                            disabled={presentationLinkMode}
                            title={t("sceneRouting.worship", "Worship output")}
                            placement="above"
                          />
                          <button
                            type="button"
                            className="dock-btm-toolbar__icon-btn"
                            onClick={() => setShowThemeSettings(true)}
                            title={t('worship.quickEdits')}
                            aria-label={t('worship.quickEdits')}
                          >
                            <Icon name="tune" size={14} />
                          </button>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        ref={deletedSectionsTriggerRef}
                        className={`dock-btm-toolbar__icon-btn${showDeletedSectionsPopover ? " dock-btm-toolbar__icon-btn--active" : ""}`}
                        onClick={handleToggleDeletedSectionsPopover}
                        title={t("worship.viewDeletedSlides", { defaultValue: "View deleted slides" })}
                        aria-label={t("worship.viewDeletedSlides", { defaultValue: "View deleted slides" })}
                        aria-expanded={showDeletedSectionsPopover}
                      >
                        <Icon name="history" size={14} />
                        {deletedSections.length > 0 && (
                          <span className="dock-worship-history__count">{Math.min(deletedSections.length, 9)}</span>
                        )}
                      </button>

                      <button
                        type="button"
                        className={`dock-btm-toolbar__icon-btn${showWorshipBackgroundOnly ? " dock-btm-toolbar__icon-btn--active" : ""}`}
                        onClick={handleShowWorshipBackgroundOnly}
                        title={showWorshipBackgroundOnly ? t('worship.presentLyrics') : t('worship.backgroundOnly')}
                      >
                        <Icon name={showWorshipBackgroundOnly ? "visibility_off" : "visibility"} size={14} />
                      </button>

                      {presentationLinkMode && (
                        <button
                          type="button"
                          className={`dock-btm-toolbar__icon-btn${showPresentationMeta ? " dock-btm-toolbar__icon-btn--active" : ""}`}
                          onClick={() => void handleTogglePresentationMeta()}
                          title={showPresentationMeta ? "Hide title and section on screen" : "Show title and section on screen"}
                          aria-label={showPresentationMeta ? "Hide title and section on presentation screen" : "Show title and section on presentation screen"}
                        >
                          <Icon name="title" size={14} />
                        </button>
                      )}

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
                          title={t('worship.linesPerSlide')}
                        >
                          <Icon name="text_fields" size={14} />
                        </button>

                        {showLineCountPopover && (
                          <div className="dock-line-popover__menu" role="dialog" aria-label={t('worship.linesPerSlide')}>
                            <div className="dock-line-popover__title">{t('worship.linesPerSlide')}</div>
                            <div className="dock-line-popover__grid">
                              {Array.from(
                                { length: MAX_LINES_PER_SLIDE - MIN_LINES_PER_SLIDE + 1 },
                                (_, index) => MIN_LINES_PER_SLIDE + index,
                              ).map((count) => {
                                const isDisabled = totalLyricLines > 0 && count > totalLyricLines;
                                return (
                                  <button
                                    key={`worship-line-choice-${count}`}
                                    type="button"
                                    disabled={isDisabled}
                                    className={`dock-line-popover__option${linesPerSlide === count ? " dock-line-popover__option--active" : ""}${isDisabled ? " dock-line-popover__option--disabled" : ""}`}
                                    onClick={() => handleLinesPerSlideChange(count)}
                                  >
                                    {count}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </DockBottomToolbar>
                  </div>
                </section>
              )}
            </>
          )}

          {songEditor && (
            <DockLyricsEditorDialog
              key={songEditor.id}
              dialogId="dock-song-editor-title"
              eyebrow={t('worship.editSong')}
              title={t('worship.songDetails')}
              initialDraft={songDraft}
              saveLabel={savingSong ? t('worship.saving') : t('common.save')}
              cancelLabel={t('common.cancel')}
              resetLabel={t('worship.resetDefault')}
              saving={savingSong}
              onCancel={closeSongEditor}
              onSave={handleSaveSongEditor}
              onReset={handleResetSongEditor}
              onDraftChange={setSongDraft}
            />
          )}

          {slideEditor && (
            <div className="dock-dialog-backdrop" role="presentation">
              <div className="dock-dialog dock-dialog--compact" role="dialog" aria-modal="true" aria-labelledby="dock-slide-editor-title">
                <div className="dock-dialog__header">
                  <div>
                    <div className="dock-dialog__eyebrow">{t('worship.quickEdit')}</div>
                    <h2 id="dock-slide-editor-title" className="dock-dialog__title">{slideEditor.label}</h2>
                  </div>
                  <button
                    type="button"
                    className="dock-dialog__close"
                    onClick={closeSlideEditor}
                    aria-label={t('common.close')}
                    title={t('common.close')}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <div className="dock-dialog__body">
                  <div className="dock-lyrics-toolbar" role="toolbar" aria-label="Slide text formatting">
                    <div className="dock-lyrics-toolbar__actions">
                      <div className="dock-lyrics-autosplit" ref={slideEditorAutoSplitPopoverRef}>
                        <button
                          type="button"
                          className={`dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--icon dock-lyrics-toolbar__btn--accent${slideEditorAutoSplitPopoverOpen ? " dock-lyrics-toolbar__btn--active" : ""}`}
                          onClick={() => setSlideEditorAutoSplitPopoverOpen((v) => !v)}
                          title="Auto Split"
                          aria-label="Auto Split"
                          aria-haspopup="menu"
                          aria-expanded={slideEditorAutoSplitPopoverOpen}
                        >
                          <Icon name="format_align_left" size={12} />
                          <span className="dock-lyrics-toolbar__caret">▾</span>
                        </button>
                        {slideEditorAutoSplitPopoverOpen && (
                          <div className="dock-lyrics-autosplit__menu" role="menu" aria-label="Auto split options">
                            {[2, 3, 4].map((n) => (
                              <button
                                key={n}
                                type="button"
                                className="dock-lyrics-autosplit__option"
                                onClick={() => {
                                  handleFormatSlideEditor("autosplit", n);
                                  setSlideEditorAutoSplitPopoverOpen(false);
                                }}
                              >
                                {n} lines
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button type="button" className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--icon" onClick={() => handleFormatSlideEditor("clean")} title="Clean Text" aria-label="Clean Text">
                        <Icon name="auto_fix_high" size={12} />
                      </button>
                      <button type="button" className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--icon dock-lyrics-toolbar__btn--toggle" onClick={() => handleFormatSlideEditor("remove-verse-numbers")} title="Verse Numbers" aria-label="Verse Numbers">
                        <Icon name="tag" size={12} />
                      </button>
                    </div>
                    <div className="dock-lyrics-toolbar__group" role="group" aria-label="Text case controls">
                      <button type="button" className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--case"
                        onClick={() => handleFormatSlideEditor("uppercase")} title="Uppercase" aria-label="Uppercase">
                        <span>AA</span>
                      </button>
                      <button type="button" className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--case"
                        onClick={() => handleFormatSlideEditor("lowercase")} title="Lowercase" aria-label="Lowercase">
                        <span>aa</span>
                      </button>
                      <button type="button" className="dock-lyrics-toolbar__btn dock-lyrics-toolbar__btn--case"
                        onClick={() => handleFormatSlideEditor("capitalize")} title="Capitalize" aria-label="Capitalize">
                        <span>Aa</span>
                      </button>
                    </div>
                  </div>
                  <label className="dock-dialog-field">
                    <span>{t('worship.slideText')}</span>
                    <textarea
                      className="dock-input dock-dialog-textarea dock-dialog-textarea--short"
                      value={slideEditor.text}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                      }}
                      onChange={(event) => {
                        slideEditorAutoSplitSourceRef.current = null;
                        setSlideEditor((draft) => draft ? { ...draft, text: event.target.value } : draft);
                      }}
                    />
                  </label>
                </div>
                <div className="dock-dialog__footer">
                  <button type="button" className="dock-btn dock-btn--ghost" onClick={closeSlideEditor} title={t('common.cancel')}>
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="dock-btn dock-btn--primary"
                    onClick={() => void handleSaveSlideEditor()}
                    disabled={savingSong || !slideEditor.text.trim()}
                    title={t('worship.saving')}>
                    {savingSong ? t('worship.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isNewSongModalOpen && (
            <DockLyricsEditorDialog
              dialogId="dock-new-song-title"
              eyebrow={newSongSource?.importSourceType === "online" ? t('worship.reviewImport') : t('worship.addSong')}
              title={newSongSource?.importSourceType === "online" ? t('worship.reviewLyricsBeforeSaving') : t('worship.newWorshipSong')}
              initialDraft={newSongDraft}
              saveLabel={savingSong ? t('worship.saving') : t('worship.saveSong')}
              cancelLabel={t('common.cancel')}
              saving={savingSong}
              onCancel={closeNewSongModal}
              onSave={handleSaveNewSong}
              onDraftChange={setNewSongDraft}
            />
          )}

          {onlineSearchOpen && (
            <div className="dock-dialog-backdrop" role="presentation">
              <div className="dock-dialog" role="dialog" aria-modal="true" aria-labelledby="dock-online-song-title">
                <div className="dock-dialog__header">
                  <div>
                    <div className="dock-dialog__eyebrow">{t('worship.importOnline')}</div>
                    <h2 id="dock-online-song-title" className="dock-dialog__title">{t('worship.importLyrics')}</h2>
                  </div>
                  <button
                    type="button"
                    className="dock-dialog__close"
                    onClick={() => setOnlineSearchOpen(false)}
                    aria-label={t('common.close')}
                    title={t('common.close')}>
                    <Icon name="close" size={14} />
                  </button>
	                </div>
	                <div className="dock-dialog__body">
                  <form
                    className="dock-search dock-search--console dock-search--plain dock-search--online"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleOnlineSearch();
                    }}
                  >
                    <div className="dock-search--online__field">
                      <input
                        className="dock-input"
                        placeholder={t('worship.typeToSearch')}
                        value={onlineSearchQuery}
                        onChange={(event) => {
                          setOnlineSearchQuery(event.target.value);
                          setOnlineSearchSubmittedQuery("");
                        }}
                        aria-label={t('worship.searchOnline')}
                        autoFocus
                      />
                      {onlineSearchQuery && (
                        <button
                          type="button"
                          className="dock-search__clear"
                          onClick={() => {
                            setOnlineSearchQuery("");
                            setOnlineSearchSubmittedQuery("");
                          }}
                          aria-label={t('common.clear')}
                          title={t('common.clear')}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="dock-search__submit"
                      disabled={onlineSearchLoading || onlineSearchQuery.trim().length < 3}
                      aria-label={t('worship.searchOnline')}
                      title={t('worship.searchOnline')}
                    >
                      Search
                    </button>
                  </form>
                  {onlineSearchLoading && (
                    <div className="dock-dialog__status">
                      <Icon name="sync" size={13} />
                      {t('worship.searchingOnline')}
                    </div>
                  )}
                  {onlineSearchError && <div className="dock-dialog__error">{onlineSearchError}</div>}
                  <div className="dock-dialog-results">
                    {onlineResults.map((result) => (
                      <div className="dock-dialog-result" key={result.id}>
                        <div className="dock-dialog-result__body">
                          <span className="dock-dialog-result__title">{result.title}</span>
                          <span className="dock-dialog-result__meta">
                            {[result.artist, result.sourceName].filter(Boolean).join(" · ") || t('worship.onlineLyrics')}
                          </span>
                          {result.preview && <span className="dock-dialog-result__preview">{result.preview}</span>}
                        </div>
                        <button
                          type="button"
                          className="dock-btn dock-btn--ghost dock-dialog-result__action"
                          onClick={() => handleImportOnlineResult(result)}
                          title={t('worship.importSong')}>
                          {t('worship.importSong')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          </>
        ) : (
          <DockNotesTab
            staged={staged}
            onStage={onStage}
            isActive={isActive && worshipSubTab === "notes"}
            presentationOutputTarget={presentationOutputTarget}
          />
        )}

      {/* Theme Settings Modal */}
      <DockThemeSettingsModal
        selectedThemeId={activeThemePickerProps.selectedThemeId}
        onSelect={activeThemePickerProps.onSelect}
        allowedCategories={["worship", "general"]}
        quickSettings={
          fullscreenOnlyMode || overlayMode === "fullscreen"
            ? activeFullscreenQuickThemeSettings
            : activeLowerThirdQuickThemeSettings
        }
        defaultQuickSettings={
          fullscreenOnlyMode || overlayMode === "fullscreen"
            ? defaultFullscreenQuickThemeSettings
            : defaultLowerThirdQuickThemeSettings
        }
        onQuickSettingsSave={(next) => {
          if (fullscreenOnlyMode || overlayMode === "fullscreen") {
            handleSaveFullscreenQuickThemeSettings(next);
          } else {
            handleSaveLowerThirdQuickThemeSettings(next);
          }
        }}
        resolveThemeQuickSettings={resolveThemeQuickSettings}
        title={t('worship.quickEdits')}
        subtitle={t('worship.adjustDescription')}
        isOpen={showThemeSettings}
        onClose={() => setShowThemeSettings(false)}
        overlayMode={fullscreenOnlyMode ? "fullscreen" : overlayMode}
        showReferences={false}
        storageScope="worship"
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

      {showDeletedSectionsPopover && createPortal(
        <div
          ref={deletedSectionsPopoverRef}
          className="dock-worship-history__popover"
          role="dialog"
          aria-label={t("worship.deletedSlides", { defaultValue: "Deleted slides" })}
          style={{
            position: "fixed",
            top: deletedSectionsPopoverPos.top,
            left: deletedSectionsPopoverPos.left,
            zIndex: 10000,
          }}
        >
          <div className="dock-worship-history__popover-header">
            <span className="dock-worship-history__popover-title">
              {t("worship.deletedSlides", { defaultValue: "Deleted slides" })}
            </span>
            <button
              type="button"
              className="dock-worship-history__popover-close"
              onClick={() => setShowDeletedSectionsPopover(false)}
              title={t("common.close")}
              aria-label={t("common.close")}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
          {deletedSections.length === 0 ? (
            <div className="dock-worship-history__empty">
              {t("worship.deletedSlidesEmpty", { defaultValue: "Deleted slides will appear here until you switch songs." })}
            </div>
          ) : (
            <div className="dock-worship-history__list">
              {deletedSections.map((item) => (
                <div key={item.id} className="dock-worship-history__item">
                  <div className="dock-worship-history__copy">
                    <div className="dock-worship-history__item-title">{item.label || `Slide ${item.index + 1}`}</div>
                    <div className="dock-worship-history__item-text">{item.text}</div>
                  </div>
                  <button
                    type="button"
                    className="dock-worship-history__restore"
                    onClick={() => void handleRestoreDeletedSection(item)}
                    title={t("sermon.restoreBtn")}
                    disabled={savingSong}
                  >
                    <Icon name="undo" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
