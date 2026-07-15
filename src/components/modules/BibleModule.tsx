/**
 * BibleHome.tsx — Simplified Bible production interface
 *
 * Designed for church volunteers under time pressure.
 * Workflow: Select Book → Select Chapter → Select Verse → Double-click to send to OBS
 *
 * Layout:
 *   HEADER  — Go to Switcher + now displaying + Send to OBS (flash) + OBS status
 *   LEFT    — VerseListPanel (auto) + Theme trigger (opens modal) + Layout & Motion
 *   CENTER  — Utility strip (Favorites/History) + BookChapterPanel
 *   RIGHT   — SlidePreview (closable)
 *   FOOTER  — Prev/Next verse + Blank + Clear + kbd hints
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBible } from "../../bible/bibleStore";
import { bibleObsService } from "../../bible/bibleObsService";
import { getChapter, getChapterCount, getVerseCount, searchBible } from "../../bible/bibleData";
import type { SearchResult } from "../../bible/bibleData";
import { parseBibleSearch } from "../../dock/bibleSearchParser";
import { clearHistory, getBibleSettings, saveBibleSettings, getInstalledTranslations, saveCustomTheme } from "../../bible/bibleDb";
import type { BiblePassage, BibleTemplateType, BibleTheme, BibleThemeSettings, BibleTranslation } from "../../bible/types";
import { BIBLE_BOOKS } from "../../bible/types";
import { generateSlides } from "../../bible/slideEngine";
import BookChapterPanel from "../../bible/components/BookChapterPanel";
import VerseListPanel from "../../bible/components/VerseListPanel";
import SlidePreview from "../../bible/components/SlidePreview";
import BibleLibrary from "../../bible/components/BibleLibrary";
import ThemePreviewSurface from "../ThemePreviewSurface";
import BibleCommandPalette from "../BibleCommandPalette";
import { obsService } from "../../services/obsService";
import { serviceStore } from "../../services/serviceStore";
import { ensureDockObsClientConnected } from "../../services/dockObsInterop";
import { isUserSelectableObsScene, normalizeDockStageBaseScene } from "../../services/dockSceneNames";
import { getInputBySlot, getSceneBySlot } from "../../services/obsRegistry";
import { useServiceGate } from "../../hooks/useServiceGate";
import { LT_ALL_THEMES, LT_BIBLE_THEMES } from "../../lowerthirds/themes";
import { buildOverlayUrl } from "../../lowerthirds/lowerThirdObsService";
import type { LowerThirdTheme } from "../../lowerthirds/types";
import type { LTSize } from "../../lowerthirds/types";
import { OCS_BIBLE_LT_PATTERN, VC_BIBLE_LT_PATTERN } from "../../lowerthirds/types";
import { dockObsClient } from "../../dock/dockObsClient";
import Icon from "../Icon";
import { getUserScopedKey } from "../../services/userScopedStorage";
import { getRecommendedPollingInterval } from "../../services/performanceManager";

const LEFT_PANEL_DEFAULT_WIDTH = 300;
const LEFT_PANEL_MIN_WIDTH = 220;
const LEFT_PANEL_MAX_WIDTH = 520;
const RIGHT_PANEL_DEFAULT_WIDTH = 280;
const RIGHT_PANEL_MIN_WIDTH = 220;
const RIGHT_PANEL_MAX_WIDTH = 520;
const SIDEBAR_COLLAPSE_THRESHOLD = 90;
const BIBLE_OVERLAY_SCENE_SLOT = "bible-overlay";
const BIBLE_OVERLAY_SCENE_FALLBACK_NAME = "MCE Bible Overlay";
const BIBLE_MAIN_INPUT_SLOT = "bible-browser-source";
const BIBLE_BG_INPUT_SLOT = "bible-bg-source";
const BIBLE_MAIN_INPUT_FALLBACK_NAME = "MakeChurchEasy — Bible";
const BIBLE_BG_INPUT_FALLBACK_NAME = "MakeChurchEasy — Bible BG";
const SHARED_WORSHIP_BIBLE_THEME_TAG = "shared-worship-bible";
const BIBLE_PREVIEW_SWATCHES = ["#FFFFFF", "#F8FAFC", "#CBD5E1", "#FDE68A", "#B9CCFF", "#60A5FA", "#22C55E", "#0F172A", "#111827", "#000000"] as const;

type BiblePreviewPanelTab = "text" | "background";

const BIBLE_LOWER_THIRD_THEMES: LowerThirdTheme[] = (() => {
  const sharedThemes = LT_ALL_THEMES.filter((theme) =>
    Array.isArray(theme.tags)
    && theme.tags.some((tag) => String(tag).trim().toLowerCase() === SHARED_WORSHIP_BIBLE_THEME_TAG)
  ) as unknown as LowerThirdTheme[];

  const byId = new Map<string, LowerThirdTheme>();
  for (const theme of LT_BIBLE_THEMES) byId.set(theme.id, theme);
  for (const theme of sharedThemes) byId.set(theme.id, theme);
  return Array.from(byId.values());
})();

function BiblePreviewControls({
  settings,
  activeTab,
  onTabChange,
  onUpdate,
}: {
  settings: BibleThemeSettings;
  activeTab: BiblePreviewPanelTab;
  onTabChange: (tab: BiblePreviewPanelTab) => void;
  onUpdate: (patch: Partial<BibleThemeSettings>) => void;
}) {
  return (
    <div className="bible-preview-controls">
      <div className="bible-preview-tabs" role="tablist" aria-label="Preview controls">
        <button
          type="button"
          className={`bible-preview-tab${activeTab === "text" ? " active" : ""}`}
          onClick={() => onTabChange("text")}
          role="tab"
          aria-selected={activeTab === "text"}
        >
          <Icon name="text_fields" size={14} />
          <span>Text</span>
        </button>
        <button
          type="button"
          className={`bible-preview-tab${activeTab === "background" ? " active" : ""}`}
          onClick={() => onTabChange("background")}
          role="tab"
          aria-selected={activeTab === "background"}
        >
          <Icon name="image" size={14} />
          <span>Background</span>
        </button>
      </div>

      <div className="bible-preview-panel">
        {activeTab === "text" ? (
          <>
            <div className="bible-preview-grid">
              <label className="bible-preview-field">
                <span>Text</span>
                <input
                  type="color"
                  value={settings.fontColor}
                  onChange={(e) => onUpdate({ fontColor: e.target.value })}
                />
              </label>
              <label className="bible-preview-field">
                <span>Reference</span>
                <input
                  type="color"
                  value={settings.refFontColor}
                  onChange={(e) => onUpdate({ refFontColor: e.target.value })}
                />
              </label>
            </div>

            <label className="bible-preview-range">
              <span>
                <span>Size</span>
                <strong>{settings.fontSize}px</strong>
              </span>
              <input
                type="range"
                min={28}
                max={180}
                step={1}
                value={settings.fontSize}
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
              />
            </label>

            <label className="bible-preview-range">
              <span>
                <span>Line Height</span>
                <strong>{settings.lineHeight.toFixed(2)}x</strong>
              </span>
              <input
                type="range"
                min={1.1}
                max={1.9}
                step={0.01}
                value={settings.lineHeight}
                onChange={(e) => onUpdate({ lineHeight: Number(e.target.value) })}
              />
            </label>

            <div className="bible-preview-option-group">
              <span className="bible-preview-group-label">Align</span>
              <div className="bible-preview-option-row">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    className={`bible-preview-option${settings.textAlign === align ? " active" : ""}`}
                    onClick={() => onUpdate({ textAlign: align, refTextAlign: "match" })}
                  >
                    {align === "left" ? "Left" : align === "center" ? "Center" : "Right"}
                  </button>
                ))}
              </div>
            </div>

            <div className="bible-preview-option-group">
              <span className="bible-preview-group-label">Case</span>
              <div className="bible-preview-option-row">
                {([
                  { value: "uppercase", label: "TT" },
                  { value: "lowercase", label: "tt" },
                  { value: "capitalize", label: "Tt" },
                  { value: "none", label: "Aa" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`bible-preview-option${settings.textTransform === option.value ? " active" : ""}`}
                    onClick={() => onUpdate({ textTransform: option.value })}
                    title={option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bible-preview-grid">
              <div className="bible-preview-option-group">
                <span className="bible-preview-group-label">Reference</span>
                <div className="bible-preview-option-row">
                  {(["top", "bottom"] as const).map((position) => (
                    <button
                      key={position}
                      type="button"
                      className={`bible-preview-option${settings.refPosition === position ? " active" : ""}`}
                      onClick={() => onUpdate({ refPosition: position })}
                    >
                      {position === "top" ? "Top" : "Bottom"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="bible-preview-toggle">
                <span>Ref BG</span>
                <input
                  type="checkbox"
                  checked={settings.referenceBackgroundEnabled}
                  onChange={(e) => onUpdate({ referenceBackgroundEnabled: e.target.checked })}
                />
              </label>
            </div>

            <div className="bible-preview-option-group">
              <span className="bible-preview-group-label">Ref Background</span>
              <div className="bible-preview-swatch-row">
                {BIBLE_PREVIEW_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`bible-preview-swatch${settings.referenceBackgroundColor === color ? " active" : ""}`}
                    style={{ background: color }}
                    onClick={() => onUpdate({ referenceBackgroundColor: color, referenceBackgroundEnabled: true })}
                    aria-label={`Reference background ${color}`}
                  />
                ))}
                <input
                  type="color"
                  className="bible-preview-swatch bible-preview-swatch-input"
                  value={settings.referenceBackgroundColor}
                  onChange={(e) => onUpdate({ referenceBackgroundColor: e.target.value, referenceBackgroundEnabled: true })}
                  aria-label="Custom reference background color"
                />
              </div>
              <div className="bible-preview-option-row">
                {([
                  { value: "solid", label: "Fill" },
                  { value: "pill", label: "Pill" },
                  { value: "outline", label: "Line" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`bible-preview-option${settings.referenceBackgroundStyle === option.value ? " active" : ""}`}
                    onClick={() => onUpdate({ referenceBackgroundStyle: option.value, referenceBackgroundEnabled: true })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bible-preview-option-group">
              <span className="bible-preview-group-label">Color</span>
              <div className="bible-preview-swatch-row">
                {BIBLE_PREVIEW_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`bible-preview-swatch${settings.backgroundColor === color && !settings.backgroundImage ? " active" : ""}`}
                    style={{ background: color }}
                    onClick={() => onUpdate({
                      backgroundColor: color,
                      backgroundColorEnd: undefined,
                      backgroundImage: "",
                      backgroundImageFilePath: "",
                      backgroundPattern: "",
                      backgroundVideo: "",
                      backgroundVideoFilePath: "",
                    })}
                    aria-label={`Background ${color}`}
                  />
                ))}
                <input
                  type="color"
                  className="bible-preview-swatch bible-preview-swatch-input"
                  value={settings.backgroundColor}
                  onChange={(e) => onUpdate({
                    backgroundColor: e.target.value,
                    backgroundColorEnd: undefined,
                    backgroundImage: "",
                    backgroundImageFilePath: "",
                    backgroundPattern: "",
                    backgroundVideo: "",
                    backgroundVideoFilePath: "",
                  })}
                  aria-label="Custom background color"
                />
              </div>
            </div>

            <div className="bible-preview-grid">
              <label className="bible-preview-field">
                <span>Shade</span>
                <input
                  type="color"
                  value={settings.fullscreenShadeColor}
                  onChange={(e) => onUpdate({ fullscreenShadeColor: e.target.value, fullscreenShadeEnabled: true })}
                />
              </label>
              <label className="bible-preview-toggle">
                <span>Overlay</span>
                <input
                  type="checkbox"
                  checked={settings.fullscreenShadeEnabled}
                  onChange={(e) => onUpdate({ fullscreenShadeEnabled: e.target.checked })}
                />
              </label>
            </div>

            <label className="bible-preview-range">
              <span>
                <span>Shade Opacity</span>
                <strong>{Math.round(settings.fullscreenShadeOpacity * 100)}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={0.85}
                step={0.01}
                value={settings.fullscreenShadeOpacity}
                onChange={(e) => onUpdate({ fullscreenShadeOpacity: Number(e.target.value), fullscreenShadeEnabled: true })}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

export interface BibleModuleProps {
  isActive?: boolean;
  homePath?: string;
  presentationMode?: boolean;
  templatesPath?: string;
  /** Deep-link: auto-select this Bible verse when set */
  initialSelectBible?: { book: string; chapter: number; verse: number } | null;
  /** Called after the deep-link selection has been consumed */
  onConsumeInitialSelect?: () => void;
  onPresentToScreen?: (payload: BiblePresentationSelectionPayload) => void;
  onClearScreen?: () => void;
}

