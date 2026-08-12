/**
 * dockObsClient.ts — Lightweight OBS WebSocket client for the dock page.
 *
 * The dock runs in OBS's embedded CEF browser (or a separate browser tab),
 * which is a different process from the main Tauri app. BroadcastChannel
 * does NOT work cross-process, so the dock must talk to OBS directly.
 *
 * Strategy (dedicated overlay scenes):
 *   1. Connect to OBS WebSocket.
 *   2. Bible / Worship fullscreen: create a dedicated scene
 *      (e.g. "MCE Bible") containing the background + browser overlay
 *      sources. Then add that scene as a nested "scene source" into the
 *      user's current Preview or Program scene.
 *   3. Lower-thirds / Ticker: create a browser source directly in the
 *      user's scene (overlays are lightweight, no BG needed).
 *   4. "Send to Preview" → Auto-enable Studio Mode if off, then push
 *      overlay to Preview scene. Hide overlay in Program to prevent
 *      the global URL update from leaking across.
 *   5. "Go Live"         → push overlay to the current Program scene.
 *      Hide overlay in Preview to prevent cross-contamination.
 *   6. "Clear"           → blank / hide the overlay source.
 *
 * Connection params are resolved in this order:
 *   1. URL query params: ?obsUrl=ws://...&obsPassword=...
 *   2. localStorage key "mv-settings" (works if same origin)
 *   3. Default: ws://localhost:4455 with no password
 */

import OBSWebSocket from "obs-websocket-js";
import { getDefaultOBSUrl, getDefaultCanvasSize, getDefaultLowerThirdTheme } from "../services/desktopConfig";
import { normalizeOBSWebSocketUrl } from "../services/obsWebSocketUrl";
import { stripCompatModeCSS } from "../services/performanceManager";
import * as connTracker from "../services/obsConnectionTracker";
import * as obsQueue from "../services/obsRequestQueue";
import * as browserQueue from "../services/browserUpdateQueue";
import { ALL_THEMES, type ThemeLike } from "../lowerthirds/themes";
import { getWorshipLTFavorites } from "../services/favoriteThemes";
import { getOverlayBaseUrlSync, resolveOverlayAssetUrl } from "../services/overlayUrl";
import { OVERLAY_HTML_VERSION, buildVersionedOverlayUrl } from "../services/overlayVersion";
import { getMinistryData, buildSpeakerRoleMap } from "../services/ministryStore";
import { PRESENTATION_SCENE_NAME, PROGRAM_SCENE_SOURCE_NAME, SOURCE_NAMES, BG_SOURCE_NAMES, FULLSCREEN_SOURCE_NAMES, FULLSCREEN_BG_SOURCE_NAMES } from "../services/PresentationSceneManager";
import type { DockLiveThemeOverrides } from "./dockConsoleTheme";
import {
  DOCK_PREVIEW_STAGE_SUFFIX,
  normalizeDockStageBaseScene,
} from "../services/dockSceneNames";
import type { LiveToolOverlayPayload, LiveToolTemplate } from "../live-tools/types";
import { loadProjectionSettings } from "./dockProjectionSettings";
import { getUserScopedKey, readUserScopedStorage } from "../services/userScopedStorage";
import { overlayBridge } from "./dockOverlayBridge";
import { buildDockFontFamilyCss, loadDockFontFamily } from "./dockFontFamily";
import type { DockTranslationOrder } from "./dockTranslation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DockObsStatus = "disconnected" | "connecting" | "connected" | "error";

type StatusCallback = (status: DockObsStatus, error?: string) => void;

/** A minimal theme shape used by the dock for lower-third overlays */
export interface DockLTThemeRef {
  id: string;
  html: string;
  css: string;
}

export type DockSceneRouteModule = "bible" | "worship" | "notes" | "ticker" | "lower-third" | "countdown";

export interface DockBiblePushData {
  book: string;
  chapter: number;
  verse: number;
  verseEnd?: number;
  verseRange?: string;
  rawReferenceLabel?: string;
  referenceLabel?: string;
  displayReferenceLabel?: string;
  referenceBaseLabel?: string;
  translation: string;
  theme?: string;
  verseText?: string;
  overlayMode?: "fullscreen" | "lower-third";
  ltTheme?: DockLTThemeRef;
  bibleThemeSettings?: Record<string, unknown> | null;
  liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
  backgroundOnly?: boolean;
  compareEnabled?: boolean;
  compareLayout?: "line-by-line" | "side-by-side";
  translationA?: string;
  translationB?: string;
  compare?: {
    enabled?: boolean;
    layout?: "line-by-line" | "side-by-side";
    columns?: Array<{
      book: string;
      chapter: number;
      verse: number;
      verseEnd?: number;
      verseRange?: string;
      referenceLabel: string;
      translation: string;
      verseText: string;
    }>;
  } | null;
  /** Override target scene instead of using getTargetScene() */
  targetScene?: string;
}

export interface DockTabContentPushData {
  sectionText: string;
  translationText?: string;
  translationOrder?: DockTranslationOrder;
  sectionLabel: string;
  songTitle: string;
  artist?: string;
  overlayMode?: "fullscreen" | "lower-third";
  ltTheme?: DockLTThemeRef;
  values?: Record<string, string>;
  bibleThemeSettings?: Record<string, unknown> | null;
  liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
  backgroundOnly?: boolean;
}

export interface DockAudioInputSource {
  inputName: string;
  inputKind: string;
}

export interface DockMediaSendOptions {
  muted?: boolean;
  imageAudioInputName?: string | null;
  looping?: boolean;
  fitMode?: "cover" | "contain" | "stretch";
  transition?: "cut" | "fade";
  document?: DockDocumentMediaOptions;
}

export interface DockDocumentMediaOptions {
  pageNumber: number;
  pageCount: number;
  showBackground: boolean;
  showPageLabel: boolean;
  alignment: "left" | "center" | "right";
  zoom: number;
  offsetX: number;
  offsetY: number;
  legacyCanvas?: boolean;
}

interface DockPreviewSceneState {
  previewSceneName: string;
  originalSceneName: string;
  overlayType: string;
  createdAt: number;
  updatedAt: number;
}

/** Tab-specific preview scene identifiers */
export type DockPreviewTab = "bible" | "worship" | "announcements" | "notes" | "media" | "multiview" | "ai" | "ministry" | "lower-third";

/** All tabs now use the single MCE Presentation scene for preview */
const TAB_PREVIEW_SCENE_NAMES: Record<DockPreviewTab, string> = {
  bible: "MCE Presentation",
  worship: "MCE Presentation",
  announcements: "MCE Presentation",
  notes: "MCE Presentation",
  media: "MCE Presentation",
  multiview: "MCE Presentation",
  ai: "MCE Presentation",
  ministry: "MCE Presentation",
  "lower-third": "MCE Presentation",
};

/** Source names the dock creates as overlays in the user's scenes */
const DOCK_LT_SOURCE = "MCE Lower Third";
const DOCK_ANIMATED_LT_SOURCE = "MCE Animated Lower Thirds";
const DOCK_WORSHIP_SOURCE = "MCE Worship";
const DOCK_NOTES_SOURCE = "MCE Notes";
const DOCK_TICKER_SOURCE = "MCE Ticker";
/** Media player source for playing uploaded/library media */
const DOCK_MEDIA_VIDEO_SOURCE = "MCE Media Video";
const DOCK_MEDIA_IMAGE_SOURCE = "MCE Media Image";
const DOCK_MEDIA_IMAGE_AUDIO_SOURCE = "MCE Media Image Audio";
const DOCK_MEDIA_PATTERN_SOURCE = "MCE Media Pattern";
const DOCK_MEDIA_TEXT_SOURCE = "MCE Media Text";
const DOCK_LIVE_TOOL_SOURCE = "MCE Live Tools";
const DOCK_LIVE_TOOL_MEDIA_VIDEO_SOURCE = "MCE Live Tools Media Video";
const DOCK_LIVE_TOOL_MEDIA_IMAGE_SOURCE = "MCE Live Tools Media Image";
/** Background source placed BEHIND fullscreen overlays to prevent flash/twitch between slides */
const DOCK_FS_BG_SOURCE = "MCE Fullscreen BG";
/** Scene-local fullscreen background source prefix used in target scenes */
const DOCK_FS_TARGET_BG_PREFIX = "MCE Fullscreen Scene BG";
/** Single presentation scene holding all module sources */
const DOCK_PRESENTATION_SCENE = "MCE Presentation";
const DOCK_BIBLE_SCENE = DOCK_PRESENTATION_SCENE;
const DOCK_WORSHIP_SCENE = DOCK_PRESENTATION_SCENE;
const DOCK_MEDIA_SCENE = DOCK_PRESENTATION_SCENE;
const FULLSCREEN_CLEAR_WAIT_MS = 240;
const DOCK_PREVIEW_SCENE_STATE_KEY = "ocs-dock-preview-scene-state-v1";
const DOCK_OBS_RECONNECT_DELAY_MS = 300;
const DOCK_OBS_RECONNECT_MAX_DELAY_MS = 8000;
const DOCK_OBS_PARAMS_KEY = "ocs-dock-obs-params";
const DOCK_TICKER_CLEARANCE_FALLBACK_PX = 80;
const DOCK_TICKER_CLEARANCE_GAP_PX = 10;
const DOCK_TICKER_CLEARANCE_MAX_PX = 220;

type DockOverlayMode = "fullscreen" | "lower-third";

type PrimeBibleOverlayData = {
  book: string;
  chapter: number;
  verse: number;
  verseEnd?: number;
  verseRange?: string;
  rawReferenceLabel?: string;
  referenceLabel?: string;
  displayReferenceLabel?: string;
  referenceBaseLabel?: string;
  translation: string;
  verseText?: string;
  overlayMode?: DockOverlayMode;
  bibleThemeSettings?: Record<string, unknown> | null;
  liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
  backgroundOnly?: boolean;
  compareEnabled?: boolean;
  compareLayout?: "line-by-line" | "side-by-side";
  translationA?: string;
  translationB?: string;
  compare?: {
    enabled?: boolean;
    layout?: "line-by-line" | "side-by-side";
    columns?: Array<{
      book: string;
      chapter: number;
      verse: number;
      verseEnd?: number;
      verseRange?: string;
      referenceLabel: string;
      translation: string;
      verseText: string;
    }>;
  } | null;
};

type PrimeWorshipOverlayData = {
  sectionText: string;
  translationText?: string;
  translationOrder?: DockTranslationOrder;
  sectionLabel: string;
  songTitle: string;
  artist?: string;
  overlayMode?: DockOverlayMode;
  bibleThemeSettings?: Record<string, unknown> | null;
  liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
  backgroundOnly?: boolean;
};

type CssOverlayPacketTab = "bible" | "worship" | "announcements" | "sermon" | "notes" | "lower-third";

function readPersistedDockOverlayMode(
  tabType: "bible" | "worship" | "announcements" | "sermon" | "notes",
): DockOverlayMode | null {
  const preferencesKey = tabType === "bible"
    ? "ocs-dock-bible-preferences"
    : "ocs-dock-worship-preferences";
  try {
    const raw = readUserScopedStorage(preferencesKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { overlayMode?: unknown };
    return parsed.overlayMode === "fullscreen" || parsed.overlayMode === "lower-third"
      ? parsed.overlayMode
      : null;
  } catch {
    return null;
  }
}

interface DockResourceNames {
  ltSource: string;
  animatedLtSource: string;
  worshipSource: string;
  notesSource: string;
  tickerSource: string;
  mediaVideoSource: string;
  mediaImageSource: string;
  mediaImageAudioSource: string;
  mediaPatternSource: string;
  mediaTextSource: string;
  fsBgSource: string;
  fsTargetBgPrefix: string;
  bibleScene: string;
  worshipScene: string;
  mediaScene: string;
}

const DOCK_RESOURCES: DockResourceNames = {
  ltSource: DOCK_LT_SOURCE,
  animatedLtSource: DOCK_ANIMATED_LT_SOURCE,
  worshipSource: DOCK_WORSHIP_SOURCE,
  notesSource: DOCK_NOTES_SOURCE,
  tickerSource: DOCK_TICKER_SOURCE,
  mediaVideoSource: DOCK_MEDIA_VIDEO_SOURCE,
  mediaImageSource: DOCK_MEDIA_IMAGE_SOURCE,
  mediaImageAudioSource: DOCK_MEDIA_IMAGE_AUDIO_SOURCE,
  mediaPatternSource: DOCK_MEDIA_PATTERN_SOURCE,
  mediaTextSource: DOCK_MEDIA_TEXT_SOURCE,
  fsBgSource: DOCK_FS_BG_SOURCE,
  fsTargetBgPrefix: DOCK_FS_TARGET_BG_PREFIX,
  bibleScene: DOCK_BIBLE_SCENE,
  worshipScene: DOCK_WORSHIP_SCENE,
  mediaScene: DOCK_MEDIA_SCENE,
};

function getDockResources(): DockResourceNames {
  return DOCK_RESOURCES;
}

function getAllDockResources(): DockResourceNames[] {
  return [DOCK_RESOURCES];
}

// ---------------------------------------------------------------------------
// Built-in lower-third theme (embedded so dock works without the main app)
// ---------------------------------------------------------------------------

const DEFAULT_LT_THEME = {
  id: "dock-default-lt",
  html: `<div class="lt pos-bl in-up">
  <div class="panel speaker-panel" style="--bg:rgba(18,18,24,.92);--fg:#fff;--accent:#1D4ED8;--bd:rgba(255,255,255,.12);">
    <div class="v-divider"></div>
    <div class="col">
      <p class="name-line">{{name}}</p>
      <p class="role-line">{{role}}</p>
    </div>
  </div>
</div>`,
  css: `* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.lt { position: fixed; z-index: 40; pointer-events: none; }
.in-up { animation: fadeInUp .6s cubic-bezier(0.16,1,0.3,1) both; }

.pos-bl { left: 40px; bottom: 32px; }

.panel {
  background: var(--bg, rgba(18,18,24,.92));
  color: var(--fg, #fff);
  border: 1px solid var(--bd, rgba(255,255,255,.12));
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,.28);
  backdrop-filter: blur(12px);
}

.col { display: flex; flex-direction: column; min-width: 0; }

.speaker-panel {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 420px;
  max-width: min(900px, calc(100vw - 80px));
  padding: 22px 42px;
}

.v-divider {
  width: 5px;
  min-width: 5px;
  height: 72px;
  border-radius: 2px;
  background: var(--accent, #1D4ED8);
}

.name-line {
  font-size: clamp(28px, 2.2vw, 52px);
  font-weight: 700;
  line-height: 1.1;
  padding-inline: 6px;
}

.role-line {
  margin-top: 6px;
  font-size: clamp(18px, 1.4vw, 32px);
  font-weight: 400;
  line-height: 1.2;
  opacity: .8;
  padding-inline: 6px;
}`,
};

/**
 * Returns the default lower-third theme with config-driven colors.
 * Falls back to DEFAULT_LT_THEME if config is not yet loaded.
 */
function getDefaultLTTheme(): typeof DEFAULT_LT_THEME {
  const lt = getDefaultLowerThirdTheme();
  return {
    ...DEFAULT_LT_THEME,
    html: `<div class="lt pos-bl in-up">
  <div class="panel speaker-panel" style="--bg:${lt.backgroundColor};--fg:${lt.nameColor};--accent:${lt.titleColor};--bd:rgba(255,255,255,.12);">
    <div class="v-divider"></div>
    <div class="col">
      <p class="name-line" style="font-size:clamp(${lt.nameSize}px, 2.2vw, ${Math.round(lt.nameSize * 1.86)}px);">{{name}}</p>
      <p class="role-line">{{role}}</p>
    </div>
  </div>
</div>`,
  };
}

function normalizeThemeToken(value: string): string {
  return value.trim().toLowerCase();
}

function cleanWorshipObsLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed && !/^verse\s+\d+$/i.test(trimmed) ? trimmed : "";
}

function isLikelyCustomTheme(theme: ThemeLike): boolean {
  const signature = `${theme.id} ${theme.name || ""} ${(theme.tags || []).join(" ")} ${theme.category || ""}`.toLowerCase();
  return signature.includes("custom") || signature.includes("user");
}

function matchesThemeHints(theme: ThemeLike, hints: string[]): boolean {
  if (hints.length === 0) return true;

  const tagList = (theme.tags || []).map(normalizeThemeToken);
  const signature = `${theme.id} ${theme.name || ""} ${theme.category || ""} ${tagList.join(" ")}`.toLowerCase();

  return hints.some((hint) => {
    if (!hint) return false;
    if (signature.includes(hint)) return true;
    return tagList.some((tag) => tag === hint || tag.includes(hint) || hint.includes(tag));
  });
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

class DockObsClient {
  private static readonly NO_CLONE_UNDERLAY_CACHE_KEY = "__no-clone__";
  private obs = new OBSWebSocket();
  private _status: DockObsStatus = "disconnected";
  private _error = "";
  private listeners = new Set<StatusCallback>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connectPromise: Promise<void> | null = null;
  private _reconnectAttempts = 0;
  private _url = getDefaultOBSUrl();
  private _password: string | undefined;
  private _persistConnectionParams = true;
  private _hasTransientExplicitConnection = false;
  /** Track last overlay mode per source so we can force-reload when switching HTML files */
  private _lastOverlayMode: Record<string, string> = {};
  /** Last overlay mode for the unified Bible source ("fullscreen" | "lower-third") */
  private _lastBibleMode: string = "";
  /** Guard: only the current OBS instance can change status */
  private _obsGeneration = 0;
  private _cloneMap: Map<string, string> = new Map();
  private _previewSceneState: DockPreviewSceneState | null = null;
  /** Per-tab preview scene states — keyed by DockPreviewTab */
  private _previewSceneStates: Map<string, DockPreviewSceneState> = new Map();
  /** Per-tab Program scene snapshot taken before a push — used to restore on clear */
  private _programSceneBeforePush: Map<string, string> = new Map();

  /** Cached branding data loaded from the dock JSON file */
  private _brandingCache: { logoFileName: string; brandColor: string; churchName: string } | null = null;
  /** Cache scene-local fullscreen background payloads so repeated slide pushes do not reload them */
  private _lastTargetBgSignature: Record<string, string> = {};
  /** Cache fullscreen browser-source config so verse changes do not force source reloads */
  private _lastFullscreenSourceSignature: Record<string, string> = {};
  /** Cache browser-rendered fullscreen backgrounds for gradient / fallback cases. */
  private _lastFullscreenBgSignature: Record<string, string> = {};
  /** Keep the latest CSS-driven overlay packet per browser source for smooth verse/song updates and clears */
  private _lastCssOverlayPacketBySource: Record<string, Record<string, unknown>> = {};
  private _lastCssOverlayBaseUrlBySource: Record<string, string> = {};
  private _lastCssOverlayThemeCssBySource: Record<string, string> = {};
  /** Track the last browser source URL per input so identical verse pushes can skip reloads. */
  private _lastBrowserSourceUrlBySource: Record<string, string> = {};
  /** Avoid repeating expensive source order/fit checks on every fast overlay packet. */
  private _lastFastOverlayPrepAtBySource: Record<string, number> = {};
  /** The program scene has already been wired behind the Bible overlay. */
  private _lastBibleProgramScenePrepared = "";
  /** Serialize Bible overlay mutations so rapid verse clicks do not overlap OBS scene rebuilds. */
  private _bibleMutationTail: Promise<void> = Promise.resolve();
  private _lastBiblePushSignature = "";
  /** Counter for latest-only skip: incremented each time a new mutation is queued. */
  private _bibleMutationCounter = 0;
  /** Serialize Worship overlay mutations so rapid slide clicks do not overlap OBS scene rebuilds. */
  private _worshipMutationTail: Promise<void> = Promise.resolve();
  private _lastWorshipPushSignature = "";
  /** Counter for latest-only skip on worship: incremented each time a new mutation is queued. */
  private _worshipMutationCounter = 0;
  /** Announcement mutation counter for latest-only skip */
  private _announcementMutationCounter = 0;
  /** Serialize announcement overlay mutations so rapid slide clicks do not overlap */
  private _announcementMutationTail: Promise<void> = Promise.resolve();
  /** Serialize presentation-scene structural mutations to avoid duplicate scene-source inserts. */
  private _presentationMutationTail: Promise<void> = Promise.resolve();
  /** Short cache for the Program scene already placed under MCE Presentation. */
  private _presentationProgramUnderlayCache: { programScene: string; expiresAt: number } | null = null;
  /** Manual deletion of MCE Presentation can leave obs-websocket unsettled briefly. */
  private _presentationSceneDeletedAt = 0;
  private _presentationSceneRepairPromise: Promise<void> | null = null;
  private _lastAnnouncementPushSignature = "";
  private _announcementInitialized = false;
  private _notesMutationTail: Promise<void> = Promise.resolve();
  private _lastNotesPushSignature = "";
  private _notesMutationCounter = 0;
  private _notesInitialized = false;
  /** Skip clearAllOverlays on verse-to-verse transitions within the same mode */
  private _bibleLtInitialized = false;
  /** Skip clearAllOverlays on slide-to-slide transitions within the same mode (worship) */
  private _worshipInitialized = false;
  /** Deduped startup warm-up so first Bible/Worship push does not pay the full bootstrap cost. */
  private _startupPrewarmPromise: Promise<void> | null = null;
  /** Startup bootstrap promise for post-connect OBS readiness (prewarm + projection wiring). */
  private _startupReadyPromise: Promise<void> | null = null;
  /** Short-lived cache for GetSceneItemList results to avoid redundant round-trips within a single operation */
  private _sceneItemListCache: { sceneName: string; items: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex?: number }>; expiresAt: number } | null = null;
  /** Cache the program scene name; OBS scene-change events keep it fresh. */
  private _programSceneCache: { name: string; expiresAt: number } | null = null;
  /** Short-lived cache for canvas size to avoid redundant GetVideoSettings calls within a single push */
  private _canvasCache: { size: { width: number; height: number }; expiresAt: number } | null = null;
  /** Known scene names from OBS, updated on scene list/create/delete to avoid repeated GetSceneList calls */
  private _knownScenes: Set<string> = new Set();
  /** Active image-slideshow rotation timers keyed by source name */
  private _slideshowTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  /** Performance telemetry: recent call latencies (ms) */
  private _callLatencies: number[] = [];
  private _callLatencyWindowStart = 0;
  /** Cache active LT background theme signature per scene to skip redundant OBS calls */
  private _activeLtBgSignature: Record<string, string> = {};
  /** Cache active LT background input kind per scene to skip GetInputList when type unchanged */
  private _activeLtBgInputKind: Record<string, string> = {};
  /** Cache studio mode result for the session (rarely changes) */
  private _studioModeCache: { value: boolean; expiresAt: number } | null = null;
  /** Track confirmed-clone scene names so ensureClone skips getObsSceneNames */
  private _cloneExistsCache: Set<string> = new Set();
  /** Track last-applied BG item state per scene to skip redundant SetSceneItemTransform/Index/Enabled */
  private _lastBgItemState: Record<string, { sourceName: string; itemId: number; width: number; height: number }> = {};
  /** Track fullscreen browser scene item setup so repeated pushes skip transform/index churn */
  private _lastFullscreenSceneItemSignature: Record<string, string> = {};
  /** Fast-path signature for repeated fullscreen Bible pushes where only verse data changes */
  private _lastBibleFullscreenSetupSignature = "";
  /** Track active fullscreen native BG config so verse changes do not reapply it */
  private _activeFullscreenBgSignature: Record<string, string> = {};
  /** Track which MCE overlay source is live per scene so module switches do one cleanup pass */
  private _activeMceOverlayStateByScene: Record<string, string> = {};
  /** Remember the LT base Y so ticker clearance can be added/removed safely. */
  private _ltBasePosYBySceneItem: Map<string, number> = new Map();

  get status() { return this._status; }
  get isConnected() { return this._status === "connected"; }
  get error() { return this._error; }
  get url() { return this._url; }

  constructor() {
    // Load branding settings from dock JSON file (fire-and-forget)
    this._loadBranding();
    this._previewSceneState = this.loadPreviewSceneState();
    this.loadTabPreviewSceneStatesFromStorage();
    void this._ensureFullscreenBgSource;
    void this._ensureLowerThirdBgSource;
  }

  private resetObsStateCaches(): void {
    this._sceneItemListCache = null;
    this._programSceneCache = null;
    this._canvasCache = null;
    this._knownScenes.clear();
    this._startupPrewarmPromise = null;
    this._startupReadyPromise = null;
    this.resetPresentationSceneState();
    this._announcementMutationTail = Promise.resolve();
    this._announcementMutationCounter = 0;
  }

  private resetPresentationSceneState(): void {
    this._lastOverlayMode = {};
    this._lastBibleMode = "";
    this._lastTargetBgSignature = {};
    this._lastFullscreenSourceSignature = {};
    this._lastFullscreenBgSignature = {};
    this._lastFullscreenSceneItemSignature = {};
    this._lastBgItemState = {};
    this._lastBrowserSourceUrlBySource = {};
    this._lastCssOverlayPacketBySource = {};
    this._lastCssOverlayBaseUrlBySource = {};
    this._lastCssOverlayThemeCssBySource = {};
    this._lastFastOverlayPrepAtBySource = {};
    this._lastBibleProgramScenePrepared = "";
    this._lastBiblePushSignature = "";
    this._lastWorshipPushSignature = "";
    this._lastAnnouncementPushSignature = "";
    this._lastNotesPushSignature = "";
    this._lastBibleFullscreenSetupSignature = "";
    this._activeFullscreenBgSignature = {};
    this._activeMceOverlayStateByScene = {};
    this._presentationProgramUnderlayCache = null;
    this._activeLtBgSignature = {};
    this._activeLtBgInputKind = {};
    this._bgActiveSlot = {};
    this._ltBasePosYBySceneItem.clear();
    this._bibleLtInitialized = false;
    this._worshipInitialized = false;
    this._announcementInitialized = false;
    this._notesInitialized = false;
  }

  // ── Branding ──

  /** Load branding from the dock JSON file served by the overlay server */
  private async _loadBranding(): Promise<void> {
    try {
      const res = await fetch(`${this.getOverlayBaseUrl()}/uploads/dock-branding.json?_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      this._brandingCache = {
        logoFileName: data.brandLogoFileName || "",
        brandColor: data.brandColor || "",
        churchName: data.churchName || "",
      };
    } catch {
      // Branding file doesn't exist yet or server not ready — ignore
    }
  }

  async refreshBrandingCache(): Promise<void> {
    await this._loadBranding();
  }

  /** Get the resolved logo URL for lower-third overlays */
  private _getLogoUrl(): string {
    // 1. Try branding cache (loaded from dock-branding.json)
    if (this._brandingCache?.logoFileName) {
      return `${this.getOverlayBaseUrl()}/uploads/${encodeURIComponent(this._brandingCache.logoFileName)}`;
    }
    // 2. Fall back to ministry store logo
    const ministry = getMinistryData();
    if (ministry.logoPath) {
      const raw = ministry.logoPath.trim();
      if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
      const clean = raw.replace(/^\/+/, "");
      return `${this.getOverlayBaseUrl()}/${clean}`;
    }
    return "";
  }

  // ── Status ──

  private setStatus(s: DockObsStatus, error = "") {
    this._status = s;
    this._error = error;
    this.listeners.forEach((cb) => cb(s, error));
  }

  onStatusChange(cb: StatusCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ── Resolve connection params ──

  private resolveParams(url?: string, password?: string) {
    if (url) {
      this._url = normalizeOBSWebSocketUrl(url);
      this._password = password;
      return;
    }

    // 1. URL query params
    try {
      const params = new URLSearchParams(window.location.search);
      const qUrl = params.get("obsUrl");
      const qPw = params.get("obsPassword");
      if (qUrl) {
        this._url = normalizeOBSWebSocketUrl(qUrl);
        this._password = qPw || undefined;
        return;
      }
    } catch { /* ignore */ }

    // 2. Persisted dock connection params (from previous successful connect)
    try {
      const raw = localStorage.getItem(DOCK_OBS_PARAMS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.url) {
          this._url = normalizeOBSWebSocketUrl(p.url);
          this._password = p.password || undefined;
          return;
        }
      }
    } catch { /* ignore */ }

    // 3. localStorage mv-settings (legacy multiview store — try scoped key first)
    try {
      const scopedKey = getUserScopedKey("mv-settings");
      for (const key of [scopedKey, "mv-settings"]) {
        const stored = localStorage.getItem(key);
        if (stored) {
          const s = JSON.parse(stored);
          if (s.obsUrl) {
            this._url = normalizeOBSWebSocketUrl(s.obsUrl);
            this._password = s.obsPassword || undefined;
            return;
          }
        }
      }
    } catch { /* ignore */ }

    // 4. Default
    this._url = normalizeOBSWebSocketUrl(getDefaultOBSUrl());
    this._password = undefined;
  }

  /** Persist current connection params so dock auto-reconnects on next reload */
  private persistParams() {
    try {
      localStorage.setItem(DOCK_OBS_PARAMS_KEY, JSON.stringify({
        url: this._url,
        password: this._password || "",
      }));
    } catch { /* ignore */ }
  }

  // ── Connection ──

  async connect(
    url?: string,
    password?: string,
    forceReconnect = false,
    options?: { persist?: boolean },
  ) {
    const hasExplicitUrl = Boolean(url);
    if (!hasExplicitUrl && !forceReconnect) {
      if (this.isConnected) return;
      if (this._connectPromise) return this._connectPromise;
    }

    const previousUrl = this._url;
    const previousPassword = this._password;

    if (hasExplicitUrl) {
      this._persistConnectionParams = options?.persist !== false;
      this._hasTransientExplicitConnection = options?.persist === false;
      this.resolveParams(url, password);
    } else if (!this._hasTransientExplicitConnection) {
      this._persistConnectionParams = true;
      this.resolveParams();
    }

    const explicitParamsChanged = hasExplicitUrl &&
      (this._url !== previousUrl || this._password !== previousPassword);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.isConnected && !forceReconnect && !explicitParamsChanged) return;
    if (this._connectPromise && !forceReconnect && !explicitParamsChanged) return this._connectPromise;

    const connectPromise = (async () => {
      this.setStatus("connecting");

      // Increment generation — any callbacks from a prior OBS instance are stale
      const gen = ++this._obsGeneration;

      // Disconnect old instance before creating a new one.
      connTracker.unregister("dock-cef");
      try { await this.obs.disconnect(); } catch { /* ignore */ }

      try {
        this.obs = new OBSWebSocket();

        // Guard: only fire status changes if this is still the current generation
        this.obs.on("ConnectionClosed", () => {
          if (this._obsGeneration !== gen) return; // stale instance — ignore
          this.resetObsStateCaches();
          connTracker.unregister("dock-cef");
          this.setStatus("disconnected", "Connection closed");
          this.scheduleReconnect();
        });
        this.obs.on("ConnectionError" as never, () => {
          if (this._obsGeneration !== gen) return; // stale instance — ignore
          this.resetObsStateCaches();
          connTracker.unregister("dock-cef");
          this.setStatus("error", "Connection error");
          this.scheduleReconnect();
        });
        this.obs.on("StudioModeStateChange" as never, (data: { studioModeEnabled?: boolean } | unknown) => {
          if (this._obsGeneration !== gen) return;
          const enabled = Boolean((data as { studioModeEnabled?: boolean } | undefined)?.studioModeEnabled);
          this._studioModeCache = { value: enabled, expiresAt: Date.now() + 30_000 };
          if (!enabled) {
            this.onStudioModeDisabled().catch((err) =>
              console.warn("[DockOBS] Error handling studio mode disabled:", err),
            );
          }
        });
        this.obs.on("CurrentProgramSceneChanged" as never, (data: { sceneName?: string } | unknown) => {
          if (this._obsGeneration !== gen) return;
          const sceneName = String((data as { sceneName?: string } | undefined)?.sceneName || "").trim();
          if (!sceneName) return;
          this._programSceneCache = { name: sceneName, expiresAt: Date.now() + 30_000 };
          this._lastBibleFullscreenSetupSignature = "";
          if (sceneName !== DOCK_PRESENTATION_SCENE) {
            this._lastBibleProgramScenePrepared = "";
            this._lastFastOverlayPrepAtBySource = {};
            this._presentationProgramUnderlayCache = null;
          }
        });
        this.obs.on("CurrentPreviewSceneChanged" as never, (data: { sceneName?: string } | unknown) => {
          if (this._obsGeneration !== gen) return;
          const sceneName = String((data as { sceneName?: string } | undefined)?.sceneName || "").trim();
          if (sceneName && sceneName !== DOCK_PRESENTATION_SCENE) {
            this._lastFastOverlayPrepAtBySource = {};
          }
        });
        this.obs.on("SceneCreated" as never, (data: { sceneName?: string } | unknown) => {
          if (this._obsGeneration !== gen) return;
          const sceneName = String((data as { sceneName?: string } | undefined)?.sceneName || "").trim();
          if (sceneName) this._knownScenes.add(sceneName);
        });
        this.obs.on("SceneRemoved" as never, (data: { sceneName?: string } | unknown) => {
          if (this._obsGeneration !== gen) return;
          const sceneName = String((data as { sceneName?: string } | undefined)?.sceneName || "").trim();
          if (!sceneName) return;
          this._knownScenes.delete(sceneName);
          this._cloneExistsCache.delete(sceneName);
          delete this._activeMceOverlayStateByScene[sceneName];
          if (this._sceneItemListCache?.sceneName === sceneName) this._sceneItemListCache = null;
          if (this._programSceneCache?.name === sceneName) this._programSceneCache = null;
          if (sceneName === DOCK_PRESENTATION_SCENE) {
            this._presentationSceneDeletedAt = Date.now();
            this.resetPresentationSceneState();
          }
        });
        this.obs.on("SceneNameChanged" as never, (data: { oldSceneName?: string; sceneName?: string } | unknown) => {
          if (this._obsGeneration !== gen) return;
          const oldSceneName = String((data as { oldSceneName?: string } | undefined)?.oldSceneName || "").trim();
          const sceneName = String((data as { sceneName?: string } | undefined)?.sceneName || "").trim();
          if (oldSceneName) {
            this._knownScenes.delete(oldSceneName);
            this._cloneExistsCache.delete(oldSceneName);
            delete this._activeMceOverlayStateByScene[oldSceneName];
          }
          if (sceneName) this._knownScenes.add(sceneName);
          this._sceneItemListCache = null;
          if (this._programSceneCache?.name === oldSceneName) this._programSceneCache = null;
          if (oldSceneName === DOCK_PRESENTATION_SCENE) {
            this._presentationSceneDeletedAt = Date.now();
            this.resetPresentationSceneState();
          }
        });

        await Promise.race([
          this.obs.connect(this._url, this._password, { rpcVersion: 1 }),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("Connection timed out (5s)")), 5000)
          ),
        ]);

        // Verify this connect attempt is still the current one
        if (this._obsGeneration !== gen) return;

        this._reconnectAttempts = 0;
        this.resetObsStateCaches();
        // Mark the socket connected before any follow-up OBS RPCs. Otherwise
        // helper calls like ensureDedicatedScene() recurse back into connect()
        // and the dock stays stuck in "connecting".
        this.setStatus("connected");
        connTracker.register("dock-cef", this._url);

        // Persist normal dock connection params so auto-reconnect works across
        // dock reloads. Remote presentation uses a transient target and must
        // not overwrite the user's normal OBS settings.
        if (this._persistConnectionParams) {
          this.persistParams();
        }

        const startupPromise = (async () => {
          // A dock reload must not reorder, rebuild, or otherwise mutate the
          // MCE Presentation scene. Scene creation and source wiring now happen
          // only when an explicit dock command is sent.
        })();
        this._startupReadyPromise = startupPromise;
        void startupPromise;
      } catch (err) {
        if (this._obsGeneration !== gen) return; // stale — ignore
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[DockOBS] Connect failed:", msg);
        connTracker.unregister("dock-cef");
        this.resetObsStateCaches();
        this.setStatus("error", msg);
        this.scheduleReconnect();
      }
    })();

    this._connectPromise = connectPromise;
    try {
      await connectPromise;
    } finally {
      if (this._connectPromise === connectPromise) {
        this._connectPromise = null;
      }
    }
  }

  async disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Bump the generation so ConnectionClosed/ConnectionError events from
    // this deliberate disconnect cannot schedule an automatic reconnect.
    this._obsGeneration += 1;
    this._connectPromise = null;
    this._persistConnectionParams = true;
    this._hasTransientExplicitConnection = false;
    this.resetObsStateCaches();
    await this.deleteClone().catch(() => { });
    try { await this.obs.disconnect(); } catch { /* ignore */ }
    connTracker.unregister("dock-cef");
    this.setStatus("disconnected");
  }

  async prewarmPrimaryDockSources(): Promise<void> {
    if (this._startupPrewarmPromise) return this._startupPrewarmPromise;

    const warmupPromise = (async () => {
      if (!this.isConnected) {
        await this.connect();
        const deadline = Date.now() + 3000;
        while (!this.isConnected && Date.now() < deadline) {
          await this.sleep(100);
        }
        if (!this.isConnected) return;
      }

      const resources = getDockResources();
      const startupBlankTimestamp = Date.now();
      const bibleMode = readPersistedDockOverlayMode("bible") ?? "lower-third";
      const bibleBlankPacket = {
        slide: null,
        theme: null,
        live: false,
        blanked: true,
        timestamp: startupBlankTimestamp,
        mode: bibleMode,
      } as const;

      await this.ensurePresentationSceneReady().catch(() => { });
      await this.ensureProgramSceneAsSourceInPresentation(true).catch(() => { });

      const bibleSourceName = this._fullscreenSceneDefs["bible"].browserSourceName;
      const bibleBaseUrl = this.buildCssOverlayHtmlUrlForTab("bible", bibleSourceName);
      const bibleCss = this.buildCssOverlayDataCss({ ...bibleBlankPacket }, "");

      await this._ensureFullscreenScene("bible").catch(() => { });
      await this.ensureOverlaySource(DOCK_PRESENTATION_SCENE, bibleSourceName, undefined, undefined, true).catch(() => { });
      await this.setBrowserSourceUrl(bibleSourceName, bibleBaseUrl, false, bibleCss).catch(() => { });
      this._lastCssOverlayPacketBySource[bibleSourceName] = { ...bibleBlankPacket };
      this._lastCssOverlayBaseUrlBySource[bibleSourceName] = bibleBaseUrl;
      this._lastCssOverlayThemeCssBySource[bibleSourceName] = "";

      this._bibleLtInitialized = true;

      const worshipSourceName = resources.worshipSource;
      const worshipMode = readPersistedDockOverlayMode("worship") ?? "lower-third";
      const worshipBlankPacket = {
        slide: null,
        theme: null,
        live: false,
        blanked: true,
        timestamp: startupBlankTimestamp,
        mode: worshipMode,
      } as const;
      const worshipBaseUrl = this.buildCssOverlayHtmlUrlForTab("worship", worshipSourceName);
      const worshipCss = this.buildCssOverlayDataCss({ ...worshipBlankPacket }, "");

      await this.ensureDedicatedScene(resources.worshipScene).catch(() => { });
      await this.ensureOverlaySource(resources.worshipScene, worshipSourceName, undefined, undefined, true).catch(() => { });
      await this.ensureOverlaySource(DOCK_PRESENTATION_SCENE, worshipSourceName, undefined, undefined, true).catch(() => { });
      await this.setBrowserSourceUrl(worshipSourceName, worshipBaseUrl, false, worshipCss).catch(() => { });
      this._lastCssOverlayPacketBySource[worshipSourceName] = { ...worshipBlankPacket };
      this._lastCssOverlayBaseUrlBySource[worshipSourceName] = worshipBaseUrl;
      this._lastCssOverlayThemeCssBySource[worshipSourceName] = "";
      this._worshipInitialized = true;
    })();

    const trackedPromise = warmupPromise.finally(() => {
      if (this._startupPrewarmPromise === trackedPromise) {
        this._startupPrewarmPromise = null;
      }
    });
    this._startupPrewarmPromise = trackedPromise;

    return trackedPromise;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    // Exponential backoff: 300ms → 600ms → 1.2s → 2.4s → 4.8s → capped at 8s
    const delay = Math.min(
      DOCK_OBS_RECONNECT_DELAY_MS * Math.pow(2, this._reconnectAttempts),
      DOCK_OBS_RECONNECT_MAX_DELAY_MS,
    );
    this._reconnectAttempts++;
    if (this._reconnectAttempts === 1 || this._reconnectAttempts % 4 === 0) {
      console.log(`[DockOBS] Reconnect attempt ${this._reconnectAttempts}, delay ${delay}ms`);
    }
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this._status !== "connected") {
        await this.connect(this._url, this._password, true, { persist: this._persistConnectionParams });
      }
    }, delay);
  }

  async waitUntilReady(timeoutMs = 15000): Promise<void> {
    const startupPromise = this._startupReadyPromise;
    if (!startupPromise) return;

    await Promise.race([
      startupPromise,
      new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, timeoutMs);
      }),
    ]);
  }

  // ── OBS API helpers ──

  async call(requestType: string, requestData?: Record<string, unknown>): Promise<unknown> {
    // Auto-reconnect if not connected
    if (!this.isConnected) {
      await this.connect();
      // Poll until connected or timeout — much more reliable than a fixed sleep
      const deadline = Date.now() + 3000;
      while (!this.isConnected && Date.now() < deadline) {
        await this.sleep(100);
      }
    }
    if (!this.isConnected) throw new Error("Not connected to OBS");
    const t0 = Date.now();
    try {
      const request = () => obsQueue.enqueue(
        requestType,
        () => this.obs.call(requestType as never, requestData as never),
        { dedupeKey: requestData?.sceneName ? `${requestType}:${requestData.sceneName}` : undefined },
      );

      try {
        const result = await request();
        this.noteObsSceneMutation(requestType, requestData);
        return result;
      } catch (err) {
        if (!this.shouldRepairPresentationSceneReference(requestType, requestData, err)) {
          throw err;
        }

        // OBS removes the scene source before reporting the manual deletion to
        // the dock. Recreate the managed scene, then repeat the original add.
        await this.repairPresentationSceneReference();
        const result = await request();
        this.noteObsSceneMutation(requestType, requestData);
        return result;
      }
    } finally {
      this._trackCallLatency(Date.now() - t0, requestType);
    }
  }

  /**
   * Send multiple OBS requests in a single WebSocket frame via callBatch.
   * Bypasses the rate limiter since it's one network round-trip.
   * Use for independent calls that can execute in parallel (e.g., hiding multiple sources).
   */
  async callBatch(
    requests: Array<{ requestType: string; requestData?: Record<string, unknown> }>,
    executionType: 0 | 1 | 2 = 2, // default: Parallel
  ): Promise<Array<{ requestData?: unknown; requestStatus?: { code: number; comment?: string } }>> {
    if (!this.isConnected) {
      await this.connect();
      const deadline = Date.now() + 3000;
      while (!this.isConnected && Date.now() < deadline) {
        await this.sleep(100);
      }
    }
    if (!this.isConnected) throw new Error("Not connected to OBS");

    const t0 = Date.now();
    try {
      const batch = requests.map(r => ({
        requestType: r.requestType as never,
        requestData: r.requestData as never,
      }));
      const results = await this.obs.callBatch(batch, { executionType });
      for (const request of requests) {
        this.noteObsSceneMutation(request.requestType, request.requestData);
      }
      const elapsed = Date.now() - t0;
      if (elapsed > 500) {
        console.warn(`[DockOBS] Slow batch: ${requests.length} requests took ${elapsed}ms`);
      }
      return results as Array<{ requestData?: unknown; requestStatus?: { code: number; comment?: string } }>;
    } catch (err) {
      console.error(`[DockOBS] callBatch failed after ${Date.now() - t0}ms:`, err);
      throw err;
    }
  }

  /** Track call latency and warn when OBS is struggling. */
  private _trackCallLatency(durationMs: number, requestType: string): void {
    const now = Date.now();
    // Reset window every 30s
    if (now - this._callLatencyWindowStart > 30000) {
      if (this._callLatencies.length >= 10) {
        const sorted = [...this._callLatencies].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        if (p95 > 500) {
          console.warn(`[DockOBS] OBS slow — p50=${p50}ms p95=${p95}ms (${sorted.length} calls in 30s). OBS may be overloaded.`);
        } else if (p95 > 200) {
          console.log(`[DockOBS] OBS latency: p50=${p50}ms p95=${p95}ms`);
        }
      }
      this._callLatencies = [];
      this._callLatencyWindowStart = now;
    }
    this._callLatencies.push(durationMs);
    // Warn on individual slow calls
    if (durationMs > 1000 && requestType !== "Connect") {
      console.warn(`[DockOBS] Slow call: ${requestType} took ${durationMs}ms`);
    }
  }

  private async getCanvasSize(): Promise<{ width: number; height: number }> {
    const now = Date.now();
    if (this._canvasCache && now < this._canvasCache.expiresAt) {
      return this._canvasCache.size;
    }
    try {
      const video = await this.call("GetVideoSettings") as {
        baseWidth?: number;
        baseHeight?: number;
      };
      const fallback = getDefaultCanvasSize();
      const size = {
        width: Number(video.baseWidth) || fallback.width,
        height: Number(video.baseHeight) || fallback.height,
      };
      this._canvasCache = { size, expiresAt: now + 60_000 };
      return size;
    } catch {
      return getDefaultCanvasSize();
    }
  }

  private async fitSceneItemToCanvas(sceneName: string, sceneItemId: number): Promise<void> {
    const { width, height } = await this.getCanvasSize();
    const sceneItemTransform: Record<string, unknown> = {
      positionX: 0,
      positionY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      boundsType: "OBS_BOUNDS_STRETCH",
      boundsWidth: width,
      boundsHeight: height,
      boundsAlignment: 0,
      cropLeft: 0,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
    };
    try {
      await this.call("SetSceneItemTransform", {
        sceneName,
        sceneItemId,
        sceneItemTransform,
      });
    } catch { /* ignore — transform is best-effort */ }
  }

  private async fitSceneSourceToCanvas(sceneName: string, sourceName: string): Promise<void> {
    const item = await this.getSceneItemBySource(sceneName, sourceName);
    if (!item) return;
    await this.fitSceneItemToCanvas(sceneName, item.sceneItemId);
  }

  private isStaticFullFrameOverlaySource(sourceName: string): boolean {
    const resources = getDockResources();
    return sourceName === this._fullscreenSceneDefs["bible"]?.browserSourceName
      || sourceName === resources.worshipSource
      || sourceName === resources.notesSource;
  }

  private async fitSceneSourceToLowerThirdWindow(sceneName: string, sourceName: string): Promise<void> {
    if (this.isStaticFullFrameOverlaySource(sourceName)) {
      await this.fitSceneSourceToCanvas(sceneName, sourceName);
      return;
    }

    const item = await this.getSceneItemBySource(sceneName, sourceName);
    if (!item) return;
    const { width, height } = await this.getCanvasSize();
    const visibleHeight = Math.min(height, Math.max(360, Math.round(height * 0.42)));
    const cropTop = Math.max(0, height - visibleHeight);
    const sceneItemTransform: Record<string, unknown> = {
      positionX: 0,
      positionY: cropTop,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      boundsType: "OBS_BOUNDS_STRETCH",
      boundsWidth: width,
      boundsHeight: visibleHeight,
      boundsAlignment: 0,
      cropLeft: 0,
      cropTop,
      cropRight: 0,
      cropBottom: 0,
    };

    await this.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId: item.sceneItemId,
      sceneItemTransform,
    });
  }

  private async setSceneSourceEnabledByName(sceneName: string, sourceName: string, enabled: boolean): Promise<boolean> {
    const item = await this.getSceneItemBySource(sceneName, sourceName);
    if (!item) return false;
    await this.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId: item.sceneItemId,
      sceneItemEnabled: enabled,
    });
    this.invalidateSceneItemListCache(sceneName);
    return true;
  }

  private async fitSceneSourceToOverlayMode(
    sceneName: string,
    sourceName: string,
    _mode: DockOverlayMode,
  ): Promise<void> {
    // Both Fullscreen and Lower-Third use a unified full-canvas source.
    // Lower-third appearance is created by HTML/CSS inside the fixed source,
    // NOT by OBS cropping. This avoids scene-item resize/crop during mode switches.
    await this.fitSceneSourceToCanvas(sceneName, sourceName);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Get scene items with a short-lived cache (3s). Avoids redundant GetSceneItemList calls within a single operation. */
  private async getSceneItemListCached(sceneName: string): Promise<Array<{ sourceName: string; sceneItemId: number; sceneItemIndex?: number; sceneItemEnabled?: boolean }>> {
    const now = Date.now();
    if (this._sceneItemListCache && this._sceneItemListCache.sceneName === sceneName && this._sceneItemListCache.expiresAt > now) {
      return this._sceneItemListCache.items;
    }
    let resp: { sceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex: number; sceneItemEnabled: boolean }> };
    try {
      resp = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex: number; sceneItemEnabled: boolean }>;
      };
    } catch (err) {
      if (sceneName !== DOCK_PRESENTATION_SCENE || !this.isMissingObsSceneError(err)) {
        throw err;
      }

      this._knownScenes.delete(sceneName);
      this.invalidateSceneItemListCache(sceneName);
      this.resetPresentationSceneState();
      await this.ensurePresentationSceneReady();
      resp = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex: number; sceneItemEnabled: boolean }>;
      };
    }
    const items = resp.sceneItems ?? [];
    if (items.length > 20) {
      console.warn(`[DockOBS] Scene "${sceneName}" has ${items.length} items — this may cause slow rendering on older hardware.`);
    }
    this._sceneItemListCache = { sceneName, items, expiresAt: now + 3000 };
    return items;
  }

  /** Invalidate the scene item list cache for a specific scene (call after mutations). */
  private invalidateSceneItemListCache(sceneName?: string): void {
    if (!sceneName || !this._sceneItemListCache || this._sceneItemListCache.sceneName === sceneName) {
      this._sceneItemListCache = null;
    }
  }

  /**
   * OBS scene-item mutations must immediately clear our short-lived cache.
   * Otherwise a source can be disabled in OBS while the dock still believes
   * it is visible for up to 3 seconds, which causes the next push to no-op.
   */
  private noteObsSceneMutation(
    requestType: string,
    requestData?: Record<string, unknown>,
  ): void {
    const sceneName = typeof requestData?.sceneName === "string"
      ? requestData.sceneName.trim()
      : "";

    if (!sceneName) return;

    switch (requestType) {
      case "CreateInput":
      case "CreateSceneItem":
      case "DuplicateSceneItem":
      case "RemoveSceneItem":
      case "SetSceneItemEnabled":
      case "SetSceneItemIndex":
        this.invalidateSceneItemListCache(sceneName);
        this.invalidateActiveMceOverlayState(sceneName);
        break;
      default:
        break;
    }
  }

  private async runSerializedBibleMutation<T>(task: () => Promise<T>): Promise<T> {
    const mutationId = ++this._bibleMutationCounter;
    const previous = this._bibleMutationTail.catch(() => undefined);
    let release!: () => void;
    this._bibleMutationTail = previous.then(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await previous;
    try {
      // Skip intermediate pushes when a newer one is queued
      if (mutationId !== this._bibleMutationCounter) {
        return undefined as T;
      }
      return await task();
    } finally {
      release();
    }
  }

  private async runSerializedPresentationMutation<T>(task: () => Promise<T>): Promise<T> {
    const previous = this._presentationMutationTail.catch(() => undefined);
    let release!: () => void;
    this._presentationMutationTail = previous.then(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  private async runSerializedWorshipMutation<T>(task: () => Promise<T>): Promise<T> {
    const mutationId = ++this._worshipMutationCounter;
    const previous = this._worshipMutationTail.catch(() => undefined);
    let release!: () => void;
    this._worshipMutationTail = previous.then(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await previous;
    try {
      if (mutationId !== this._worshipMutationCounter) {
        return undefined as T;
      }
      return await task();
    } finally {
      release();
    }
  }

  private async runSerializedAnnouncementMutation<T>(task: () => Promise<T>): Promise<T> {
    const mutationId = ++this._announcementMutationCounter;
    const previous = this._announcementMutationTail.catch(() => undefined);
    let release!: () => void;
    this._announcementMutationTail = previous.then(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await previous;
    try {
      if (mutationId !== this._announcementMutationCounter) {
        return undefined as T;
      }
      return await task();
    } finally {
      release();
    }
  }

  private async runSerializedNotesMutation<T>(task: () => Promise<T>): Promise<T> {
    const mutationId = ++this._notesMutationCounter;
    const previous = this._notesMutationTail.catch(() => undefined);
    let release!: () => void;
    this._notesMutationTail = previous.then(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await previous;
    try {
      if (mutationId !== this._notesMutationCounter) {
        return undefined as T;
      }
      return await task();
    } finally {
      release();
    }
  }

  private buildBiblePushSignature(
    sceneName: string,
    currentProgramSceneBeforeTarget: string,
    data: {
      book: string;
      chapter: number;
      verse: number;
      verseEnd?: number;
      verseRange?: string;
      referenceLabel?: string;
      translation: string;
      theme?: string;
      verseText?: string;
      overlayMode?: "fullscreen" | "lower-third";
      backgroundOnly?: boolean;
      compareEnabled?: boolean;
      compareLayout?: "line-by-line" | "side-by-side";
      translationA?: string;
      translationB?: string;
      compare?: {
        enabled?: boolean;
        layout?: "line-by-line" | "side-by-side";
        columns?: Array<{
          book: string;
          chapter: number;
          verse: number;
          verseEnd?: number;
          verseRange?: string;
          referenceLabel: string;
          translation: string;
          verseText: string;
        }>;
      } | null;
      bibleThemeSettings?: Record<string, unknown> | null;
      liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
    },
  ): string {
    return JSON.stringify({
      sceneName,
      currentProgramSceneBeforeTarget,
      book: data.book,
      chapter: data.chapter,
      verse: data.verse,
      verseEnd: data.verseEnd ?? null,
      verseRange: data.verseRange ?? "",
      referenceLabel: data.referenceLabel ?? "",
      translation: data.translation,
      theme: data.theme ?? "",
      verseText: data.verseText ?? "",
      overlayMode: data.overlayMode ?? "fullscreen",
      backgroundOnly: Boolean(data.backgroundOnly),
      compareEnabled: Boolean(data.compareEnabled),
      compareLayout: data.compareLayout ?? "",
      translationA: data.translationA ?? "",
      translationB: data.translationB ?? "",
      compare: data.compare ?? null,
      bibleThemeSettings: data.bibleThemeSettings ?? null,
      liveOverrides: data.liveOverrides ?? null,
    });
  }

  private buildBibleFullscreenSetupSignature(
    sceneName: string,
    currentProgramSceneBeforeTarget: string,
    _themeSettings: Record<string, unknown> | null,
  ): string {
    const def = this._fullscreenSceneDefs["bible"];
    return JSON.stringify({
      sceneName,
      currentProgramSceneBeforeTarget,
      browserSourceName: def.browserSourceName,
      overlayFile: def.overlayFile,
    });
  }

  private buildWorshipPushSignature(
    sceneName: string,
    currentProgramSceneBeforeTarget: string,
    data: {
      sectionText: string;
      translationText?: string;
      sectionLabel: string;
      songTitle: string;
      artist?: string;
      overlayMode?: "fullscreen" | "lower-third";
      backgroundOnly?: boolean;
      ltTheme?: DockLTThemeRef;
      values?: Record<string, string>;
      bibleThemeSettings?: Record<string, unknown> | null;
      liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
    },
  ): string {
    return JSON.stringify({
      sceneName,
      currentProgramSceneBeforeTarget,
      sectionText: data.sectionText,
      translationText: data.translationText ?? "",
      sectionLabel: data.sectionLabel,
      songTitle: data.songTitle,
      artist: data.artist ?? "",
      overlayMode: data.overlayMode ?? "lower-third",
      backgroundOnly: Boolean(data.backgroundOnly),
      ltTheme: data.ltTheme?.id ?? null,
      values: data.values ?? null,
      bibleThemeSettings: data.bibleThemeSettings ?? null,
      liveOverrides: data.liveOverrides ?? null,
    });
  }

  private async getSceneItemBySource(
    sceneName: string,
    sourceName: string
  ): Promise<{ sceneItemId: number } | null> {
    try {
      const items = await this.getSceneItemListCached(sceneName);
      const item = items.find((entry) => entry.sourceName === sourceName);
      return item ? { sceneItemId: item.sceneItemId } : null;
    } catch {
      return null;
    }
  }

  private async bringSceneSourceToFront(sceneName: string, sourceName: string): Promise<void> {
    try {
      await this.ensureTickerAboveSource(sceneName, sourceName);
    } catch {
      // Ignore ordering failures for optional overlay sources.
    }
  }

  /**
   * Ensure the ticker source stays above the given source in the scene.
   * If a ticker exists, move it to the top and place the other source just below it.
   * If no ticker exists, move the source to the top as normal.
   */
  async ensureTickerAboveSource(sceneName: string, sourceName: string): Promise<void> {
    try {
      // Invalidate cache so we get fresh indices after prior mutations
      this.invalidateSceneItemListCache(sceneName);
      const items = await this.getSceneItemListCached(sceneName);
      const item = items.find((i) => i.sourceName === sourceName);
      const tickerItem = items.find((i) => i.sourceName === DOCK_TICKER_SOURCE)
        ?? items.find((i) => i.sourceName.startsWith("MCE Ticker - "));
      const topIndex = Math.max(0, items.length - 1);

      if (!tickerItem) {
        if (item && item.sceneItemIndex !== topIndex) {
          await this.call("SetSceneItemIndex", {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemIndex: topIndex,
          }).catch(() => { });
        }
        return;
      }

      if (tickerItem.sceneItemIndex !== topIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId: tickerItem.sceneItemId,
          sceneItemIndex: topIndex,
        }).catch(() => { });
      }

      if (!item || item.sceneItemId === tickerItem.sceneItemId) return;

      const targetIndex = Math.max(0, topIndex - 1);
      if (item.sceneItemIndex !== targetIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemIndex: targetIndex,
        }).catch(() => { });
      }
    } catch { /* ignore ordering failures */ }
  }

  private async getLikelyOverlayScenes(): Promise<string[]> {
    const scenes = new Set<string>([DOCK_PRESENTATION_SCENE, PRESENTATION_SCENE_NAME]);
    return Array.from(scenes).filter(Boolean);
  }

  private async bringExistingSourceForward(sceneName: string, sourceName: string): Promise<boolean> {
    if (!sceneName || !sourceName) return false;
    try {
      this.invalidateSceneItemListCache(sceneName);
      const items = await this.getSceneItemListCached(sceneName);
      const item = items.find((entry) => entry.sourceName === sourceName);
      if (!item) return false;

      const tickerItem = items.find((entry) => entry.sourceName === DOCK_TICKER_SOURCE);
      const topIndex = Math.max(0, items.length - 1);
      let changed = false;

      if (item.sceneItemEnabled === false) {
        await this.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: true,
        }).catch(() => { });
        changed = true;
      }

      if (tickerItem && tickerItem.sceneItemId !== item.sceneItemId) {
        if (tickerItem.sceneItemIndex !== topIndex) {
          await this.call("SetSceneItemIndex", {
            sceneName,
            sceneItemId: tickerItem.sceneItemId,
            sceneItemIndex: topIndex,
          }).catch(() => { });
          changed = true;
        }
        const targetIndex = Math.max(0, topIndex - 1);
        if (item.sceneItemIndex !== targetIndex) {
          await this.call("SetSceneItemIndex", {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemIndex: targetIndex,
          }).catch(() => { });
          changed = true;
        }
      } else if (item.sceneItemIndex !== topIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemIndex: topIndex,
        }).catch(() => { });
        changed = true;
      }

      if (changed) this.invalidateSceneItemListCache(sceneName);
      return true;
    } catch {
      return false;
    }
  }

  private async bringMceOverlayForward(sourceName: string): Promise<boolean> {
    let moved = false;
    for (const sceneName of await this.getLikelyOverlayScenes()) {
      moved = (await this.bringExistingSourceForward(sceneName, sourceName)) || moved;
    }
    return moved;
  }

  async bringBibleOverlayForward(_mode: DockOverlayMode = "fullscreen"): Promise<void> {
    await this.bringMceOverlayForward(this._fullscreenSceneDefs["bible"].browserSourceName);
  }

  async bringWorshipOverlayForward(_mode: DockOverlayMode = "lower-third"): Promise<void> {
    await this.bringMceOverlayForward(getDockResources().worshipSource);
  }

  private async prepareFastOverlayScene(
    tabId: DockPreviewTab,
    sourceName: string,
    fitSource: (sceneName: string) => Promise<void>,
  ): Promise<void> {
    const key = `${tabId}:${sourceName}`;
    const now = Date.now();
    if (this._lastFastOverlayPrepAtBySource[key]) {
      return;
    }

    // The browser document is already live. Re-promoting or refitting the OBS
    // scene for every verse can briefly redraw the scene and expose the
    // underlying frame. Prepare the route once, then update only the packet.
    this._lastFastOverlayPrepAtBySource[key] = now;
    await this.promotePresentationScene(tabId).catch(() => { });

    const target = await this.getPresentationTargetScene(tabId, { activate: false }).catch(() => null);
    if (target?.sceneName) {
      await fitSource(target.sceneName).catch(() => { });
      await this.ensureTickerAboveSource(target.sceneName, sourceName).catch(() => { });
    }
    await fitSource(PRESENTATION_SCENE_NAME).catch(() => { });
    await this.ensureTickerAboveSource(PRESENTATION_SCENE_NAME, sourceName).catch(() => { });
  }

  private sceneItemKey(sceneName: string, sceneItemId: number): string {
    return `${sceneName}::${sceneItemId}`;
  }

  private async getTickerClearancePx(
    sceneName: string,
    items: Array<{ sourceName: string; sceneItemId: number; sceneItemEnabled?: boolean }>,
  ): Promise<number> {
    const tickerItem = items.find(
      (item) => item.sourceName === DOCK_TICKER_SOURCE && item.sceneItemEnabled !== false,
    );
    if (!tickerItem) return 0;

    let tickerHeight = DOCK_TICKER_CLEARANCE_FALLBACK_PX;
    let tickerY: number | null = null;

    try {
      const response = await this.call("GetSceneItemTransform", {
        sceneName,
        sceneItemId: tickerItem.sceneItemId,
      }) as { sceneItemTransform?: Record<string, unknown> };
      const transform = response.sceneItemTransform ?? {};
      const boundsHeight = Number(transform.boundsHeight);
      const sourceHeight = Number(transform.sourceHeight);
      const scaleY = Number(transform.scaleY);
      const positionY = Number(transform.positionY);

      if (Number.isFinite(positionY)) {
        tickerY = positionY;
      }
      if (Number.isFinite(boundsHeight) && boundsHeight > 0) {
        tickerHeight = boundsHeight;
      } else if (Number.isFinite(sourceHeight) && sourceHeight > 0) {
        tickerHeight = sourceHeight * (Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1);
      }
    } catch {
      // Fall back to the known dock ticker height.
    }

    // A top ticker does not collide with lower thirds.
    if (tickerY !== null && tickerY <= 4) return 0;

    return Math.max(
      0,
      Math.min(
        DOCK_TICKER_CLEARANCE_MAX_PX,
        Math.round(tickerHeight + DOCK_TICKER_CLEARANCE_GAP_PX),
      ),
    );
  }

  async syncLowerThirdTickerClearance(sceneName = DOCK_PRESENTATION_SCENE): Promise<void> {
    try {
      this.invalidateSceneItemListCache(sceneName);
      const items = await this.getSceneItemListCached(sceneName);
      const ltItems = items.filter((item) => item.sourceName === DOCK_LT_SOURCE);
      if (ltItems.length === 0) return;

      const liveKeys = new Set(ltItems.map((item) => this.sceneItemKey(sceneName, item.sceneItemId)));
      for (const key of this._ltBasePosYBySceneItem.keys()) {
        if (key.startsWith(`${sceneName}::`) && !liveKeys.has(key)) {
          this._ltBasePosYBySceneItem.delete(key);
        }
      }

      const clearancePx = await this.getTickerClearancePx(sceneName, items);

      for (const item of ltItems) {
        let currentY = 0;
        try {
          const response = await this.call("GetSceneItemTransform", {
            sceneName,
            sceneItemId: item.sceneItemId,
          }) as { sceneItemTransform?: Record<string, unknown> };
          const transform = response.sceneItemTransform ?? {};
          const positionY = Number(transform.positionY);
          if (Number.isFinite(positionY)) currentY = positionY;
        } catch {
          // Keep fallback.
        }

        const key = this.sceneItemKey(sceneName, item.sceneItemId);
        if (!this._ltBasePosYBySceneItem.has(key)) {
          let inferredBaseY = currentY;
          if (clearancePx > 0 && Math.abs(currentY + clearancePx) <= 2) {
            inferredBaseY = currentY + clearancePx;
          } else if (clearancePx === 0 && currentY < -10) {
            inferredBaseY = 0;
          }
          this._ltBasePosYBySceneItem.set(key, inferredBaseY);
        }

        const baseY = this._ltBasePosYBySceneItem.get(key) ?? 0;
        const targetY = baseY - clearancePx;
        if (Math.abs(currentY - targetY) > 0.5) {
          await this.call("SetSceneItemTransform", {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemTransform: {
              positionY: targetY,
            },
          }).catch(() => { });
        }
      }
    } catch {
      // Best-effort layout correction only.
    }
  }

  private async ensureActiveMceOverlaySource(
    sceneName: string,
    primarySourceName: string,
    keepSources: string[] = [],
    resources: DockResourceNames = DOCK_RESOURCES,
  ): Promise<void> {
    const primary = primarySourceName.trim();
    if (!sceneName || !primary) return;
    const keepSet = new Set<string>([
      ...keepSources.filter(Boolean),
      primary,
      resources.tickerSource,
      DOCK_TICKER_SOURCE,
      PRESENTATION_SCENE_NAME,
      PROGRAM_SCENE_SOURCE_NAME,
    ]);
    const projectionSettings = loadProjectionSettings();
    const isLowerThirdSource = primary === DOCK_LT_SOURCE
      || primary === SOURCE_NAMES.LOWER_THIRD
      || primary.startsWith("MCE Lower Third");
    const shouldIsolateSources = isLowerThirdSource
      ? projectionSettings.lowerThirdSourceVisibility === "active-only"
        || projectionSettings.presentationSourceVisibility === "active-only"
      : projectionSettings.presentationSourceVisibility === "active-only";
    const stateSignature = JSON.stringify({
      primary,
      keep: Array.from(keepSet).sort(),
      shouldIsolateSources,
      lowerThirdSourceVisibility: projectionSettings.lowerThirdSourceVisibility,
    });

    // Always ensure ticker is positioned correctly, even if overlay state
    // hasn't changed (e.g., another tab reordered scene items).
    await this.ensureTickerAboveSource(sceneName, primary).catch(() => { });

    if (this._activeMceOverlayStateByScene[sceneName] === stateSignature) return;

    let changedVisibility = false;
    const requests: Array<{ requestType: string; requestData: Record<string, unknown> }> = [];
    const items = await this.getSceneItemListCached(sceneName);

    if (shouldIsolateSources && isLowerThirdSource && projectionSettings.lowerThirdSourceVisibility === "keep-first") {
      const firstMceSource = [...items]
        .filter((item) => item.sourceName.startsWith("MCE ") && item.sourceName !== PROGRAM_SCENE_SOURCE_NAME)
        .sort((first, second) => (first.sceneItemIndex ?? 0) - (second.sceneItemIndex ?? 0))[0];
      if (firstMceSource) keepSet.add(firstMceSource.sourceName);
    }

    for (const item of items) {
      const shouldKeep = keepSet.has(item.sourceName);
      const isMceManagedSource = item.sourceName.startsWith("MCE ");
      if (shouldIsolateSources && isMceManagedSource && !shouldKeep && item.sceneItemEnabled !== false) {
        requests.push({
          requestType: "SetSceneItemEnabled",
          requestData: {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: false,
          },
        });
        changedVisibility = true;
        continue;
      }
      if (shouldKeep && item.sourceName === primary && item.sceneItemEnabled === false) {
        requests.push({
          requestType: "SetSceneItemEnabled",
          requestData: {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: true,
          },
        });
        changedVisibility = true;
        continue;
      }

    }

    if (requests.length > 0) {
      await this.callBatch(requests, 2).catch(() => { });
    }
    if (changedVisibility) this.invalidateSceneItemListCache(sceneName);

    // Visibility and scene-source mutations from neighboring dock actions can
    // leave the active source lower in the stack than expected. Re-apply the
    // source ordering after the batch so the live dock source stays at the top
    // of the dock-managed stack, just beneath the ticker when it exists.
    await this.ensureTickerAboveSource(sceneName, primary).catch(() => { });

    this._activeMceOverlayStateByScene[sceneName] = stateSignature;
  }

  private invalidateActiveMceOverlayState(sceneName?: string): void {
    if (sceneName) {
      delete this._activeMceOverlayStateByScene[sceneName];
      return;
    }
    this._activeMceOverlayStateByScene = {};
  }

  private async setMediaSceneItemScale(
    sceneName: string,
    sceneItemId: number,
    canvas: { width: number; height: number },
    scale: number
  ): Promise<void> {
    const boundsWidth = canvas.width * scale;
    const boundsHeight = canvas.height * scale;
    const positionX = (canvas.width - boundsWidth) / 2;
    const positionY = (canvas.height - boundsHeight) / 2;

    await this.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId,
      sceneItemTransform: {
        positionX,
        positionY,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth,
        boundsHeight,
        boundsAlignment: 0,
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
      },
    });
  }

  private async transformSceneItem(
    sceneName: string,
    sceneItemId: number,
    positionX: number,
    positionY: number,
    boundsWidth: number,
    boundsHeight: number,
  ): Promise<void> {
    await this.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId,
      sceneItemTransform: {
        positionX,
        positionY,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth,
        boundsHeight,
        boundsAlignment: 0,
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
      },
    });
  }

  private async animateMediaSceneItem(
    sceneName: string,
    sceneItemId: number,
    direction: "in" | "out"
  ): Promise<void> {
    const canvas = await this.getCanvasSize();
    const scales = direction === "in" ? [0.965, 0.985, 1] : [1, 0.985, 0.965];

    for (let index = 0; index < scales.length; index += 1) {
      await this.setMediaSceneItemScale(sceneName, sceneItemId, canvas, scales[index]);
      if (index < scales.length - 1) {
        await this.sleep(45);
      }
    }

    if (direction === "in") {
      await this.fitSceneItemToCanvas(sceneName, sceneItemId);
    }
  }

  /**
   * Disable every visible scene item in `sceneName` immediately.
   * Multiview clear should be instant and low-CPU, not a filter animation.
   */
  async fadeOutAllSceneItems(sceneName: string, _durationMs = 0): Promise<void> {
    let items: Array<{ sceneItemId: number; sourceName: string; sceneItemEnabled: boolean }> = [];
    try {
      const resp = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sceneItemId: number; sourceName: string; sceneItemEnabled: boolean }>;
      };
      items = (resp.sceneItems ?? []).filter((i) => i.sceneItemEnabled);
    } catch { /* scene may not exist */ }

    if (items.length === 0) return;

    await Promise.all(items.map(async (item) => {
      try {
        await this.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: false,
        });
      } catch { /* ignore */ }
    }));
  }

  private async hideMediaSourceWithAnimation(sceneName: string, sourceName: string): Promise<void> {
    const item = await this.getSceneItemBySource(sceneName, sourceName);
    if (!item) return;

    try {
      await this.animateMediaSceneItem(sceneName, item.sceneItemId, "out");
    } catch {
      // Fall through to disable even if the transform animation fails.
    }

    try {
      await this.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: false,
      });
    } catch {
      // Ignore disable failures during clear/handover.
    }
  }

  // ── Scene helpers ──

  private rememberUserScene(sceneName: string, tabId?: DockPreviewTab): void {
    if (!sceneName || sceneName === DOCK_PRESENTATION_SCENE) return;
    const key = tabId || "__global__";
    // A second send can run after MCE Presentation is already Program. Keep
    // the first real scene so clearing the overlay still returns to the scene
    // that was live before the whole presentation session started.
    if (!this._programSceneBeforePush.has(key)) {
      this._programSceneBeforePush.set(key, sceneName);
    }
  }

  /** Get the Program scene that was active before content was pushed for a tab */
  private getRememberedSceneBeforePush(tabId?: DockPreviewTab): string {
    const key = tabId || "__global__";
    return this._programSceneBeforePush.get(key) || "";
  }

  /** Clear the remembered scene after restore */
  private clearRememberedSceneBeforePush(tabId?: DockPreviewTab): void {
    const key = tabId || "__global__";
    this._programSceneBeforePush.delete(key);
  }

  /** Restore the Program scene to what it was before content was pushed */
  private async restoreProgramSceneBeforePush(tabId?: DockPreviewTab): Promise<boolean> {
    const remembered = this.getRememberedSceneBeforePush(tabId);
    if (!remembered) return false;
    if (!this.readRestoreOriginalScene()) {
      this.clearRememberedSceneBeforePush(tabId);
      return false;
    }

    // Overlay-only mode also cleans up any legacy direct Program insertion.
    if (this.readSceneMode() === "no-clone") {
      const currentScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (currentScene) {
        await this.removeMCEPresentationFromScene(currentScene);
      }
    }

    const currentProgramScene = await this.getCurrentProgramSceneName(true).catch(() => "");
    if (currentProgramScene === remembered) {
      this.clearRememberedSceneBeforePush(tabId);
      return false; // already on the right scene
    }

    try {
      await this.call("SetCurrentProgramScene", { sceneName: remembered });
      await this.waitForSceneMatch("program", remembered);
      if (await this.isStudioModeEnabled()) {
        await this.setCurrentPreviewScene(remembered);
        await this.waitForSceneMatch("preview", remembered).catch(() => { });
      }
      await this.sleep(100);
      this.clearRememberedSceneBeforePush(tabId);
      return true;
    } catch (err) {
      console.warn(`[DockOBS] Failed to restore Program scene to "${remembered}":`, err);
      return false;
    }
  }

  async ensurePresentationPreviewActive(tabId?: DockPreviewTab): Promise<boolean> {
    if (!this.isConnected) return false;

    await this.waitUntilReady().catch(() => { });

    const studioMode = await this.isStudioModeEnabled(true).catch(() => false);
    if (!studioMode) return false;

    await this.ensurePresentationSceneReady().catch(() => { });

    const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
    if (currentProgramScene && currentProgramScene !== DOCK_PRESENTATION_SCENE) {
      this.rememberUserScene(currentProgramScene, tabId);
      if (this.readSceneMode() === "no-clone") {
        await this.ensureNoProgramSceneUnderlayInPresentation().catch(() => { });
      } else {
        await this.ensureProgramSceneAsSourceInPresentation(true).catch(() => { });
      }
    }

    const currentPreviewScene = await this.getCurrentPreviewSceneName().catch(() => "");
    // If the preview is already MCE Presentation, nothing to do
    if (currentPreviewScene === DOCK_PRESENTATION_SCENE) return true;

    const originalPreviewScene = currentPreviewScene || currentProgramScene;
    if (originalPreviewScene && originalPreviewScene !== DOCK_PRESENTATION_SCENE) {
      if (tabId) {
        this.setPreviewSceneStateForTab(tabId, originalPreviewScene, DOCK_PRESENTATION_SCENE, "presentation");
      } else {
        this.setPreviewSceneState(originalPreviewScene, DOCK_PRESENTATION_SCENE, "presentation");
      }
    }

    const previewSet = await this.setCurrentPreviewScene(DOCK_PRESENTATION_SCENE);
    if (previewSet) {
      await this.waitForSceneMatch("preview", DOCK_PRESENTATION_SCENE).catch(() => { });
    }
    return previewSet;
  }

  /**
   * Make MCE Presentation visible after an explicit dock send.
   *
   * Studio Mode: put MCE Presentation in Preview only.
   * Non-Studio Mode: switch Program to MCE Presentation after the scene is
   * populated. Program-background-on places the previous Program scene below
   * the overlays; no-clone keeps MCE Presentation overlay-only.
   */
  private async promotePresentationScene(tabId?: DockPreviewTab): Promise<void> {
    if (await this.ensurePresentationPreviewActive(tabId).catch(() => false)) {
      return;
    }

    await this.ensurePresentationSceneReady();

    const currentProgramScene = await this.getCurrentProgramSceneName(true).catch(() => "");
    if (currentProgramScene && currentProgramScene !== DOCK_PRESENTATION_SCENE) {
      this.rememberUserScene(currentProgramScene, tabId);
    }

    if (currentProgramScene === DOCK_PRESENTATION_SCENE) return;

    if (this.readSceneMode() === "no-clone") {
      await this.ensureNoProgramSceneUnderlayInPresentation().catch(() => { });
      if (currentProgramScene) {
        await this.removeMCEPresentationFromScene(currentProgramScene).catch(() => { });
      }
    } else if (currentProgramScene) {
      await this.ensureProgramSceneAsSourceInPresentation(true, {
        allowWithoutStudioMode: true,
        programSceneName: currentProgramScene,
      }).catch(() => { });
    }

    await this.call("SetCurrentProgramScene", { sceneName: DOCK_PRESENTATION_SCENE });
    this._programSceneCache = null;
    await this.waitForSceneMatch("program", DOCK_PRESENTATION_SCENE).catch(() => { });
  }

  /**
   * Ensure the current Program scene exists as a source inside MCE Presentation,
   * positioned at the bottom of the z-order (behind all overlay sources).
   * This makes the live broadcast content visible behind overlays in Studio Mode,
   * where MCE Presentation is only placed in Preview.
   *
   * Non-Studio Mode can call this with an explicit pre-switch Program scene
   * when Program-background-on needs that scene under MCE Presentation.
   * Skips if the program scene IS MCE Presentation (circular reference).
   */
  private async ensureProgramSceneAsSourceInPresentation(
    _force = false,
    options: { allowWithoutStudioMode?: boolean; programSceneName?: string } = {},
  ): Promise<void> {
    return this.runSerializedPresentationMutation(async () => {
      try {
        const studioMode = options.allowWithoutStudioMode
          ? true
          : await this.isStudioModeEnabled().catch(() => false);
        if (!studioMode) return;

        if (this.readSceneMode() === "no-clone") {
          await this.ensureNoProgramSceneUnderlayInPresentation(_force);
          return;
        }

        const programScene = (options.programSceneName || await this.getCurrentProgramSceneName(true).catch(() => "")).trim();
        if (!programScene) {
          this._presentationProgramUnderlayCache = null;
          return;
        }

        if (programScene === DOCK_PRESENTATION_SCENE) {
          // MCE Presentation can become Program after a studio transition. In
          // that state the existing nested scene is still the intended live
          // background, so do not run the stale-underlay cleanup here.
          return;
        }

        if (DockObsClient.isManagedMultiviewSceneName(programScene)) {
          // Multiview scenes are themselves composed outputs. Do not replace
          // the presentation's last background scene with a Multiview scene,
          // and do not empty the presentation while a Multiview scene is live.
          return;
        }

        const cached = this._presentationProgramUnderlayCache;
        if (!_force && cached?.programScene === programScene && cached.expiresAt > Date.now()) {
          return;
        }

        const programContainsPresentation = await this.sceneContainsSource(programScene, DOCK_PRESENTATION_SCENE);
        if (programContainsPresentation) {
          console.warn(
            `[DockOBS] Removing stale "${DOCK_PRESENTATION_SCENE}" source from "${programScene}" before rebuilding presentation.`,
          );
          await this.removeMCEPresentationFromScene(programScene).catch(() => { });
          await this.sleep(120);
        }

        const presentationScene = DOCK_PRESENTATION_SCENE;
        await this.ensurePresentationSceneReady();
        await this.removeProgramSceneUnderlaysFromPresentation(programScene);

        const existing = await this.collapseDuplicateSceneItems(presentationScene, programScene);

        if (existing) {
          // Already present — just ensure it's at the bottom (behind overlays)
          if (existing.sceneItemIndex !== 0) {
            await this.call("SetSceneItemIndex", {
              sceneName: presentationScene,
              sceneItemId: existing.sceneItemId,
              sceneItemIndex: 0,
            }).catch(() => { });
          }
          if (existing.sceneItemEnabled === false) {
            await this.call("SetSceneItemEnabled", {
              sceneName: presentationScene,
              sceneItemId: existing.sceneItemId,
              sceneItemEnabled: true,
            }).catch(() => { });
          }
          this._presentationProgramUnderlayCache = { programScene, expiresAt: Date.now() + 3000 };
          return;
        }

        // Add program scene as a source to MCE Presentation
        const created = await this.call("CreateSceneItem", {
          sceneName: presentationScene,
          sourceName: programScene,
          sceneItemEnabled: true,
        }) as { sceneItemId: number };
        this.invalidateSceneItemListCache(presentationScene);

        await this.sleep(120);
        const stableItem = await this.collapseDuplicateSceneItems(presentationScene, programScene);
        const sceneItemId = stableItem?.sceneItemId ?? created.sceneItemId;

        // Fit to canvas
        await this.fitSceneItemToCanvas(presentationScene, sceneItemId);

        // Move to bottom of z-order (index 0 = behind all overlay sources)
        await this.call("SetSceneItemIndex", {
          sceneName: presentationScene,
          sceneItemId,
          sceneItemIndex: 0,
        }).catch(() => { });
        this._presentationProgramUnderlayCache = { programScene, expiresAt: Date.now() + 3000 };

      } catch (err) {
        console.warn("[DockOBS] Failed to add program scene as source in presentation:", err);
      }
    });
  }

  private async removeProgramSceneUnderlaysFromPresentation(keepSceneName?: string): Promise<void> {
    try {
      await this.ensurePresentationSceneReady();
      const sceneResp = await this.call("GetSceneList") as {
        scenes: Array<{ sceneName: string }>;
      };
      const obsSceneNames = new Set(
        (sceneResp.scenes ?? [])
          .map((scene) => scene.sceneName)
          .filter((sceneName) => sceneName && sceneName !== DOCK_PRESENTATION_SCENE),
      );
      if (obsSceneNames.size === 0) return;

      this.invalidateSceneItemListCache(DOCK_PRESENTATION_SCENE);
      const items = await this.getSceneItemListCached(DOCK_PRESENTATION_SCENE);
      let removed = false;
      for (const item of items) {
        if (!obsSceneNames.has(item.sourceName)) continue;
        if (keepSceneName && item.sourceName === keepSceneName) continue;
        await this.call("RemoveSceneItem", {
          sceneName: DOCK_PRESENTATION_SCENE,
          sceneItemId: item.sceneItemId,
        }).catch(() => { });
        removed = true;
      }
      if (removed) {
        this.invalidateSceneItemListCache(DOCK_PRESENTATION_SCENE);
      }
      if (removed || !keepSceneName) {
        this._presentationProgramUnderlayCache = null;
      }
    } catch (err) {
      console.warn("[DockOBS] Failed to remove Program scene underlay from MCE Presentation:", err);
    }
  }

  private async ensureNoProgramSceneUnderlayInPresentation(force = false): Promise<void> {
    const currentProgramScene = await this.getCurrentProgramSceneName(true).catch(() => "");
    if (DockObsClient.isManagedMultiviewSceneName(currentProgramScene)) {
      // A Multiview scene can be the live OBS output while MCE Presentation
      // remains the presentation layer. Preserve its last added underlay.
      return;
    }

    const cached = this._presentationProgramUnderlayCache;
    if (
      !force &&
      cached?.programScene === DockObsClient.NO_CLONE_UNDERLAY_CACHE_KEY &&
      cached.expiresAt > Date.now()
    ) {
      return;
    }

    await this.removeProgramSceneUnderlaysFromPresentation();
    this._presentationProgramUnderlayCache = {
      programScene: DockObsClient.NO_CLONE_UNDERLAY_CACHE_KEY,
      expiresAt: Date.now() + 3000,
    };
  }

  private async sceneContainsSource(sceneName: string, sourceName: string): Promise<boolean> {
    try {
      const resp = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sourceName: string }>;
      };
      return resp.sceneItems.some((item) => item.sourceName === sourceName);
    } catch {
      return false;
    }
  }

  private async collapseDuplicateSceneItems(
    sceneName: string,
    sourceName: string,
  ): Promise<{ sceneItemId: number; sceneItemIndex?: number; sceneItemEnabled?: boolean } | null> {
    this.invalidateSceneItemListCache(sceneName);
    let items = await this.getSceneItemListCached(sceneName);
    let matches = items
      .filter((item) => item.sourceName === sourceName)
      .sort((a, b) => a.sceneItemId - b.sceneItemId);

    if (matches.length === 0) return null;

    const duplicates = matches.slice(1);
    if (duplicates.length > 0) {
      for (const item of duplicates) {
        await this.call("RemoveSceneItem", {
          sceneName,
          sceneItemId: item.sceneItemId,
        }).catch(() => { });
      }
      await this.sleep(80);
      this.invalidateSceneItemListCache(sceneName);
      items = await this.getSceneItemListCached(sceneName);
      matches = items
        .filter((item) => item.sourceName === sourceName)
        .sort((a, b) => a.sceneItemId - b.sceneItemId);
    }

    return matches[0] ?? null;
  }

  /**
   * Remove MCE Presentation as a Scene Source from the given scene.
   * Used by routing cleanup when an older mode embedded the managed
   * presentation scene inside the user's Program scene.
   */
  private async removeMCEPresentationFromScene(sceneName: string): Promise<void> {
    try {
      if (!sceneName || sceneName === DOCK_PRESENTATION_SCENE) return;
      if (DockObsClient.isManagedMultiviewSceneName(sceneName)) return;

      const resp = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
      };
      const presentationItem = resp.sceneItems.find((i) => i.sourceName === DOCK_PRESENTATION_SCENE);
      if (presentationItem) {
        await this.call("RemoveSceneItem", {
          sceneName,
          sceneItemId: presentationItem.sceneItemId,
        }).catch(() => { });
      }
    } catch (err) {
      console.warn("[DockOBS] Failed to remove MCE Presentation from scene:", err);
    }
  }

  private loadPreviewSceneState(): DockPreviewSceneState | null {
    try {
      const raw = localStorage.getItem(DOCK_PREVIEW_SCENE_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<DockPreviewSceneState>;
      const previewSceneName = String(parsed.previewSceneName || "").trim();
      const originalSceneName = String(parsed.originalSceneName || "").trim();
      const overlayType = String(parsed.overlayType || "").trim();
      if (!previewSceneName || !originalSceneName) return null;
      return {
        previewSceneName,
        originalSceneName,
        overlayType,
        createdAt: Number(parsed.createdAt) || Date.now(),
        updatedAt: Number(parsed.updatedAt) || Date.now(),
      };
    } catch {
      return null;
    }
  }

  private savePreviewSceneState(state: DockPreviewSceneState | null): void {
    this._previewSceneState = state;
    try {
      if (!state) {
        localStorage.removeItem(DOCK_PREVIEW_SCENE_STATE_KEY);
        return;
      }
      localStorage.setItem(DOCK_PREVIEW_SCENE_STATE_KEY, JSON.stringify(state));
    } catch {
      // localStorage can be unavailable in some OBS browser contexts.
    }
  }

  async applyProjectionSettings(options: { allowSceneMutation?: boolean } = {}): Promise<void> {
    if (!options.allowSceneMutation) return;

    await this.ensurePresentationSceneReady().catch(() => { });

    if (this.readSceneMode() === "no-clone") {
      const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (currentProgramScene && currentProgramScene !== DOCK_PRESENTATION_SCENE) {
        await this.removeMCEPresentationFromScene(currentProgramScene).catch(() => { });
      }
      await this.ensureNoProgramSceneUnderlayInPresentation(true).catch(() => { });
    } else {
      await this.ensureProgramSceneAsSourceInPresentation(true).catch(() => { });
    }

    const scenes = new Set<string>([DOCK_PRESENTATION_SCENE]);
    const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
    if (currentProgramScene) scenes.add(currentProgramScene);
    const currentPreviewScene = await this.getCurrentPreviewSceneName().catch(() => "");
    if (currentPreviewScene) scenes.add(currentPreviewScene);

    for (const sceneName of scenes) {
      await this.ensureTickerAboveSource(sceneName, DOCK_TICKER_SOURCE).catch(() => { });
    }
  }

  /** Get the fixed preview scene name for a tab. */
  private getTabPreviewSceneName(tabId: DockPreviewTab): string {
    return TAB_PREVIEW_SCENE_NAMES[tabId];
  }

  private getStoredPreviewSceneState(): DockPreviewSceneState | null {
    return this._previewSceneState ? { ...this._previewSceneState } : null;
  }

  /** Get the stored preview scene state for a specific tab */
  private getStoredPreviewSceneStateForTab(tabId: DockPreviewTab): DockPreviewSceneState | null {
    const state = this._previewSceneStates.get(tabId);
    return state ? { ...state } : null;
  }

  private clearPreviewSceneState(): void {
    this.savePreviewSceneState(null);
  }

  /** Clear the preview scene state for a specific tab */
  private clearPreviewSceneStateForTab(tabId: DockPreviewTab): void {
    this._previewSceneStates.delete(tabId);
    this.saveTabPreviewSceneStatesToStorage();
  }

  private setPreviewSceneStateForTab(
    tabId: DockPreviewTab,
    originalSceneName: string,
    previewSceneName: string,
    overlayType: string,
  ): void {
    const now = Date.now();
    const existing = this._previewSceneStates.get(tabId);
    const createdAt = existing?.previewSceneName === previewSceneName && existing?.originalSceneName === originalSceneName
      ? existing.createdAt
      : now;
    this._previewSceneStates.set(tabId, {
      previewSceneName,
      originalSceneName,
      overlayType,
      createdAt,
      updatedAt: now,
    });
    this.saveTabPreviewSceneStatesToStorage();
  }

  private setPreviewSceneState(originalSceneName: string, previewSceneName: string, overlayType: string): void {
    const now = Date.now();
    const existing = this._previewSceneState;
    const createdAt = existing?.previewSceneName === previewSceneName && existing?.originalSceneName === originalSceneName
      ? existing.createdAt
      : now;
    this.savePreviewSceneState({
      previewSceneName,
      originalSceneName,
      overlayType,
      createdAt,
      updatedAt: now,
    });
  }

  private loadTabPreviewSceneStatesFromStorage(): void {
    try {
      const raw = localStorage.getItem(DOCK_PREVIEW_SCENE_STATE_KEY + "_tabs");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, DockPreviewSceneState>;
      for (const [key, val] of Object.entries(parsed)) {
        if (val && typeof val === "object" && val.previewSceneName && val.originalSceneName) {
          this._previewSceneStates.set(key, val);
        }
      }
    } catch { /* ignore */ }
  }

  private saveTabPreviewSceneStatesToStorage(): void {
    try {
      if (this._previewSceneStates.size === 0) {
        localStorage.removeItem(DOCK_PREVIEW_SCENE_STATE_KEY + "_tabs");
        return;
      }
      const obj: Record<string, DockPreviewSceneState> = {};
      for (const [k, v] of this._previewSceneStates) obj[k] = v;
      localStorage.setItem(DOCK_PREVIEW_SCENE_STATE_KEY + "_tabs", JSON.stringify(obj));
    } catch { /* ignore */ }
  }

  private async getCurrentProgramSceneName(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this._programSceneCache && this._programSceneCache.expiresAt > now) {
      return this._programSceneCache.name;
    }
    const resp = await this.call("GetCurrentProgramScene") as { currentProgramSceneName?: string; sceneName?: string };
    const name = (resp.currentProgramSceneName || resp.sceneName || "").trim();
    this._programSceneCache = { name, expiresAt: now + 30_000 };
    return name;
  }

  private async getCurrentPreviewSceneName(): Promise<string> {
    const resp = await this.call("GetCurrentPreviewScene") as { currentPreviewSceneName?: string; sceneName?: string };
    return (resp.currentPreviewSceneName || resp.sceneName || "").trim();
  }

  private async isStudioModeEnabled(forceRefresh = false): Promise<boolean> {
    // Cache for 30s — studio mode rarely changes mid-session
    if (!forceRefresh && this._studioModeCache && Date.now() < this._studioModeCache.expiresAt) {
      return this._studioModeCache.value;
    }
    try {
      const resp = await this.call("GetStudioModeEnabled") as { studioModeEnabled?: boolean };
      const value = Boolean(resp.studioModeEnabled);
      this._studioModeCache = { value, expiresAt: Date.now() + 30_000 };
      return value;
    } catch {
      return false;
    }
  }

  /**
   * Animate a scene item entrance — zoom from slightly smaller to target size
   * over ~300ms by updating OBS bounds each frame. No Move plugin needed.
   */
  async animateSceneItemWithMove(
    sceneName: string,
    sceneItemId: number,
    targetX: number,
    targetY: number,
    targetWidth: number,
    targetHeight: number,
  ): Promise<void> {
    // Set initial position (slightly smaller, centered around target)
    const scaleStart = 0.92;
    const w0 = targetWidth * scaleStart;
    const h0 = targetHeight * scaleStart;
    const x0 = targetX + (targetWidth - w0) / 2;
    const y0 = targetY + (targetHeight - h0) / 2;

    await this.transformSceneItem(sceneName, sceneItemId, x0, y0, w0, h0);

    // Animate over ~300ms in ~8 steps
    const steps = 8;
    const durationMs = 300;
    const stepDelay = durationMs / steps;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Ease-out cubic: 1 - (1 - t)^3
      const ease = 1 - Math.pow(1 - t, 3);
      const s = scaleStart + (1 - scaleStart) * ease;
      const w = targetWidth * s;
      const h = targetHeight * s;
      const x = targetX + (targetWidth - w) / 2;
      const y = targetY + (targetHeight - h) / 2;

      await this.transformSceneItem(sceneName, sceneItemId, x, y, w, h);
      if (i < steps) await this.sleep(stepDelay);
    }

    // Ensure exact final position
    await this.transformSceneItem(sceneName, sceneItemId, targetX, targetY, targetWidth, targetHeight);
  }

  private async waitForSceneMatch(
    mode: "program" | "preview",
    expectedSceneName: string,
    attempts = 10,
    delayMs = 100,
  ): Promise<boolean> {
    const trimmed = expectedSceneName.trim();
    if (!trimmed) return false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = mode === "program"
        ? await this.getCurrentProgramSceneName(true).catch(() => "")
        : await this.getCurrentPreviewSceneName().catch(() => "");
      if (current === trimmed) return true;
      await this.sleep(delayMs);
    }

    return false;
  }

  private async restorePreviewSceneIfActiveProgram(previewSceneName: string): Promise<boolean> {
    const state = this.getStoredPreviewSceneState();
    const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
    const originalSceneName = state?.originalSceneName || this.getPreviewBaseSceneName(previewSceneName);
    if (currentProgramScene !== previewSceneName) {
      return false;
    }

    if (!originalSceneName) {
      console.warn(`[DockOBS] Cannot restore preview scene "${previewSceneName}" because original scene is unknown.`);
      return false;
    }

    try {
      await this.call("SetCurrentProgramScene", { sceneName: originalSceneName });
      if (await this.isStudioModeEnabled()) {
        await this.setCurrentPreviewScene(originalSceneName);
      }
      await this.waitForSceneMatch("program", originalSceneName);
      if (await this.isStudioModeEnabled()) {
        await this.waitForSceneMatch("preview", originalSceneName);
      }
      await this.sleep(100);
      return true;
    } catch (err) {
      console.warn(`[DockOBS] Failed to restore "${previewSceneName}" to "${originalSceneName}" before clear:`, err);
      return false;
    }
  }

  private getPreviewBaseSceneName(previewSceneName: string): string {
    const trimmed = previewSceneName.trim();
    return trimmed === DOCK_PRESENTATION_SCENE ? DOCK_PRESENTATION_SCENE : "";
  }

  private isPromotedPreviewScene(targetScene: string, currentProgramScene: string): boolean {
    return Boolean(targetScene) &&
      targetScene === currentProgramScene &&
      targetScene === DOCK_PRESENTATION_SCENE;
  }

  private async getObsSceneNames(): Promise<string[]> {
    const resp = await this.call("GetSceneList") as {
      scenes?: Array<{ sceneName?: string | null }>;
    };

    const sceneNames = (resp.scenes ?? [])
      .map((scene) => String(scene.sceneName ?? "").trim())
      .filter(Boolean);
    this._knownScenes = new Set(sceneNames);
    return sceneNames;
  }

  private async hasObsScene(sceneName: string): Promise<boolean> {
    const trimmedSceneName = sceneName.trim();
    if (!trimmedSceneName) return false;

    // The user can delete helper scenes directly in OBS. A cached hit is not
    // enough for recovery paths because stale positives make subsequent
    // GetSceneItemList/CreateSceneItem calls fail against a missing scene.
    if (this._knownScenes.has(trimmedSceneName)) {
      const sceneNames = await this.getObsSceneNames();
      const exists = sceneNames.includes(trimmedSceneName);
      if (!exists && trimmedSceneName === DOCK_PRESENTATION_SCENE) {
        this.resetPresentationSceneState();
      }
      return exists;
    }

    const sceneNames = await this.getObsSceneNames();
    return sceneNames.includes(trimmedSceneName);
  }

  private async setCurrentPreviewScene(sceneName: string, attempts = 3): Promise<boolean> {
    const trimmedSceneName = sceneName.trim();
    if (!trimmedSceneName) return false;

    if (trimmedSceneName === DOCK_PRESENTATION_SCENE) {
      await this.ensurePresentationSceneReady().catch((err) => {
        console.warn(`[DockOBS] Failed to ensure preview scene "${trimmedSceneName}":`, err);
      });
    }

    try {
      const resp = await this.call("GetCurrentPreviewScene") as {
        currentPreviewSceneName?: string;
        sceneName?: string;
      };
      const currentPreviewSceneName = (
        resp.currentPreviewSceneName ||
        resp.sceneName ||
        ""
      ).trim();
      if (currentPreviewSceneName === trimmedSceneName) {
        return true;
      }
    } catch {
      // Fall through to the explicit set call below.
    }

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await this.call("SetCurrentPreviewScene", { sceneName: trimmedSceneName });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          attempt < attempts - 1 &&
          trimmedSceneName === DOCK_PRESENTATION_SCENE &&
          /No source was found|not found|does not exist/i.test(message)
        ) {
          await this.ensurePresentationSceneReady().catch(() => { });
          await new Promise((resolve) => setTimeout(resolve, 120));
          continue;
        }
        if (attempt === attempts - 1) {
          console.warn(`[DockOBS] Failed to set OBS Preview to "${trimmedSceneName}":`, err);
          return false;
        }
      }

      try {
        await new Promise((resolve) => setTimeout(resolve, 120));
        const resp = await this.call("GetCurrentPreviewScene") as {
          currentPreviewSceneName?: string;
          sceneName?: string;
        };
        const currentPreviewSceneName = (
          resp.currentPreviewSceneName ||
          resp.sceneName ||
          ""
        ).trim();
        if (currentPreviewSceneName === trimmedSceneName) {
          return true;
        }
      } catch {
        // Retry below.
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return false;
  }

  /**
   * Get the target scene name for the single output workflow.
   *
   * If Studio Mode is ON → returns the Preview scene (we push content there)
   * If Studio Mode is OFF → returns the Active/Program scene (we push directly)
   *
   * When tabId is provided, the dock still targets the shared
   * "MCE Presentation" scene rather than creating tab-specific preview scenes.
   *
   * Returns { sceneName, studioMode }.
   */
  private async getTargetScene(tabId?: DockPreviewTab, options?: { skipClone?: boolean }): Promise<{ sceneName: string; studioMode: boolean }> {
    const studioMode = await this.isStudioModeEnabled(true);

    // Bible fullscreen adds its scene directly to the user's scene — no clone needed.
    if (options?.skipClone) {
      const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
      this.rememberUserScene(sceneName, tabId);
      return { sceneName, studioMode: false };
    }

    if (studioMode) {
      const sceneMode = this.readSceneMode();

      if (sceneMode === "no-clone") {
        const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
        this.rememberUserScene(sceneName, tabId);
        await this.ensureNoProgramSceneUnderlayInPresentation();
        await this.setCurrentPreviewScene(DOCK_PRESENTATION_SCENE);
        await this.waitForSceneMatch("preview", DOCK_PRESENTATION_SCENE).catch(() => { });
        return { sceneName: DOCK_PRESENTATION_SCENE, studioMode: true };
      }

      return this.getPresentationTargetScene(tabId);
    }

    const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
    this.rememberUserScene(sceneName, tabId);

    return { sceneName, studioMode: false };
  }

  private async getPresentationTargetScene(
    tabId?: DockPreviewTab,
    options?: { activate?: boolean },
  ): Promise<{ sceneName: string; studioMode: boolean }> {
    await this.ensurePresentationSceneReady();

    const studioMode = await this.isStudioModeEnabled(true).catch(() => false);
    const currentProgramScene = await this.getCurrentProgramSceneName(true).catch(() => "");
    const activate = options?.activate !== false;
    const sceneMode = this.readSceneMode();

    if (currentProgramScene && currentProgramScene !== DOCK_PRESENTATION_SCENE) {
      this.rememberUserScene(currentProgramScene, tabId);
      if (studioMode) {
        if (sceneMode === "no-clone") {
          await this.ensureNoProgramSceneUnderlayInPresentation();
        } else {
          await this.ensureProgramSceneAsSourceInPresentation(true);
        }
      }
    }

    if (!activate) {
      return { sceneName: DOCK_PRESENTATION_SCENE, studioMode };
    }

    if (studioMode) {
      const currentPreviewScene = await this.getCurrentPreviewSceneName().catch(() => "");
      const originalPreviewScene = currentPreviewScene || currentProgramScene;
      if (originalPreviewScene && originalPreviewScene !== DOCK_PRESENTATION_SCENE) {
        if (tabId) {
          this.setPreviewSceneStateForTab(tabId, originalPreviewScene, DOCK_PRESENTATION_SCENE, "presentation");
        } else {
          this.setPreviewSceneState(originalPreviewScene, DOCK_PRESENTATION_SCENE, "presentation");
        }
      }
      await this.setCurrentPreviewScene(DOCK_PRESENTATION_SCENE);
      await this.waitForSceneMatch("preview", DOCK_PRESENTATION_SCENE).catch(() => { });
    } else if (currentProgramScene && currentProgramScene !== DOCK_PRESENTATION_SCENE) {
      if (sceneMode === "no-clone") {
        await this.ensureNoProgramSceneUnderlayInPresentation().catch(() => { });
        await this.removeMCEPresentationFromScene(currentProgramScene).catch(() => { });
      } else {
        await this.ensureProgramSceneAsSourceInPresentation(true, {
          allowWithoutStudioMode: true,
          programSceneName: currentProgramScene,
        }).catch(() => { });
      }
      await this.call("SetCurrentProgramScene", { sceneName: DOCK_PRESENTATION_SCENE });
      this._programSceneCache = null;
      await this.waitForSceneMatch("program", DOCK_PRESENTATION_SCENE).catch(() => { });
    }

    return { sceneName: DOCK_PRESENTATION_SCENE, studioMode };
  }
  /**
   * Read the user's chosen scene creation mode from projection settings.
   *
   * - "auto-duplicate": put the current Program scene underneath
   *   MCE Presentation as a scene source.
   * - "no-clone" (default): keep MCE Presentation overlay-only and remove Program
   *   scene underlays from it.
   */
  private readSceneMode(): "auto-duplicate" | "no-clone" {
    return loadProjectionSettings().sceneMode;
  }

  private readRestoreOriginalScene(): boolean {
    return loadProjectionSettings().restoreOriginalScene;
  }

  async deleteClone(sceneNameOrTab?: string, tabId?: DockPreviewTab): Promise<void> {
    // Overlay-only mode has no Program underlay to delete; also clean up any
    // legacy direct Program insertion from the previous routing behavior.
    if (this.readSceneMode() === "no-clone") {
      const programScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (programScene) {
        await this.removeMCEPresentationFromScene(programScene);
      }
      return;
    }

    const toDelete: string[] = [];

    if (tabId) {
      // Tab-specific delete: only delete this tab's preview scene
      const tabSceneName = this.getTabPreviewSceneName(tabId);
      toDelete.push(tabSceneName);
      // Also remove from cloneMap if any entry maps to this scene
      for (const [key, val] of this._cloneMap) {
        if (val === tabSceneName) this._cloneMap.delete(key);
      }
    } else if (sceneNameOrTab) {
      const clone = this._cloneMap.get(sceneNameOrTab);
      if (clone) { toDelete.push(clone); this._cloneMap.delete(sceneNameOrTab); }
    } else {
      for (const clone of this._cloneMap.values()) toDelete.push(clone);
      this._cloneMap.clear();
    }
    // Don't delete clones that are currently Program or Preview
    const programScene = await this.getCurrentProgramSceneName().catch(() => "");
    const previewState = tabId
      ? this.getStoredPreviewSceneStateForTab(tabId)
      : this.getStoredPreviewSceneState();

    for (const clone of toDelete) {
      if (clone === DOCK_PRESENTATION_SCENE) {
        if (tabId) {
          if (previewState?.previewSceneName === clone) this.clearPreviewSceneStateForTab(tabId);
        } else {
          if (previewState?.previewSceneName === clone) this.clearPreviewSceneState();
        }
        continue;
      }
      if (clone === programScene) {
        await this.restorePreviewSceneIfActiveProgram(clone);
      }

      const refreshedProgram = await this.getCurrentProgramSceneName().catch(() => "");
      const refreshedPreview = await this.getCurrentPreviewSceneName().catch(() => "");
      if (clone === refreshedProgram || clone === refreshedPreview) {
        continue;
      }

      try {
        await this.call("RemoveScene", { sceneName: clone });
        this._knownScenes.delete(clone);
        this._cloneExistsCache.delete(clone);
        if (tabId) {
          if (previewState?.previewSceneName === clone) {
            this.clearPreviewSceneStateForTab(tabId);
          }
        } else {
          if (previewState?.previewSceneName === clone) {
            this.clearPreviewSceneState();
          }
        }
      } catch { /* ignore */ }
    }
  }

  private async onStudioModeDisabled(): Promise<void> {
    const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");

    // Clean up staging scenes
    await this.cleanupDockPreviewStageScenes();

    // Restore staging scene if it's the current program
    if (currentProgramScene.endsWith(DOCK_PREVIEW_STAGE_SUFFIX)) {
      await this.restoreSceneFromDockStagingScene(currentProgramScene);
    }
  }

  private async restoreSceneFromDockStagingScene(stagingSceneName: string): Promise<void> {
    const trimmedSceneName = stagingSceneName.trim();
    if (!trimmedSceneName.endsWith(DOCK_PREVIEW_STAGE_SUFFIX)) return;

    const baseSceneName = normalizeDockStageBaseScene(trimmedSceneName);
    if (!baseSceneName || !(await this.hasObsScene(baseSceneName))) {
      return;
    }

    const studioMode = await this.isStudioModeEnabled();
    if (studioMode) {
      const restored = await this.setCurrentPreviewScene(baseSceneName);
      if (restored) {
        this.rememberUserScene(baseSceneName);
        return;
      }
      console.warn(`[DockOBS] Failed to restore OBS Preview from "${trimmedSceneName}" to "${baseSceneName}"`);
    } else {
      try {
        await this.call("SetCurrentProgramScene", { sceneName: baseSceneName });
        this.rememberUserScene(baseSceneName);
      } catch (err) {
        console.warn(`[DockOBS] Failed to restore OBS Program from "${trimmedSceneName}" to "${baseSceneName}":`, err);
      }
    }
  }

  private async cleanupDockPreviewStageScenes(): Promise<void> {
    const allSceneNames = await this.getObsSceneNames().catch(() => [] as string[]);
    const stagingSceneNames = allSceneNames.filter((sceneName) => sceneName.endsWith(DOCK_PREVIEW_STAGE_SUFFIX));
    if (stagingSceneNames.length === 0) return;

    const currentProgramScene = await (this.call("GetCurrentProgramScene") as Promise<{
      currentProgramSceneName?: string;
      sceneName?: string;
    }>).catch(() => null);
    const currentProgramSceneName = (
      currentProgramScene?.currentProgramSceneName ||
      currentProgramScene?.sceneName ||
      ""
    ).trim();
    if (currentProgramSceneName.endsWith(DOCK_PREVIEW_STAGE_SUFFIX)) {
      await this.restoreSceneFromDockStagingScene(currentProgramSceneName);
    }

    try {
      const studioMode = await this.call("GetStudioModeEnabled") as { studioModeEnabled?: boolean };
      if (studioMode.studioModeEnabled) {
        const currentPreviewResp = await this.call("GetCurrentPreviewScene") as {
          currentPreviewSceneName?: string;
          sceneName?: string;
        };
        const currentPreviewSceneName = (
          currentPreviewResp.currentPreviewSceneName ||
          currentPreviewResp.sceneName ||
          ""
        ).trim();
        if (currentPreviewSceneName.endsWith(DOCK_PREVIEW_STAGE_SUFFIX)) {
          await this.restoreSceneFromDockStagingScene(currentPreviewSceneName);
        }
      }
    } catch { /* ignore */ }

    const currentPreviewScene = await (this.call("GetCurrentPreviewScene") as Promise<{
      currentPreviewSceneName?: string;
      sceneName?: string;
    }>).catch(() => null);
    const currentPreviewSceneName = (
      currentPreviewScene?.currentPreviewSceneName ||
      currentPreviewScene?.sceneName ||
      ""
    ).trim();

    for (const sceneName of stagingSceneNames) {
      if (sceneName === currentProgramSceneName || sceneName === currentPreviewSceneName) {
        continue;
      }
      await this.removeSceneIfExists(sceneName);
    }
  }

  // ── Source provisioning ──

  /**
   * Ensure a browser source exists in the given scene.
   * If it doesn't exist, create it and position at (0,0) fullscreen.
   * Then move it to the TOP of the z-order so it acts as an overlay.
   * Returns the sceneItemId.
   */
  private async ensureOverlaySource(
    sceneName: string,
    sourceName: string,
    width?: number,
    height?: number,
    enable = true,
  ): Promise<number> {
    // Ensure the target scene exists before querying it
    if (sceneName === DOCK_PRESENTATION_SCENE) {
      await this.ensurePresentationSceneReady();
    } else if (!await this.hasObsScene(sceneName).catch(() => false)) {
      try {
        await this.call("CreateScene", { sceneName });
        this._knownScenes.add(sceneName);
      } catch { /* scene may already exist */ }
    }

    const canvas = await this.getCanvasSize();
    const sourceWidth = Number(width) > 0 ? Number(width) : canvas.width;
    const sourceHeight = Number(height) > 0 ? Number(height) : canvas.height;

    // 1. Check if the source already exists in this scene. If OBS reports the
    // scene missing despite the earlier check, recreate it and retry once.
    let items: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex?: number; sceneItemEnabled?: boolean }>;
    try {
      items = await this.getSceneItemListCached(sceneName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/scene|source.*not found|not found|does not exist|No source was found/i.test(message)) {
        throw err;
      }
      this._knownScenes.delete(sceneName);
      if (sceneName === DOCK_PRESENTATION_SCENE) {
        this.resetPresentationSceneState();
      }
      await (sceneName === DOCK_PRESENTATION_SCENE
        ? this.ensurePresentationSceneReady()
        : this.ensureDedicatedScene(sceneName));
      this.invalidateSceneItemListCache(sceneName);
      items = await this.getSceneItemListCached(sceneName);
    }

    let sceneItemId: number | null = null;
    const existing = items.find((i) => i.sourceName === sourceName);
    let createdSceneItem = false;
    const modeManagedSourceNames = new Set([
      this._fullscreenSceneDefs["bible"]?.browserSourceName,
      getDockResources().worshipSource,
      getDockResources().notesSource,
    ]);
    const preserveExistingTransform = Boolean(existing && modeManagedSourceNames.has(sourceName));

    if (existing) {
      sceneItemId = existing.sceneItemId;
      // Re-enable the source if it was previously hidden (e.g. by clearAllOverlays)
      if (enable && existing.sceneItemEnabled === false) {
        try {
          await this.call("SetSceneItemEnabled", {
            sceneName,
            sceneItemId: existing.sceneItemId,
            sceneItemEnabled: true,
          });
        } catch { /* ignore */ }
      }
    } else {
      // 2. Check if the input already exists globally (from another scene)
      let inputExists = false;
      try {
        const inputs = await this.call("GetInputList") as {
          inputs: Array<{ inputName: string; inputKind: string }>;
        };
        inputExists = inputs.inputs.some((i) => i.inputName === sourceName);
      } catch { /* ignore */ }

      // Retry logic for transient OBS failures
      const maxRetries = 3;
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (inputExists) {
            // Add existing input as a scene item reference
            const created = await this.call("CreateSceneItem", {
              sceneName,
              sourceName,
              sceneItemEnabled: true,
            }) as { sceneItemId: number };
            sceneItemId = created.sceneItemId;
            createdSceneItem = true;
          } else {
            // Create brand new browser source
            delete this._lastBrowserSourceUrlBySource[sourceName];
            delete this._lastCssOverlayPacketBySource[sourceName];
            delete this._lastCssOverlayBaseUrlBySource[sourceName];
            delete this._lastCssOverlayThemeCssBySource[sourceName];
            const created = await this.call("CreateInput", {
              sceneName,
              inputName: sourceName,
              inputKind: "browser_source",
              inputSettings: {
                url: "about:blank",
                width: sourceWidth,
                height: sourceHeight,
                css: "",
                bgcolor: "#00000000",
                shutdown: false,
                restart_when_active: false,
              },
              sceneItemEnabled: true,
            }) as { sceneItemId: number };
            sceneItemId = created.sceneItemId;
            createdSceneItem = true;
          }
          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxRetries) {
            const delay = 200 * Math.pow(2, attempt);
            console.warn(`[DockOBS] Source creation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      if (lastError && !sceneItemId) {
        // OBS may have actually created the source despite the error response.
        // Re-check the scene item list to recover gracefully.
        try {
          this.invalidateSceneItemListCache(sceneName);
          const recoveryItems = await this.getSceneItemListCached(sceneName);
          const recovered = recoveryItems.find((i) => i.sourceName === sourceName);
          if (recovered) {
            sceneItemId = recovered.sceneItemId;
            lastError = null;
          }
        } catch { /* ignore recovery failure */ }

        // Also check if the input exists globally and try CreateSceneItem one more time
        if (!sceneItemId) {
          try {
            const inputs = await this.call("GetInputList") as {
              inputs: Array<{ inputName: string }>;
            };
            if (inputs.inputs.some((i) => i.inputName === sourceName)) {
              const created = await this.call("CreateSceneItem", {
                sceneName,
                sourceName,
                sceneItemEnabled: true,
              }) as { sceneItemId: number };
              sceneItemId = created.sceneItemId;
              createdSceneItem = true;
              lastError = null;
            }
          } catch { /* ignore */ }
        }
      }

      if (lastError && !sceneItemId) {
        console.warn(`[DockOBS] Failed to create scene item "${sourceName}" after retries and recovery:`, lastError.message);
        throw lastError;
      }
    }

    try {
      await this.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: {
          width: sourceWidth,
          height: sourceHeight,
        },
      });
    } catch {
      // Some pre-existing sources may reject size-only updates; keep going.
    }

    if (createdSceneItem || !preserveExistingTransform) {
      try {
        await this.fitSceneItemToCanvas(sceneName, sceneItemId!);
      } catch (err) {
        console.warn(`[DockOBS] Failed to set transform for "${sourceName}":`, err);
      }
    }

    // 3. Move to top of z-order.
    // In OBS, larger scene-item indices are higher in the Sources stack.
    // For the Presentation scene, keep the ticker at the top if it is visible.
    try {
      if (sceneName === DOCK_PRESENTATION_SCENE) {
        this.invalidateSceneItemListCache(sceneName);
        await this.ensureTickerAboveSource(sceneName, sourceName);
      } else {
        this.invalidateSceneItemListCache(sceneName);
        const refreshedItems = await this.getSceneItemListCached(sceneName);
        const topIndex = Math.max(0, refreshedItems.length - 1);
        const currentItem = refreshedItems.find((i) => i.sceneItemId === sceneItemId);
        if (currentItem && currentItem.sceneItemIndex !== topIndex) {
          await this.call("SetSceneItemIndex", {
            sceneName,
            sceneItemId,
            sceneItemIndex: topIndex,
          });
        }
      }
    } catch (err) {
      console.warn(`[DockOBS] Failed to reorder "${sourceName}":`, err);
    }

    // 4. Make sure it's enabled/visible (only if requested)
    if (enable) {
      try {
        await this.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId: sceneItemId!,
          sceneItemEnabled: true,
        });
      } catch { /* ignore */ }
    }

    if (sceneName === DOCK_PRESENTATION_SCENE && sourceName === DOCK_LT_SOURCE) {
      await this.syncLowerThirdTickerClearance(sceneName).catch(() => { });
    }

    return sceneItemId!;
  }

  // ── Dedicated overlay scene management ──

  /**
   * Ensure a dedicated OBS scene exists for an overlay type.
   * The scene contains the overlay's browser source + background source,
   * kept in isolation from the user's own scenes.
   *
   * @returns the scene name (already existing or freshly created)
   */
  private async ensureDedicatedScene(dedicatedSceneName: string): Promise<string> {
    const trimmedSceneName = dedicatedSceneName.trim();
    if (!trimmedSceneName) {
      throw new Error("Dock helper scene name was empty.");
    }

    const sceneExists = await this.hasObsScene(trimmedSceneName).catch(() => false);
    if (sceneExists) {
      return trimmedSceneName;
    }

    if (trimmedSceneName === DOCK_PRESENTATION_SCENE) {
      this.resetPresentationSceneState();
    }

    try {
      await this.call("CreateScene", { sceneName: trimmedSceneName });
      this._knownScenes.add(trimmedSceneName);
      // Give OBS a moment to fully initialize the scene before adding sources
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      if (await this.hasObsScene(trimmedSceneName).catch(() => false)) {
        return trimmedSceneName;
      }

      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create scene "${trimmedSceneName}" in OBS. ${message}`);
    }

    if (!await this.hasObsScene(trimmedSceneName).catch(() => false)) {
      throw new Error(`OBS did not expose the helper scene "${trimmedSceneName}" after creation.`);
    }

    return trimmedSceneName;
  }

  private isMissingObsSceneError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /No source was found|No scene was found|scene.*not found|source.*not found|not found|does not exist|was not found/i.test(message);
  }

  private shouldRepairPresentationSceneReference(
    requestType: string,
    requestData: Record<string, unknown> | undefined,
    error: unknown,
  ): boolean {
    return requestType === "CreateSceneItem" &&
      requestData?.sourceName === DOCK_PRESENTATION_SCENE &&
      typeof requestData.sceneName === "string" &&
      requestData.sceneName !== DOCK_PRESENTATION_SCENE &&
      this.isMissingObsSceneError(error);
  }

  private async repairPresentationSceneReference(): Promise<void> {
    this._knownScenes.delete(DOCK_PRESENTATION_SCENE);
    this.invalidateSceneItemListCache(DOCK_PRESENTATION_SCENE);

    const sceneStillExists = await this.hasObsScene(DOCK_PRESENTATION_SCENE).catch(() => false);
    if (!sceneStillExists) {
      this._presentationSceneDeletedAt ||= Date.now();
      this.resetPresentationSceneState();
    }

    await this.ensurePresentationSceneReady();
  }

  private async waitForPresentationSceneDeletionToSettle(): Promise<void> {
    if (!this._presentationSceneDeletedAt) return;
    const elapsed = Date.now() - this._presentationSceneDeletedAt;
    const remaining = 1200 - elapsed;
    if (remaining > 0) {
      await this.sleep(remaining);
    }
  }

  private async ensurePresentationSceneReady(): Promise<string> {
    if (!this._presentationSceneDeletedAt && await this.hasObsScene(DOCK_PRESENTATION_SCENE).catch(() => false)) {
      return DOCK_PRESENTATION_SCENE;
    }

    if (this._presentationSceneRepairPromise) {
      await this._presentationSceneRepairPromise;
      return DOCK_PRESENTATION_SCENE;
    }

    const repairPromise = (async () => {
      await this.waitForPresentationSceneDeletionToSettle();
      this._knownScenes.delete(DOCK_PRESENTATION_SCENE);
      this.invalidateSceneItemListCache(DOCK_PRESENTATION_SCENE);
      await this.ensureDedicatedScene(DOCK_PRESENTATION_SCENE);
      this._knownScenes.add(DOCK_PRESENTATION_SCENE);
      this._presentationSceneDeletedAt = 0;
      await this.sleep(160);
    })();

    const trackedRepairPromise = repairPromise.finally(() => {
      if (this._presentationSceneRepairPromise === trackedRepairPromise) {
        this._presentationSceneRepairPromise = null;
      }
    });
    this._presentationSceneRepairPromise = trackedRepairPromise;

    await trackedRepairPromise;
    return DOCK_PRESENTATION_SCENE;
  }

  private getTargetFullscreenBgSourceName(
    sceneName: string,
    resources: DockResourceNames = DOCK_RESOURCES,
  ): string {
    const normalized = sceneName.replace(/\s+/g, " ").trim() || "Scene";
    return `${resources.fsTargetBgPrefix} - ${normalized}`;
  }

  /**
   * Add a dedicated overlay scene as a nested "scene source" into the
   * user's target scene, positioned fullscreen on top.
   *
   * This means the user's scene references our dedicated scene, which in
   * turn contains the browser source + background. Updating the browser
   * source URL happens inside the dedicated scene — the user's scene just
   * shows it through the scene reference.
   *
   * @param targetScene  The user's scene (Preview or Program)
   * @param dedicatedScene  Our dedicated scene (e.g. " MCE Bible")
   * @param enable  Whether to enable (show) the scene source
   */
  private async ensureSceneSourceInTarget(
    targetScene: string,
    dedicatedScene: string,
    enable: boolean,
  ): Promise<number> {
    // Reuse an existing item when possible. Recreating the item every time
    // is expensive and has been a source of OBS hangs when the target scene
    // is already active.
    try {
      let items = await this.getSceneItemListCached(targetScene);
      const existingItems = items.filter((i) => i.sourceName === dedicatedScene);
      if (existingItems.length > 0) {
        const [primaryItem, ...duplicateItems] = existingItems;

        for (const item of duplicateItems) {
          await this.call("RemoveSceneItem", { sceneName: targetScene, sceneItemId: item.sceneItemId }).catch(() => { });
          await new Promise((r) => setTimeout(r, 50));
        }
        if (duplicateItems.length > 0) {
          this.invalidateSceneItemListCache(targetScene);
        }

        await this.call("SetSceneItemEnabled", {
          sceneName: targetScene,
          sceneItemId: primaryItem.sceneItemId,
          sceneItemEnabled: enable,
        }).catch(() => { });

        await this.ensureTickerAboveSource(targetScene, dedicatedScene).catch(() => { });

        return primaryItem.sceneItemId;
      }
    } catch { /* ignore */ }

    // Now add fresh — with retries
    let sceneItemId: number | null = null;
    for (let attempt = 0; attempt <= 4; attempt++) {
      try {
        const sceneExists = await this.hasObsScene(dedicatedScene).catch(() => false);
        if (!sceneExists) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        const created = await this.call("CreateSceneItem", {
          sceneName: targetScene,
          sourceName: dedicatedScene,
          sceneItemEnabled: enable,
        }) as { sceneItemId: number };
        sceneItemId = created.sceneItemId;
        this.invalidateSceneItemListCache(targetScene);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }

    if (sceneItemId === null) throw new Error(`Failed to add scene "${dedicatedScene}" to "${targetScene}"`);

    try {
      await this.fitSceneItemToCanvas(targetScene, sceneItemId);
    } catch { /* ignore */ }

    await this.ensureTickerAboveSource(targetScene, dedicatedScene).catch(() => { });

    return sceneItemId;
  }

  /**
   * Hide a dedicated scene source in the given target scene.
   */
  private async hideSceneSource(targetScene: string, dedicatedScene: string): Promise<void> {
    // Never hide MCE Presentation — only hide legacy dedicated scenes
    if (dedicatedScene === PRESENTATION_SCENE_NAME) return;
    try {
      const items = await this.getSceneItemListCached(targetScene);
      const item = items.find((i) => i.sourceName === dedicatedScene);
      if (item) {
        await this.call("SetSceneItemEnabled", {
          sceneName: targetScene,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: false,
        });
      }
    } catch { /* ignore */ }
  }

  private async removeSceneItemBySource(sceneName: string, sourceName: string): Promise<void> {
    // Never remove MCE Presentation scene source — only remove legacy dedicated scenes
    if (sourceName === PRESENTATION_SCENE_NAME) return;
    try {
      const items = await this.getSceneItemListCached(sceneName);
      const matched = items.filter((item) => item.sourceName === sourceName);
      for (const item of matched) {
        await this.call("RemoveSceneItem", {
          sceneName,
          sceneItemId: item.sceneItemId,
        });
      }
    } catch { /* ignore */ }
  }

  /**
   * If Studio Mode is ON, remove the given source from the Program scene.
   * This prevents MCE scene changes from leaking into Program after
   * a transition (OBS scenes are single instances — modifying them
   * updates every scene that references them).
   */
  private async removeFromProgramIfExists(sourceName: string): Promise<void> {
    try {
      const sm = await this.call("GetStudioModeEnabled") as { studioModeEnabled: boolean };
      if (!sm.studioModeEnabled) return;
      const resp = await this.call("GetCurrentProgramScene") as { currentProgramSceneName: string };
      const programScene = resp.currentProgramSceneName;
      if (programScene) {
        await this.removeSceneItemBySource(programScene, sourceName);
      }
    } catch { /* ignore */ }
  }

  private async removeInputIfExists(inputName: string): Promise<void> {
    try {
      await this.call("RemoveInput", { inputName });
    } catch { /* ignore */ }
    delete this._lastBrowserSourceUrlBySource[inputName];
    delete this._lastCssOverlayPacketBySource[inputName];
    delete this._lastCssOverlayBaseUrlBySource[inputName];
    delete this._lastCssOverlayThemeCssBySource[inputName];
  }

  private async removeSceneIfExists(sceneName: string): Promise<void> {
    try {
      await this.call("RemoveScene", { sceneName });
      this._knownScenes.delete(sceneName);
      this._cloneExistsCache.delete(sceneName);
      delete this._lastBgItemState[sceneName];
      delete this._activeLtBgSignature[sceneName];
      delete this._activeLtBgInputKind[sceneName];
    } catch { /* ignore */ }
  }

  /**
   * Determine whether a scene name was created by MakeChurchEasy.
   *
   * Matches:
   *  - Exact names: "MCE Presentation", "MCE Lower Thirds", "MCE_PreService",
   *    "MCE Ticker Scene", "⚡ Quick Merge"
   *  - Prefix patterns: "MCE ", "MCE_", "MV: ", "Sunday - "
   *  - Source-prefixed scenes: "MCE MV: "
   */
  private static isMCEScene(name: string): boolean {
    const n = name.trim();
    // Exact matches
    if (
      n === "MCE Presentation" ||
      n === "MCE Lower Thirds" ||
      n === "MCE_PreService" ||
      n === "MCE Ticker Scene" ||
      n === "⚡ Quick Merge"
    ) return true;

    // Prefix patterns
    if (
      n.startsWith("MCE ") ||
      n.startsWith("MCE_") ||
      n.startsWith("MV: ") ||
      n.startsWith("Sunday - ")
    ) return true;

    return false;
  }

  private static isManagedMultiviewSceneName(name: string): boolean {
    return /^MV:\s*Multiview\b/i.test(name.trim());
  }

  /**
   * Delete every scene and source that MakeChurchEasy created in OBS.
   *
   * This removes MCE-managed scenes and strips MCE-prefixed sources from
   * any remaining (user-owned) scenes.  The user is responsible for
   * confirming the destructive action before calling this.
   */
  async clearAllMCEScenes(): Promise<{ deletedScenes: number; cleanedSources: number }> {
    const sceneNames = await this.getObsSceneNames();
    const mceScenes = sceneNames.filter((n) => DockObsClient.isMCEScene(n));
    const userScenes = sceneNames.filter((n) => !DockObsClient.isMCEScene(n));

    // If the current program scene is an MCE scene, switch to the first user scene
    // so OBS doesn't get stuck on a scene we're about to delete.
    if (userScenes.length > 0) {
      try {
        const currentProgram = await this.getCurrentProgramSceneName();
        if (mceScenes.includes(currentProgram)) {
          await this.call("SetCurrentProgramScene", { sceneName: userScenes[0] });
        }
      } catch { /* best effort */ }
    }

    // Delete MCE scenes
    let deletedScenes = 0;
    for (const scene of mceScenes) {
      try {
        await this.call("RemoveScene", { sceneName: scene });
        this._knownScenes.delete(scene);
        this._cloneExistsCache.delete(scene);
        deletedScenes++;
      } catch (err) {
        console.warn(`[DockOBS] Failed to delete MCE scene "${scene}":`, err);
      }
    }

    // Clean up MCE-prefixed sources from remaining user scenes
    const MCE_SOURCE_PREFIXES = ["MCE ", "MCE_", "OCS "];
    let cleanedSources = 0;

    for (const scene of userScenes) {
      try {
        const resp = await this.call("GetSceneItemList", { sceneName: scene }) as {
          sceneItems?: Array<{ sceneItemId: number; sourceName?: string }>;
        };
        const items = resp.sceneItems ?? [];
        for (const item of items) {
          const src = (item.sourceName ?? "").trim();
          const isMCE = MCE_SOURCE_PREFIXES.some((p) => src.startsWith(p));
          if (!isMCE) continue;
          try {
            await this.call("RemoveSceneItem", {
              sceneName: scene,
              sceneItemId: item.sceneItemId,
            });
            cleanedSources++;
          } catch { /* ignore individual source failures */ }
        }
      } catch { /* ignore scene-level failures */ }
    }

    return { deletedScenes, cleanedSources };
  }

  /**
   * Strip large data-URI fields from theme settings before URL encoding.
   *
   * `logoUrl` and `backgroundImage` data URIs can be 50 KB–500 KB+, which
   * blows past OBS / CEF URL length limits when JSON-stringified into the
   * URL hash fragment.  We replace them with sentinel values (e.g.
   * `__FROM_CSS__`) and inject them into the browser source via OBS's
   * `css` input-setting, where there is no length limit.
   *
   * The overlay HTML reads the CSS custom properties as a fallback.
   */
  private stripThemeDataUris(
    themeSettings: Record<string, unknown> | null | undefined,
  ): { cleanSettings: Record<string, unknown> | null; css: string } {
    if (!themeSettings) return { cleanSettings: null, css: "" };

    const clean = { ...themeSettings };
    const cssRules: string[] = [];

    // --- logoUrl ---
    const logoUrl = clean.logoUrl as string | undefined;
    if (logoUrl && logoUrl.startsWith("data:")) {
      cssRules.push(`--logo-data-uri: url(${logoUrl});`);
      clean.logoUrl = "__FROM_CSS__";
    }

    // --- backgroundImage ---
    const bgImage = clean.backgroundImage as string | undefined;
    if (bgImage && bgImage.startsWith("data:")) {
      // Deliver image data via OBS custom CSS so it works in the dock for
      // both fullscreen and lower-third themes without relying on a file path.
      cssRules.push(`--bg-image: url(${bgImage});`);
      clean.backgroundImage = "__FROM_CSS__";
    }

    // --- boxBackgroundImage ---
    const boxBgImage = clean.boxBackgroundImage as string | undefined;
    if (boxBgImage && boxBgImage.startsWith("data:")) {
      cssRules.push(`--box-bg-image: url(${boxBgImage});`);
      clean.boxBackgroundImage = "__FROM_CSS__";
    }

    // --- backgroundPattern (SVG data URIs) ---
    // Wrap in quotes because SVG data URIs may contain unencoded parentheses
    // (from transform="rotate(...)" etc.) that break CSS url() parsing.
    const bgPattern = clean.backgroundPattern as string | undefined;
    if (bgPattern && bgPattern.startsWith("data:")) {
      cssRules.push(`--bg-pattern-data: url("${bgPattern}");`);
      clean.backgroundPattern = "__FROM_CSS__";
    }

    const css = cssRules.length ? `:root { ${cssRules.join(" ")} }` : "";
    return { cleanSettings: clean, css };
  }

  private mergeThemeSettingsWithLiveOverrides(
    themeSettings: Record<string, unknown> | null | undefined,
    liveOverrides: DockLiveThemeOverrides | Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!themeSettings && !liveOverrides) return null;
    return {
      ...(themeSettings ?? {}),
      ...(liveOverrides ?? {}),
    };
  }

  private hasVisualBackground(themeSettings: Record<string, unknown> | null | undefined): boolean {
    if (!themeSettings) return false;

    const bgColor = String(themeSettings.backgroundColor || "").trim().toLowerCase();
    const bgImage = String(themeSettings.backgroundImage || "").trim();
    const bgPattern = String(themeSettings.backgroundPattern || "").trim();
    const bgVideo = String(themeSettings.backgroundVideo || "").trim();
    const bgImageFilePath = String(themeSettings.backgroundImageFilePath || "").trim();
    const bgVideoFilePath = String(themeSettings.backgroundVideoFilePath || "").trim();

    if (
      Boolean(bgImage) ||
      Boolean(bgPattern) ||
      Boolean(bgVideo) ||
      Boolean(bgImageFilePath) ||
      Boolean(bgVideoFilePath)
    ) {
      return true;
    }

    return (
      Boolean(bgColor) &&
      bgColor !== "transparent" &&
      bgColor !== "#0000" &&
      bgColor !== "#00000000" &&
      bgColor !== "rgba(0,0,0,0)" &&
      bgColor !== "rgba(0, 0, 0, 0)"
    );
  }

  private _resolveNativeBackgroundSource(
    themeSettings: Record<string, unknown> | null | undefined,
    canvas: { width: number; height: number },
  ): { inputKind: "color_source_v3" | "image_source" | "ffmpeg_source"; inputSettings: Record<string, unknown> } | null {
    if (!themeSettings) return null;

    const bgVideoFilePath = this._resolveNativeVideoPath(themeSettings);
    const bgImageFilePath = String(themeSettings.backgroundImageFilePath || "").trim();
    const hasVideo = Boolean(String(themeSettings.backgroundVideo || "").trim() || bgVideoFilePath);
    const hasImage = Boolean(String(themeSettings.backgroundImage || "").trim() || bgImageFilePath);

    // Videos can render via a native OBS media source when we have a real
    // local file path. That keeps the background stable while the browser
    // source updates verse/lyrics text.
    if (hasVideo && bgVideoFilePath) {
      return {
        inputKind: "ffmpeg_source",
        inputSettings: {
          local_file: bgVideoFilePath,
          is_local_file: true,
          looping: true,
          restart_on_activate: true,
          close_when_inactive: false,
          clear_on_media_end: false,
          scale_to_fit: false,
        },
      };
    }

    // Images: use a native OBS image_source only when we have a real local
    // file path. Relative or remote URLs stay browser-rendered so OBS does not
    // silently fall back to a blank source.
    if (hasImage && bgImageFilePath) {
      const imageUrl = bgImageFilePath;
      return {
        inputKind: "image_source",
        inputSettings: {
          file: imageUrl,
          width: canvas.width,
          height: canvas.height,
        },
      };
    }

    const bgColor = String(themeSettings.backgroundColor || "").trim();
    const bgColorEnd = String(themeSettings.backgroundColorEnd || "").trim();
    const normalizedColor = bgColor.toLowerCase();
    const isTransparent =
      !normalizedColor ||
      normalizedColor === "transparent" ||
      normalizedColor === "#0000" ||
      normalizedColor === "#00000000" ||
      normalizedColor === "rgba(0,0,0,0)" ||
      normalizedColor === "rgba(0, 0, 0, 0)";
    const isGradient = !isTransparent && Boolean(bgColorEnd) && bgColorEnd !== bgColor;
    if (!isTransparent && !isGradient) {
      return {
        inputKind: "color_source_v3",
        inputSettings: {
          color: this._cssColorToObsColor(bgColor),
          width: canvas.width,
          height: canvas.height,
        },
      };
    }

    return null;
  }

  private _resolveNativeVideoPath(
    themeSettings: Record<string, unknown> | null | undefined,
  ): string {
    if (!themeSettings) return "";

    const explicitPath = String(themeSettings.backgroundVideoFilePath || "").trim();
    if (explicitPath) return explicitPath;

    const rawVideo = String(themeSettings.backgroundVideo || "").trim();
    if (!rawVideo) return "";

    if (rawVideo.startsWith("file://")) {
      try {
        return decodeURIComponent(new URL(rawVideo).pathname);
      } catch {
        return rawVideo.replace(/^file:\/\//i, "");
      }
    }

    return "";
  }

  private _hasBrowserRenderedBackground(themeSettings: Record<string, unknown> | null | undefined): boolean {
    if (!themeSettings) return false;
    const bgColor = String(themeSettings.backgroundColor || "").trim().toLowerCase();
    const bgColorEnd = String(themeSettings.backgroundColorEnd || "").trim();
    const bgImage = String(themeSettings.backgroundImage || "").trim();
    const bgPattern = String(themeSettings.backgroundPattern || "").trim();
    const bgImageFilePath = String(themeSettings.backgroundImageFilePath || "").trim();
    const bgVideo = String(themeSettings.backgroundVideo || "").trim();
    const bgVideoFilePath = String(themeSettings.backgroundVideoFilePath || "").trim();
    // Browser rendering is used for gradients, patterns, and for image/video
    // URLs that do not have a stable local file path for a native OBS source.
    return Boolean(
      (bgColor && bgColor !== "transparent" && bgColor !== "#0000" && bgColor !== "#00000000" && bgColor !== "rgba(0,0,0,0)" && bgColor !== "rgba(0, 0, 0, 0)" && bgColorEnd && bgColorEnd !== bgColor) ||
      Boolean(bgPattern) ||
      (bgImage && !bgImageFilePath) ||
      (bgVideo && !bgVideoFilePath),
    );
  }

  private async _ensureNativeBackgroundSource(
    sceneName: string,
    sourceName: string,
    background: { inputKind: "image_source" | "color_source_v3" | "ffmpeg_source"; inputSettings: Record<string, unknown> } | null,
    enable: boolean,
    canvas: { width: number; height: number },
  ): Promise<void> {
    if (!background) return;

    let inputExists = false;
    try {
      const inputs = await this.call("GetInputList") as {
        inputs: Array<{ inputName: string; inputKind: string }>;
      };
      const existing = inputs.inputs.find((i) => i.inputName === sourceName);
      if (existing) {
        inputExists = true;
        if (existing.inputKind !== background.inputKind) {
          await this.call("RemoveInput", { inputName: sourceName }).catch(() => { });
          inputExists = false;
        }
      }
    } catch { /* ignore */ }

    if (!inputExists) {
      await this.call("CreateInput", {
        inputName: sourceName,
        inputKind: background.inputKind,
        inputSettings: background.inputSettings,
      }).catch(() => { });
    } else {
      await this.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: background.inputSettings,
      }).catch(() => { });
    }

    try {
      const items = await this.getSceneItemListCached(sceneName);
      let sceneItemId = items.find((i) => i.sourceName === sourceName)?.sceneItemId;
      if (sceneItemId === undefined) {
        const created = await this.call("CreateSceneItem", {
          sceneName,
          sourceName,
          sceneItemEnabled: enable,
        }) as { sceneItemId: number };
        sceneItemId = created.sceneItemId;
        this.invalidateSceneItemListCache(sceneName);
      }

      await this.call("SetSceneItemTransform", {
        sceneName,
        sceneItemId,
        sceneItemTransform: {
          positionX: 0, positionY: 0,
          scaleX: 1, scaleY: 1,
          boundsType: "OBS_BOUNDS_STRETCH",
          boundsWidth: canvas.width, boundsHeight: canvas.height,
          boundsAlignment: 0,
          rotation: 0,
          cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0,
        },
      }).catch(() => { });
      await this.call("SetSceneItemIndex", { sceneName, sceneItemId, sceneItemIndex: 0 }).catch(() => { });
      await this.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId,
        sceneItemEnabled: enable,
      }).catch(() => { });

      if (enable && background.inputKind === "ffmpeg_source") {
        await this.call("TriggerMediaInputAction", {
          inputName: sourceName,
          mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
        }).catch(() => { });
      }
    } catch { /* best effort */ }
  }

  private async _ensureBrowserBackgroundSource(
    sceneName: string,
    sourceName: string,
    themeSettings: Record<string, unknown>,
    enable: boolean,
    canvas: { width: number; height: number },
    resources: DockResourceNames = DOCK_RESOURCES,
  ): Promise<void> {
    const { cleanSettings, css } = this.stripThemeDataUris(themeSettings);
    const signature = JSON.stringify({
      theme: cleanSettings ?? null,
      css: css || "",
      width: canvas.width,
      height: canvas.height,
    });
    const url = this.buildFullscreenBackgroundUrl(cleanSettings);

    try {
      const inputs = await this.call("GetInputList") as {
        inputs: Array<{ inputName: string; inputKind: string }>;
      };
      const existing = inputs.inputs.find((i) => i.inputName === sourceName);
      if (existing && existing.inputKind !== "browser_source") {
        await this.call("RemoveInput", { inputName: sourceName }).catch(() => { });
      }
    } catch { /* ignore */ }

    await this.ensureOverlaySource(sceneName, sourceName, canvas.width, canvas.height, enable);
    if (this._lastFullscreenBgSignature[sourceName] !== signature) {
      await this.setBrowserSourceUrl(sourceName, url, false, css || undefined);
      this._lastFullscreenBgSignature[sourceName] = signature;
    }
    const bgItems = await this.getSceneItemListCached(sceneName);
    const bgItem = bgItems.find((item) => item.sourceName === sourceName);
    if (bgItem) {
      await this._positionBgBelowOverlays(sceneName, bgItem.sceneItemId, resources);
    }
  }

  /**
   * Update a browser source URL in OBS.
   * Optionally forces a reload by briefly blanking the source first,
   * which is needed when switching between different overlay HTML files
   * (e.g. fullscreen → lower-third) on the same source.
   *
   * @param css  Optional CSS to inject into the browser source via
   *             OBS `SetInputSettings`. Used to deliver large data URIs
   *             (logos, box backgrounds) that would exceed URL-hash limits.
   */
  private async setBrowserSourceUrl(inputName: string, url: string, forceReload = false, css?: string): Promise<void> {
    await browserQueue.enqueue(inputName, async () => {
      const prevUrl = this._lastBrowserSourceUrlBySource[inputName];
      let urlChanged = !this.browserSourceUrlMatchesLoadedDocument(prevUrl, url);
      if (urlChanged && !prevUrl && !forceReload) {
        const currentUrl = await this.readBrowserSourceUrl(inputName);
        if (this.browserSourceUrlMatchesLoadedDocument(currentUrl, url)) {
          this._lastBrowserSourceUrlBySource[inputName] = url;
          urlChanged = false;
        }
      }

      if (forceReload || urlChanged) {
        // Blank → wait → set new URL → forces OBS CEF to fully reload
        if (forceReload) {
          try {
            await this.call("SetInputSettings", { inputName, inputSettings: { url: "about:blank" } });
          } catch { /* ignore */ }
          await new Promise((r) => setTimeout(r, 100));
        }
        const inputSettings: Record<string, unknown> = { url, bgcolor: "#00000000" };
        if (css !== undefined) inputSettings.css = css;
        try {
          await this.call("SetInputSettings", {
            inputName,
            inputSettings,
          });
          this._lastBrowserSourceUrlBySource[inputName] = url;
        } catch { /* ignore */ }
        return;
      }

      if (css === undefined) return;
      try {
        await this.call("SetInputSettings", {
          inputName,
          inputSettings: { css },
        });
      } catch { /* ignore */ }
    }, { label: inputName, force: forceReload });
  }

  private normalizeBrowserSourceDocumentUrl(url: string | undefined): string {
    const trimmed = String(url || "").trim();
    if (!trimmed || trimmed === "about:blank") return "";
    const hashIndex = trimmed.indexOf("#");
    return hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  }

  private browserSourceUrlMatchesLoadedDocument(currentUrl: string | undefined, nextUrl: string): boolean {
    if (!currentUrl || !nextUrl) return false;
    if (currentUrl === nextUrl) return true;
    if (nextUrl.includes("#")) return false;
    return this.normalizeBrowserSourceDocumentUrl(currentUrl) === nextUrl;
  }

  private async readBrowserSourceUrl(inputName: string): Promise<string> {
    try {
      const resp = await this.call("GetInputSettings", { inputName }) as {
        inputSettings?: { url?: unknown };
      };
      return typeof resp.inputSettings?.url === "string" ? resp.inputSettings.url : "";
    } catch {
      return "";
    }
  }

  private async hasBrowserSourceUrlChanged(inputName: string, baseUrl: string): Promise<boolean> {
    const cachedUrl = this._lastBrowserSourceUrlBySource[inputName];
    if (this.browserSourceUrlMatchesLoadedDocument(cachedUrl, baseUrl)) return false;

    const currentUrl = await this.readBrowserSourceUrl(inputName);
    if (this.browserSourceUrlMatchesLoadedDocument(currentUrl, baseUrl)) {
      this._lastBrowserSourceUrlBySource[inputName] = baseUrl;
      return false;
    }

    return true;
  }

  private async hasExistingOverlaySceneItem(sourceName: string): Promise<boolean> {
    for (const sceneName of await this.getLikelyOverlayScenes()) {
      const items = await this.getSceneItemListCached(sceneName).catch(() => []);
      if (items.some((item) => item.sourceName === sourceName)) return true;
    }
    return false;
  }

  private async canReuseStableCssOverlaySource(sourceName: string, baseUrl: string): Promise<boolean> {
    const urlChanged = await this.hasBrowserSourceUrlChanged(sourceName, baseUrl).catch(() => true);
    if (urlChanged) return false;
    return this.hasExistingOverlaySceneItem(sourceName);
  }

  private async keepLoadedCssOverlaySourceStable(
    sourceName: string,
    tabType: "worship" | "notes",
    packet: Record<string, unknown>,
    baseUrl: string,
    themeCss = "",
  ): Promise<boolean> {
    const canReuseLoadedSource = await this.canReuseStableCssOverlaySource(sourceName, baseUrl).catch(() => false);
    if (!canReuseLoadedSource) return false;

    if (tabType === "worship") {
      this._worshipInitialized = true;
    } else {
      this._notesInitialized = true;
    }

    const mode = packet.mode;
    if (mode === "fullscreen" || mode === "lower-third") {
      this._lastOverlayMode[sourceName] = mode;
    }
    this.rememberCssOverlayTransport(sourceName, packet, baseUrl, themeCss);
    return true;
  }

  private buildCssOverlayDataCss(
    packet: Record<string, unknown>,
    themeCss = "",
  ): string {
    const encodedPacket = encodeURIComponent(JSON.stringify(packet));
    const displayMode = packet.mode === "lower-third" || packet.mode === "fullscreen"
      ? ` --display-mode: "${String(packet.mode)}";`
      : "";
    const overlayCss = `:root { --overlay-data: "${encodedPacket}";${displayMode} }`;
    const fontCss = buildDockFontFamilyCss(loadDockFontFamily());
    return [overlayCss, themeCss, fontCss].filter(Boolean).join("\n");
  }

  private async emitBrowserOverlayPacket(
    tabType: CssOverlayPacketTab,
    packet: Record<string, unknown>,
    overlayCss: string,
    targetSource?: string,
  ): Promise<boolean> {
    try {
      await this.call("CallVendorRequest", {
        vendorName: "obs-browser",
        requestType: "emit_event",
        requestData: {
          event_name: "mce-overlay-packet",
          event_data: {
            tab: tabType,
            packet,
            css: overlayCss,
            version: OVERLAY_HTML_VERSION,
            ...(targetSource ? { targetSource } : {}),
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  private async emitCssOverlayPacketWithFallback(
    inputName: string,
    tabType: CssOverlayPacketTab,
    packet: Record<string, unknown>,
    baseUrl: string,
    overlayCss: string,
  ): Promise<void> {
    // Browser-source CSS changes destroy and recreate OBS's CEF document.
    // Deliver the complete packet (including theme CSS) through obs-browser's
    // in-place custom event instead. The CSS write is a recovery path only
    // when this OBS build cannot emit the event at all.
    // Scope the packet to this input. obs-browser broadcasts vendor events to
    // every browser source, so an older dock window must not overwrite this
    // source while an operator advances a verse or lyric.
    const emitted = await this.emitBrowserOverlayPacket(tabType, packet, overlayCss, inputName);
    if (!emitted) {
      await this.setBrowserSourceUrl(inputName, baseUrl, false, overlayCss);
    }
  }

  private async deliverCssOverlayPacket(
    inputName: string,
    tabType: CssOverlayPacketTab,
    packet: Record<string, unknown>,
    baseUrl: string,
    themeCss = "",
  ): Promise<void> {
    const overlayCss = this.buildCssOverlayDataCss(packet, themeCss);
    const sourceWasNotTracked = !Object.prototype.hasOwnProperty.call(
      this._lastBrowserSourceUrlBySource,
      inputName,
    );
    const urlChanged = await this.hasBrowserSourceUrlChanged(inputName, baseUrl);
    const previousMode = this._lastCssOverlayPacketBySource[inputName]?.mode;
    const modeChanged = previousMode !== undefined && previousMode !== packet.mode;
    const previousPacket = this._lastCssOverlayPacketBySource[inputName];
    const previousThemeCss = this._lastCssOverlayThemeCssBySource[inputName] || "";
    let themePayloadChanged = previousThemeCss !== (themeCss || "");
    if (!themePayloadChanged) {
      try {
        themePayloadChanged =
          JSON.stringify(previousPacket?.theme ?? null) !== JSON.stringify(packet.theme ?? null);
      } catch {
        themePayloadChanged = true;
      }
    }

    // URL changes still require a browser reload. On the first packet after
    // connecting to OBS, put the complete packet into CSS as well: a newly
    // loaded CEF document may not have attached its obs-browser event listener
    // yet, so an event-only packet can be lost and leave the source blank.
    // This is a one-time/bootstrap path; normal verse changes stay in-place.
    if (urlChanged || sourceWasNotTracked) {
      await this.setBrowserSourceUrl(inputName, baseUrl, false, overlayCss);
      this.rememberCssOverlayTransport(inputName, packet, baseUrl, themeCss);
      return;
    }

    if (modeChanged) {
      // The running page morphs in place; never recreate it for a mode switch.
      await this.emitCssOverlayPacketWithFallback(inputName, tabType, packet, baseUrl, overlayCss);
      this.rememberCssOverlayTransport(inputName, packet, baseUrl, themeCss);
      return;
    }

    if (!themePayloadChanged) {
      await this.emitCssOverlayPacketWithFallback(inputName, tabType, packet, baseUrl, overlayCss);
      this.rememberCssOverlayTransport(inputName, packet, baseUrl, themeCss);
      return;
    }

    // Theme changes use the same in-place event path, so changing a background
    // or font cannot blank the browser source between slides.
    await this.emitCssOverlayPacketWithFallback(inputName, tabType, packet, baseUrl, overlayCss);
    this.rememberCssOverlayTransport(inputName, packet, baseUrl, themeCss);
  }

  private rememberCssOverlayTransport(
    inputName: string,
    packet: Record<string, unknown>,
    baseUrl: string,
    themeCss = "",
  ): void {
    this._lastCssOverlayPacketBySource[inputName] = packet;
    this._lastCssOverlayBaseUrlBySource[inputName] = baseUrl;
    this._lastCssOverlayThemeCssBySource[inputName] = themeCss || "";
  }

  private extractOverlayPacketFromCss(css: string | undefined): Record<string, unknown> | null {
    if (!css) return null;
    const match = css.match(/--overlay-data:\s*"([^"]+)"/);
    if (!match?.[1]) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(match[1]));
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }

  private buildFullscreenBackgroundUrl(
    themeSettings?: Record<string, unknown> | null,
  ): string {
    const packet = {
      theme: themeSettings ?? null,
      timestamp: Date.now(),
    };
    const encoded = encodeURIComponent(JSON.stringify(packet));
    return `${this.buildOverlayHtmlUrl("bible-overlay-bg.html")}#data=${encoded}`;
  }

  private prepareDedicatedLowerThirdTheme(
    themeSettings: Record<string, unknown> | null | undefined,
  ): {
    overlayTheme: Record<string, unknown> | null;
    backgroundTheme: Record<string, unknown> | null;
  } {
    if (!themeSettings) {
      return { overlayTheme: null, backgroundTheme: null };
    }

    const source = { ...themeSettings };
    const bgColor = String(source.backgroundColor || "").trim().toLowerCase();
    const bgImage = String(source.backgroundImage || "").trim();
    const bgPattern = String(source.backgroundPattern || "").trim();
    const bgVideo = String(source.backgroundVideo || "").trim();
    const bgColorEnd = String(source.backgroundColorEnd || "").trim();

    const hasImageOrVideo = Boolean(bgImage) || Boolean(bgVideo);
    const hasPattern = Boolean(bgPattern);
    const isTransparent =
      !bgColor ||
      bgColor === "transparent" ||
      bgColor === "#000" ||
      bgColor === "#000000" ||
      bgColor === "rgba(0,0,0,0)" ||
      bgColor === "rgba(0, 0, 0, 0)";
    const isGradient = !isTransparent && Boolean(bgColorEnd) && bgColorEnd !== bgColor;
    const isSolidColor = !isTransparent && !isGradient;

    // Images, videos, gradients, and solid colors: render in the browser overlay.
    // Solid colors go to the card's --box-background (not --bg-color), so they
    // must stay in the overlay theme — delegating to a native OBS color_source
    // would fill the entire canvas instead of just the card.
    if (hasImageOrVideo || hasPattern || isGradient) {
      return { overlayTheme: source, backgroundTheme: source };
    }

    // Solid colors: overlay handles via --box-background, no native OBS source needed
    if (isSolidColor) {
      return { overlayTheme: source, backgroundTheme: null };
    }

    // No background at all
    return {
      overlayTheme: {
        ...source,
        backgroundColor: "transparent",
        backgroundColorEnd: "",
        backgroundImage: "",
        backgroundVideo: "",
        backgroundOpacity: 1,
        fullscreenShadeEnabled: false,
        fullscreenShadeOpacity: 0,
      },
      backgroundTheme: null,
    };
  }

  /**
   * Hide (disable) an overlay source in a scene, if it exists.
   * Uses cached scene item list to avoid redundant WebSocket calls.
   */
  private async hideOverlaySource(sceneName: string, sourceName: string): Promise<void> {
    try {
      const items = await this.getSceneItemListCached(sceneName);
      const item = items.find((i) => i.sourceName === sourceName);
      if (item) {
        await this.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: false,
        });
      }
    } catch { /* ignore */ }
  }

  /**
   * Build batch requests to hide multiple sources in a scene.
   * Resolves source names → item IDs via the scene item list cache,
   * then returns SetSceneItemEnabled(false) requests for callBatch.
   * Items that don't exist in the scene are silently skipped.
   */
  private async _buildHideBatchRequests(
    sceneName: string,
    sourceNames: string[],
  ): Promise<Array<{ requestType: string; requestData: Record<string, unknown> }>> {
    const items = await this.getSceneItemListCached(sceneName);
    const requests: Array<{ requestType: string; requestData: Record<string, unknown> }> = [];
    for (const name of sourceNames) {
      const item = items.find((i) => i.sourceName === name);
      if (item) {
        requests.push({
          requestType: "SetSceneItemEnabled",
          requestData: {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: false,
          },
        });
      }
    }
    return requests;
  }

  // ── Fullscreen background source helpers ──

  /**
   * Ensure a fullscreen background source exists BEHIND the overlay source.
   * For image backgrounds → OBS `image_source`.
   * For solid colors → OBS `color_source_v3`.
   * The source is placed at z-index 0 (bottom) of the overlay stack so
   * that when the foreground browser source briefly blanks during URL
   * changes, the viewer sees the theme background instead of a flash.
   */
  private async ensureFullscreenBg(
    sceneName: string,
    themeSettings: Record<string, unknown> | null | undefined,
    enable = true,
    resources: DockResourceNames = DOCK_RESOURCES,
  ): Promise<void> {
    // Skip adding a fullscreen BG source into MCE Presentation — the BG
    // already lives inside the dedicated scene that is nested as a source.
    if (sceneName === PRESENTATION_SCENE_NAME) return;

    if (!themeSettings || !this.hasVisualBackground(themeSettings)) {
      await this.hideFullscreenBg(sceneName, resources);
      return;
    }

    const canvas = await this.getCanvasSize();
    const nativeBg = this._resolveNativeBackgroundSource(themeSettings, canvas);

    if (nativeBg) {
      await this._ensureNativeBackgroundSource(sceneName, resources.fsBgSource, nativeBg, enable, canvas);
      return;
    }

    if (!this._hasBrowserRenderedBackground(themeSettings)) {
      await this.hideFullscreenBg(sceneName, resources);
      return;
    }

    await this._ensureBrowserBackgroundSource(sceneName, resources.fsBgSource, themeSettings, enable, canvas, resources);
  }

  /**
   * Ensure the user's actual Preview/Program scene also contains a static
   * background layer behind the nested Bible/Worship scene source. This keeps
   * scene switches from briefly revealing the underlying camera/content.
   */
  private async ensureFullscreenTargetBg(
    targetScene: string,
    overlaySourceName: string,
    themeSettings: Record<string, unknown> | null | undefined,
    enable = true,
    resources: DockResourceNames = DOCK_RESOURCES,
  ): Promise<void> {
    // Skip adding a fullscreen BG source into MCE Presentation — the BG
    // already lives inside the dedicated scene that is nested as a source.
    if (targetScene === PRESENTATION_SCENE_NAME) return;

    if (!themeSettings || !this.hasVisualBackground(themeSettings)) {
      await this.hideFullscreenBg(targetScene, resources);
      return;
    }

    const canvas = await this.getCanvasSize();
    const sourceName = this.getTargetFullscreenBgSourceName(targetScene, resources);
    const nativeBg = this._resolveNativeBackgroundSource(themeSettings, canvas);

    if (nativeBg) {
      await this._ensureNativeBackgroundSource(targetScene, sourceName, nativeBg, enable, canvas);
    } else {
      const { cleanSettings, css } = this.stripThemeDataUris(themeSettings);
      const signature = JSON.stringify({
        theme: cleanSettings ?? null,
        css: css || "",
      });
      const url = this.buildFullscreenBackgroundUrl(cleanSettings);

      await this.ensureOverlaySource(targetScene, sourceName, canvas.width, canvas.height, enable);
      if (this._lastTargetBgSignature[sourceName] !== signature) {
        await this.setBrowserSourceUrl(sourceName, url, false, css || undefined);
        this._lastTargetBgSignature[sourceName] = signature;
      }
    }
    await this._positionSceneLocalBgBelowSource(targetScene, sourceName, overlaySourceName);
  }

  /**
   * Position the background source just below the lowest visible overlay in
   * the OBS source stack, so it sits behind all overlays but above normal
   * scene content.
   */
  private async _positionBgBelowOverlays(
    sceneName: string,
    bgSceneItemId: number,
    resources: DockResourceNames = DOCK_RESOURCES,
  ): Promise<void> {
    try {
      const items = await this.getSceneItemListCached(sceneName);

      const overlayNames = new Set([
        resources.worshipSource,
        resources.ltSource,
        resources.tickerSource,
      ]);
      const overlayItems = items.filter((i) => overlayNames.has(i.sourceName));

      if (overlayItems.length === 0) return;

      // Put the background directly beneath the lowest overlay item while
      // keeping it above the rest of the scene content.
      const lowestOverlayIndex = Math.min(...overlayItems.map((i) => i.sceneItemIndex ?? 0));
      const targetIndex = Math.max(0, lowestOverlayIndex - 1);

      const bgItem = items.find((i) => i.sceneItemId === bgSceneItemId);
      if (bgItem && bgItem.sceneItemIndex !== targetIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId: bgSceneItemId,
          sceneItemIndex: targetIndex,
        });
      }
    } catch { /* ignore */ }
  }

  /**
   * Place a scene-local fullscreen background directly beneath the nested
   * fullscreen scene source in the user's target scene.
   */
  private async _positionSceneLocalBgBelowSource(
    sceneName: string,
    bgSourceName: string,
    overlaySourceName: string,
  ): Promise<void> {
    try {
      let items = await this.getSceneItemListCached(sceneName);

      const overlayItem = items.find((item) => item.sourceName === overlaySourceName);
      const bgItem = items.find((item) => item.sourceName === bgSourceName);
      if (!overlayItem || !bgItem) return;

      const topIndex = Math.max(0, items.length - 1);
      if (overlayItem.sceneItemIndex !== topIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId: overlayItem.sceneItemId,
          sceneItemIndex: topIndex,
        });
        this.invalidateSceneItemListCache(sceneName);
        items = await this.getSceneItemListCached(sceneName);
      }

      const refreshedOverlay = items.find((item) => item.sourceName === overlaySourceName);
      const refreshedBg = items.find((item) => item.sourceName === bgSourceName);
      if (!refreshedOverlay || !refreshedBg) return;

      const desiredBgIndex = Math.max(0, refreshedOverlay.sceneItemIndex! - 1);
      if (refreshedBg.sceneItemIndex !== desiredBgIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId: refreshedBg.sceneItemId,
          sceneItemIndex: desiredBgIndex,
        });
      }
    } catch { /* ignore */ }
  }

  /**
   * Convert a CSS color (#RRGGBB or #RGB) to OBS's ABGR integer format.
   */
  private _cssColorToObsColor(cssColor: string): number {
    const hex = cssColor.replace("#", "");
    let r = 0, g = 0, b = 0;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    // OBS uses ABGR format: 0xAABBGGRR
    return (0xFF << 24 | b << 16 | g << 8 | r) >>> 0;
  }

  /**
   * Hide the fullscreen background source in a scene.
   */
  private async hideFullscreenBg(
    sceneName: string,
    resources: DockResourceNames = DOCK_RESOURCES,
  ): Promise<void> {
    await this.hideOverlaySource(sceneName, resources.fsBgSource);
    await this.hideOverlaySource(sceneName, this.getTargetFullscreenBgSourceName(sceneName, resources));
  }

  // ── Theme resolution helpers ──

  private resolveLTTheme(
    theme: DockLTThemeRef | undefined,
    context: "speaker" | "sermon" | "event" | "worship" | "bible" | "ticker" | "custom",
  ): DockLTThemeRef {
    if (theme) return theme;

    const contextHints: Record<typeof context, string[]> = {
      speaker: ["speaker", "pastor", "minister", "guest", "name", "title"],
      sermon: ["sermon", "sermon title", "title", "point", "quote", "scripture", "keyword"],
      event: ["event", "announcement", "highlight", "reminder", "date", "celebration"],
      worship: ["worship", "lyrics", "song", "chorus", "verse", "music"],
      bible: ["bible", "scripture", "verse", "reference", "word"],
      ticker: ["ticker", "news", "announcement", "headline"],
      custom: ["lower third", "headline", "subtitle", "title", "name", "keyword"],
    };

    const categoryHint =
      context === "worship" ? "worship" : context === "bible" ? "bible" : "";

    const hints = contextHints[context].map(normalizeThemeToken);
    const favoriteIds = getWorshipLTFavorites();

    let list = ALL_THEMES.filter((t) => t.html && t.css);
    if (categoryHint) {
      list = list.filter((t) => normalizeThemeToken(String(t.category || "")) === categoryHint);
    }
    list = list.filter((t) => matchesThemeHints(t, hints));

    const favoriteMatches = list.filter((t) => favoriteIds.has(t.id));
    const customMatches = list.filter((t) => isLikelyCustomTheme(t));
    const fallback = favoriteMatches[0] ?? customMatches[0] ?? list[0];

    if (!fallback) return getDefaultLTTheme();
    return {
      id: fallback.id,
      html: fallback.html || getDefaultLTTheme().html,
      css: fallback.css || getDefaultLTTheme().css,
    };
  }

  // ── Overlay URL builders ──

  private getOverlayBaseUrl(): string {
    return getOverlayBaseUrlSync();
  }

  private isRemotePresentationSession(): boolean {
    return this._hasTransientExplicitConnection && !this._persistConnectionParams;
  }

  private async toRemoteServedMediaUrl(filePath: string, fileName: string): Promise<string> {
    const trimmed = String(filePath || "").trim();
    if (!trimmed) return "";

    if (/^(https?:|data:|blob:)/i.test(trimmed)) {
      return resolveOverlayAssetUrl(trimmed);
    }

    if (trimmed.startsWith("/uploads/") || trimmed.startsWith("uploads/")) {
      return resolveOverlayAssetUrl(trimmed);
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      let targetHost = "";
      try {
        targetHost = new URL(this._url).hostname;
      } catch {
        targetHost = "";
      }
      return await invoke<string>("prepare_remote_media_url", {
        filePath: trimmed,
        fileName,
        targetHost: targetHost || undefined,
      });
    } catch {
      // Non-Tauri dock contexts cannot copy files. Fall back to the managed
      // uploads URL convention; this works for media already saved in uploads.
    }

    const withoutFileProtocol = trimmed.replace(/^file:\/\//i, "");
    const safeFileName = withoutFileProtocol.split(/[\\/]/).pop()?.trim() || "";
    if (!safeFileName) return trimmed;

    return `${this.getOverlayBaseUrl()}/uploads/${encodeURIComponent(safeFileName)}`;
  }

  private buildOverlayHtmlUrl(
    fileName: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    return buildVersionedOverlayUrl(this.getOverlayBaseUrl(), fileName, query);
  }

  private buildCssOverlayHtmlUrlForTab(
    tab: "bible" | "worship" | "announcements" | "notes",
    sourceName?: string,
  ): string {
    const route = sourceName ? { mceSource: sourceName } : {};
    if (tab === "worship") return this.buildOverlayHtmlUrl("mce-worship-overlay.html", route);
    if (tab === "notes") return this.buildOverlayHtmlUrl("mce-note.html", route);
    return this.buildOverlayHtmlUrl("mce-bible-overlay.html", { tab, ...route });
  }

  private extractCssCustomPropertyValue(cssText: string | undefined, name: string): string {
    if (!cssText) return "";
    const propertyIndex = cssText.indexOf(name);
    if (propertyIndex === -1) return "";
    const colonIndex = cssText.indexOf(":", propertyIndex + name.length);
    if (colonIndex === -1) return "";
    let i = colonIndex + 1;
    let quote = "";
    let parenDepth = 0;

    for (; i < cssText.length; i += 1) {
      const ch = cssText[i];
      const prev = i > 0 ? cssText[i - 1] : "";
      if (quote) {
        if (ch === quote && prev !== "\\") quote = "";
        continue;
      }
      if (ch === "\"" || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "(") {
        parenDepth += 1;
        continue;
      }
      if (ch === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
        continue;
      }
      if (ch === ";" && parenDepth === 0) break;
    }

    return cssText.slice(colonIndex + 1, i).trim();
  }

  private buildStandaloneOverlayPacket(
    packet: {
      slide: Record<string, unknown> | null;
      theme: Record<string, unknown> | null;
      live: boolean;
      blanked: boolean;
      timestamp: number;
      mode?: string;
    },
    css?: string,
  ): {
    slide: Record<string, unknown> | null;
    theme: Record<string, unknown> | null;
    live: boolean;
    blanked: boolean;
    timestamp: number;
    mode?: string;
  } {
    if (!packet.theme || !css) return packet;

    const theme = { ...packet.theme } as Record<string, unknown>;
    const bgImageCss = this.extractCssCustomPropertyValue(css, "--bg-image");
    const bgPatternCss = this.extractCssCustomPropertyValue(css, "--bg-pattern-data");
    const logoCss = this.extractCssCustomPropertyValue(css, "--logo-data-uri");
    const boxBgImageCss = this.extractCssCustomPropertyValue(css, "--box-bg-image");

    const unwrapCssUrl = (value: string): string => {
      const trimmed = value.trim();
      if (!trimmed) return "";
      const match = trimmed.match(/^url\((.*)\)$/i);
      if (!match?.[1]) return trimmed;
      return match[1].trim().replace(/^['"]|['"]$/g, "");
    };

    if (theme.backgroundImage === "__FROM_CSS__" && bgImageCss) {
      theme.backgroundImage = unwrapCssUrl(bgImageCss);
    }
    if (theme.backgroundPattern === "__FROM_CSS__" && bgPatternCss) {
      theme.backgroundPattern = unwrapCssUrl(bgPatternCss);
    }
    if (theme.logoUrl === "__FROM_CSS__" && logoCss) {
      theme.logoUrl = unwrapCssUrl(logoCss);
    }
    if (theme.boxBackgroundImage === "__FROM_CSS__" && boxBgImageCss) {
      theme.boxBackgroundImage = unwrapCssUrl(boxBgImageCss);
    }

    return {
      ...packet,
      theme,
    };
  }

  private publishFullscreenOverlayPacket(packet: {
    slide: Record<string, unknown> | null;
    theme: Record<string, unknown> | null;
    live: boolean;
    blanked: boolean;
    timestamp: number;
    mode?: string;
  }, tabType: "bible" | "worship" | "announcements" | "sermon" | "notes" = "bible", css?: string): void {
    const storageKey = tabType === "notes"
      ? "notes-overlay-data"
      : tabType === "worship" || tabType === "announcements"
        ? "worship-overlay-data"
        : "bible-overlay-data";
    const channelName = tabType === "notes"
      ? "obs-church-studio-notes-overlay"
      : tabType === "worship" || tabType === "announcements"
        ? "obs-church-studio-worship-overlay"
        : "obs-church-studio-bible-overlay";
    const standalonePacket = this.buildStandaloneOverlayPacket(packet, css);
    try {
      localStorage.setItem(storageKey, JSON.stringify(standalonePacket));
    } catch { /* ignore */ }

    try {
      const bc = new BroadcastChannel(channelName);
      bc.postMessage(standalonePacket);
      bc.close();
    } catch { /* ignore */ }

    const bridgeChannel = tabType === "notes"
      ? "notes"
      : tabType === "worship" || tabType === "announcements"
        ? "worship"
        : "bible";
    overlayBridge.publish({
      channel: bridgeChannel,
      type: "overlay-update",
      revision: Date.now(),
      data: { ...packet, revision: Date.now() },
    });
  }

  private publishBlankFullscreenOverlayPacket(
    tabType: "bible" | "worship" | "announcements" | "sermon" | "notes",
    mode: "fullscreen" | "lower-third" = "lower-third",
  ): void {
    this.publishFullscreenOverlayPacket({
      slide: null,
      theme: null,
      live: false,
      blanked: true,
      timestamp: Date.now(),
      mode,
    }, tabType, "");
  }

  private getOverlayRenderAckStorageKey(
    tabType: CssOverlayPacketTab = "bible",
  ): string {
    if (tabType === "notes") return "notes-overlay-render-ack";
    if (tabType === "lower-third") return "lower-third-overlay-render-ack";
    return tabType === "worship" || tabType === "announcements"
      ? "worship-overlay-render-ack"
      : "bible-overlay-render-ack";
  }

  private async waitForOverlayRenderAck(
    tabType: CssOverlayPacketTab,
    timestamp: number,
    mode: string,
    timeoutMs = 250,
    transitionId?: number,
  ): Promise<boolean> {
    const storageKey = this.getOverlayRenderAckStorageKey(tabType);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { timestamp?: number; mode?: string; transitionId?: number } | null;
          if (
            parsed &&
            Number(parsed.timestamp) >= timestamp &&
            parsed.mode === mode &&
            (transitionId === undefined || parsed.transitionId === transitionId)
          ) {
            return true;
          }
        }
      } catch { /* ignore */ }

      await this.sleep(16);
    }

    return false;
  }

  /**
   * Build a lower-third overlay URL with proper theme HTML/CSS payload.
   *
   * NOTE: The `live` param here is ignored — we ALWAYS send `live: true`
   * to the overlay HTML so it renders visibly. Which OBS scene the source
   * lives in (Preview vs Program) is controlled by the caller; the overlay
   * itself should never self-hide based on `live`. Hiding is done via
   * `blanked: true` or by calling `hideOverlaySource`.
   */
  private buildLowerThirdUrl(
    values: Record<string, string>,
    _live: boolean,
    blanked: boolean,
    theme?: DockLTThemeRef,
  ): string {
    const t = theme ?? getDefaultLTTheme();
    const payload = {
      themeId: t.id,
      html: t.html,
      css: [stripCompatModeCSS(t.css), buildDockFontFamilyCss(loadDockFontFamily())]
        .filter(Boolean)
        .join("\n"),
      values,
      live: true,
      blanked,
      size: "xl",
      scale: 1,
      widthPct: 65,
      fontScale: 1,
      fontSizeScale: 1,
      position: "bottom-left",
      animationIn: "slide-left",
      timestamp: Date.now(),
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    return `${this.buildOverlayHtmlUrl("lower-third-overlay.html")}#data=${encoded}`;
  }

  private parseOverlayPayloadUrl(url: string): { baseUrl: string; payload: Record<string, unknown> } | null {
    if (!url || url === "about:blank" || !url.includes("#data=")) return null;

    try {
      const [baseUrl, encoded] = url.split("#data=");
      if (!baseUrl || !encoded) return null;
      const parsed = JSON.parse(decodeURIComponent(encoded));
      if (!parsed || typeof parsed !== "object") return null;
      return { baseUrl, payload: parsed as Record<string, unknown> };
    } catch {
      return null;
    }
  }

  private buildOverlayUrlFromPayload(baseUrl: string, payload: Record<string, unknown>): string {
    const encoded = encodeURIComponent(JSON.stringify(payload));
    return `${baseUrl}#data=${encoded}`;
  }

  /** Keep routed browser sources independent from the shared MCE output. */
  private buildSceneRouteOverlayUrl(url: string, sourceName: string): string {
    const [documentUrl, hash = ""] = url.split("#", 2);
    const separator = documentUrl.includes("?") ? "&" : "?";
    return `${documentUrl}${separator}mceSource=${encodeURIComponent(sourceName)}${hash ? `#${hash}` : ""}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private buildMediaPatternUrl(patternSrc: string, patternLabel: string): string {
    const safeSrc = patternSrc.replace(/"/g, "&quot;");
    const safeLabel = this.escapeHtml(patternLabel);
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }
    body {
      position: relative;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      object-position: center;
    }
  </style>
</head>
<body>
  <img src="${safeSrc}" alt="${safeLabel}" />
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }

  private buildMediaTextOverlayUrl(payload: {
    headline: string;
    subline?: string;
    textColor?: string;
    align?: "left" | "center" | "right";
    verticalPos?: "top" | "center" | "bottom";
    headlineSize?: number;
    sublineSize?: number;
    animation?: "none" | "fade" | "fade-up" | "slide-up" | "slide-down" | "zoom";
    animationDuration?: number;
    background?: {
      enabled: boolean;
      mode: "text-only" | "box" | "lower-third" | "fullscreen";
      bgType: "color" | "image" | "pattern";
      color: string;
      opacity: number;
      imageId: string | null;
      patternId: string | null;
      blur: number;
      scale: number;
      radius: number;
      padding: number;
      width?: "full" | "clip";
      imageDataUrl?: string | null;
      patternSvgData?: string | null;
    };
  }): string {
    const headline = this.escapeHtml(payload.headline || "");
    const subline = this.escapeHtml(payload.subline || "");
    const textColor = this.escapeHtml(payload.textColor || "#ffffff");
    const align = payload.align === "left" || payload.align === "right" ? payload.align : "center";
    const verticalPos = payload.verticalPos === "top" || payload.verticalPos === "center" || payload.verticalPos === "bottom"
      ? payload.verticalPos : "bottom";
    const headlineSize = payload.headlineSize || 72;
    const sublineSize = payload.sublineSize || 28;
    const animation = payload.animation || "none";
    const animDuration = payload.animationDuration || 1;

    const bg = payload.background;
    const bgEnabled = Boolean(bg?.enabled);
    const bgMode = bg?.mode || "text-only";
    const dockFontCss = buildDockFontFamilyCss(loadDockFontFamily());

    const alignValue = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
    let justifyValue = verticalPos === "top" ? "flex-start" : verticalPos === "center" ? "center" : "flex-end";
    let paddingValue = verticalPos === "top" ? "72px 88px 0" : verticalPos === "center" ? "0 88px" : "0 88px 72px";

    if (bgEnabled && bgMode === "lower-third") {
      justifyValue = "flex-end";
      paddingValue = "0 0 80px 0";
    } else if (bgEnabled && bgMode === "fullscreen") {
      justifyValue = "center";
      paddingValue = "0";
    }

    let animKeyframes = "";
    let animClass = "";
    if (animation !== "none") {
      animClass = "animate-in";
      switch (animation) {
        case "fade":
          animKeyframes = `@keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }`;
          break;
        case "fade-up":
          animKeyframes = `@keyframes overlayIn { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }`;
          break;
        case "slide-up":
          animKeyframes = `@keyframes overlayIn { from { opacity: 0; transform: translateY(60px); } to { opacity: 1; transform: translateY(0); } }`;
          break;
        case "slide-down":
          animKeyframes = `@keyframes overlayIn { from { opacity: 0; transform: translateY(-60px); } to { opacity: 1; transform: translateY(0); } }`;
          break;
        case "zoom":
          animKeyframes = `@keyframes overlayIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }`;
          break;
      }
    }

    /* ── Background styles ── */
    let bgStyle = "";
    if (bgEnabled && bgMode !== "text-only") {
      const bgColor = this.escapeHtml(bg?.color || "#000000");
      const bgOpacity = bg?.opacity ?? 0.85;
      const bgBlur = bg?.blur ?? 0;
      const bgScale = bg?.scale ?? 1;
      const bgRadius = bg?.radius ?? 12;
      const bgPadding = bg?.padding ?? 24;
      const bgWidth = bg?.width || "full";

      let bgImage = "none";
      if (bg?.bgType === "image" && bg.imageDataUrl) {
        bgImage = `url("${bg.imageDataUrl}")`;
      } else if (bg?.bgType === "pattern" && bg.patternSvgData) {
        bgImage = `url("${bg.patternSvgData}")`;
      }

      if (bgMode === "box") {
        const boxClip = bgWidth === "clip";
        bgStyle = `
    .bg-box {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 0;
    }
    .bg-box__fill {
      background-color: ${bgColor};
      background-image: ${bgImage};
      background-size: cover;
      background-position: center;
      opacity: ${bgOpacity};
      filter: blur(${bgBlur}px);
      transform: scale(${bgScale});
      border-radius: ${bgRadius}px;
      padding: ${bgPadding}px;
      display: inline-flex;
      align-items: center;
      justify-content: ${alignValue};
      ${boxClip ? "max-width: 90vw;" : "min-width: 200px;\n      min-height: 80px;\n      max-width: 90vw;"}
    }`;
      } else if (bgMode === "lower-third") {
        const ltClip = bgWidth === "clip";
        bgStyle = `
    .bg-lower-third {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: 0;
    }
    .bg-lower-third__fill {
      background-color: ${bgColor};
      background-image: ${bgImage};
      background-size: cover;
      background-position: center;
      opacity: ${bgOpacity};
      filter: blur(${bgBlur}px);
      transform: scale(${bgScale});
      border-radius: ${bgRadius}px ${bgRadius}px 0 0;
      padding: ${bgPadding + 16}px ${bgPadding + 32}px ${bgPadding + 24}px;
      ${ltClip ? "display: inline-flex;\n      align-items: center;\n      justify-content: center;" : "width: 100%;\n      max-width: 100vw;"}
    }`;
      } else if (bgMode === "fullscreen") {
        bgStyle = `
    .bg-fullscreen {
      position: fixed;
      inset: 0;
      z-index: 0;
    }
    .bg-fullscreen__fill {
      width: 100%;
      height: 100%;
      background-color: ${bgColor};
      background-image: ${bgImage};
      background-size: cover;
      background-position: center;
      opacity: ${bgOpacity};
      filter: blur(${bgBlur}px);
      transform: scale(${bgScale});
    }`;
      }
    }

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
    }
    body {
      font-family: "Montserrat", "Segoe UI", Arial, sans-serif;
      color: ${textColor};
    }
    .frame {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: ${justifyValue};
      justify-content: ${alignValue};
      padding: ${paddingValue};
      text-align: ${align};
      z-index: 1;
    }
    .frame--inline {
      position: relative;
      inset: auto;
      display: flex;
      align-items: center;
      justify-content: ${alignValue};
      padding: 0;
      text-align: ${align};
      z-index: 1;
    }
    .copy {
      max-width: min(84vw, 1440px);
      text-wrap: balance;
    }
    .headline {
      font-size: ${headlineSize}px;
      font-weight: 800;
      line-height: 0.94;
      letter-spacing: -0.04em;
      text-shadow: 0 4px 18px rgba(0, 0, 0, 0.62);
    }
    .subline {
      margin-top: 12px;
      font-size: ${sublineSize}px;
      font-weight: 500;
      line-height: 1.18;
      opacity: 0.95;
      text-shadow: 0 3px 16px rgba(0, 0, 0, 0.56);
    }
    ${bgStyle}
    ${animKeyframes}
    ${dockFontCss}
    .animate-in .copy {
      animation: overlayIn ${animDuration}s ease-out both;
    }
  </style>
</head>
<body>
  ${bgEnabled && bgMode === "box" ? `<div class="bg-box"><div class="bg-box__fill"><div class="frame frame--inline ${animClass}"><div class="copy">${headline ? `<div class="headline">${headline}</div>` : ""}${subline ? `<div class="subline">${subline}</div>` : ""}</div></div></div></div>` : ""}
  ${bgEnabled && bgMode === "lower-third" ? `<div class="bg-lower-third"><div class="bg-lower-third__fill"><div class="frame frame--inline ${animClass}"><div class="copy">${headline ? `<div class="headline">${headline}</div>` : ""}${subline ? `<div class="subline">${subline}</div>` : ""}</div></div></div></div>` : ""}
  ${bgEnabled && bgMode === "fullscreen" ? `<div class="bg-fullscreen"><div class="bg-fullscreen__fill"></div><div class="frame ${animClass}"><div class="copy">${headline ? `<div class="headline">${headline}</div>` : ""}${subline ? `<div class="subline">${subline}</div>` : ""}</div></div></div>` : ""}
  ${!bgEnabled || bgMode === "text-only" ? `<div class="frame ${animClass}"><div class="copy">${headline ? `<div class="headline">${headline}</div>` : ""}${subline ? `<div class="subline">${subline}</div>` : ""}</div></div>` : ""}
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(stripCompatModeCSS(html))}`;
  }

  private async buildBlankedOverlayUrlFromCurrentSource(
    inputName: string,
    fallbackUrl: string,
  ): Promise<string> {
    try {
      const current = await this.call("GetInputSettings", { inputName }) as {
        inputSettings?: { url?: string };
      };
      const currentUrl = current.inputSettings?.url ?? "";
      const parsed = this.parseOverlayPayloadUrl(currentUrl);
      if (!parsed) return fallbackUrl;

      return this.buildOverlayUrlFromPayload(parsed.baseUrl, {
        ...parsed.payload,
        live: false,
        blanked: true,
        timestamp: Date.now(),
      });
    } catch {
      return fallbackUrl;
    }
  }

  private buildBibleSlide(
    text: string,
    reference: string,
    verseRange = "",
    translationText = "",
    translationOrder: DockTranslationOrder = "original-first",
  ): Record<string, unknown> {
    const slide: Record<string, unknown> = {
      id: "dock-bible-slide",
      text,
      reference,
      verseRange,
      index: 0,
      total: 1,
    };
    const cleanTranslation = translationText.trim();
    if (cleanTranslation) {
      slide.translationText = cleanTranslation;
      slide.translationOrder = translationOrder;
    }
    return slide;
  }

  private formatBibleReferenceDisplayText(
    reference: string,
    translation: string,
    displayReferenceLabel?: string,
  ): string {
    if (typeof displayReferenceLabel === "string") {
      return displayReferenceLabel;
    }
    const ref = String(reference || "").trim();
    const version = String(translation || "").trim().toUpperCase();
    if (ref && version) {
      const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\(${escapedVersion}\\)$`).test(ref)) return ref;
      return `${ref} (${version})`;
    }
    return ref || version;
  }

  async primeBibleOverlay(data: PrimeBibleOverlayData): Promise<void> {
    const mode = data.overlayMode ?? "fullscreen";
    const verseRange = data.verseRange ?? String(data.verse);
    const ref = data.referenceLabel ?? `${data.book} ${data.chapter}:${verseRange}`;
    const backgroundOnly = Boolean(data.backgroundOnly);
    const primaryText = backgroundOnly ? "" : (data.verseText || ref);
    const referenceText = backgroundOnly
      ? ""
      : this.formatBibleReferenceDisplayText(ref, data.translation, data.displayReferenceLabel);
    const displayVerseRange = backgroundOnly ? "" : verseRange;
    const compareEnabled = Boolean(data.compareEnabled || data.compare?.enabled);
    const compareLayout = data.compare?.layout ?? data.compareLayout ?? "line-by-line";
    const compareColumns = compareEnabled && Array.isArray(data.compare?.columns)
      ? data.compare.columns.filter(Boolean).slice(0, 2)
      : [];
    const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
      data.bibleThemeSettings,
      data.liveOverrides,
    );
    const themeForOverlay = mode === "lower-third" && effectiveThemeSettings
      ? this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings).overlayTheme
      : effectiveThemeSettings;
    const { cleanSettings, css } = this.stripThemeDataUris(themeForOverlay);
    const themeCss = mode === "lower-third" ? stripCompatModeCSS(css) : css;
    const slide = compareColumns.length === 2
      ? {
        id: "dock-bible-compare-slide",
        layout: "compare",
        compareEnabled: true,
        compareLayout,
        reference: referenceText,
        text: primaryText,
        verseRange: displayVerseRange,
        index: 0,
        total: 1,
        translationA: data.translationA ?? compareColumns[0].translation,
        translationB: data.translationB ?? compareColumns[1].translation,
        columns: compareColumns.map((column) => ({
          book: column.book,
          chapter: column.chapter,
          verse: column.verse,
          verseEnd: column.verseEnd ?? column.verse,
          reference: backgroundOnly ? "" : column.referenceLabel,
          translation: column.translation,
          text: backgroundOnly ? "" : column.verseText,
          verseRange: backgroundOnly ? "" : (column.verseRange ?? ""),
        })),
      }
      : this.buildBibleSlide(primaryText, referenceText, displayVerseRange);
    const packet: Record<string, unknown> = {
      slide,
      theme: cleanSettings ?? null,
      live: true,
      blanked: false,
      timestamp: Date.now(),
      mode,
    };
    const sourceName = this._fullscreenSceneDefs["bible"].browserSourceName;
    const baseUrl = this.buildCssOverlayHtmlUrlForTab("bible", sourceName);

    this.publishFullscreenOverlayPacket({
      slide,
      theme: cleanSettings ?? null,
      live: true,
      blanked: false,
      timestamp: Number(packet.timestamp) || Date.now(),
      mode,
    }, "bible", themeCss);
    await this.deliverCssOverlayPacket(sourceName, "bible", packet, baseUrl, themeCss).catch(() => { });
  }

  async primeWorshipOverlay(data: PrimeWorshipOverlayData): Promise<void> {
    const mode = data.overlayMode ?? "fullscreen";
    const backgroundOnly = Boolean(data.backgroundOnly);
    const sectionText = backgroundOnly ? "" : data.sectionText;
    const translationText = backgroundOnly ? "" : (data.translationText ?? "");
    const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
      data.bibleThemeSettings,
      data.liveOverrides,
    );
    const themeForOverlay = mode === "lower-third" && effectiveThemeSettings
      ? this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings).overlayTheme
      : effectiveThemeSettings;
    const { cleanSettings, css } = this.stripThemeDataUris(themeForOverlay);
    const themeCss = mode === "lower-third" ? stripCompatModeCSS(css) : css;
    const slide = this.buildBibleSlide(sectionText, "", "", translationText, data.translationOrder);
    const packet: Record<string, unknown> = {
      slide,
      theme: cleanSettings ?? null,
      live: true,
      blanked: false,
      timestamp: Date.now(),
      mode,
    };
    const sourceName = getDockResources().worshipSource;
    const baseUrl = this.buildCssOverlayHtmlUrlForTab("worship", sourceName);

    if (await this.keepLoadedCssOverlaySourceStable(sourceName, "worship", packet, baseUrl, themeCss)) {
      return;
    }

    this.publishFullscreenOverlayPacket({
      slide,
      theme: cleanSettings ?? null,
      live: true,
      blanked: false,
      timestamp: Number(packet.timestamp) || Date.now(),
      mode,
    }, "worship", themeCss);
    await this.deliverCssOverlayPacket(sourceName, "worship", packet, baseUrl, themeCss).catch(() => { });
  }

  // ── Clear all overlays ──

  /**
   * Keep the legacy clear hook available for callers while leaving other
   * MCE sources untouched. Visibility is controlled explicitly by the
   * operator rather than by a hidden send-time preference.
   */
  async clearAllOverlays(
    keepSources: string | string[] | null = null,
    sceneName?: string,
    resources: DockResourceNames = DOCK_RESOURCES,
  ): Promise<void> {
    void keepSources;
    this.invalidateActiveMceOverlayState(sceneName);
    if (resources.mediaScene && resources.mediaScene !== sceneName) {
      this.invalidateActiveMceOverlayState(resources.mediaScene);
    }
  }

  // ── High-level actions ──

  /**
   * Returns a browser-source name that belongs to one selected OBS scene.
   * These sources deliberately do not reuse MCE Presentation's inputs: OBS
   * inputs are global, so sharing one would make the two outputs mirror each
   * other even when the operator asked for independent content.
   */
  getSceneRouteSourceName(module: DockSceneRouteModule, sceneName: string, variant = "content"): string {
    const labelByModule: Record<DockSceneRouteModule, string> = {
      bible: "Bible",
      worship: "Worship",
      notes: "Notes",
      ticker: "Ticker",
      "lower-third": "Lower Third",
      countdown: "Countdown",
    };
    const safeScene = sceneName
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9 _.-]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 56) || "Scene";
    const suffix = variant === "content" ? "" : ` ${variant}`;
    return `MCE ${labelByModule[module]}${suffix} - ${safeScene}`;
  }

  private async pushSceneRouteBrowserSource(options: {
    module: DockSceneRouteModule;
    sceneName: string;
    url: string;
    css?: string;
    overlayPacket?: Record<string, unknown>;
    overlayTab?: CssOverlayPacketTab;
    sourceName?: string;
    width?: number;
    height?: number;
  }): Promise<string> {
    const sceneName = options.sceneName.trim();
    if (!sceneName) throw new Error("Select an OBS scene before sending.");
    const sourceName = options.sourceName ?? this.getSceneRouteSourceName(options.module, sceneName);
    const sourceUrl = this.buildSceneRouteOverlayUrl(options.url, sourceName);
    await this.ensureOverlaySource(sceneName, sourceName, options.width, options.height, true);
    // OBS CEF can retain a document with a changed URL hash but never apply
    // the encoded packet, leaving a blank routed source. Keep one small,
    // stable document and target the live packet to this source instead.
    await this.setBrowserSourceUrl(
      sourceName,
      sourceUrl,
      false,
      options.overlayPacket ? "" : options.css,
    );
    if (options.overlayPacket && options.overlayTab) {
      // A source created or reloaded by SetInputSettings needs time to attach
      // the event listener before OBS dispatches the first packet.
      await this.sleep(220);
      const emitted = await this.emitBrowserOverlayPacket(
        options.overlayTab,
        options.overlayPacket,
        options.css ?? "",
        sourceName,
      );
      if (!emitted) {
        // Compatibility fallback for OBS builds without obs-browser events.
        await this.setBrowserSourceUrl(
          sourceName,
          this.buildOverlayUrlFromPayload(sourceUrl, options.overlayPacket),
          false,
          options.css,
        );
      }
    }
    await this.ensureTickerAboveSource(sceneName, sourceName).catch(() => { });
    return sourceName;
  }

  async clearSceneRouteSource(module: DockSceneRouteModule, sceneName: string, variant = "content"): Promise<void> {
    const target = sceneName.trim();
    if (!target) return;
    const sourceName = this.getSceneRouteSourceName(module, target, variant);
    await this.hideOverlaySource(target, sourceName).catch(() => { });
  }

  async pushBibleToScene(
    data: DockBiblePushData,
    sceneName: string,
    sourceModule: "bible" | "lower-third" = "bible",
  ): Promise<void> {
    return this.runSerializedBibleMutation(async () => {
      const mode = data.overlayMode ?? "fullscreen";
      const verseRange = data.verseRange ?? String(data.verse);
      const reference = data.referenceLabel ?? `${data.book} ${data.chapter}:${verseRange}`;
      const backgroundOnly = Boolean(data.backgroundOnly);
      const text = backgroundOnly ? "" : (data.verseText || reference);
      const referenceText = backgroundOnly
        ? ""
        : this.formatBibleReferenceDisplayText(reference, data.translation, data.displayReferenceLabel);
      const compareEnabled = Boolean(data.compareEnabled || data.compare?.enabled);
      const compareLayout = data.compare?.layout ?? data.compareLayout ?? "line-by-line";
      const compareColumns = compareEnabled && Array.isArray(data.compare?.columns)
        ? data.compare.columns.filter(Boolean).slice(0, 2)
        : [];
      const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
        data.bibleThemeSettings,
        data.liveOverrides,
      );
      const themeForOverlay = mode === "lower-third" && effectiveThemeSettings
        ? this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings).overlayTheme
        : effectiveThemeSettings;
      const { cleanSettings, css } = this.stripThemeDataUris(themeForOverlay);
      const slide = compareColumns.length === 2
        ? {
          id: "dock-bible-route-compare-slide",
          layout: "compare",
          compareEnabled: true,
          compareLayout,
          reference: referenceText,
          text,
          verseRange: backgroundOnly ? "" : verseRange,
          index: 0,
          total: 1,
          translationA: data.translationA ?? compareColumns[0].translation,
          translationB: data.translationB ?? compareColumns[1].translation,
          columns: compareColumns.map((column) => ({
            book: column.book,
            chapter: column.chapter,
            verse: column.verse,
            verseEnd: column.verseEnd ?? column.verse,
            reference: backgroundOnly ? "" : column.referenceLabel,
            translation: column.translation,
            text: backgroundOnly ? "" : column.verseText,
            verseRange: backgroundOnly ? "" : (column.verseRange ?? ""),
          })),
        }
        : this.buildBibleSlide(text, referenceText, backgroundOnly ? "" : verseRange);
      const packet: Record<string, unknown> = {
        slide,
        theme: cleanSettings ?? null,
        live: true,
        blanked: false,
        timestamp: Date.now(),
        mode,
      };
      const baseUrl = this.buildOverlayHtmlUrl("mce-bible-overlay.html", { tab: "bible" });
      const sourceName = this.getSceneRouteSourceName(sourceModule, sceneName);
      await this.pushSceneRouteBrowserSource({
        module: sourceModule,
        sceneName,
        sourceName,
        url: baseUrl,
        overlayPacket: packet,
        overlayTab: "bible",
        css: this.buildCssOverlayDataCss(packet, css),
      });
      this.rememberCssOverlayTransport(sourceName, packet, baseUrl, css);
    });
  }

  private async pushTabContentToScene(
    data: DockTabContentPushData,
    tab: "worship" | "notes",
    sceneName: string,
  ): Promise<void> {
    const mode = data.overlayMode ?? "lower-third";
    const sourceName = this.getSceneRouteSourceName(tab, sceneName);
    if (mode === "lower-third" && data.ltTheme) {
      await this.pushSceneRouteBrowserSource({
        module: tab,
        sceneName,
        sourceName,
        url: this.buildLowerThirdUrl(data.values ?? {}, false, false, data.ltTheme),
      });
      return;
    }

    const backgroundOnly = Boolean(data.backgroundOnly);
    const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
      data.bibleThemeSettings,
      data.liveOverrides,
    );
    const themeForOverlay = mode === "lower-third" && effectiveThemeSettings
      ? this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings).overlayTheme
      : effectiveThemeSettings;
    const { cleanSettings, css } = this.stripThemeDataUris(themeForOverlay);
    const sectionText = backgroundOnly ? "" : data.sectionText;
    const translationText = backgroundOnly ? "" : (data.translationText ?? "");
    const sectionLabel = backgroundOnly || tab === "worship" ? "" : cleanWorshipObsLabel(data.sectionLabel);
    const packet: Record<string, unknown> = {
      slide: sectionText ? {
        id: `dock-${tab}-route-slide`,
        reference: "",
        text: sectionText,
        translationText,
        translationOrder: data.translationOrder ?? "original-first",
        verseRange: sectionLabel,
        index: 0,
        total: 1,
      } : null,
      theme: cleanSettings ?? null,
      live: true,
      blanked: false,
      timestamp: Date.now(),
      mode,
    };
    const baseUrl = this.buildCssOverlayHtmlUrlForTab(tab);
    const themeCss = mode === "lower-third" ? stripCompatModeCSS(css) : css;
    await this.pushSceneRouteBrowserSource({
      module: tab,
      sceneName,
      sourceName,
      url: baseUrl,
      overlayPacket: packet,
      overlayTab: tab,
      css: this.buildCssOverlayDataCss(packet, themeCss),
    });
    this.rememberCssOverlayTransport(sourceName, packet, baseUrl, themeCss);
  }

  async pushWorshipToScene(data: DockTabContentPushData, sceneName: string): Promise<void> {
    return this.runSerializedWorshipMutation(() => this.pushTabContentToScene(data, "worship", sceneName));
  }

  async pushNotesToScene(data: DockTabContentPushData, sceneName: string): Promise<void> {
    return this.runSerializedNotesMutation(() => this.pushTabContentToScene(data, "notes", sceneName));
  }

  async pushLowerThirdOverlayUrlToScene(
    url: string,
    sceneName: string,
    options?: { sourceWidth?: number; sourceHeight?: number },
  ): Promise<void> {
    const parsed = this.parseOverlayPayloadUrl(url);
    if (parsed) {
      const sourceName = this.getSceneRouteSourceName("lower-third", sceneName);
      await this.pushSceneRouteBrowserSource({
        module: "lower-third",
        sceneName,
        sourceName,
        // OBS can keep a browser document alive while ignoring a new URL
        // hash. Sending the full payload to the named source makes every
        // explicit Send apply its size, values, and theme reliably.
        url: parsed.baseUrl,
        overlayPacket: parsed.payload,
        overlayTab: "lower-third",
        css: this.buildCssOverlayDataCss(parsed.payload, ""),
        width: options?.sourceWidth,
        height: options?.sourceHeight,
      });
      this.rememberCssOverlayTransport(sourceName, parsed.payload, parsed.baseUrl, "");
      return;
    }

    await this.pushSceneRouteBrowserSource({
      module: "lower-third",
      sceneName,
      url,
      width: options?.sourceWidth,
      height: options?.sourceHeight,
    });
  }

  /**
   * Push a Bible verse to OBS as an overlay.
   *
   * **Fullscreen mode**: Creates a dedicated " MCE Bible" scene with
   * a background source + browser overlay. That scene is added as a
   * nested scene-source into the user's target scene.
   *
   * **Lower-third mode**: Uses a direct browser source in the user's
   * scene (lightweight, no background needed).
   */
  async pushBible(data: DockBiblePushData): Promise<void> {
    return this.runSerializedBibleMutation(async () => {
      const resources = getDockResources();
      // Read the live Program scene before touching any overlay sources. The
      // cached value can be stale after OBS switches to a Multiview scene, and
      // using it here can make the selected presentation background disappear.
      const currentProgramSceneBeforeTarget = await this.getCurrentProgramSceneName(true).catch(() => "");
      // Fullscreen Bible goes straight into MCE Presentation and therefore
      // does not pass through getPresentationTargetScene(), which is where
      // the other Bible route normally records the pre-push Program scene.
      // Record it here so clearBible() can honor the sidebar restore option.
      this.rememberUserScene(currentProgramSceneBeforeTarget, "bible");
      let sceneName: string;

      // Detect mode switch early. Keep the active sources in place and only
      // reset cached signatures so fullscreen/lower-third can morph without
      // the hard preview/program tear-down that causes visible flashing.
      const mode = data.overlayMode ?? "fullscreen";
      const prevMode = this._lastBibleMode;
      const modeChanged = prevMode !== "" && prevMode !== mode;
      if (modeChanged) {
        this._lastBiblePushSignature = "";
        this._lastBibleFullscreenSetupSignature = "";
        this._bibleLtInitialized = false;
      }

      if (data.targetScene) {
        // Custom target scene — ensure it exists, skip clone logic
        sceneName = data.targetScene;
        if (!await this.hasObsScene(sceneName).catch(() => false)) {
          await this.call("CreateScene", { sceneName })
            .then(() => { this._knownScenes.add(sceneName); })
            .catch(() => { });
        }
        if (await this.isStudioModeEnabled().catch(() => false)) {
          // Save original preview scene before switching to custom target
          const originalPreview = await this.getCurrentPreviewSceneName().catch(() => "");
          await this.setCurrentPreviewScene(sceneName);
          this.setPreviewSceneState(originalPreview, sceneName, "custom-target");
        }
      } else {
        // Fullscreen adds MCE Browser - Bible inside MCE Presentation (no separate scene).
        // Lower-third uses the standard clone/preview flow.
        if (data.overlayMode === "fullscreen") {
          // Fullscreen mode: always use MCE Presentation scene
          sceneName = PRESENTATION_SCENE_NAME;
        } else {
          const target = await this.getPresentationTargetScene("bible", { activate: false });
          sceneName = target.sceneName;
        }
      }

      if (!sceneName) throw new Error("Could not determine the current OBS scene.");

      // Wire the current Program scene behind the overlay only when the
      // route actually changes. Repeating this scene mutation for every verse
      // can make OBS redraw the whole presentation frame.
      if (!data.targetScene && currentProgramSceneBeforeTarget !== this._lastBibleProgramScenePrepared) {
        await this.ensureProgramSceneAsSourceInPresentation();
        this._lastBibleProgramScenePrepared = currentProgramSceneBeforeTarget;
      }

      const pushSignature = this.buildBiblePushSignature(sceneName, currentProgramSceneBeforeTarget, data);
      if (pushSignature === this._lastBiblePushSignature) {
        // Recover from manual OBS source deletion even when the verse payload
        // itself did not change and would normally be deduped away.
        const browserSrc = this._fullscreenSceneDefs["bible"]?.browserSourceName;
        if (browserSrc) {
          const sourceScene = mode === "fullscreen" ? PRESENTATION_SCENE_NAME : sceneName;
          if (mode === "fullscreen") {
            // Rebuild the fullscreen scene structure when MCE Presentation
            // was deleted in OBS so the cached theme/background state can be
            // applied to a fresh browser source.
            this._lastFullscreenSceneItemSignature[browserSrc] = "";
            await this._ensureFullscreenScene("bible").catch(() => { });
            await this.ensureActiveMceOverlaySource(
              PRESENTATION_SCENE_NAME,
              browserSrc,
              [browserSrc],
              resources,
            ).catch(() => { });
          } else {
            await this._ensureFullscreenScene("bible").catch(() => { });
            await this.ensureOverlaySource(sourceScene, browserSrc, undefined, undefined, true).catch(() => { });
          }
          const cachedPacket = this._lastCssOverlayPacketBySource[browserSrc];
          const cachedBaseUrl = this._lastCssOverlayBaseUrlBySource[browserSrc];
          if (cachedPacket && cachedBaseUrl) {
            await this.deliverCssOverlayPacket(
              browserSrc,
              "bible",
              cachedPacket,
              cachedBaseUrl,
              this._lastCssOverlayThemeCssBySource[browserSrc] || "",
            ).catch(() => { });
          }
          await this.fitSceneSourceToOverlayMode(sourceScene, browserSrc, mode).catch(() => { });
          await this.ensureTickerAboveSource(sceneName, browserSrc).catch(() => { });
        }
        return;
      }

      const verseRange = data.verseRange ?? String(data.verse);
      const ref = data.referenceLabel ?? `${data.book} ${data.chapter}:${verseRange}`;
      const backgroundOnly = Boolean(data.backgroundOnly);
      const primaryText = backgroundOnly ? "" : (data.verseText || ref);
      const referenceText = backgroundOnly
        ? ""
        : this.formatBibleReferenceDisplayText(ref, data.translation, data.displayReferenceLabel);
      const displayVerseRange = backgroundOnly ? "" : verseRange;
      const compareEnabled = Boolean(data.compareEnabled || data.compare?.enabled);
      const compareLayout = data.compare?.layout ?? data.compareLayout ?? "line-by-line";
      const compareColumns = compareEnabled && Array.isArray(data.compare?.columns)
        ? data.compare.columns.filter(Boolean).slice(0, 2)
        : [];
      const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
        data.bibleThemeSettings,
        data.liveOverrides,
      );

      // Update mode tracking (modeChanged was computed earlier for clone cleanup)
      this._lastBibleMode = mode;

      let url = "";
      let themeCss = "";
      let cssOverlayPacket: Record<string, unknown> | null = null;
      let cssOverlayBaseUrl = "";
      let useCssOverlayTransport = false;
      if (mode === "lower-third") {
        // ── Lower-third: same unified bible browser source as fullscreen ──
        // Uses tab=bible + packet.mode so mce-bible-overlay can morph Full ↔ LT
        // in-place (bible_song-style) instead of hard-cutting between sources.
        const fsDef = this._fullscreenSceneDefs["bible"];
        const browserSourceName = fsDef.browserSourceName;
        const userScene = currentProgramSceneBeforeTarget || sceneName;

        // Ensure the unified source exists.
        if (modeChanged || !this._bibleLtInitialized || !this._lastFullscreenSceneItemSignature[browserSourceName]) {
          await this._ensureFullscreenScene("bible");
        }

        const compareSlide = compareColumns.length === 2
          ? {
            id: "dock-bible-compare-slide",
            layout: "compare",
            compareEnabled: true,
            compareLayout,
            reference: referenceText,
            text: primaryText,
            verseRange: displayVerseRange,
            index: 0,
            total: 1,
            translationA: data.translationA ?? compareColumns[0].translation,
            translationB: data.translationB ?? compareColumns[1].translation,
            columns: compareColumns.map((column) => ({
              book: column.book,
              chapter: column.chapter,
              verse: column.verse,
              verseEnd: column.verseEnd ?? column.verse,
              reference: backgroundOnly ? "" : column.referenceLabel,
              translation: column.translation,
              text: backgroundOnly ? "" : column.verseText,
              verseRange: backgroundOnly ? "" : (column.verseRange ?? ""),
            })),
          }
          : null;

        if (effectiveThemeSettings) {
          const { overlayTheme } = this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings);

          if (modeChanged) this._bibleLtInitialized = false;

          if (!this._bibleLtInitialized) {
            // Clean up any leftover fullscreen scene sources from previous mode
            const fsDef = this._fullscreenSceneDefs["bible"];
            // MCE Presentation may be the intentional last-added layer inside
            // a managed Multiview scene. It is not a temporary Bible source
            // and must remain in that scene while lower-third initializes.
            if (fsDef && !DockObsClient.isManagedMultiviewSceneName(userScene)) {
              try {
                const resp = await this.call("GetSceneItemList", { sceneName: userScene }) as {
                  sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
                };
                const fsItems = resp.sceneItems.filter((i) => i.sourceName.startsWith(fsDef.sceneName));
                for (const item of fsItems) {
                  await this.call("RemoveSceneItem", { sceneName: userScene, sceneItemId: item.sceneItemId });
                }
              } catch { /* ignore */ }
            }

            // Hide any leftover dedicated scene
            await this.hideSceneSource(sceneName, resources.bibleScene);
            await this.hideFullscreenBg(sceneName, resources);

            // Add the unified source to user's scene (source stays in MCE Presentation too — CSS handles mode)
            await this.ensureOverlaySource(sceneName, browserSourceName, undefined, undefined, true);
            await this.ensureTickerAboveSource(sceneName, browserSourceName);

            // Render background via the browser overlay CSS instead of a
            // separate OBS background source so the browser + background
            // are a single unified source in OBS.
            await this._hideLowerThirdBgSource(sceneName).catch(() => { });

            this._bibleLtInitialized = true;
          } else {
            // Fast path: source already set up, just update BG if theme changed
            // Background is rendered by the browser overlay CSS; hide any
            // lower-third BG inputs to avoid duplicate layers.
            await this._hideLowerThirdBgSource(sceneName).catch(() => { });
          }

          // Recover if the shared browser source was manually deleted in OBS.
          await this.ensureOverlaySource(sceneName, browserSourceName, undefined, undefined, true);

          // Only keep the browser source active — background is applied
          // automatically via injected CSS/overlay data.
          await this.ensureActiveMceOverlaySource(sceneName, browserSourceName, [browserSourceName], resources);

          const { cleanSettings: ltClean, css } = this.stripThemeDataUris(overlayTheme);
          themeCss = css;
          const slide = compareSlide ?? this.buildBibleSlide(primaryText, referenceText, displayVerseRange);
          cssOverlayPacket = {
            slide,
            theme: ltClean ?? null,
            live: true,
            blanked: false,
            timestamp: Date.now(),
            mode,
          };
          // Unified bible overlay document — packet.mode drives lower-third layout + morph.
          cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab("bible", browserSourceName);
          useCssOverlayTransport = true;
          url = `${cssOverlayBaseUrl}#data=${encodeURIComponent(JSON.stringify(cssOverlayPacket))}`;
        } else {
          // ── Lower-third without theme settings: same unified fullscreen HTML ──
          // Add to user's scene (source stays in MCE Presentation too — CSS handles mode)
          if (!this._bibleLtInitialized) {
            await this.ensureOverlaySource(sceneName, browserSourceName, undefined, undefined, true);
            await this.ensureTickerAboveSource(sceneName, browserSourceName);
          }

          const slide = compareSlide ?? this.buildBibleSlide(primaryText, referenceText, displayVerseRange);
          cssOverlayPacket = {
            slide,
            theme: null,
            live: true,
            blanked: false,
            timestamp: Date.now(),
            mode,
          };
          cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab("bible", browserSourceName);
          useCssOverlayTransport = true;
          url = `${cssOverlayBaseUrl}#data=${encodeURIComponent(JSON.stringify(cssOverlayPacket))}`;

          if (!this._bibleLtInitialized) {
            await this.hideFullscreenBg(sceneName, resources);
            await this.hideSceneSource(sceneName, resources.bibleScene);
            const fsDef = this._fullscreenSceneDefs["bible"];
            if (fsDef) {
              await this.hideSceneSource(sceneName, fsDef.sceneName);
            }
            this._bibleLtInitialized = true;
          }

          // Recover if the shared browser source was manually deleted in OBS.
          await this.ensureOverlaySource(sceneName, browserSourceName, undefined, undefined, true);

          await this.ensureActiveMceOverlaySource(
            sceneName,
            browserSourceName,
            [browserSourceName],
            resources,
          );
        }
        // Keep the source visible during mode morph — do not hard-cut enable/disable.
        // Full canvas fit so HTML can animate LT bar within the full frame (no OBS crop cut).
        await this.fitSceneSourceToCanvas(sceneName, browserSourceName).catch(() => { });
        await this.fitSceneSourceToCanvas(PRESENTATION_SCENE_NAME, browserSourceName).catch(() => { });
      } else {
        // ── Fullscreen: unified browser source in MCE Presentation ──

        const { cleanSettings, css } = this.stripThemeDataUris(effectiveThemeSettings);
        themeCss = css;
        const slide = compareColumns.length === 2
          ? {
            id: "dock-bible-compare-slide",
            layout: "compare",
            compareEnabled: true,
            compareLayout,
            reference: referenceText,
            text: primaryText,
            verseRange: displayVerseRange,
            index: 0,
            total: 1,
            translationA: data.translationA ?? compareColumns[0].translation,
            translationB: data.translationB ?? compareColumns[1].translation,
            columns: compareColumns.map((column) => ({
              book: column.book,
              chapter: column.chapter,
              verse: column.verse,
              verseEnd: column.verseEnd ?? column.verse,
              reference: backgroundOnly ? "" : column.referenceLabel,
              translation: column.translation,
              text: backgroundOnly ? "" : column.verseText,
              verseRange: backgroundOnly ? "" : (column.verseRange ?? ""),
            })),
          }
          : {
            id: "dock-bible-slide",
            reference: referenceText,
            text: primaryText,
            verseRange: displayVerseRange,
            index: 0,
            total: 1,
          };
        const packet = {
          slide,
          theme: cleanSettings ?? null,
          live: true,
          blanked: false,
          timestamp: Date.now(),
          mode,
        };
        cssOverlayPacket = packet;
        cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab(
          "bible",
          this._fullscreenSceneDefs["bible"].browserSourceName,
        );
        useCssOverlayTransport = true;

        const def = this._fullscreenSceneDefs["bible"];
        const fullscreenSetupSignature = this.buildBibleFullscreenSetupSignature(
          sceneName,
          currentProgramSceneBeforeTarget,
          effectiveThemeSettings,
        );
        if (!modeChanged && this._lastBibleFullscreenSetupSignature === fullscreenSetupSignature) {
          const packetWithMode: Record<string, unknown> = { ...packet, mode };
          try {
            this.publishFullscreenOverlayPacket({
              slide: (packetWithMode.slide as Record<string, unknown> | null) ?? null,
              theme: (packetWithMode.theme as Record<string, unknown> | null) ?? null,
              live: true,
              blanked: Boolean(packetWithMode.blanked),
              timestamp: Number(packetWithMode.timestamp) || Date.now(),
              mode: String(mode || "fullscreen"),
            }, "bible", themeCss);

            await this.deliverCssOverlayPacket(
              def.browserSourceName,
              "bible",
              packetWithMode,
              cssOverlayBaseUrl,
              themeCss,
            ).catch(() => { });

            this._bibleLtInitialized = true;
            this._lastBiblePushSignature = pushSignature;
            return;
          } catch {
            this._lastBibleFullscreenSetupSignature = "";
          }
        }

        // Ensure the unified source exists in MCE Presentation. Follow with
        // ensureOverlaySource so a stale cache or manual OBS source deletion
        // cannot leave the presentation scene with no visible Bible item.
        await this._ensureFullscreenScene("bible");
        await this.ensureOverlaySource(sceneName, def.browserSourceName, undefined, undefined, true);

        // Hide the source in user's scene if it was there from lower-third mode
        const userScene = currentProgramSceneBeforeTarget || sceneName;
        if (userScene && userScene !== PRESENTATION_SCENE_NAME) {
          await this.hideOverlaySource(userScene, def.browserSourceName);
        }

        // Apply background through the browser overlay CSS so the browser
        // and background act as a single OBS source. Hide any existing
        // fullscreen BG sources to avoid duplicate layers.
        await this._hideFullscreenBgSource("bible");
        this.invalidateActiveMceOverlayState(sceneName);
        await this.ensureActiveMceOverlaySource(sceneName, def.browserSourceName, [def.browserSourceName], resources);
        await this.fitSceneSourceToOverlayMode(sceneName, def.browserSourceName, mode).catch(() => { });

        // Keep the URL stable, but still push the latest packet through OBS CSS.
        // OBS browser sources do not reliably share localStorage/BroadcastChannel
        // with the dock page, so CSS is the authoritative cross-process transport.
        {
          // Include mode so the fullscreen HTML removes lt-mode class when switching back
          const packetWithMode = { ...packet, mode };
          await this.deliverCssOverlayPacket(
            def.browserSourceName,
            "bible",
            packetWithMode,
            cssOverlayBaseUrl,
            themeCss,
          );
          this._bibleLtInitialized = true;
        }

        // Hide leftover dedicated scene + BG
        await this.hideSceneSource(sceneName, resources.bibleScene);
        await this.hideFullscreenBg(sceneName, resources);

        // The browser source is already inside MCE Presentation (created by _ensureFullscreenScene).
        // Just find and enable it.
        let sceneItemId: number | null = null;
        let alreadyImported = false;
        try {
          const existingCheck = await this.call("GetSceneItemList", { sceneName }) as {
            sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
          };
          const browserItem = existingCheck.sceneItems.find((i) => i.sourceName === def.browserSourceName);
          if (browserItem) {
            sceneItemId = browserItem.sceneItemId;
            alreadyImported = true;
            if (!modeChanged) {
              await this.call("SetSceneItemEnabled", {
                sceneName,
                sceneItemId: browserItem.sceneItemId,
                sceneItemEnabled: true,
              });
            }
          }
        } catch { /* ignore */ }

        if (sceneItemId !== null) {
          await this.ensureTickerAboveSource(sceneName, def.browserSourceName).catch(() => { });
        }

        // If browser source not found, create it directly in MCE Presentation
        if (sceneItemId === null) {
          try {
            const canvas = await this.getCanvasSize();
            const overlayUrl = this.buildCssOverlayHtmlUrlForTab("bible", def.browserSourceName);
            const created = await this.call("CreateInput", {
              sceneName,
              inputName: def.browserSourceName,
              inputKind: "browser_source",
              inputSettings: { url: overlayUrl, width: canvas.width, height: canvas.height, css: "", bgcolor: "#00000000", shutdown: false, restart_when_active: false },
              sceneItemEnabled: true,
            }) as { sceneItemId: number };
            sceneItemId = created.sceneItemId;
            await this.fitSceneItemToCanvas(sceneName, sceneItemId);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("already exists") || msg.includes("600")) {
              try {
                const added = await this.call("CreateSceneItem", { sceneName, sourceName: def.browserSourceName, sceneItemEnabled: true }) as { sceneItemId: number };
                sceneItemId = added.sceneItemId;
                await this.fitSceneItemToCanvas(sceneName, sceneItemId);
              } catch { /* ignore */ }
            }
          }
        }

        if (sceneItemId !== null) {
          await this.ensureTickerAboveSource(sceneName, def.browserSourceName).catch(() => { });
        }

        if (sceneItemId && currentProgramSceneBeforeTarget) {
          try {
            await this.call("SetSceneItemName", {
              sceneName: sceneName,
              sceneItemId: sceneItemId,
              sceneItemName: `${def.sceneName} (${currentProgramSceneBeforeTarget})`,
            });
          } catch { /* best effort */ }
        }

        const animation = effectiveThemeSettings?.animation as string | undefined;
        if (!modeChanged && animation && animation !== "none" && sceneItemId && !alreadyImported) {
          const canvas = await this.getCanvasSize();
          await this.setMediaSceneItemScale(sceneName, sceneItemId, canvas, 0.965);
          await this.sleep(30);
          await this.setMediaSceneItemScale(sceneName, sceneItemId, canvas, 0.985);
          await this.sleep(30);
          await this.fitSceneItemToCanvas(sceneName, sceneItemId);
        } else if (sceneItemId) {
          await this.fitSceneItemToCanvas(sceneName, sceneItemId);
        }

        this._lastBibleFullscreenSetupSignature = fullscreenSetupSignature;
      }

      if (useCssOverlayTransport && cssOverlayPacket) {
        // Include mode in the overlay data so the fullscreen HTML can animate between layouts
        const packetWithMode: Record<string, unknown> = {
          ...cssOverlayPacket,
          mode,
        };

        this.publishFullscreenOverlayPacket({
          slide: (packetWithMode.slide as Record<string, unknown> | null) ?? null,
          theme: (packetWithMode.theme as Record<string, unknown> | null) ?? null,
          live: true,
          blanked: Boolean(packetWithMode.blanked),
          timestamp: Number(packetWithMode.timestamp) || Date.now(),
          mode: String(mode || "fullscreen"),
        }, "bible", themeCss);

        const browserSourceName = this._fullscreenSceneDefs["bible"].browserSourceName;
        const nextBaseUrl = cssOverlayBaseUrl || url;
        await this.deliverCssOverlayPacket(
          browserSourceName,
          "bible",
          packetWithMode,
          nextBaseUrl,
          themeCss,
        );
      }

      if (mode === "lower-third" && useCssOverlayTransport && cssOverlayPacket) {
        await this.waitForOverlayRenderAck(
          "bible",
          Number(cssOverlayPacket.timestamp) || Date.now(),
          mode,
        ).catch(() => { });
      }

      if (mode === "lower-third") {
        const browserSourceName = this._fullscreenSceneDefs["bible"].browserSourceName;
        if (modeChanged) {
          await this.setSceneSourceEnabledByName(PRESENTATION_SCENE_NAME, browserSourceName, true).catch(() => { });
          if (sceneName !== PRESENTATION_SCENE_NAME) {
            await this.setSceneSourceEnabledByName(sceneName, browserSourceName, true).catch(() => { });
          }
        }
      }

      this._lastBiblePushSignature = pushSignature;
    });
  }

  /**
   * Fast path for lower-third overlay updates (theme changes, verse text changes).
   *
   * Keeps the browser source document stable and sends only overlay packets
   * for verse text changes. It does not change OBS Preview or Program scene
   * routing; the existing presentation layer remains where the user left it.
   *
   * Falls back to the full `pushBible` if the source hasn't been bootstrapped yet.
   */
  async pushBibleOverlayFast(data: {
    verseText?: string;
    referenceText?: string;
    verseRange?: string;
    bibleThemeSettings?: Record<string, unknown> | null;
    liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
    themeId?: string;
    compareEnabled?: boolean;
    compareLayout?: string;
    compare?: Record<string, unknown> | null;
    translationA?: string;
    translationB?: string;
  }): Promise<void> {
    const browserSourceName = this._fullscreenSceneDefs["bible"].browserSourceName;
    const mode = "lower-third";

    // If the LT source is not already active in the current mode, use the full push.
    if (
      !this._bibleLtInitialized
      || !this._lastBrowserSourceUrlBySource[browserSourceName]
    ) {
      // Fall back to full pushBible — the source hasn't been bootstrapped yet.
      // Build required fields from available data.
      const verseRange = data.verseRange ?? "1";
      const refText = data.referenceText ?? "";
      return this.pushBible({
        book: "",
        chapter: 1,
        verse: 1,
        verseRange,
        referenceLabel: refText.replace(/\s\(.*\)$/, ""),
        displayReferenceLabel: refText,
        translation: "KJV",
        theme: data.themeId,
        verseText: data.verseText,
        overlayMode: "lower-third",
        bibleThemeSettings: data.bibleThemeSettings,
        liveOverrides: data.liveOverrides ?? null,
        compareEnabled: data.compareEnabled,
        compareLayout: (data.compareLayout || "line-by-line") as "line-by-line" | "side-by-side",
        compare: data.compare ? {
          ...data.compare,
          layout: ((data.compare as Record<string, unknown>).layout as string || "line-by-line") as "line-by-line" | "side-by-side",
        } as {
          enabled?: boolean;
          layout?: "line-by-line" | "side-by-side";
          columns?: Array<{ book: string; chapter: number; verse: number; verseEnd?: number; verseRange?: string; referenceLabel: string; translation: string; verseText: string }>;
        } : undefined,
        translationA: data.translationA,
        translationB: data.translationB,
      });
    }

    // Compare mode needs the full pushBible path — the fast path only handles single verses
    if (data.compareEnabled && data.compare) {
      const verseRange = data.verseRange ?? "1";
      const refText = data.referenceText ?? "";
      return this.pushBible({
        book: "",
        chapter: 1,
        verse: 1,
        verseRange,
        referenceLabel: refText.replace(/\s\(.*\)$/, ""),
        displayReferenceLabel: refText,
        translation: "KJV",
        theme: data.themeId,
        verseText: data.verseText,
        overlayMode: "lower-third",
        bibleThemeSettings: data.bibleThemeSettings,
        liveOverrides: data.liveOverrides ?? null,
        compareEnabled: true,
        compareLayout: (data.compareLayout || "line-by-line") as "line-by-line" | "side-by-side",
        compare: {
          ...data.compare,
          layout: ((data.compare as Record<string, unknown>).layout as string || "line-by-line") as "line-by-line" | "side-by-side",
        } as {
          enabled?: boolean;
          layout?: "line-by-line" | "side-by-side";
          columns?: Array<{ book: string; chapter: number; verse: number; verseEnd?: number; verseRange?: string; referenceLabel: string; translation: string; verseText: string }>;
        },
        translationA: data.translationA,
        translationB: data.translationB,
      });
    }

    const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
      data.bibleThemeSettings,
      data.liveOverrides,
    );

    if (!effectiveThemeSettings) {
      // No theme to update — just skip
      return;
    }

    this._lastBibleMode = mode;
    const { overlayTheme } = this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings);
    const { cleanSettings: ltClean, css } = this.stripThemeDataUris(overlayTheme);
    const themeCss = css;

    const slide = this.buildBibleSlide(
      data.verseText ?? "",
      data.referenceText ?? "",
      data.verseRange ?? "",
    );

    const cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab("bible", browserSourceName);

    const cssOverlayPacket: Record<string, unknown> = {
      slide,
      theme: ltClean ?? null,
      live: true,
      blanked: false,
      timestamp: Date.now(),
      mode,
    };

    const packetWithMode: Record<string, unknown> = { ...cssOverlayPacket, mode };

    this.publishFullscreenOverlayPacket({
      slide: (packetWithMode.slide as Record<string, unknown> | null) ?? null,
      theme: (packetWithMode.theme as Record<string, unknown> | null) ?? null,
      live: true,
      blanked: false,
      timestamp: Number(packetWithMode.timestamp) || Date.now(),
      mode,
    }, "bible", themeCss);

    await this.deliverCssOverlayPacket(
      browserSourceName,
      "bible",
      packetWithMode,
      cssOverlayBaseUrl,
      themeCss,
    );
  }

  async pushWorshipOverlayFast(data: {
    sectionText: string;
    translationText?: string;
    translationOrder?: DockTranslationOrder;
    sectionLabel: string;
    songTitle: string;
    artist?: string;
    bibleThemeSettings?: Record<string, unknown> | null;
    liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
    backgroundOnly?: boolean;
  }): Promise<void> {
    const resources = getDockResources();
    const sourceName = resources.worshipSource;
    const mode = "lower-third";
    const cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab("worship", sourceName);

    if (!this._worshipInitialized || !this._lastBrowserSourceUrlBySource[sourceName]) {
      const canReuseLoadedSource = await this.canReuseStableCssOverlaySource(sourceName, cssOverlayBaseUrl);
      if (canReuseLoadedSource) {
        this._worshipInitialized = true;
      }
    }

    if (!this._worshipInitialized || !this._lastBrowserSourceUrlBySource[sourceName]) {
      return this.pushWorshipLyrics({
        ...data,
        overlayMode: mode,
      });
    }

    this._lastOverlayMode[sourceName] = mode;
    const backgroundOnly = Boolean(data.backgroundOnly);
    const sectionText = backgroundOnly ? "" : data.sectionText;
    const translationText = backgroundOnly ? "" : (data.translationText ?? "");
    const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
      data.bibleThemeSettings,
      data.liveOverrides,
    );

    let themeCss = "";
    let cleanTheme: Record<string, unknown> | null = null;

    if (effectiveThemeSettings) {
      const { overlayTheme } = this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings);
      const { cleanSettings, css } = this.stripThemeDataUris(overlayTheme);
      cleanTheme = cleanSettings ?? null;
      themeCss = stripCompatModeCSS(css);
    }

    const slide = this.buildBibleSlide(sectionText, "", "", translationText, data.translationOrder);
    const packetWithMode: Record<string, unknown> = {
      slide,
      theme: cleanTheme,
      live: true,
      blanked: false,
      timestamp: Date.now(),
      mode,
    };

    await this.prepareFastOverlayScene(
      "worship",
      sourceName,
      (sceneName) => this.fitSceneSourceToLowerThirdWindow(sceneName, sourceName),
    );

    this.publishFullscreenOverlayPacket({
      slide: (packetWithMode.slide as Record<string, unknown> | null) ?? null,
      theme: (packetWithMode.theme as Record<string, unknown> | null) ?? null,
      live: true,
      blanked: false,
      timestamp: Number(packetWithMode.timestamp) || Date.now(),
      mode,
    }, "worship", themeCss);

    await this.deliverCssOverlayPacket(
      sourceName,
      "worship",
      packetWithMode,
      cssOverlayBaseUrl,
      themeCss,
    );
  }

  async bringNotesOverlayForward(_mode: DockOverlayMode = "lower-third"): Promise<void> {
    await this.bringMceOverlayForward(getDockResources().notesSource);
  }

  async primeNotesOverlay(data: PrimeWorshipOverlayData): Promise<void> {
    const mode = data.overlayMode ?? "fullscreen";
    const backgroundOnly = Boolean(data.backgroundOnly);
    const sectionText = backgroundOnly ? "" : data.sectionText;
    const translationText = backgroundOnly ? "" : (data.translationText ?? "");
    const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
      data.bibleThemeSettings,
      data.liveOverrides,
    );
    const themeForOverlay = mode === "lower-third" && effectiveThemeSettings
      ? this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings).overlayTheme
      : effectiveThemeSettings;
    const { cleanSettings, css } = this.stripThemeDataUris(themeForOverlay);
    const themeCss = mode === "lower-third" ? stripCompatModeCSS(css) : css;
    const slide = this.buildBibleSlide(sectionText, "", "", translationText, data.translationOrder);
    const packet: Record<string, unknown> = {
      slide,
      theme: cleanSettings ?? null,
      live: true,
      blanked: false,
      timestamp: Date.now(),
      mode,
    };
    const sourceName = getDockResources().notesSource;
    const baseUrl = this.buildCssOverlayHtmlUrlForTab("notes", sourceName);

    if (await this.keepLoadedCssOverlaySourceStable(sourceName, "notes", packet, baseUrl, themeCss)) {
      return;
    }

    this.publishFullscreenOverlayPacket({
      slide,
      theme: cleanSettings ?? null,
      live: true,
      blanked: false,
      timestamp: Number(packet.timestamp) || Date.now(),
      mode,
    }, "notes", themeCss);
    await this.deliverCssOverlayPacket(sourceName, "notes", packet, baseUrl, themeCss).catch(() => { });
  }

  async pushNotesOverlayFast(data: {
    sectionText: string;
    translationText?: string;
    translationOrder?: DockTranslationOrder;
    sectionLabel: string;
    songTitle: string;
    artist?: string;
    bibleThemeSettings?: Record<string, unknown> | null;
    liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
    backgroundOnly?: boolean;
  }): Promise<void> {
    const resources = getDockResources();
    const sourceName = resources.notesSource;
    const mode = "lower-third";
    const cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab("notes", sourceName);

    if (!this._notesInitialized || !this._lastBrowserSourceUrlBySource[sourceName]) {
      const canReuseLoadedSource = await this.canReuseStableCssOverlaySource(sourceName, cssOverlayBaseUrl);
      if (canReuseLoadedSource) {
        this._notesInitialized = true;
      }
    }

    if (!this._notesInitialized || !this._lastBrowserSourceUrlBySource[sourceName]) {
      return this.pushNotesLyrics({
        ...data,
        overlayMode: mode,
      });
    }

    this._lastOverlayMode[sourceName] = mode;
    const backgroundOnly = Boolean(data.backgroundOnly);
    const sectionText = backgroundOnly ? "" : data.sectionText;
    const translationText = backgroundOnly ? "" : (data.translationText ?? "");
    const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
      data.bibleThemeSettings,
      data.liveOverrides,
    );

    let themeCss = "";
    let cleanTheme: Record<string, unknown> | null = null;

    if (effectiveThemeSettings) {
      const { overlayTheme } = this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings);
      const { cleanSettings, css } = this.stripThemeDataUris(overlayTheme);
      cleanTheme = cleanSettings ?? null;
      themeCss = stripCompatModeCSS(css);
    }

    const slide = this.buildBibleSlide(sectionText, "", "", translationText, data.translationOrder);
    const packetWithMode: Record<string, unknown> = {
      slide,
      theme: cleanTheme,
      live: true,
      blanked: false,
      timestamp: Date.now(),
      mode,
    };

    await this.prepareFastOverlayScene(
      "notes",
      sourceName,
      (sceneName) => this.fitSceneSourceToLowerThirdWindow(sceneName, sourceName),
    );

    this.publishFullscreenOverlayPacket({
      slide: (packetWithMode.slide as Record<string, unknown> | null) ?? null,
      theme: (packetWithMode.theme as Record<string, unknown> | null) ?? null,
      live: true,
      blanked: false,
      timestamp: Number(packetWithMode.timestamp) || Date.now(),
      mode,
    }, "notes", themeCss);

    await this.deliverCssOverlayPacket(
      sourceName,
      "notes",
      packetWithMode,
      cssOverlayBaseUrl,
      themeCss,
    );
  }

  /**
   * Clear the Bible overlay — hide all Bible sources in both MCE Presentation
   * (fullscreen) and the user's current scene (lower-third), then restore state.
   */
  async clearBible(): Promise<void> {
    return this.runSerializedBibleMutation(async () => {
      const resources = getDockResources();
      const scene = PRESENTATION_SCENE_NAME;
      const browserSourceName = this._fullscreenSceneDefs["bible"].browserSourceName;
      // Hide the unified Bible source in MCE Presentation (fullscreen mode)
      await Promise.all([
        this.hideOverlaySource(scene, SOURCE_NAMES.BIBLE).catch(() => { }),
        this.hideOverlaySource(scene, BG_SOURCE_NAMES.BIBLE).catch(() => { }),
        this.hideOverlaySource(scene, FULLSCREEN_SOURCE_NAMES.BIBLE).catch(() => { }),
        this.hideOverlaySource(scene, FULLSCREEN_BG_SOURCE_NAMES.BIBLE).catch(() => { }),
        this.hideOverlaySource(scene, browserSourceName).catch(() => { }),
        this.hideSceneSource(scene, resources.bibleScene).catch(() => { }),
        this.hideFullscreenBg(scene, resources).catch(() => { }),
        this._hideLowerThirdBgSource(scene).catch(() => { }),
      ]);
      this.invalidateActiveMceOverlayState(scene);

      // Also hide the unified Bible source from the user's current scene
      // (lower-third mode adds it there)
      const currentScene = await this.getCurrentProgramSceneName(true).catch(() => "");
      if (currentScene && currentScene !== scene) {
        await Promise.all([
          this.hideOverlaySource(currentScene, browserSourceName).catch(() => { }),
          this.hideSceneSource(currentScene, resources.bibleScene).catch(() => { }),
          this.hideFullscreenBg(currentScene, resources).catch(() => { }),
          this._hideLowerThirdBgSource(currentScene).catch(() => { }),
        ]);
        this.invalidateActiveMceOverlayState(currentScene);

        // A Multiview scene may intentionally contain MCE Presentation as its
        // last-added source. Clearing Bible must never remove that scene item.
        const fsDef = this._fullscreenSceneDefs["bible"];
        if (fsDef && !DockObsClient.isManagedMultiviewSceneName(currentScene)) {
          try {
            const resp = await this.call("GetSceneItemList", { sceneName: currentScene }) as {
              sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
            };
            const fsItems = resp.sceneItems.filter((i) => i.sourceName.startsWith(fsDef.sceneName));
            for (const item of fsItems) {
              await this.call("RemoveSceneItem", { sceneName: currentScene, sceneItemId: item.sceneItemId });
            }
          } catch { /* ignore */ }
        }
      }

      // Reset internal state
      this._lastBiblePushSignature = "";
      this._lastBibleFullscreenSetupSignature = "";
      this._bibleLtInitialized = false;
      this._lastBibleMode = "";
      this.publishBlankFullscreenOverlayPacket("bible", "lower-third");

      // Clean up the bible clone scene (studio mode)
      await this.deleteClone(undefined, "bible").catch(() => { });

      // Restore Program scene to what it was before Bible was pushed
      await this.restoreProgramSceneBeforePush("bible");

    });
  }

  /**
   * Switch the visible Bible overlay between Fullscreen and Lower-Third.
   *
   * Unlike pushBible, this does NOT resize/crop/disable/recreate the OBS source,
   * change the browser URL, or re-stage the verse. It updates both the live
   * browser event and the durable CSS state so the overlay HTML stays in sync
   * even if OBS restarts the browser source mid-transition.
   *
   * Does NOT wrap itself in obsQueue.enqueue — the internal OBS calls already
   * use the queue, so nesting would risk stalls.
   */
  async switchBibleOverlayMode(data: {
    mode: "fullscreen" | "lower-third";
    verseText: string;
    referenceText: string;
    verseRange: string;
    bibleThemeSettings?: Record<string, unknown> | null;
    liveOverrides?: Record<string, unknown> | null;
    compareEnabled?: boolean;
    compareLayout?: string;
    compare?: Record<string, unknown> | null;
    transitionId: number;
  }): Promise<void> {
    const sourceName = this._fullscreenSceneDefs["bible"]?.browserSourceName;
    if (!sourceName) return;

    // Bootstrap only if the source genuinely does not exist yet
    const sceneName = DOCK_PRESENTATION_SCENE;
    const existing = await this.getSceneItemBySource(sceneName, sourceName).catch(() => null);
    if (!existing) {
      await this._ensureFullscreenScene("bible");
    }

    // Build theme: merge with live overrides, apply mode-specific wrapping
    const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
      data.bibleThemeSettings ?? null,
      data.liveOverrides ?? null,
    );
    const themeForOverlay = data.mode === "lower-third" && effectiveThemeSettings
      ? this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings).overlayTheme
      : effectiveThemeSettings;
    const { cleanSettings } = this.stripThemeDataUris(themeForOverlay);

    // Build slide
    const compareColumns = data.compareEnabled && Array.isArray(data.compare?.columns)
      ? (data.compare.columns as Array<Record<string, unknown>>).filter(Boolean).slice(0, 2)
      : [];
    const slide = compareColumns.length === 2
      ? {
          id: "dock-bible-compare-slide",
          layout: "compare",
          compareEnabled: true,
          compareLayout: data.compareLayout ?? "line-by-line",
          reference: data.referenceText,
          text: data.verseText,
          verseRange: data.verseRange,
          index: 0,
          total: 1,
          translationA: String(data.compare?.translationA ?? ""),
          translationB: String(data.compare?.translationB ?? ""),
          columns: compareColumns.map((col) => ({
            book: col.book ?? "",
            chapter: col.chapter ?? "",
            verse: col.verse ?? "",
            verseEnd: col.verseEnd ?? "",
            reference: col.reference ?? "",
            translation: col.translation ?? "",
            text: col.text ?? "",
            verseRange: col.verseRange ?? "",
          })),
        }
      : this.buildBibleSlide(data.verseText, data.referenceText, data.verseRange);

    const timestamp = Date.now();
    const packet: Record<string, unknown> = {
      slide,
      theme: cleanSettings ?? null,
      compare: data.compare ?? null,
      live: true,
      blanked: false,
      mode: data.mode,
      timestamp,
      transitionId: data.transitionId,
    };

    const baseUrl = this.buildCssOverlayHtmlUrlForTab("bible", sourceName);
    await this.deliverCssOverlayPacket(sourceName, "bible", packet, baseUrl, "");

    this._lastBibleMode = data.mode;

    console.log("[BibleMode] mode packet delivered", {
      mode: data.mode,
      timestamp,
      transitionId: data.transitionId,
    });
  }

  /**
   * Push a lower-third to OBS as an overlay in the current scene.
   */
  async pushLowerThirdOverlayUrl(
    url: string,
    options?: { sourceWidth?: number; sourceHeight?: number },
  ): Promise<void> {
    const resources = getDockResources();
    const target = await this.getPresentationTargetScene("lower-third");
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("Could not determine the MCE Presentation scene.");

    await this.ensureProgramSceneAsSourceInPresentation();
    await this.clearAllOverlays(resources.ltSource, sceneName, resources);
    await this.ensureOverlaySource(
      sceneName,
      resources.ltSource,
      options?.sourceWidth,
      options?.sourceHeight,
      true,
    );

    await this.call("SetInputSettings", {
      inputName: resources.ltSource,
      inputSettings: {
        url,
        width: options?.sourceWidth,
        height: options?.sourceHeight,
        fps_custom: true,
        fps: 60,
        shutdown: false,
        restart_when_active: false,
      },
    });
    this._lastBrowserSourceUrlBySource[resources.ltSource] = url;
    const parsed = this.parseOverlayPayloadUrl(url);
    if (parsed) {
      this._lastCssOverlayPacketBySource[resources.ltSource] = parsed.payload;
      this._lastCssOverlayBaseUrlBySource[resources.ltSource] = parsed.baseUrl;
      this._lastCssOverlayThemeCssBySource[resources.ltSource] = "";
    }

    await this.ensureTickerAboveSource(sceneName, resources.ltSource).catch(() => { });
  }

  /**
   * Replace a live Ministry lower-third without reloading the OBS browser source.
   * The overlay page queues the new packet while the old one exits, then plays
   * the new entry animation from the same browser document.
   */
  async replaceLiveLowerThirdOverlayUrl(
    url: string,
    options?: { sourceWidth?: number; sourceHeight?: number },
    waitMs = FULLSCREEN_CLEAR_WAIT_MS,
  ): Promise<void> {
    const resources = getDockResources();
    const target = await this.getPresentationTargetScene("lower-third");
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("Could not determine the MCE Presentation scene.");

    await this.ensureProgramSceneAsSourceInPresentation();

    const parsed = this.parseOverlayPayloadUrl(url);
    const existing = await this.getSceneItemBySource(sceneName, resources.ltSource).catch(() => null);
    if (!parsed || !existing) {
      if (existing) {
        await this.animateLowerThirdOverlayUrlOut("", waitMs, { restoreProgram: false });
      }
      await this.pushLowerThirdOverlayUrl(url, options);
      return;
    }

    await this.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId: existing.sceneItemId,
      sceneItemEnabled: true,
    }).catch(() => { });
    await this.ensureTickerAboveSource(sceneName, resources.ltSource).catch(() => { });

    const nextPacket = {
      ...parsed.payload,
      live: true,
      blanked: false,
      timestamp: Date.now(),
    };
    const overlayCss = this.buildCssOverlayDataCss(nextPacket, "");

    let delivered = false;
    try {
      const exitDelivered = await this.emitBrowserOverlayPacket("lower-third", {
        action: "animate-out",
        timestamp: Date.now(),
      }, "");
      nextPacket.timestamp = Date.now();
      delivered = exitDelivered && await this.emitBrowserOverlayPacket("lower-third", nextPacket, overlayCss);
    } catch {
      delivered = false;
    }

    if (!delivered) {
      await this.animateLowerThirdOverlayUrlOut("", waitMs, { restoreProgram: false });
      await this.pushLowerThirdOverlayUrl(url, options);
      return;
    }

    try {
      await this.call("SetInputSettings", {
        inputName: resources.ltSource,
        // Persist both transports. OBS can refresh the browser source when its
        // CSS changes; leaving the old URL here would bring the previous size
        // back after the live packet briefly renders.
        inputSettings: { url, css: overlayCss },
      });
    } catch { /* keep the live event result */ }

    this._lastBrowserSourceUrlBySource[resources.ltSource] = url;
    this._lastCssOverlayPacketBySource[resources.ltSource] = nextPacket;
    this._lastCssOverlayBaseUrlBySource[resources.ltSource] = parsed.baseUrl;
    this._lastCssOverlayThemeCssBySource[resources.ltSource] = "";
  }

  /**
   * Push a lower-third to OBS as an overlay in the current scene.
   */
  async pushLowerThird(data: {
    name?: string;
    role?: string;
    title?: string;
    subtitle?: string;
    series?: string;
    speaker?: string;
    point?: string;
    date?: string;
    location?: string;
    description?: string;
    ltTheme?: DockLTThemeRef;
    context?: "speaker" | "sermon" | "event" | "custom";
    values?: Record<string, string>;
  }): Promise<void> {
    const resources = getDockResources();
    const target = await this.getPresentationTargetScene("lower-third");
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("Could not determine the current OBS scene.");

    // Ensure the live program scene is visible behind overlays in MCE Presentation
    await this.ensureProgramSceneAsSourceInPresentation();

    // Clear all OTHER overlays first so previous overlay doesn't persist
    await this.clearAllOverlays(resources.ltSource, sceneName, resources);

    // Ensure overlay source exists in target scene (auto-creates if needed)
    await this.ensureOverlaySource(sceneName, resources.ltSource, undefined, undefined, true);

    const resolvedLTTheme = this.resolveLTTheme(data.ltTheme, data.context ?? "speaker");

    // Build a comprehensive values map so the overlay's {{variable}} substitution
    // can replace ALL placeholders — regardless of which theme is chosen.
    const values: Record<string, string> = {};
    const ctx = data.context ?? "speaker";
    if (ctx === "speaker") {
      const nm = data.name || "";
      let rl = data.role || data.subtitle || "";
      // Auto-resolve role from ministry store if not explicitly provided
      if (!rl && nm) {
        const roleMap = buildSpeakerRoleMap();
        const resolved = roleMap.get(nm.trim().toLowerCase());
        if (resolved) rl = resolved;
      }
      Object.assign(values, {
        name: nm,
        title: rl,
        role: rl,
        subtitle: rl,
        headline: nm,
        subline: rl,
        label: nm,
        details: rl,
        line1: nm,
        line2: rl,
      });
    } else if (ctx === "sermon") {
      const msgTitle = data.title || data.point || "";
      const seriesName = data.series || "";
      const speakerName = data.speaker || data.name || "";
      Object.assign(values, {
        name: msgTitle,
        title: msgTitle,
        headline: msgTitle,
        subtitle: seriesName || speakerName,
        subline: seriesName || speakerName,
        role: speakerName,
        series: seriesName,
        speaker: speakerName,
        point: data.point || "",
        label: msgTitle,
        details: seriesName ? `${seriesName} • ${speakerName}` : speakerName,
        line1: msgTitle,
        line2: seriesName ? `${seriesName} • ${speakerName}` : speakerName,
      });
    } else if (ctx === "event") {
      const evName = data.name || data.title || "";
      const evDate = data.date || "";
      const evLoc = data.location || "";
      const evDesc = data.description || data.subtitle || "";
      const sub = [evDate, evLoc].filter(Boolean).join(" • ") || evDesc;
      Object.assign(values, {
        name: evName,
        title: evName,
        headline: evName,
        subtitle: sub,
        subline: sub,
        role: sub,
        date: evDate,
        location: evLoc,
        description: evDesc,
        label: evName,
        details: evDesc || sub,
        line1: evName,
        line2: sub,
      });
    } else if (ctx === "custom") {
      Object.assign(values, {
        name: data.name || data.title || "",
        title: data.title || data.name || "",
        headline: data.title || data.name || "",
        subtitle: data.subtitle || data.role || "",
        subline: data.subtitle || data.role || "",
        role: data.role || data.subtitle || "",
        label: data.name || data.title || "",
        details: data.description || data.subtitle || "",
        description: data.description || "",
        meta: data.description || "",
        line1: data.title || data.name || "",
        line2: data.subtitle || data.description || "",
      });
    }

    if (data.values) {
      Object.assign(values, data.values);
    }

    // ── Inject church logo from brand settings ──
    const logoUrl = this._getLogoUrl();
    if (logoUrl && !values.logoUrl) {
      values.logoUrl = logoUrl;
    }

    const url = this.buildLowerThirdUrl(values, false, false, resolvedLTTheme);

    await this.setBrowserSourceUrl(resources.ltSource, url);
  }

  /**
   * Load the bundled NoeAL Animated Lower Thirds browser source into OBS.
   *
   * The legacy control panel talks to this browser source with BroadcastChannel,
   * so this method only provisions the correct page and scene visibility.
   */
  async loadAnimatedLowerThirdSource(payload?: Record<string, unknown>): Promise<boolean> {
    const resources = getDockResources();
    const sourceName = resources.animatedLtSource;
    const target = await this.getTargetScene();
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("Could not determine the current OBS scene.");

    // Ensure the live program scene is visible behind overlays in MCE Presentation
    await this.ensureProgramSceneAsSourceInPresentation();

    const baseUrl = `${this.getOverlayBaseUrl()}/animated-lower-thirds/lower-thirds/browser-source.html`;
    const serializedPayload = payload ? encodeURIComponent(JSON.stringify(payload)) : "";
    const sourceUrl = payload ? `${baseUrl}#v=${Date.now()}` : baseUrl;
    const sourceCss = serializedPayload
      ? `:root { --animated-lt-data: "${serializedPayload}"; }`
      : "";

    await this.clearAllOverlays(sourceName, sceneName, resources);
    await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true);

    let currentUrl = "";
    try {
      const current = await this.call("GetInputSettings", { inputName: sourceName }) as {
        inputSettings?: { url?: string };
      };
      currentUrl = current.inputSettings?.url ?? "";
    } catch { /* ignore and load below */ }

    const sourceChanged = currentUrl !== sourceUrl;
    if (sourceChanged || payload) {
      await this.setBrowserSourceUrl(sourceName, sourceUrl, false, sourceCss);
    }

    return sourceChanged;
  }

  /**
   * Push sermon quotes/points using the same general fullscreen/lower-third
   * theme structure as Bible and Worship, while keeping the existing LT source.
   */
  async pushSermonCue(data: {
    text: string;
    label?: string;
    topic?: string;
    itemType?: "quote" | "point";
    overlayMode?: "fullscreen" | "lower-third";
    bibleThemeSettings?: Record<string, unknown> | null;
    liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
    backgroundOnly?: boolean;
  }): Promise<void> {
    const resources = getDockResources();
    const target = await this.getTargetScene();
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("Could not determine the current OBS scene.");

    // Ensure the live program scene is visible behind overlays in MCE Presentation
    await this.ensureProgramSceneAsSourceInPresentation();

    const mode = data.overlayMode ?? "lower-third";
    const backgroundOnly = Boolean(data.backgroundOnly);
    const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
      data.bibleThemeSettings,
      data.liveOverrides,
    );
    const prevMode = this._lastOverlayMode[resources.ltSource];
    const modeChanged = prevMode !== undefined && prevMode !== mode;
    this._lastOverlayMode[resources.ltSource] = mode;

    if (mode === "fullscreen") {
      await this.clearAllOverlays([resources.ltSource, resources.fsBgSource], sceneName, resources);
      await this.ensureFullscreenBg(sceneName, effectiveThemeSettings, true, resources);
      await this.ensureOverlaySource(sceneName, resources.ltSource, undefined, undefined, true);
    } else {
      await this.clearAllOverlays(resources.ltSource, sceneName, resources);
      await this.ensureOverlaySource(sceneName, resources.ltSource, undefined, undefined, true);
      await this.hideFullscreenBg(sceneName, resources);
    }

    const themeForOverlay = mode === "lower-third"
      ? this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings).overlayTheme
      : effectiveThemeSettings;
    const { cleanSettings, css } = this.stripThemeDataUris(themeForOverlay);
    const reference = backgroundOnly
      ? ""
      : data.itemType === "point"
        ? ""
        : data.label || data.topic || "Quote";
    const slide = {
      ...this.buildBibleSlide(backgroundOnly ? "" : data.text, reference),
      showCounter: data.itemType !== "point",
    };
    const packet = {
      slide,
      theme: cleanSettings ?? null,
      live: true,
      blanked: false,
      timestamp: Date.now(),
    };
    const baseUrl = this.buildOverlayHtmlUrl("mce-bible-overlay.html", {
      tab: "sermon",
      mode,
    });

    this.publishFullscreenOverlayPacket(packet, "sermon", css);
    const sourceSignature = JSON.stringify({
      baseUrl,
      css: css || "",
    });
    const overlayCss = this.buildCssOverlayDataCss(packet, css);
    if (modeChanged || this._lastFullscreenSourceSignature[resources.ltSource] !== sourceSignature) {
      await this.setBrowserSourceUrl(resources.ltSource, baseUrl, modeChanged, overlayCss);
      this._lastFullscreenSourceSignature[resources.ltSource] = sourceSignature;
    } else {
      await this.call("SetInputSettings", {
        inputName: resources.ltSource,
        inputSettings: { css: overlayCss },
      });
    }
    this._lastCssOverlayPacketBySource[resources.ltSource] = packet;
    this._lastCssOverlayBaseUrlBySource[resources.ltSource] = baseUrl;
    this._lastCssOverlayThemeCssBySource[resources.ltSource] = css || "";

  }

  /**
   * Clear sermon cue — simply hide the sermon source in MCE Presentation.
   */
  async clearSermonCue(): Promise<void> {
    const scene = PRESENTATION_SCENE_NAME;

    // Hide the sermon source (lower-third) in MCE Presentation
    await this.hideOverlaySource(scene, SOURCE_NAMES.LOWER_THIRD).catch(() => { });
    await this.hideOverlaySource(scene, BG_SOURCE_NAMES.LOWER_THIRD).catch(() => { });

    // Restore Program scene to what it was before Sermon Cue was pushed
    await this.restoreProgramSceneBeforePush();

  }

  /**
   * Clear all lower-third overlays.
   * Sends a blanked URL first (triggers exit animation), waits, then hides.
   */
  async clearLowerThirds(waitMs = FULLSCREEN_CLEAR_WAIT_MS): Promise<void> {
    for (const resources of getAllDockResources()) {
      try {
        const cachedPayload = this._lastCssOverlayPacketBySource[resources.ltSource];
        const cachedBaseUrl = this._lastCssOverlayBaseUrlBySource[resources.ltSource];
        if (cachedPayload && cachedBaseUrl) {
          const blankedPacket = {
            ...cachedPayload,
            live: false,
            blanked: true,
            timestamp: Date.now(),
          };
          const overlayCss = this.buildCssOverlayDataCss(
            blankedPacket,
            this._lastCssOverlayThemeCssBySource[resources.ltSource] || "",
          );
          await this.call("SetInputSettings", {
            inputName: resources.ltSource,
            inputSettings: { css: overlayCss },
          });
        } else {
          const fallbackUrl = this.buildLowerThirdUrl({}, false, true);
          const url = await this.buildBlankedOverlayUrlFromCurrentSource(resources.ltSource, fallbackUrl);
          await this.setBrowserSourceUrl(resources.ltSource, url);
        }
      } catch { /* ignore */ }
    }

    // Wait for exit animation before hiding the source
    await new Promise((r) => setTimeout(r, waitMs));

    const scenes = new Set<string>();
    scenes.add(DOCK_PRESENTATION_SCENE);
    try {
      const targetScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (targetScene) scenes.add(targetScene);
    } catch { /* ignore */ }

    for (const resources of getAllDockResources()) {
      for (const sceneName of scenes) {
        await this.hideOverlaySource(sceneName, resources.ltSource);
        await this.hideFullscreenBg(sceneName, resources);
        await this.removeSceneItemBySource(sceneName, resources.ltSource);
        await this.removeSceneItemBySource(sceneName, resources.fsBgSource);
      }
      // Do NOT delete inputs globally — keep them alive for reuse.
      delete this._lastOverlayMode[resources.ltSource];
      delete this._lastFullscreenSourceSignature[resources.ltSource];
      delete this._lastCssOverlayPacketBySource[resources.ltSource];
      delete this._lastCssOverlayBaseUrlBySource[resources.ltSource];
      delete this._lastCssOverlayThemeCssBySource[resources.ltSource];
    }

    // Restore Program scene to what it was before Lower Third was pushed
    await this.restoreProgramSceneBeforePush("lower-third");

  }

  /**
   * Animate the dock lower-third source out using the currently loaded
   * payload, then hide/remove it after the theme's exit duration.
   */
  async animateLowerThirdOverlayUrlOut(
    _url: string,
    waitMs = FULLSCREEN_CLEAR_WAIT_MS,
    options?: { restoreProgram?: boolean },
  ): Promise<void> {
    const resources = getDockResources();
    const scenes = new Set<string>();
    scenes.add(DOCK_PRESENTATION_SCENE);
    try {
      const target = await this.getPresentationTargetScene("lower-third");
      if (target.sceneName) scenes.add(target.sceneName);
    } catch { /* ignore */ }
    try {
      const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (currentProgramScene) scenes.add(currentProgramScene);
    } catch { /* ignore */ }

    let delivered = false;
    try {
      delivered = await this.emitBrowserOverlayPacket("lower-third", {
        action: "animate-out",
        timestamp: Date.now(),
      }, "");
    } catch {
      delivered = false;
    }

    if (!delivered) {
      try {
        const exitUrl = await this.buildBlankedOverlayUrlFromCurrentSource(resources.ltSource, "");
        if (!exitUrl) {
          throw new Error("No current lower-third payload is available for exit animation.");
        }
        await this.call("SetInputSettings", {
          inputName: resources.ltSource,
          inputSettings: {
            url: exitUrl,
            bgcolor: "#00000000",
            shutdown: false,
            restart_when_active: false,
            fps_custom: true,
            fps: 60,
          },
        });
        this._lastBrowserSourceUrlBySource[resources.ltSource] = exitUrl;
        delivered = true;
      } catch {
        delivered = false;
      }
    }

    if (delivered) {
      for (const sceneName of scenes) {
        const item = await this.getSceneItemBySource(sceneName, resources.ltSource).catch(() => null);
        if (!item) continue;
        await this.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: true,
        }).catch(() => { });
      }
    }

    await this.sleep(delivered ? waitMs : 0);

    for (const sceneName of scenes) {
      await this.hideOverlaySource(sceneName, resources.ltSource);
      await this.hideFullscreenBg(sceneName, resources);
      await this.removeSceneItemBySource(sceneName, resources.ltSource);
      await this.removeSceneItemBySource(sceneName, resources.fsBgSource);
    }

    delete this._lastOverlayMode[resources.ltSource];
    delete this._lastFullscreenSourceSignature[resources.ltSource];
    delete this._lastCssOverlayPacketBySource[resources.ltSource];
    delete this._lastCssOverlayBaseUrlBySource[resources.ltSource];
    delete this._lastCssOverlayThemeCssBySource[resources.ltSource];

    if (options?.restoreProgram !== false) {
      await this.restoreProgramSceneBeforePush("lower-third");
    }
  }

  // ── Worship lyrics overlay ──

  /**
   * Push worship lyrics to OBS as an overlay in the current scene.
   * Supports both fullscreen and lower-third overlay modes.
   */
  async pushWorshipLyrics(data: DockTabContentPushData): Promise<void> {
    return this._pushTabContent(data, "worship");
  }

  async pushAnnouncement(data: DockTabContentPushData): Promise<void> {
    return this._pushTabContent(data, "announcements");
  }

  async pushNotesLyrics(data: DockTabContentPushData): Promise<void> {
    return this._pushTabContent(data, "notes");
  }

  /** Shared tab-content push for worship, announcements, and notes */
  private async _pushTabContent(
    data: DockTabContentPushData,
    tab: "worship" | "announcements" | "notes",
  ): Promise<void> {
    const isWorship = tab === "worship";
    const isNotes = tab === "notes";
    const stableCssOverlayTab = isWorship || isNotes;
    const runSerialized = isWorship
      ? this.runSerializedWorshipMutation.bind(this)
      : isNotes
        ? this.runSerializedNotesMutation.bind(this)
        : this.runSerializedAnnouncementMutation.bind(this);
    const sourceKey = isWorship ? "worshipSource" : "notesSource";
    const getInitialized = () => isWorship ? this._worshipInitialized : isNotes ? this._notesInitialized : this._announcementInitialized;
    const setInitialized = (v: boolean) => { if (isWorship) this._worshipInitialized = v; else if (isNotes) this._notesInitialized = v; else this._announcementInitialized = v; };
    const getLastPushSignature = () => isWorship ? this._lastWorshipPushSignature : isNotes ? this._lastNotesPushSignature : this._lastAnnouncementPushSignature;
    const setLastPushSignature = (v: string) => { if (isWorship) this._lastWorshipPushSignature = v; else if (isNotes) this._lastNotesPushSignature = v; else this._lastAnnouncementPushSignature = v; };

    return runSerialized(async () => {
      const resources = getDockResources();
      const sourceName = resources[sourceKey];
      const currentProgramSceneBeforeTarget = await this.getCurrentProgramSceneName().catch(() => "");

      // Detect mode switch early — delete old clone before getting new target
      const mode = data.overlayMode ?? "lower-third";
      const prevMode = this._lastOverlayMode[sourceName];
      const modeChanged = prevMode !== undefined && prevMode !== mode;
      const shouldRebuildSceneGraph = () => !getInitialized() || (!stableCssOverlayTab && modeChanged);

      // Fast path: if already initialized, skip the expensive clone delete +
      // re-init cycle. The overlay HTML handles mode switching via CSS opacity
      // toggle (setActiveLayer), so we can just update the packet in-place.
      if (
        (isWorship || isNotes)
        && mode === "fullscreen"
        && getInitialized()
        && this._lastBrowserSourceUrlBySource[sourceName]
      ) {
        if (modeChanged) {
          this._lastOverlayMode[sourceName] = mode;
        }
        const backgroundOnly = Boolean(data.backgroundOnly);
        const sectionText = backgroundOnly ? "" : data.sectionText;
        const translationText = backgroundOnly ? "" : (data.translationText ?? "");
        const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
          data.bibleThemeSettings,
          data.liveOverrides,
        );
        const { cleanSettings, css } = this.stripThemeDataUris(effectiveThemeSettings);
        const themeCss = stripCompatModeCSS(css);
        const slide = sectionText ? {
          id: `dock-${tab}-slide`,
          reference: "",
          text: sectionText,
          translationText,
          translationOrder: data.translationOrder ?? "original-first",
          verseRange: "",
          index: 0,
          total: 1,
        } : null;
        const packet: Record<string, unknown> = {
          slide,
          theme: cleanSettings ?? null,
          live: true,
          blanked: false,
          timestamp: Date.now(),
          mode,
        };
        const cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab(tab, sourceName);

        this.publishFullscreenOverlayPacket({
          slide: (packet.slide as Record<string, unknown> | null) ?? null,
          theme: (packet.theme as Record<string, unknown> | null) ?? null,
          live: true,
          blanked: false,
          timestamp: Number(packet.timestamp) || Date.now(),
          mode,
        }, tab, themeCss);

        await this.deliverCssOverlayPacket(sourceName, tab, packet, cssOverlayBaseUrl, themeCss);
        this._lastOverlayMode[sourceName] = mode;
        setLastPushSignature("");
        return;
      }

      if (modeChanged && !stableCssOverlayTab) {
        try {
          const previewScene = await this.getCurrentPreviewSceneName().catch(() => "");
          const tabPreviewName = TAB_PREVIEW_SCENE_NAMES[tab];
          if (previewScene === tabPreviewName) {
            const previewState = this.getStoredPreviewSceneStateForTab(tab);
            const original = previewState?.originalSceneName
              || this.getPreviewBaseSceneName(previewScene);
            if (original) {
              await this.setCurrentPreviewScene(original);
              await this.waitForSceneMatch("preview", original).catch(() => { });
            }
          }
        } catch { /* ignore */ }
        await this.deleteClone(undefined, tab).catch(() => { });
        setInitialized(false);
        setLastPushSignature("");
      }

      const target = mode === "lower-third"
        ? await this.getPresentationTargetScene(tab, { activate: false })
        : await this.getTargetScene(tab);
      const sceneName = target.sceneName;
      if (!sceneName) throw new Error("Could not determine the current OBS scene.");
      const presentationLive = mode === "fullscreen" && !target.studioMode;

      // Ensure the live program scene is visible behind overlays in MCE Presentation
      await this.ensureProgramSceneAsSourceInPresentation();

      // Dedup: skip identical pushes
      const pushSignature = this.buildWorshipPushSignature(
        sceneName,
        currentProgramSceneBeforeTarget,
        data,
      );
      if (pushSignature === getLastPushSignature()) {
        const recoveryScene = mode === "fullscreen" ? resources.worshipScene : sceneName;
        await this.ensureOverlaySource(recoveryScene, sourceName, undefined, undefined, true).catch(() => { });
        await this.ensureActiveMceOverlaySource(
          recoveryScene,
          sourceName,
          [sourceName],
          resources,
        ).catch(() => { });

        if (mode === "fullscreen" && !presentationLive && resources.worshipScene !== sceneName) {
          await this.ensureSceneSourceInTarget(sceneName, resources.worshipScene, true).catch(() => { });
        }

        const cachedPacket = this._lastCssOverlayPacketBySource[sourceName];
        const cachedBaseUrl = this._lastCssOverlayBaseUrlBySource[sourceName];
        if (cachedPacket && cachedBaseUrl) {
          await this.deliverCssOverlayPacket(
            sourceName,
            tab,
            cachedPacket,
            cachedBaseUrl,
            this._lastCssOverlayThemeCssBySource[sourceName] || "",
          ).catch(() => { });
        }
        if (mode === "fullscreen") {
          await this.fitSceneSourceToCanvas(resources.worshipScene, sourceName).catch(() => { });
        } else {
          await this.fitSceneSourceToLowerThirdWindow(recoveryScene, sourceName).catch(() => { });
        }

        await this.promotePresentationScene(tab).catch(() => { });
        return;
      }

      const backgroundOnly = Boolean(data.backgroundOnly);
      const sectionText = backgroundOnly ? "" : data.sectionText;
      const translationText = backgroundOnly ? "" : (data.translationText ?? "");
      // Keep worship section labels available in the operator UI, but do not
      // render them into OBS preview/program overlays.
      const sectionLabel = backgroundOnly
        ? ""
        : (isWorship ? "" : cleanWorshipObsLabel(data.sectionLabel));
      const effectiveThemeSettings = this.mergeThemeSettingsWithLiveOverrides(
        data.bibleThemeSettings,
        data.liveOverrides,
      );
      this._lastOverlayMode[sourceName] = mode;

      let url: string;
      let themeCss = "";
      let cssOverlayPacket: Record<string, unknown> | null = null;
      let cssOverlayBaseUrl = "";
      let useCssOverlayTransport = false;

      if (mode === "fullscreen") {
        if (shouldRebuildSceneGraph()) {
          await this.clearAllOverlays([resources.worshipScene, resources.fsBgSource], sceneName, resources);
          await this.hideOverlaySource(sceneName, sourceName);
          await this._hideLowerThirdBgSource(sceneName).catch(() => { });
          await this.ensureDedicatedScene(resources.worshipScene);
          await this.ensureOverlaySource(resources.worshipScene, sourceName, undefined, undefined, true);
          // Use browser overlay CSS for background; hide separate fullscreen
          // BG sources to keep the browser + background as a single OBS source.
          await this._hideFullscreenBgSource("worship");
          if (!this.isPromotedPreviewScene(sceneName, currentProgramSceneBeforeTarget) && resources.worshipScene !== PRESENTATION_SCENE_NAME) {
            await this.removeFromProgramIfExists(resources.worshipScene);
          }
          if (!presentationLive && resources.worshipScene !== sceneName) {
            await this.ensureSceneSourceInTarget(sceneName, resources.worshipScene, true);
          }
          if (!presentationLive) {
            await this.ensureFullscreenTargetBg(sceneName, resources.worshipScene, effectiveThemeSettings, true, resources);
          }
          setInitialized(true);
        } else {
          await this.ensureOverlaySource(resources.worshipScene, sourceName, undefined, undefined, true).catch(() => { });
          // Ensure no separate fullscreen BG inputs are left behind; the
          // background will be rendered via the browser overlay CSS.
          await this._hideFullscreenBgSource("worship");
          if (!presentationLive) {
            await this.ensureFullscreenTargetBg(sceneName, resources.worshipScene, effectiveThemeSettings, true, resources);
          }
        }

        // Only keep the overlay browser source active; BG is applied via CSS.
        await this.ensureActiveMceOverlaySource(resources.worshipScene, sourceName, [sourceName], resources);
        await this.fitSceneSourceToOverlayMode(resources.worshipScene, sourceName, mode).catch(() => { });

        if (presentationLive) {
          await this.promotePresentationScene(tab).catch(() => { });
        }

        const { cleanSettings, css } = this.stripThemeDataUris(effectiveThemeSettings);
        themeCss = stripCompatModeCSS(css);
        const slide = sectionText ? {
          id: `dock-${tab}-slide`,
          reference: "",
          text: sectionText,
          translationText,
          verseRange: sectionLabel,
          index: 0,
          total: 1,
        } : null;
        const packet = {
          slide,
          theme: cleanSettings ?? null,
          live: true,
          blanked: false,
          timestamp: Date.now(),
          mode,
        };

        this._hasSeparateFullscreenBg(effectiveThemeSettings);
        cssOverlayPacket = packet;
        cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab(tab, sourceName);
        useCssOverlayTransport = true;
        url = `${cssOverlayBaseUrl}#data=${encodeURIComponent(JSON.stringify(packet))}`;
      } else {
        // ── OBS lower-third theme path (custom HTML/CSS themes) ──
        if (data.ltTheme) {
          if (shouldRebuildSceneGraph()) {
            await this.clearAllOverlays(sourceName, sceneName, resources);
            await this.hideSceneSource(sceneName, resources.worshipScene);
            await this.hideFullscreenBg(sceneName, resources);
            await this._hideLowerThirdBgSource(sceneName).catch(() => { });
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true);
            setInitialized(true);
          } else {
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true).catch(() => { });
          }

          await this.ensureActiveMceOverlaySource(
            sceneName,
            sourceName,
            [sourceName],
            resources,
          );

          const ltThemeRef: DockLTThemeRef = {
            id: data.ltTheme.id,
            html: data.ltTheme.html,
            css: data.ltTheme.css,
          };
          const values = data.values ?? {};
          url = this.buildLowerThirdUrl(values, false, false, ltThemeRef);
          useCssOverlayTransport = false;
        } else if (effectiveThemeSettings) {
          const { overlayTheme } = this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings);

          if (shouldRebuildSceneGraph()) {
            await this.clearAllOverlays(sourceName, sceneName, resources);
            await this.hideSceneSource(sceneName, resources.worshipScene);
            await this.hideFullscreenBg(sceneName, resources);
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true);
            setInitialized(true);
          } else {
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true).catch(() => { });
          }

          // Background is rendered by the browser overlay; hide any
          // lower-third BG inputs and only activate the browser source.
          await this._hideLowerThirdBgSource(sceneName).catch(() => { });
          await this.ensureActiveMceOverlaySource(sceneName, sourceName, [sourceName], resources);

          const { cleanSettings: wltClean, css } = this.stripThemeDataUris(overlayTheme);
          themeCss = stripCompatModeCSS(css);
          const slide = this.buildBibleSlide(sectionText, sectionLabel, "", translationText, data.translationOrder);
          cssOverlayPacket = {
            slide,
            theme: wltClean ?? null,
            live: true,
            blanked: false,
            timestamp: Date.now(),
            mode,
          };
          cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab(tab, sourceName);
          useCssOverlayTransport = true;
          url = `${cssOverlayBaseUrl}#data=${encodeURIComponent(JSON.stringify(cssOverlayPacket))}`;
        } else {
          if (shouldRebuildSceneGraph()) {
            await this.clearAllOverlays(sourceName, sceneName, resources);
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true);
            setInitialized(true);
          } else {
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true).catch(() => { });
          }

          const slide = this.buildBibleSlide(sectionText, sectionLabel, "", translationText, data.translationOrder);
          cssOverlayPacket = {
            slide,
            theme: null,
            live: true,
            blanked: false,
            timestamp: Date.now(),
            mode,
          };
          cssOverlayBaseUrl = this.buildCssOverlayHtmlUrlForTab(tab, sourceName);
          useCssOverlayTransport = true;
          url = `${cssOverlayBaseUrl}#data=${encodeURIComponent(JSON.stringify(cssOverlayPacket))}`;

          await this.hideFullscreenBg(sceneName, resources);
          await this.hideSceneSource(sceneName, resources.worshipScene);

          await this.ensureActiveMceOverlaySource(
            sceneName,
            sourceName,
            [sourceName],
            resources,
          );
        }
      }
      if (mode === "lower-third") {
        await this.fitSceneSourceToOverlayMode(sceneName, sourceName, mode).catch(() => { });
      }

      if (useCssOverlayTransport && cssOverlayPacket) {
        if (stableCssOverlayTab) {
          await this.bringMceOverlayForward(sourceName).catch(() => { });
        }

        this.publishFullscreenOverlayPacket({
          slide: (cssOverlayPacket.slide as Record<string, unknown> | null) ?? null,
          theme: (cssOverlayPacket.theme as Record<string, unknown> | null) ?? null,
          live: true,
          blanked: Boolean(cssOverlayPacket.blanked),
          timestamp: Number(cssOverlayPacket.timestamp) || Date.now(),
          mode: String(mode || "fullscreen"),
        }, tab, themeCss);
        await this.deliverCssOverlayPacket(
          sourceName,
          tab,
          cssOverlayPacket,
          cssOverlayBaseUrl,
          themeCss,
        );
        if (mode === "fullscreen") {
          await this.fitSceneSourceToOverlayMode(resources.worshipScene, sourceName, mode).catch(() => { });
          if (modeChanged) {
            await this.setSceneSourceEnabledByName(resources.worshipScene, sourceName, true).catch(() => { });
          }
        }
      } else {
        await this.setBrowserSourceUrl(sourceName, url, modeChanged, themeCss || undefined);
      }

      if (mode === "lower-third" && useCssOverlayTransport && cssOverlayPacket) {
        await this.waitForOverlayRenderAck(
          tab,
          Number(cssOverlayPacket.timestamp) || Date.now(),
          mode,
        ).catch(() => { });
      }

      if (mode === "lower-third") {
        await this.promotePresentationScene(tab).catch(() => { });
        await this.fitSceneSourceToOverlayMode(PRESENTATION_SCENE_NAME, sourceName, mode).catch(() => { });
        if (modeChanged) {
          await this.setSceneSourceEnabledByName(PRESENTATION_SCENE_NAME, sourceName, true).catch(() => { });
          if (sceneName !== PRESENTATION_SCENE_NAME) {
            await this.setSceneSourceEnabledByName(sceneName, sourceName, true).catch(() => { });
          }
        }
      }

      setLastPushSignature(pushSignature);
    });
  }

  async clearAnnouncement(): Promise<void> {
    return this.runSerializedNotesMutation(async () => {
      this._lastNotesPushSignature = "";
      const resources = getDockResources();
      const sourceName = resources.notesSource;
      const scene = PRESENTATION_SCENE_NAME;
      const batchRequests = [
        ...(await this._buildHideBatchRequests(scene, [sourceName])),
      ];

      if (batchRequests.length > 0) {
        await this.callBatch(batchRequests, 2).catch(() => { });
        this.invalidateSceneItemListCache(scene);
        this.invalidateActiveMceOverlayState(scene);
      }

      await this.deleteClone(undefined, "notes").catch(() => { });
      this._notesInitialized = false;
    });
  }

  /**
   * Clear worship lyrics — hide all worship sources via a single callBatch.
   *
   * Previous implementation fired 12+ individual SetSceneItemEnabled calls
   * through the rate limiter. This version resolves all source names to item
   * IDs via the scene-item cache, then sends one batched WebSocket frame.
   */
  async clearWorshipLyrics(): Promise<void> {
    return this.runSerializedWorshipMutation(async () => {
      this._lastWorshipPushSignature = "";
      const resources = getDockResources();
      const scene = PRESENTATION_SCENE_NAME;
      const ltBg = this._ltBgNames(scene);
      const fsBg = this.getTargetFullscreenBgSourceName(scene, resources);

      // ── Phase 1: collect all source names per scene ──

      const presentationNames: string[] = [
        SOURCE_NAMES.WORSHIP,
        BG_SOURCE_NAMES.WORSHIP,
        FULLSCREEN_SOURCE_NAMES.WORSHIP,
        FULLSCREEN_BG_SOURCE_NAMES.WORSHIP,
        resources.worshipSource,
        resources.worshipScene,
        resources.fsBgSource,
        fsBg,
        ltBg.a,
        ltBg.b,
      ];

      const currentScene = await this.getCurrentProgramSceneName(true).catch(() => "");
      let currentNames: string[] = [];
      if (currentScene && currentScene !== scene) {
        const curLtBg = this._ltBgNames(currentScene);
        const curFsBg = this.getTargetFullscreenBgSourceName(currentScene, resources);
        currentNames = [
          resources.worshipSource,
          resources.worshipScene,
          resources.fsBgSource,
          curFsBg,
          curLtBg.a,
          curLtBg.b,
        ];
      }

      // ── Phase 2: resolve IDs + send single batch ──

      const batchRequests = [
        ...(await this._buildHideBatchRequests(scene, presentationNames)),
        ...(currentNames.length > 0
          ? await this._buildHideBatchRequests(currentScene, currentNames)
          : []),
      ];

      if (batchRequests.length > 0) {
        await this.callBatch(batchRequests, 2 /* Parallel */).catch(() => { });
        // Invalidate caches since items were toggled
        this.invalidateSceneItemListCache(scene);
        this.invalidateActiveMceOverlayState(scene);
        if (currentScene && currentScene !== scene) {
          this.invalidateSceneItemListCache(currentScene);
          this.invalidateActiveMceOverlayState(currentScene);
        }
      }

      // ── Phase 3: remaining cleanup (non-hide operations) ──

      // Keep MCE Presentation inside managed Multiview scenes. It is the
      // user's last-added presentation layer, not a temporary overlay item.
      if (currentScene && currentScene !== scene) {
        const fsDef = this._fullscreenSceneDefs["worship"];
        if (fsDef && !DockObsClient.isManagedMultiviewSceneName(currentScene)) {
          try {
            const items = await this.getSceneItemListCached(currentScene);
            const fsItems = items.filter((i) => i.sourceName.startsWith(fsDef.sceneName));
            for (const item of fsItems) {
              await this.call("RemoveSceneItem", { sceneName: currentScene, sceneItemId: item.sceneItemId });
              this.invalidateSceneItemListCache(currentScene);
            }
          } catch { /* ignore */ }
        }
      }

      // Clean up the worship clone scene (studio mode)
      await this.deleteClone(undefined, "worship").catch(() => { });

      // Restore Program scene to what it was before Worship was pushed
      await this.restoreProgramSceneBeforePush("worship");

      // Reset so next push does full setup
      this._worshipInitialized = false;
      this.publishBlankFullscreenOverlayPacket("worship", "lower-third");
    });
  }

  async clearNotesLyrics(): Promise<void> {
    return this.runSerializedNotesMutation(async () => {
      this._lastNotesPushSignature = "";
      const resources = getDockResources();
      const scene = PRESENTATION_SCENE_NAME;
      const ltBg = this._ltBgNames(scene);
      const fsBg = this.getTargetFullscreenBgSourceName(scene, resources);

      const presentationNames: string[] = [
        SOURCE_NAMES.WORSHIP,
        BG_SOURCE_NAMES.WORSHIP,
        FULLSCREEN_SOURCE_NAMES.NOTES,
        FULLSCREEN_BG_SOURCE_NAMES.NOTES,
        resources.notesSource,
        resources.worshipScene,
        resources.fsBgSource,
        fsBg,
        ltBg.a,
        ltBg.b,
      ];

      const currentScene = await this.getCurrentProgramSceneName(true).catch(() => "");
      let currentNames: string[] = [];
      if (currentScene && currentScene !== scene) {
        const curLtBg = this._ltBgNames(currentScene);
        const curFsBg = this.getTargetFullscreenBgSourceName(currentScene, resources);
        currentNames = [
          resources.notesSource,
          resources.worshipScene,
          resources.fsBgSource,
          curFsBg,
          curLtBg.a,
          curLtBg.b,
        ];
      }

      const batchRequests = [
        ...(await this._buildHideBatchRequests(scene, presentationNames)),
        ...(currentNames.length > 0
          ? await this._buildHideBatchRequests(currentScene, currentNames)
          : []),
      ];

      if (batchRequests.length > 0) {
        await this.callBatch(batchRequests, 2).catch(() => { });
        this.invalidateSceneItemListCache(scene);
        this.invalidateActiveMceOverlayState(scene);
        if (currentScene && currentScene !== scene) {
          this.invalidateSceneItemListCache(currentScene);
          this.invalidateActiveMceOverlayState(currentScene);
        }
      }

      if (currentScene && currentScene !== scene) {
        const fsDef = this._fullscreenSceneDefs["notes"];
        if (fsDef && !DockObsClient.isManagedMultiviewSceneName(currentScene)) {
          try {
            const items = await this.getSceneItemListCached(currentScene);
            const fsItems = items.filter((i) => i.sourceName.startsWith(fsDef.sceneName));
            for (const item of fsItems) {
              await this.call("RemoveSceneItem", { sceneName: currentScene, sceneItemId: item.sceneItemId });
              this.invalidateSceneItemListCache(currentScene);
            }
          } catch { /* ignore */ }
        }
      }

      await this.deleteClone(undefined, "notes").catch(() => { });
      await this.restoreProgramSceneBeforePush("notes");
      this._notesInitialized = false;
      this.publishBlankFullscreenOverlayPacket("notes", "lower-third");
    });
  }

  // ── Ticker overlay ──

  /**
   * Build a ticker overlay URL using the lower-third overlay renderer.
   * Maps badge + tickerText to the theme's template variables.
   *
   * NOTE: Always sends `live: true` to the overlay so it renders.
   */
  private buildTickerUrl(
    badge: string,
    tickerText: string,
    _live: boolean,
    blanked: boolean,
    theme?: DockLTThemeRef,
  ): string {
    const t = theme ?? getDefaultLTTheme();
    const payload = {
      themeId: t.id,
      html: t.html,
      css: stripCompatModeCSS(t.css),
      values: {
        badge: badge || "Church News",
        tickerText: tickerText || "",
        name: badge || "Church News",
        role: tickerText || "",
        title: badge,
        subtitle: tickerText,
        text: tickerText,
        headline: badge,
        details: tickerText,
        line1: badge,
        line2: tickerText,
      },
      live: true,
      blanked,
      size: "xl",
      scale: 1,
      widthPct: 100,
      fontScale: 1,
      fontSizeScale: 1,
      position: "bottom-center",
      animationIn: "slide-up",
      timestamp: Date.now(),
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    return `${this.buildOverlayHtmlUrl("lower-third-overlay.html")}#data=${encoded}`;
  }

  /**
   * Push a ticker to OBS as an overlay in the current scene.
   */
  async pushTicker(data: {
    badge: string;
    tickerText: string;
    ltTheme?: DockLTThemeRef;
  }): Promise<void> {
    const resources = getDockResources();
    const sceneName = DOCK_PRESENTATION_SCENE;

    // Ensure the live program scene is visible behind overlays in MCE Presentation
    await this.ensureProgramSceneAsSourceInPresentation();

    // Clear all OTHER overlays first so previous overlay doesn't persist
    await this.clearAllOverlays(resources.tickerSource, sceneName, resources);

    await this.ensureOverlaySource(sceneName, resources.tickerSource, undefined, undefined, true);
    const resolvedLTTheme = this.resolveLTTheme(data.ltTheme, "ticker");

    const url = this.buildTickerUrl(
      data.badge,
      data.tickerText,
      false,
      false,
      resolvedLTTheme,
    );

    await this.setBrowserSourceUrl(resources.tickerSource, url);
    await this.promotePresentationScene("ministry").catch(() => { });

  }

  async pushTickerToScene(data: {
    badge: string;
    tickerText: string;
    ltTheme?: DockLTThemeRef;
  }, sceneName: string): Promise<void> {
    const resolvedLTTheme = this.resolveLTTheme(data.ltTheme, "ticker");
    await this.pushSceneRouteBrowserSource({
      module: "ticker",
      sceneName,
      url: this.buildTickerUrl(data.badge, data.tickerText, false, false, resolvedLTTheme),
    });
  }

  // ── State Recovery ──

  /**
   * Scan OBS for currently-active overlay sources created by the dock.
   * Reconstructs live state from either the browser-source CSS payload or the
   * older URL hash payload, then restores staged/live state after a restart.
   */
  async recoverLiveState(): Promise<{
    bible: {
      reference: string;
      text: string;
      overlayMode: string;
      compare: {
        enabled: boolean;
        layout: string;
        columns: Array<{
          book: string;
          chapter: number;
          verse: number;
          verseEnd: number;
          verseRange: string;
          referenceLabel: string;
          translation: string;
          verseText: string;
        }>;
      } | null;
    } | null;
    worship: { sectionLabel: string; sectionText: string; translationText?: string; songTitle: string; artist: string; overlayMode: string } | null;
    lowerThird: { name: string; role: string } | null;
  }> {
    const result: {
      bible: {
        reference: string;
        text: string;
        overlayMode: string;
        compare: {
          enabled: boolean;
          layout: string;
          columns: Array<{
            book: string;
            chapter: number;
            verse: number;
            verseEnd: number;
            verseRange: string;
            referenceLabel: string;
            translation: string;
            verseText: string;
          }>;
        } | null;
      } | null;
      worship: { sectionLabel: string; sectionText: string; translationText?: string; songTitle: string; artist: string; overlayMode: string } | null;
      lowerThird: { name: string; role: string } | null;
    } = { bible: null, worship: null, lowerThird: null };

    if (!this.isConnected) return result;

    const sourcesToCheck = [
      { name: this._fullscreenSceneDefs["bible"].browserSourceName, type: "bible" as const },
      { name: DOCK_WORSHIP_SOURCE, type: "worship" as const },
      { name: DOCK_NOTES_SOURCE, type: "notes" as const },
      { name: DOCK_LT_SOURCE, type: "lowerThird" as const },
    ];

    let inputNames = new Set<string>();
    let currentProgramScene = "";
    let currentSceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemEnabled?: boolean }> = [];
    try {
      const inputList = await this.call("GetInputList") as {
        inputs: Array<{ inputName: string }>;
      };
      inputNames = new Set((inputList.inputs ?? []).map((input) => String(input.inputName || "").trim()).filter(Boolean));
    } catch {
      return result;
    }

    try {
      currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (currentProgramScene) {
        const items = await this.call("GetSceneItemList", { sceneName: currentProgramScene }) as {
          sceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemEnabled?: boolean }>;
        };
        currentSceneItems = items.sceneItems ?? [];
      }
    } catch {
      currentProgramScene = "";
      currentSceneItems = [];
    }

    for (const { name, type } of sourcesToCheck) {
      try {
        if (!inputNames.has(name)) continue;

        const resp = await this.call("GetInputSettings", { inputName: name }) as {
          inputSettings: { url?: string; css?: string };
        };
        const url = resp.inputSettings?.url || "";
        const documentUrl = this.normalizeBrowserSourceDocumentUrl(url);
        if (documentUrl) {
          this._lastBrowserSourceUrlBySource[name] = documentUrl;
        }
        const cssPacket = this.extractOverlayPacketFromCss(resp.inputSettings?.css);
        const urlPacket = url && url !== "about:blank" && url.includes("#data=")
          ? (() => {
            try {
              const encoded = url.split("#data=")[1];
              return encoded ? JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown> : null;
            } catch {
              return null;
            }
          })()
          : null;
        const data = cssPacket ?? urlPacket;
        if (!data) continue;

        let isEnabled = false;
        if (currentProgramScene === PRESENTATION_SCENE_NAME) {
          const item = currentSceneItems.find((sceneItem) => sceneItem.sourceName === name);
          isEnabled = item?.sceneItemEnabled !== false;
        } else {
          const presentationItem = currentSceneItems.find((sceneItem) => sceneItem.sourceName === PRESENTATION_SCENE_NAME);
          const directItem = currentSceneItems.find((sceneItem) => sceneItem.sourceName === name);
          if (directItem) {
            isEnabled = directItem.sceneItemEnabled !== false;
          } else if (type === "bible" && presentationItem) {
            isEnabled = presentationItem.sceneItemEnabled !== false;
          }
        }

        if (!isEnabled) continue;
        if (data.blanked) continue; // Source exists but is blanked — treat as cleared

        if (type === "bible") {
          // Fullscreen bible has data.slide, LT bible has data.values
          const slide = data.slide && typeof data.slide === "object"
            ? data.slide as Record<string, unknown>
            : null;
          const values = data.values && typeof data.values === "object"
            ? data.values as Record<string, unknown>
            : null;
          if (slide) {
            const rawCompareColumns: unknown[] = Array.isArray(slide.columns) ? slide.columns : [];
            const compareColumns = rawCompareColumns
              .filter((column): column is Record<string, unknown> => Boolean(column) && typeof column === "object")
              .map((column) => ({
                book: typeof column.book === "string" ? column.book : "",
                chapter: typeof column.chapter === "number" ? column.chapter : 0,
                verse: typeof column.verse === "number" ? column.verse : 0,
                verseEnd: typeof column.verseEnd === "number"
                  ? column.verseEnd
                  : typeof column.verse === "number"
                    ? column.verse
                    : 0,
                verseRange: typeof column.verseRange === "string" ? column.verseRange : "",
                referenceLabel: typeof column.reference === "string" ? column.reference : "",
                translation: typeof column.translation === "string" ? column.translation : "",
                verseText: typeof column.text === "string" ? column.text : "",
              }))
              .filter((column) => column.book && column.chapter > 0 && column.verse > 0);
            result.bible = {
              reference: typeof slide.reference === "string" ? slide.reference : "",
              text: typeof slide.text === "string" ? slide.text : "",
              overlayMode:
                typeof data.mode === "string" && (data.mode === "lower-third" || data.mode === "fullscreen")
                  ? data.mode
                  : url.includes("lower-third")
                    ? "lower-third"
                    : "fullscreen",
              compare:
                slide.layout === "compare" && compareColumns.length === 2
                  ? {
                    enabled: true,
                    layout: typeof slide.compareLayout === "string"
                      ? slide.compareLayout
                      : "line-by-line",
                    columns: compareColumns as Array<{
                      book: string;
                      chapter: number;
                      verse: number;
                      verseEnd: number;
                      verseRange: string;
                      referenceLabel: string;
                      translation: string;
                      verseText: string;
                    }>,
                  }
                  : null,
            };
          } else if (values) {
            result.bible = {
              reference:
                typeof values.reference === "string"
                  ? values.reference
                  : typeof values.role === "string"
                    ? values.role
                    : "",
              text:
                typeof values.name === "string"
                  ? values.name
                  : typeof values.text === "string"
                    ? values.text
                    : "",
              overlayMode: "lower-third",
              compare: null,
            };
          }
        } else if (type === "worship") {
          const slide = data.slide && typeof data.slide === "object"
            ? data.slide as Record<string, unknown>
            : null;
          const values = data.values && typeof data.values === "object"
            ? data.values as Record<string, unknown>
            : null;
          if (slide) {
            // Fullscreen worship (uses bible fullscreen overlay)
            const ref = String(slide.reference || "").split(" · ");
            result.worship = {
              sectionLabel: ref[1] || String(slide.verseRange || ""),
              sectionText: typeof slide.text === "string" ? slide.text : "",
              translationText: typeof slide.translationText === "string" ? slide.translationText : "",
              songTitle: (ref[0] || "").split(" — ")[0] || "",
              artist: (ref[0] || "").split(" — ")[1] || "",
              overlayMode: "fullscreen",
            };
          } else if (values) {
            // LT worship
            result.worship = {
              sectionLabel:
                typeof values.label === "string"
                  ? values.label
                  : typeof values.role === "string"
                    ? values.role
                    : "",
              sectionText:
                typeof values.lyrics === "string"
                  ? values.lyrics
                  : typeof values.text === "string"
                    ? values.text
                    : typeof values.name === "string"
                      ? values.name
                      : "",
              translationText: typeof values.translationText === "string" ? values.translationText : "",
              songTitle:
                typeof values.songName === "string"
                  ? values.songName
                  : typeof values.title === "string"
                    ? values.title
                    : "",
              artist: typeof values.artist === "string" ? values.artist : "",
              overlayMode: "lower-third",
            };
          }
        } else if (type === "lowerThird") {
          const values = data.values && typeof data.values === "object"
            ? data.values as Record<string, unknown>
            : null;
          if (values) {
            result.lowerThird = {
              name: typeof values.name === "string" ? values.name : "",
              role: typeof values.role === "string" ? values.role : "",
            };
          }
        }
      } catch (err) {
        console.warn(`[DockOBS] Failed to recover state for "${name}":`, err);
      }
    }

    return result;
  }

  // ── Media playback ──

  /**
   * Push a church-service Live Tool to the target scene.
   */
  async pushLiveTool(tool: LiveToolTemplate): Promise<void> {
    if (tool.kind === "scene" && tool.sceneName) {
      await this.switchScene(tool.sceneName);
      return;
    }

    if (tool.kind === "scene") {
      throw new Error("Choose an OBS scene in the app before using this tool.");
    }

    if (tool.kind === "safety-action") {
      await this.runLiveToolSafetyAction(tool);
      return;
    }

    if (tool.kind === "media-loop" && tool.backgroundMediaPath) {
      await this.pushLiveToolMedia(tool);
      return;
    }

    await this.pushLiveToolOverlay(tool);
  }

  private getLiveToolSources() {
    return {
      overlaySource: DOCK_LIVE_TOOL_SOURCE,
      videoSource: DOCK_LIVE_TOOL_MEDIA_VIDEO_SOURCE,
      imageSource: DOCK_LIVE_TOOL_MEDIA_IMAGE_SOURCE,
    };
  }

  private buildLiveToolOverlayUrl(tool: LiveToolTemplate): string {
    const payload: LiveToolOverlayPayload = {
      kind: tool.kind,
      label: tool.label,
      title: tool.title,
      subtitle: tool.subtitle,
      body: tool.body,
      cta: tool.cta,
      durationSeconds: tool.durationSeconds,
      backgroundColor: tool.backgroundColor,
      backgroundMediaUrl: tool.backgroundMediaUrl,
      lowerThird: tool.kind === "lower-third",
      timestamp: Date.now(),
    };
    return `${this.getOverlayBaseUrl()}/live-tool-overlay.html#data=${encodeURIComponent(JSON.stringify(payload))}`;
  }

  private async getResolvedLiveToolScene(): Promise<string> {
    const target = await this.getTargetScene();
    if (!target.sceneName) throw new Error("Could not determine the current OBS scene.");
    return target.sceneName;
  }

  private async switchScene(sceneName: string): Promise<void> {
    const studioMode = await this.isStudioModeEnabled();
    if (studioMode) {
      try {
        await this.call("SetStudioModeEnabled", { studioModeEnabled: true });
        await this.sleep(150);
      } catch { /* ignore */ }
      await this.setCurrentPreviewScene(sceneName);
    } else {
      await this.call("SetCurrentProgramScene", { sceneName });
    }
  }

  private async pushLiveToolOverlay(tool: LiveToolTemplate): Promise<void> {
    const sources = this.getLiveToolSources();
    const sceneName = await this.getResolvedLiveToolScene();

    // Ensure the live program scene is visible behind overlays in MCE Presentation
    await this.ensureProgramSceneAsSourceInPresentation();

    await this.hideMediaSourceWithAnimation(sceneName, sources.videoSource);
    await this.hideMediaSourceWithAnimation(sceneName, sources.imageSource);
    await this.ensureOverlaySource(sceneName, sources.overlaySource, undefined, undefined, true);
    await this.setBrowserSourceUrl(sources.overlaySource, this.buildLiveToolOverlayUrl(tool), false);
  }

  private async pushLiveToolMedia(tool: LiveToolTemplate): Promise<void> {
    const sources = this.getLiveToolSources();
    const sceneName = await this.getResolvedLiveToolScene();

    // Ensure the live program scene is visible behind overlays in MCE Presentation
    await this.ensureProgramSceneAsSourceInPresentation();

    const fileName = tool.backgroundMediaName || tool.backgroundMediaPath || tool.label;
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(ext);

    await this.hideOverlaySource(sceneName, sources.overlaySource);
    if (isImage) {
      await this.hideMediaSourceWithAnimation(sceneName, sources.videoSource);
      const sceneItemId = await this._ensureNativeMediaSource(
        sceneName,
        sources.imageSource,
        "image_source",
        { file: tool.backgroundMediaPath },
        true,
      );
      await this.animateMediaSceneItem(sceneName, sceneItemId, "in");
      return;
    }

    await this.hideMediaSourceWithAnimation(sceneName, sources.imageSource);
    const sceneItemId = await this._ensureNativeMediaSource(
      sceneName,
      sources.videoSource,
      "ffmpeg_source",
      {
        local_file: tool.backgroundMediaPath,
        looping: true,
        is_local_file: true,
        restart_on_activate: true,
      },
      true,
    );
    try {
      await this.call("TriggerMediaInputAction", {
        inputName: sources.videoSource,
        mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
      });
    } catch { /* ignore */ }
    await this.animateMediaSceneItem(sceneName, sceneItemId, "in");
  }

  private async runLiveToolSafetyAction(tool: LiveToolTemplate): Promise<void> {
    if (tool.action === "safe-scene" && tool.sceneName) {
      await this.switchScene(tool.sceneName);
      return;
    }

    if (tool.action === "mute-mic" && tool.sourceName) {
      await this.call("SetInputMute", {
        inputName: tool.sourceName,
        inputMuted: true,
      });
      return;
    }

    if (tool.action === "mute-mic") {
      throw new Error("Choose a mic source in the app before using Mute Mic.");
    }

    if (tool.action === "hide-overlays") {
      const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
      const resp = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
      };
      await Promise.all(resp.sceneItems.map(async (item) => {
        if (!item.sourceName.includes("OCS") && !item.sourceName.includes("MCE ") && !item.sourceName.startsWith("⚡ ")) return;
        try {
          await this.call("SetSceneItemEnabled", {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: false,
          });
        } catch { /* ignore */ }
      }));
      return;
    }

    if (tool.action === "safe-scene") {
      throw new Error("Choose a safe OBS scene in the app before using Safe Scene.");
    }

    await this.pushLiveToolOverlay(tool);
  }

  async clearLiveTool(): Promise<void> {
    const sources = this.getLiveToolSources();
    const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
    await this.hideOverlaySource(sceneName, sources.overlaySource);
    await this.hideMediaSourceWithAnimation(sceneName, sources.videoSource);
    await this.hideMediaSourceWithAnimation(sceneName, sources.imageSource);

    // Restore Program scene to what it was before Live Tool was pushed
    await this.restoreProgramSceneBeforePush();
  }

  private isAudioInputCaptureKind(inputKind: string): boolean {
    const kind = inputKind.toLowerCase();
    if (kind.includes("output_capture") || kind.includes("ffmpeg") || kind.includes("browser")) {
      return false;
    }
    return (
      kind.includes("input_capture") ||
      kind.includes("audio_input") ||
      kind.includes("audioinput") ||
      kind === "coreaudio_input_capture" ||
      kind === "wasapi_input_capture" ||
      kind === "pulse_input_capture" ||
      kind === "alsa_input_capture"
    );
  }

  async listAudioInputSources(): Promise<DockAudioInputSource[]> {
    const resp = await this.call("GetInputList") as {
      inputs: Array<{ inputName: string; inputKind: string }>;
    };
    return resp.inputs
      .filter((input) => this.isAudioInputCaptureKind(input.inputKind))
      .filter((input) => !input.inputName.includes("Media Image Audio"))
      .map((input) => ({
        inputName: input.inputName,
        inputKind: input.inputKind,
      }))
      .sort((a, b) => a.inputName.localeCompare(b.inputName));
  }

  async setMediaVideoMuted(muted: boolean): Promise<void> {
    try {
      await this.call("SetInputMute", {
        inputName: "MCE Media - Video",
        inputMuted: muted,
      });
    } catch {
      // The source may not exist yet; the preference will apply on next send.
    }
  }

  async setMediaLooping(looping: boolean): Promise<void> {
    try {
      await this.call("SetInputSettings", {
        inputName: "MCE Media - Video",
        inputSettings: {
          looping,
          restart_on_activate: true,
        },
      });
    } catch {
      // source may not exist yet
    }
  }

  async setMediaPlaybackPaused(paused: boolean): Promise<void> {
    try {
      await this.call("TriggerMediaInputAction", {
        inputName: "MCE Media - Video",
        mediaAction: paused
          ? "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE"
          : "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY",
      });
    } catch {
      // source may not exist yet
    }
  }

  async restartMediaPlayback(): Promise<void> {
    try {
      await this.call("TriggerMediaInputAction", {
        inputName: "MCE Media - Video",
        mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
      });
    } catch {
      // source may not exist yet
    }
  }

  async setMediaFitMode(fitMode: "cover" | "contain" | "stretch"): Promise<void> {
    const { sceneName } = await this.getPresentationTargetScene("media");
    for (const sourceName of ["MCE Media - Video", "MCE Media - Image"]) {
      try {
        const resp = await this.call("GetSceneItemList", { sceneName }) as {
          sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
        };
        const sceneItem = resp.sceneItems.find((item) => item.sourceName === sourceName);
        if (!sceneItem) continue;
        await this.applyMediaFitMode(sceneName, sceneItem.sceneItemId, fitMode);
      } catch {
        // ignore
      }
    }
  }

  private async _ensureSceneInputSource(
    sceneName: string,
    sourceName: string,
    inputKind: string,
    inputSettings: Record<string, unknown>,
    enable: boolean,
  ): Promise<number> {
    let inputExists = false;
    try {
      const inputs = await this.call("GetInputList") as {
        inputs: Array<{ inputName: string; inputKind: string }>;
      };
      const existing = inputs.inputs.find((input) => input.inputName === sourceName);
      if (existing) {
        inputExists = true;
        if (existing.inputKind === inputKind) {
          await this.call("SetInputSettings", {
            inputName: sourceName,
            inputSettings,
          });
        } else {
          try { await this.call("RemoveInput", { inputName: sourceName }); } catch { /* ignore */ }
          inputExists = false;
        }
      }
    } catch { /* ignore */ }

    const resp = await this.call("GetSceneItemList", { sceneName }) as {
      sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
    };
    let sceneItem = resp.sceneItems.find((item) => item.sourceName === sourceName);

    if (!sceneItem) {
      if (inputExists) {
        const created = await this.call("CreateSceneItem", {
          sceneName,
          sourceName,
          sceneItemEnabled: enable,
        }) as { sceneItemId: number };
        sceneItem = { sourceName, sceneItemId: created.sceneItemId };
      } else {
        const created = await this.call("CreateInput", {
          sceneName,
          inputName: sourceName,
          inputKind,
          inputSettings,
          sceneItemEnabled: enable,
        }) as { sceneItemId: number };
        sceneItem = { sourceName, sceneItemId: created.sceneItemId };
      }
    }

    try {
      await this.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: sceneItem.sceneItemId,
        sceneItemEnabled: enable,
      });
    } catch { /* ignore */ }

    return sceneItem.sceneItemId;
  }

  /**
   * Push a media file to OBS using native sources (ffmpeg_source for video,
   * image_source for images) instead of a browser source.
   * @param filePath  Absolute local file path (e.g. ~/Documents/MakeChurchEasy/uploads/video.mp4)
   * @param fileName  Human-readable name for logging
   * @param options   Audio behavior for video mute and image-linked mic/audio input.
   */
  async pushMedia(
    filePath: string,
    fileName: string,
    options: DockMediaSendOptions = {},
  ): Promise<void> {
    const getExtension = (value: string): string => {
      const cleanValue = value.split(/[?#]/)[0].trim();
      return cleanValue.match(/\.([a-z0-9]+)(?:\s+·\s+page(?:\s+\d+(?:\/\d+)?)?)?$/i)?.[1]?.toLowerCase() || "";
    };
    const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];
    const pathExtension = getExtension(filePath);
    const nameExtension = getExtension(fileName);
    const ext = imageExtensions.includes(pathExtension) || ["mp4", "webm", "mov", "mkv", "avi", "m4v"].includes(pathExtension)
      ? pathExtension
      : nameExtension;
    const isImage = imageExtensions.includes(ext);

    const mediaVideoSource = "MCE Media - Video";
    const mediaImageSource = "MCE Media - Image";
    const mediaPatternSource = "MCE Media - Pattern";
    const mediaImageAudioSource = "MCE Media - Image Audio";
    const mediaTextSource = "MCE Media - Text";
    const remoteMediaSource = "MCE Media - Remote";

    const target = await this.getPresentationTargetScene("media");
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("No active scene found in OBS");

    // Ensure the live program scene is visible behind overlays in MCE Presentation
    await this.ensureProgramSceneAsSourceInPresentation();

    // Fade transitions use the browser media source so the old native media can
    // remain underneath while the new page fades in. Cut keeps the native path.
    const mediaSource = isImage ? mediaImageSource : mediaVideoSource;
    const isDocument = Boolean(options.document);
    const hidePromises: Promise<void>[] = [];
    if (options.transition === "fade" && !isDocument) {
      hidePromises.push(this.hideOverlaySource(sceneName, mediaPatternSource).catch(() => { }));
      hidePromises.push(this.hideOverlaySource(sceneName, mediaImageAudioSource).catch(() => { }));
    } else if (isDocument) {
      // Document pages always use the browser overlay. Disable any older
      // native media in one OBS batch instead of animating it out twice.
      hidePromises.push((async () => {
        try {
          const requests = await this._buildHideBatchRequests(sceneName, [
            mediaVideoSource,
            mediaImageSource,
            mediaPatternSource,
            mediaImageAudioSource,
          ]);
          if (requests.length > 0) await this.callBatch(requests);
        } catch { /* stale media sources are optional */ }
      })());
    } else if (isImage) {
      // Switching to image: hide video with animation, just disable the rest
      hidePromises.push(this.hideMediaSourceWithAnimation(sceneName, mediaVideoSource));
      hidePromises.push(this.hideOverlaySource(sceneName, mediaPatternSource).catch(() => { }));
      hidePromises.push(this.hideOverlaySource(sceneName, mediaImageAudioSource).catch(() => { }));
    } else {
      // Switching to video: hide image with animation, just disable the rest
      hidePromises.push(this.hideMediaSourceWithAnimation(sceneName, mediaImageSource));
      hidePromises.push(this.hideOverlaySource(sceneName, mediaPatternSource).catch(() => { }));
      hidePromises.push(this.hideOverlaySource(sceneName, mediaImageAudioSource).catch(() => { }));
      hidePromises.push((async () => {
        try { await this.call("SetInputMute", { inputName: mediaVideoSource, inputMuted: true }); } catch { }
      })());
    }
    await Promise.allSettled(hidePromises);

    if (this.isRemotePresentationSession() || options.transition === "fade" || options.document) {
      if (options.transition !== "fade" && !isDocument) {
        await this.hideMediaSourceWithAnimation(sceneName, mediaVideoSource).catch(() => { });
        await this.hideMediaSourceWithAnimation(sceneName, mediaImageSource).catch(() => { });
        await this.hideOverlaySource(sceneName, mediaImageAudioSource).catch(() => { });
      }

      const mediaUrl = await this.toRemoteServedMediaUrl(filePath, fileName);
      if (!mediaUrl) {
        throw new Error("Could not create a network media URL for remote OBS.");
      }

      const canvas = await this.getCanvasSize();
      const sceneItemId = await this.ensureOverlaySource(
        sceneName,
        remoteMediaSource,
        canvas.width,
        canvas.height,
        true,
      );
      const packet = {
        url: mediaUrl,
        title: fileName,
        isImage,
        fitMode: options.fitMode ?? "cover",
        looping: options.looping ?? true,
        muted: isImage ? true : options.muted ?? true,
        transition: options.transition ?? "cut",
        document: options.document,
        timestamp: Date.now(),
      };
      const overlayUrl = `${this.buildOverlayHtmlUrl("mce-media-overlay.html")}#data=${encodeURIComponent(JSON.stringify(packet))}`;

      // Hash changes are enough for the document overlay to render the next
      // page. Avoid blanking/reloading CEF, which adds visible latency.
      await this.setBrowserSourceUrl(remoteMediaSource, overlayUrl, !isDocument);
      await this.applyMediaFitMode(sceneName, sceneItemId, options.fitMode ?? "cover");

      if (!isImage) {
        try {
          await this.call("SetInputMute", {
            inputName: remoteMediaSource,
            inputMuted: options.muted ?? true,
          });
        } catch { /* ignore */ }
      }

      if (options.transition === "fade") {
        if (!isDocument) {
          await this.sleep(150);
          await Promise.allSettled([
            this.hideMediaSourceWithAnimation(sceneName, mediaVideoSource),
            this.hideMediaSourceWithAnimation(sceneName, mediaImageSource),
          ]);
        }
      } else if (!isDocument) {
        await this.animateMediaSceneItem(sceneName, sceneItemId, "in");
      }

      if (!isDocument) {
        try {
          await this.bringSceneSourceToFront(sceneName, mediaTextSource);
        } catch { /* ignore */ }

        try {
          await this.ensureTickerAboveSource(sceneName, remoteMediaSource);
        } catch { /* ignore */ }
      }

      return;
    }

    if (isImage) {
      const sceneItemId = await this._ensureNativeMediaSource(
        sceneName, mediaImageSource, "image_source",
        { file: filePath },
        true,
      );
      await this.applyMediaFitMode(sceneName, sceneItemId, options.fitMode ?? "cover");

      if (options.imageAudioInputName) {
        try {
          const inputs = await this.call("GetInputList") as {
            inputs: Array<{ inputName: string; inputKind: string }>;
          };
          const audioSource = inputs.inputs.find((i) => i.inputName === options.imageAudioInputName);
          if (audioSource && this.isAudioInputCaptureKind(audioSource.inputKind)) {
            const current = await this.call("GetInputSettings", { inputName: options.imageAudioInputName }) as {
              inputKind?: string;
              inputSettings?: Record<string, unknown>;
            };
            const inputKind = current.inputKind || audioSource.inputKind;
            await this._ensureSceneInputSource(
              sceneName, mediaImageAudioSource, inputKind,
              current.inputSettings || {}, true,
            );
            try {
              await this.call("SetInputMute", { inputName: mediaImageAudioSource, inputMuted: false });
            } catch { /* ignore */ }
          }
        } catch (err) {
          console.warn("[DockOBS] Could not attach image audio input:", err);
          try { await this.hideOverlaySource(sceneName, mediaImageAudioSource); } catch { /* ignore */ }
        }
      } else {
        try { await this.hideOverlaySource(sceneName, mediaImageAudioSource); } catch { /* ignore */ }
      }
      await this.animateMediaSceneItem(sceneName, sceneItemId, "in");
    } else {
      const sceneItemId = await this._ensureNativeMediaSource(
        sceneName, mediaVideoSource, "ffmpeg_source",
        {
          local_file: filePath,
          looping: options.looping ?? true,
          is_local_file: true,
          restart_on_activate: true,
        },
        true,
      );
      await this.applyMediaFitMode(sceneName, sceneItemId, options.fitMode ?? "cover");
      try {
        await this.call("SetInputMute", {
          inputName: mediaVideoSource,
          inputMuted: options.muted ?? true,
        });
      } catch { /* ignore */ }

      try {
        await this.call("TriggerMediaInputAction", {
          inputName: mediaVideoSource,
          mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
        });
      } catch { /* ignore */ }
      await this.animateMediaSceneItem(sceneName, sceneItemId, "in");
    }

    // Bring text overlay above media source
    try {
      await this.bringSceneSourceToFront(sceneName, mediaTextSource);
    } catch { /* ignore */ }

    // Ensure ticker is on top (above text and media)
    try {
      await this.ensureTickerAboveSource(sceneName, mediaSource);
    } catch { /* ignore */ }

  }

  /**
   * Create a VLC Video Source with a playlist and add it to the current preview scene.
   */
  async pushVlcPlaylist(options: {
    sourceName: string;
    playlist: string[];
    loop?: boolean;
    shuffle?: boolean;
    muted?: boolean;
  }): Promise<void> {
    const { sourceName, playlist, loop = true, shuffle = false, muted = true } = options;

    // Get the current scene via clone workflow
    const target = await this.getPresentationTargetScene("media");
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("No active scene found in OBS");

    // Build playlist items for VLC source
    const vlcPlaylist = playlist.map((path) => ({ path, selected: true }));

    // Remove existing VLC source with same name if present
    try {
      const existing = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
      };
      const existingItem = existing.sceneItems.find((i) => i.sourceName === sourceName);
      if (existingItem) {
        await this.call("RemoveSceneItem", { sceneName, sceneItemId: existingItem.sceneItemId });
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch { /* ignore */ }

    // Remove existing input if present
    try {
      await this.call("RemoveInput", { inputName: sourceName });
      await new Promise((r) => setTimeout(r, 100));
    } catch { /* ignore */ }

    // Create VLC Video Source
    await this.call("CreateInput", {
      sceneName,
      inputName: sourceName,
      inputKind: "vlc_source",
      inputSettings: {
        playlist: vlcPlaylist,
        loop,
        shuffle,
        restart_on_activate: true,
        network_caching: 1000,
      },
      sceneItemEnabled: true,
    });

    // Mute if requested
    if (muted) {
      try {
        await this.call("SetInputMute", { inputName: sourceName, inputMuted: true });
      } catch { /* ignore */ }
    }

    // Ensure ticker is on top after source exists
    try {
      await this.ensureTickerAboveSource(sceneName, sourceName);
    } catch { /* ignore */ }

  }

  /**
   * Create a native OBS image_source and rotate through images on a timer.
   *
   * A single image_source is created with the first image; a per-source
   * interval timer updates the file path via SetInputSettings on each tick.
   * If the source already exists it is reused (settings are updated).
   */
  async pushImageSlideshow(options: {
    sourceName: string;
    images: string[];
    loop?: boolean;
    slideTime?: number;
  }): Promise<void> {
    const { sourceName, images, loop = true, slideTime = 3000 } = options;
    if (images.length === 0) return;

    // Stop any existing rotation timer for this source
    this.stopImageSlideshow(sourceName);

    // Get the current scene
    const target = await this.getPresentationTargetScene("media");
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("No active scene found in OBS");

    // Remove existing scene item with same name if present
    try {
      const existing = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
      };
      const existingItem = existing.sceneItems.find((i) => i.sourceName === sourceName);
      if (existingItem) {
        await this.call("RemoveSceneItem", { sceneName, sceneItemId: existingItem.sceneItemId });
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch { /* ignore */ }

    // Remove existing input if present
    try {
      await this.call("RemoveInput", { inputName: sourceName });
      await new Promise((r) => setTimeout(r, 100));
    } catch { /* ignore */ }

    // Create native image_source with the first image
    const createResp = await this.call("CreateInput", {
      sceneName,
      inputName: sourceName,
      inputKind: "image_source",
      inputSettings: { file: images[0] },
      sceneItemEnabled: true,
    }) as { sceneItemId: number };

    // Stretch the image to fill the canvas so it takes full width
    await this.fitSceneItemToCanvas(sceneName, createResp.sceneItemId);

    // Ensure ticker is on top after source exists
    try {
      await this.ensureTickerAboveSource(sceneName, sourceName);
    } catch { /* ignore */ }

    // If only one image, nothing to rotate
    if (images.length === 1 || slideTime <= 0) return;

    // Set up rotation timer
    let currentIndex = 0;
    const timer = setInterval(async () => {
      currentIndex = (currentIndex + 1) % images.length;
      if (!loop && currentIndex === 0) {
        // Reached the end without loop — stop on last image
        this.stopImageSlideshow(sourceName);
        return;
      }
      try {
        await this.call("SetInputSettings", {
          inputName: sourceName,
          inputSettings: { file: images[currentIndex] },
        });
      } catch {
        // Source may have been removed — stop the timer
        this.stopImageSlideshow(sourceName);
      }
    }, slideTime);

    this._slideshowTimers.set(sourceName, timer);
  }

  async addImageSourceToScene(options: {
    sceneName: string;
    sourceName: string;
    filePath: string;
    fitMode?: "cover" | "contain" | "stretch";
  }): Promise<void> {
    const sceneName = options.sceneName.trim();
    const sourceName = options.sourceName.trim();
    const filePath = options.filePath.trim();

    if (!sceneName) throw new Error("Scene name is required");
    if (!sourceName) throw new Error("Source name is required");
    if (!filePath) throw new Error("Image file path is required");

    if (!(await this.hasObsScene(sceneName))) {
      await this.call("CreateScene", { sceneName });
    }

    const sceneItemId = await this._ensureNativeMediaSource(
      sceneName,
      sourceName,
      "image_source",
      { file: filePath },
      true,
    );

    await this.applyMediaFitMode(sceneName, sceneItemId, options.fitMode ?? "cover");

    try {
      await this.ensureTickerAboveSource(sceneName, sourceName);
    } catch {
      // Ignore ticker ordering failures for arbitrary user scenes.
    }
  }

  async addVideoSourceToScene(options: {
    sceneName: string;
    sourceName: string;
    filePath: string;
    fitMode?: "cover" | "contain" | "stretch";
    muted?: boolean;
    looping?: boolean;
  }): Promise<void> {
    const sceneName = options.sceneName.trim();
    const sourceName = options.sourceName.trim();
    const filePath = options.filePath.trim();

    if (!sceneName) throw new Error("Scene name is required");
    if (!sourceName) throw new Error("Source name is required");
    if (!filePath) throw new Error("Video file path is required");

    if (!(await this.hasObsScene(sceneName))) {
      await this.call("CreateScene", { sceneName });
    }

    const sceneItemId = await this._ensureNativeMediaSource(
      sceneName,
      sourceName,
      "ffmpeg_source",
      {
        local_file: filePath,
        looping: options.looping ?? true,
        is_local_file: true,
        restart_on_activate: true,
        close_when_inactive: false,
        clear_on_media_end: false,
      },
      true,
    );

    await this.applyMediaFitMode(sceneName, sceneItemId, options.fitMode ?? "cover");

    try {
      await this.call("SetInputMute", {
        inputName: sourceName,
        inputMuted: options.muted ?? true,
      });
    } catch {
      // Ignore mute failures for arbitrary user scenes.
    }

    try {
      await this.call("TriggerMediaInputAction", {
        inputName: sourceName,
        mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
      });
    } catch {
      // Ignore restart failures for arbitrary user scenes.
    }

    try {
      await this.ensureTickerAboveSource(sceneName, sourceName);
    } catch {
      // Ignore ticker ordering failures for arbitrary user scenes.
    }
  }

  /**
   * Stop a running image-slideshow rotation timer.
   */
  stopImageSlideshow(sourceName: string): void {
    const timer = this._slideshowTimers.get(sourceName);
    if (timer) {
      clearInterval(timer);
      this._slideshowTimers.delete(sourceName);
    }
  }

  /**
   * Stop all running image-slideshow rotation timers.
   */
  stopAllImageSlideshows(): void {
    for (const [, timer] of this._slideshowTimers) {
      clearInterval(timer);
    }
    this._slideshowTimers.clear();
  }

  async pushPatternBackground(patternSrc: string, patternLabel: string): Promise<void> {
    const mediaVideoSource = "MCE Media - Video";
    const mediaImageSource = "MCE Media - Image";
    const mediaPatternSource = "MCE Media - Pattern";
    const mediaTextSource = "MCE Media - Text";

    const target = await this.getPresentationTargetScene("media");
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("No active scene found in OBS");

    // Hide native media sources
    await this.hideMediaSourceWithAnimation(sceneName, mediaVideoSource);
    await this.hideMediaSourceWithAnimation(sceneName, mediaImageSource);
    try { await this.hideOverlaySource(sceneName, "MCE Media - Image Audio"); } catch { /* ignore */ }

    // Ensure pattern browser source exists directly in target scene
    await this.ensureOverlaySource(sceneName, mediaPatternSource, undefined, undefined, true);

    // Ensure ticker is on top after source exists
    try {
      await this.ensureTickerAboveSource(sceneName, mediaPatternSource);
    } catch { /* ignore */ }
    await this.setBrowserSourceUrl(
      mediaPatternSource,
      this.buildMediaPatternUrl(patternSrc, patternLabel),
      true,
    );
    await this.bringSceneSourceToFront(sceneName, mediaPatternSource);
    await this.bringSceneSourceToFront(sceneName, mediaTextSource);

  }

  async setMediaTextOverlay(
    payload: {
      headline: string;
      subline?: string;
      textColor?: string;
      align?: "left" | "center" | "right";
      verticalPos?: "top" | "center" | "bottom";
      headlineSize?: number;
      sublineSize?: number;
      animation?: "none" | "fade" | "fade-up" | "slide-up" | "slide-down" | "zoom";
      animationDuration?: number;
      background?: {
        enabled: boolean;
        mode: "text-only" | "box" | "lower-third" | "fullscreen";
        bgType: "color" | "image" | "pattern";
        color: string;
        opacity: number;
        imageId: string | null;
        patternId: string | null;
        blur: number;
        scale: number;
        radius: number;
        padding: number;
        width?: "full" | "clip";
        imageDataUrl?: string | null;
        patternSvgData?: string | null;
      };
    } | null,
  ): Promise<void> {
    const mediaTextSource = "MCE Media - Text";

    const hasText = Boolean(payload?.headline?.trim() || String(payload?.subline || "").trim());
    const hasBackground = Boolean(payload?.background?.enabled && payload?.background?.mode !== "text-only");
    if (!payload || (!hasText && !hasBackground)) {
      try {
        const target = await this.getPresentationTargetScene("media");
        if (target.sceneName) {
          await this.hideOverlaySource(target.sceneName, mediaTextSource);
        }
      } catch { /* ignore */ }
      return;
    }

    const target = await this.getPresentationTargetScene("media");
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("No active scene found in OBS");

    await this.ensureOverlaySource(sceneName, mediaTextSource, undefined, undefined, true);
    await this.setBrowserSourceUrl(
      mediaTextSource,
      this.buildMediaTextOverlayUrl({
        headline: payload.headline,
        subline: payload.subline,
        textColor: payload.textColor,
        align: payload.align,
        verticalPos: payload.verticalPos,
        headlineSize: payload.headlineSize,
        sublineSize: payload.sublineSize,
        animation: payload.animation,
        animationDuration: payload.animationDuration,
        background: payload.background,
      }),
      true,
    );
    await this.bringSceneSourceToFront(sceneName, mediaTextSource);

    // Ensure ticker is on top (above text overlay)
    try {
      await this.ensureTickerAboveSource(sceneName, mediaTextSource);
    } catch { /* ignore */ }
  }

  /**
   * Create or update a native OBS source (ffmpeg_source or image_source)
   * for the media player, position it fullscreen, and move it to the top.
   *
   * Uses a check-update-or-create pattern instead of destructive remove-recreate
   * to avoid race conditions with shared inputs and timing issues.
   */
  private async _ensureNativeMediaSource(
    sceneName: string,
    sourceName: string,
    inputKind: string,
    inputSettings: Record<string, unknown>,
    enable: boolean,
  ): Promise<number> {
    // Helper: find scene item by source name
    const findSceneItem = async (): Promise<number | null> => {
      try {
        const resp = await this.call("GetSceneItemList", { sceneName }) as {
          sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
        };
        const found = resp.sceneItems.find((i) => i.sourceName === sourceName);
        return found?.sceneItemId ?? null;
      } catch { return null; }
    };

    // Helper: add existing input to scene with retry
    const addInputToScene = async (): Promise<number> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const added = await this.call("CreateSceneItem", {
            sceneName,
            sourceName,
            sceneItemEnabled: enable,
          }) as { sceneItemId: number };
          return added.sceneItemId;
        } catch {
          // OBS may still be processing a recent removal — wait and retry
          await this.sleep(150);
          const found = await findSceneItem();
          if (found !== null) return found;
        }
      }
      throw new Error(`Failed to add or find ${sourceName} in ${sceneName}`);
    };

    // Step 1: Check if the global input already exists anywhere
    let inputExists = false;
    try {
      const inputList = await this.call("GetInputList", {}) as {
        inputs: Array<{ inputName: string }>;
      };
      inputExists = inputList.inputs.some((i) => i.inputName === sourceName);
    } catch { /* ignore */ }

    // Step 2: Check if a scene item for this input exists in the target scene
    let existingSceneItemId = await findSceneItem();

    let sceneItemId: number;

    if (inputExists && existingSceneItemId !== null) {
      // Input exists AND scene item exists — just update settings and enable
      try {
        await this.call("SetInputSettings", {
          inputName: sourceName,
          inputSettings,
        });
      } catch { /* ignore */ }

      sceneItemId = existingSceneItemId;
      try {
        await this.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId,
          sceneItemEnabled: enable,
        });
      } catch { /* ignore */ }
    } else if (inputExists && existingSceneItemId === null) {
      // Input exists globally but not in this scene — update settings and add to scene
      try {
        await this.call("SetInputSettings", {
          inputName: sourceName,
          inputSettings,
        });
      } catch { /* ignore */ }

      sceneItemId = await addInputToScene();
    } else {
      // Input does not exist at all — create both input and scene item
      try {
        const created = await this.call("CreateInput", {
          sceneName,
          inputName: sourceName,
          inputKind,
          inputSettings,
          sceneItemEnabled: enable,
        }) as { sceneItemId: number };
        sceneItemId = created.sceneItemId;
      } catch {
        // Race: input was created between our check and create — find the scene item
        sceneItemId = await addInputToScene();
        try {
          await this.call("SetInputSettings", {
            inputName: sourceName,
            inputSettings,
          });
        } catch { /* ignore */ }
        try {
          await this.call("SetSceneItemEnabled", {
            sceneName,
            sceneItemId,
            sceneItemEnabled: enable,
          });
        } catch { /* ignore */ }
      }
    }

    // Position fullscreen at (0,0); fit mode is applied after source setup.
    try {
      await this.call("SetSceneItemTransform", {
        sceneName,
        sceneItemId,
        sceneItemTransform: {
          positionX: 0,
          positionY: 0,
          scaleX: 1,
          scaleY: 1,
        },
      });
    } catch { /* ignore */ }

    await this.ensureTickerAboveSource(sceneName, sourceName).catch(() => { });

    return sceneItemId;
  }

  private async applyMediaFitMode(
    sceneName: string,
    sceneItemId: number,
    fitMode: "cover" | "contain" | "stretch",
  ): Promise<void> {
    const { width: canvasW, height: canvasH } = await this.getCanvasSize();
    const boundsType =
      fitMode === "contain"
        ? "OBS_BOUNDS_SCALE_INNER"
        : fitMode === "stretch"
          ? "OBS_BOUNDS_STRETCH"
          : "OBS_BOUNDS_SCALE_OUTER";

    await this.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        scaleX: 1,
        scaleY: 1,
        boundsType,
        boundsWidth: canvasW,
        boundsHeight: canvasH,
        boundsAlignment: 0,
      },
    });
  }

  /**
   * Clear media — simply hide all media sources in MCE Presentation.
   */
  async clearMedia(_preserveSourceNames?: string[]): Promise<void> {
    const scene = PRESENTATION_SCENE_NAME;

    // Hide all media sources in MCE Presentation
    await this.hideOverlaySource(scene, "MCE Media - Video").catch(() => { });
    await this.hideOverlaySource(scene, "MCE Media - Image").catch(() => { });
    await this.hideOverlaySource(scene, "MCE Media - Remote").catch(() => { });
    await this.hideOverlaySource(scene, "MCE Media - Pattern").catch(() => { });
    await this.hideOverlaySource(scene, "MCE Media - Image Audio").catch(() => { });
    await this.hideOverlaySource(scene, "MCE Media - Text").catch(() => { });

    // Restore Program scene to what it was before Media was pushed
    await this.restoreProgramSceneBeforePush("media");

  }

  /**
   * Clear the ticker overlay.
   */
  async clearTicker(): Promise<void> {
    const url = this.buildTickerUrl("", "", false, true);
    try { await this.setBrowserSourceUrl(DOCK_TICKER_SOURCE, url); } catch { /* ignore */ }

    try {
      const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
      if (sceneName) {
        await this.hideOverlaySource(sceneName, DOCK_TICKER_SOURCE);
        await this.removeSceneItemBySource(sceneName, DOCK_TICKER_SOURCE);
      }
    } catch { /* ignore */ }

    await this.removeInputIfExists(DOCK_TICKER_SOURCE);

    // Restore Program scene to what it was before Ticker was pushed
    await this.restoreProgramSceneBeforePush("ministry");

  }

  // ═══════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════
  // FULLSCREEN SCENES — now consolidated into MCE Presentation
  // nesting them as overlays into the current scene.
  // ═══════════════════════════════════════════════════════════════════════

  private _fullscreenSceneDefs: Record<string, { sceneName: string; browserSourceName: string; bgSourceName: string; overlayFile: string }> = {
    bible: {
      sceneName: DOCK_PRESENTATION_SCENE,
      browserSourceName: "MCE Browser - Bible",
      bgSourceName: "MCE BG - Bible",
      overlayFile: "mce-bible-overlay.html",
    },
    worship: {
      sceneName: DOCK_PRESENTATION_SCENE,
      browserSourceName: "MCE Browser - Worship",
      bgSourceName: "MCE BG - Worship",
      overlayFile: "mce-worship-overlay.html",
    },
    notes: {
      sceneName: DOCK_PRESENTATION_SCENE,
      browserSourceName: "MCE Browser - Notes",
      bgSourceName: "MCE BG - Notes",
      overlayFile: "mce-note.html",
    },
    countdown: {
      sceneName: DOCK_PRESENTATION_SCENE,
      browserSourceName: "MCE Browser - Countdown",
      bgSourceName: "MCE BG - Countdown",
      overlayFile: "pre-service-countdown.html",
    },
  };

  /**
   * Ensure a fullscreen source exists in MCE Presentation.
   * No longer creates separate scenes — everything lives in MCE Presentation.
   */
  private async _ensureFullscreenScene(key: string): Promise<{ sceneName: string; browserItemId: number }> {
    const def = this._fullscreenSceneDefs[key];
    if (!def) throw new Error(`Unknown fullscreen scene key: ${key}`);

    const canvas = await this.getCanvasSize();
    const overlayUrl = this.buildOverlayHtmlUrl(
      def.overlayFile,
      key === "countdown" ? undefined : { tab: key },
    );
    const sourceSignature = `${overlayUrl}|${canvas.width}x${canvas.height}`;

    // Ensure MCE Presentation exists
    await this.ensurePresentationSceneReady();

    // Ensure browser source exists inside MCE Presentation
    let browserItemId: number | null = null;
    let createdSceneItem = false;
    try {
      let items = await this.getSceneItemListCached(DOCK_PRESENTATION_SCENE);
      const existing = items.find((i) => i.sourceName === def.browserSourceName);
      if (existing) {
        browserItemId = existing.sceneItemId;
        if (this._lastFullscreenSourceSignature[def.browserSourceName] !== sourceSignature) {
          await this.call("SetInputSettings", {
            inputName: def.browserSourceName,
            inputSettings: { url: overlayUrl, width: canvas.width, height: canvas.height, bgcolor: "#00000000", shutdown: false, restart_when_active: false },
          });
          this._lastFullscreenSourceSignature[def.browserSourceName] = sourceSignature;
        }
      }
    } catch { /* empty scene */ }

    if (browserItemId === null) {
      try {
        const created = await this.call("CreateInput", {
          sceneName: DOCK_PRESENTATION_SCENE,
          inputName: def.browserSourceName,
          inputKind: "browser_source",
          inputSettings: { url: overlayUrl, width: canvas.width, height: canvas.height, css: "", bgcolor: "#00000000", shutdown: false, restart_when_active: false },
          sceneItemEnabled: true,
        }) as { sceneItemId: number };
        browserItemId = created.sceneItemId;
        createdSceneItem = true;
        this._lastFullscreenSourceSignature[def.browserSourceName] = sourceSignature;
        this.invalidateSceneItemListCache(DOCK_PRESENTATION_SCENE);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("600")) {
          try {
            const added = await this.call("CreateSceneItem", { sceneName: DOCK_PRESENTATION_SCENE, sourceName: def.browserSourceName, sceneItemEnabled: true }) as { sceneItemId: number };
            browserItemId = added.sceneItemId;
            createdSceneItem = true;
            this._lastFullscreenSourceSignature[def.browserSourceName] = sourceSignature;
            this.invalidateSceneItemListCache(DOCK_PRESENTATION_SCENE);
          } catch {
            const items = await this.getSceneItemListCached(DOCK_PRESENTATION_SCENE);
            const found = items.find((i) => i.sourceName === def.browserSourceName);
            browserItemId = found?.sceneItemId ?? null;
            if (browserItemId !== null) {
              this._lastFullscreenSourceSignature[def.browserSourceName] = sourceSignature;
            }
          }
        } else {
          throw err;
        }
      }
    }

    // Stretch to fill canvas once per source/canvas/item combination.
    if (browserItemId !== null) {
      const sceneItemSignature = `${sourceSignature}|item:${browserItemId}`;
      if (!createdSceneItem && this._lastFullscreenSceneItemSignature[def.browserSourceName] === sceneItemSignature) {
        return { sceneName: DOCK_PRESENTATION_SCENE, browserItemId };
      }
      try {
        if (createdSceneItem) {
          await this.call("SetSceneItemTransform", {
            sceneName: DOCK_PRESENTATION_SCENE,
            sceneItemId: browserItemId,
            sceneItemTransform: {
              positionX: 0,
              positionY: 0,
              scaleX: 1,
              scaleY: 1,
        boundsType: "OBS_BOUNDS_SCALE_OUTER",
              boundsWidth: canvas.width,
              boundsHeight: canvas.height,
              boundsAlignment: 0,
              rotation: 0,
              cropLeft: 0,
              cropTop: 0,
              cropRight: 0,
              cropBottom: 0,
            },
          });
        }
        await this.ensureTickerAboveSource(DOCK_PRESENTATION_SCENE, def.browserSourceName).catch(() => { });
        await this.call("SetSceneItemEnabled", { sceneName: DOCK_PRESENTATION_SCENE, sceneItemId: browserItemId, sceneItemEnabled: true });
        this._lastFullscreenSceneItemSignature[def.browserSourceName] = sceneItemSignature;
      } catch { /* best effort */ }
    }

    if (browserItemId === null) throw new Error(`Failed to ensure browser source: ${def.browserSourceName}`);
    return { sceneName: DOCK_PRESENTATION_SCENE, browserItemId };
  }

  /**
   * Returns true when the theme has a background that can be rendered by a
   * separate OBS source (color_source / image_source / media_source)
   * layered below the browser source. This keeps the background stable
   * while the browser source re-renders on verse navigation.
   *
   * Gradient backgrounds are excluded — they render in browser source CSS
   * since OBS has no native gradient source.
   */
  private _hasSeparateFullscreenBg(
    themeSettings: Record<string, unknown> | null | undefined,
  ): boolean {
    const canvas = getDefaultCanvasSize();
    return Boolean(this._resolveNativeBackgroundSource(themeSettings, canvas));
  }

  // Double-buffer slot tracking: which slot (A or B) is currently active per key.
  // Slot A = bgSourceName, Slot B = bgSourceName + " 2". Swapping avoids
  // destroy-recreate flicker when the background type changes (color → image).
  private _bgActiveSlot: Record<string, "A" | "B"> = {};

  private _bgSourceNames(key: string): { a: string; b: string } {
    const def = this._fullscreenSceneDefs[key];
    if (!def) return { a: "", b: "" };
    return { a: def.bgSourceName, b: `${def.bgSourceName} 2` };
  }

  /**
   * Ensure a persistent background source (color, image, or video) exists in
   * the fullscreen scene, layered below the browser source at index 0. This
   * keeps the background stable while the browser source re-renders on verse
   * navigation — the OBS-native source is never touched during verse changes.
   *
   * Uses double-buffer slots (A/B) so type transitions (color → image, etc.)
   * create the new source first, then swap — zero visible flicker.
   */
  private async _ensureFullscreenBgSource(
    key: string,
    themeSettings: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    const def = this._fullscreenSceneDefs[key];
    if (!def || !themeSettings) return;
    const canvas = await this.getCanvasSize();
    const nativeBg = this._resolveNativeBackgroundSource(themeSettings, canvas);

    // Determine what kind of OBS source we need
    let neededKind: "image_source" | "color_source_v3" | "ffmpeg_source" | "browser_source" | null = null;
    let neededSettings: Record<string, unknown> = {};
    if (nativeBg) {
      neededKind = nativeBg.inputKind;
      neededSettings = nativeBg.inputSettings;
    } else if (this._hasBrowserRenderedBackground(themeSettings)) {
      const { cleanSettings, css } = this.stripThemeDataUris(themeSettings);
      neededKind = "browser_source";
      neededSettings = {
        url: this.buildFullscreenBackgroundUrl(cleanSettings),
        css: css || undefined,
        width: canvas.width,
        height: canvas.height,
        bgcolor: "#00000000",
        shutdown: false,
        restart_when_active: false,
      };
    }

    const bgSignature = neededKind
      ? JSON.stringify({ kind: neededKind, settings: neededSettings })
      : "__hidden__";
    if (this._activeFullscreenBgSignature[key] === bgSignature) {
      return;
    }

    if (!neededKind) {
      await this._hideFullscreenBgSource(key);
      this._activeFullscreenBgSignature[key] = "__hidden__";
      return;
    }

    const names = this._bgSourceNames(key);
    const activeSlot = this._bgActiveSlot[key] || "A";
    const activeName = activeSlot === "A" ? names.a : names.b;
    const inactiveName = activeSlot === "A" ? names.b : names.a;

    // Fetch input list once to check both active and inactive slots (saves a round-trip)
    let inputList: Array<{ inputName: string; inputKind: string }> = [];
    try {
      const inputs = await this.call("GetInputList") as {
        inputs: Array<{ inputName: string; inputKind: string }>;
      };
      inputList = inputs.inputs;
    } catch { /* ignore */ }

    const activeKind = inputList.find((i) => i.inputName === activeName)?.inputKind ?? "";

    // If the active slot already matches the needed type, just update its settings
    if (activeKind === neededKind) {
      await this.call("SetInputSettings", { inputName: activeName, inputSettings: neededSettings }).catch(() => { });
      await this._ensureBgSceneItem(key, activeName, canvas);
      this._activeFullscreenBgSignature[key] = bgSignature;
      return;
    }

    // Type changed (or first time) — create in the inactive slot, then swap.
    // This ensures the old source stays visible until the new one is ready.

    // Create or update the inactive slot with the new type
    let inactiveKind = inputList.find((i) => i.inputName === inactiveName)?.inputKind ?? "";

    // If inactive slot has a different kind, destroy it first
    if (inactiveKind && inactiveKind !== neededKind) {
      await this._destroyBgInput(key, inactiveName);
      inactiveKind = "";
    }

    if (!inactiveKind) {
      await this.call("CreateInput", {
        inputName: inactiveName,
        inputKind: neededKind,
        inputSettings: neededSettings,
        sceneName: def.sceneName,
      }).catch(() => { });
    } else {
      await this.call("SetInputSettings", { inputName: inactiveName, inputSettings: neededSettings }).catch(() => { });
    }

    // Ensure the inactive slot is in the scene at index 0
    await this._ensureBgSceneItem(key, inactiveName, canvas);

    // Hide the old active slot
    await this._hideBgSceneItem(key, activeName);

    // Swap
    this._bgActiveSlot[key] = activeSlot === "A" ? "B" : "A";
    this._activeFullscreenBgSignature[key] = bgSignature;
  }

  /** Ensure a BG source is in the fullscreen scene at index 0 (below browser). */
  private async _ensureBgSceneItem(
    key: string,
    sourceName: string,
    canvas: { width: number; height: number },
  ): Promise<void> {
    const def = this._fullscreenSceneDefs[key];
    if (!def) return;
    try {
      const resp = await this.call("GetSceneItemList", { sceneName: def.sceneName }) as {
        sceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex: number }>;
      };
      let bgItemId = resp.sceneItems.find((i) => i.sourceName === sourceName)?.sceneItemId;

      if (bgItemId === undefined) {
        const created = await this.call("CreateSceneItem", {
          sceneName: def.sceneName,
          sourceName,
          sceneItemEnabled: true,
        }) as { sceneItemId: number };
        bgItemId = created.sceneItemId;
      }

      await this.call("SetSceneItemTransform", {
        sceneName: def.sceneName,
        sceneItemId: bgItemId,
        positionX: 0, positionY: 0,
        boundsType: "OBS_BOUNDS_SCALE_OUTER",
        boundsWidth: canvas.width, boundsHeight: canvas.height,
        boundsAlignment: 0, rotation: 0,
      });
      await this.call("SetSceneItemIndex", { sceneName: def.sceneName, sceneItemId: bgItemId, sceneItemIndex: 0 });
      await this.call("SetSceneItemEnabled", { sceneName: def.sceneName, sceneItemId: bgItemId, sceneItemEnabled: true });
    } catch { /* best effort */ }
  }

  /** Hide a BG source's scene item (disable visibility). Uses cached scene item list. */
  private async _hideBgSceneItem(key: string, sourceName: string): Promise<void> {
    const def = this._fullscreenSceneDefs[key];
    if (!def) return;
    try {
      const items = await this.getSceneItemListCached(def.sceneName);
      const item = items.find((i) => i.sourceName === sourceName);
      if (item) {
        await this.call("SetSceneItemEnabled", { sceneName: def.sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: false }).catch(() => { });
      }
    } catch { /* ignore */ }
  }

  /** Destroy an OBS input by name (remove scene item first, then the input). Uses cached scene item list. */
  private async _destroyBgInput(_key: string, inputName: string): Promise<void> {
    const def = this._fullscreenSceneDefs[_key];
    if (!def) return;
    try {
      const items = await this.getSceneItemListCached(def.sceneName);
      const item = items.find((i) => i.sourceName === inputName);
      if (item) {
        await this.call("RemoveSceneItem", { sceneName: def.sceneName, sceneItemId: item.sceneItemId }).catch(() => { });
      }
    } catch { /* ignore */ }
    await this.call("RemoveInput", { inputName }).catch(() => { });
  }

  /** Hide all BG sources for a key (both double-buffer slots). */
  private async _hideFullscreenBgSource(key: string): Promise<void> {
    if (this._activeFullscreenBgSignature[key] === "__hidden__") return;
    const names = this._bgSourceNames(key);
    await this._hideBgSceneItem(key, names.a);
    await this._hideBgSceneItem(key, names.b);
    this._activeFullscreenBgSignature[key] = "__hidden__";
  }

  // ── Lower-third persistent BG (reuses double-buffer pattern) ──

  private _ltBgActiveSlot: Record<string, "A" | "B"> = {};

  private _ltBgNames(sceneName: string): { a: string; b: string } {
    const safeSceneName = sceneName.replace(/\s+/g, " ").trim();
    return {
      a: `MCE BG - ${safeSceneName}`,
      b: `MCE BG - ${safeSceneName} 2`,
    };
  }

  /**
   * Ensure a persistent background source for the lower-third dedicated
   * scene, layered below the browser source. Same double-buffer approach
   * as the fullscreen variant.
   */
  private async _ensureLowerThirdBgSource(
    sceneName: string,
    themeSettings: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    if (!themeSettings) return;

    // Fast path: if the background theme hasn't changed since last push, skip all OBS calls
    const bgSig = JSON.stringify(themeSettings);
    if (this._activeLtBgSignature[sceneName] === bgSig) {
      return;
    }

    const canvas = await this.getCanvasSize();
    let neededKind: "image_source" | "color_source_v3" | "ffmpeg_source" | "browser_source" | null = null;
    let neededSettings: Record<string, unknown> = {};
    const nativeBg = this._resolveNativeBackgroundSource(themeSettings, canvas);
    if (nativeBg) {
      neededKind = nativeBg.inputKind;
      neededSettings = nativeBg.inputSettings;
    } else if (this._hasBrowserRenderedBackground(themeSettings)) {
      const { cleanSettings, css } = this.stripThemeDataUris(themeSettings);
      neededKind = "browser_source";
      neededSettings = {
        url: this.buildFullscreenBackgroundUrl(cleanSettings),
        css: css || undefined,
      };
    }

    if (!neededKind) {
      await this._hideLowerThirdBgSource(sceneName);
      return;
    }

    const names = this._ltBgNames(sceneName);
    const activeSlot = this._ltBgActiveSlot[sceneName] || "A";
    const activeName = activeSlot === "A" ? names.a : names.b;
    const inactiveName = activeSlot === "A" ? names.b : names.a;

    // Fetch input list once to check both slots (saves a round-trip)
    let inputList: Array<{ inputName: string; inputKind: string }> = [];
    try {
      const inputs = await this.call("GetInputList") as { inputs: Array<{ inputName: string; inputKind: string }> };
      inputList = inputs.inputs;
    } catch { /* ignore */ }

    const activeKind = inputList.find((i) => i.inputName === activeName)?.inputKind ?? "";

    if (activeKind === neededKind) {
      await this.call("SetInputSettings", { inputName: activeName, inputSettings: neededSettings }).catch(() => { });
      await this._ensureSceneBgItem(sceneName, activeName, canvas);
      this._activeLtBgSignature[sceneName] = bgSig;
      this._activeLtBgInputKind[sceneName] = neededKind;
      return;
    }

    // Type changed — create in inactive slot, then swap
    let inactiveKind = inputList.find((i) => i.inputName === inactiveName)?.inputKind ?? "";

    if (inactiveKind && inactiveKind !== neededKind) {
      await this._destroyBgInputByName(sceneName, inactiveName);
      inactiveKind = "";
    }

    if (!inactiveKind) {
      await this.call("CreateInput", { inputName: inactiveName, inputKind: neededKind, inputSettings: neededSettings, sceneName }).catch(() => { });
    } else {
      await this.call("SetInputSettings", { inputName: inactiveName, inputSettings: neededSettings }).catch(() => { });
    }

    await this._ensureSceneBgItem(sceneName, inactiveName, canvas);
    await this._hideSceneBgItem(sceneName, activeName);
    this._ltBgActiveSlot[sceneName] = activeSlot === "A" ? "B" : "A";
    this._activeLtBgSignature[sceneName] = bgSig;
    this._activeLtBgInputKind[sceneName] = neededKind;
  }

  /** Hide all lower-third BG sources (both double-buffer slots). */
  private async _hideLowerThirdBgSource(sceneName: string): Promise<void> {
    if (this._activeLtBgSignature[sceneName] === "__hidden__") return;
    this._activeLtBgSignature[sceneName] = "__hidden__";
    this._activeLtBgInputKind[sceneName] = "";
    const names = this._ltBgNames(sceneName);
    await this._hideSceneBgItem(sceneName, names.a);
    await this._hideSceneBgItem(sceneName, names.b);
  }

  /** Ensure a BG source is in the given scene at index 0. */
  private async _ensureSceneBgItem(
    sceneName: string,
    sourceName: string,
    canvas: { width: number; height: number },
  ): Promise<void> {
    try {
      let items = await this.getSceneItemListCached(sceneName);
      let bgItemId = items.find((i) => i.sourceName === sourceName)?.sceneItemId;

      if (bgItemId === undefined) {
        const created = await this.call("CreateSceneItem", { sceneName, sourceName, sceneItemEnabled: true }) as { sceneItemId: number };
        bgItemId = created.sceneItemId;
        this.invalidateSceneItemListCache(sceneName);
      }

      await this.call("SetSceneItemTransform", {
        sceneName, sceneItemId: bgItemId,
        positionX: 0, positionY: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth: canvas.width, boundsHeight: canvas.height,
        boundsAlignment: 0, rotation: 0,
      });
      await this.call("SetSceneItemIndex", { sceneName, sceneItemId: bgItemId, sceneItemIndex: 0 });
      await this.call("SetSceneItemEnabled", { sceneName, sceneItemId: bgItemId, sceneItemEnabled: true });

      this._lastBgItemState[sceneName] = { sourceName, itemId: bgItemId, width: canvas.width, height: canvas.height };
    } catch { /* best effort */ }
  }

  /** Hide a BG scene item by source name. Uses cached scene item list. */
  private async _hideSceneBgItem(sceneName: string, sourceName: string): Promise<void> {
    try {
      const items = await this.getSceneItemListCached(sceneName);
      const item = items.find((i) => i.sourceName === sourceName);
      if (item) {
        await this.call("SetSceneItemEnabled", { sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: false }).catch(() => { });
      }
    } catch { /* ignore */ }
  }

  /** Destroy an OBS input by name within a scene. Uses cached scene item list. */
  private async _destroyBgInputByName(sceneName: string, inputName: string): Promise<void> {
    try {
      const items = await this.getSceneItemListCached(sceneName);
      const item = items.find((i) => i.sourceName === inputName);
      if (item) {
        await this.call("RemoveSceneItem", { sceneName, sceneItemId: item.sceneItemId }).catch(() => { });
      }
    } catch { /* ignore */ }
    await this.call("RemoveInput", { inputName }).catch(() => { });
  }

  async showFullscreenScene(key: string, css?: string): Promise<void> {
    await this._ensureFullscreenScene(key);
    const def = this._fullscreenSceneDefs[key];

    if (css) {
      await this.call("SetInputSettings", { inputName: def.browserSourceName, inputSettings: { css } });
    }

    const studioMode = await this.call("GetStudioModeEnabled").then((r: unknown) => (r as { studioModeEnabled: boolean }).studioModeEnabled).catch(() => false);
    if (studioMode) {
      await this.call("SetCurrentPreviewScene", { sceneName: def.sceneName });
    } else {
      await this.call("SetCurrentProgramScene", { sceneName: def.sceneName });
    }
  }

  async hideFullscreenScene(_key: string): Promise<void> {
    const scenes = await this.getObsSceneNames();
    const fallback = scenes.find((s) => !s.startsWith("MCE -") && !s.startsWith("VC -"));
    if (!fallback) return;

    const studioMode = await this.call("GetStudioModeEnabled").then((r: unknown) => (r as { studioModeEnabled: boolean }).studioModeEnabled).catch(() => false);
    if (studioMode) {
      await this.call("SetCurrentPreviewScene", { sceneName: fallback });
    } else {
      await this.call("SetCurrentProgramScene", { sceneName: fallback });
    }
  }

  async isFullscreenSceneActive(key: string): Promise<boolean> {
    const def = this._fullscreenSceneDefs[key];
    const scenes = await this.getObsSceneNames();
    if (!scenes.includes(def.sceneName)) return false;

    const studioMode = await this.call("GetStudioModeEnabled").then((r: unknown) => (r as { studioModeEnabled: boolean }).studioModeEnabled).catch(() => false);
    try {
      if (studioMode) {
        const resp = await this.call("GetCurrentPreviewScene") as { currentPreviewSceneName: string; sceneName?: string };
        return (resp.currentPreviewSceneName || resp.sceneName || "") === def.sceneName;
      } else {
        const resp = await this.call("GetCurrentProgramScene") as { currentProgramSceneName: string; sceneName?: string };
        return (resp.currentProgramSceneName || resp.sceneName || "") === def.sceneName;
      }
    } catch {
      return false;
    }
  }

  async updateFullscreenSceneContent(key: string, css: string): Promise<void> {
    await this._ensureFullscreenScene(key);
    const def = this._fullscreenSceneDefs[key];
    await this.call("SetInputSettings", { inputName: def.browserSourceName, inputSettings: { css } });
  }
}

export const dockObsClient = new DockObsClient();
