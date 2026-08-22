/**
 * DockBibleTab.tsx — Bible tab for the OBS Browser Dock
 *
 * Smart search: type "gen1vs1", "g11", "jn3:16", "ps23" etc.
 * Resolves straight into a fast chapter reader with stage / live actions per verse.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { withScriptureFontFallback } from "../../bible/scriptureFont";
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
import DockThemeSettingsModal, {
  type DockThemeSceneProfile,
  type DockThemeSettingsSaveContext,
} from "../components/DockThemeSettingsModal";
import BibleHistoryScreen from "./BibleHistoryScreen";
import { addToBibleHistory, loadBibleHistory } from "./bibleHistoryTypes";
import type { BibleHistoryItem } from "./bibleHistoryTypes";
import type { DockFullscreenQuickThemeSettings } from "../components/DockFullscreenThemeQuickSettings";
import {
  buildDockBackgroundPresetOverrides,
  type DockBackgroundPreset
} from "../dockConsoleTheme";
import Icon from "../DockIcon";
import DockBottomToolbar from "../components/DockBottomToolbar";
import DockSceneRoutingControl from "../components/DockSceneRoutingControl";
import {
  areQuickThemeSettingsEquivalent,
  applyMeasuredFontFitSettings,
  buildLinkedLowerThirdQuickThemeSettings,
  mergeQuickThemeBackground,
  normalizeLowerThirdFitSettings,
  LOWER_THIRD_FIT_MIN_FONT_SIZE,
  LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE,
  LOWER_THIRD_FONT_SIZE_MAX,
  LOWER_THIRD_REFERENCE_FONT_SIZE_MAX,
  type DockOverlayFontFitMeasurement,
} from "../lowerThirdQuickSettings";
import { normalizeCompareThemeSettings } from "../compareThemeConfig";
import { resolveInitialDockBibleCompareEnabled } from "../dockBibleComparePreferences";
import { DOCK_QUICK_SIZE_OPTIONS as LOWER_THIRD_QUICK_SIZE_OPTIONS } from "../dockQuickSizePresets";

import { ensureObsConnected } from "../obsConnectionGuard";
import { trackBiblePresent } from "../../services/tracking";
import { loadDockFavoriteBibleThemes } from "../dockThemeData";
import {
  BOOK_CHAPTERS,
  NT_BOOKS,
  OT_BOOKS,
  type DockStagedItem,
} from "../dockTypes";
import type { DockPresentationOutputTarget } from "../dockPresentationTarget";
import { isPresentationLinkTarget } from "../dockPresentationTarget";
import type { DockSearchPlacement } from "../dockSearchPlacement";
import { requireEntitlement } from "../dockEntitlement";
import { readNativeDockSetting, writeNativeDockSetting } from "../../services/localDockSettings";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  loadDockPreference,
  readDockPreference,
  saveDockPreference,
} from "../../services/dockPreferenceStorage";
import { invoke } from "@tauri-apps/api/core";
import { dockObsClient, type DockBiblePushData, type DockOverlayFitOptions } from "../dockObsClient";
import { useDockSceneRoute } from "../dockSceneRouting";
import { isDockTabVisible } from "../dockTabVisibility";
import { themeSupportsBibleOverlayMode } from "../../bible/themeVariantSupport";
import {
  buildBibleVerseClipboardText,
  copyTextToClipboard,
} from "../bibleClipboard";
import { getDockBibleKeywordMatchOutputOptions } from "../dockKeywordMatch";
import { getOverlayBaseUrlSync } from "../../services/overlayUrl";
import { getRecommendedPollingInterval } from "../../services/performanceManager";
import {
  formatDockFavoriteBibleSearch,
  mergeFavoriteBibleSearches,
  type DockFavoriteBibleSearch,
} from "../bibleSearchSuggestions";
import DockBibleComparePassageControls from "../components/DockBibleComparePassageControls";
import DockCompactTranslationSelect from "../components/DockCompactTranslationSelect";
import {
  buildInstalledTranslationOptions,
  DEFAULT_INSTALLED_TRANSLATION_OPTION,
  resolveInstalledTranslation,
  type BibleTranslationOption,
} from "../bibleTranslationAvailability";
import {
  formatBiblePassageReference,
  navigateBiblePassageReference,
  parseBiblePassageReference,
  type ComparePassageDraft,
  type ComparePassageNavigation,
  type ComparePassagePreview,
  type ParsedBiblePassageReference,
} from "../bibleMultiPassage";

const BIBLE_BOOK_ORDER = [...OT_BOOKS, ...NT_BOOKS];

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  productionDefaults: DockProductionModuleSettings;
  initialVoiceBible?: VoiceBibleSnapshot | null;
  appConnected: boolean;
  presentationOutputTarget?: DockPresentationOutputTarget;
  searchPlacement?: DockSearchPlacement;
  fullscreenOnly?: boolean;
  showHistory?: boolean;
  onHistoryClose?: () => void;
  onSaveFeedback?: (message: string) => void;
}

type OverlayMode = "fullscreen" | "lower-third";
type DisplayMode = "single" | "compare";
type CompareMode = "translations" | "passages";
type CompareLayout = "line-by-line" | "side-by-side";
type ThemeSettingsTab = "text" | "layout" | "background" | "compare";
type BibleReferenceFormat = "full" | "short" | "hidden";
type ComparePassageOutputColumn = {
  book: string;
  chapter: number;
  verse: number;
  verseEnd: number | null;
  verseRange: string;
  referenceLabel: string;
  translation: string;
  verseText: string;
};
type BibleBrowserQuickSettingsPatch = Partial<Pick<
  DockFullscreenQuickThemeSettings,
  | "fontSize"
  | "refFontSize"
  | "lineHeight"
  | "refSpacing"
  | "compareVerseFontSizeLeft"
  | "compareVerseFontSizeRight"
  | "compareReferenceFontSizeLeft"
  | "compareReferenceFontSizeRight"
  | "compareAutoFitMaxFontSize"
  | "autoFontScale"
  | "animation"
  | "animationDuration"
  | "referenceBackgroundEnabled"
  | "referenceBackgroundColor"
  | "referenceBackgroundStyle"
  | "referenceBackgroundRadius"
  | "lowerThirdSize"
  | "lowerThirdWidthPreset"
  | "lowerThirdCardPadding"
  | "lowerThirdBarMaxHeight"
>>;
type BibleQuickSettingsSaveContext = DockThemeSettingsSaveContext & {
  lineCount?: number;
};

const GENERAL_SCENE_PROFILE_ID = "__general__";

interface DockSceneQuickThemeProfile {
  fullscreen?: DockFullscreenQuickThemeSettings | null;
  lowerThird?: DockFullscreenQuickThemeSettings | null;
  fullscreenThemeId?: string;
  lowerThirdThemeId?: string;
  fullscreenThemeSettings?: Record<string, unknown> | null;
  lowerThirdThemeSettings?: Record<string, unknown> | null;
}

type DockSceneQuickThemeSettings = Record<string, DockSceneQuickThemeProfile>;

interface BibleThemeOutputOverride {
  themeId: string;
  settings: BibleThemeSettings;
  liveOverrides?: Record<string, unknown> | null;
}
const DOCK_BIBLE_PREFS_KEY = "ocs-dock-bible-preferences";
const DOCK_BIBLE_UI_PREFS_KEY = "ocs-dock-bible-ui-preferences";
const MAX_VERSE_LINES = 4;
const DEFAULT_VERSE_LINES = 1;
const DEFAULT_QUICK_ACTIONS_TOP = 42;
const QUICK_ACTIONS_MIN_TOP = 8;
const QUICK_ACTIONS_HANDLE_WIDTH = 30;
const QUICK_ACTIONS_HANDLE_HEIGHT = 74;
const QUICK_ACTIONS_BOTTOM_GAP = 12;
const DEFAULT_BIBLE_REFERENCE_FORMAT: BibleReferenceFormat = "full";
const QUICK_SELECT_VERSION_COUNT = 2;
const MIN_COMPARE_PASSAGES = 2;
const MAX_COMPARE_PASSAGES = 3;
const MIN_DOCK_KEYWORD_SEARCH_LENGTH = 2;
const DOCK_KEYWORD_SEARCH_LIMIT = 24;
const DOCK_SEARCH_DEBOUNCE_MS = 300;
const BIBLE_RECENT_SEARCHES_KEY = "ocs-dock-bible-recent-searches-v1";
const BIBLE_RECENT_SEARCH_LIMIT = 4;
const HISTORY_PREVIEW_MAX_CHARS = 28;

function getHistoryVersePreview(verseText: string): string {
  const lines = verseText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  const firstLine = lines[0];
  if (firstLine.length <= HISTORY_PREVIEW_MAX_CHARS && lines.length === 1) {
    return firstLine;
  }

  const words = firstLine.split(/\s+/);
  let preview = "";
  for (const word of words) {
    const next = preview ? `${preview} ${word}` : word;
    if (next.length > HISTORY_PREVIEW_MAX_CHARS) break;
    preview = next;
  }

  return `${preview || firstLine.slice(0, HISTORY_PREVIEW_MAX_CHARS).trimEnd()}…`;
}

function getRecentBibleHistoryItems(items: BibleHistoryItem[]): BibleHistoryItem[] {
  return [...items].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
}

function getFavoriteBibleHistoryItems(): BibleHistoryItem[] {
  return loadBibleHistory().filter((item) => item.isFavorite);
}

interface DockBiblePreferences {
  [key: string]: unknown;
  overlayMode?: OverlayMode;
  displayMode?: DisplayMode;
  translation?: string;
  translations?: string[];
  translationA?: string;
  translationB?: string;
  compareEnabled?: boolean;
  compareMode?: CompareMode;
  compareLayout?: CompareLayout;
  comparePassages?: Array<{ reference?: string; translation?: string }>;
  comparePassageNavigation?: ComparePassageNavigation;
  verseLineCount?: number;
  fullscreenThemeId?: string;
  lowerThirdThemeId?: string;
  backgroundPreset?: DockBackgroundPreset;
  fullscreenQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickThemeSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickThemeSettingsLinkedToFullscreen?: boolean;
  sceneQuickThemeSettings?: DockSceneQuickThemeSettings;
  referenceFormat?: BibleReferenceFormat;
  referenceVersionVisible?: boolean;
  keywordMatchPushDirectlyToObs?: boolean;
  selectedBook?: string;
  selectedChapter?: number;
  updatedAt?: string;
}

interface DockBibleUiPreferences {
  [key: string]: unknown;
  controlsCollapsed?: boolean;
  quickActionsTop?: number;
  quickActionsLeft?: number | null;
  browserQuickUpdateImmediately?: boolean;
  updatedAt?: string;
}

type QuickActionsDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  currentLeft: number;
  currentTop: number;
  containerWidth: number;
  containerHeight: number;
  didDrag: boolean;
};

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

function normalizeComparePassageDrafts(
  values: DockBiblePreferences["comparePassages"],
  translationA: string,
  translationB: string,
): ComparePassageDraft[] {
  const stored = Array.isArray(values) ? values.slice(0, MAX_COMPARE_PASSAGES) : [];
  const drafts = stored.map((value, index) => ({
    id: `compare-passage-${index + 1}`,
    reference: typeof value?.reference === "string" ? value.reference : "",
    translation: typeof value?.translation === "string" && value.translation.trim()
      ? value.translation.toUpperCase()
      : index === 0 ? translationA.toUpperCase() : translationB.toUpperCase(),
  }));

  while (drafts.length < MIN_COMPARE_PASSAGES) {
    const index = drafts.length;
    drafts.push({
      id: `compare-passage-${index + 1}`,
      reference: "",
      translation: (index === 0 ? translationA : translationB).toUpperCase(),
    });
  }
  return drafts;
}

function clampVerseLineCount(value?: number): number {
  if (!value || Number.isNaN(value)) return DEFAULT_VERSE_LINES;
  return Math.min(MAX_VERSE_LINES, Math.max(1, value));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function QuickFontSizeInput({
  value,
  min,
  max,
  label,
  disabled = false,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    if (inputRef.current !== document.activeElement) setDraftValue(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draftValue);
    const nextValue = Number.isFinite(parsed) ? clampNumber(parsed, min, max) : value;
    setDraftValue(String(nextValue));
    if (nextValue !== value) onCommit(nextValue);
  };

  return (
    <input
      ref={inputRef}
      type="number"
      className="dock-bible-reader__font-size-input"
      value={draftValue}
      min={min}
      max={max}
      disabled={disabled}
      step={1}
      inputMode="numeric"
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          inputRef.current?.blur();
        } else if (event.key === "Escape") {
          setDraftValue(String(value));
          inputRef.current?.blur();
        }
      }}
      aria-label={label}
    />
  );
}

interface BibleOutputControlsMenuProps {
  open: boolean;
  settings: DockFullscreenQuickThemeSettings;
  lineCount: number;
  isFitTextMode: boolean;
  showManualFontControls: boolean;
  areManualFontSizesDisabled: boolean;
  browserFontSizeMin: number;
  browserFontSizeMax: number;
  browserReferenceFontSizeMin: number;
  browserReferenceFontSizeMax: number;
  browserQuickUpdateImmediately: boolean;
  hasPendingBrowserQuickChanges: boolean;
  onClose: () => void;
  onFontSizeChange: (field: "fontSize" | "refFontSize", delta: number) => void;
  onFontSizeValueChange: (field: "fontSize" | "refFontSize", value: number) => void;
  onLowerThirdSizePresetChange: (option: (typeof LOWER_THIRD_QUICK_SIZE_OPTIONS)[number]) => void;
  onReferenceBackgroundChange: (enabled: boolean) => void;
  onLineCountChange: (lineCount: number) => void;
  onUpdateImmediatelyChange: (checked: boolean) => void;
  keywordMatchPushDirectlyToObs: boolean;
  onKeywordMatchPushDirectlyToObsChange: (checked: boolean) => void;
  onSave: () => void | Promise<void>;
}

function BibleOutputControlsMenu({
  open,
  settings,
  lineCount,
  isFitTextMode,
  showManualFontControls,
  areManualFontSizesDisabled,
  browserFontSizeMin,
  browserFontSizeMax,
  browserReferenceFontSizeMin,
  browserReferenceFontSizeMax,
  browserQuickUpdateImmediately,
  hasPendingBrowserQuickChanges,
  onClose,
  onFontSizeChange,
  onFontSizeValueChange,
  onLowerThirdSizePresetChange,
  onReferenceBackgroundChange,
  onLineCountChange,
  onUpdateImmediatelyChange,
  keywordMatchPushDirectlyToObs,
  onKeywordMatchPushDirectlyToObsChange,
  onSave,
}: BibleOutputControlsMenuProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="dock-bible-reader__font-size-menu" role="dialog" aria-label={t("bible.bibleOutputControls", "Bible output controls")}>
      <div className="dock-bible-reader__font-size-menu-header">
        <span>{t("bible.bibleOutputControls", "Bible output controls")}</span>
      </div>
      {isFitTextMode && (
        <div className="dock-bible-reader__font-size-field">
          <span className="dock-bible-reader__font-size-field-label">{t("bible.frameSize", "Text size")}</span>
          <small>{t("bible.frameSizeDescription", "Larger text and reference; narrower text area.")}</small>
          <div className="dock-bible-reader__size-presets" role="group" aria-label={t("bible.frameSize", "Text size")}>
            {LOWER_THIRD_QUICK_SIZE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`dock-bible-reader__size-preset${
                  settings.lowerThirdSize === option.preset ? " dock-bible-reader__size-preset--active" : ""
                }`}
                onClick={() => onLowerThirdSizePresetChange(option)}
                aria-pressed={settings.lowerThirdSize === option.preset}
              >
                {t(option.labelKey, option.label)}
              </button>
            ))}
          </div>
        </div>
      )}
      {(!isFitTextMode || showManualFontControls) && (
        <div className="dock-bible-reader__font-size-field-row">
          <div className="dock-bible-reader__font-size-field">
            <span className="dock-bible-reader__font-size-field-label">{t("bible.bibleVerse", "Bible verse")}</span>
            <div className="dock-bible-reader__font-size-controls">
              <button
                type="button"
                className="dock-bible-reader__font-size-btn"
                onClick={() => onFontSizeChange("fontSize", -4)}
                disabled={areManualFontSizesDisabled || settings.fontSize <= browserFontSizeMin}
                aria-label={t("bible.decreaseVerseTextSize", "Decrease verse text size")}
                title={t("bible.decreaseVerseTextSize", "Decrease verse text size")}
              >
                <Icon name="remove" size={11} />
              </button>
              <QuickFontSizeInput
                value={settings.fontSize}
                min={browserFontSizeMin}
                max={browserFontSizeMax}
                label={t("bible.bibleVerse", "Bible verse")}
                disabled={areManualFontSizesDisabled}
                onCommit={(value) => onFontSizeValueChange("fontSize", value)}
              />
              <button
                type="button"
                className="dock-bible-reader__font-size-btn"
                onClick={() => onFontSizeChange("fontSize", 4)}
                disabled={areManualFontSizesDisabled || settings.fontSize >= browserFontSizeMax}
                aria-label={t("bible.increaseVerseTextSize", "Increase verse text size")}
                title={t("bible.increaseVerseTextSize", "Increase verse text size")}
              >
                <Icon name="add" size={11} />
              </button>
            </div>
          </div>
          <div className="dock-bible-reader__font-size-field">
            <span className="dock-bible-reader__font-size-field-label">{t("bible.reference", "Reference")}</span>
            <div className="dock-bible-reader__font-size-controls">
              <button
                type="button"
                className="dock-bible-reader__font-size-btn"
                onClick={() => onFontSizeChange("refFontSize", -2)}
                disabled={areManualFontSizesDisabled || settings.refFontSize <= browserReferenceFontSizeMin}
                aria-label={t("bible.decreaseReferenceTextSize", "Decrease reference text size")}
                title={t("bible.decreaseReferenceTextSize", "Decrease reference text size")}
              >
                <Icon name="remove" size={11} />
              </button>
              <QuickFontSizeInput
                value={settings.refFontSize}
                min={browserReferenceFontSizeMin}
                max={browserReferenceFontSizeMax}
                label={t("bible.reference", "Reference")}
                disabled={areManualFontSizesDisabled}
                onCommit={(value) => onFontSizeValueChange("refFontSize", value)}
              />
              <button
                type="button"
                className="dock-bible-reader__font-size-btn"
                onClick={() => onFontSizeChange("refFontSize", 2)}
                disabled={areManualFontSizesDisabled || settings.refFontSize >= browserReferenceFontSizeMax}
                aria-label={t("bible.increaseReferenceTextSize", "Increase reference text size")}
                title={t("bible.increaseReferenceTextSize", "Increase reference text size")}
              >
                <Icon name="add" size={11} />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="dock-bible-reader__font-size-field-row">
        <div className="dock-bible-reader__font-size-field dock-bible-reader__font-size-field--compact">
          <span className="dock-bible-reader__font-size-field-label">{t("bible.referenceBackground", "Reference background")}</span>
          <button
            type="button"
            className={`dtb-toggle${settings.referenceBackgroundEnabled ? " dtb-toggle--on" : ""}`}
            onClick={() => onReferenceBackgroundChange(!settings.referenceBackgroundEnabled)}
            role="switch"
            aria-checked={settings.referenceBackgroundEnabled === true}
            aria-label={t("bible.referenceBackground", "Reference background")}
          >
            <span className="dtb-toggle__knob" />
          </button>
        </div>
        <label className="dock-bible-reader__font-size-field dock-bible-reader__font-size-field--compact">
          <span className="dock-bible-reader__font-size-field-label">{t("bible.linesPerVerse", "Lines per verse")}</span>
          <select
            className="dock-bible-reader__font-size-select"
            value={lineCount}
            onChange={(event) => onLineCountChange(Number(event.target.value))}
            aria-label={t("bible.linesPerVerse", "Lines per verse")}
          >
            {Array.from({ length: MAX_VERSE_LINES }, (_, index) => index + 1).map((count) => (
              <option key={`quick-lines-${count}`} value={count}>
                {count} {count === 1 ? t("bible.line", "line") : t("bible.lines", "lines")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dock-bible-reader__font-size-menu-footer">
        <div className="dock-bible-reader__font-size-menu-preferences">
          <label className="dock-bible-reader__font-size-checkbox">
            <input
              type="checkbox"
              checked={browserQuickUpdateImmediately}
              onChange={(event) => onUpdateImmediatelyChange(event.target.checked)}
            />
            <span>{t("bible.updateImmediately", "Update Immediately")}</span>
          </label>
          <label className="dock-bible-reader__font-size-checkbox dock-bible-reader__font-size-checkbox--stacked">
            <input
              type="checkbox"
              checked={keywordMatchPushDirectlyToObs}
              onChange={(event) => onKeywordMatchPushDirectlyToObsChange(event.target.checked)}
              aria-describedby="bible-keyword-match-direct-push-description"
            />
            <span className="dock-bible-reader__font-size-checkbox-copy">
              <span>{t("bible.keywordMatchDirectPush", "Send keyword matches directly to OBS")}</span>
              <small id="bible-keyword-match-direct-push-description">
                {t("bible.keywordMatchDirectPushDescription", "Skip the confirmation modal next time.")}
              </small>
            </span>
          </label>
        </div>
        {!browserQuickUpdateImmediately && (
          <button
            type="button"
            className="dock-bible-reader__font-size-save"
            onClick={onSave}
            disabled={!hasPendingBrowserQuickChanges}
          >
            {t("common.save", "Save")}
          </button>
        )}
      </div>
    </div>
  );
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

function sanitizeBibleReferenceFormat(value: unknown): BibleReferenceFormat {
  return value === "short" || value === "hidden" || value === "full"
    ? value
    : DEFAULT_BIBLE_REFERENCE_FORMAT;
}

function sanitizeReferenceVersionVisible(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

function abbreviateBibleBookCompact(book: string): string {
  const aliases = BOOK_ABBREVS[book]
    ?.map((alias) => alias.replace(/\s+/g, "").trim())
    .filter(Boolean);
  if (aliases?.length) {
    const preferred = aliases
      .map((alias, index) => ({ alias, index }))
      .sort((a, b) => a.alias.length - b.alias.length || b.index - a.index)[0]?.alias;
    if (preferred) return preferred.toUpperCase();
  }

  return book
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? part : part.slice(0, 3)))
    .join("")
    .toUpperCase();
}

function buildBibleReferenceBaseLabel(
  book: string,
  chapter: number,
  verseRange: string,
  format: BibleReferenceFormat,
): string {
  if (format === "hidden") return "";
  const bookLabel = format === "short" ? abbreviateBibleBookCompact(book) : book;
  return `${bookLabel} ${chapter}:${verseRange}`;
}

function appendBibleVersionToReference(reference: string, translation: string, showVersion: boolean): string {
  const ref = reference.trim();
  const version = showVersion ? translation.trim().toUpperCase() : "";
  if (ref && version) return `${ref} (${version})`;
  return ref || version;
}

function buildBibleReferenceDisplayLabel(
  book: string,
  chapter: number,
  verseRange: string,
  translation: string,
  format: BibleReferenceFormat,
  showVersion: boolean,
): string {
  return appendBibleVersionToReference(
    buildBibleReferenceBaseLabel(book, chapter, verseRange, format),
    translation,
    showVersion,
  );
}

function extractFullscreenQuickThemeSettings(
  settings: BibleThemeSettings,
  backgroundType?: DockFullscreenQuickThemeSettings["backgroundType"],
): DockFullscreenQuickThemeSettings {
  const compareSettings = normalizeCompareThemeSettings(settings as unknown as Record<string, unknown>);
  return {
    backgroundType: backgroundType ?? settings.backgroundType,
    fontSize: clampNumber(settings.fontSize, 28, 200),
    autoFontScale: true,
    fontFamily: withScriptureFontFallback(settings.fontFamily || DEFAULT_THEME_SETTINGS.fontFamily),
    refFontSize: clampNumber(settings.refFontSize, 10, 150),
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
    lowerThirdPosition: settings.lowerThirdPosition || DEFAULT_THEME_SETTINGS.lowerThirdPosition,
    lowerThirdSize: settings.lowerThirdSize || DEFAULT_THEME_SETTINGS.lowerThirdSize,
    lowerThirdWidthPreset: settings.lowerThirdWidthPreset || DEFAULT_THEME_SETTINGS.lowerThirdWidthPreset,
    lowerThirdOffsetX: clampNumber(settings.lowerThirdOffsetX ?? 0, -500, 500),
    backgroundPattern: settings.backgroundPattern ?? "",
    lowerThirdCaptionPosition: settings.lowerThirdCaptionPosition || "bottom",
    lowerThirdEdge: sanitizeLowerThirdEdge(settings.lowerThirdEdge),
    lowerThirdCardPadding: sanitizeCssPadding(settings.lowerThirdCardPadding),
    lowerThirdBarMaxHeight: clampNumber(Number(settings.lowerThirdBarMaxHeight ?? 600), 120, 900),
    lowerThirdPaddingLinked: sanitizeLowerThirdPaddingLinked(settings.lowerThirdPaddingLinked),
    lowerThirdCardRadius: sanitizeLowerThirdCardRadius(settings.lowerThirdCardRadius),
    lowerThirdTextDirection: sanitizeLowerThirdTextDirection(settings.lowerThirdTextDirection),
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

  return normalizeLowerThirdFitSettings({
    ...base,
    fontSize: sizePreset.fontSize,
    refFontSize: sizePreset.refFontSize,
    lineHeight: sizePreset.lineHeight,
    refSpacing: sizePreset.refSpacing,
    lowerThirdBarMaxHeight: sizePreset.maxHeight,
    referenceBackgroundEnabled: false,
    lowerThirdWidthPreset:
      base.lowerThirdWidthPreset === "full" ? "md" : base.lowerThirdWidthPreset,
  });
}

function extractLowerThirdQuickThemeSettings(
  settings: BibleThemeSettings,
  backgroundType?: DockFullscreenQuickThemeSettings["backgroundType"],
): DockFullscreenQuickThemeSettings {
  const sizePreset =
    LOWER_THIRD_SIZE_PRESETS[settings.lowerThirdSize || DEFAULT_THEME_SETTINGS.lowerThirdSize] ||
    LOWER_THIRD_SIZE_PRESETS.medium;
  return {
    ...extractFullscreenQuickThemeSettings(settings, backgroundType),
    fontSize: clampNumber(settings.fontSize, LOWER_THIRD_FIT_MIN_FONT_SIZE, LOWER_THIRD_FONT_SIZE_MAX),
    refFontSize: clampNumber(
      settings.refFontSize,
      LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE,
      LOWER_THIRD_REFERENCE_FONT_SIZE_MAX,
    ),
    lowerThirdBarMaxHeight: clampNumber(Number(settings.lowerThirdBarMaxHeight ?? sizePreset.maxHeight), 120, 900),
  };
}

function resolveThemeForOverlayMode(theme: BibleTheme, mode: OverlayMode): BibleTheme {
  const variant = mode === "lower-third"
    ? theme.variants?.lowerThird
    : theme.variants?.fullscreen;
  return variant
    ? { ...theme, settings: variant.settings, rawTemplate: variant.rawTemplate }
    : theme;
}

function extractThemeQuickSettingsForOverlayMode(
  theme: BibleTheme,
  mode: OverlayMode,
): DockFullscreenQuickThemeSettings {
  const baseTheme = resolveThemeForOverlayMode(theme, mode);
  const extracted = mode === "fullscreen"
    ? extractFullscreenQuickThemeSettings(baseTheme.settings, "theme")
    : extractLowerThirdQuickThemeSettings(baseTheme.settings, "theme");
  // Keep the selected theme's motion in the live dock payload. Missing motion
  // falls back to the shared fade default instead of silently disabling it.
  return extracted;
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
      lowerThirdBarMaxHeight: sizePreset.maxHeight,
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
  mode: OverlayMode = "fullscreen",
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
    // Keep newly added style fields intact across an app update. Known fields
    // below are still normalized and validated before they reach OBS.
    ...source,
    fontSize: clampNumber(
      Number(source.fontSize ?? DEFAULT_THEME_SETTINGS.fontSize),
      mode === "lower-third" ? LOWER_THIRD_FIT_MIN_FONT_SIZE : 28,
      mode === "lower-third" ? LOWER_THIRD_FONT_SIZE_MAX : 200,
    ),
    autoFontScale: true,
    fontFamily: withScriptureFontFallback(
      typeof source.fontFamily === "string" ? source.fontFamily : DEFAULT_THEME_SETTINGS.fontFamily,
    ),
    refFontSize: clampNumber(
      Number(source.refFontSize ?? DEFAULT_THEME_SETTINGS.refFontSize),
      mode === "lower-third" ? LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE : 14,
      mode === "lower-third" ? LOWER_THIRD_REFERENCE_FONT_SIZE_MAX : 150,
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
    lowerThirdEdge: sanitizeLowerThirdEdge(source.lowerThirdEdge),
    lowerThirdCardPadding: sanitizeCssPadding(source.lowerThirdCardPadding),
    lowerThirdBarMaxHeight: clampNumber(
      Number(source.lowerThirdBarMaxHeight ?? 600),
      120,
      900,
    ),
    lowerThirdPaddingLinked: sanitizeLowerThirdPaddingLinked(source.lowerThirdPaddingLinked),
    lowerThirdCardRadius: sanitizeLowerThirdCardRadius(source.lowerThirdCardRadius),
    lowerThirdTextDirection: sanitizeLowerThirdTextDirection(source.lowerThirdTextDirection),
    compareTranslationWidth: clampNumber(Number(source.compareTranslationWidth ?? DEFAULT_THEME_SETTINGS.compareTranslationWidth), 30, 50),
    backgroundType: source.backgroundType,
    ...compareSettings,
  };
}

function sanitizeSceneQuickThemeSettings(value: unknown): DockSceneQuickThemeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const profiles: DockSceneQuickThemeSettings = {};
  for (const [sceneName, rawProfile] of Object.entries(value)) {
    if (!sceneName.trim() || !rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) continue;
    const source = rawProfile as Record<string, unknown>;
    const fullscreen = sanitizeFullscreenQuickThemeSettings(source.fullscreen);
    const lowerThird = sanitizeFullscreenQuickThemeSettings(source.lowerThird, "lower-third");
    const profile: DockSceneQuickThemeProfile = {};
    if (fullscreen) profile.fullscreen = fullscreen;
    if (lowerThird) profile.lowerThird = lowerThird;
    if (typeof source.fullscreenThemeId === "string" && source.fullscreenThemeId.trim()) {
      profile.fullscreenThemeId = source.fullscreenThemeId.trim();
    }
    if (typeof source.lowerThirdThemeId === "string" && source.lowerThirdThemeId.trim()) {
      profile.lowerThirdThemeId = source.lowerThirdThemeId.trim();
    }
    if (source.fullscreenThemeSettings && typeof source.fullscreenThemeSettings === "object" && !Array.isArray(source.fullscreenThemeSettings)) {
      profile.fullscreenThemeSettings = { ...(source.fullscreenThemeSettings as Record<string, unknown>) };
    }
    if (source.lowerThirdThemeSettings && typeof source.lowerThirdThemeSettings === "object" && !Array.isArray(source.lowerThirdThemeSettings)) {
      profile.lowerThirdThemeSettings = { ...(source.lowerThirdThemeSettings as Record<string, unknown>) };
    }
    if (Object.keys(profile).length > 0) profiles[sceneName] = profile;
  }
  return profiles;
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
      // Keep the selected background mode in the live theme payload. The
      // overlay also receives the asset fields, but this explicit mode prevents
      // a stale theme/background fallback from winning on the next verse.
      backgroundType: bgType,
      fontSize: quickSettings.fontSize,
      autoFontScale: true,
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
      referenceBackgroundEnabled: quickSettings.referenceBackgroundEnabled,
      referenceBackgroundColor: quickSettings.referenceBackgroundColor,
      referenceBackgroundStyle: quickSettings.referenceBackgroundStyle,
      referenceBackgroundRadius: quickSettings.referenceBackgroundRadius,
      fontStyle: quickSettings.fontStyle,
      lowerThirdPosition: quickSettings.lowerThirdPosition,
      lowerThirdSize: quickSettings.lowerThirdSize,
      lowerThirdWidthPreset: quickSettings.lowerThirdWidthPreset,
      lowerThirdOffsetX: quickSettings.lowerThirdOffsetX,
      lowerThirdCaptionPosition: quickSettings.lowerThirdCaptionPosition,
      lowerThirdEdge: quickSettings.lowerThirdEdge,
      lowerThirdCardPadding: quickSettings.lowerThirdCardPadding,
      lowerThirdBarMaxHeight: quickSettings.lowerThirdBarMaxHeight,
      lowerThirdPaddingLinked: quickSettings.lowerThirdPaddingLinked,
      lowerThirdCardRadius: quickSettings.lowerThirdCardRadius,
      lowerThirdTextDirection: quickSettings.lowerThirdTextDirection,
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
  return readDockPreference<DockBiblePreferences>(DOCK_BIBLE_PREFS_KEY) ?? {};
}

function readDockBibleOverlayMode(): OverlayMode | null {
  const mode = loadDockBiblePreferences().overlayMode;
  return mode === "fullscreen" || mode === "lower-third" ? mode : null;
}

function saveDockBiblePreferences(next: DockBiblePreferences): void {
  void saveDockPreference(DOCK_BIBLE_PREFS_KEY, next);
}

function saveDockBibleOverlayMode(mode: OverlayMode): void {
  saveDockBiblePreferences({
    ...loadDockBiblePreferences(),
    overlayMode: mode,
  });
}

function loadDockBibleUiPreferences(): DockBibleUiPreferences {
  return readDockPreference<DockBibleUiPreferences>(DOCK_BIBLE_UI_PREFS_KEY) ?? {};
}

function saveDockBibleUiPreferences(next: DockBibleUiPreferences): void {
  void saveDockPreference(DOCK_BIBLE_UI_PREFS_KEY, next);
}

function saveDockBibleUiPreferencePatch(patch: DockBibleUiPreferences): void {
  saveDockBibleUiPreferences({
    ...loadDockBibleUiPreferences(),
    ...patch,
  });
}

function clampQuickActionsTop(value: unknown, containerHeight?: number): number {
  const numeric = Number(value);
  const raw = Number.isFinite(numeric) ? numeric : DEFAULT_QUICK_ACTIONS_TOP;
  if (!containerHeight || !Number.isFinite(containerHeight)) {
    return Math.max(QUICK_ACTIONS_MIN_TOP, raw);
  }
  const maxTop = Math.max(
    QUICK_ACTIONS_MIN_TOP,
    containerHeight - QUICK_ACTIONS_HANDLE_HEIGHT - QUICK_ACTIONS_BOTTOM_GAP,
  );
  return Math.min(Math.max(QUICK_ACTIONS_MIN_TOP, raw), maxTop);
}

function getDefaultQuickActionsTop(containerHeight?: number): number {
  if (!containerHeight || !Number.isFinite(containerHeight)) {
    return DEFAULT_QUICK_ACTIONS_TOP;
  }
  return clampQuickActionsTop(
    Math.round((containerHeight - QUICK_ACTIONS_HANDLE_HEIGHT) / 2),
    containerHeight,
  );
}

function clampQuickActionsLeft(value: unknown, containerWidth?: number): number {
  const numeric = Number(value);
  const raw = Number.isFinite(numeric) ? numeric : 0;
  if (!containerWidth || !Number.isFinite(containerWidth)) {
    return Math.max(0, raw);
  }
  const maxLeft = Math.max(0, containerWidth - QUICK_ACTIONS_HANDLE_WIDTH);
  return Math.min(Math.max(0, raw), maxLeft);
}

function getMeasuredQuickActionsLeft(
  handleElement: HTMLElement | null,
  positioningContainer: HTMLElement | null,
  fallback: number,
): number {
  const containerRect = positioningContainer?.getBoundingClientRect();
  const handleRect = handleElement?.getBoundingClientRect();
  if (!containerRect || !handleRect) return fallback;
  return handleRect.left - containerRect.left;
}

/** Quick actions may move vertically, but they always snap to the left or right edge. */
function snapQuickActionsLeft(value: unknown, containerWidth?: number): number | null {
  const maxLeft = Math.max(0, (containerWidth ?? QUICK_ACTIONS_HANDLE_WIDTH) - QUICK_ACTIONS_HANDLE_WIDTH);
  if (maxLeft === 0) return 0;
  const clamped = clampQuickActionsLeft(value, containerWidth);
  return clamped <= maxLeft / 2 ? 0 : null;
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
    endVerse?: number;
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
    endVerse?: number;
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
    const raw = readNativeDockSetting<unknown>(BIBLE_RECENT_SEARCHES_KEY);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw ?? []);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeRecentBibleSearches(items: string[]): void {
  writeNativeDockSetting(BIBLE_RECENT_SEARCHES_KEY, items.slice(0, BIBLE_RECENT_SEARCH_LIMIT));
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

function DockBibleTab({
  staged,
  onStage,
  productionDefaults,
  initialVoiceBible,
  appConnected,
  presentationOutputTarget = "obs",
    searchPlacement = "top",
  fullscreenOnly = false,
  showHistory,
  onHistoryClose,
  onSaveFeedback,
}: Props) {
  const { t } = useTranslation();
  const presentationLinkMode = isPresentationLinkTarget(presentationOutputTarget);
  const fullscreenOnlyMode = presentationLinkMode || fullscreenOnly;
  const [sceneRoute, updateSceneRoute] = useDockSceneRoute("bible");
  const hasSceneRoute = sceneRoute.enabled && sceneRoute.targets.length > 0;

  const pushBibleToConfiguredOutput = useCallback(async (
    data: DockBiblePushData,
    options?: DockOverlayFitOptions,
  ) => {
    if (!hasSceneRoute) {
      return dockObsClient.pushBible(data, options);
    }
    await dockObsClient.pushBibleToScenes(sceneRoute.targets.map((target) => {
      const outputMode = target.mode === "inherit"
        ? (data.overlayMode === "lower-third" ? "lower-third" : "fullscreen")
        : target.mode;
      const isFullscreen = outputMode === "fullscreen";
      const profile = sceneQuickThemeSettingsRef.current[target.sceneName];
      const profileSettings = isFullscreen
        ? profile?.fullscreenThemeSettings
        : profile?.lowerThirdThemeSettings;
      const targetThemeSettings = profileSettings
        ?? (isFullscreen
          ? (liveFullscreenThemeSettingsRef.current ?? data.bibleThemeSettings)
          : (liveLowerThirdThemeSettingsRef.current ?? data.bibleThemeSettings));
      const targetThemeId = isFullscreen
        ? (profile?.fullscreenThemeId ?? selectedBibleThemeRef.current.id)
        : (profile?.lowerThirdThemeId ?? selectedLowerThirdThemeRef.current.id);
      return {
        data: {
          ...data,
          ...(target.mode === "inherit" ? {} : { overlayMode: target.mode }),
          theme: targetThemeId,
          bibleThemeSettings: targetThemeSettings as Record<string, unknown> | null | undefined,
          liveOverrides: profileSettings ? null : (isFullscreen ? fullscreenLiveOverridesRef.current : null),
        },
        sceneName: target.sceneName,
      };
    }));
    if (sceneRoute.syncPresentation) return dockObsClient.pushBible(data, options);
    return null;
  }, [hasSceneRoute, sceneRoute.targets, sceneRoute.syncPresentation]);

  const clearBibleFromConfiguredOutput = useCallback(async () => {
    if (!hasSceneRoute) {
      await dockObsClient.clearBible();
      return;
    }
    await Promise.all(sceneRoute.targets.map((target) => (
      dockObsClient.clearSceneRouteSource("bible", target.sceneName)
    )));
    if (sceneRoute.syncPresentation) await dockObsClient.clearBible();
  }, [hasSceneRoute, sceneRoute.targets, sceneRoute.syncPresentation]);
  const initialPrefsRef = useRef<DockBiblePreferences | null>(null);
  if (initialPrefsRef.current === null) {
    initialPrefsRef.current = loadDockBiblePreferences();
  }
  const initialUiPrefsRef = useRef<DockBibleUiPreferences | null>(null);
  if (initialUiPrefsRef.current === null) {
    initialUiPrefsRef.current = loadDockBibleUiPreferences();
  }
  const initialPrefs = initialPrefsRef.current;
  const initialUiPrefs = initialUiPrefsRef.current;
  const initialBook =
    initialPrefs.selectedBook && BOOK_CHAPTERS[initialPrefs.selectedBook]
      ? initialPrefs.selectedBook
      : (OT_BOOKS[0] ?? null);
  const maxInitialChapter = initialBook ? (BOOK_CHAPTERS[initialBook] ?? 1) : 1;
  const initialChapter = initialBook
    ? Math.min(Math.max(initialPrefs.selectedChapter ?? 1, 1), maxInitialChapter)
    : null;
  const initialCompareEnabled = resolveInitialDockBibleCompareEnabled(initialPrefs);
  const initialCompareMode: CompareMode = initialPrefs.compareMode === "passages" ? "passages" : "translations";
  const initialFullscreenQuickThemeSettings = sanitizeFullscreenQuickThemeSettings(
    initialPrefs.fullscreenQuickThemeSettings,
  );
  const initialRawLowerThirdQuickThemeSettings = sanitizeFullscreenQuickThemeSettings(
    initialPrefs.lowerThirdQuickThemeSettings,
    "lower-third",
  );
  const initialLowerThirdQuickThemeSettings =
    areQuickThemeSettingsEquivalent(initialFullscreenQuickThemeSettings, initialRawLowerThirdQuickThemeSettings)
      ? null
      : initialRawLowerThirdQuickThemeSettings;
  const initialSceneQuickThemeSettings = sanitizeSceneQuickThemeSettings(
    initialPrefs.sceneQuickThemeSettings,
  );

  const [selectedBook, setSelectedBook] = useState<string | null>(initialBook);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(initialChapter);
  const selectedChapterRef = useRef<number | null>(initialChapter);
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [columnTranslations, setColumnTranslations] = useState<ColumnTranslations>(() =>
    normalizeColumnTranslations(
      initialPrefs.translations ?? (initialPrefs.translation ? [initialPrefs.translation] : undefined),
    ),
  );
  const [verseLineCount, setVerseLineCount] = useState(() => clampVerseLineCount(initialPrefs.verseLineCount));
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, DOCK_SEARCH_DEBOUNCE_MS);
  const [selectedBibleTheme, setSelectedBibleTheme] = useState<BibleTheme>(
    productionDefaults.fullscreenTheme ?? BUILTIN_THEMES[0],
  );
  const [selectedLowerThirdTheme, setSelectedLowerThirdTheme] = useState<BibleTheme>(
    productionDefaults.lowerThirdTheme ?? BUILTIN_THEMES[0],
  );
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(
    () => {
      const stored = initialPrefs.overlayMode;
      return stored === "fullscreen" || stored === "lower-third" ? stored : productionDefaults.defaultMode;
    },
  );
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialCompareEnabled ? "compare" : "single");
  const [compareEnabled, setCompareEnabled] = useState(initialCompareEnabled);
  const [compareMode, setCompareMode] = useState<CompareMode>(initialCompareMode);
  const [compareLayout, setCompareLayout] = useState<CompareLayout>(initialPrefs.compareLayout ?? "line-by-line");
  const [referenceFormat, setReferenceFormat] = useState<BibleReferenceFormat>(
    () => sanitizeBibleReferenceFormat(initialPrefs.referenceFormat),
  );
  const [referenceVersionVisible, setReferenceVersionVisible] = useState(
    () => sanitizeReferenceVersionVisible(initialPrefs.referenceVersionVisible),
  );
  const [translationA, setTranslationA] = useState(initialPrefs.translationA ?? "KJV");
  const [translationB, setTranslationB] = useState(initialPrefs.translationB ?? "NIV");
  const [comparePassageDrafts, setComparePassageDrafts] = useState<ComparePassageDraft[]>(() =>
    normalizeComparePassageDrafts(initialPrefs.comparePassages, initialPrefs.translationA ?? "KJV", initialPrefs.translationB ?? "NIV"),
  );
  const [comparePassageNavigation, setComparePassageNavigation] = useState<ComparePassageNavigation>(
    initialPrefs.comparePassageNavigation === "independent" ? "independent" : "linked",
  );
  const [activeComparePassageIndex, setActiveComparePassageIndex] = useState(0);
  // Start with the bundled translation only. Saved comparison preferences are
  // not evidence that a translation is still installed.
  const [availableTranslations, setAvailableTranslations] = useState<BibleTranslationOption[]>([
    DEFAULT_INSTALLED_TRANSLATION_OPTION,
  ]);
  const [translationsLoaded, setTranslationsLoaded] = useState(false);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [keywordActionResult, setKeywordActionResult] = useState<Extract<DockBibleSearchOption, { kind: "keyword" | "concept" }> | null>(null);
  const [keywordMatchPushDirectlyToObs, setKeywordMatchPushDirectlyToObs] = useState(
    () => initialPrefs.keywordMatchPushDirectlyToObs === true,
  );
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentBibleSearches());
  const [activeIdx, setActiveIdx] = useState(-1);
  const [keywordResults, setKeywordResults] = useState<BibleKeywordResult[]>([]);
  const [keywordResultsQuery, setKeywordResultsQuery] = useState("");
  const [isKeywordSearching, setIsKeywordSearching] = useState(false);
  const [, setVerseText] = useState<string | null>(null);
  const [verseCount, setVerseCount] = useState(30);
  const [voiceBible, setVoiceBible] = useState<VoiceBibleSnapshot>(
    () => initialVoiceBible ?? emptyVoiceBibleSnapshot(),
  );
  const [, setLiveTranscriptWords] = useState<LiveTranscriptWordChip[]>([]);
  const [modeMorphing] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [backgroundPreset, setBackgroundPreset] = useState<DockBackgroundPreset>(
    initialPrefs.backgroundPreset ?? "theme",
  );
  const [savedFullscreenQuickThemeSettings, setSavedFullscreenQuickThemeSettings] =
    useState<DockFullscreenQuickThemeSettings | null>(initialFullscreenQuickThemeSettings);
  const [fullscreenQuickThemeSettings, setFullscreenQuickThemeSettings] =
    useState<DockFullscreenQuickThemeSettings | null>(initialFullscreenQuickThemeSettings);
  const [savedLowerThirdQuickThemeSettings, setSavedLowerThirdQuickThemeSettings] =
    useState<DockFullscreenQuickThemeSettings | null>(initialLowerThirdQuickThemeSettings);
  const [lowerThirdQuickThemeSettings, setLowerThirdQuickThemeSettings] =
    useState<DockFullscreenQuickThemeSettings | null>(initialLowerThirdQuickThemeSettings);
  const [lowerThirdQuickThemeSettingsLinkedToFullscreen, setLowerThirdQuickThemeSettingsLinkedToFullscreen] =
    useState(false);
  const [sceneQuickThemeSettings, setSceneQuickThemeSettings] =
    useState<DockSceneQuickThemeSettings>(initialSceneQuickThemeSettings);
  const [chapterPassages, setChapterPassages] = useState<Array<BiblePassage | null>>(() => createEmptyPassages());
  const [comparePassages, setComparePassages] = useState<{ translationA: BiblePassage | null; translationB: BiblePassage | null }>(() => ({
    translationA: null,
    translationB: null,
  }));
  const [compareChapterLoading, setCompareChapterLoading] = useState(false);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterErrors, setChapterErrors] = useState<string[]>(() => createEmptyErrors());
  const [compareChapterErrors, setCompareChapterErrors] = useState<[string, string]>(["", ""]);
  const [comparePassagePreviews, setComparePassagePreviews] = useState<ComparePassagePreview[]>([]);
  const [highlightVerse, setHighlightVerse] = useState<number | null>(null);
  const [favoriteRefs, setFavoriteRefs] = useState<Set<string>>(new Set());
  const [favoritePassages, setFavoritePassages] = useState<BiblePassage[]>([]);
  const [favoriteHistorySearches, setFavoriteHistorySearches] = useState<BibleHistoryItem[]>(
    () => getFavoriteBibleHistoryItems(),
  );
  const favoriteSearches = useMemo(
    () => mergeFavoriteBibleSearches(favoritePassages, favoriteHistorySearches),
    [favoriteHistorySearches, favoritePassages],
  );
  const hasSavedSearches = recentSearches.length > 0 || favoriteSearches.length > 0;
  const refreshFavoriteHistorySearches = useCallback(() => {
    setFavoriteHistorySearches(getFavoriteBibleHistoryItems());
  }, []);
  const [isUtilityCollapsed, _setIsUtilityCollapsed] = useState(
    () => initialUiPrefs.controlsCollapsed ?? false,
  );
  const [bibleOverlayVisible, setBibleOverlayVisible] = useState(true);
  const [modeRefreshNonce, setModeRefreshNonce] = useState(0);
  const lastModeRefreshNonceRef = useRef(0);
  const liveVerseRequestIdRef = useRef(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const verseGridRef = useRef<HTMLDivElement>(null);
  const comparePopoverRef = useRef<HTMLDivElement>(null);
  const referencePopoverRef = useRef<HTMLDivElement>(null);
  const browserFontSizePopoverRef = useRef<HTMLDivElement>(null);
  const [showComparePopover, setShowComparePopover] = useState(false);
  const [showReferencePopover, setShowReferencePopover] = useState(false);
  const [showBrowserFontSizePopover, setShowBrowserFontSizePopover] = useState(false);
  const [quickActionsTop, setQuickActionsTop] = useState(() =>
    clampQuickActionsTop(initialUiPrefs.quickActionsTop),
  );
  const [quickActionsLeft, setQuickActionsLeft] = useState<number | null>(() =>
    typeof initialUiPrefs.quickActionsLeft === "number"
      ? clampQuickActionsLeft(initialUiPrefs.quickActionsLeft)
      : null,
  );
  const [isQuickActionsDragging, setIsQuickActionsDragging] = useState(false);
  const [browserQuickUpdateImmediately, setBrowserQuickUpdateImmediately] = useState(
    () => initialUiPrefs.browserQuickUpdateImmediately !== false,
  );
  const [draftBrowserQuickThemeSettings, setDraftBrowserQuickThemeSettings] =
    useState<DockFullscreenQuickThemeSettings | null>(null);
  const [draftBrowserVerseLineCount, setDraftBrowserVerseLineCount] = useState<number | null>(null);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [historyItems, setHistoryItems] = useState<BibleHistoryItem[]>([]);
  const historyPopoverRef = useRef<HTMLDivElement>(null);
  const recordBibleHistory = useCallback((
    book: string,
    chapter: number,
    verse: number,
    verseText: string,
  ) => {
    const updated = addToBibleHistory(book, chapter, verse, verseText);
    setHistoryItems(getRecentBibleHistoryItems(updated));
  }, []);
  const voiceHeldRef = useRef(false);
  const voiceBridgeTimeoutRef = useRef<number | null>(null);
  const voiceFallbackReadyRef = useRef(false);
  const lastVoiceResultKeyRef = useRef(getVoiceBibleResultKey(initialVoiceBible?.lastResult));
  const lastVoiceEventTimestampRef = useRef(0);
  const pendingScrollVerseRef = useRef<number | null>(null);
  const prefsReadyRef = useRef(false);
  const previousStagedRef = useRef(staged);
  const latestStagedRef = useRef(staged);
  const manualReferenceSelectionRef = useRef(false);
  const overlayModeRef = useRef(overlayMode);
  const selectedBibleThemeRef = useRef(selectedBibleTheme);
  const selectedLowerThirdThemeRef = useRef(selectedLowerThirdTheme);
  const backgroundPresetRef = useRef(backgroundPreset);
  const liveFullscreenThemeSettingsRef = useRef<BibleThemeSettings | null>(null);
  const liveLowerThirdThemeSettingsRef = useRef<BibleThemeSettings | null>(null);
  const fullscreenLiveOverridesRef = useRef<Record<string, unknown> | null>(null);
  const sceneQuickThemeSettingsRef = useRef<DockSceneQuickThemeSettings>(initialSceneQuickThemeSettings);
  const manualThemeSettingsSelectionRef = useRef(false);
  const prefsSaveDebounceRef = useRef<number | null>(null);
  const liveTranscriptWordCounterRef = useRef(0);
  const lastTranscriptWordsRef = useRef<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const quickActionsContainerRef = useRef<HTMLElement>(null);
  const quickActionsTopRef = useRef(quickActionsTop);
  const quickActionsLeftRef = useRef<number | null>(quickActionsLeft);
  const quickActionsDragRef = useRef<QuickActionsDragState | null>(null);
  const quickActionsSuppressClickRef = useRef(false);
  const quickActionsLastSavedPositionRef = useRef("");
  const quickActionsNeedsInitialCenterRef = useRef(
    typeof initialUiPrefs.quickActionsTop !== "number" || !Number.isFinite(initialUiPrefs.quickActionsTop),
  );
  const [isBookDropdownOpen, setIsBookDropdownOpen] = useState(false);
  const [isChapterDropdownOpen, setIsChapterDropdownOpen] = useState(false);
  const [isVerseDropdownOpen, setIsVerseDropdownOpen] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [themeSettingsInitialTab, setThemeSettingsInitialTab] = useState<ThemeSettingsTab>("text");
  const [activeSceneProfileId, setActiveSceneProfileId] = useState(GENERAL_SCENE_PROFILE_ID);
  const [showBibleHistory, setShowBibleHistory] = useState(false);
  const [showBibleActionsMenu, setShowBibleActionsMenu] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"success" | "error" | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);

  // ── Height-responsive compact mode ──
  const [isShortHeight, setIsShortHeight] = useState(() => {
    const el = containerRef.current;
    return el ? el.clientHeight <= 520 : false;
  });
  const [isNarrowWidth, setIsNarrowWidth] = useState(false);

  const _fsThemeDepId = productionDefaults.fullscreenTheme?.id;
  const _ltThemeDepId = productionDefaults.lowerThirdTheme?.id;

  useEffect(() => {
    quickActionsTopRef.current = quickActionsTop;
  }, [quickActionsTop]);

  useEffect(() => {
    quickActionsLeftRef.current = quickActionsLeft;
  }, [quickActionsLeft]);

  useEffect(() => {
    const element = containerRef.current;
    const quickActionsContainer = quickActionsContainerRef.current;
    if (!element || !quickActionsContainer) return;

    const syncLayout = (target: Element, height: number, width: number) => {
      if (target === element) {
        setIsShortHeight(height <= 520);
        setIsNarrowWidth(width <= 300);
        return;
      }

      if (quickActionsDragRef.current) return;

      if (quickActionsNeedsInitialCenterRef.current && height > QUICK_ACTIONS_HANDLE_HEIGHT) {
        const centeredTop = getDefaultQuickActionsTop(height);
        quickActionsNeedsInitialCenterRef.current = false;
        quickActionsTopRef.current = centeredTop;
        setQuickActionsTop(centeredTop);
      } else {
        setQuickActionsTop((current) => clampQuickActionsTop(current, height));
      }
      setQuickActionsLeft((current) => current === null ? null : snapQuickActionsLeft(current, width));
    };

    syncLayout(element, element.clientHeight, element.clientWidth);
    syncLayout(quickActionsContainer, quickActionsContainer.clientHeight, quickActionsContainer.clientWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        syncLayout(entry.target, entry.contentRect.height, entry.contentRect.width);
      }
    });

    observer.observe(element);
    observer.observe(quickActionsContainer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isNarrowWidth) {
      setShowBibleActionsMenu(false);
    }
  }, [isNarrowWidth]);

  useEffect(() => () => {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
  }, []);

  // Signal compact mode to parent shell via body class
  useEffect(() => {
    document.body.classList.toggle("dock-bible-compact", isShortHeight);
    return () => document.body.classList.remove("dock-bible-compact");
  }, [isShortHeight]);

  // Sync external showHistory prop with local state
  useEffect(() => {
    if (showHistory !== undefined) setShowBibleHistory(showHistory);
  }, [showHistory]);

  // Keep overlayModeRef in sync for callbacks that must not depend on overlayMode
  useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  const [showSearchBar, _setShowSearchBar] = useState(true);
  const [isTopbarExpanded, setIsTopbarExpanded] = useState(false);
  const activeColumnIndex = Math.min(Math.max(selectedColumn, 0), QUICK_SELECT_VERSION_COUNT - 1);
  const activeTranslation = columnTranslations[activeColumnIndex] ?? columnTranslations[0];
  const activeBibleSearchTranslation = compareEnabled && compareMode === "passages"
    ? (comparePassageDrafts[activeComparePassageIndex]?.translation ?? activeTranslation)
    : activeTranslation;
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
      if (comparePopoverRef.current && !comparePopoverRef.current.contains(event.target as Node)) {
        setShowComparePopover(false);
        setShowBibleActionsMenu(false);
      }
      if (referencePopoverRef.current && !referencePopoverRef.current.contains(event.target as Node)) {
        setShowReferencePopover(false);
      }
      if (browserFontSizePopoverRef.current && !browserFontSizePopoverRef.current.contains(event.target as Node)) {
        setShowBrowserFontSizePopover(false);
      }
      if (historyPopoverRef.current && !historyPopoverRef.current.contains(event.target as Node)) {
        setShowHistoryDropdown(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

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

    const timer = window.setTimeout(() => {
      void getFavorites()
        .then((favorites) => {
          if (cancelled) return;
          setFavoriteRefs(new Set(favorites.map((passage) => passage.reference)));
          setFavoritePassages(favorites);
          setFavoriteHistorySearches(getFavoriteBibleHistoryItems());
        })
        .catch(() => {
          if (!cancelled) {
            setFavoriteRefs(new Set());
            setFavoritePassages([]);
            setFavoriteHistorySearches(getFavoriteBibleHistoryItems());
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    prefsReadyRef.current = false;
    setPreferencesHydrated(false);
    let cancelled = false;
    const hydratePreferences = async () => {
      // Read IndexedDB before marking the component ready. This prevents the
      // first render's production defaults from being written over a saved
      // style while the durable store is still opening.
      const prefs = (await loadDockPreference<DockBiblePreferences>(DOCK_BIBLE_PREFS_KEY).catch(() => null))
        ?? loadDockBiblePreferences();
      if (cancelled) return;

      const initialBook =
        prefs.selectedBook && BOOK_CHAPTERS[prefs.selectedBook]
          ? prefs.selectedBook
          : (OT_BOOKS[0] ?? null);
      const maxInitialChapter = initialBook ? (BOOK_CHAPTERS[initialBook] ?? 1) : 1;
      const initialChapter = Math.min(
        Math.max(prefs.selectedChapter ?? 1, 1),
        maxInitialChapter,
      );
      const preserveManualThemeSelection = manualThemeSettingsSelectionRef.current;
      if (!preserveManualThemeSelection) {
        setSelectedBibleTheme(productionDefaults.fullscreenTheme ?? BUILTIN_THEMES[0]);
        setSelectedLowerThirdTheme(productionDefaults.lowerThirdTheme ?? BUILTIN_THEMES[0]);
      }
      setOverlayMode(prefs.overlayMode ?? productionDefaults.defaultMode);
      const restoredCompareEnabled = resolveInitialDockBibleCompareEnabled(prefs);
      setCompareEnabled(restoredCompareEnabled);
      setDisplayMode(restoredCompareEnabled ? "compare" : "single");
      setCompareMode(prefs.compareMode === "passages" ? "passages" : "translations");
      setCompareLayout(prefs.compareLayout ?? "line-by-line");
      setReferenceFormat(sanitizeBibleReferenceFormat(prefs.referenceFormat));
      setReferenceVersionVisible(sanitizeReferenceVersionVisible(prefs.referenceVersionVisible));
      setKeywordMatchPushDirectlyToObs(prefs.keywordMatchPushDirectlyToObs === true);
      setTranslationA(prefs.translationA ?? "KJV");
      setTranslationB(prefs.translationB ?? "NIV");
      setComparePassageDrafts(
        normalizeComparePassageDrafts(prefs.comparePassages, prefs.translationA ?? "KJV", prefs.translationB ?? "NIV"),
      );
      setComparePassageNavigation(prefs.comparePassageNavigation === "independent" ? "independent" : "linked");
      setActiveComparePassageIndex(0);
      setComparePassagePreviews([]);
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
        "lower-third",
      );
      const storedLowerThirdQuickSettings =
        areQuickThemeSettingsEquivalent(storedQuickSettings, rawStoredLowerThirdQuickSettings)
          ? null
          : rawStoredLowerThirdQuickSettings;
      const storedLowerThirdLinked = typeof prefs.lowerThirdQuickThemeSettingsLinkedToFullscreen === "boolean"
        ? prefs.lowerThirdQuickThemeSettingsLinkedToFullscreen
        : storedLowerThirdQuickSettings == null;
      const storedSceneQuickThemeSettings = sanitizeSceneQuickThemeSettings(
        prefs.sceneQuickThemeSettings,
      );
      sceneQuickThemeSettingsRef.current = storedSceneQuickThemeSettings;
      setSceneQuickThemeSettings(storedSceneQuickThemeSettings);
      if (!preserveManualThemeSelection) {
        setSavedFullscreenQuickThemeSettings(storedQuickSettings);
        setFullscreenQuickThemeSettings(storedQuickSettings);
        setSavedLowerThirdQuickThemeSettings(storedLowerThirdLinked ? null : storedLowerThirdQuickSettings);
        setLowerThirdQuickThemeSettings(
          storedLowerThirdLinked ? (storedQuickSettings ?? storedLowerThirdQuickSettings) : storedLowerThirdQuickSettings,
        );
        setLowerThirdQuickThemeSettingsLinkedToFullscreen(storedLowerThirdLinked);
      }
      // Preserve a reference selected while IndexedDB preferences are
      // hydrating; otherwise the chapter arrows can snap back to the old
      // saved chapter immediately after the operator clicks them.
      if (!manualReferenceSelectionRef.current) {
        setSelectedBook(initialBook);
        selectedChapterRef.current = initialBook ? initialChapter : null;
        setSelectedChapter(initialBook ? initialChapter : null);
        setSelectedVerse(null);
        setSelectedColumn(0);
      }

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

      if (storedFullscreen && !preserveManualThemeSelection) {
        setSelectedBibleTheme(storedFullscreen);
      }

      if (storedLowerThird && !preserveManualThemeSelection) {
        setSelectedLowerThirdTheme(storedLowerThird);
      }

      prefsReadyRef.current = true;
      setPreferencesHydrated(true);
    };

    const timer = window.setTimeout(() => {
      void hydratePreferences().catch(() => {
        if (!cancelled) prefsReadyRef.current = true;
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    productionDefaults.defaultMode,
    _fsThemeDepId,
    _ltThemeDepId,
  ]);

  useEffect(() => () => {
    if (prefsSaveDebounceRef.current !== null) {
      window.clearTimeout(prefsSaveDebounceRef.current);
    }
  }, []);

  useEffect(() => {
    if (!prefsReadyRef.current || !translationsLoaded) return;
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
        compareMode,
        compareLayout,
        comparePassages: comparePassageDrafts.map(({ reference, translation }) => ({ reference, translation })),
        comparePassageNavigation,
        referenceFormat,
        referenceVersionVisible,
        keywordMatchPushDirectlyToObs,
        verseLineCount,
        fullscreenThemeId: selectedBibleTheme.id,
        lowerThirdThemeId: selectedLowerThirdTheme.id,
        backgroundPreset,
        fullscreenQuickThemeSettings: savedFullscreenQuickThemeSettings,
        lowerThirdQuickThemeSettings: savedLowerThirdQuickThemeSettings,
        lowerThirdQuickThemeSettingsLinkedToFullscreen,
        sceneQuickThemeSettings,
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
    compareMode,
    compareLayout,
    comparePassageDrafts,
    comparePassageNavigation,
    keywordMatchPushDirectlyToObs,
    referenceFormat,
    referenceVersionVisible,
    savedLowerThirdQuickThemeSettings,
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
    sceneQuickThemeSettings,
    columnTranslations,
    overlayMode,
    savedFullscreenQuickThemeSettings,
    verseLineCount,
    selectedBibleTheme.id,
    selectedBook,
    selectedChapter,
    selectedLowerThirdTheme.id,
    translationsLoaded,
  ]);

  useEffect(() => {
    saveDockBibleUiPreferencePatch({
      controlsCollapsed: isUtilityCollapsed,
    });
  }, [isUtilityCollapsed]);

  const loadTranslations = useCallback(async () => {
    const loadLocalTranslations = async (): Promise<boolean> => {
      try {
        const { getInstalledTranslations } = await import("../../bible/bibleDb");
        const installed = await getInstalledTranslations();
        if (installed.length === 0) return false;
        setAvailableTranslations(buildInstalledTranslationOptions(installed));
        return true;
      } catch {
        return false;
      }
    };

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      if (await loadLocalTranslations()) return;
    }

    // The installed translation database is authoritative on the localhost
    // Dock too. The published manifest is only a fallback for a browser that
    // has no local translation database yet; using it first can restore an
    // old/default version during startup.
    if (await loadLocalTranslations()) return;

    try {
      // The local overlay server exposes this user-specific manifest after the
      // main app syncs installed translations to the Dock. Do not let a cached
      // manifest reintroduce a version the user has already removed.
      const remote = await fetch(`/uploads/dock-bible-translations.json?cacheBust=${Date.now()}`, {
        cache: "no-store",
      });
      if (remote.ok) {
        const payload = await remote.json() as Array<{ abbr?: string; name?: string; language?: string }>;
        if (Array.isArray(payload)) {
          setAvailableTranslations(buildInstalledTranslationOptions(payload));
          return;
        }
      }
    } catch {
      // Fall through to local IndexedDB fallback.
    }

    if (!(await loadLocalTranslations())) {
      setAvailableTranslations([DEFAULT_INSTALLED_TRANSLATION_OPTION]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTranslationsLoaded(false);
    const timer = window.setTimeout(() => {
      void loadTranslations()
        .catch(() => {
          if (!cancelled) {
            setAvailableTranslations([DEFAULT_INSTALLED_TRANSLATION_OPTION]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setTranslationsLoaded(true);
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadTranslations]);

  useEffect(() => {
    if (!translationsLoaded) return;

    const firstTranslation = resolveInstalledTranslation(undefined, availableTranslations);
    const nextTranslationA = resolveInstalledTranslation(translationA, availableTranslations);
    const alternateTranslation = availableTranslations.find(
      (entry) => entry.value.toUpperCase() !== nextTranslationA,
    )?.value ?? nextTranslationA;
    const nextTranslationB = resolveInstalledTranslation(
      translationB,
      availableTranslations,
      alternateTranslation,
    );

    setTranslationA((current) => current.toUpperCase() === nextTranslationA ? current : nextTranslationA);
    setTranslationB((current) => current.toUpperCase() === nextTranslationB ? current : nextTranslationB);

    setColumnTranslations((current) => {
      const next = current.map((value) =>
        resolveInstalledTranslation(value, availableTranslations, firstTranslation),
      );
      return current.every((value, index) => value === next[index]) ? current : next;
    });

    setComparePassageDrafts((current) => {
      let changed = false;
      const next = current.map((draft, index) => {
        const fallback = index === 0 ? nextTranslationA : nextTranslationB;
        const translation = resolveInstalledTranslation(draft.translation, availableTranslations, fallback);
        if (translation === draft.translation) return draft;
        changed = true;
        return { ...draft, translation };
      });
      return changed ? next : current;
    });
  }, [availableTranslations, comparePassageDrafts, columnTranslations, translationA, translationB, translationsLoaded]);

  // Resolve the base theme for each mode from the unified theme's variants
  const baseFullscreenTheme = useMemo(() => {
    return resolveThemeForOverlayMode(selectedBibleTheme, "fullscreen");
  }, [selectedBibleTheme]);

  const baseLowerThirdTheme = useMemo(() => {
    return resolveThemeForOverlayMode(selectedLowerThirdTheme, "lower-third");
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
    () => {
      const extracted = extractFullscreenQuickThemeSettings(effectiveSelectedBibleTheme.settings, fullscreenQuickThemeSettings?.backgroundType ?? "theme");
      return extracted;
    },
    [effectiveSelectedBibleTheme.settings, fullscreenQuickThemeSettings],
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

    return normalizeLowerThirdFitSettings(
      lowerThirdQuickThemeSettings ?? defaultLowerThirdQuickThemeSettings,
    );
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

  const quickEditOverlayMode: OverlayMode = fullscreenOnlyMode || overlayMode === "fullscreen"
    ? "fullscreen"
    : "lower-third";
  const sceneProfileOptions = useMemo<DockThemeSceneProfile[] | undefined>(() => {
    if (!hasSceneRoute) return undefined;
    return [
      ...sceneRoute.targets.map((target) => ({ id: target.sceneName, label: target.sceneName })),
      { id: GENERAL_SCENE_PROFILE_ID, label: "General" },
    ];
  }, [hasSceneRoute, sceneRoute.targets]);
  const availableSceneProfileIds = useMemo(
    () => new Set((sceneProfileOptions ?? []).map((profile) => profile.id)),
    [sceneProfileOptions],
  );

  useEffect(() => {
    if (activeSceneProfileId !== GENERAL_SCENE_PROFILE_ID && !availableSceneProfileIds.has(activeSceneProfileId)) {
      setActiveSceneProfileId(GENERAL_SCENE_PROFILE_ID);
    }
  }, [activeSceneProfileId, availableSceneProfileIds]);

  const isSceneProfileActive = activeSceneProfileId !== GENERAL_SCENE_PROFILE_ID
    && availableSceneProfileIds.has(activeSceneProfileId);
  const activeSceneProfile = isSceneProfileActive
    ? sceneQuickThemeSettings[activeSceneProfileId] ?? null
    : null;
  const activeQuickEditSettings = isSceneProfileActive
    ? (quickEditOverlayMode === "fullscreen"
      ? (activeSceneProfile?.fullscreen ?? activeFullscreenQuickThemeSettings)
      : (activeSceneProfile?.lowerThird ?? activeLowerThirdQuickThemeSettings))
    : (quickEditOverlayMode === "fullscreen"
      ? activeFullscreenQuickThemeSettings
      : activeLowerThirdQuickThemeSettings);
  const activeQuickEditThemeId = isSceneProfileActive
    ? (quickEditOverlayMode === "fullscreen"
      ? (activeSceneProfile?.fullscreenThemeId ?? selectedBibleTheme.id)
      : (activeSceneProfile?.lowerThirdThemeId ?? selectedLowerThirdTheme.id))
    : (quickEditOverlayMode === "fullscreen" ? selectedBibleTheme.id : selectedLowerThirdTheme.id);

  // Keep a synchronous copy for a verse navigation event that happens in the
  // same turn as a quick-setting click. The rendered state will catch up on
  // the next render, but the live sender must never fall back to the theme's
  // original defaults in that small window.
  useEffect(() => {
    liveFullscreenThemeSettingsRef.current = effectiveSelectedBibleTheme.settings;
  }, [effectiveSelectedBibleTheme]);
  useEffect(() => {
    liveLowerThirdThemeSettingsRef.current = effectiveSelectedLowerThirdTheme.settings;
  }, [effectiveSelectedLowerThirdTheme]);

  const fullscreenLiveOverrides = useMemo(
    () => buildFullscreenLiveOverridesForQuickSettings(
      effectiveSelectedBibleTheme.settings,
      backgroundPreset,
      fullscreenQuickThemeSettings?.backgroundType,
    ),
    [backgroundPreset, effectiveSelectedBibleTheme.settings, fullscreenQuickThemeSettings?.backgroundType],
  );

  useEffect(() => {
    fullscreenLiveOverridesRef.current = fullscreenLiveOverrides as Record<string, unknown> | null;
  }, [fullscreenLiveOverrides]);

  const persistDockBiblePreferencesNow = useCallback((overrides: Partial<DockBiblePreferences> = {}) => {
    if (prefsSaveDebounceRef.current !== null) {
      window.clearTimeout(prefsSaveDebounceRef.current);
      prefsSaveDebounceRef.current = null;
    }
    saveDockBiblePreferences({
      overlayMode: overlayModeRef.current,
      displayMode,
      translation: activeTranslation,
      translations: [...columnTranslations],
      translationA,
      translationB,
      compareEnabled,
      compareMode,
      compareLayout,
      comparePassages: comparePassageDrafts.map(({ reference, translation }) => ({ reference, translation })),
      comparePassageNavigation,
      referenceFormat,
      referenceVersionVisible,
      keywordMatchPushDirectlyToObs,
      verseLineCount,
      fullscreenThemeId: selectedBibleThemeRef.current.id,
      lowerThirdThemeId: selectedLowerThirdThemeRef.current.id,
      backgroundPreset: backgroundPresetRef.current,
      fullscreenQuickThemeSettings: savedFullscreenQuickThemeSettings,
      lowerThirdQuickThemeSettings: savedLowerThirdQuickThemeSettings,
      lowerThirdQuickThemeSettingsLinkedToFullscreen,
      sceneQuickThemeSettings,
      selectedBook: selectedBook ?? undefined,
      selectedChapter: selectedChapter ?? undefined,
      ...overrides,
    });
  }, [
    activeTranslation,
    columnTranslations,
    compareEnabled,
    compareMode,
    compareLayout,
    comparePassageDrafts,
    comparePassageNavigation,
    keywordMatchPushDirectlyToObs,
    displayMode,
    referenceFormat,
    referenceVersionVisible,
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
    savedFullscreenQuickThemeSettings,
    savedLowerThirdQuickThemeSettings,
    sceneQuickThemeSettings,
    selectedBook,
    selectedChapter,
    translationA,
    translationB,
    verseLineCount,
  ]);

  const handleBackgroundPresetChange = useCallback((preset: DockBackgroundPreset) => {
    backgroundPresetRef.current = preset;
    setBackgroundPreset(preset);
  }, []);

  // ── Fetch verse count when chapter changes ──
  useEffect(() => {
    if (!translationsLoaded || !selectedBook || !selectedChapter) { setVerseCount(30); return; }
    let cancelled = false;
    (async () => {
      try {
        const { getVerseCount } = await import("../../bible/bibleData");
        const count = await getVerseCount(selectedBook, selectedChapter, activeTranslation);
        if (!cancelled) setVerseCount(count || 30);
      } catch { if (!cancelled) setVerseCount(30); }
    })();
    return () => { cancelled = true; };
  }, [activeTranslation, selectedBook, selectedChapter, translationsLoaded]);

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
    manualReferenceSelectionRef.current = true;
    setSelectedBook(book);
    selectedChapterRef.current = chapter;
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
    if (!translationsLoaded || !selectedBook || !selectedChapter) {
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
  }, [columnTranslations, quickTranslations, selectedBook, selectedChapter, translationsLoaded]);

  useEffect(() => {
    if (!translationsLoaded || !compareEnabled || !selectedBook || !selectedChapter) {
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
  }, [compareEnabled, selectedBook, selectedChapter, t, translationA, translationB, translationsLoaded]);

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

  useEffect(() => {
    if (!translationsLoaded || !compareEnabled || compareMode !== "passages") {
      setComparePassagePreviews([]);
      return;
    }

    let cancelled = false;
    const drafts = comparePassageDrafts.slice(0, MAX_COMPARE_PASSAGES);
    const initialPreviews: ComparePassagePreview[] = drafts.map((draft) => {
      const parsed = parseBiblePassageReference(draft.reference);
      const hasInput = draft.reference.trim().length > 0;
      return {
        draft,
        parsed,
        passage: null,
        text: "",
        verseRange: parsed ? String(parsed.verse) : "",
        verseEnd: parsed?.endVerse ?? null,
        referenceLabel: parsed ? formatBiblePassageReference(parsed) : "",
        loading: Boolean(parsed),
        error: hasInput && !parsed ? t("dock.compare.invalidReference", "Enter a reference like John 3:16.") : "",
      };
    });
    setComparePassagePreviews(initialPreviews);

    void (async () => {
      const { getChapter } = await import("../../bible/bibleData");
      const loaded = await Promise.all(initialPreviews.map(async (preview) => {
        if (!preview.parsed) return preview;
        try {
          const passage = await getChapter(
            preview.parsed.book,
            preview.parsed.chapter,
            preview.draft.translation,
          );
          const selection = await resolveVerseSelection(
            preview.parsed.book,
            preview.parsed.chapter,
            preview.parsed.verse,
            preview.draft.translation,
            clampVerseLineCount(verseLineCount),
            preview.parsed.endVerse,
            passage,
          );
          return {
            ...preview,
            passage,
            text: selection.text,
            verseRange: selection.verseRange,
            verseEnd: selection.verseEnd,
            referenceLabel: formatBiblePassageReference({
              ...preview.parsed,
              endVerse: selection.verseEnd,
            }),
            loading: false,
            error: "",
          };
        } catch (error) {
          return {
            ...preview,
            loading: false,
            error: error instanceof Error ? error.message : t("bible.unableToLoad", "Unable to load this passage."),
          };
        }
      }));
      if (!cancelled) setComparePassagePreviews(loaded);
    })().catch((error) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : t("bible.unableToLoad", "Unable to load this passage.");
      setComparePassagePreviews(initialPreviews.map((preview) => ({
        ...preview,
        loading: false,
        error: preview.parsed ? message : preview.error,
      })));
    });

    return () => {
      cancelled = true;
    };
  }, [compareEnabled, compareMode, comparePassageDrafts, resolveVerseSelection, t, translationsLoaded, verseLineCount]);

  const handleComparePassageReferenceChange = useCallback((id: string, reference: string) => {
    setComparePassageDrafts((current) => current.map((draft) => (
      draft.id === id ? { ...draft, reference } : draft
    )));
  }, []);

  const handleComparePassageTranslationChange = useCallback((id: string, translation: string) => {
    setComparePassageDrafts((current) => current.map((draft) => (
      draft.id === id ? { ...draft, translation: translation.toUpperCase() } : draft
    )));
  }, []);

  const activateComparePassage = useCallback((index: number, referenceOverride?: ParsedBiblePassageReference | null) => {
    const nextIndex = Math.min(Math.max(index, 0), Math.max(0, comparePassageDrafts.length - 1));
    setActiveComparePassageIndex(nextIndex);
    const parsed = referenceOverride ?? parseBiblePassageReference(comparePassageDrafts[nextIndex]?.reference ?? "");
    if (!parsed) return;
    setSelectedBook(parsed.book);
    selectedChapterRef.current = parsed.chapter;
    setSelectedChapter(parsed.chapter);
    setSelectedVerse(parsed.verse);
    selectedVerseRef.current = parsed.verse;
  }, [comparePassageDrafts]);

  const resolveComparePassageOutputColumns = useCallback(async (
    lineCount: number,
    referenceFormatValue: BibleReferenceFormat,
    referenceVersionVisibleValue: boolean,
    draftsOverride?: ComparePassageDraft[],
  ): Promise<ComparePassageOutputColumn[]> => {
    const { getChapter } = await import("../../bible/bibleData");
    const drafts = (draftsOverride ?? comparePassageDrafts).slice(0, MAX_COMPARE_PASSAGES);
    return Promise.all(drafts.map(async (draft) => {
      const parsed = parseBiblePassageReference(draft.reference);
      if (!parsed) {
        throw new Error(t("dock.compare.invalidReference", "Enter a reference like John 3:16."));
      }

      const passage = await getChapter(parsed.book, parsed.chapter, draft.translation);
      const selection = await resolveVerseSelection(
        parsed.book,
        parsed.chapter,
        parsed.verse,
        draft.translation,
        lineCount,
        parsed.endVerse,
        passage,
      );
      return {
        book: parsed.book,
        chapter: parsed.chapter,
        verse: parsed.verse,
        verseEnd: selection.verseEnd,
        verseRange: selection.verseRange,
        referenceLabel: buildBibleReferenceBaseLabel(
          parsed.book,
          parsed.chapter,
          selection.verseRange,
          referenceFormatValue,
        ),
        translation: referenceVersionVisibleValue ? draft.translation : "",
        verseText: selection.text,
      };
    }));
  }, [comparePassageDrafts, resolveVerseSelection, t]);

  const publishComparePassageOutput = useCallback(async ({
    lineCount,
    referenceFormatValue,
    referenceVersionVisibleValue,
    themeOverride,
    reveal = false,
    draftsOverride,
    awaitFontFit = false,
  }: {
    lineCount: number;
    referenceFormatValue: BibleReferenceFormat;
    referenceVersionVisibleValue: boolean;
    themeOverride?: BibleThemeOutputOverride;
    reveal?: boolean;
    draftsOverride?: ComparePassageDraft[];
    awaitFontFit?: boolean;
  }): Promise<DockOverlayFontFitMeasurement | null | undefined> => {
    if (!translationsLoaded) return null;
    const requestId = ++liveVerseRequestIdRef.current;
    const drafts = (draftsOverride ?? comparePassageDrafts).slice(0, MAX_COMPARE_PASSAGES);
    if (drafts.length < MIN_COMPARE_PASSAGES) return null;

    try {
      const columns = await resolveComparePassageOutputColumns(
        lineCount,
        referenceFormatValue,
        referenceVersionVisibleValue,
        drafts,
      );
      if (requestId !== liveVerseRequestIdRef.current || columns.length < MIN_COMPARE_PASSAGES) return null;

      const liveOverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayModeRef.current;
      const liveFullscreenThemeSettings = liveFullscreenThemeSettingsRef.current
        ?? effectiveSelectedBibleTheme.settings;
      const liveLowerThirdThemeSettings = liveLowerThirdThemeSettingsRef.current
        ?? effectiveSelectedLowerThirdTheme.settings;
      const first = columns[0];
      const compareReferenceLabel = columns
        .map((column) => column.referenceLabel)
        .filter(Boolean)
        .join(" • ") || t("dock.compare.passagesLabel", "Compare Passages");
      const stageData = {
        book: first.book,
        chapter: first.chapter,
        verse: first.verse,
        verseEnd: first.verseEnd,
        verseRange: first.verseRange,
        referenceLabel: first.referenceLabel,
        displayReferenceLabel: compareReferenceLabel,
        referenceBaseLabel: first.referenceLabel,
        lineCount,
        translation: drafts[0]?.translation ?? "",
        translationA: drafts[0]?.translation ?? "",
        translationB: drafts[1]?.translation ?? "",
        compareEnabled: true,
        compareMode: "passages" as const,
        compareLayout: "side-by-side" as const,
        verseText: first.verseText,
        overlayMode: liveOverlayMode,
        theme: themeOverride?.themeId
          ?? (liveOverlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id),
        bibleThemeSettings: (
          themeOverride?.settings
          ?? (liveOverlayMode === "fullscreen" ? liveFullscreenThemeSettings : liveLowerThirdThemeSettings)
        ) as unknown as Record<string, unknown>,
        liveOverrides: themeOverride
          ? (themeOverride.liveOverrides ?? null)
          : (liveOverlayMode === "fullscreen" ? (fullscreenLiveOverrides as Record<string, unknown> | null) : null),
        reveal,
        _dockLive: true,
        compare: {
          enabled: true,
          mode: "passages" as const,
          layout: "side-by-side" as const,
          columns,
        },
      };

      latestStagedRef.current = {
        type: "bible",
        label: compareReferenceLabel,
        subtitle: first.verseText,
        data: stageData,
      } as DockStagedItem;
      onStage(latestStagedRef.current);

      if (presentationLinkMode) {
        setBibleOverlayVisible(true);
        trackBiblePresent(first.verseText);
        return null;
      }

      const lowerThirdPayload = {
        verseText: stageData.verseText,
        referenceText: stageData.displayReferenceLabel,
        verseRange: stageData.verseRange,
        bibleThemeSettings: stageData.bibleThemeSettings,
        liveOverrides: null,
        themeId: stageData.theme,
        compareEnabled: true,
        compareMode: "passages" as const,
        compareLayout: "side-by-side" as const,
        compare: stageData.compare,
        translationA: stageData.translationA,
        translationB: stageData.translationB,
      };
      const fitOptions = awaitFontFit ? { waitForFit: true } : undefined;
      const pushLive = () => hasSceneRoute
        ? pushBibleToConfiguredOutput(stageData as unknown as DockBiblePushData, fitOptions)
        : liveOverlayMode === "lower-third"
          ? dockObsClient.pushBibleOverlayFast(lowerThirdPayload, fitOptions)
          : pushBibleToConfiguredOutput(stageData as unknown as DockBiblePushData, fitOptions);

      const measurement = await pushLive();
      if (requestId !== liveVerseRequestIdRef.current) return;
      setBibleOverlayVisible(true);
      trackBiblePresent(first.verseText);
      return measurement;
    } catch (error) {
      if (requestId !== liveVerseRequestIdRef.current) return;
      setActionError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [
    comparePassageDrafts,
    effectiveSelectedBibleTheme.id,
    effectiveSelectedBibleTheme.settings,
    effectiveSelectedLowerThirdTheme.settings,
    fullscreenLiveOverrides,
    fullscreenOnlyMode,
    hasSceneRoute,
    onStage,
    overlayModeRef,
    presentationLinkMode,
    pushBibleToConfiguredOutput,
    resolveComparePassageOutputColumns,
    selectedLowerThirdTheme.id,
    t,
    translationsLoaded,
  ]);

  const handleComparePassageNavigation = useCallback((direction: -1 | 1, requestedIndex?: number) => {
    const navigationIndex = requestedIndex ?? activeComparePassageIndex;
    const indexes = comparePassageNavigation === "linked"
      ? comparePassagePreviews.map((_, index) => index)
      : [navigationIndex];
    const nextReferences = new Map<number, ParsedBiblePassageReference>();
    let blocked = false;

    for (const index of indexes) {
      const preview = comparePassagePreviews[index];
      if (!preview?.parsed) {
        blocked = true;
        continue;
      }
      const maxVerse = preview.passage?.verses[preview.passage.verses.length - 1]?.verse ?? verseCount;
      const next = navigateBiblePassageReference(preview.parsed, direction, maxVerse);
      if (!next) {
        blocked = true;
        continue;
      }
      nextReferences.set(index, next);
    }

    if (nextReferences.size === 0) {
      setActionError(t("dock.compare.chapterBoundary", "You are at the edge of the loaded chapter."));
      return;
    }

    const nextDrafts = comparePassageDrafts.map((draft, index) => {
      const next = nextReferences.get(index);
      return next ? { ...draft, reference: formatBiblePassageReference(next) } : draft;
    });
    setComparePassageDrafts(() => nextDrafts);
    const activeNext = nextReferences.get(navigationIndex);
    if (activeNext) activateComparePassage(navigationIndex, activeNext);
    setActionError(blocked
      ? t("dock.compare.partialChapterBoundary", "Some passages are at the edge of their chapter.")
      : "");

    // Navigation must update the already-routed OBS source as well as the
    // reader cards. Use the next drafts directly because React state updates
    // are asynchronous and the source cannot wait for the next render.
    void publishComparePassageOutput({
      lineCount: verseLineCount,
      referenceFormatValue: referenceFormat,
      referenceVersionVisibleValue: referenceVersionVisible,
      reveal: true,
      draftsOverride: nextDrafts,
    });
  }, [
    activeComparePassageIndex,
    activateComparePassage,
    comparePassageDrafts,
    comparePassageNavigation,
    comparePassagePreviews,
    publishComparePassageOutput,
    referenceFormat,
    referenceVersionVisible,
    t,
    verseCount,
    verseLineCount,
  ]);

  const handleRemoveComparePassage = useCallback((id: string) => {
    setComparePassageDrafts((current) => {
      if (current.length <= MIN_COMPARE_PASSAGES) return current;
      const next = current.filter((draft) => draft.id !== id);
      return next.length >= MIN_COMPARE_PASSAGES ? next : current;
    });
    setActiveComparePassageIndex((current) => Math.min(current, MIN_COMPARE_PASSAGES - 1));
  }, []);

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
        referenceFormat?: BibleReferenceFormat;
        referenceVersionVisible?: boolean;
      },
    ) => {
      const effectiveTranslation = options?.translation ?? activeTranslation;
      if (compareEnabled && compareMode === "passages") {
        const nextReference: ParsedBiblePassageReference = { book, chapter, verse, endVerse: null };
        setComparePassageDrafts((current) => current.map((draft, index) => (
          index === activeComparePassageIndex
            ? { ...draft, reference: formatBiblePassageReference(nextReference) }
            : draft
        )));
        activateComparePassage(activeComparePassageIndex, nextReference);
        return;
      }
      const effectiveLineCount = clampVerseLineCount(options?.lineCount ?? verseLineCount);
      const effectiveReferenceFormat = options?.referenceFormat ?? referenceFormat;
      const effectiveReferenceVersionVisible = options?.referenceVersionVisible ?? referenceVersionVisible;
      const liveFullscreenThemeSettings = liveFullscreenThemeSettingsRef.current
        ?? effectiveSelectedBibleTheme.settings;
      const liveLowerThirdThemeSettings = liveLowerThirdThemeSettingsRef.current
        ?? effectiveSelectedLowerThirdTheme.settings;
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
      const rawReferenceLabel = `${book} ${chapter}:${selection.verseRange}`;
      const referenceBaseLabel = buildBibleReferenceBaseLabel(book, chapter, selection.verseRange, effectiveReferenceFormat);
      const referenceLabel = buildBibleReferenceDisplayLabel(
        book,
        chapter,
        selection.verseRange,
        effectiveTranslation,
        effectiveReferenceFormat,
        effectiveReferenceVersionVisible,
      );
      const columnIndex = typeof options?.columnIndex === "number"
        ? Math.min(Math.max(options.columnIndex, 0), QUICK_SELECT_VERSION_COUNT - 1)
        : activeColumnIndex;
      const shouldCompareTranslations = compareEnabled && compareMode === "translations";
      const liveOverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayMode;

      let stageData: Record<string, unknown>;
      let stageLabel = referenceLabel;
      let stageSubtitle = selection.text;

      if (shouldCompareTranslations) {
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
        const compareReferenceBaseLabel = buildBibleReferenceBaseLabel(book, chapter, selectionA.verseRange, effectiveReferenceFormat);
        const compareReferenceLabel = appendBibleVersionToReference(
          compareReferenceBaseLabel,
          `${translationA}/${translationB}`,
          effectiveReferenceVersionVisible,
        );
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
          displayReferenceLabel: compareReferenceLabel,
          referenceBaseLabel: compareReferenceBaseLabel,
          lineCount: effectiveLineCount,
          translation: translationA,
          translationA,
          translationB,
          compareEnabled: true,
          compareLayout,
          verseText: selectionA.text,
          overlayMode: liveOverlayMode,
          theme: liveOverlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id,
          bibleThemeSettings: (
            liveOverlayMode === "fullscreen"
              ? liveFullscreenThemeSettings
              : liveLowerThirdThemeSettings
          ) as unknown as Record<string, unknown>,
          liveOverrides:
            liveOverlayMode === "fullscreen"
              ? (fullscreenLiveOverrides as Record<string, unknown> | null)
              : null,
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
                referenceLabel: compareReferenceBaseLabel,
                translation: effectiveReferenceVersionVisible ? translationA : "",
                verseText: selectionA.text,
              },
              {
                book,
                chapter,
                verse,
                verseEnd: selectionB.verseEnd,
                verseRange: selectionB.verseRange,
                referenceLabel: compareReferenceBaseLabel,
                translation: effectiveReferenceVersionVisible ? translationB : "",
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
          rawReferenceLabel,
          referenceLabel,
          displayReferenceLabel: referenceLabel,
          referenceBaseLabel,
          lineCount: effectiveLineCount,
          translation: effectiveTranslation,
          verseText: selection.text,
          overlayMode: liveOverlayMode,
          theme: liveOverlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id,
          bibleThemeSettings: (
            liveOverlayMode === "fullscreen"
              ? liveFullscreenThemeSettings
              : liveLowerThirdThemeSettings
          ) as unknown as Record<string, unknown>,
          liveOverrides:
            liveOverlayMode === "fullscreen"
              ? (fullscreenLiveOverrides as Record<string, unknown> | null)
              : null,
          reveal: options?.reveal !== false,
        };
      }

      const nextStageItem = {
        type: "bible",
        label: stageLabel,
        subtitle: stageSubtitle,
        data: stageData,
      } as DockStagedItem;

      latestStagedRef.current = nextStageItem;
      onStage(nextStageItem);

      recordBibleHistory(book, chapter, verse, selection.text);
    },
    [
      focusReference,
      focusReferenceWithoutReload,
      compareEnabled,
      compareMode,
      compareLayout,
      activeComparePassageIndex,
      comparePassageDrafts,
      activateComparePassage,
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
      chapterPassages,
      fullscreenOnlyMode,
      referenceFormat,
      referenceVersionVisible,
      recordBibleHistory,
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
        referenceFormat?: BibleReferenceFormat;
        referenceVersionVisible?: boolean;
        themeOverride?: BibleThemeOutputOverride;
        recordHistory?: boolean;
        preserveComparePassages?: boolean;
        pushComparePassages?: boolean;
        awaitFontFit?: boolean;
      },
    ) => {
      const requestId = ++liveVerseRequestIdRef.current;
      const effectiveTranslation = options?.translation ?? activeTranslation;
      if (compareEnabled && compareMode === "passages") {
        if (options?.preserveComparePassages) {
          return publishComparePassageOutput({
            lineCount: clampVerseLineCount(options?.lineCount ?? verseLineCount),
            referenceFormatValue: options?.referenceFormat ?? referenceFormat,
            referenceVersionVisibleValue: options?.referenceVersionVisible ?? referenceVersionVisible,
            themeOverride: options?.themeOverride,
            reveal: options?.reveal !== false,
            awaitFontFit: options?.awaitFontFit,
          });
        }
        const nextReference: ParsedBiblePassageReference = { book, chapter, verse, endVerse: null };
        const nextDrafts = comparePassageDrafts.map((draft, index) => (
          index === activeComparePassageIndex
            ? { ...draft, reference: formatBiblePassageReference(nextReference) }
            : draft
        ));
        setComparePassageDrafts(() => nextDrafts);
        activateComparePassage(activeComparePassageIndex, nextReference);
        if (options?.pushComparePassages) {
          return publishComparePassageOutput({
            lineCount: clampVerseLineCount(options?.lineCount ?? verseLineCount),
            referenceFormatValue: options?.referenceFormat ?? referenceFormat,
            referenceVersionVisibleValue: options?.referenceVersionVisible ?? referenceVersionVisible,
            themeOverride: options?.themeOverride,
            reveal: options?.reveal !== false,
            draftsOverride: nextDrafts,
            awaitFontFit: options?.awaitFontFit,
          });
        }
        return;
      }
      const effectiveLineCount = clampVerseLineCount(options?.lineCount ?? verseLineCount);
      const effectiveReferenceFormat = options?.referenceFormat ?? referenceFormat;
      const effectiveReferenceVersionVisible = options?.referenceVersionVisible ?? referenceVersionVisible;
      const liveFullscreenThemeSettings = liveFullscreenThemeSettingsRef.current
        ?? effectiveSelectedBibleTheme.settings;
      const liveLowerThirdThemeSettings = liveLowerThirdThemeSettingsRef.current
        ?? effectiveSelectedLowerThirdTheme.settings;
      const liveOverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayModeRef.current;
      const themeOverride = options?.themeOverride;
      const liveThemeId = themeOverride?.themeId
        ?? (liveOverlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id);
      const liveThemeSettings = themeOverride?.settings
        ?? (
          liveOverlayMode === "fullscreen"
            ? liveFullscreenThemeSettings
            : liveLowerThirdThemeSettings
        );
      const liveOverrides = themeOverride
        ? (themeOverride.liveOverrides ?? null)
        : (
          liveOverlayMode === "fullscreen"
            ? (fullscreenLiveOverrides as Record<string, unknown> | null)
            : null
        );
      const shouldRecordHistory = options?.recordHistory !== false;
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
      const rawReferenceLabel = `${book} ${chapter}:${selection.verseRange}`;
      const referenceBaseLabel = buildBibleReferenceBaseLabel(book, chapter, selection.verseRange, effectiveReferenceFormat);
      const referenceLabel = buildBibleReferenceDisplayLabel(
        book,
        chapter,
        selection.verseRange,
        effectiveTranslation,
        effectiveReferenceFormat,
        effectiveReferenceVersionVisible,
      );
      const columnIndex = typeof options?.columnIndex === "number"
        ? Math.min(Math.max(options.columnIndex, 0), QUICK_SELECT_VERSION_COUNT - 1)
        : activeColumnIndex;
      const shouldCompareTranslations = compareEnabled && compareMode === "translations";

      let stageData: Record<string, unknown>;
      let stageLabel = referenceLabel;
      let stageSubtitle = selection.text;

      if (shouldCompareTranslations) {
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

        const compareReferenceBaseLabel = buildBibleReferenceBaseLabel(book, chapter, selectionA.verseRange, effectiveReferenceFormat);
        const compareReferenceLabel = appendBibleVersionToReference(
          compareReferenceBaseLabel,
          `${translationA}/${translationB}`,
          effectiveReferenceVersionVisible,
        );
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
          displayReferenceLabel: compareReferenceLabel,
          referenceBaseLabel: compareReferenceBaseLabel,
          lineCount: effectiveLineCount,
          translation: translationA,
          translationA,
          translationB,
          compareEnabled: true,
          compareLayout,
          verseText: selectionA.text,
          overlayMode: liveOverlayMode,
          theme: liveThemeId,
          bibleThemeSettings: liveThemeSettings as unknown as Record<string, unknown>,
          liveOverrides,
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
                referenceLabel: compareReferenceBaseLabel,
                translation: effectiveReferenceVersionVisible ? translationA : "",
                verseText: selectionA.text,
              },
              {
                book,
                chapter,
                verse,
                verseEnd: selectionB.verseEnd,
                verseRange: selectionB.verseRange,
                referenceLabel: compareReferenceBaseLabel,
                translation: effectiveReferenceVersionVisible ? translationB : "",
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
          rawReferenceLabel,
          referenceLabel,
          displayReferenceLabel: referenceLabel,
          referenceBaseLabel,
          lineCount: effectiveLineCount,
          translation: effectiveTranslation,
          verseText: selection.text,
          overlayMode: liveOverlayMode,
          theme: liveThemeId,
          bibleThemeSettings: liveThemeSettings as unknown as Record<string, unknown>,
          liveOverrides,
          reveal: options?.reveal !== false,
          _dockLive: true,
        };
      }

      if (requestId !== liveVerseRequestIdRef.current) return;

      const nextStageItem = {
        type: "bible",
        label: stageLabel,
        subtitle: stageSubtitle,
        data: stageData,
      } as DockStagedItem;

      latestStagedRef.current = nextStageItem;
      onStage(nextStageItem);

      if (presentationLinkMode) {
        setBibleOverlayVisible(true);
        trackBiblePresent(selection.text);
        if (shouldRecordHistory && book && chapter && verse) {
          recordBibleHistory(book, chapter, verse, selection.text);
        }
        return;
      }

      const lowerThirdPayload = {
        verseText: stageData.verseText as string | undefined,
        referenceText: stageData.displayReferenceLabel as string | undefined,
        verseRange: stageData.verseRange as string | undefined,
        bibleThemeSettings: stageData.bibleThemeSettings as Record<string, unknown> | null | undefined,
        liveOverrides: null,
        themeId: stageData.theme as string | undefined,
        compareEnabled: Boolean(stageData.compareEnabled),
        compareMode: stageData.compareMode as CompareMode | undefined,
        compareLayout: stageData.compareLayout as CompareLayout | undefined,
        compare: stageData.compare as Record<string, unknown> | null | undefined,
        translationA: stageData.translationA as string | undefined,
        translationB: stageData.translationB as string | undefined,
      };
      const fitOptions = options?.awaitFontFit ? { waitForFit: true } : undefined;
      const pushLive = () => hasSceneRoute
        ? pushBibleToConfiguredOutput(stageData as unknown as DockBiblePushData, fitOptions)
          : liveOverlayMode === "lower-third"
          ? dockObsClient.pushBibleOverlayFast(lowerThirdPayload, fitOptions)
          : pushBibleToConfiguredOutput(stageData as unknown as DockBiblePushData, fitOptions);

      // Publish the selected verse to the already-loaded Bible browser source
      // before the full OBS scene reconciliation starts. Fullscreen pushes can
      // otherwise spend several hundred milliseconds checking scenes and
      // backgrounds while OBS continues showing the previous verse.
      if (!hasSceneRoute) {
        void dockObsClient
          .primeBibleOverlay(stageData as unknown as Parameters<typeof dockObsClient.primeBibleOverlay>[0])
          .then(() => {
            if (requestId === liveVerseRequestIdRef.current) {
              return dockObsClient.focusMcePresentationModule("bible");
            }
            return undefined;
          })
          .catch(() => { });
      }

      if (options?.awaitFontFit) {
        try {
          const measurement = await pushLive();
          if (requestId !== liveVerseRequestIdRef.current) return measurement;
          setBibleOverlayVisible(true);
          trackBiblePresent(selection.text);
          return measurement;
        } catch (err) {
          if (requestId === liveVerseRequestIdRef.current) {
            console.warn("[DockBibleTab] Save-time overlay measurement failed:", err);
          }
          return null;
        }
      }

      pushLive()
        .then(() => {
          if (requestId !== liveVerseRequestIdRef.current) return;
          setBibleOverlayVisible(true);
          trackBiblePresent(selection.text);
        })
        .catch(async (err) => {
          if (requestId !== liveVerseRequestIdRef.current) return;
          let message = err instanceof Error ? err.message : String(err);
          const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
          if (isTransient) {
            try {
              if (requestId !== liveVerseRequestIdRef.current) return;
              await pushLive();
              if (requestId !== liveVerseRequestIdRef.current) return;
              setBibleOverlayVisible(true);
              trackBiblePresent(selection.text);
              return;
            } catch (retryErr) {
              message = retryErr instanceof Error ? retryErr.message : String(retryErr);
              console.warn("[DockBibleTab] Send to OBS verse retry failed:", retryErr);
            }
          }
          console.warn("[DockBibleTab] Send to OBS verse failed:", err);
          setActionError(message);
        });

      if (shouldRecordHistory && book && chapter && verse) {
        recordBibleHistory(book, chapter, verse, selection.text);
      }
    },
    [
      compareEnabled,
      compareMode,
      compareLayout,
      activeComparePassageIndex,
      activateComparePassage,
      fullscreenLiveOverrides,
      onStage,
      overlayMode,
      resolveVerseSelection,
      getLoadedPassageForTranslation,
      selectedBook,
      selectedChapter,
      publishComparePassageOutput,
      translationA,
      translationB,
      effectiveSelectedBibleTheme.id,
      effectiveSelectedBibleTheme.settings,
      effectiveSelectedLowerThirdTheme.settings,
      selectedLowerThirdTheme.id,
      activeColumnIndex,
      activeTranslation,
      fullscreenOnlyMode,
      verseLineCount,
      presentationLinkMode,
      referenceFormat,
      referenceVersionVisible,
      hasSceneRoute,
      sceneRoute.syncPresentation,
      pushBibleToConfiguredOutput,
      recordBibleHistory,
    ],
  );

  const refreshCurrentBibleOutputAfterThemeSave = useCallback((
    saveMode: OverlayMode,
    nextSettings: DockFullscreenQuickThemeSettings,
    context?: BibleQuickSettingsSaveContext,
  ) => {
    if (!bibleOverlayVisible || !selectedBook || !selectedChapter || !selectedVerse) return Promise.resolve(null);
    const liveOverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayModeRef.current;
    if (liveOverlayMode !== saveMode) return Promise.resolve(null);
    const effectiveLineCount = clampVerseLineCount(context?.lineCount ?? verseLineCount);
    const effectiveReferenceFormat = context?.referenceFormat ?? referenceFormat;
    const effectiveReferenceVersionVisible = context?.referenceVersionVisible ?? referenceVersionVisible;
    const isSceneProfileSave = Boolean(
      context?.sceneProfileId && context.sceneProfileId !== GENERAL_SCENE_PROFILE_ID,
    );

    const selectedTheme = context?.selectedTheme ?? null;
    const baseTheme = resolveThemeForOverlayMode(
      selectedTheme ?? (saveMode === "fullscreen" ? selectedBibleThemeRef.current : selectedLowerThirdThemeRef.current),
      saveMode,
    );
    const nextTheme = saveMode === "fullscreen"
      ? applyFullscreenQuickThemeSettings(baseTheme, nextSettings)
      : applyLowerThirdQuickThemeSettings(baseTheme, nextSettings);
    const preset = context?.backgroundPreset ?? backgroundPresetRef.current;

    return goLiveVerse(selectedBook, selectedChapter, selectedVerse, {
      translation: activeTranslation,
      columnIndex: activeColumnIndex,
      reveal: false,
      lineCount: effectiveLineCount,
      referenceFormat: effectiveReferenceFormat,
      referenceVersionVisible: effectiveReferenceVersionVisible,
      recordHistory: false,
      preserveComparePassages: true,
      awaitFontFit: true,
      ...(isSceneProfileSave ? {} : {
        themeOverride: {
          themeId: nextTheme.id,
          settings: nextTheme.settings,
          liveOverrides: saveMode === "fullscreen"
            ? buildFullscreenLiveOverridesForQuickSettings(
              nextTheme.settings,
              preset,
              nextSettings.backgroundType,
            )
            : null,
        },
      }),
    });
  }, [
    activeColumnIndex,
    activeTranslation,
    bibleOverlayVisible,
    fullscreenOnlyMode,
    goLiveVerse,
    referenceFormat,
    referenceVersionVisible,
    selectedBook,
    selectedChapter,
    selectedVerse,
    verseLineCount,
  ]);

  useEffect(() => {
    if (
      modeRefreshNonce === 0
      || !bibleOverlayVisible
      || !selectedBook
      || selectedChapter === null
      || selectedVerse === null
    ) {
      return;
    }
    if (lastModeRefreshNonceRef.current === modeRefreshNonce) return;
    lastModeRefreshNonceRef.current = modeRefreshNonce;

    void goLiveVerse(selectedBook, selectedChapter, selectedVerse, {
      translation: activeTranslation,
      columnIndex: activeColumnIndex,
      reveal: false,
      lineCount: verseLineCount,
      referenceFormat,
      referenceVersionVisible,
      recordHistory: false,
      preserveComparePassages: true,
    });
  }, [
    activeColumnIndex,
    activeTranslation,
    bibleOverlayVisible,
    goLiveVerse,
    modeRefreshNonce,
    referenceFormat,
    referenceVersionVisible,
    selectedBook,
    selectedChapter,
    selectedVerse,
    verseLineCount,
  ]);

  const saveSceneProfileQuickThemeSettings = useCallback((
    saveMode: OverlayMode,
    nextSettings: DockFullscreenQuickThemeSettings,
    context?: DockThemeSettingsSaveContext,
  ): boolean => {
    const profileId = context?.sceneProfileId;
    if (!profileId || profileId === GENERAL_SCENE_PROFILE_ID) return false;

    const existingProfile = sceneQuickThemeSettingsRef.current[profileId] ?? {};
    const isFullscreen = saveMode === "fullscreen";
    const fallbackTheme = context?.selectedTheme
      ?? (isFullscreen ? selectedBibleThemeRef.current : selectedLowerThirdThemeRef.current);
    const storedThemeSettings = isFullscreen
      ? existingProfile.fullscreenThemeSettings
      : existingProfile.lowerThirdThemeSettings;
    const baseTheme = context?.selectedTheme || !storedThemeSettings
      ? resolveThemeForOverlayMode(fallbackTheme, saveMode)
      : {
        ...resolveThemeForOverlayMode(fallbackTheme, saveMode),
        settings: storedThemeSettings as unknown as BibleThemeSettings,
      };
    const nextTheme = isFullscreen
      ? applyFullscreenQuickThemeSettings(baseTheme, nextSettings)
      : applyLowerThirdQuickThemeSettings(baseTheme, nextSettings);
    const nextProfile: DockSceneQuickThemeProfile = {
      ...existingProfile,
      ...(isFullscreen
        ? {
          fullscreen: { ...nextSettings },
          fullscreenThemeId: context?.selectedTheme?.id
            ?? existingProfile.fullscreenThemeId
            ?? fallbackTheme.id,
          fullscreenThemeSettings: nextTheme.settings as unknown as Record<string, unknown>,
        }
        : {
          lowerThird: { ...nextSettings },
          lowerThirdThemeId: context?.selectedTheme?.id
            ?? existingProfile.lowerThirdThemeId
            ?? fallbackTheme.id,
          lowerThirdThemeSettings: nextTheme.settings as unknown as Record<string, unknown>,
        }),
    };
    const nextProfiles = {
      ...sceneQuickThemeSettingsRef.current,
      [profileId]: nextProfile,
    };
    sceneQuickThemeSettingsRef.current = nextProfiles;
    setSceneQuickThemeSettings(nextProfiles);
    persistDockBiblePreferencesNow({ sceneQuickThemeSettings: nextProfiles });
    refreshCurrentBibleOutputAfterThemeSave(saveMode, nextSettings, context);
    return true;
  }, [persistDockBiblePreferencesNow, refreshCurrentBibleOutputAfterThemeSave, selectedBibleThemeRef, selectedLowerThirdThemeRef]);

  const handleSaveFullscreenQuickThemeSettings = useCallback(async (
    nextSettings: DockFullscreenQuickThemeSettings,
    context?: DockThemeSettingsSaveContext,
  ) => {
    if (saveSceneProfileQuickThemeSettings("fullscreen", nextSettings, context)) return;
    manualThemeSettingsSelectionRef.current = true;
    const measurement = await refreshCurrentBibleOutputAfterThemeSave("fullscreen", nextSettings, context);
    const nextSavedSettings = applyMeasuredFontFitSettings(nextSettings, measurement);
    const nextFullscreenTheme = resolveThemeForOverlayMode(
      context?.selectedTheme ?? selectedBibleThemeRef.current,
      "fullscreen",
    );
    liveFullscreenThemeSettingsRef.current = applyFullscreenQuickThemeSettings(
      nextFullscreenTheme,
      nextSavedSettings,
    ).settings;
    const nextLowerThirdQuickSettings = lowerThirdQuickThemeSettingsLinkedToFullscreen
      ? null
      : savedLowerThirdQuickThemeSettings;
    setFullscreenQuickThemeSettings(nextSavedSettings);
    setSavedFullscreenQuickThemeSettings(nextSavedSettings);
    if (lowerThirdQuickThemeSettingsLinkedToFullscreen) {
      setLowerThirdQuickThemeSettings(null);
      setSavedLowerThirdQuickThemeSettings(null);
    }
    persistDockBiblePreferencesNow({
      fullscreenQuickThemeSettings: nextSavedSettings,
      lowerThirdQuickThemeSettings: nextLowerThirdQuickSettings,
    });
  }, [
    lowerThirdQuickThemeSettingsLinkedToFullscreen,
    persistDockBiblePreferencesNow,
    refreshCurrentBibleOutputAfterThemeSave,
    saveSceneProfileQuickThemeSettings,
    selectedBibleThemeRef,
    savedLowerThirdQuickThemeSettings,
  ]);

  const handleSaveLowerThirdQuickThemeSettings = useCallback(async (
    nextSettings: DockFullscreenQuickThemeSettings,
    context?: DockThemeSettingsSaveContext,
  ) => {
    if (saveSceneProfileQuickThemeSettings("lower-third", nextSettings, context)) return;
    manualThemeSettingsSelectionRef.current = true;
    const measurement = await refreshCurrentBibleOutputAfterThemeSave("lower-third", nextSettings, context);
    const nextSavedSettings = applyMeasuredFontFitSettings(nextSettings, measurement);
    const nextLowerThirdTheme = resolveThemeForOverlayMode(
      context?.selectedTheme ?? selectedLowerThirdThemeRef.current,
      "lower-third",
    );
    liveLowerThirdThemeSettingsRef.current = applyLowerThirdQuickThemeSettings(
      nextLowerThirdTheme,
      nextSavedSettings,
    ).settings;
    setLowerThirdQuickThemeSettingsLinkedToFullscreen(false);
    setLowerThirdQuickThemeSettings(nextSavedSettings);
    setSavedLowerThirdQuickThemeSettings(nextSavedSettings);
    persistDockBiblePreferencesNow({
      lowerThirdQuickThemeSettings: nextSavedSettings,
      lowerThirdQuickThemeSettingsLinkedToFullscreen: false,
    });
  }, [
    persistDockBiblePreferencesNow,
    refreshCurrentBibleOutputAfterThemeSave,
    saveSceneProfileQuickThemeSettings,
    selectedLowerThirdThemeRef,
  ]);

  const refreshCurrentBibleOutputForLineCount = useCallback((lineCount: number) => {
    if (!bibleOverlayVisible || !selectedBook || !selectedChapter || !selectedVerse) {
      return Promise.resolve<DockOverlayFontFitMeasurement | null>(null);
    }
    const liveMode: OverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayModeRef.current;
    const activeSettings = liveMode === "fullscreen"
      ? activeFullscreenQuickThemeSettings
      : activeLowerThirdQuickThemeSettings;
    return refreshCurrentBibleOutputAfterThemeSave(liveMode, activeSettings, { lineCount });
  }, [
    activeFullscreenQuickThemeSettings,
    activeLowerThirdQuickThemeSettings,
    bibleOverlayVisible,
    fullscreenOnlyMode,
    overlayModeRef,
    refreshCurrentBibleOutputAfterThemeSave,
    selectedBook,
    selectedChapter,
    selectedVerse,
  ]);

  const handleSyncBibleBrowserSettings = useCallback(async (
    patch: BibleBrowserQuickSettingsPatch,
    lineCountOverride?: number,
  ) => {
    manualThemeSettingsSelectionRef.current = true;
    const hasSettingsPatch = Object.keys(patch).length > 0;
    const nextLineCount = typeof lineCountOverride === "number"
      ? clampVerseLineCount(lineCountOverride)
      : null;
    let nextFullscreenSettings = activeFullscreenQuickThemeSettings;
    // Start from the settings that are actually being rendered. When the
    // lower-third is linked to the fullscreen theme, the saved lower-third
    // object can be null even though it still has a live pattern, background,
    // and size. Starting from the default here silently dropped those values
    // the next time a verse was sent.
    let nextLowerThirdSettings = activeLowerThirdQuickThemeSettings;

    if (nextLineCount !== null) {
      setVerseLineCount(nextLineCount);
    }

    if (hasSettingsPatch) {
      nextFullscreenSettings = {
        ...activeFullscreenQuickThemeSettings,
        ...patch,
      };
      nextLowerThirdSettings = {
        ...activeLowerThirdQuickThemeSettings,
        ...patch,
      };

    }

    const liveMode: OverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayModeRef.current;
    const requestedSettings = liveMode === "fullscreen"
      ? nextFullscreenSettings
      : nextLowerThirdSettings;
    const measurement = hasSettingsPatch
      ? await refreshCurrentBibleOutputAfterThemeSave(
        liveMode,
        requestedSettings,
        nextLineCount !== null ? { lineCount: nextLineCount } : undefined,
      )
      : nextLineCount !== null
        ? await refreshCurrentBibleOutputForLineCount(nextLineCount)
        : null;

    if (measurement) {
      // Apply the measured value to both quick-settings snapshots. The quick
      // controls intentionally share their typography, so switching output
      // modes should not resurrect the oversized request later.
      nextFullscreenSettings = applyMeasuredFontFitSettings(nextFullscreenSettings, measurement);
      nextLowerThirdSettings = applyMeasuredFontFitSettings(nextLowerThirdSettings, measurement);
    }

    if (hasSettingsPatch || measurement) {
      liveFullscreenThemeSettingsRef.current = applyFullscreenQuickThemeSettings(
        baseFullscreenTheme,
        nextFullscreenSettings,
      ).settings;
      liveLowerThirdThemeSettingsRef.current = applyLowerThirdQuickThemeSettings(
        baseLowerThirdTheme,
        nextLowerThirdSettings,
      ).settings;

      setFullscreenQuickThemeSettings(nextFullscreenSettings);
      setSavedFullscreenQuickThemeSettings(nextFullscreenSettings);
      setLowerThirdQuickThemeSettings(nextLowerThirdSettings);
      setSavedLowerThirdQuickThemeSettings(nextLowerThirdSettings);
      if (hasSettingsPatch) {
        setLowerThirdQuickThemeSettingsLinkedToFullscreen(false);
      }
    }

    persistDockBiblePreferencesNow({
      ...((hasSettingsPatch || measurement)
        ? {
          fullscreenQuickThemeSettings: nextFullscreenSettings,
          lowerThirdQuickThemeSettings: nextLowerThirdSettings,
          ...(hasSettingsPatch ? { lowerThirdQuickThemeSettingsLinkedToFullscreen: false } : {}),
        }
        : {}),
      ...(nextLineCount !== null ? { verseLineCount: nextLineCount } : {}),
    });
  }, [
    activeFullscreenQuickThemeSettings,
    activeLowerThirdQuickThemeSettings,
    baseFullscreenTheme,
    baseLowerThirdTheme,
    fullscreenOnlyMode,
    persistDockBiblePreferencesNow,
    refreshCurrentBibleOutputAfterThemeSave,
    refreshCurrentBibleOutputForLineCount,
  ]);

  const activeBrowserFontSettings = fullscreenOnlyMode || overlayMode === "fullscreen"
    ? activeFullscreenQuickThemeSettings
    : activeLowerThirdQuickThemeSettings;
  const browserFontMode = fullscreenOnlyMode || overlayMode === "fullscreen" ? "fullscreen" : "lower-third";
  const browserFontSizeMin = browserFontMode === "fullscreen"
    ? 28
    : LOWER_THIRD_FIT_MIN_FONT_SIZE;
  const browserFontSizeMax = browserFontMode === "fullscreen" ? 200 : LOWER_THIRD_FONT_SIZE_MAX;
  const browserReferenceFontSizeMin = browserFontMode === "fullscreen"
    ? 14
    : LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE;
  const browserReferenceFontSizeMax = browserFontMode === "fullscreen"
    ? 150
    : LOWER_THIRD_REFERENCE_FONT_SIZE_MAX;
  const displayedBrowserFontSettings = {
    ...(draftBrowserQuickThemeSettings ?? activeBrowserFontSettings),
    autoFontScale: true as const,
  };
  const displayedBrowserVerseLineCount = draftBrowserVerseLineCount ?? verseLineCount;
  const areManualFontSizesDisabled = false;
  const isFitTextMode = true;
  const showManualFontControls = browserFontMode === "lower-third";
  const hasPendingBrowserQuickChanges =
    draftBrowserQuickThemeSettings !== null || draftBrowserVerseLineCount !== null;

  const applyBrowserQuickSettingsPatch = useCallback((patch: BibleBrowserQuickSettingsPatch) => {
    const nextPatch: BibleBrowserQuickSettingsPatch = {
      ...patch,
      autoFontScale: true,
      ...(browserFontMode === "lower-third"
        ? {
          fontSize: Math.max(
            LOWER_THIRD_FIT_MIN_FONT_SIZE,
            Number(patch.fontSize ?? activeBrowserFontSettings.fontSize),
          ),
          refFontSize: Math.max(
            LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE,
            Number(patch.refFontSize ?? activeBrowserFontSettings.refFontSize),
          ),
        }
        : {}),
    };

    if (browserQuickUpdateImmediately) {
      void handleSyncBibleBrowserSettings(nextPatch);
      return;
    }

    setDraftBrowserQuickThemeSettings((current) => ({
      ...(current ?? activeBrowserFontSettings),
      ...nextPatch,
    }));
  }, [
    activeBrowserFontSettings,
    browserFontMode,
    browserQuickUpdateImmediately,
    handleSyncBibleBrowserSettings,
  ]);

  const handleBrowserFontSizeValueChange = useCallback((
    field: "fontSize" | "refFontSize",
    value: number,
  ) => {
    const min = field === "fontSize" ? browserFontSizeMin : browserReferenceFontSizeMin;
    const max = field === "fontSize" ? browserFontSizeMax : browserReferenceFontSizeMax;
    const nextValue = clampNumber(value, min, max);
    const patch: BibleBrowserQuickSettingsPatch = { [field]: nextValue };

    if (field === "fontSize") {
      const nextCompareSize = clampNumber(
        nextValue,
        browserFontMode === "lower-third" ? LOWER_THIRD_FIT_MIN_FONT_SIZE : 18,
        browserFontMode === "lower-third" ? LOWER_THIRD_FONT_SIZE_MAX : 120,
      );
      patch.compareVerseFontSizeLeft = nextCompareSize;
      patch.compareVerseFontSizeRight = nextCompareSize;
      patch.compareAutoFitMaxFontSize = nextCompareSize;
    } else {
      const nextCompareRefSize = clampNumber(
        nextValue,
        browserFontMode === "lower-third" ? LOWER_THIRD_FIT_MIN_REFERENCE_FONT_SIZE : 10,
        browserFontMode === "lower-third" ? LOWER_THIRD_REFERENCE_FONT_SIZE_MAX : 48,
      );
      patch.compareReferenceFontSizeLeft = nextCompareRefSize;
      patch.compareReferenceFontSizeRight = nextCompareRefSize;
    }

    applyBrowserQuickSettingsPatch(patch);
  }, [
    applyBrowserQuickSettingsPatch,
    browserFontMode,
    browserFontSizeMax,
    browserFontSizeMin,
    browserReferenceFontSizeMax,
    browserReferenceFontSizeMin,
  ]);

  const handleBrowserFontSizeChange = useCallback((
    field: "fontSize" | "refFontSize",
    delta: number,
  ) => {
    handleBrowserFontSizeValueChange(field, Number(displayedBrowserFontSettings[field]) + delta);
  }, [displayedBrowserFontSettings, handleBrowserFontSizeValueChange]);

  const handleBrowserReferenceBackgroundChange = useCallback((enabled: boolean) => {
    applyBrowserQuickSettingsPatch({ referenceBackgroundEnabled: enabled });
  }, [applyBrowserQuickSettingsPatch]);

  const handleLowerThirdSizePresetChange = useCallback((
    option: (typeof LOWER_THIRD_QUICK_SIZE_OPTIONS)[number],
  ) => {
    const preset = LOWER_THIRD_SIZE_PRESETS[option.preset];
    const horizontalPadding = Math.round(preset.padding * 1.55);
    const nextVerseSize = clampNumber(
      option.fontSize,
      browserFontSizeMin,
      browserFontSizeMax,
    );
    const nextReferenceSize = clampNumber(
      option.refFontSize,
      browserReferenceFontSizeMin,
      browserReferenceFontSizeMax,
    );
    applyBrowserQuickSettingsPatch({
      fontSize: nextVerseSize,
      refFontSize: nextReferenceSize,
      lineHeight: preset.lineHeight,
      refSpacing: preset.refSpacing,
      lowerThirdSize: option.preset,
      lowerThirdWidthPreset: option.width,
      lowerThirdCardPadding: `${preset.padding}px ${horizontalPadding}px`,
      lowerThirdBarMaxHeight: preset.maxHeight,
      compareVerseFontSizeLeft: nextVerseSize,
      compareVerseFontSizeRight: nextVerseSize,
      compareReferenceFontSizeLeft: nextReferenceSize,
      compareReferenceFontSizeRight: nextReferenceSize,
      compareAutoFitMaxFontSize: nextVerseSize,
    });
  }, [
    applyBrowserQuickSettingsPatch,
    browserFontSizeMax,
    browserFontSizeMin,
    browserReferenceFontSizeMax,
    browserReferenceFontSizeMin,
  ]);

  const handleBrowserVerseLineCountChange = useCallback((lineCount: number) => {
    const safeLineCount = clampVerseLineCount(lineCount);
    // Line count changes the actual passage layout, so apply and re-fit it
    // immediately. Font/style edits can still use the explicit Save flow.
    void handleSyncBibleBrowserSettings({}, safeLineCount);
  }, [handleSyncBibleBrowserSettings]);

  const saveBrowserQuickSettings = useCallback(async () => {
    if (!hasPendingBrowserQuickChanges) return;
    const patch = draftBrowserQuickThemeSettings
      ? {
        fontSize: draftBrowserQuickThemeSettings.fontSize,
        refFontSize: draftBrowserQuickThemeSettings.refFontSize,
        lineHeight: draftBrowserQuickThemeSettings.lineHeight,
        refSpacing: draftBrowserQuickThemeSettings.refSpacing,
        compareVerseFontSizeLeft: draftBrowserQuickThemeSettings.compareVerseFontSizeLeft,
        compareVerseFontSizeRight: draftBrowserQuickThemeSettings.compareVerseFontSizeRight,
        compareReferenceFontSizeLeft: draftBrowserQuickThemeSettings.compareReferenceFontSizeLeft,
        compareReferenceFontSizeRight: draftBrowserQuickThemeSettings.compareReferenceFontSizeRight,
        compareAutoFitMaxFontSize: draftBrowserQuickThemeSettings.compareAutoFitMaxFontSize,
        autoFontScale: true,
        referenceBackgroundEnabled: draftBrowserQuickThemeSettings.referenceBackgroundEnabled,
        referenceBackgroundColor: draftBrowserQuickThemeSettings.referenceBackgroundColor,
        referenceBackgroundStyle: draftBrowserQuickThemeSettings.referenceBackgroundStyle,
        referenceBackgroundRadius: draftBrowserQuickThemeSettings.referenceBackgroundRadius,
        lowerThirdSize: draftBrowserQuickThemeSettings.lowerThirdSize,
        lowerThirdWidthPreset: draftBrowserQuickThemeSettings.lowerThirdWidthPreset,
        lowerThirdCardPadding: draftBrowserQuickThemeSettings.lowerThirdCardPadding,
        lowerThirdBarMaxHeight: draftBrowserQuickThemeSettings.lowerThirdBarMaxHeight,
      } satisfies BibleBrowserQuickSettingsPatch
      : {};

    await handleSyncBibleBrowserSettings(patch, draftBrowserVerseLineCount ?? undefined);
    setDraftBrowserQuickThemeSettings(null);
    setDraftBrowserVerseLineCount(null);
    onSaveFeedback?.(t("dock.feedback.bibleDisplaySaved", "Bible display settings saved."));
  }, [
    draftBrowserQuickThemeSettings,
    draftBrowserVerseLineCount,
    handleSyncBibleBrowserSettings,
    hasPendingBrowserQuickChanges,
    onSaveFeedback,
    t,
  ]);

  const handleBrowserQuickUpdateImmediatelyChange = useCallback((checked: boolean) => {
    setBrowserQuickUpdateImmediately(checked);
    saveDockBibleUiPreferencePatch({ browserQuickUpdateImmediately: checked });
    if (checked && hasPendingBrowserQuickChanges) {
      void saveBrowserQuickSettings();
    }
  }, [hasPendingBrowserQuickChanges, saveBrowserQuickSettings]);

  const handleKeywordMatchPushDirectlyToObsChange = useCallback((checked: boolean) => {
    setKeywordMatchPushDirectlyToObs(checked);
    persistDockBiblePreferencesNow({ keywordMatchPushDirectlyToObs: checked });
  }, [persistDockBiblePreferencesNow]);

  const persistQuickActionsPosition = useCallback((top: number, left: number | null) => {
    const nextKey = `${Math.round(top)}:${left === null ? "right" : Math.round(left)}`;
    if (quickActionsLastSavedPositionRef.current === nextKey) return;
    quickActionsLastSavedPositionRef.current = nextKey;
    quickActionsNeedsInitialCenterRef.current = false;
    saveDockBibleUiPreferencePatch({
      quickActionsTop: top,
      quickActionsLeft: left,
    });
  }, []);

  const handleQuickActionsClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (quickActionsSuppressClickRef.current) {
      quickActionsSuppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setShowBrowserFontSizePopover((current) => !current);
  }, []);

  const handleQuickActionsPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const handleElement = event.currentTarget.parentElement;
    const positioningContainer = quickActionsContainerRef.current;
    const containerWidth = positioningContainer?.clientWidth ?? 0;
    const containerHeight = positioningContainer?.clientHeight ?? 0;
    const measuredLeft = getMeasuredQuickActionsLeft(
      handleElement,
      positioningContainer,
      clampQuickActionsLeft(containerWidth - QUICK_ACTIONS_HANDLE_WIDTH, containerWidth),
    );
    const startLeft = clampQuickActionsLeft(
      quickActionsLeftRef.current ?? measuredLeft,
      containerWidth,
    );
    quickActionsDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft,
      startTop: quickActionsTopRef.current,
      currentLeft: startLeft,
      currentTop: quickActionsTopRef.current,
      containerWidth,
      containerHeight,
      didDrag: false,
    };
    setIsQuickActionsDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded browsers may not support pointer capture.
    }
  }, []);

  const handleQuickActionsPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = quickActionsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.startY;
    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaY) > 3 || Math.abs(deltaX) > 3) {
      drag.didDrag = true;
    }
    if (!drag.didDrag) return;

    event.preventDefault();
    const nextTop = clampQuickActionsTop(drag.startTop + deltaY, drag.containerHeight);
    const nextLeft = clampQuickActionsLeft(drag.startLeft + deltaX, drag.containerWidth);
    drag.currentTop = nextTop;
    drag.currentLeft = nextLeft;
    quickActionsTopRef.current = nextTop;
    quickActionsLeftRef.current = nextLeft;
    setQuickActionsTop(nextTop);
    setQuickActionsLeft(nextLeft);
  }, []);

  const finishQuickActionsDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = quickActionsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Some embedded browsers may not support pointer capture.
    }

    quickActionsDragRef.current = null;
    setIsQuickActionsDragging(false);

    if (!drag.didDrag) return;

    event.preventDefault();
    event.stopPropagation();

    const nextTop = clampQuickActionsTop(drag.currentTop, drag.containerHeight);
    const nextLeft = snapQuickActionsLeft(drag.currentLeft, drag.containerWidth);
    quickActionsTopRef.current = nextTop;
    quickActionsLeftRef.current = nextLeft;
    setQuickActionsTop(nextTop);
    setQuickActionsLeft(nextLeft);
    persistQuickActionsPosition(nextTop, nextLeft);

    quickActionsSuppressClickRef.current = true;
    window.setTimeout(() => {
      quickActionsSuppressClickRef.current = false;
    }, 150);
  }, [persistQuickActionsPosition]);

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode);
    setCompareEnabled(mode === "compare");
  }, []);

  const handleCompareEnabledChange = useCallback((enabled: boolean) => {
    setCompareEnabled(enabled);
    setDisplayMode(enabled ? "compare" : "single");
  }, []);

  const handleCompareModeChange = useCallback((mode: CompareMode) => {
    setCompareMode(mode);
  }, []);

  const selectedVerseRef = useRef(selectedVerse);
  useEffect(() => {
    selectedChapterRef.current = selectedChapter;
  }, [selectedChapter]);
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

  // Mode, theme, and line-count changes are saved locally. If Bible is already
  // live, the active OBS output is republished immediately; hidden output is
  // picked up by the next explicit send.

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
      setVerseLineCount(lineCount);
    }
    if (nextOverlayMode && !readDockBibleOverlayMode()) {
      setOverlayMode(nextOverlayMode);
    }
  }, [staged]);

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
    let cancelled = false;
    let timeoutId: number | null = null;
    let consecutiveMisses = 0;

    const pollVoiceState = async () => {
      if (cancelled) return;
      if (!isDockTabVisible(containerRef.current)) {
        timeoutId = window.setTimeout(() => { void pollVoiceState(); }, 1000);
        return;
      }
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
  }, [appConnected, applyVoiceResult, voiceBible.status]);

  // ── Listen for LM Dock navigate commands ──
  // BroadcastChannel handles localhost tabs in the same origin. The HTTP
  // relay below handles an LM dock and Bible dock in separate OBS CEF
  // processes, where BroadcastChannel cannot cross the process boundary.
  const handledLmCommandIdsRef = useRef<Set<string>>(new Set());
  const handleLmNavigateCommand = useCallback((cmd: {
    type?: string;
    commandId?: string;
    payload?: unknown;
  } | null) => {
    if (cmd?.type !== "lm:navigate") return;
    const commandId = String(cmd.commandId || "").trim();
    if (commandId) {
      if (handledLmCommandIdsRef.current.has(commandId)) return;
      handledLmCommandIdsRef.current.add(commandId);
      if (handledLmCommandIdsRef.current.size > 100) {
        const oldest = handledLmCommandIdsRef.current.values().next().value;
        if (oldest) handledLmCommandIdsRef.current.delete(oldest);
      }
    }

    const payload = cmd.payload as {
      book?: string;
      chapter?: number;
      verse?: number;
      translation?: string;
      pushToPreview?: boolean;
    };
    if (!payload.book || !payload.chapter) return;

    focusReference(payload.book, payload.chapter, payload.verse ?? null);
    void (async () => {
      if (!payload.pushToPreview) {
        await stageVerse(payload.book!, payload.chapter!, payload.verse ?? 1, {
          translation: payload.translation,
        });
        return;
      }

      try {
        if (!presentationLinkMode) {
          await dockObsClient.preparePlannerOutput("bible", false);
        }
        await goLiveVerse(payload.book!, payload.chapter!, payload.verse ?? 1, {
          translation: payload.translation,
          recordHistory: false,
        });
      } catch (error) {
        console.warn("[DockBibleTab] LM history preview push failed; staging verse instead:", error);
        await stageVerse(payload.book!, payload.chapter!, payload.verse ?? 1, {
          translation: payload.translation,
        });
      }
    })();
  }, [focusReference, goLiveVerse, presentationLinkMode, stageVerse]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("ocs-dock-commands");
      channel.onmessage = (ev) => {
        handleLmNavigateCommand(ev.data as {
          type?: string;
          commandId?: string;
          payload?: unknown;
        } | null);
      };
    } catch { /* BroadcastChannel not available */ }
    return () => { channel?.close(); };
  }, [handleLmNavigateCommand]);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;

    const pollNavigationRelay = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(
          `${getOverlayBaseUrlSync()}/api/lm-bible-navigation?_=${Date.now()}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const raw = await response.json() as unknown;
        if (!Array.isArray(raw)) return;
        raw.forEach((item) => {
          const command = typeof item === "string"
            ? (() => {
              try { return JSON.parse(item) as { type?: string; commandId?: string; payload?: unknown }; } catch { return null; }
            })()
            : item as { type?: string; commandId?: string; payload?: unknown };
          handleLmNavigateCommand(command);
        });
      } catch {
        // The relay is a cross-process fallback; local BroadcastChannel still works.
      } finally {
        inFlight = false;
      }
    };

    void pollNavigationRelay();
    const timer = window.setInterval(
      () => void pollNavigationRelay(),
      getRecommendedPollingInterval(500),
    );
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [handleLmNavigateCommand]);

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
    if (!debouncedSearchQuery.trim()) return [];

    // 1. Prefer the typed-reference parser. It understands compact input such
    // as "john55" → "John 5:5" and must run before fuzzy STT matching, which
    // can otherwise misclassify an unspaced "john" as "2 John".
    const typedResults = parseBibleSearch(debouncedSearchQuery);
    if (typedResults.length > 0) {
      return typedResults.map((result) => ({
        ...result,
        kind: "reference" as const,
      }));
    }

    // 2. Fall back to spoken/STT normalization for inputs such as
    // "first samuel 17 45" → "1 Samuel 17:45".
    const normalized = normalizeScriptureReference(debouncedSearchQuery);
    if (!normalized) return [];

    return parseBibleSearch(normalized).map((result) => ({
      ...result,
      kind: "reference" as const,
    }));
  }, [debouncedSearchQuery]);

  // ── Concept-based search (e.g., "love", "faith", "hope") ──
  const conceptResults = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return [];
    if (isReferenceLikeBibleQuery(debouncedSearchQuery)) return [];

    const conceptRefs = getConceptVerses(debouncedSearchQuery);
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
        query: debouncedSearchQuery,
      });
    }

    return results;
  }, [debouncedSearchQuery]);

  useEffect(() => {
    const trimmed = debouncedSearchQuery.trim();
    setKeywordResults([]);
    setKeywordResultsQuery("");

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
        const matches = await searchBible(trimmed, activeBibleSearchTranslation, DOCK_KEYWORD_SEARCH_LIMIT);
        if (!cancelled) {
          setKeywordResults(matches);
          setKeywordResultsQuery(trimmed);
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
  }, [activeBibleSearchTranslation, debouncedSearchQuery, referenceResults.length]);

  const searchResults = useMemo<DockBibleSearchOption[]>(() => {
    const keywordMatches = keywordResultsQuery === debouncedSearchQuery.trim()
      ? keywordResults.map((result) => ({
      kind: "keyword" as const,
      book: result.book,
      chapter: result.chapter,
      verse: result.verse,
      endVerse: result.endVerse,
      label: `${result.book} ${result.chapter}:${result.endVerse && result.endVerse > result.verse
        ? `${result.verse}-${result.endVerse}`
        : result.verse} — ${activeBibleSearchTranslation}`,
      snippet: result.snippet,
      text: result.text,
      query: debouncedSearchQuery,
        }))
      : [];

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
  }, [activeBibleSearchTranslation, debouncedSearchQuery, keywordResults, keywordResultsQuery, referenceResults, conceptResults]);

  // Do not keep showing the previous query's results while a new query is
  // still being typed. The input remains immediate; search work waits here.
  const searchIsSettled = searchQuery === debouncedSearchQuery;
  const displayedSearchResults = searchIsSettled ? searchResults : [];

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
    setShowRecentSearches(val.trim().length === 0 && hasSavedSearches);
    setActiveIdx(-1);
  }, [hasSavedSearches]);

  // ── Pick a search result ──
  const handlePickResult = useCallback(
    async (result: DockBibleSearchOption) => {
      setRecentSearches(pushRecentBibleSearch(result.label));
      setSearchQuery("");
      setShowDropdown(false);
      setShowRecentSearches(false);
      setActiveIdx(-1);

      if (result.kind === "keyword" || result.kind === "concept") {
        const keywordOutputOptions = getDockBibleKeywordMatchOutputOptions(result, MAX_VERSE_LINES);
        const impliedLineCount = keywordOutputOptions.lineCount;
        setVerseLineCount(impliedLineCount);
        focusReference(result.book, result.chapter, result.verse);
        if (keywordMatchPushDirectlyToObs) {
          setKeywordActionResult(null);
          await goLiveVerse(result.book, result.chapter, result.verse, {
            translation: activeBibleSearchTranslation,
            lineCount: keywordOutputOptions.lineCount,
            rangeEndVerse: keywordOutputOptions.rangeEndVerse,
            pushComparePassages: true,
          });
          return;
        }
        setKeywordActionResult(result);
        return;
      } else if (result.chapter !== null && result.verse !== null) {
        const impliedLineCount = clampVerseLineCount(
          result.endVerse && result.endVerse > result.verse
            ? result.endVerse - result.verse + 1
            : 1,
        );
        setVerseLineCount(impliedLineCount);
        focusReference(result.book, result.chapter, result.verse);
        // A concrete Bible search result is an output action, not only a
        // navigation action. Open the matching chapter/verse and send the
        // selected passage through the same OBS path as a verse-row click.
        await goLiveVerse(result.book, result.chapter, result.verse, {
          lineCount: impliedLineCount,
          rangeEndVerse: result.endVerse ?? null,
          translation: activeBibleSearchTranslation,
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
    [
      activeColumnIndex,
      activeBibleSearchTranslation,
      focusReference,
      goLiveVerse,
      keywordMatchPushDirectlyToObs,
      stageVerse,
    ]
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

  const handleFavoriteClick = useCallback((favorite: DockFavoriteBibleSearch) => {
    const result = parseBibleSearch(favorite.reference)[0];
    setSearchQuery("");
    setShowRecentSearches(false);
    setShowDropdown(false);
    setActiveIdx(-1);
    if (result) {
      void handlePickResult({ ...result, kind: "reference" });
    }
  }, [handlePickResult]);

  const handleHistoryClick = useCallback((item: BibleHistoryItem) => {
    setShowHistoryDropdown(false);
    focusReference(item.book, item.chapter, item.verse);
  }, [focusReference]);

  const handleHistoryPreview = useCallback((item: BibleHistoryItem) => {
    setShowHistoryDropdown(false);
    void stageVerse(item.book, item.chapter, item.verse, {
      translation: activeTranslation,
      columnIndex: activeColumnIndex,
    });
  }, [activeColumnIndex, activeTranslation, stageVerse]);

  const handleHistorySendToObs = useCallback((item: BibleHistoryItem) => {
    setShowHistoryDropdown(false);
    void goLiveVerse(item.book, item.chapter, item.verse, {
      translation: activeTranslation,
      columnIndex: activeColumnIndex,
    });
  }, [activeColumnIndex, activeTranslation, goLiveVerse]);

  const openHistoryDropdown = useCallback(() => {
    setHistoryItems(getRecentBibleHistoryItems(loadBibleHistory()));
    setShowHistoryDropdown(true);
  }, []);

  // ── Keyboard navigation ──
  const handleClearVerse = useCallback(() => {
    setSelectedVerse(null);
    setVerseText(null);
    setActionError("");
    pendingScrollVerseRef.current = null;
    onStage(null);
    setBibleOverlayVisible(false);
    if (presentationLinkMode) return;
    ensureObsConnected().then(() => clearBibleFromConfiguredOutput()).catch((err) =>
      console.warn("[DockBibleTab] clearBible failed:", err)
    );
  }, [clearBibleFromConfiguredOutput, onStage, presentationLinkMode]);

  const handleToggleBibleVisibility = useCallback(() => {
    setActionError("");
    if (presentationLinkMode) {
      if (bibleOverlayVisible) {
        onStage(null);
        setBibleOverlayVisible(false);
      }
      return;
    }
    const run = async () => {
      await ensureObsConnected();

      if (bibleOverlayVisible) {
        await clearBibleFromConfiguredOutput();
        setBibleOverlayVisible(false);
        return;
      }

      const current = latestStagedRef.current;
      const data = current?.type === "bible"
        ? current.data as Parameters<typeof dockObsClient.pushBible>[0]
        : null;
      const mode = fullscreenOnlyMode
        ? "fullscreen"
        : data?.overlayMode === "lower-third" || data?.overlayMode === "fullscreen"
        ? data.overlayMode
        : overlayModeRef.current;

      if (!hasSceneRoute) {
        await dockObsClient.bringBibleOverlayForward(mode).catch(() => { });
      }
      if (data) {
        await pushBibleToConfiguredOutput({ ...data, overlayMode: mode });
      }
      setBibleOverlayVisible(true);
    };

    void run().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        console.warn("[DockBibleTab] toggle Bible visibility failed:", err);
        setActionError(message);
      }
    });
  }, [bibleOverlayVisible, clearBibleFromConfiguredOutput, fullscreenOnlyMode, hasSceneRoute, onStage, overlayMode, presentationLinkMode, pushBibleToConfiguredOutput]);

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
    if (!translationsLoaded || compareMode !== "translations" || !compareEnabled || !selectedBook || !selectedChapter || !selectedVerse) return;
    setActionError("");
    try {
      const lineCount = clampVerseLineCount(verseLineCount);
      const [selA, selB] = await Promise.all([
        resolveVerseSelection(selectedBook, selectedChapter, selectedVerse, translationA, lineCount),
        resolveVerseSelection(selectedBook, selectedChapter, selectedVerse, translationB, lineCount),
      ]);
      const refA = `${selectedBook} ${selectedChapter}:${selA.verseRange}`;
      const refB = `${selectedBook} ${selectedChapter}:${selB.verseRange}`;
      const liveOverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayModeRef.current;
      const theme = liveOverlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id;
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
        overlayMode: liveOverlayMode,
        theme,
        bibleThemeSettings: (
          liveOverlayMode === "fullscreen"
            ? effectiveSelectedBibleTheme.settings
            : effectiveSelectedLowerThirdTheme.settings
        ) as unknown as Record<string, unknown>,
        liveOverrides:
          liveOverlayMode === "fullscreen"
            ? (fullscreenLiveOverrides as Record<string, unknown> | null)
            : null,
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
      if (presentationLinkMode) {
        setBibleOverlayVisible(true);
        trackBiblePresent(selA.text);
        setShowComparePopover(false);
        return;
      }
      ensureObsConnected()
        .then(() => pushBibleToConfiguredOutput(stageData as unknown as DockBiblePushData))
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
    onStage,
    fullscreenOnlyMode,
    presentationLinkMode,
    compareLayout,
    compareMode,
    pushBibleToConfiguredOutput,
    translationsLoaded,
  ]);

  const handleSendComparePassagesToObs = useCallback(async () => {
    if (!translationsLoaded || compareMode !== "passages" || !compareEnabled) return;
    const readyPreviews = comparePassagePreviews.filter((preview) => (
      preview.parsed && preview.text && !preview.loading && !preview.error
    ));
    if (readyPreviews.length !== comparePassageDrafts.length || readyPreviews.length < MIN_COMPARE_PASSAGES) {
      setActionError(t("dock.compare.completePassages", "Enter at least two valid passages before sending to OBS."));
      return;
    }

    setActionError("");
    const lineCount = clampVerseLineCount(verseLineCount);
    const liveOverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayModeRef.current;
    const theme = liveOverlayMode === "fullscreen" ? effectiveSelectedBibleTheme.id : selectedLowerThirdTheme.id;
    const first = readyPreviews[0];
    if (!first.parsed) return;
    const columns = readyPreviews.map((preview) => {
      if (!preview.parsed) throw new Error(t("dock.compare.completePassages", "Enter at least two valid passages before sending to OBS."));
      return {
        book: preview.parsed.book,
        chapter: preview.parsed.chapter,
        verse: preview.parsed.verse,
        verseEnd: preview.verseEnd,
        verseRange: preview.verseRange,
        referenceLabel: preview.referenceLabel,
        translation: preview.draft.translation,
        verseText: preview.text,
      };
    });
    const stageData = {
      book: first.parsed.book,
      chapter: first.parsed.chapter,
      verse: first.parsed.verse,
      verseEnd: first.verseEnd,
      verseRange: first.verseRange,
      referenceLabel: first.referenceLabel,
      displayReferenceLabel: columns.map((column) => column.referenceLabel).join(" • "),
      referenceBaseLabel: first.referenceLabel,
      lineCount,
      translation: first.draft.translation,
      translationA: columns[0]?.translation,
      translationB: columns[1]?.translation,
      compareEnabled: true,
      compareMode: "passages" as const,
      compareLayout: "side-by-side" as const,
      verseText: first.text,
      overlayMode: liveOverlayMode,
      theme,
      bibleThemeSettings: (
        liveOverlayMode === "fullscreen"
          ? effectiveSelectedBibleTheme.settings
          : effectiveSelectedLowerThirdTheme.settings
      ) as unknown as Record<string, unknown>,
      liveOverrides:
        liveOverlayMode === "fullscreen"
          ? (fullscreenLiveOverrides as Record<string, unknown> | null)
          : null,
      reveal: true,
      _dockLive: true,
      compare: {
        enabled: true,
        mode: "passages" as const,
        layout: "side-by-side" as const,
        columns,
      },
    };
    onStage({
      type: "bible",
      label: columns.map((column) => column.referenceLabel).join(" • "),
      subtitle: first.text,
      data: stageData,
    });
    if (presentationLinkMode) {
      setBibleOverlayVisible(true);
      trackBiblePresent(first.text);
      setShowComparePopover(false);
      return;
    }
    ensureObsConnected()
      .then(() => pushBibleToConfiguredOutput(stageData as unknown as DockBiblePushData))
      .then(() => trackBiblePresent(first.text))
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
        if (!isTransient) {
          console.warn("[DockBibleTab] Compare passages push to OBS failed:", err);
          setActionError(message);
        } else {
          console.warn("[DockBibleTab] Compare passages push to OBS failed (transient):", message);
        }
      });
    setShowComparePopover(false);
  }, [
    compareEnabled,
    compareMode,
    comparePassageDrafts.length,
    comparePassagePreviews,
    effectiveSelectedBibleTheme.id,
    effectiveSelectedBibleTheme.settings,
    effectiveSelectedLowerThirdTheme.settings,
    fullscreenLiveOverrides,
    fullscreenOnlyMode,
    onStage,
    presentationLinkMode,
    pushBibleToConfiguredOutput,
    selectedLowerThirdTheme.id,
    t,
    verseLineCount,
    translationsLoaded,
  ]);

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

    // Fullscreen and lower-third keep separate typography/layout settings, but
    // a custom background should remain visible when the operator changes mode.
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
    overlayModeRef.current = nextMode;
    saveDockBibleOverlayMode(nextMode);
    setModeRefreshNonce((current) => current + 1);
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

  const handleToggleFavoritePassage = useCallback(async () => {
    if (!selectedPassageForFavorite) {
      return;
    }

    const passage = selectedPassageForFavorite;
    const reference = passage.reference;
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
    setFavoritePassages((current) => {
      if (nextIsFavorite) {
        return [passage, ...current.filter((item) => item.reference !== reference)];
      }
      return current.filter((item) => item.reference !== reference);
    });

    try {
      if (nextIsFavorite) {
        await addFavorite(passage);
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
      setFavoritePassages((current) => {
        if (nextIsFavorite) {
          return current.filter((item) => item.reference !== reference);
        }
        return current.some((item) => item.reference === reference)
          ? current
          : [passage, ...current];
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

      if (!showDropdown || displayedSearchResults.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((prev) => (prev < displayedSearchResults.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((prev) => (prev > 0 ? prev - 1 : displayedSearchResults.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const picked = displayedSearchResults[activeIdx >= 0 ? activeIdx : 0];
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
    [showDropdown, displayedSearchResults, activeIdx, handleClearVerse, handlePickResult]
  );

  const handleVerseClick = useCallback(
    (v: number, columnIndex: number, version: string) => {
      if (!selectedBook || !selectedChapter) return;
      setSelectedVerse(v);
      selectedVerseRef.current = v;
      pendingScrollVerseRef.current = null;

      if (compareEnabled && compareMode === "passages") {
        const nextReference: ParsedBiblePassageReference = {
          book: selectedBook,
          chapter: selectedChapter,
          verse: v,
          endVerse: null,
        };
        const activeDraft = comparePassageDrafts[activeComparePassageIndex];
        if (activeDraft) {
          setComparePassageDrafts((current) => current.map((draft, index) => (
            index === activeComparePassageIndex
              ? { ...draft, reference: formatBiblePassageReference(nextReference) }
              : draft
          )));
        }
        activateComparePassage(activeComparePassageIndex, nextReference);
        return;
      }

      void goLiveVerse(selectedBook, selectedChapter, v, {
        translation: version,
        columnIndex,
        reveal: false,
      });
    },
    [activateComparePassage, activeComparePassageIndex, compareEnabled, compareMode, comparePassageDrafts, goLiveVerse, selectedBook, selectedChapter],
  );

  const showCopyFeedback = useCallback((status: "success" | "error") => {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
    setCopyFeedback(status);
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimerRef.current = null;
    }, 1600);
  }, []);

  const handleVerseDoubleClick = useCallback(async (
    event: React.MouseEvent,
    verseNumber: number,
    primaryText: string,
    secondaryText?: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedBook || !selectedChapter) return;

    const reference = `${selectedBook} ${selectedChapter}:${verseNumber}`;
    const copyBlocks = compareEnabled && secondaryText
      ? [
        { reference, translation: translationA, text: primaryText },
        { reference, translation: translationB, text: secondaryText },
      ]
      : [{ reference, translation: activeTranslation, text: primaryText }];
    const copied = await copyTextToClipboard(buildBibleVerseClipboardText(copyBlocks));
    showCopyFeedback(copied ? "success" : "error");
  }, [activeTranslation, compareEnabled, selectedBook, selectedChapter, showCopyFeedback, translationA, translationB]);

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
    manualReferenceSelectionRef.current = true;
    setIsBookDropdownOpen(false);
    setIsChapterDropdownOpen(false);
    setIsVerseDropdownOpen(false);
    const nextChapter = Math.min(selectedChapter ?? 1, BOOK_CHAPTERS[book] ?? 1);
    setSelectedBook(book);
    selectedChapterRef.current = nextChapter;
    setSelectedChapter(nextChapter);
    setSelectedVerse(null);
    setHighlightVerse(null);
    setActionError("");
    pendingScrollVerseRef.current = null;
  }, [selectedChapter]);

  const handleBookJump = useCallback((delta: -1 | 1) => {
    if (!selectedBook) return;
    const currentBookIndex = BIBLE_BOOK_ORDER.indexOf(selectedBook);
    if (currentBookIndex < 0) return;
    const nextBook = BIBLE_BOOK_ORDER[currentBookIndex + delta];
    if (!nextBook) return;
    handleBookSelect(nextBook);
  }, [handleBookSelect, selectedBook]);

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
    manualReferenceSelectionRef.current = true;
    setIsBookDropdownOpen(false);
    setIsChapterDropdownOpen(false);
    setIsVerseDropdownOpen(false);
    if (chapter === selectedChapter) return;
    selectedChapterRef.current = chapter;
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
    manualThemeSettingsSelectionRef.current = true;
    setSelectedBibleTheme(theme);
    selectedBibleThemeRef.current = theme;
    const nextFullscreenQuickSettings = extractThemeQuickSettingsForOverlayMode(theme, "fullscreen");
    setFullscreenQuickThemeSettings(nextFullscreenQuickSettings);
    setSavedFullscreenQuickThemeSettings(nextFullscreenQuickSettings);

    if (!fullscreenOnlyMode && themeSupportsBibleOverlayMode(theme, "lower-third")) {
      const nextLowerThirdQuickSettings = extractThemeQuickSettingsForOverlayMode(theme, "lower-third");
      setSelectedLowerThirdTheme(theme);
      selectedLowerThirdThemeRef.current = theme;
      setLowerThirdQuickThemeSettings(nextLowerThirdQuickSettings);
      setSavedLowerThirdQuickThemeSettings(nextLowerThirdQuickSettings);
      setLowerThirdQuickThemeSettingsLinkedToFullscreen(false);
    }

    handleOverlayModeChange("fullscreen");
  }, [fullscreenOnlyMode, handleOverlayModeChange]);

  const handleSelectLowerThirdTheme = useCallback((theme: BibleTheme) => {
    manualThemeSettingsSelectionRef.current = true;
    setSelectedLowerThirdTheme(theme);
    selectedLowerThirdThemeRef.current = theme;
    const nextLowerThirdQuickSettings = extractThemeQuickSettingsForOverlayMode(theme, "lower-third");
    setLowerThirdQuickThemeSettings(nextLowerThirdQuickSettings);
    setSavedLowerThirdQuickThemeSettings(nextLowerThirdQuickSettings);
    setLowerThirdQuickThemeSettingsLinkedToFullscreen(false);

    if (themeSupportsBibleOverlayMode(theme, "fullscreen")) {
      const nextFullscreenQuickSettings = extractThemeQuickSettingsForOverlayMode(theme, "fullscreen");
      setSelectedBibleTheme(theme);
      selectedBibleThemeRef.current = theme;
      setFullscreenQuickThemeSettings(nextFullscreenQuickSettings);
      setSavedFullscreenQuickThemeSettings(nextFullscreenQuickSettings);
    }

    handleOverlayModeChange("lower-third");
  }, [handleOverlayModeChange]);

  // Each mode keeps its own selected theme so switching to lower-third does
  // not accidentally keep reusing a fullscreen-only theme.
  const activeThemePickerProps =
    isSceneProfileActive
      ? {
        selectedThemeId: activeQuickEditThemeId,
        // Scene profiles commit the chosen theme through the save context so
        // selecting a routed scene never changes General.
        onSelect: (_theme: BibleTheme) => undefined,
        label: quickEditOverlayMode === "fullscreen" ? t("bible.fullscreenTheme") : t("bible.lowerThirdTheme"),
        templateType: quickEditOverlayMode,
      }
      : fullscreenOnlyMode || overlayMode === "fullscreen"
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
    const effectiveOverlayMode = fullscreenOnlyMode ? "fullscreen" : overlayMode;
    return extractThemeQuickSettingsForOverlayMode(theme, effectiveOverlayMode);
  }, [fullscreenOnlyMode, overlayMode]);
  const navigateVerse = useCallback(
    async (delta: 1 | -1) => {
      if (compareEnabled && compareMode === "passages") {
        handleComparePassageNavigation(delta);
        return;
      }
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
      compareEnabled,
      compareMode,
      goLiveVerse,
      handleComparePassageNavigation,
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

  const handleChapterJump = useCallback((delta: -1 | 1) => {
    if (!selectedBook) return;
    const currentChapter = selectedChapterRef.current ?? selectedChapter;
    if (!currentChapter) return;
    const maxChapter = BOOK_CHAPTERS[selectedBook] ?? currentChapter;
    const nextChapter = currentChapter + delta;
    if (nextChapter < 1 || nextChapter > maxChapter) return;

    setIsBookDropdownOpen(false);
    setIsChapterDropdownOpen(false);
    setIsVerseDropdownOpen(false);
    manualReferenceSelectionRef.current = true;
    selectedChapterRef.current = nextChapter;
    setSelectedChapter(nextChapter);
    setSelectedVerse(null);
    selectedVerseRef.current = null;
    setHighlightVerse(null);
    setActionError("");
    pendingScrollVerseRef.current = null;
    verseGridRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    persistDockBiblePreferencesNow({ selectedChapter: nextChapter });
  }, [persistDockBiblePreferencesNow, selectedBook, selectedChapter]);

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
      if (!isDockTabVisible(containerRef.current)) return;
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

      if (event.shiftKey && event.key === "ArrowRight") {
        event.preventDefault();
        handleBookJump(1);
      } else if (event.shiftKey && event.key === "ArrowLeft") {
        event.preventDefault();
        handleBookJump(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleChapterJump(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleChapterJump(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        void navigateVerse(1);
      } else if (event.key === "ArrowUp") {
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
  }, [handleBookJump, handleChapterJump, handleClearVerse, navigateVerse, selectedBook, selectedChapter, selectedVerse, sendSelectedVerseToShow]);

  const currentChapterLabel =
    selectedBook && selectedChapter ? `${selectedBook} ${selectedChapter}` : t("bible.defaultTitle");
  const chapterCount = selectedBook ? BOOK_CHAPTERS[selectedBook] ?? 0 : 0;
  const canGoPreviousChapter = Boolean(selectedBook && selectedChapter && selectedChapter > 1);
  const canGoNextChapter = Boolean(selectedBook && selectedChapter && chapterCount > 0 && selectedChapter < chapterCount);
  const activePassage = chapterPassages[activeColumnIndex] ?? null;
  const activeChapterError = chapterErrors[activeColumnIndex] ?? "";
  const comparePassageA = comparePassages.translationA;
  const comparePassageB = comparePassages.translationB;
  const isComparePassageMode = compareEnabled && compareMode === "passages";
  const activeComparePassagePreview = comparePassagePreviews[activeComparePassageIndex] ?? null;
  const compareVerseRows = compareEnabled && !isComparePassageMode
    ? (comparePassageA?.verses ?? activePassage?.verses ?? [])
    : (activePassage?.verses ?? []);
  const readerLoading = isComparePassageMode
    ? comparePassagePreviews.some((preview) => preview.loading)
    : compareEnabled ? compareChapterLoading : chapterLoading;
  const readerError = isComparePassageMode
    ? (comparePassagePreviews.find((preview) => Boolean(preview.error))?.error ?? "")
    : compareEnabled
    ? (compareChapterErrors.find((message) => Boolean(message)) ?? "")
    : activeChapterError;
  const hasReaderVerses = isComparePassageMode
    ? comparePassagePreviews.some((preview) => Boolean(preview.text))
    : compareVerseRows.length > 0;
  const compareDisplayLabel = compareEnabled
    ? isComparePassageMode
      ? t("dock.compare.passagesLabel", "Compare Passages")
      : `${translationA} vs ${translationB}`
    : activeTranslation;
  const currentVerseNumber = isComparePassageMode
    ? activeComparePassagePreview?.parsed?.verse ?? selectedVerse ?? null
    : selectedVerse ?? activePassage?.verses[0]?.verse ?? null;
  const currentReferenceLabel = isComparePassageMode
    ? activeComparePassagePreview?.referenceLabel
      ?? comparePassageDrafts[activeComparePassageIndex]?.reference
      ?? t("dock.compare.passagesLabel", "Compare Passages")
    : selectedBook && selectedChapter
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
  const referencePreviewVerseRange = currentVerseNumber
    ? `${currentVerseNumber}${verseLineCount > 1
      ? `-${Math.min(currentVerseNumber + verseLineCount - 1, verseCount)}`
      : ""}`
    : "1";
  const referencePreviewLabel = selectedBook && selectedChapter
    ? buildBibleReferenceDisplayLabel(
      selectedBook,
      selectedChapter,
      referencePreviewVerseRange,
      activeTranslation,
      referenceFormat,
      referenceVersionVisible,
    )
    : buildBibleReferenceDisplayLabel("Genesis", 1, "1", activeTranslation, referenceFormat, referenceVersionVisible);
  const referenceFormatOptions: Array<{ value: BibleReferenceFormat; label: string; sample: string }> = [
    {
      value: "full",
      label: t("bible.referenceFormatFull", "Full"),
      sample: buildBibleReferenceDisplayLabel("Genesis", 1, "1", activeTranslation, "full", referenceVersionVisible),
    },
    {
      value: "short",
      label: t("bible.referenceFormatShort", "Short"),
      sample: buildBibleReferenceDisplayLabel("Genesis", 1, "1", activeTranslation, "short", referenceVersionVisible),
    },
    {
      value: "hidden",
      label: t("bible.referenceFormatHidden", "Off"),
      sample: buildBibleReferenceDisplayLabel("Genesis", 1, "1", activeTranslation, "hidden", referenceVersionVisible) || t("common.hidden", "Hidden"),
    },
  ];

  const refreshCurrentReferenceDisplay = useCallback((format: BibleReferenceFormat, versionVisible: boolean) => {
    if (!selectedBook || !selectedChapter || !selectedVerse) return;
    void goLiveVerse(selectedBook, selectedChapter, selectedVerse, {
      translation: activeTranslation,
      columnIndex: activeColumnIndex,
      reveal: false,
      lineCount: verseLineCount,
      referenceFormat: format,
      referenceVersionVisible: versionVisible,
      preserveComparePassages: true,
    });
  }, [
    activeColumnIndex,
    activeTranslation,
    goLiveVerse,
    selectedBook,
    selectedChapter,
    selectedVerse,
    verseLineCount,
  ]);

  const handleReferenceFormatChange = useCallback((format: BibleReferenceFormat) => {
    setReferenceFormat(format);
    persistDockBiblePreferencesNow({ referenceFormat: format });
    refreshCurrentReferenceDisplay(format, referenceVersionVisible);
  }, [persistDockBiblePreferencesNow, referenceVersionVisible, refreshCurrentReferenceDisplay]);

  const handleReferenceVersionVisibleChange = useCallback((visible: boolean) => {
    setReferenceVersionVisible(visible);
    persistDockBiblePreferencesNow({ referenceVersionVisible: visible });
    refreshCurrentReferenceDisplay(referenceFormat, visible);
  }, [persistDockBiblePreferencesNow, referenceFormat, refreshCurrentReferenceDisplay]);

  const handleReferenceSettingsSave = useCallback((format: BibleReferenceFormat, versionVisible: boolean) => {
    setReferenceFormat(format);
    setReferenceVersionVisible(versionVisible);
    persistDockBiblePreferencesNow({
      referenceFormat: format,
      referenceVersionVisible: versionVisible,
    });
    refreshCurrentReferenceDisplay(format, versionVisible);
  }, [persistDockBiblePreferencesNow, refreshCurrentReferenceDisplay]);

  const referenceSettingsPopover = (
    <div className="dock-bible-reference-popover" role="dialog" aria-label={t("bible.referenceSettings", "Reference display settings")}>
      <div className="dock-bible-reference-popover__header">
        {t("bible.referenceDisplay", "Reference display")}
      </div>
      <div className="dock-bible-reference-popover__section">
        <div className="dock-bible-reference-popover__label">
          {t("bible.referenceFormat", "Reference")}
        </div>
        <div className="dock-bible-reference-options" role="group" aria-label={t("bible.referenceFormat", "Reference")}>
          {referenceFormatOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`dock-bible-reference-option${referenceFormat === option.value ? " dock-bible-reference-option--active" : ""}`}
              onClick={() => handleReferenceFormatChange(option.value)}
              aria-pressed={referenceFormat === option.value}
            >
              <span>{option.label}</span>
              <small>{option.sample}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="dock-bible-reference-popover__toggle-row">
        <div>
          <div className="dock-bible-reference-popover__label">
            {t("bible.showBibleVersion", "Show Bible version")}
          </div>
          <div className="dock-bible-reference-popover__hint">
            {activeTranslation}
          </div>
        </div>
        <button
          type="button"
          className={`dtb-toggle${referenceVersionVisible ? " dtb-toggle--on" : ""}`}
          onClick={() => handleReferenceVersionVisibleChange(!referenceVersionVisible)}
          role="switch"
          aria-checked={referenceVersionVisible}
          aria-label={t("bible.showBibleVersion", "Show Bible version")}
        >
          <span className="dtb-toggle__knob" />
        </button>
      </div>
      <div className="dock-bible-reference-preview">
        <span>{t("bible.referencePreview", "Preview")}</span>
        <strong>{referencePreviewLabel || t("common.hidden", "Hidden")}</strong>
      </div>
    </div>
  );

  const referenceDisplayTrigger = (
    <div className="dock-bible-reference-trigger dock-bible-reference-trigger--bottom" ref={referencePopoverRef}>
      <button
        type="button"
        className={`dock-bible-reference-trigger__btn${showReferencePopover ? " dock-bible-reference-trigger__btn--active" : ""}`}
        onClick={() => {
          setShowComparePopover(false);
          setShowReferencePopover((prev) => !prev);
        }}
        title={t("bible.referenceSettings", "Reference display settings")}
        aria-label={t("bible.referenceSettings", "Reference display settings")}
        aria-expanded={showReferencePopover}
      >
        <Icon name="tag" size={14} />
        <span>{t("bible.referenceFormat", "Reference")}</span>
      </button>
      {showReferencePopover && referenceSettingsPopover}
    </div>
  );

  if (!preferencesHydrated || !translationsLoaded) {
    return (
      <div className="dock-tab-loading" role="status" aria-live="polite">
        Loading saved Bible settings…
      </div>
    );
  }

  return (
    <BibleDockContainer
      ref={containerRef}
      isCompact={isShortHeight}
      isNarrowWidth={isNarrowWidth}
      isTopbarExpanded={isTopbarExpanded}
      setIsTopbarExpanded={setIsTopbarExpanded}
      searchPlacement={searchPlacement}
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
      canGoPreviousChapter={canGoPreviousChapter}
      canGoNextChapter={canGoNextChapter}
      onPreviousChapter={() => handleChapterJump(-1)}
      onNextChapter={() => handleChapterJump(1)}
      onVersionChange={(version) => handleQuickVersionChange(activeColumnIndex, version)}
      onGoToChapter={handleGoToChapter}
      abbreviateBook={abbreviateBibleBook}
      BOOK_CHAPTERS={BOOK_CHAPTERS}
      compactActions={
        isShortHeight ? ((browseExpanded, onBrowseToggle) => (
          <div className="dock-bible-actions__compare-group" ref={comparePopoverRef}>
              <button
                type="button"
                className="dock-bible-actions__overflow"
                onClick={() => setShowBibleActionsMenu((prev) => !prev)}
                aria-label={t("common.moreActions", "More actions")}
                aria-expanded={showBibleActionsMenu}
                aria-haspopup="menu"
                title={t("common.moreActions", "More actions")}
              >
                <Icon name="more_vert" size={15} />
              </button>
              {showBibleActionsMenu && (
                <div className="dock-bible-actions__menu" role="menu">
                  <button
                    type="button"
                    className="dock-bible-actions__menu-item"
                    role="menuitem"
                    data-dock-close-overflow="true"
                    onClick={() => {
                      setShowBibleActionsMenu(false);
                      setShowComparePopover(false);
                      setShowReferencePopover(false);
                      onBrowseToggle();
                    }}
                  >
                    <Icon name="menu_book" size={14} />
                    <span>
                      {browseExpanded ? t("bible.closeBibleBrowser") : t("bible.browseBible")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="dock-bible-actions__menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShowBibleActionsMenu(false);
                      setShowReferencePopover(false);
                      setShowComparePopover(true);
                    }}
                  >
                    <Icon name="swap_horiz" size={14} />
                    <span>{t("dock.compare.toggle", "Compare Translations")}</span>
                  </button>
                </div>
              )}
            {showComparePopover && (
              <div className="dock-bible-compare-popover dock-bible-compact-actions__popover">
                <div className="dock-bible-compare-popover__header">{t("dock.compare.title", "Compare Translations")}</div>
                <div className="dock-bible-compare-tabs" role="tablist" aria-label={t("dock.compare.modes", "Compare modes")}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={compareMode === "translations"}
                    className={`dock-bible-compare-tabs__tab${compareMode === "translations" ? " dock-bible-compare-tabs__tab--active" : ""}`}
                    onClick={() => handleCompareModeChange("translations")}
                  >
                    {t("dock.compare.translationsTab", "Translations")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={compareMode === "passages"}
                    className={`dock-bible-compare-tabs__tab${compareMode === "passages" ? " dock-bible-compare-tabs__tab--active" : ""}`}
                    onClick={() => handleCompareModeChange("passages")}
                  >
                    {t("dock.compare.passagesTab", "Passages")}
                  </button>
                </div>
                {compareMode === "translations" ? (
                <>
                <div className="dock-bible-compare-popover__section">
                  <div className="dock-bible-compare-popover__toggle-row">
                    <div className="dock-bible-compare-popover__toggle-copy">
                      <div className="dock-bible-compare-popover__label">{t("dock.compare.enable", "Enable Compare Translations")}</div>
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
                <div className="dock-bible-compare-popover__translation-pair">
                  <div className="dock-bible-compare-popover__row">
                    <label className="dock-bible-compare-popover__label">{t("dock.compare.translationA", "Translation A")}</label>
                    <DockCompactTranslationSelect
                      value={translationA}
                      options={availableTranslations}
                      onChange={handleTranslationAChange}
                      disabled={!translationsLoaded}
                      ariaLabel={t("dock.compare.translationA", "Translation A")}
                    />
                  </div>
                  <div className="dock-bible-compare-popover__row">
                    <label className="dock-bible-compare-popover__label">{t("dock.compare.translationB", "Translation B")}</label>
                    <DockCompactTranslationSelect
                      value={translationB}
                      options={availableTranslations}
                      onChange={handleTranslationBChange}
                      disabled={!translationsLoaded}
                      ariaLabel={t("dock.compare.translationB", "Translation B")}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="dock-bible-compare-popover__send"
                  onClick={() => void handleSendCompareToObs()}
                  disabled={!translationsLoaded || !compareEnabled || !selectedBook || !selectedChapter || !selectedVerse}
                  title={t("common.sendToObs", "Send to OBS")}
                >
                  <Icon name="cast" size={13} />
                  {t("common.sendToObs", "Send to OBS")}
                </button>
                </>
                ) : (
                  <DockBibleComparePassageControls
                    compareEnabled={compareEnabled}
                    drafts={comparePassageDrafts}
                    previews={comparePassagePreviews}
                    activeIndex={activeComparePassageIndex}
                    navigationMode={comparePassageNavigation}
                    availableTranslations={availableTranslations}
                    onToggleCompare={handleCompareEnabledChange}
                    onDraftReferenceChange={handleComparePassageReferenceChange}
                    onDraftTranslationChange={handleComparePassageTranslationChange}
                    onActiveIndexChange={activateComparePassage}
                    onNavigationModeChange={setComparePassageNavigation}
                    onRemovePassage={handleRemoveComparePassage}
                    onSendToObs={() => void handleSendComparePassagesToObs()}
                  />
                )}
              </div>
            )}
          </div>
        )) : undefined
      }
      headerActions={
        (browseExpanded, onBrowseToggle) => (
        <div className={`dock-bible-header-actions${searchPlacement === "top" ? " dock-bible-header-actions--top" : ""}`}>
          {searchPlacement === "top" && (
            <button
              type="button"
              className="dock-bible-actions__top-btn"
              onClick={() => {
                setShowBibleActionsMenu(false);
                setShowComparePopover(false);
                setShowReferencePopover(false);
                onBrowseToggle();
              }}
              aria-expanded={browseExpanded}
              aria-label={browseExpanded ? t("bible.closeBibleBrowser") : t("bible.browseBible")}
              title={browseExpanded ? t("bible.closeBibleBrowser") : t("bible.browseBible")}
            >
              <Icon name="menu_book" size={14} />
              <span>{browseExpanded ? t("bible.closeBibleBrowser") : t("bible.browseBible")}</span>
            </button>
          )}
          <div className="dock-bible-compare-trigger" ref={comparePopoverRef}>
            <button
              type="button"
              className={searchPlacement === "top" ? "dock-bible-actions__top-btn" : "dock-bible-actions__overflow"}
              onClick={() => {
                if (searchPlacement === "top") {
                  setShowBibleActionsMenu(false);
                  setShowReferencePopover(false);
                  setShowComparePopover((prev) => !prev);
                  return;
                }
                setShowBibleActionsMenu((prev) => !prev);
              }}
              aria-label={searchPlacement === "top"
                ? t("dock.compare.toggle", "Compare Translations")
                : t("common.moreActions", "More actions")}
              aria-expanded={searchPlacement === "top" ? showComparePopover : showBibleActionsMenu}
              aria-haspopup={searchPlacement === "top" ? "dialog" : "menu"}
              title={searchPlacement === "top"
                ? t("dock.compare.toggle", "Compare Translations")
                : t("common.moreActions", "More actions")}
            >
              <Icon name={searchPlacement === "top" ? "swap_horiz" : "more_vert"} size={15} />
              {searchPlacement === "top" && (
                <span>{t("dock.compare.toggle", "Compare Translations")}</span>
              )}
            </button>
            {searchPlacement !== "top" && showBibleActionsMenu && (
              <div className="dock-bible-actions__menu" role="menu">
                <button
                  type="button"
                  className="dock-bible-actions__menu-item"
                  role="menuitem"
                  data-dock-close-overflow="true"
                  onClick={() => {
                    setShowBibleActionsMenu(false);
                    setShowComparePopover(false);
                    setShowReferencePopover(false);
                    onBrowseToggle();
                  }}
                >
                  <Icon name="menu_book" size={14} />
                  <span>
                    {browseExpanded ? t("bible.closeBibleBrowser") : t("bible.browseBible")}
                  </span>
                </button>
                <button
                  type="button"
                  className="dock-bible-actions__menu-item"
                  role="menuitem"
                  onClick={() => {
                    setShowBibleActionsMenu(false);
                    setShowReferencePopover(false);
                    setShowComparePopover(true);
                  }}
                >
                  <Icon name="swap_horiz" size={14} />
                  <span>{t("dock.compare.toggle", "Compare Translations")}</span>
                </button>
              </div>
            )}
            {showComparePopover && (
              <div className="dock-bible-compare-popover">
                <div className="dock-bible-compare-popover__header">{t("dock.compare.title", "Compare Translations")}</div>
                <div className="dock-bible-compare-tabs" role="tablist" aria-label={t("dock.compare.modes", "Compare modes")}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={compareMode === "translations"}
                    className={`dock-bible-compare-tabs__tab${compareMode === "translations" ? " dock-bible-compare-tabs__tab--active" : ""}`}
                    onClick={() => handleCompareModeChange("translations")}
                  >
                    {t("dock.compare.translationsTab", "Translations")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={compareMode === "passages"}
                    className={`dock-bible-compare-tabs__tab${compareMode === "passages" ? " dock-bible-compare-tabs__tab--active" : ""}`}
                    onClick={() => handleCompareModeChange("passages")}
                  >
                    {t("dock.compare.passagesTab", "Passages")}
                  </button>
                </div>
                {compareMode === "translations" ? (
                <>
                <div className="dock-bible-compare-popover__section">
                  <div className="dock-bible-compare-popover__toggle-row">
                    <div className="dock-bible-compare-popover__toggle-copy">
                      <div className="dock-bible-compare-popover__label">{t("dock.compare.enable", "Enable Compare Translations")}</div>
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
                <div className="dock-bible-compare-popover__translation-pair">
                  <div className="dock-bible-compare-popover__row">
                    <label className="dock-bible-compare-popover__label">{t("dock.compare.translationA", "Translation A")}</label>
                    <DockCompactTranslationSelect
                      value={translationA}
                      options={availableTranslations}
                      onChange={handleTranslationAChange}
                      disabled={!translationsLoaded}
                      ariaLabel={t("dock.compare.translationA", "Translation A")}
                    />
                  </div>
                  <div className="dock-bible-compare-popover__row">
                    <label className="dock-bible-compare-popover__label">{t("dock.compare.translationB", "Translation B")}</label>
                    <DockCompactTranslationSelect
                      value={translationB}
                      options={availableTranslations}
                      onChange={handleTranslationBChange}
                      disabled={!translationsLoaded}
                      ariaLabel={t("dock.compare.translationB", "Translation B")}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="dock-bible-compare-popover__send"
                  onClick={() => void handleSendCompareToObs()}
                  disabled={!translationsLoaded || !compareEnabled || !selectedBook || !selectedChapter || !selectedVerse}
                  title={t("common.sendToObs", "Send to OBS")}
                >
                  <Icon name="cast" size={13} />
                  {t("common.sendToObs", "Send to OBS")}
                </button>
                </>
                ) : (
                  <DockBibleComparePassageControls
                    compareEnabled={compareEnabled}
                    drafts={comparePassageDrafts}
                    previews={comparePassagePreviews}
                    activeIndex={activeComparePassageIndex}
                    navigationMode={comparePassageNavigation}
                    availableTranslations={availableTranslations}
                    onToggleCompare={handleCompareEnabledChange}
                    onDraftReferenceChange={handleComparePassageReferenceChange}
                    onDraftTranslationChange={handleComparePassageTranslationChange}
                    onActiveIndexChange={activateComparePassage}
                    onNavigationModeChange={setComparePassageNavigation}
                    onRemovePassage={handleRemoveComparePassage}
                    onSendToObs={() => void handleSendComparePassagesToObs()}
                  />
                )}
              </div>
            )}
          </div>
        </div>
        )
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
                  else {
                    const nextFavoriteHistorySearches = getFavoriteBibleHistoryItems();
                    setFavoriteHistorySearches(nextFavoriteHistorySearches);
                    setShowRecentSearches(
                      recentSearches.length > 0
                      || favoritePassages.length > 0
                      || nextFavoriteHistorySearches.length > 0,
                    );
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="dock-search__clear"
                  onClick={() => {
                    setSearchQuery("");
                    setShowDropdown(false);
                    setShowRecentSearches(hasSavedSearches);
                  }}
                  aria-label={t("bible.clearSearchShort")}
                  title={t("bible.clearSearchShort")}
                >
                  <Icon name="close" size={13} />
                </button>
              )}

              {showDropdown && displayedSearchResults.length > 0 && (
                <div className="dock-search-dropdown">
                  {displayedSearchResults.map((result, i) => (
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

              {showRecentSearches && !searchQuery.trim() && (
                <div className="dock-search-dropdown dock-search-dropdown--recent">
                  {recentSearches.length > 0 && (
                    <>
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
                    </>
                  )}
                  {favoriteSearches.length > 0 && (
                    <>
                      <div className="dock-search-dropdown__heading">{t("bible.favorites", "Favorites")}</div>
                      {favoriteSearches.map((favorite) => (
                        <button
                          type="button"
                          key={favorite.reference}
                          className="dock-search-dropdown__item dock-search-dropdown__item--favorite"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleFavoriteClick(favorite)}
                          title={formatDockFavoriteBibleSearch(favorite)}
                        >
                          <Icon name="star" size={13} style={{ opacity: 0.7 }} />
                          <span className="dock-search-dropdown__content">
                            <span className="dock-search-dropdown__label">
                              {formatDockFavoriteBibleSearch(favorite)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}

              {showDropdown && searchQuery.trim() && displayedSearchResults.length === 0 && (
                <div className="dock-search-dropdown">
                  <div className="dock-search-dropdown__empty">
                    {!searchIsSettled || isKeywordSearching
                      ? t("bible.searching")
                      : t("bible.noMatches", { query: searchQuery })}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null
      }
      children={(bottomSearchPanel, bottomToolbarActions) => (
        <>
      <section
        ref={quickActionsContainerRef}
        className="dock-console-panel dock-console-panel--workspace"
        data-toolbar-collapsed={toolbarCollapsed || undefined}
      >
        <div
          className="dock-bible-reader"
          ref={verseGridRef}
          onClick={handleVerseRowDelegated}
          onKeyDown={handleVerseRowDelegated}
        >
          {hasReaderVerses && (
            <div className="dock-bible-reader__ref-header">
              <div className="dock-bible-reader__ref-header-start">
                <span className="dock-bible-reader__ref-header-label">{t("bible.reading")}</span>
              </div>
              <span className="dock-bible-reader__ref-header-reference">{currentReferenceLabel}</span>
              {compareEnabled ? (
                <span className="dock-bible-reader__ref-header-translation dock-bible-reader__ref-header-translation--compare">
                  {compareDisplayLabel}
                </span>
              ) : (
                <span className="dock-bible-reader__ref-header-translation">{activeTranslation}</span>
              )}
              <div className="dock-bible-reader__ref-header-actions">
                <button
                  type="button"
                  className={`dock-favorites dock-bible-reader__ref-header-fav${isCurrentPassageFavorite ? " dock-bible-reader__ref-header-fav--active" : ""}`}
                  onClick={handleToggleFavoritePassage}
                  disabled={!selectedPassageForFavorite}
                  title={isCurrentPassageFavorite ? t("bible.favRemove") : t("bible.favAdd")}
                >
                  <Icon name={isCurrentPassageFavorite ? "star" : "star_border"} size={12} />
                </button>
                <div className="dock-bible-reader__ref-header-history" ref={historyPopoverRef}>
                  <button
                    type="button"
                    className="dock-bible-reader__ref-header-history-btn"
                    onClick={openHistoryDropdown}
                    title={t("bible.history", "History")}
                  >
                    <Icon name="history" size={12} />
                  </button>
                  {showHistoryDropdown && historyItems.length > 0 && (
                    <div className="dock-bible-reader__history-dropdown">
                      {historyItems.map((item) => (
                        <div
                          key={item.id}
                          className="dock-bible-reader__history-item"
                        >
                          <button
                            type="button"
                            className="dock-bible-reader__history-view"
                            onClick={() => handleHistoryClick(item)}
                            aria-label={`${item.reference}: ${t("bible.view", "View")}`}
                            title={`${item.reference} — ${t("bible.view", "View")}`}
                          >
                            <span className="dock-bible-reader__history-copy">
                              <span className="dock-bible-reader__history-ref">{item.reference}</span>
                              <span className="dock-bible-reader__history-text">{getHistoryVersePreview(item.verseText)}</span>
                            </span>
                          </button>
                          <div className="dock-bible-reader__history-actions">
                            <button
                              type="button"
                              className="dock-btn dock-btn--ghost dock-btn--compact dock-bible-reader__history-action"
                              onClick={() => handleHistoryPreview(item)}
                              aria-label={`${t("common.preview", "Preview")} ${item.reference}`}
                              title={t("common.preview", "Preview")}
                            >
                              {t("common.preview", "Preview")}
                            </button>
                            <button
                              type="button"
                              className="dock-btn dock-btn--primary dock-btn--compact dock-bible-reader__history-action"
                              onClick={() => handleHistorySendToObs(item)}
                              aria-label={`${t("common.sendToObs", "Send to OBS")} ${item.reference}`}
                              title={t("common.sendToObs", "Send to OBS")}
                            >
                              {t("common.sendToObs", "Send to OBS")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {readerLoading && !hasReaderVerses && (
            <div className="dock-console-placeholder">
              {t("common.loading")} {isComparePassageMode ? t("dock.compare.passagesLabel", "Compare Passages") : `${currentChapterLabel}...`}
            </div>
          )}

          {readerLoading && readerError && !hasReaderVerses && (
            <div className="dock-action-error dock-action-error--console">
              <Icon name="warning" size={14} />
              <span style={{ flex: 1 }}>{readerError}</span>
            </div>
          )}

          {!readerLoading && !hasReaderVerses && !readerError && (
            <div className="dock-console-placeholder">
              {isComparePassageMode
                ? t("dock.compare.addTwoPassages", "Add two valid passages in Compare Passages to preview them here.")
                : t("bible.noVersesAvailable")}
            </div>
          )}

          {isComparePassageMode ? (
            <div className="dock-bible-passage-reader">
              <div className="dock-bible-passage-reader__toolbar">
                <button
                  type="button"
                  className="dock-bible-reader__chapter-nav-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleComparePassageNavigation(-1);
                  }}
                  disabled={!comparePassagePreviews.some((preview) => Boolean(preview.parsed))}
                  title={t("bible.previousVerse", "Previous verse")}
                  aria-label={t("bible.previousVerse", "Previous verse")}
                >
                  <Icon name="chevron_left" size={14} />
                </button>
                <span className="dock-bible-passage-reader__toolbar-label">
                  {comparePassageNavigation === "linked"
                    ? t("dock.compare.linkedNavigationShort", "Linked navigation")
                    : t("dock.compare.independentNavigationShort", "Active passage only")}
                </span>
                <button
                  type="button"
                  className="dock-bible-reader__chapter-nav-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleComparePassageNavigation(1);
                  }}
                  disabled={!comparePassagePreviews.some((preview) => Boolean(preview.parsed))}
                  title={t("bible.nextVerse", "Next verse")}
                  aria-label={t("bible.nextVerse", "Next verse")}
                >
                  <Icon name="chevron_right" size={14} />
                </button>
              </div>
              <div className="dock-bible-passage-reader__grid">
                {comparePassagePreviews.map((preview, index) => (
                  <article
                    key={preview.draft.id}
                    className={`dock-bible-passage-reader__card${activeComparePassageIndex === index ? " dock-bible-passage-reader__card--active" : ""}`}
                    onClick={() => activateComparePassage(index)}
                  >
                    <div className="dock-bible-passage-reader__card-header">
                      <span className="dock-bible-passage-reader__card-number">
                        {t("dock.compare.passageNumber", "Passage {{number}}", { number: index + 1 })}
                      </span>
                      <span className="translation-badge">{preview.draft.translation}</span>
                    </div>
                    <div className="dock-bible-passage-reader__card-reference-row">
                      <span className="dock-bible-passage-reader__card-reference">
                        {preview.referenceLabel || preview.draft.reference || t("dock.compare.referencePlaceholder", "Enter a reference")}
                      </span>
                      <div className="dock-bible-passage-reader__card-actions">
                        <button
                          type="button"
                          className="dock-bible-reader__chapter-nav-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            activateComparePassage(index);
                            handleComparePassageNavigation(-1, index);
                          }}
                          disabled={!preview.parsed}
                          aria-label={t("bible.previousVerse", "Previous verse")}
                          title={t("bible.previousVerse", "Previous verse")}
                        >
                          <Icon name="chevron_left" size={12} />
                        </button>
                        <button
                          type="button"
                          className="dock-bible-reader__chapter-nav-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            activateComparePassage(index);
                            handleComparePassageNavigation(1, index);
                          }}
                          disabled={!preview.parsed}
                          aria-label={t("bible.nextVerse", "Next verse")}
                          title={t("bible.nextVerse", "Next verse")}
                        >
                          <Icon name="chevron_right" size={12} />
                        </button>
                      </div>
                    </div>
                    {preview.loading && (
                      <div className="dock-bible-passage-reader__status">{t("common.loading")}</div>
                    )}
                    {preview.error && (
                      <div className="dock-action-error dock-action-error--console">
                        <Icon name="warning" size={13} />
                        <span>{preview.error}</span>
                      </div>
                    )}
                    {!preview.loading && !preview.error && preview.text && (
                      <div className="dock-bible-passage-reader__text">{preview.text}</div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ) : (
          compareVerseRows.map((verse) => {
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
                onDoubleClick={(event) => void handleVerseDoubleClick(
                  event,
                  verse.verse,
                  verseA.text,
                  compareEnabled ? verseB.text : undefined,
                )}
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
                    : `${activeTranslation} ${selectedBook} ${selectedChapter}:${verse.verse} — ${presentationLinkMode ? "Click to show on presentation screen" : "Click to view in OBS"}`
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
          })
          )}
        </div>

        <div
          className={`dock-bible-reader__quick-actions${quickActionsLeft !== null && quickActionsLeft < 210 ? " dock-bible-reader__quick-actions--menu-right" : ""}`}
          ref={browserFontSizePopoverRef}
          style={{
            top: `${quickActionsTop}px`,
            ...(quickActionsLeft !== null ? { left: `${quickActionsLeft}px`, right: "auto" } : {}),
          }}
        >
          <button
            type="button"
            className={`dock-bible-reader__quick-actions-trigger${showBrowserFontSizePopover ? " dock-bible-reader__quick-actions-trigger--active" : ""}${isQuickActionsDragging ? " dock-bible-reader__quick-actions-trigger--dragging" : ""}`}
            onClick={handleQuickActionsClick}
            onPointerDown={handleQuickActionsPointerDown}
            onPointerMove={handleQuickActionsPointerMove}
            onPointerUp={finishQuickActionsDrag}
            onPointerCancel={finishQuickActionsDrag}
            aria-haspopup="dialog"
            aria-expanded={showBrowserFontSizePopover}
            aria-label={t("bible.obsQuickActions", "Bible OBS quick actions. Drag up or down.")}
            title={t("bible.obsQuickActions", "Bible OBS quick actions. Drag up or down.")}
          >
            <span className="dock-bible-reader__quick-actions-label">{t("bible.quickActions", "Quick")}</span>
          </button>
          <BibleOutputControlsMenu
            open={showBrowserFontSizePopover}
            settings={displayedBrowserFontSettings}
            lineCount={displayedBrowserVerseLineCount}
            isFitTextMode={isFitTextMode}
            showManualFontControls={showManualFontControls}
            areManualFontSizesDisabled={areManualFontSizesDisabled}
            browserFontSizeMin={browserFontSizeMin}
            browserFontSizeMax={browserFontSizeMax}
            browserReferenceFontSizeMin={browserReferenceFontSizeMin}
            browserReferenceFontSizeMax={browserReferenceFontSizeMax}
            browserQuickUpdateImmediately={browserQuickUpdateImmediately}
            hasPendingBrowserQuickChanges={hasPendingBrowserQuickChanges}
            onClose={() => setShowBrowserFontSizePopover(false)}
            onFontSizeChange={handleBrowserFontSizeChange}
            onFontSizeValueChange={handleBrowserFontSizeValueChange}
            onLowerThirdSizePresetChange={handleLowerThirdSizePresetChange}
            onReferenceBackgroundChange={handleBrowserReferenceBackgroundChange}
            onLineCountChange={handleBrowserVerseLineCountChange}
            onUpdateImmediatelyChange={handleBrowserQuickUpdateImmediatelyChange}
            keywordMatchPushDirectlyToObs={keywordMatchPushDirectlyToObs}
            onKeywordMatchPushDirectlyToObsChange={handleKeywordMatchPushDirectlyToObsChange}
            onSave={saveBrowserQuickSettings}
          />
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
          overlayMode={fullscreenOnlyMode ? "fullscreen" : overlayMode}
          onModeChange={handleOverlayModeChange}
          displayMode={displayMode}
          onDisplayModeChange={handleDisplayModeChange}
          centerAction={
            <div
              className="dock-bible-reader__chapter-nav dock-bible-reader__chapter-nav--toolbar"
              aria-label={t("bible.chapterNavigation", "Chapter navigation")}
            >
              <button
                type="button"
                className="dock-bible-reader__chapter-nav-btn"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleChapterJump(-1);
                }}
                disabled={!canGoPreviousChapter}
                title={t("bible.previousChapter", "Previous chapter")}
                aria-label={t("bible.previousChapter", "Previous chapter")}
              >
                <Icon name="chevron_left" size={14} />
              </button>
              <button
                type="button"
                className="dock-bible-reader__chapter-nav-btn"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleChapterJump(1);
                }}
                disabled={!canGoNextChapter}
                title={t("bible.nextChapter", "Next chapter")}
                aria-label={t("bible.nextChapter", "Next chapter")}
              >
                <Icon name="chevron_right" size={14} />
              </button>
            </div>
          }
          morphing={modeMorphing}
          hideOverlayModeToggle={fullscreenOnlyMode}
          clearLabel={bibleOverlayVisible
            ? t("dock.bottomToolbar.hideBible")
            : t("dock.bottomToolbar.showBible", { defaultValue: "Show Bible" })}
          onClear={handleToggleBibleVisibility}
          clearDisabled={false}
          sourceVisible={bibleOverlayVisible}
          collapsed={toolbarCollapsed}
          onCollapseChange={setToolbarCollapsed}
          bottomPanel={bottomSearchPanel}
          onOverflowChange={setShowBibleActionsMenu}
          inlineAction={
            <button
              type="button"
              className="dock-btm-toolbar__icon-btn"
              onClick={() => openThemeSettings("text")}
              title={t("worship.quickEdits", "Quick Edits")}
              aria-label={t("worship.quickEdits", "Quick Edits")}
            >
              <Icon name="tune" size={14} />
            </button>
          }
          narrowOverflowActions={
            <button
              type="button"
              className="dock-btm-overflow__menu-item"
              data-dock-close-overflow="true"
              onClick={() => openThemeSettings("text")}
            >
              <span>{t("worship.quickEdits", "Quick Edits")}</span>
            </button>
          }
          children={
            <>
              <div className="dock-bible-bottom-overflow-actions">
                {bottomToolbarActions}
              </div>
              <DockSceneRoutingControl
                module="bible"
                route={sceneRoute}
                onRouteChange={updateSceneRoute}
                disabled={presentationLinkMode}
                title={t("sceneRouting.bible", "Output")}
                placement="above"
                showLabel
                iconName="cast"
              />
              {referenceDisplayTrigger}
            </>
          }
        />

        {/* ── Footer actions ── */}

      </section>

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
                <label className="dock-bible-keyword-modal__direct-push">
                  <input
                    type="checkbox"
                    checked={keywordMatchPushDirectlyToObs}
                    onChange={(event) => handleKeywordMatchPushDirectlyToObsChange(event.target.checked)}
                    aria-describedby="dock-bible-keyword-direct-push-description"
                  />
                  <span className="dock-bible-keyword-modal__direct-push-copy">
                    <span>{t("bible.keywordMatchDirectPush", "Send keyword matches directly to OBS")}</span>
                    <small id="dock-bible-keyword-direct-push-description">
                      {t("bible.keywordMatchDirectPushDescription", "Skip the confirmation modal next time.")}
                    </small>
                  </span>
                </label>
              </div>
              <div className="dock-dialog__footer dock-bible-keyword-modal__footer">
                <button
                  type="button"
                  className="dock-btn dock-btn--ghost dock-btn--compact"
                  onClick={() => {
                    const keywordOutputOptions = getDockBibleKeywordMatchOutputOptions(keywordActionResult, MAX_VERSE_LINES);
                    setVerseLineCount(keywordOutputOptions.lineCount);
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
                    const keywordOutputOptions = getDockBibleKeywordMatchOutputOptions(keywordActionResult, MAX_VERSE_LINES);
                    void goLiveVerse(
                      keywordActionResult.book,
                      keywordActionResult.chapter,
                      keywordActionResult.verse,
                      {
                        translation: activeBibleSearchTranslation,
                        lineCount: keywordOutputOptions.lineCount,
                        rangeEndVerse: keywordOutputOptions.rangeEndVerse,
                        pushComparePassages: true,
                      },
                    );
                    setKeywordActionResult(null);
                  }}
                  title={t("common.sendToObs", "Send to OBS")}>
                  <Icon name="cast" size={14} />
                  {t("common.sendToObs", "Send to OBS")}
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
        quickSettings={activeQuickEditSettings}
        defaultQuickSettings={
          quickEditOverlayMode === "fullscreen"
            ? defaultFullscreenQuickThemeSettings
            : defaultLowerThirdQuickThemeSettings
        }
        onQuickSettingsSave={
          quickEditOverlayMode === "fullscreen"
            ? handleSaveFullscreenQuickThemeSettings
            : handleSaveLowerThirdQuickThemeSettings
        }
        resolveThemeQuickSettings={resolveThemeQuickSettings}
        displayMode={displayMode}
        title={t("bible.quickSettings")}
        subtitle={t("bible.quickSettingsSubtitle")}
        isOpen={showThemeSettings}
        onClose={() => setShowThemeSettings(false)}
        onBackgroundPresetChange={isSceneProfileActive ? undefined : handleBackgroundPresetChange}
        onSaveFeedback={onSaveFeedback}
        referenceFormat={referenceFormat}
        referenceVersionVisible={referenceVersionVisible}
        referenceTranslation={activeTranslation}
        onReferenceFormatChange={handleReferenceFormatChange}
        onReferenceVersionVisibleChange={handleReferenceVersionVisibleChange}
        onReferenceSettingsSave={handleReferenceSettingsSave}
        overlayMode={fullscreenOnlyMode ? "fullscreen" : overlayMode}
        initialTab={themeSettingsInitialTab}
        storageScope="bible"
        hideBackgroundOnCompare={displayMode === "compare"}
        sceneProfiles={sceneProfileOptions}
        activeSceneProfileId={activeSceneProfileId}
        onSceneProfileChange={setActiveSceneProfileId}
      />

      {copyFeedback && (
        <div
          className={`dock-bible-copy-feedback dock-bible-copy-feedback--${copyFeedback}`}
          role="status"
          aria-live="polite"
        >
          <Icon name={copyFeedback === "success" ? "check_circle" : "warning"} size={14} />
          <span>
            {copyFeedback === "success"
              ? t("common.copiedToClipboard")
              : t("common.copyFailed", { defaultValue: "Could not copy to clipboard" })}
          </span>
        </div>
      )}

      {showBibleHistory && (
        <BibleHistoryScreen
          onBack={() => {
            refreshFavoriteHistorySearches();
            setShowBibleHistory(false);
            onHistoryClose?.();
          }}
          onNavigateToVerse={(book, chapter, verse) => {
            refreshFavoriteHistorySearches();
            setSelectedBook(book);
            setSelectedChapter(chapter);
            setHighlightVerse(verse);
            setShowBibleHistory(false);
            onHistoryClose?.();
          }}
        />
      )}
        </>
      )}
    />
  );
}

export default memo(DockBibleTab);