export interface BiblePresentationSelectionPayload {
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  text: string;
  themeId?: string;
  verseCount?: number;
}

export function BibleModule({
  isActive = true,
  homePath = "/",
  presentationMode = false,
  templatesPath = "/bible/templates",
  initialSelectBible,
  onConsumeInitialSelect,
  onPresentToScreen,
  onClearScreen,
}: BibleModuleProps) {
  const {
    state, dispatch, addToQueue, toggleFavorite, recordHistory,
    currentQueueItem, activeTheme,
    setTheme,
  } = useBible();
  const navigate = useNavigate();

  // Navigation state — default to Genesis 1:1, restored from IndexedDB on mount
  const [selectedBook, setSelectedBook] = useState<string>("Genesis");
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [selectedVerse, setSelectedVerse] = useState<number>(1);
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const presentationTabWasActiveRef = useRef(isActive);

  // Restore last selection from IndexedDB on mount
  useEffect(() => {
    getBibleSettings().then((settings) => {
      if (settings.lastBook) setSelectedBook(settings.lastBook);
      if (settings.lastChapter) setSelectedChapter(settings.lastChapter);
      if (settings.lastVerse) setSelectedVerse(settings.lastVerse);
      setSelectionLoaded(true);
    }).catch(() => setSelectionLoaded(true));
  }, []);

  // Persist selection to IndexedDB on change (debounced)
  useEffect(() => {
    if (!selectionLoaded) return;
    const timer = setTimeout(() => {
      saveBibleSettings({
        lastBook: selectedBook,
        lastChapter: selectedChapter,
        lastVerse: selectedVerse,
      }).catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedBook, selectedChapter, selectedVerse, selectionLoaded]);

  // Deep-link: navigate to a specific verse when triggered from global search
  useEffect(() => {
    if (initialSelectBible) {
      setSelectedBook(initialSelectBible.book);
      setSelectedChapter(initialSelectBible.chapter);
      setSelectedVerse(initialSelectBible.verse);
      onConsumeInitialSelect?.();
    }
  }, [initialSelectBible, onConsumeInitialSelect]);

  // OBS connection
  const [obsConnected, setObsConnected] = useState(obsService.status === "connected");

  // Verse count for current chapter
  const [currentVerseCount, setCurrentVerseCount] = useState(0);

  // Track whether we've sent to OBS (for auto next/prev)
  const [hasSentToObs, setHasSentToObs] = useState(false);

  // Right panel visibility
  const [showPreview, setShowPreview] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(LEFT_PANEL_DEFAULT_WIDTH);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH);
  const resizeStateRef = useRef<{
    side: "left" | "right";
    startX: number;
    leftWidth: number;
    rightWidth: number;
  } | null>(null);

  // Quick Setup wizard
  const [showQuickSetup, setShowQuickSetup] = useState(false);

  // Flash feedback for Send to OBS button
  const [sendFlash, setSendFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Utility strip: 'none' | 'favorites' | 'history' | 'search'
  const [activeUtilityTab, setActiveUtilityTab] = useState<"none" | "favorites" | "history" | "search">("none");

  // Full-text Bible search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Smart reference matches (e.g. "jhn1623" → John 16:23)
  const [refMatches, setRefMatches] = useState<{ book: string; chapter: number | null; verse: number | null; label: string }[]>([]);

  // Theme picker modal
  const [showThemeModal, setShowThemeModal] = useState(false);

  // Context menu for theme modal right-click
  const [themeContextMenu, setThemeContextMenu] = useState<{ x: number; y: number; themeId: string } | null>(null);

  // Drag-to-reorder state for theme modal
  const [dragThemeId, setDragThemeId] = useState<string | null>(null);
  const [dragOverThemeId, setDragOverThemeId] = useState<string | null>(null);

  // ── Lower Third overlay state ──
  const [selectedLTTheme, setSelectedLTTheme] = useState<LowerThirdTheme | null>(null);
  const [ltScenes, setLtScenes] = useState<string[]>([]);
  const [ltTargetScene, setLtTargetScene] = useState<string>("");
  const ltSize: LTSize = "xl";
  // Scenes that have an active LT bible source — used for real-time updates
  const [ltLiveScenes, setLtLiveScenes] = useState<string[]>([]);
  // Scenes that have an active fullscreen Bible source
  const [fullLiveScenes, setFullLiveScenes] = useState<string[]>([]);
  const ltScenePollBusyRef = useRef(false);
  const bibleOverlaySceneNameRef = useRef<string>(BIBLE_OVERLAY_SCENE_FALLBACK_NAME);
  const lastNonBibleProgramSceneRef = useRef<string>("");
  const lastNonBiblePreviewSceneRef = useRef<string>("");

  // Detect Mac for shortcut labels
  const isMac = useMemo(() => navigator.platform.toUpperCase().indexOf("MAC") >= 0, []);

  // Bible Library modal
  const [showLibrary, setShowLibrary] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] = useState("");
  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Installed translations for the switcher dropdown
  const [installedTranslations, setInstalledTranslations] = useState<{ abbr: string; name: string }[]>([]);
  const [previewPanelTab, setPreviewPanelTab] = useState<BiblePreviewPanelTab>("text");

  // Service gate (no-op — service gate concept removed)
  const { checkServiceActive } = useServiceGate();

  const refreshInstalledTranslations = useCallback(() => {
    getInstalledTranslations().then((list) => {
      setInstalledTranslations(list.map((t) => ({ abbr: t.abbr, name: t.name })));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    refreshInstalledTranslations();
  }, [refreshInstalledTranslations]);

  useEffect(() => {
    const currentTranslation = state.translation.toUpperCase();
    if (currentTranslation === "KJV") return;
    const isInstalled = installedTranslations.some((entry) => entry.abbr.toUpperCase() === currentTranslation);
    if (isInstalled) return;

    dispatch({ type: "SET_TRANSLATION", translation: "KJV" });
    setToastMessage(`${state.translation} is not installed. Switched to KJV.`);
    const timer = window.setTimeout(() => setToastMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [installedTranslations, state.translation, dispatch]);

  // Layout mode
  const [layoutMode, setLayoutMode] = useState<BibleTemplateType>("fullscreen");

  useEffect(() => {
    if (!presentationMode || layoutMode === "fullscreen") return;
    setLayoutMode("fullscreen");
  }, [layoutMode, presentationMode]);

  // Layout confirmation modal
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [pendingLayoutMode, setPendingLayoutMode] = useState<BibleTemplateType | null>(null);
  const [skipLayoutConfirm, setSkipLayoutConfirm] = useState(() => localStorage.getItem(getUserScopedKey("bible-skip-layout-confirm")) === "true");

  // ── Lower Third: fetch scenes ──
  const resolveBibleOverlaySceneName = useCallback(async (): Promise<string> => {
    let name = bibleOverlaySceneNameRef.current;
    try {
      const regScene = await getSceneBySlot(BIBLE_OVERLAY_SCENE_SLOT);
      if (regScene?.sceneName) {
        name = regScene.sceneName;
      }
    } catch {
      // Registry lookup is best-effort.
    }
    if (!name) {
      name = BIBLE_OVERLAY_SCENE_FALLBACK_NAME;
    }
    bibleOverlaySceneNameRef.current = name;
    return name;
  }, []);

  const isBibleFullscreenSceneName = useCallback((sceneName: string, bibleOverlaySceneName: string): boolean => {
    const current = sceneName.trim().toLowerCase();
    const bibleScene = bibleOverlaySceneName.trim().toLowerCase();
    if (!current) return false;
    return current === bibleScene || /\bbible\b/.test(current);
  }, []);

  const loadLtScenes = useCallback(async () => {
    if (!obsService.isConnected) return;
    try {
      const bibleOverlaySceneName = await resolveBibleOverlaySceneName();
      const scenes = await obsService.getSceneList();
      const visibleScenes = scenes.filter((scene) => isUserSelectableObsScene(scene.sceneName));
      const names = visibleScenes.map((scene) => scene.sceneName);
      setLtScenes(names);
      setLtLiveScenes((prev) => prev.filter((sceneName) => names.includes(sceneName)));
      setFullLiveScenes((prev) => prev.filter((sceneName) => names.includes(sceneName)));
      const program = await obsService.getCurrentProgramScene();
      const normalizedProgram = normalizeDockStageBaseScene(program);
      if (normalizedProgram && !isBibleFullscreenSceneName(program, bibleOverlaySceneName)) {
        lastNonBibleProgramSceneRef.current = normalizedProgram;
      }
      if (!ltTargetScene || !names.includes(ltTargetScene)) {
        const mainScene = serviceStore.sceneMapping.mainScene;
        const defaultScene = mainScene && names.includes(mainScene) ? mainScene : names[0] ?? "";
        setLtTargetScene(defaultScene);
      }
    } catch (err) {
      console.warn("[BibleModule] Failed to fetch scenes:", err);
    }
  }, [isBibleFullscreenSceneName, ltTargetScene, resolveBibleOverlaySceneName]);

  const restoreFromBibleFullscreenIfNeeded = useCallback(async (
    mode: "scene" | "preview" | "program",
    requestedSceneName: string,
  ): Promise<string> => {
    if (mode === "scene" || !obsService.isConnected) {
      return requestedSceneName;
    }

    const bibleOverlaySceneName = await resolveBibleOverlaySceneName();
    const fallbackSceneFromList =
      ltScenes.find((sceneName) => !isBibleFullscreenSceneName(sceneName, bibleOverlaySceneName)) || "";
    const fallbackScene = serviceStore.sceneMapping.mainScene || fallbackSceneFromList || requestedSceneName;

    if (mode === "program") {
      const currentProgram = await obsService.getCurrentProgramScene().catch(() => requestedSceneName);
      if (!isBibleFullscreenSceneName(currentProgram, bibleOverlaySceneName)) {
        if (currentProgram) lastNonBibleProgramSceneRef.current = currentProgram;
        return requestedSceneName;
      }
      const restoreTarget = lastNonBibleProgramSceneRef.current || fallbackScene;
      if (!restoreTarget || restoreTarget === currentProgram) {
        return requestedSceneName;
      }
      try {
        await obsService.setCurrentProgramScene(restoreTarget);
        return restoreTarget;
      } catch (err) {
        console.warn("[BibleModule] Failed to restore program scene before lower-third send:", err);
        return requestedSceneName;
      }
    }

    const currentPreview = await obsService.getCurrentPreviewScene().catch(() => requestedSceneName);
    if (!isBibleFullscreenSceneName(currentPreview, bibleOverlaySceneName)) {
      if (currentPreview) lastNonBiblePreviewSceneRef.current = currentPreview;
      return requestedSceneName;
    }
    const restoreTarget = lastNonBiblePreviewSceneRef.current || fallbackScene;
    if (!restoreTarget || restoreTarget === currentPreview) {
      return requestedSceneName;
    }
    try {
      await obsService.setCurrentPreviewScene(restoreTarget);
      return restoreTarget;
    } catch (err) {
      console.warn("[BibleModule] Failed to restore preview scene before lower-third send:", err);
      return requestedSceneName;
    }
  }, [isBibleFullscreenSceneName, ltScenes, resolveBibleOverlaySceneName]);

  const disableFullscreenBibleSourcesInScene = useCallback(async (sceneName: string): Promise<void> => {
    if (!sceneName || !obsService.isConnected) return;
    try {
      const inputs = await obsService.getInputList();

      const regMainInput = await getInputBySlot(BIBLE_MAIN_INPUT_SLOT).catch(() => undefined);
      const regBgInput = await getInputBySlot(BIBLE_BG_INPUT_SLOT).catch(() => undefined);

      let mainInputName = regMainInput?.inputName || BIBLE_MAIN_INPUT_FALLBACK_NAME;
      if (regMainInput?.inputUuid) {
        const found = inputs.find((input) => input.inputUuid === regMainInput.inputUuid);
        if (found?.inputName) mainInputName = found.inputName;
      }

      let bgInputName = regBgInput?.inputName || BIBLE_BG_INPUT_FALLBACK_NAME;
      if (regBgInput?.inputUuid) {
        const found = inputs.find((input) => input.inputUuid === regBgInput.inputUuid);
        if (found?.inputName) bgInputName = found.inputName;
      }

      const fullscreenSourceNames = new Set<string>([
        mainInputName,
        bgInputName,
        BIBLE_MAIN_INPUT_FALLBACK_NAME,
        BIBLE_BG_INPUT_FALLBACK_NAME,
      ]);

      const sceneItems = await obsService.getSceneItemList(sceneName);
      for (const item of sceneItems) {
        if (!fullscreenSourceNames.has(item.sourceName)) continue;
        // Never disable lower-third bible sources.
        if (OCS_BIBLE_LT_PATTERN.test(item.sourceName) || VC_BIBLE_LT_PATTERN.test(item.sourceName)) continue;
        try {
          await obsService.call("SetSceneItemEnabled", {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: false,
          });
        } catch {
          // Best effort.
        }
      }
    } catch (err) {
      console.warn("[BibleModule] Failed to disable fullscreen Bible sources:", err);
    }
  }, []);

  const prepareForLowerThirdMode = useCallback(async (): Promise<void> => {
    if (!obsConnected) return;

    let resolvedProgramScene = "";
    const currentProgramScene = await obsService.getCurrentProgramScene().catch(() => "");
    if (currentProgramScene) {
      resolvedProgramScene = await restoreFromBibleFullscreenIfNeeded("program", currentProgramScene);
      if (resolvedProgramScene) {
        await disableFullscreenBibleSourcesInScene(resolvedProgramScene);
      }
    }

    const currentPreviewScene = await obsService.getCurrentPreviewScene().catch(() => "");
    if (currentPreviewScene) {
      const resolvedPreviewScene = await restoreFromBibleFullscreenIfNeeded("preview", currentPreviewScene);
      if (resolvedPreviewScene && resolvedPreviewScene !== resolvedProgramScene) {
        await disableFullscreenBibleSourcesInScene(resolvedPreviewScene);
      }
    }
  }, [disableFullscreenBibleSourcesInScene, obsConnected, restoreFromBibleFullscreenIfNeeded]);

  const beginSidebarResize = useCallback((side: "left" | "right", e: React.MouseEvent) => {
    e.preventDefault();
    resizeStateRef.current = {
      side,
      startX: e.clientX,
      leftWidth: leftPanelCollapsed ? 0 : leftPanelWidth,
      rightWidth: showPreview ? rightPanelWidth : 0,
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, [leftPanelCollapsed, leftPanelWidth, rightPanelWidth, showPreview]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const active = resizeStateRef.current;
      if (!active) return;

      if (active.side === "left") {
        const nextRaw = active.leftWidth + (e.clientX - active.startX);
        if (nextRaw <= SIDEBAR_COLLAPSE_THRESHOLD) {
          setLeftPanelCollapsed(true);
          return;
        }
        setLeftPanelCollapsed(false);
        setLeftPanelWidth(Math.max(LEFT_PANEL_MIN_WIDTH, Math.min(LEFT_PANEL_MAX_WIDTH, Math.round(nextRaw))));
        return;
      }

      const nextRaw = active.rightWidth + (active.startX - e.clientX);
      if (nextRaw <= SIDEBAR_COLLAPSE_THRESHOLD) {
        setShowPreview(false);
        return;
      }
      setShowPreview(true);
      setRightPanelWidth(Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(RIGHT_PANEL_MAX_WIDTH, Math.round(nextRaw))));
    };

    const onUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const confirmLayoutChange = useCallback(() => {
    if (pendingLayoutMode) {
      setLayoutMode(pendingLayoutMode);
      if (pendingLayoutMode === "lower-third") {
        loadLtScenes();
        // Auto-select the first LT theme if none is selected
        if (!selectedLTTheme && BIBLE_LOWER_THIRD_THEMES.length > 0) {
          setSelectedLTTheme(BIBLE_LOWER_THIRD_THEMES[0]);
        }
        void prepareForLowerThirdMode();
      }
    }
    setShowLayoutModal(false);
    setPendingLayoutMode(null);
  }, [pendingLayoutMode, loadLtScenes, prepareForLowerThirdMode, selectedLTTheme]);

  const cancelLayoutChange = useCallback(() => {
    setShowLayoutModal(false);
    setPendingLayoutMode(null);
  }, []);

  useEffect(() => {
    const unsub = obsService.onStatusChange((status) => {
      setObsConnected(status === "connected");
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isActive) return;

    if (!obsConnected) {
      setLtScenes([]);
      setLtTargetScene("");
      setLtLiveScenes([]);
      setFullLiveScenes([]);
      return;
    }

    const poll = async () => {
      if (ltScenePollBusyRef.current) return;
      ltScenePollBusyRef.current = true;
      try {
        await loadLtScenes();
      } finally {
        ltScenePollBusyRef.current = false;
      }
    };

    poll();
    const iv = window.setInterval(poll, getRecommendedPollingInterval(3000));
    return () => window.clearInterval(iv);
  }, [isActive, obsConnected, loadLtScenes]);

  // Auto-ensure OBS browser source exists when Bible section opens or OBS connects
  useEffect(() => {
    if (!obsConnected) return;
    // Fire-and-forget: ensure the browser source exists in OBS
    bibleObsService.ensureBrowserSource(undefined, activeTheme?.templateType ?? "fullscreen")
      .catch((err) => console.warn("[BibleHome] Could not auto-ensure browser source:", err));
  }, [obsConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load verse count when chapter changes
  useEffect(() => {
    if (!selectedBook || !selectedChapter) { setCurrentVerseCount(0); return; }
    let cancelled = false;
    getVerseCount(selectedBook, selectedChapter, state.translation).then((n) => {
      if (!cancelled) setCurrentVerseCount(n);
    });
    return () => { cancelled = true; };
  }, [selectedBook, selectedChapter, state.translation]);

  // Load chapter count for current book (used by Shift+Arrow shortcuts)
  const [currentChapterCount, setCurrentChapterCount] = useState(0);
  useEffect(() => {
    if (!selectedBook) { setCurrentChapterCount(0); return; }
    let cancelled = false;
    getChapterCount(selectedBook, state.translation).then((n) => {
      if (!cancelled) setCurrentChapterCount(n);
    });
    return () => { cancelled = true; };
  }, [selectedBook, state.translation]);

  // Trigger flash feedback
  const triggerFlash = useCallback(() => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setSendFlash(true);
    flashTimerRef.current = setTimeout(() => setSendFlash(false), 600);
  }, []);

  // Send verse directly to OBS — CLEARS queue first for continuous sends
  const sendVerseToObs = useCallback(async (
    book: string,
    chapter: number,
    verse: number,
    options?: { useLegacyObs?: boolean },
  ): Promise<boolean> => {
    if (presentationMode) return false;
    if (!checkServiceActive("display Bible verses on OBS")) return false;
    const useLegacyObs = options?.useLegacyObs ?? true;
    let passage: BiblePassage;
    try {
      passage = await getChapter(book, chapter, state.translation);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load the selected Bible translation.";
      console.warn("[BibleModule] sendVerseToObs failed:", err);
      setToastMessage(message);
      window.setTimeout(() => setToastMessage(null), 3500);
      return false;
    }
    const verseData = passage.verses.find(v => v.verse === verse);
    if (!verseData) {
      setToastMessage(`Could not load ${book} ${chapter}:${verse} (${state.translation}).`);
      window.setTimeout(() => setToastMessage(null), 3500);
      return false;
    }

    const biblePassage: BiblePassage = {
      reference: `${book} ${chapter}:${verse}`,
      book,
      chapter,
      startVerse: verse,
      endVerse: verse,
      verses: [verseData],
      translation: state.translation,
    };
    // Clear queue first so activeQueueIndex resets → OBS always gets the new verse
    dispatch({ type: "CLEAR_QUEUE" });
    addToQueue(biblePassage);
    recordHistory(biblePassage);
    setHasSentToObs(true);

    if (layoutMode === "fullscreen" && useLegacyObs) {
      const liveSlide = generateSlides(biblePassage, state.slideConfig)[0] ?? null;
      if (liveSlide) {
        await bibleObsService.pushSlide(
          liveSlide,
          activeTheme?.settings ?? null,
          true,
          false,
          "fullscreen"
        );
        await bibleObsService.show();
      }
    }

    triggerFlash();
    if (layoutMode === "fullscreen") {
      setToastMessage(`${book} ${chapter}:${verse} displayed`);
      setTimeout(() => setToastMessage(null), 3000);
    }
    // Track bible verse for service stats
    if (serviceStore.status === "preservice") {
      serviceStore.trackBibleVerse();
    }
    return true;
  }, [state.translation, state.slideConfig, dispatch, addToQueue, recordHistory, activeTheme, triggerFlash, checkServiceActive, layoutMode, presentationMode]);

  // Auto-select chapter 1, verse 1 when book is clicked
  const handleSelectBook = useCallback((book: string) => {
    setSelectedBook(book);
    setSelectedChapter(1);
    setSelectedVerse(1);
    setHasSentToObs(false);
  }, []);

  const handleSelectChapter = useCallback((book: string, chapter: number) => {
    setSelectedBook(book);
    setSelectedChapter(chapter);
    setSelectedVerse(1);
    setHasSentToObs(false);
  }, []);

  const handleSelectVerse = useCallback((verse: number) => {
    setSelectedVerse(verse);
    if (presentationMode || !selectedBook || !selectedChapter) {
      setHasSentToObs(false);
      return;
    }
    // Single click now sends verse to OBS immediately
    sendVerseToObs(selectedBook, selectedChapter, verse);
  }, [selectedBook, selectedChapter, sendVerseToObs, presentationMode]);

  // Double-click book → navigate to chapter 1 and send verse 1 to OBS
  const handleDoubleClickBook = useCallback((book: string) => {
    setSelectedBook(book);
    setSelectedChapter(1);
    setSelectedVerse(1);
    if (presentationMode) return;
    sendVerseToObs(book, 1, 1);
  }, [sendVerseToObs, presentationMode]);

  // Double-click chapter → navigate to that chapter and send verse 1 to OBS
  const handleDoubleClickChapter = useCallback((book: string, chapter: number) => {
    setSelectedBook(book);
    setSelectedChapter(chapter);
    setSelectedVerse(1);
    if (presentationMode) return;
    sendVerseToObs(book, chapter, 1);
  }, [sendVerseToObs, presentationMode]);

  // Toggle favorite for a specific verse
  const handleToggleFavoriteVerse = useCallback(async (verse: number) => {
    if (!selectedBook || !selectedChapter) return;
    const passage = await getChapter(selectedBook, selectedChapter, state.translation);
    const verseData = passage.verses.find(v => v.verse === verse);
    if (!verseData) return;
    const biblePassage: BiblePassage = {
      reference: `${selectedBook} ${selectedChapter}:${verse}`,
      book: selectedBook,
      chapter: selectedChapter,
      startVerse: verse,
      endVerse: verse,
      verses: [verseData],
      translation: state.translation,
    };
    toggleFavorite(biblePassage);
  }, [selectedBook, selectedChapter, state.translation, toggleFavorite]);

  // Toggle favorite for current verse (Ctrl+D)
  const handleToggleFavoriteCurrent = useCallback(() => {
    if (!selectedVerse) return;
    handleToggleFavoriteVerse(selectedVerse);
  }, [selectedVerse, handleToggleFavoriteVerse]);

  // Next verse — wraps to next chapter/book boundary.
  const handleNextVerse = useCallback(async () => {
    if (!selectedBook || !selectedChapter || !selectedVerse) return;

    let nextBook = selectedBook;
    let nextChapter = selectedChapter;
    let nextVerse = selectedVerse;

    if (selectedVerse < currentVerseCount) {
      nextVerse = selectedVerse + 1;
    } else if (selectedChapter < currentChapterCount) {
      nextChapter = selectedChapter + 1;
      nextVerse = 1;
    } else {
      const bookIndex = BIBLE_BOOKS.indexOf(selectedBook as (typeof BIBLE_BOOKS)[number]);
      if (bookIndex < 0) return;
      let found = false;
      for (let i = bookIndex + 1; i < BIBLE_BOOKS.length; i += 1) {
        const candidateBook = BIBLE_BOOKS[i];
        const chapterCount = await getChapterCount(candidateBook, state.translation);
        if (chapterCount <= 0) continue;
        const verseCount = await getVerseCount(candidateBook, 1, state.translation);
        if (verseCount <= 0) continue;
        nextBook = candidateBook;
        nextChapter = 1;
        nextVerse = 1;
        found = true;
        break;
      }
      if (!found) return;
    }

    setSelectedBook(nextBook);
    setSelectedChapter(nextChapter);
    setSelectedVerse(nextVerse);
    if (hasSentToObs) {
      void sendVerseToObs(nextBook, nextChapter, nextVerse);
    }
  }, [
    selectedBook,
    selectedChapter,
    selectedVerse,
    currentVerseCount,
    currentChapterCount,
    state.translation,
    hasSentToObs,
    sendVerseToObs,
  ]);

  const handlePrevVerse = useCallback(async () => {
    if (!selectedBook || !selectedChapter || !selectedVerse) return;

    let prevBook = selectedBook;
    let prevChapter = selectedChapter;
    let prevVerse = selectedVerse;

    if (selectedVerse > 1) {
      prevVerse = selectedVerse - 1;
    } else if (selectedChapter > 1) {
      prevChapter = selectedChapter - 1;
      const verseCount = await getVerseCount(selectedBook, prevChapter, state.translation);
      prevVerse = Math.max(1, verseCount || 1);
    } else {
      const bookIndex = BIBLE_BOOKS.indexOf(selectedBook as (typeof BIBLE_BOOKS)[number]);
      if (bookIndex <= 0) return;
      let found = false;
      for (let i = bookIndex - 1; i >= 0; i -= 1) {
        const candidateBook = BIBLE_BOOKS[i];
        const chapterCount = await getChapterCount(candidateBook, state.translation);
        if (chapterCount <= 0) continue;
        const verseCount = await getVerseCount(candidateBook, chapterCount, state.translation);
        if (verseCount <= 0) continue;
        prevBook = candidateBook;
        prevChapter = chapterCount;
        prevVerse = Math.max(1, verseCount);
        found = true;
        break;
      }
      if (!found) return;
    }

    setSelectedBook(prevBook);
    setSelectedChapter(prevChapter);
    setSelectedVerse(prevVerse);
    if (hasSentToObs) {
      void sendVerseToObs(prevBook, prevChapter, prevVerse);
    }
  }, [selectedBook, selectedChapter, selectedVerse, state.translation, hasSentToObs, sendVerseToObs]);

  // Jump by N verses (for Up/Down arrow grid row navigation)
  const GRID_ROW_SIZE = 6;

  const handleJumpVerseForward = useCallback(() => {
    if (!selectedBook || !selectedChapter || !selectedVerse) return;
    const targetV = Math.min(selectedVerse + GRID_ROW_SIZE, currentVerseCount);
    if (targetV !== selectedVerse) {
      setSelectedVerse(targetV);
      if (hasSentToObs) {
        sendVerseToObs(selectedBook, selectedChapter, targetV);
      }
    }
  }, [selectedBook, selectedChapter, selectedVerse, currentVerseCount, hasSentToObs, sendVerseToObs]);

  const handleJumpVerseBackward = useCallback(() => {
    if (!selectedBook || !selectedChapter || !selectedVerse) return;
    const targetV = Math.max(selectedVerse - GRID_ROW_SIZE, 1);
    if (targetV !== selectedVerse) {
      setSelectedVerse(targetV);
      if (hasSentToObs) {
        sendVerseToObs(selectedBook, selectedChapter, targetV);
      }
    }
  }, [selectedBook, selectedChapter, selectedVerse, hasSentToObs, sendVerseToObs]);

  // Explicit clear: push null to OBS
  // Also hides all MCE_BibleLT_* lower-third sources in every scene they were pushed to
  const handleClear = useCallback(async () => {
    setHasSentToObs(false);

    if (presentationMode) {
      onClearScreen?.();
      return;
    }

    await Promise.all([
      bibleObsService.clearOverlay(fullLiveScenes.length > 0 ? fullLiveScenes : undefined).catch((err) => {
        console.warn("[BibleModule] Fullscreen clear failed:", err);
      }),
      (async () => {
        try {
          await ensureDockObsClientConnected();
          await dockObsClient.clearBible();
        } catch (err) {
          console.warn("[BibleModule] Dock Bible clear failed:", err);
        }
      })(),
    ]);
    setFullLiveScenes([]);

    // Hide lower-third sources in all scenes they were sent to
    if (obsService.isConnected && ltLiveScenes.length > 0) {
      (async () => {
        for (const sceneName of ltLiveScenes) {
          try {
            const sceneItems = await obsService.getSceneItemList(sceneName);
            for (const item of sceneItems) {
              if (OCS_BIBLE_LT_PATTERN.test(item.sourceName) || VC_BIBLE_LT_PATTERN.test(item.sourceName)) {
                await obsService.call("SetSceneItemEnabled", {
                  sceneName,
                  sceneItemId: item.sceneItemId,
                  sceneItemEnabled: false,
                });
              }
            }
          } catch (err) {
            console.warn(`[BibleModule] Clear: failed to hide LT in "${sceneName}":`, err);
          }
        }
        setLtLiveScenes([]);
      })();
    }
  }, [fullLiveScenes, ltLiveScenes, presentationMode, onClearScreen]);

  // Chapter navigation (Shift+Arrow)
  const handleNextChapter = useCallback(() => {
    if (!selectedBook || !selectedChapter) return;
    if (selectedChapter < currentChapterCount) {
      const next = selectedChapter + 1;
      setSelectedChapter(next);
      setSelectedVerse(1);
      setHasSentToObs(false);
    }
  }, [selectedBook, selectedChapter, currentChapterCount]);

  const handlePrevChapter = useCallback(() => {
    if (!selectedBook || !selectedChapter) return;
    if (selectedChapter > 1) {
      const prev = selectedChapter - 1;
      setSelectedChapter(prev);
      setSelectedVerse(1);
      setHasSentToObs(false);
    }
  }, [selectedBook, selectedChapter]);

  const openCommandPalette = useCallback((initialQuery = "") => {
    setActiveUtilityTab("none");
    setCommandPaletteInitialQuery(initialQuery);
    setShowCommandPalette(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isActive) return;
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      // Don't intercept keys when any modal/overlay is open or search dropdown is active
      if (showLibrary || showThemeModal || showQuickSetup || showLayoutModal || showCommandPalette) return;
      if (activeUtilityTab === "search") return;
      // Also bail if a global search overlay is present (from ServiceHubPage)
      if (document.querySelector(".gs-backdrop")) return;

      const isAlphaNumericKey = e.key.length === 1 && /[a-z0-9]/i.test(e.key);
      if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        openCommandPalette("");
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && isAlphaNumericKey) {
        e.preventDefault();
        openCommandPalette(e.key);
        return;
      }

      // Ctrl+D / Cmd+D → toggle favorite
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        handleToggleFavoriteCurrent();
        return;
      }
      // Cmd+1-9 / Ctrl+1-9 → switch to Nth theme
      if ((e.ctrlKey || e.metaKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx < state.themes.length) {
          setTheme(state.themes[idx].id);
        }
        return;
      }
      // Shift+Arrow → chapter navigation
      if (e.shiftKey) {
        switch (e.key) {
          case "ArrowLeft": e.preventDefault(); handlePrevChapter(); return;
          case "ArrowRight": e.preventDefault(); handleNextChapter(); return;
          case "ArrowUp": e.preventDefault(); handlePrevChapter(); return;
          case "ArrowDown": e.preventDefault(); handleNextChapter(); return;
        }
      }
      // Arrow keys → verse navigation
      // Left/Right = move by 1 (horizontal in grid), Up/Down = jump by row (6 columns)
      switch (e.key) {
        case "ArrowRight": e.preventDefault(); void handleNextVerse(); break;
        case "ArrowLeft": e.preventDefault(); void handlePrevVerse(); break;
        case "ArrowDown": e.preventDefault(); handleJumpVerseForward(); break;
        case "ArrowUp": e.preventDefault(); handleJumpVerseBackward(); break;
        case "Escape": e.preventDefault(); handleClear(); break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isActive, handleNextVerse, handlePrevVerse, handleJumpVerseForward, handleJumpVerseBackward, handleNextChapter, handlePrevChapter, handleClear, handleToggleFavoriteCurrent, state.themes, setTheme, showLibrary, showThemeModal, showQuickSetup, showLayoutModal, showCommandPalette, activeUtilityTab, openCommandPalette]);

  // Push slide to OBS — now handled by BibleProvider's global effect.
  // This keeps the live output stable across page navigations (e.g. to/from /bible/templates).

  const handleTranslationChange = useCallback((t: BibleTranslation) => {
    dispatch({ type: "SET_TRANSLATION", translation: t });
  }, [dispatch]);

  // Broadcast Setup
  const handleSetupObs = useCallback(async () => {
    try {
      const result = await bibleObsService.ensureBrowserSource(undefined, activeTheme?.templateType);
      alert(`Bible overlay created!\nScene: ${result.sceneName}\nItem ID: ${result.sceneItemId}`);
    } catch (err) {
      alert(`Failed to setup OBS: ${err instanceof Error ? err.message : err}`);
    }
  }, [activeTheme]);

  // Live verse range for verse list highlight
  const liveVerseRange = useMemo(() => {
    if (!currentQueueItem) return null;
    if (currentQueueItem.passage.book !== selectedBook || currentQueueItem.passage.chapter !== selectedChapter) return null;
    return { start: currentQueueItem.passage.startVerse, end: currentQueueItem.passage.endVerse };
  }, [currentQueueItem, selectedBook, selectedChapter]);

  // Favorite references as Set for quick lookup
  const favoriteRefs = useMemo(() => new Set(state.favorites.map(f => f.reference)), [state.favorites]);

  // Handle utility tab toggle
  const toggleUtilityTab = useCallback((tab: "favorites" | "history" | "search") => {
    setActiveUtilityTab(prev => {
      const next = prev === tab ? "none" : tab;
      // Auto-focus search input when opening the search tab
      if (next === "search") {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      return next;
    });
  }, []);

  // Debounced Bible keyword search + smart reference parsing
  const handleSearchInput = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setRefMatches([]);
      setIsSearching(false);
      return;
    }

    // Immediately try smart reference parsing (synchronous, fast)
    try {
      const refs = parseBibleSearch(trimmed);
      setRefMatches(refs.map(r => ({ book: r.book, chapter: r.chapter, verse: r.verse, label: r.label })));
    } catch {
      setRefMatches([]);
    }

    // Also do keyword search (async, debounced)
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchBible(trimmed, state.translation, 200);
        setSearchResults(results);
      } catch (err) {
        console.error("Bible search error:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, [state.translation]);

  // Navigate to a search result
  const handleSearchResultClick = useCallback((result: SearchResult) => {
    setSelectedBook(result.book);
    setSelectedChapter(result.chapter);
    setSelectedVerse(result.verse);
    setActiveUtilityTab("none");
    sendVerseToObs(result.book, result.chapter, result.verse);
  }, [sendVerseToObs]);

  const handleCommandPaletteSelectBibleVerse = useCallback((book: string, chapter: number, verse: number) => {
    setSelectedBook(book);
    setSelectedChapter(chapter);
    setSelectedVerse(verse);
    setHasSentToObs(false);
    setActiveUtilityTab("none");
  }, []);

  const handleCommandPaletteSelectTemplate = useCallback((templateKind: "bible" | "lower-third", themeId: string) => {
    if (templateKind === "bible") {
      const theme = state.themes.find((candidate) => candidate.id === themeId);
      if (!theme) return;
      setTheme(theme.id);
      setLayoutMode(theme.templateType === "lower-third" ? "lower-third" : "fullscreen");
      if (theme.templateType === "lower-third") {
        if (!selectedLTTheme && BIBLE_LOWER_THIRD_THEMES.length > 0) {
          setSelectedLTTheme(BIBLE_LOWER_THIRD_THEMES[0]);
        }
        loadLtScenes();
        void prepareForLowerThirdMode();
      }
      setShowThemeModal(false);
      return;
    }

    const theme = LT_ALL_THEMES.find((candidate) => candidate.id === themeId);
    if (!theme) return;
    setSelectedLTTheme(theme);
    setLayoutMode("lower-third");
    loadLtScenes();
    void prepareForLowerThirdMode();
    setShowThemeModal(false);
  }, [loadLtScenes, prepareForLowerThirdMode, selectedLTTheme, setTheme, state.themes]);

  // Click a history/favorite item → navigate to that verse
  const handleJumpToPassage = useCallback((p: BiblePassage) => {
    setSelectedBook(p.book);
    setSelectedChapter(p.chapter);
    setSelectedVerse(p.startVerse);
    setActiveUtilityTab("none");
    sendVerseToObs(p.book, p.chapter, p.startVerse);
  }, [sendVerseToObs]);

  // Clear history
  const handleClearHistory = useCallback(() => {
    dispatch({ type: "SET_HISTORY", history: [] });
    clearHistory().catch(console.error);
  }, [dispatch]);

  // ── Theme modal: right-click context menu handlers ──
  const handleThemeContextMenu = useCallback((e: React.MouseEvent, themeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setThemeContextMenu({ x: e.clientX, y: e.clientY, themeId });
  }, []);

  const openThemeTemplates = useCallback((routeState?: { createNew?: boolean; editThemeId?: string }) => {
    setThemeContextMenu(null);
    setShowThemeModal(false);
    setShowQuickSetup(false);
    window.setTimeout(() => {
      navigate(templatesPath, routeState ? { state: routeState } : undefined);
    }, 0);
  }, [navigate, templatesPath]);

  const handleThemeEdit = useCallback((themeId: string) => {
    openThemeTemplates({ editThemeId: themeId });
  }, [openThemeTemplates]);

  const handleThemeToggleHidden = useCallback((themeId: string) => {
    setThemeContextMenu(null);
    const theme = state.themes.find(t => t.id === themeId);
    if (!theme) return;
    dispatch({ type: "UPDATE_THEME", theme: { ...theme, hidden: !theme.hidden } });
  }, [state.themes, dispatch]);

  // ── Theme modal: drag-to-reorder handlers ──
  const handleThemeDragStart = useCallback((e: React.DragEvent, themeId: string) => {
    e.dataTransfer.effectAllowed = "move";
    setDragThemeId(themeId);
  }, []);

  const handleThemeDragOver = useCallback((e: React.DragEvent, themeId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverThemeId(themeId);
  }, []);

  const handleThemeDrop = useCallback((e: React.DragEvent, targetThemeId: string) => {
    e.preventDefault();
    if (!dragThemeId || dragThemeId === targetThemeId) {
      setDragThemeId(null);
      setDragOverThemeId(null);
      return;
    }
    const fromIndex = state.themes.findIndex(t => t.id === dragThemeId);
    const toIndex = state.themes.findIndex(t => t.id === targetThemeId);
    if (fromIndex >= 0 && toIndex >= 0) {
      dispatch({ type: "REORDER_THEMES", fromIndex, toIndex });
    }
    setDragThemeId(null);
    setDragOverThemeId(null);
  }, [dragThemeId, state.themes, dispatch]);

  const handleThemeDragEnd = useCallback(() => {
    setDragThemeId(null);
    setDragOverThemeId(null);
  }, []);

  const visibleFullThemes = useMemo(
    () => state.themes.filter((theme) => !theme.hidden && theme.templateType === "fullscreen"),
    [state.themes],
  );

  const activeFullTheme = useMemo(() => {
    const selected = visibleFullThemes.find((theme) => theme.id === state.activeThemeId);
    if (selected) return selected;
    if (activeTheme && !activeTheme.hidden && activeTheme.templateType === "fullscreen") return activeTheme;
    return visibleFullThemes[0] ?? null;
  }, [activeTheme, state.activeThemeId, visibleFullThemes]);

  const previewTheme = useMemo<BibleTheme | null>(() => activeTheme ?? activeFullTheme, [activeFullTheme, activeTheme]);

  const applyPreviewThemePatch = useCallback((patch: Partial<BibleThemeSettings>) => {
    if (!previewTheme) return;
    const nextTheme: BibleTheme = {
      ...previewTheme,
      settings: {
        ...previewTheme.settings,
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: "UPDATE_THEME", theme: nextTheme });
    if (previewTheme.source === "custom") {
      void saveCustomTheme(nextTheme).catch(console.error);
    }
  }, [dispatch, previewTheme]);

  useEffect(() => {
    if (layoutMode !== "fullscreen") return;
    if (visibleFullThemes.length === 0) return;
    if (visibleFullThemes.some((theme) => theme.id === state.activeThemeId)) return;
    setTheme(visibleFullThemes[0].id);
  }, [layoutMode, visibleFullThemes, state.activeThemeId, setTheme]);

  // Fill verseText from chapter data
  const [ltVerseText, setLtVerseText] = useState("");
  useEffect(() => {
    if (!selectedBook || !selectedChapter || !selectedVerse) {
      setLtVerseText("");
      return;
    }
    let cancelled = false;
    getChapter(selectedBook, selectedChapter, state.translation).then((passage) => {
      if (cancelled) return;
      const vd = passage.verses.find(v => v.verse === selectedVerse);
      setLtVerseText(vd?.text ?? "");
    }).catch((err) => {
      if (cancelled) return;
      console.warn("[BibleModule] Failed to load lower-third verse text:", err);
      setLtVerseText("");
    });
    return () => { cancelled = true; };
  }, [selectedBook, selectedChapter, selectedVerse, state.translation]);

  const selectedPreviewSlide = useMemo(() => {
    const verseText = ltVerseText.trim();
    if (!selectedBook || !selectedChapter || !selectedVerse || !verseText) {
      return null;
    }

    const previewPassage: BiblePassage = {
      reference: `${selectedBook} ${selectedChapter}:${selectedVerse}`,
      book: selectedBook,
      chapter: selectedChapter,
      startVerse: selectedVerse,
      endVerse: selectedVerse,
      verses: [{
        book: selectedBook,
        chapter: selectedChapter,
        verse: selectedVerse,
        text: verseText,
        abbrev: "",
      }],
      translation: state.translation,
    };

    return generateSlides(previewPassage, state.slideConfig)[0] ?? null;
  }, [
    ltVerseText,
    selectedBook,
    selectedChapter,
    selectedVerse,
    state.slideConfig,
    state.translation,
  ]);

  useEffect(() => {
    const becameActive = !presentationTabWasActiveRef.current && isActive;
    presentationTabWasActiveRef.current = isActive;

    if (becameActive) return;
    if (!presentationMode || !isActive || !selectedBook || !selectedChapter || !selectedVerse) return;
    const text = ltVerseText.trim();
    if (!text) return;
    onPresentToScreen?.({
      book: selectedBook,
      chapter: selectedChapter,
      verse: selectedVerse,
      translation: state.translation,
      text,
      themeId: state.activeThemeId,
      verseCount: currentVerseCount,
    });
  }, [
    presentationMode,
    isActive,
    selectedBook,
    selectedChapter,
    selectedVerse,
    state.translation,
    ltVerseText,
    onPresentToScreen,
  ]);

  // Handle selecting a LT Bible theme
  const handleSelectLTTheme = useCallback((ltTheme: LowerThirdTheme) => {
    setSelectedLTTheme(ltTheme);
    setLayoutMode("lower-third");
    loadLtScenes();
    setShowThemeModal(false);
  }, [loadLtScenes]);
  // ── Real-time LT update: when verse changes and LT is live, auto-push ──
  const ltLiveScenesRef = useRef(ltLiveScenes);
  ltLiveScenesRef.current = ltLiveScenes;
  const selectedLTThemeRef = useRef(selectedLTTheme);
  selectedLTThemeRef.current = selectedLTTheme;
  const ltSizeRef = useRef(ltSize);
  ltSizeRef.current = ltSize;

  useEffect(() => {
    const scenes = ltLiveScenesRef.current;
    const theme = selectedLTThemeRef.current;
    if (!theme || scenes.length === 0 || !ltVerseText || !obsService.isConnected) return;

    const verseRef = `${selectedBook} ${selectedChapter}:${selectedVerse} (${state.translation})`;
    const values: Record<string, string> = {};
    for (const v of theme.variables) {
      if (v.key === "reference") values.reference = verseRef;
      else if (v.key === "verseText") values.verseText = ltVerseText;
      else if (v.key === "label") values.label = v.defaultValue || "Scripture";
      else values[v.key] = v.defaultValue || "";
    }
    const url = buildOverlayUrl(theme, values, true, false, ltSizeRef.current);

    // Update all live scenes
    for (const sceneName of scenes) {
      const sourceName = `MCE_BibleLT_${sceneName}`;
      obsService.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: { url, width: 1920, height: 1080 },
      }).catch(err => console.warn(`[BibleModule] LT auto-update failed for "${sceneName}":`, err));
    }
  }, [ltVerseText, selectedBook, selectedChapter, selectedVerse, state.translation]);

  // ── Colour mode class computation ──
  const effectiveColorMode = useMemo(() => {
    if (state.colorMode === "system") {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return state.colorMode;
  }, [state.colorMode]);

  const rootClassName = useMemo(() => {
    const parts = ["bible-home"];
    if (effectiveColorMode === "light") parts.push("light-mode");
    if (state.reduceMotion) parts.push("reduce-motion");
    if (state.highContrast) parts.push("high-contrast");
    if (presentationMode) parts.push("bible-home--presentation");
    return parts.join(" ");
  }, [effectiveColorMode, state.reduceMotion, state.highContrast, presentationMode]);

  return (
    <div
      id="bible-module-root"
      className={`${rootClassName} bible-style-root${sendFlash ? " bible-send-flash" : ""}`}
      data-module="bible"
    >
      {/* ═══ HEADER ═══ */}
      <div id="bible-header" className="bible-header bible-style-header">
        <div className="bible-header-left">
          <button className="bible-nav-btn" onClick={() => navigate(homePath)} title="Back to Layouts">
            <Icon name="arrow_back" size={20} />
            {presentationMode ? "Presentation" : "Layouts"}
          </button>
          <span className="bible-header-divider" />
          <span className="bible-header-title">
            <Icon name="menu_book" size={20} />
            Bible
          </span>
          <span className="bible-header-divider" />
          {/* Translation switcher */}

          {/* Bible Library button */}
          <button
            className="bible-header-icon-btn"
            onClick={() => setShowLibrary(true)}
            title="Bible Library — Download translations"
          >
            <Icon name="library_books" size={20} />
          </button>
        </div>

        {/* <div className="bible-header-center">
          <span className="bible-now-displaying">{nowDisplaying}</span>
        </div> */}

        <div className="bible-header-right">
          {/* Show Bible fullscreen in OBS */}
          {/* <button
            className="bible-header-fullscreen-btn"
            onClick={handleShowBibleFullscreen}
            disabled={!obsConnected}
            title="Show Bible fullscreen in OBS"
          >
            <Icon name="cast" size={20} />
            Show in OBS
          </button> */}

          {/* OBS Status chip */}
          {/* <div className={`bible-obs-status ${obsConnected ? "connected" : ""}`}>
            <span className="bible-obs-dot" />
            <span>OBS {obsConnected ? "Connected" : "Disconnected"}</span>
          </div> */}

          <div className="bible-footer-left">
            <button
              className="bible-footer-btn clear"
              onClick={() => handleClear()}
              title={presentationMode ? "Clear presentation screen (Esc)" : "Clear output (Esc)"}
            >
              <Icon name="block" size={20} />
              {presentationMode ? "Clear Screen" : "Clear"}
            </button>
          </div>
          {/* Toggle right sidebar */}
          <button
            className="bible-footer-btn clear"
            onClick={() => {
              setShowPreview((prev) => {
                const next = !prev;
                if (next && rightPanelWidth < RIGHT_PANEL_MIN_WIDTH) {
                  setRightPanelWidth(RIGHT_PANEL_DEFAULT_WIDTH);
                }
                return next;
              });
            }}
            title={showPreview ? "Hide sidebar" : "Show sidebar"}
          >
            <Icon name={showPreview ? "chevron_right" : "chevron_left"} size={20} />
            {showPreview ? "Hide Sidebar" : "Show Sidebar"}
          </button>
        </div>
      </div>

      {/* ═══ MAIN BODY ═══ */}
      <div id="bible-main" className="bible-main bible-style-main">
        {/* LEFT — Verse List + Theme Trigger + Layout & Motion */}

        <aside
          id="bible-left-panel"
          className={`bible-left-panel bible-style-panel bible-style-panel-left${leftPanelCollapsed ? " collapsed" : ""}`}
          style={{
            width: leftPanelCollapsed ? 0 : leftPanelWidth,
            minWidth: leftPanelCollapsed ? 0 : leftPanelWidth,
          }}
        >

          <div id="bible-left-panel-verses" className="bible-left-panel-verses bible-style-panel-content">
            <VerseListPanel
              translation={state.translation}
              book={selectedBook}
              chapter={selectedChapter}
              selectedVerse={selectedVerse}
              liveVerseRange={liveVerseRange}
              favoriteRefs={favoriteRefs}
              installedTranslations={installedTranslations}
              onTranslationChange={handleTranslationChange}
              onSelectVerse={handleSelectVerse}
              onToggleFavorite={handleToggleFavoriteVerse}
              onOpenLibrary={() => setShowLibrary(true)}
              sentVerse={hasSentToObs ? selectedVerse : null}
            />
          </div>
        </aside>

        <div
          className={`bible-sidebar-resizer left${leftPanelCollapsed ? " collapsed" : ""}`}
          onMouseDown={(e) => beginSidebarResize("left", e)}
          title="Drag to resize left sidebar"
          role="separator"
          aria-orientation="vertical"
        />

        {/* CENTER — Utility Strip + Book & Chapter Grid */}
        <main id="bible-center-panel" className="bible-center-panel bible-style-panel bible-style-panel-center">
          {/* Utility Strip — Favorites + History */}
          <div className="bible-utility-strip">
            <span className="bible-utility-breadcrumb">
              {selectedBook} › Ch {selectedChapter} › v{selectedVerse}
            </span>
            <span className="bible-utility-spacer" />
            <div className="bible-utility-tabs">
              <button
                className={`bible-utility-tab${activeUtilityTab === "favorites" ? " active" : ""}`}
                onClick={() => toggleUtilityTab("favorites")}
                title="Favorites"
              >
                <Icon name="star" size={20} />
                Favorites
                {state.favorites.length > 0 && (
                  <span className="bible-utility-tab-badge">{state.favorites.length}</span>
                )}
              </button>
              <button
                className={`bible-utility-tab${activeUtilityTab === "history" ? " active" : ""}`}
                onClick={() => toggleUtilityTab("history")}
                title="History">
                <Icon name="history" size={20} />
                History
                {state.history.length > 0 && (
                  <span className="bible-utility-tab-badge">{state.history.length}</span>
                )}
              </button>
              <button
                className={`bible-utility-tab${activeUtilityTab === "search" || showCommandPalette ? " active" : ""}`}
                onClick={() => openCommandPalette("")}
                title="Search">
                <Icon name="search" size={20} />
                Search
              </button>
            </div>
          </div>

          {/* Favorites dropdown */}
          {activeUtilityTab === "favorites" && (
            <div className="bible-utility-dropdown b-scroll">
              <div className="bible-utility-dropdown-header">
                <span className="bible-utility-dropdown-title">Favorites</span>
              </div>
              <div className="bible-utility-list">
                {state.favorites.length === 0 ? (
                  <div className="bible-utility-empty">
                    No favorites yet — press <kbd>Ctrl+D</kbd> or click the ★ on a verse
                  </div>
                ) : (
                  state.favorites.slice(0, 5).map((fav) => (
                    <div
                      key={fav.reference}
                      className="bible-utility-item"
                      onClick={() => handleJumpToPassage(fav)}
                    >
                      <Icon name="star" size={20} className="bible-utility-item-icon fav" />
                      <span className="bible-utility-item-ref">{fav.reference}</span>
                      <button
                        className="bible-utility-item-remove"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(fav); }}
                        title="Remove"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* History dropdown */}
          {activeUtilityTab === "history" && (
            <div className="bible-utility-dropdown b-scroll">
              <div className="bible-utility-dropdown-header">
                <span className="bible-utility-dropdown-title">History</span>
                {state.history.length > 0 && (
                  <button className="bible-utility-dropdown-action" onClick={handleClearHistory} title="Clear">
                    Clear All
                  </button>
                )}
              </div>
              <div className="bible-utility-list">
                {state.history.length === 0 ? (
                  <div className="bible-utility-empty">
                    {presentationMode
                      ? "No history yet — verses you queue here will appear here"
                      : "No history yet — verses you send to OBS will appear here"}
                  </div>
                ) : (
                  state.history.slice(0, 5).map((entry, idx) => (
                    <div
                      key={`${entry.reference}-${idx}`}
                      className="bible-utility-item"
                      onClick={() => handleJumpToPassage(entry)}
                    >
                      <Icon name="schedule" size={20} className="bible-utility-item-icon" />
                      <span className="bible-utility-item-ref">{entry.reference}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Search dropdown */}
          {activeUtilityTab === "search" && (
            <div className="bible-utility-dropdown bible-search-dropdown b-scroll">
              <div className="bible-search-input-row">
                <Icon name="search" size={18} className="bible-search-input-icon" />
                <input
                  ref={searchInputRef}
                  className="bible-search-input"
                  type="text"
                  placeholder="Search Bible… (e.g. &quot;jhn316&quot;, &quot;grace&quot;, &quot;love your neighbor&quot;)"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  aria-label="Search Bible"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="bible-search-clear-btn"
                    onClick={() => { setSearchQuery(""); setSearchResults([]); setRefMatches([]); searchInputRef.current?.focus(); }}
                    aria-label="Clear Bible search"
                    title="Clear search"
                  >
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>

              {/* Smart reference matches (e.g. "jhn1623" → John 16:23) */}
              {refMatches.length > 0 && (
                <div className="bible-search-ref-section">
                  <div className="bible-search-ref-header">
                    <Icon name="menu_book" size={14} />
                    Go to reference
                  </div>
                  <div className="bible-search-ref-list">
                    {refMatches.map((ref, idx) => (
                      <button
                        key={`ref-${ref.label}-${idx}`}
                        className="bible-search-ref-chip"
                        onClick={() => {
                          const chapter = ref.chapter ?? 1;
                          const verse = ref.verse ?? 1;
                          setSelectedBook(ref.book);
                          setSelectedChapter(chapter);
                          setSelectedVerse(verse);
                          setActiveUtilityTab("none");
                          sendVerseToObs(ref.book, chapter, verse);
                        }}
                        title="Go forward">
                        <Icon name="arrow_forward" size={14} />
                        {ref.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isSearching && (
                <div className="bible-search-status">
                  <span className="bible-search-spinner" />
                  Searching…
                </div>
              )}
              {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && refMatches.length === 0 && (
                <div className="bible-search-status">
                  No results found for &ldquo;{searchQuery.trim()}&rdquo;
                </div>
              )}
              {!isSearching && searchResults.length > 0 && (
                <>
                  <div className="bible-search-result-count">
                    {searchResults.length >= 200 ? "200+ results" : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
                    <span className="bible-search-result-hint">
                      {presentationMode ? " — click to queue for presentation" : " — click to push to OBS"}
                    </span>
                  </div>
                  <div className="bible-search-results">
                    {searchResults.map((r, idx) => (
                      <div
                        key={`${r.book}-${r.chapter}-${r.verse}-${idx}`}
                        className="bible-search-result-item"
                        onClick={() => handleSearchResultClick(r)}
                      >
                        <span className="bible-search-result-ref">
                          {r.book} {r.chapter}:{r.verse}
                        </span>
                        <span
                          className="bible-search-result-snippet"
                          dangerouslySetInnerHTML={{
                            __html: r.snippet.replace(
                              new RegExp(`(${searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
                              '<mark class="bible-search-highlight">$1</mark>'
                            ),
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <BookChapterPanel
            translation={state.translation}
            selectedBook={selectedBook}
            selectedChapter={selectedChapter}
            selectedVerse={selectedVerse}
            onSelectBook={handleSelectBook}
            onSelectChapter={handleSelectChapter}
            onSelectVerse={handleSelectVerse}
            onDoubleClickBook={handleDoubleClickBook}
            onDoubleClickChapter={handleDoubleClickChapter}
          />
        </main>

        {/* RIGHT — Controls sidebar */}
        <div
          className={`bible-sidebar-resizer right${!showPreview ? " collapsed" : ""}`}
          onMouseDown={(e) => beginSidebarResize("right", e)}
          title="Drag to resize right sidebar"
          role="separator"
          aria-orientation="vertical"
        />

        <aside
          id="bible-right-panel"
          className={`bible-right-panel bible-style-panel bible-style-panel-right${!showPreview ? " collapsed" : ""}`}
          style={{
            width: showPreview ? rightPanelWidth : 0,
            minWidth: showPreview ? rightPanelWidth : 0,
          }}
        >
          {/* ── Preview ── */}
          <div className="bible-right-section bible-right-preview-section">
            <SlidePreview
              onClose={() => setShowPreview(false)}
              slide={selectedPreviewSlide}
              subtitle={selectedPreviewSlide ? "Selected verse" : undefined}
              themeSettings={previewTheme?.settings}
              templateType={previewTheme?.templateType}
            />
            {previewTheme?.settings && (
              <BiblePreviewControls
                settings={previewTheme.settings}
                activeTab={previewPanelTab}
                onTabChange={setPreviewPanelTab}
                onUpdate={applyPreviewThemePatch}
              />
            )}

          </div>

          {/* ── Layout & Motion ── */}


          {/* ── Pro Tools ── */}
          {/* <div className="bible-right-section bible-right-pro">
            <div className="bible-layout-header">
              <Icon name="build" size={20} />
              <span className="bible-layout-header-label">Pro Tools</span>
            </div>
            <div className="bible-right-pro-actions">
              <button className="bible-right-pro-btn" onClick={handleSetupObs} title="Setup OBS Browser Source">
                <Icon name="settings_input_antenna" size={20} />
                Broadcast Setup
              </button>
              <button className="bible-right-pro-btn" onClick={() => navigate(templatesPath)} title="Theme Settings">
                <Icon name="palette" size={20} />
                Themes
              </button>
              <button className="bible-right-pro-btn" onClick={() => navigate(settingsPath)} title="General Settings">
                <Icon name="settings" size={20} />
                Settings
              </button>
              <button className="bible-right-pro-btn" onClick={() => setShowQuickSetup(!showQuickSetup)} title="Quick Service Setup">
                <Icon name="bolt" size={20} />
                Quick Setup
              </button>
            </div>
          </div> */}
        </aside>
      </div>

      {/* ═══ FOOTER ═══ */}
      <div id="bible-footer" className="bible-footer bible-style-footer">




        <div className="bible-footer-right">
          <div className="bible-footer-hints">
            <span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>Shift+←</kbd><kbd>↓</kbd> Prev Ch.</span>
            <span><kbd>Shift+→</kbd><kbd>↑</kbd> Next Ch.</span>
            <span><kbd>Click</kbd> {presentationMode ? "Queue Verse" : "Push To OBS"}</span>
            <span><kbd>⌘/Ctrl+1-9</kbd> Theme</span>
            <span><kbd>Ctrl+D</kbd> Favorite</span>
            <span><kbd>Esc</kbd> {presentationMode ? "Clear Screen" : "Remove From OBS"}</span>
          </div>
        </div>
      </div>

      {/* ═══ THEME PICKER MODAL ═══ */}
      {showThemeModal && (
        <div className="bible-modal-overlay" onClick={() => { setShowThemeModal(false); setThemeContextMenu(null); }}>
          <div className="bible-modal" onClick={(e) => { e.stopPropagation(); setThemeContextMenu(null); }}>
            <div className="bible-modal-header">
              <Icon name={layoutMode === "lower-third" ? "subtitles" : "palette"} size={20} />
              <h3>{layoutMode === "lower-third" ? "Choose Lower Third Theme" : "Choose Theme"}</h3>
              <button className="bible-modal-close" onClick={() => setShowThemeModal(false)} title="Close">
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="bible-modal-body">
              {/* ── Full / Default Themes (only when layoutMode === fullscreen) ── */}
              {layoutMode === "fullscreen" && (
                <div className="bible-theme-modal-grid">
                  {visibleFullThemes.map((theme, idx) => {
                    const isActive = theme.id === state.activeThemeId;
                    const bgImg = theme.settings.backgroundImage;
                    const bgVideo = theme.settings.backgroundVideo;
                    const isDragOver = dragOverThemeId === theme.id && dragThemeId !== theme.id;
                    return (
                      <div
                        key={theme.id}
                        className={`bible-theme-modal-card${isActive ? " active" : ""}${isDragOver ? " drag-over" : ""}`}
                        onClick={() => { setTheme(theme.id); setShowThemeModal(false); }}
                        onContextMenu={(e) => handleThemeContextMenu(e, theme.id)}
                        draggable
                        onDragStart={(e) => handleThemeDragStart(e, theme.id)}
                        onDragOver={(e) => handleThemeDragOver(e, theme.id)}
                        onDrop={(e) => handleThemeDrop(e, theme.id)}
                        onDragEnd={handleThemeDragEnd}
                        style={{ opacity: dragThemeId === theme.id ? 0.4 : 1 }}
                      >
                        <ThemePreviewSurface
                          className="bible-theme-modal-preview"
                          videoSrc={bgVideo}
                          posterSrc={bgImg}
                          style={{
                            backgroundImage: bgImg ? `url(${bgImg})` : undefined,
                            backgroundColor: bgImg ? undefined : theme.settings.backgroundColor,
                            color: theme.settings.fontColor,
                            fontFamily: theme.settings.fontFamily,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>John 3:16</span>
                          <span style={{ fontSize: 9, opacity: 0.5 }}>Preview</span>
                        </ThemePreviewSurface>
                        <div className="bible-theme-modal-name">{theme.name}</div>
                        {idx < 9 && (
                          <div className="bible-theme-modal-shortcut">
                            {isMac ? "⌘" : "Ctrl+"}{idx + 1}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Lower Third Bible Themes (only when layoutMode === lower-third) ── */}
              {layoutMode === "lower-third" && BIBLE_LOWER_THIRD_THEMES.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 11, fontWeight: 700, color: "var(--b-text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    <Icon name="subtitles" size={14} />
                    Lower Third Overlays
                  </h4>
                  <div className="bible-theme-modal-grid">
                    {BIBLE_LOWER_THIRD_THEMES.map((ltTheme: LowerThirdTheme) => {
                      const isSelected = selectedLTTheme?.id === ltTheme.id;
                      return (
                        <div
                          key={ltTheme.id}
                          className={`bible-theme-modal-card${isSelected ? " active" : ""}`}
                          onClick={() => handleSelectLTTheme(ltTheme)}
                          title={ltTheme.name}
                        >
                          <div
                            className="bible-theme-modal-preview"
                            style={{
                              background: ltTheme.accentColor,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Icon name={ltTheme.icon} size={20} style={{ color: "#fff" }} />
                          </div>
                          <div className="bible-theme-modal-name">{ltTheme.name}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="bible-modal-footer">
              <button type="button" className="bible-modal-secondary" onClick={() => openThemeTemplates({ createNew: true })} title="Create">
                Create Theme
              </button>
              <button type="button" className="bible-modal-secondary" onClick={() => openThemeTemplates()} title="Manage Themes">
                Manage Themes
              </button>
              <button type="button" className="bible-modal-done" onClick={() => setShowThemeModal(false)} title="Done">
                Done
              </button>
            </div>
          </div>

          {/* ── Right-click context menu ── */}
          {themeContextMenu && (
            <div
              className="bible-theme-context-menu"
              style={{ top: themeContextMenu.y, left: themeContextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="bible-theme-context-item"
                onClick={() => handleThemeEdit(themeContextMenu.themeId)}
                title="Edit">
                <Icon name="edit" size={20} />
                Edit Theme
              </button>
              <button
                className="bible-theme-context-item"
                onClick={() => handleThemeToggleHidden(themeContextMenu.themeId)}
                title="Hide">
                <Icon name="visibility_off" size={20} />
                Hide Theme
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ LAYOUT CONFIRMATION MODAL ═══ */}
      {showLayoutModal && (
        <div className="bible-modal-overlay" onClick={cancelLayoutChange}>
          <div className="bible-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bible-modal-header">
              <Icon name="view_quilt" size={20} />
              <h3>Change Layout</h3>
              <button className="bible-modal-close" onClick={cancelLayoutChange} title="Close">
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="bible-modal-body">
              <p style={{ fontSize: 13, color: "var(--b-text-2)", lineHeight: 1.6 }}>
                This will change the overlay layout on OBS to <strong>{pendingLayoutMode === "fullscreen" ? "Fullscreen" : pendingLayoutMode === "lower-third" ? "Lower Third" : "Scene"}</strong>. The change will reflect immediately on your live output.
              </p>
              <p style={{ fontSize: 13, color: "var(--b-text-2)", marginTop: 12 }}>
                Do you want to continue?
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 11, color: "var(--b-text-3)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={skipLayoutConfirm}
                  onChange={(e) => {
                    setSkipLayoutConfirm(e.target.checked);
                    localStorage.setItem(getUserScopedKey("bible-skip-layout-confirm"), String(e.target.checked));
                  }}
                />
                Do not show this again
              </label>
            </div>
            <div className="bible-modal-footer">
              <button className="bible-modal-done" onClick={cancelLayoutChange} style={{ background: "var(--b-tile)" }} title="Cancel">
                Cancel
              </button>
              <button className="bible-modal-done" onClick={confirmLayoutChange} title="Continue">
                Yes, Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Setup Wizard Modal */}
      {showQuickSetup && (
        <div className="bible-modal-overlay" onClick={() => setShowQuickSetup(false)}>
          <div className="bible-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bible-modal-header">
              <Icon name="bolt" size={20} />
              <h3>Quick Service Setup</h3>
              <button className="bible-modal-close" onClick={() => setShowQuickSetup(false)} title="Close">
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="bible-modal-body">
              <div className="bible-setup-step">
                <span className="bible-setup-step-num">1</span>
                <div className="bible-setup-step-content">
                  <h4>OBS Scene</h4>
                  <p>Browser source will be created automatically</p>
                  <button className="bible-setup-action" onClick={handleSetupObs} title="Create">
                    <Icon name="add_circle" size={20} />
                    Create Bible Overlay in OBS
                  </button>
                </div>
              </div>
              <div className="bible-setup-step">
                <span className="bible-setup-step-num">2</span>
                <div className="bible-setup-step-content">
                  <h4>Theme</h4>
                  <p>Choose a visual theme for your overlay</p>
                  <button type="button" className="bible-setup-action" onClick={() => openThemeTemplates()} title="Select">
                    <Icon name="palette" size={20} />
                    Select Theme
                  </button>
                </div>
              </div>
              <div className="bible-setup-step">
                <span className="bible-setup-step-num">3</span>
                <div className="bible-setup-step-content">
                  <h4>Ready!</h4>
                  <p>Double-click any verse to send it live</p>
                </div>
              </div>
            </div>
            <div className="bible-modal-footer">
              <button className="bible-modal-done" onClick={() => setShowQuickSetup(false)} title="Done">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BIBLE LIBRARY MODAL ═══ */}
      <BibleLibrary
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        onTranslationsChanged={refreshInstalledTranslations}
      />

      <BibleCommandPalette
        open={showCommandPalette}
        initialQuery={commandPaletteInitialQuery}
        onClose={() => setShowCommandPalette(false)}
        onSelectBibleVerse={handleCommandPaletteSelectBibleVerse}
        onSelectTemplate={handleCommandPaletteSelectTemplate}
      />

      {/* ═══ TOAST NOTIFICATION ═══ */}
      {toastMessage && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: "#1E1E1E",
          color: "#fff",
          padding: "10px 20px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.08)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 8,
          animation: "fadeInUp 0.3s ease",
        }}>
          <Icon name="check_circle" size={16} style={{ color: "#00E676" }} />
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default BibleModule;
