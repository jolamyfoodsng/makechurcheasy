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
import { stripCompatModeCSS } from "../services/performanceManager";
import * as connTracker from "../services/obsConnectionTracker";
import * as obsQueue from "../services/obsRequestQueue";
import * as browserQueue from "../services/browserUpdateQueue";
import { ALL_THEMES, type ThemeLike } from "../lowerthirds/themes";
import { getWorshipLTFavorites } from "../services/favoriteThemes";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import { getMinistryData, buildSpeakerRoleMap } from "../services/ministryStore";
import { PRESENTATION_SCENE_NAME, PROGRAM_SCENE_SOURCE_NAME, SOURCE_NAMES, BG_SOURCE_NAMES, FULLSCREEN_SOURCE_NAMES, FULLSCREEN_BG_SOURCE_NAMES } from "../services/PresentationSceneManager";
import type { DockLiveThemeOverrides } from "./dockConsoleTheme";
import {
  DOCK_PREVIEW_STAGE_SUFFIX,
  normalizeDockStageBaseScene,
} from "../services/dockSceneNames";
import type { LiveToolOverlayPayload, LiveToolTemplate } from "../live-tools/types";
import { loadProjectionSettings } from "./dockProjectionSettings";

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

export interface DockAudioInputSource {
  inputName: string;
  inputKind: string;
}

export interface DockMediaSendOptions {
  muted?: boolean;
  imageAudioInputName?: string | null;
  looping?: boolean;
  fitMode?: "cover" | "contain" | "stretch";
}

interface DockPreviewSceneState {
  previewSceneName: string;
  originalSceneName: string;
  overlayType: string;
  createdAt: number;
  updatedAt: number;
}

/** Tab-specific preview scene identifiers */
export type DockPreviewTab = "bible" | "worship" | "announcements" | "media" | "multiview" | "ai" | "ministry" | "lower-third";

/** All tabs now use the single MCE Presentation scene for preview */
const TAB_PREVIEW_SCENE_NAMES: Record<DockPreviewTab, string> = {
  bible: "MCE Presentation",
  worship: "MCE Presentation",
  announcements: "MCE Presentation",
  media: "MCE Presentation",
  multiview: "MCE Presentation",
  ai: "MCE Presentation",
  ministry: "MCE Presentation",
  "lower-third": "MCE Presentation",
};

/** Source names the dock creates as overlays in the user's scenes */
const DOCK_LT_SOURCE = "MCE Lower Third";
const DOCK_ANIMATED_LT_SOURCE = "MCE Animated Lower Thirds";
const DOCK_WORSHIP_SOURCE = "MCE Worship Lyrics";
const DOCK_ANNOUNCEMENT_SOURCE = "MCE Announcement";
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

interface DockResourceNames {
  ltSource: string;
  animatedLtSource: string;
  worshipSource: string;
  announcementSource: string;
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
  announcementSource: DOCK_ANNOUNCEMENT_SOURCE,
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
  private obs = new OBSWebSocket();
  private _status: DockObsStatus = "disconnected";
  private _error = "";
  private listeners = new Set<StatusCallback>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connectPromise: Promise<void> | null = null;
  private _reconnectAttempts = 0;
  private _url = getDefaultOBSUrl();
  private _password: string | undefined;
  /** Track last overlay mode per source so we can force-reload when switching HTML files */
  private _lastOverlayMode: Record<string, string> = {};
  /** Last overlay mode for the unified Bible source ("fullscreen" | "lower-third") */
  private _lastBibleMode: string = "";
  /** Guard: only the current OBS instance can change status */
  private _obsGeneration = 0;
  private static readonly CLONE_PREFIX = "_OVMR_Preview_";
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
  private _lastAnnouncementPushSignature = "";
  private _announcementInitialized = false;
  private _announcementCssOverlayBootstrapped = false;
  /** Skip clearAllOverlays on verse-to-verse transitions within the same mode */
  private _bibleLtInitialized = false;
  /** Skip clearAllOverlays on slide-to-slide transitions within the same mode (worship) */
  private _worshipInitialized = false;
  /** Skip SetInputSettings on slide-to-slide transitions to avoid OBS CEF reload */
  private _worshipCssOverlayBootstrapped = false;
  /** Short-lived cache for GetSceneItemList results to avoid redundant round-trips within a single operation */
  private _sceneItemListCache: { sceneName: string; items: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex?: number }>; expiresAt: number } | null = null;
  /** Cache the program scene name; OBS scene-change events keep it fresh. */
  private _programSceneCache: { name: string; expiresAt: number } | null = null;
  /** Short-lived cache for canvas size to avoid redundant GetVideoSettings calls within a single push */
  private _canvasCache: { size: { width: number; height: number }; expiresAt: number } | null = null;
  /** Known scene names from OBS, updated on scene list/create/delete to avoid repeated GetSceneList calls */
  private _knownScenes: Set<string> = new Set();
  /** Skip ensureProgramSceneAsSourceInPresentation when the program scene hasn't changed */
  private _presentationProgramScene = "";
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

  get status() { return this._status; }
  get isConnected() { return this._status === "connected"; }
  get error() { return this._error; }
  get url() { return this._url; }

  constructor() {
    // Load branding settings from dock JSON file (fire-and-forget)
    this._loadBranding();
    this._previewSceneState = this.loadPreviewSceneState();
    this.loadTabPreviewSceneStatesFromStorage();
  }

  private resetObsStateCaches(): void {
    this._sceneItemListCache = null;
    this._programSceneCache = null;
    this._canvasCache = null;
    this._knownScenes.clear();
    this._presentationProgramScene = "";
    this._lastBrowserSourceUrlBySource = {};
    this._lastFullscreenSourceSignature = {};
    this._lastFullscreenSceneItemSignature = {};
    this._lastCssOverlayPacketBySource = {};
    this._lastCssOverlayBaseUrlBySource = {};
    this._lastCssOverlayThemeCssBySource = {};
    this._lastBiblePushSignature = "";
    this._lastBibleFullscreenSetupSignature = "";
    this._activeFullscreenBgSignature = {};
    this._activeMceOverlayStateByScene = {};
    this._activeLtBgSignature = {};
    this._activeLtBgInputKind = {};
    this._bibleLtInitialized = false;
    this._worshipInitialized = false;
    this._worshipCssOverlayBootstrapped = false;
    this._announcementInitialized = false;
    this._announcementCssOverlayBootstrapped = false;
    this._announcementMutationTail = Promise.resolve();
    this._announcementMutationCounter = 0;
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
      this._url = url;
      this._password = password;
      return;
    }

    // 1. URL query params
    try {
      const params = new URLSearchParams(window.location.search);
      const qUrl = params.get("obsUrl");
      const qPw = params.get("obsPassword");
      if (qUrl) {
        this._url = qUrl;
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
          this._url = p.url;
          this._password = p.password || undefined;
          return;
        }
      }
    } catch { /* ignore */ }

    // 3. localStorage mv-settings (legacy multiview store)
    try {
      const stored = localStorage.getItem("mv-settings");
      if (stored) {
        const s = JSON.parse(stored);
        if (s.obsUrl) {
          this._url = s.obsUrl;
          this._password = s.obsPassword || undefined;
          return;
        }
      }
    } catch { /* ignore */ }

    // 4. Default
    this._url = getDefaultOBSUrl();
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

  async connect(url?: string, password?: string, forceReconnect = false) {
    const previousUrl = this._url;
    const previousPassword = this._password;
    this.resolveParams(url, password);
    const explicitParamsChanged = Boolean(url) &&
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
          this._presentationProgramScene = "";
          this._lastBibleFullscreenSetupSignature = "";
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
        await this.ensureDedicatedScene(DOCK_PRESENTATION_SCENE).catch((err) => {
          console.warn(`[DockOBS] Failed to pre-create "${DOCK_PRESENTATION_SCENE}":`, err);
        });

        // Persist connection params so auto-reconnect works across dock reloads
        this.persistParams();
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
    this.resetObsStateCaches();
    await this.deleteClone().catch(() => { });
    try { await this.obs.disconnect(); } catch { /* ignore */ }
    connTracker.unregister("dock-cef");
    this.setStatus("disconnected");
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
        await this.connect(this._url, this._password, true);
      }
    }, delay);
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
      return await obsQueue.enqueue(
        requestType,
        () => this.obs.call(requestType as never, requestData as never),
        { dedupeKey: requestData?.sceneName ? `${requestType}:${requestData.sceneName}` : undefined }
      );
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
    try {
      await this.call("SetSceneItemTransform", {
        sceneName,
        sceneItemId,
        sceneItemTransform: {
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
        },
      });
    } catch { /* ignore — transform is best-effort */ }
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
    const resp = await this.call("GetSceneItemList", { sceneName }) as {
      sceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex: number; sceneItemEnabled: boolean }>;
    };
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
    themeSettings: Record<string, unknown> | null,
  ): string {
    const def = this._fullscreenSceneDefs["bible"];
    const canvas = this._canvasCache?.size ?? getDefaultCanvasSize();
    const nativeBg = this._resolveNativeBackgroundSource(themeSettings, canvas);
    return JSON.stringify({
      sceneName,
      currentProgramSceneBeforeTarget,
      browserSourceName: def.browserSourceName,
      overlayFile: def.overlayFile,
      nativeBg: nativeBg
        ? { inputKind: nativeBg.inputKind, inputSettings: nativeBg.inputSettings }
        : null,
    });
  }

  private buildWorshipPushSignature(
    sceneName: string,
    data: {
      sectionText: string;
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
      sectionText: data.sectionText,
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
      const items = await this.getSceneItemListCached(sceneName);
      const item = items.find((entry) => entry.sourceName === sourceName);
      if (!item) return;

      const topIndex = Math.max(0, items.length - 1);
      if ((item as { sceneItemIndex?: number }).sceneItemIndex === topIndex) return;

      await this.call("SetSceneItemIndex", {
        sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemIndex: topIndex,
      });
    } catch {
      // Ignore ordering failures for optional overlay sources.
    }
  }

  /**
   * Ensure the ticker source stays above the given source in the scene.
   * If a ticker exists, move it to the top and place the other source just below it.
   * If no ticker exists, move the source to the top as normal.
   */
  private async ensureTickerAboveSource(sceneName: string, sourceName: string): Promise<void> {
    try {
      // Invalidate cache so we get fresh indices after prior mutations
      this.invalidateSceneItemListCache(sceneName);
      const items = await this.getSceneItemListCached(sceneName);
      const item = items.find((i) => i.sourceName === sourceName);
      const tickerItem = items.find((i) => i.sourceName === DOCK_TICKER_SOURCE);
      const topIndex = Math.max(0, items.length - 1);
      const priority = this.readTickerLayerPriority();

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

      if (priority === "ticker-above") {
        if (!item) return;
        if (tickerItem.sceneItemIndex !== topIndex) {
          await this.call("SetSceneItemIndex", {
            sceneName,
            sceneItemId: tickerItem.sceneItemId,
            sceneItemIndex: topIndex,
          }).catch(() => { });
        }
        if (item.sceneItemId === tickerItem.sceneItemId) return;
        const targetIndex = Math.max(0, topIndex - 1);
        if (item.sceneItemIndex !== targetIndex) {
          await this.call("SetSceneItemIndex", {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemIndex: targetIndex,
          }).catch(() => { });
        }
        return;
      }

      const foregroundItems = items.filter((entry) => (
        entry.sourceName !== DOCK_TICKER_SOURCE &&
        entry.sceneItemEnabled !== false &&
        this.isManagedForegroundSourceName(entry.sourceName)
      ));
      const anchor = sourceName && sourceName !== DOCK_TICKER_SOURCE
        ? item
        : foregroundItems.sort((a, b) => (b.sceneItemIndex ?? 0) - (a.sceneItemIndex ?? 0))[0];

      if (!anchor) {
        if (tickerItem.sceneItemIndex !== topIndex) {
          await this.call("SetSceneItemIndex", {
            sceneName,
            sceneItemId: tickerItem.sceneItemId,
            sceneItemIndex: topIndex,
          }).catch(() => { });
        }
        return;
      }

      if (anchor.sceneItemIndex !== topIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId: anchor.sceneItemId,
          sceneItemIndex: topIndex,
        }).catch(() => { });
      }

      const targetTickerIndex = Math.max(0, topIndex - 1);
      if (tickerItem.sceneItemIndex !== targetTickerIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId: tickerItem.sceneItemId,
          sceneItemIndex: targetTickerIndex,
        }).catch(() => { });
      }
    } catch { /* ignore ordering failures */ }
  }

  private isManagedForegroundSourceName(sourceName: string): boolean {
    return (
      this.isManagedMceOverlaySourceName(sourceName) &&
      sourceName !== DOCK_TICKER_SOURCE &&
      sourceName !== PRESENTATION_SCENE_NAME &&
      sourceName !== PROGRAM_SCENE_SOURCE_NAME &&
      !sourceName.startsWith("MCE BG - ") &&
      !sourceName.startsWith(DOCK_FS_TARGET_BG_PREFIX)
    );
  }

  private getKnownMceOverlaySourceNames(resources: DockResourceNames = DOCK_RESOURCES): Set<string> {
    const names = new Set<string>([
      ...Object.values(SOURCE_NAMES),
      ...Object.values(BG_SOURCE_NAMES),
      ...Object.values(FULLSCREEN_SOURCE_NAMES),
      ...Object.values(FULLSCREEN_BG_SOURCE_NAMES),
      resources.ltSource,
      resources.animatedLtSource,
      resources.worshipSource,
      resources.tickerSource,
      resources.mediaVideoSource,
      resources.mediaImageSource,
      resources.mediaImageAudioSource,
      resources.mediaPatternSource,
      resources.mediaTextSource,
      resources.fsBgSource,
      DOCK_LIVE_TOOL_SOURCE,
      DOCK_LIVE_TOOL_MEDIA_VIDEO_SOURCE,
      DOCK_LIVE_TOOL_MEDIA_IMAGE_SOURCE,
      "MCE Media - Video",
      "MCE Media - Image",
      "MCE Media - Pattern",
      "MCE Media - Image Audio",
      "MCE Media - Text",
    ]);

    for (const def of Object.values(this._fullscreenSceneDefs)) {
      names.add(def.browserSourceName);
      names.add(def.bgSourceName);
      names.add(`${def.bgSourceName} 2`);
    }

    return names;
  }

  private isManagedMceOverlaySourceName(
    sourceName: string,
    resources: DockResourceNames = DOCK_RESOURCES,
  ): boolean {
    const name = sourceName.trim();
    if (!name) return false;
    if (name === PRESENTATION_SCENE_NAME || name === PROGRAM_SCENE_SOURCE_NAME) return false;
    if (this.getKnownMceOverlaySourceNames(resources).has(name)) return true;
    return (
      name.startsWith(`${resources.fsTargetBgPrefix} - `) ||
      name.startsWith("MCE Browser - ") ||
      name.startsWith("MCE BG - ") ||
      name.startsWith("MCE Fullscreen ") ||
      name.startsWith("MCE Lower Third") ||
      name.startsWith("MCE Animated Lower Thirds") ||
      name.startsWith("MCE Worship Lyrics") ||
      name.startsWith("MCE Announcement") ||
      name.startsWith("MCE Bible") ||
      name.startsWith("MCE Media ") ||
      name.startsWith("MCE Media - ") ||
      name.startsWith("MCE Live Tools") ||
      name.startsWith("MCE Ticker")
    );
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
    const stateSignature = JSON.stringify({
      primary,
      keep: Array.from(keepSet).sort(),
    });

    // Always ensure ticker is positioned correctly, even if overlay state
    // hasn't changed (e.g., another tab reordered scene items).
    await this.ensureTickerAboveSource(sceneName, primary).catch(() => {});

    if (this._activeMceOverlayStateByScene[sceneName] === stateSignature) return;

    let changedVisibility = false;
    const requests: Array<{ requestType: string; requestData: Record<string, unknown> }> = [];
    const items = await this.getSceneItemListCached(sceneName);

    for (const item of items) {
      const shouldKeep = keepSet.has(item.sourceName);
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

      if (!shouldKeep && this.isManagedMceOverlaySourceName(item.sourceName, resources) && item.sceneItemEnabled !== false) {
        requests.push({
          requestType: "SetSceneItemEnabled",
          requestData: {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: false,
          },
        });
        changedVisibility = true;
      }
    }

    if (requests.length > 0) {
      await this.callBatch(requests, 2).catch(() => { });
    }
    if (changedVisibility) this.invalidateSceneItemListCache(sceneName);

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
   * Fade out every visible scene item in `sceneName` to opacity 0, then disable them.
   * Used by multiview clear to animate the entire scene out before removal.
   */
  async fadeOutAllSceneItems(sceneName: string, durationMs = 300): Promise<void> {
    let items: Array<{ sceneItemId: number; sourceName: string; sceneItemEnabled: boolean }> = [];
    try {
      const resp = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sceneItemId: number; sourceName: string; sceneItemEnabled: boolean }>;
      };
      items = (resp.sceneItems ?? []).filter((i) => i.sceneItemEnabled);
    } catch { /* scene may not exist */ }

    if (items.length === 0) return;

    const steps = 12;
    const stepDelay = durationMs / steps;
    const filterName = "__dock_fade_out";

    for (const item of items) {
      try {
        await this.call("CreateSourceFilter", {
          sourceName: item.sourceName,
          filterName,
          filterKind: "color_filter_v2",
          filterSettings: { opacity: 1.0 },
        });
      } catch {
        try {
          await this.call("SetSourceFilterSettings", {
            sourceName: item.sourceName,
            filterName,
            filterSettings: { opacity: 1.0 },
          });
        } catch { /* ignore */ }
      }
    }

    for (let step = 1; step <= steps; step++) {
      const opacity = Math.max(0, 1 - step / steps);
      await Promise.all(items.map(async (item) => {
        try {
          await this.call("SetSourceFilterSettings", {
            sourceName: item.sourceName,
            filterName,
            filterSettings: { opacity },
          });
        } catch { /* ignore */ }
      }));
      if (step < steps) await this.sleep(stepDelay);
    }

    await Promise.all(items.map(async (item) => {
      try {
        await this.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: false,
        });
      } catch { /* ignore */ }
      try {
        await this.call("RemoveSourceFilter", { sourceName: item.sourceName, filterName });
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
    if (!sceneName) return;
    const key = tabId || "__global__";
    this._programSceneBeforePush.set(key, sceneName);
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

    // In "Don't Clone" mode, clean up the embedded MCE Presentation from Program
    if (this.readSceneMode() === "no-clone") {
      const currentScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (currentScene) {
        await this.removeMCEPresentationFromScene(currentScene);
      }
    }

    const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
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

  /**
   * Route OBS output to MCE Presentation without creating a circular scene graph.
   *
   * Fullscreen dock flows render inside MCE Presentation with the prior Program
   * scene nested behind the overlay. To make that visible, switch OBS to
   * MCE Presentation directly instead of nesting Presentation back into Program.
   */
  private async promotePresentationScene(tabId?: DockPreviewTab): Promise<void> {
    await this.ensureDedicatedScene(DOCK_PRESENTATION_SCENE);

    const studioMode = await this.isStudioModeEnabled().catch(() => false);
    const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");

    if (currentProgramScene && currentProgramScene !== DOCK_PRESENTATION_SCENE) {
      this.rememberUserScene(currentProgramScene, tabId);
    }

    if (studioMode) {
      await this.setCurrentPreviewScene(DOCK_PRESENTATION_SCENE);
      await this.waitForSceneMatch("preview", DOCK_PRESENTATION_SCENE).catch(() => { });
      return;
    }

    if (currentProgramScene === DOCK_PRESENTATION_SCENE) return;

    await this.call("SetCurrentProgramScene", { sceneName: DOCK_PRESENTATION_SCENE });
    await this.waitForSceneMatch("program", DOCK_PRESENTATION_SCENE).catch(() => { });
  }

  /**
   * Ensure the current Program scene exists as a source inside MCE Presentation,
   * positioned at the bottom of the z-order (behind all overlay sources).
   * This makes the live broadcast content visible behind overlays.
   * Skips if the program scene IS MCE Presentation (circular reference).
   */
  private async ensureProgramSceneAsSourceInPresentation(force = false): Promise<void> {
    try {
      // In "Don't Clone" mode, MCE Presentation is already inside the Program scene
      // (reversed direction). Adding Program inside MCE Presentation would create a
      // circular reference (Program → Presentation → Program), so skip.
      if (!force && this.readSceneMode() === "no-clone") return;

      const programScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (!programScene || programScene === DOCK_PRESENTATION_SCENE) return;

      // Skip if we already ensured this program scene is in the presentation
      if (this._presentationProgramScene === programScene) return;

      const presentationScene = DOCK_PRESENTATION_SCENE;
      await this.ensureDedicatedScene(presentationScene);

      // Check if already present
      const items = await this.getSceneItemListCached(presentationScene);
      const existing = items.find((i) => i.sourceName === programScene);

      if (existing) {
        // Already present — just ensure it's at the bottom (behind overlays)
        if (existing.sceneItemIndex !== 0) {
          await this.call("SetSceneItemIndex", {
            sceneName: presentationScene,
            sceneItemId: existing.sceneItemId,
            sceneItemIndex: 0,
          }).catch(() => { });
        }
        // Ensure enabled
        await this.call("SetSceneItemEnabled", {
          sceneName: presentationScene,
          sceneItemId: existing.sceneItemId,
          sceneItemEnabled: true,
        }).catch(() => { });
        this._presentationProgramScene = programScene;
        return;
      }

      // Add program scene as a source to MCE Presentation
      const created = await this.call("CreateSceneItem", {
        sceneName: presentationScene,
        sourceName: programScene,
        sceneItemEnabled: true,
      }) as { sceneItemId: number };
      this.invalidateSceneItemListCache(presentationScene);

      // Fit to canvas
      await this.fitSceneItemToCanvas(presentationScene, created.sceneItemId);

      // Move to bottom of z-order (index 0 = behind all overlay sources)
      await this.call("SetSceneItemIndex", {
        sceneName: presentationScene,
        sceneItemId: created.sceneItemId,
        sceneItemIndex: 0,
      }).catch(() => { });

      this._presentationProgramScene = programScene;

    } catch (err) {
      console.warn("[DockOBS] Failed to add program scene as source in presentation:", err);
    }
  }

  /**
   * Ensure MCE Presentation exists as a Scene Source inside the given scene,
   * positioned at the top of the z-order (above all other content).
   * Used in "Don't Clone" mode: MCE Presentation is embedded inside the user's
   * Program scene so overlays appear directly within it without needing a clone.
   */
  private async ensureMCEPresentationInScene(sceneName: string): Promise<void> {
    try {
      if (!sceneName || sceneName === DOCK_PRESENTATION_SCENE) return;

      await this.ensureDedicatedScene(DOCK_PRESENTATION_SCENE);

      // Check if already present
      const resp = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex: number }>;
      };
      const existing = resp.sceneItems.find((i) => i.sourceName === DOCK_PRESENTATION_SCENE);

      if (existing) {
        // Already present — ensure it's on top and enabled
        const maxIndex = resp.sceneItems.length - 1;
        if (existing.sceneItemIndex !== maxIndex) {
          await this.call("SetSceneItemIndex", {
            sceneName,
            sceneItemId: existing.sceneItemId,
            sceneItemIndex: maxIndex,
          }).catch(() => { });
        }
        await this.call("SetSceneItemEnabled", {
          sceneName,
          sceneItemId: existing.sceneItemId,
          sceneItemEnabled: true,
        }).catch(() => { });
        return;
      }

      // Add MCE Presentation as a source to the scene
      const created = await this.call("CreateSceneItem", {
        sceneName,
        sourceName: DOCK_PRESENTATION_SCENE,
        sceneItemEnabled: true,
      }) as { sceneItemId: number };

      // Fit to canvas
      await this.fitSceneItemToCanvas(sceneName, created.sceneItemId);

    } catch (err) {
      console.warn("[DockOBS] Failed to add MCE Presentation as scene source:", err);
    }
  }

  /**
   * Remove MCE Presentation as a Scene Source from the given scene.
   * Used in "Don't Clone" mode cleanup — removes the embedded presentation
   * when overlays are cleared or projection ends.
   */
  private async removeMCEPresentationFromScene(sceneName: string): Promise<void> {
    try {
      if (!sceneName || sceneName === DOCK_PRESENTATION_SCENE) return;

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

  private sanitizeSceneToken(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96) || "Scene";
  }

  private buildPreviewSceneName(originalSceneName: string, tabId?: DockPreviewTab): string {
    if (tabId && tabId in TAB_PREVIEW_SCENE_NAMES) {
      return TAB_PREVIEW_SCENE_NAMES[tabId];
    }
    return `${DockObsClient.CLONE_PREFIX}${this.sanitizeSceneToken(originalSceneName)}`;
  }

  async applyProjectionSettings(): Promise<void> {
    await this.ensureDedicatedScene(DOCK_PRESENTATION_SCENE).catch(() => { });

    this._presentationProgramScene = "";

    if (this.readSceneMode() === "no-clone") {
      const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (currentProgramScene && currentProgramScene !== DOCK_PRESENTATION_SCENE) {
        await this.ensureMCEPresentationInScene(currentProgramScene).catch(() => { });
      }
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

  /** Get the fixed preview scene name for a tab (e.g. "_OVMR_Preview_bible") */
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

  /** Set the preview scene state for a specific tab */
  private setPreviewSceneStateForTab(tabId: DockPreviewTab, originalSceneName: string, previewSceneName: string, overlayType: string): void {
    const now = Date.now();
    const existing = this._previewSceneStates.get(tabId);
    const createdAt = existing?.previewSceneName === previewSceneName && existing?.originalSceneName === originalSceneName
      ? existing.createdAt
      : now;
    const state: DockPreviewSceneState = { previewSceneName, originalSceneName, overlayType, createdAt, updatedAt: now };
    this._previewSceneStates.set(tabId, state);
    this.saveTabPreviewSceneStatesToStorage();
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

  private async getCurrentProgramSceneName(): Promise<string> {
    const now = Date.now();
    if (this._programSceneCache && this._programSceneCache.expiresAt > now) {
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

  private async isStudioModeEnabled(): Promise<boolean> {
    // Cache for 30s — studio mode rarely changes mid-session
    if (this._studioModeCache && Date.now() < this._studioModeCache.expiresAt) {
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
   * Check if the OBS Move Transition plugin is installed.
   * The plugin provides animated source movements via filters.
   * Download: https://obsproject.com/forum/resources/move.913/
   */
  async isMovePluginInstalled(): Promise<boolean> {
    try {
      // GetVendorInfo doesn't work for Move Transition — it doesn't register
      // as a vendor. Instead, check if its filter kind is available.
      const resp = await this.call("GetSourceFilterKindList") as { sourceFilterKinds?: string[] };
      return Array.isArray(resp.sourceFilterKinds) && resp.sourceFilterKinds.includes("move_source_filter");
    } catch {
      return false;
    }
  }

  /**
   * Returns platform-specific download info for the Move plugin.
   */
  getMovePluginDownloadInfo(): { url: string; filename: string; instructions: string } {
    return {
      url: "https://github.com/exeldro/obs-move-transition/releases/latest",
      filename: "move-transition",
      instructions: "Download the installer for your OS from the GitHub releases page, then restart MakeChurchEasy.",
    };
  }

  /**
   * Add a Move Source filter to a scene item for animation.
   * Returns the filter name on success, null on failure.
   */
  async addMoveFilter(
    sceneName: string,
    sceneItemId: number,
    filterName: string,
  ): Promise<string | null> {
    try {
      const resp = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems?: Array<{ sceneItemId: number; sourceName: string }>;
      };
      const item = resp.sceneItems?.find((i) => i.sceneItemId === sceneItemId);
      if (!item) return null;

      await this.call("CreateSourceFilter", {
        sourceName: item.sourceName,
        filterName,
        filterKind: "move_source_filter",
        filterSettings: {},
      });
      return item.sourceName;
    } catch (err) {
      console.warn(`[DockOBS] Failed to add Move filter "${filterName}":`, err);
      return null;
    }
  }

  /**
   * Configure a Move Source filter with start/end positions.
   * The filter animates from current (start) to target (end).
   */
  async configureMoveFilter(
    sourceName: string,
    filterName: string,
    _startPos: { x: number; y: number },
    endPos: { x: number; y: number },
    _startBounds: { width: number; height: number },
    endBounds: { width: number; height: number },
    durationMs: number = 300,
    easing: number = 1, // 1 = quadratic ease-out
  ): Promise<void> {
    await this.call("SetSourceFilterSettings", {
      sourceName,
      filterName,
      filterSettings: {
        source: "",
        pos: {
          x: endPos.x,
          y: endPos.y,
          x_sign: 1, // absolute
          y_sign: 1, // absolute
        },
        bounds: {
          x: endBounds.width,
          y: endBounds.height,
          x_sign: 1,
          y_sign: 1,
        },
        rot: 0,
        rot_sign: 1,
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        custom_duration: durationMs,
        duration: durationMs,
        easing_match: easing,
        easing_function_match: easing,
        start_trigger: 0, // Don't auto-trigger yet
      },
    }).catch(() => {
      // Move filter settings format may vary by version; ignore config errors
    });
  }

  /**
   * Trigger a Move filter animation and wait for it to complete.
   */
  async triggerMoveFilter(
    sourceName: string,
    filterName: string,
    durationMs: number = 300,
  ): Promise<void> {
    await this.call("SetSourceFilterSettings", {
      sourceName,
      filterName,
      filterSettings: {
        start_trigger: 5, // ENABLE = trigger
      },
    }).catch(() => { });

    await this.sleep(durationMs + 50);
  }

  /**
   * Remove a Move filter from a source.
   */
  async removeMoveFilter(
    sourceName: string,
    filterName: string,
  ): Promise<void> {
    await this.call("RemoveSourceFilter", {
      sourceName,
      filterName,
    }).catch(() => { });
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
        ? await this.getCurrentProgramSceneName().catch(() => "")
        : await this.getCurrentPreviewSceneName().catch(() => "");
      if (current === trimmed) return true;
      await this.sleep(delayMs);
    }

    return false;
  }

  private async clearSceneItems(sceneName: string): Promise<void> {
    const resp = await this.call("GetSceneItemList", { sceneName }) as {
      sceneItems?: Array<{ sceneItemId: number }>;
    };
    const items = resp.sceneItems ?? [];
    for (const item of items.sort((a, b) => b.sceneItemId - a.sceneItemId)) {
      try {
        await this.call("RemoveSceneItem", {
          sceneName,
          sceneItemId: item.sceneItemId,
        });
      } catch (err) {
        console.warn(`[DockOBS] Failed to remove scene item #${item.sceneItemId} from "${sceneName}":`, err);
      }
    }
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
    if (!trimmed.startsWith(DockObsClient.CLONE_PREFIX)) return "";
    const raw = trimmed.slice(DockObsClient.CLONE_PREFIX.length).trim();
    return raw.replace(/^_+/, "").trim();
  }

  private isPromotedPreviewScene(targetScene: string, currentProgramScene: string): boolean {
    return Boolean(targetScene) &&
      targetScene === currentProgramScene &&
      targetScene.startsWith(DockObsClient.CLONE_PREFIX);
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
    if (this._knownScenes.has(trimmedSceneName)) return true;
    const sceneNames = await this.getObsSceneNames();
    return sceneNames.includes(trimmedSceneName);
  }

  private async setCurrentPreviewScene(sceneName: string, attempts = 3): Promise<boolean> {
    const trimmedSceneName = sceneName.trim();
    if (!trimmedSceneName) return false;

    if (trimmedSceneName === DOCK_PRESENTATION_SCENE) {
      await this.ensureDedicatedScene(trimmedSceneName).catch((err) => {
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
          await this.ensureDedicatedScene(trimmedSceneName).catch(() => { });
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
   * When tabId is provided, creates/uses a tab-specific preview scene
   * (e.g. "_OVMR_Preview_bible") so each tab has its own independent preview.
   *
   * Returns { sceneName, studioMode }.
   */
  private async getTargetScene(tabId?: DockPreviewTab, options?: { skipClone?: boolean }): Promise<{ sceneName: string; studioMode: boolean }> {
    const studioMode = await this.isStudioModeEnabled();

    // Bible fullscreen adds its scene directly to the user's scene — no clone needed.
    if (options?.skipClone) {
      const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
      this.rememberUserScene(sceneName, tabId);
      return { sceneName, studioMode: false };
    }

    if (studioMode) {
      const sceneMode = this.readSceneMode();

      // "no-clone" mode: embed MCE Presentation as a Scene Source inside the
      // user's Program scene, then return MCE Presentation as the target so
      // overlays go into it — no separate clone scene is created.
      if (sceneMode === "no-clone") {
        const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
        if (!sceneName) return { sceneName: "", studioMode: true };
        this.rememberUserScene(sceneName, tabId);

        // Add MCE Presentation on top of the user's scene
        await this.ensureMCEPresentationInScene(sceneName);

        // Set Program as Preview so the user sees the result before going live
        await this.setCurrentPreviewScene(sceneName);

        // Return MCE Presentation as target — overlays will be placed there
        return { sceneName: DOCK_PRESENTATION_SCENE, studioMode: true };
      }

      const currentScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (!currentScene) return { sceneName: "", studioMode: true };
      this.rememberUserScene(currentScene, tabId);

      // "reference" mode (default): embed the program scene as a live Scene Source.
      // "auto-duplicate" mode: snapshot — copy each source individually with its transform.
      const cloneName = sceneMode === "auto-duplicate"
        ? await this.ensureDuplicate(currentScene, tabId)
        : await this.ensureClone(currentScene, tabId);

      await this.setCurrentPreviewScene(cloneName);
      return { sceneName: cloneName, studioMode: true };
    }

    const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
    this.rememberUserScene(sceneName, tabId);

    return { sceneName, studioMode: false };
  }

  private async getPresentationTargetScene(tabId?: DockPreviewTab): Promise<{ sceneName: string; studioMode: boolean }> {
    await this.ensureDedicatedScene(DOCK_PRESENTATION_SCENE);

    const studioMode = await this.isStudioModeEnabled().catch(() => false);
    const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");

    if (currentProgramScene && currentProgramScene !== DOCK_PRESENTATION_SCENE) {
      this.rememberUserScene(currentProgramScene, tabId);
      await this.ensureProgramSceneAsSourceInPresentation(true);
    }

    if (studioMode) {
      await this.setCurrentPreviewScene(DOCK_PRESENTATION_SCENE);
      await this.waitForSceneMatch("preview", DOCK_PRESENTATION_SCENE).catch(() => { });
    } else if (currentProgramScene && currentProgramScene !== DOCK_PRESENTATION_SCENE) {
      await this.call("SetCurrentProgramScene", { sceneName: DOCK_PRESENTATION_SCENE });
      await this.waitForSceneMatch("program", DOCK_PRESENTATION_SCENE).catch(() => { });
    }

    return { sceneName: DOCK_PRESENTATION_SCENE, studioMode };
  }
  private async ensureClone(sourceScene: string, tabId?: DockPreviewTab): Promise<string> {
    const trimmedSourceScene = sourceScene.trim();
    if (!trimmedSourceScene) {
      throw new Error("Source scene was empty");
    }

    if (trimmedSourceScene.startsWith(DockObsClient.CLONE_PREFIX)) {
      console.warn(`[DockOBS] Reusing promoted preview scene "${trimmedSourceScene}" without nesting another clone`);
      return trimmedSourceScene;
    }

    const cloneName = this.buildPreviewSceneName(trimmedSourceScene, tabId);
    const stalePreviewSceneName = tabId
      ? (this.getStoredPreviewSceneStateForTab(tabId)?.previewSceneName ?? "")
      : (this.getStoredPreviewSceneState()?.previewSceneName ?? "");

    // Fast path: if we already confirmed this clone exists, skip getObsSceneNames
    const cloneExists = this._cloneExistsCache.has(cloneName)
      || (await this.getObsSceneNames().catch(() => [] as string[])).includes(cloneName);

    if (cloneExists) {
      this._cloneExistsCache.add(cloneName);
    }

    if (!cloneExists) {
      await this.call("CreateScene", { sceneName: cloneName });
      this._knownScenes.add(cloneName);
      this._cloneExistsCache.add(cloneName);
      await this.sleep(120);
      await this.clearSceneItems(cloneName);

      // Add the original scene as a single nested scene source.
      // OBS renders it in real time — any update to the source scene
      // automatically appears here with zero duplication overhead.
      await this.call("CreateSceneItem", {
        sceneName: cloneName,
        sourceName: trimmedSourceScene,
        sceneItemEnabled: true,
      });

    } else {
    }

    this._cloneMap.set(trimmedSourceScene, cloneName);
    if (tabId) {
      this.setPreviewSceneStateForTab(tabId, trimmedSourceScene, cloneName, "preview-clone");
    } else {
      this.setPreviewSceneState(trimmedSourceScene, cloneName, "preview-clone");
    }

    if (await this.isStudioModeEnabled()) {
      await this.setCurrentPreviewScene(cloneName);
    }

    // Clean up stale preview scenes — only for the same tab (or non-tabbed)
    if (stalePreviewSceneName && stalePreviewSceneName !== cloneName && stalePreviewSceneName !== trimmedSourceScene) {
      const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
      const currentPreviewScene = await this.getCurrentPreviewSceneName().catch(() => "");
      if (stalePreviewSceneName !== currentProgramScene && stalePreviewSceneName !== currentPreviewScene) {
        await this.removeSceneIfExists(stalePreviewSceneName);
      }
    }
    return cloneName;
  }

  /**
   * Read the user's chosen scene creation mode from projection settings.
   *
   * - "auto-duplicate" (default): snapshot — each source is individually copied with its
   *   transform so the clone is an independent copy of the program scene.
   * - "reference": live — the program scene is embedded as a single Scene Source that
   *   automatically mirrors any changes to the original.
   * - "no-clone": the dock works directly on the user's program scene without cloning.
   */
  private readSceneMode(): "auto-duplicate" | "reference" | "no-clone" {
    return loadProjectionSettings().sceneMode;
  }

  private readTickerLayerPriority(): "ticker-above" | "content-above" {
    return loadProjectionSettings().tickerLayerPriority;
  }

  private readRestoreOriginalScene(): boolean {
    return loadProjectionSettings().restoreOriginalScene;
  }

  /**
   * Snapshot mode: create a new scene and individually copy every source from the
   * source scene, preserving each source's transform.  The resulting scene is an
   * independent snapshot — changes to the source scene do NOT propagate here.
   *
   * Returns the name of the newly created scene.
   */
  private async ensureDuplicate(sourceScene: string, tabId?: DockPreviewTab): Promise<string> {
    const trimmedSourceScene = sourceScene.trim();
    if (!trimmedSourceScene) {
      throw new Error("Source scene was empty");
    }

    if (trimmedSourceScene.startsWith(DockObsClient.CLONE_PREFIX)) {
      console.warn(`[DockOBS] Reusing promoted preview scene "${trimmedSourceScene}" without nesting another duplicate`);
      return trimmedSourceScene;
    }

    const cloneName = this.buildPreviewSceneName(trimmedSourceScene, tabId);
    const stalePreviewSceneName = tabId
      ? (this.getStoredPreviewSceneStateForTab(tabId)?.previewSceneName ?? "")
      : (this.getStoredPreviewSceneState()?.previewSceneName ?? "");

    const cloneExists = this._cloneExistsCache.has(cloneName)
      || this._knownScenes.has(cloneName)
      || (await this.getObsSceneNames().catch(() => [] as string[])).includes(cloneName);
    if (cloneExists) {
      this._cloneExistsCache.add(cloneName);
      this._knownScenes.add(cloneName);
    }
    if (!cloneExists) {
      await this.call("CreateScene", { sceneName: cloneName });
      this._knownScenes.add(cloneName);
      this._cloneExistsCache.add(cloneName);
      await this.sleep(120);
      await this.clearSceneItems(cloneName);

      // Get every source item from the original scene along with its transform,
      // then recreate each one individually in the clone — preserving layout.
      const sourceItems = await this.call("GetSceneItemList", { sceneName: trimmedSourceScene }) as {
        sceneItems: Array<{ sceneItemId: number; sourceName: string }>;
      };

      for (const item of (sourceItems.sceneItems ?? [])) {
        try {
          // Read the source item's current transform
          const transformResp = await this.call("GetSceneItemTransform", {
            sceneName: trimmedSourceScene,
            sceneItemId: item.sceneItemId,
          }) as { sceneItemTransform: Record<string, unknown> };

          // Create the same source in the clone scene
          const created = await this.call("CreateSceneItem", {
            sceneName: cloneName,
            sourceName: item.sourceName,
            sceneItemEnabled: true,
          }) as { sceneItemId: number };

          // Apply the saved transform to the new item
          if (transformResp?.sceneItemTransform && created?.sceneItemId) {
            await this.call("SetSceneItemTransform", {
              sceneName: cloneName,
              sceneItemId: created.sceneItemId,
              sceneItemTransform: transformResp.sceneItemTransform,
            }).catch(() => { /* transform is best-effort */ });
          }
        } catch (err) {
          console.warn(`[DockOBS] Failed to duplicate source "${item.sourceName}" into "${cloneName}":`, err);
        }
      }
    }

    this._cloneMap.set(trimmedSourceScene, cloneName);
    if (tabId) {
      this.setPreviewSceneStateForTab(tabId, trimmedSourceScene, cloneName, "preview-clone");
    } else {
      this.setPreviewSceneState(trimmedSourceScene, cloneName, "preview-clone");
    }

    if (await this.isStudioModeEnabled()) {
      await this.setCurrentPreviewScene(cloneName);
    }

    // Clean up stale preview scenes — only for the same tab (or non-tabbed)
    if (stalePreviewSceneName && stalePreviewSceneName !== cloneName && stalePreviewSceneName !== trimmedSourceScene) {
      const currentProgramScene = await this.getCurrentProgramSceneName().catch(() => "");
      const currentPreviewScene = await this.getCurrentPreviewSceneName().catch(() => "");
      if (stalePreviewSceneName !== currentProgramScene && stalePreviewSceneName !== currentPreviewScene) {
        await this.removeSceneIfExists(stalePreviewSceneName);
      }
    }
    return cloneName;
  }

  async deleteClone(sceneNameOrTab?: string, tabId?: DockPreviewTab): Promise<void> {
    // In "Don't Clone" mode, there is no clone scene to delete.
    // Instead, remove the embedded MCE Presentation from the user's Program scene.
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
    // Only scan for orphaned preview scenes when no specific tab is targeted
    if (!tabId) {
      try {
        const scenes = await this.getObsSceneNames();
        for (const s of scenes) {
          if (s.startsWith(DockObsClient.CLONE_PREFIX) && !toDelete.includes(s)) toDelete.push(s);
        }
      } catch { /* ignore */ }
    }

    // Don't delete clones that are currently Program or Preview
    const programScene = await this.getCurrentProgramSceneName().catch(() => "");
    const previewState = tabId
      ? this.getStoredPreviewSceneStateForTab(tabId)
      : this.getStoredPreviewSceneState();

    for (const clone of toDelete) {
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
    if (!await this.hasObsScene(sceneName).catch(() => false)) {
      try {
        await this.call("CreateScene", { sceneName });
        this._knownScenes.add(sceneName);
      } catch { /* scene may already exist */ }
    }

    const canvas = await this.getCanvasSize();
    const sourceWidth = Number(width) > 0 ? Number(width) : canvas.width;
    const sourceHeight = Number(height) > 0 ? Number(height) : canvas.height;

    // 1. Check if the source already exists in this scene
    const items = await this.getSceneItemListCached(sceneName);

    let sceneItemId: number | null = null;
    const existing = items.find((i) => i.sourceName === sourceName);

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
          } else {
            // Create brand new browser source
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

    try {
      await this.fitSceneItemToCanvas(sceneName, sceneItemId!);
    } catch (err) {
      console.warn(`[DockOBS] Failed to set transform for "${sourceName}":`, err);
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

        try {
          items = await this.getSceneItemListCached(targetScene);
          const topIndex = Math.max(0, items.length - 1);
          const currentItem = items.find((i) => i.sceneItemId === primaryItem.sceneItemId);
          if (currentItem && currentItem.sceneItemIndex !== topIndex) {
            await this.call("SetSceneItemIndex", {
              sceneName: targetScene,
              sceneItemId: primaryItem.sceneItemId,
              sceneItemIndex: topIndex,
            });
          }
        } catch { /* ignore */ }

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

    // Move to top of z-order in the target scene.
    try {
      const updatedItems = await this.getSceneItemListCached(targetScene);
      const topIndex = Math.max(0, updatedItems.length - 1);
      const currentItem = updatedItems.find((i) => i.sceneItemId === sceneItemId);
      if (currentItem && currentItem.sceneItemIndex !== topIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName: targetScene,
          sceneItemId: sceneItemId,
          sceneItemIndex: topIndex,
        });
      }
    } catch { /* ignore */ }

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
   *  - Prefix patterns: "MCE ", "MCE_", "MV: ", "_OVMR_Preview_", "Sunday - "
   *  - Suffix pattern: "__MCE_Dock_Preview"
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
      n.startsWith("_OVMR_Preview_") ||
      n.startsWith("Sunday - ")
    ) return true;

    // Suffix pattern
    if (n.endsWith("__MCE_Dock_Preview")) return true;

    return false;
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
      const urlChanged = prevUrl !== url;

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

  private buildCssOverlayDataCss(
    packet: Record<string, unknown>,
    themeCss = "",
  ): string {
    const encodedPacket = encodeURIComponent(JSON.stringify(packet));
    const overlayCss = `:root { --overlay-data: "${encodedPacket}"; }`;
    return themeCss ? `${overlayCss}\n${themeCss}` : overlayCss;
  }

  private buildFullscreenBackgroundUrl(
    themeSettings?: Record<string, unknown> | null,
  ): string {
    const packet = {
      theme: themeSettings ?? null,
      timestamp: Date.now(),
    };
    const encoded = encodeURIComponent(JSON.stringify(packet));
    return `${this.getOverlayBaseUrl()}/bible-overlay-bg.html#data=${encoded}`;
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
    if (hasImageOrVideo || hasPattern || isGradient || isSolidColor) {
      return { overlayTheme: source, backgroundTheme: source };
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

  private publishFullscreenOverlayPacket(packet: {
    slide: Record<string, unknown> | null;
    theme: Record<string, unknown> | null;
    live: boolean;
    blanked: boolean;
    timestamp: number;
    mode?: string;
  }, tabType: "bible" | "worship" | "announcements" | "sermon" = "bible"): void {
    const storageKey = tabType === "worship" || tabType === "announcements" ? "worship-overlay-data" : "bible-overlay-data";
    const channelName = tabType === "worship" || tabType === "announcements" ? "obs-church-studio-worship-overlay" : "obs-church-studio-bible-overlay";
    try {
      localStorage.setItem(storageKey, JSON.stringify(packet));
    } catch { /* ignore */ }

    try {
      const bc = new BroadcastChannel(channelName);
      bc.postMessage(packet);
      bc.close();
    } catch { /* ignore */ }
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
      css: stripCompatModeCSS(t.css),
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
    return `${this.getOverlayBaseUrl()}/lower-third-overlay.html#data=${encoded}`;
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
  ): Record<string, unknown> {
    return {
      id: "dock-bible-slide",
      text,
      reference,
      verseRange,
      index: 0,
      total: 1,
    };
  }

  // ── Clear all overlays ──

  /**
   * Hide ALL overlay sources in the current scene except the ones
   * that are about to be shown. This ensures that switching from e.g.
   * a fullscreen Bible overlay to a lower-third speaker overlay doesn't
   * leave the previous overlay visible.
   *
   * In the new single-scene architecture, all sources live inside
   * "MCE Presentation", so we hide individual sources rather than
   * hiding separate scene sources.
   *
   * @param keepSources  Source/scene names that should NOT be hidden
   *                     (because they're about to be updated).
   *                     Pass `null` or `[]` to hide ALL.
   * @param sceneName    The target scene name — hides sources there.
   */
  async clearAllOverlays(
    keepSources: string | string[] | null = null,
    sceneName?: string,
    resources: DockResourceNames = DOCK_RESOURCES,
  ): Promise<void> {
    const keepSet = new Set(
      keepSources == null ? [] : Array.isArray(keepSources) ? keepSources : [keepSources],
    );
    keepSet.add(resources.tickerSource);
    keepSet.add(DOCK_TICKER_SOURCE);

    const ALL_OVERLAY_SOURCES = [
      resources.ltSource,
      resources.animatedLtSource,
      resources.worshipSource,
      resources.tickerSource,
      resources.fsBgSource,
      // Media sources within MCE Presentation
      resources.mediaVideoSource,
      resources.mediaImageSource,
      resources.mediaImageAudioSource,
      resources.mediaPatternSource,
      resources.mediaTextSource,
    ];

    const toHide = ALL_OVERLAY_SOURCES.filter((s) => !keepSet.has(s));

    // Collect scene names to clear: the provided scene + fallback to target scene
    const scenes = new Set<string>();
    if (sceneName) scenes.add(sceneName);

    try {
      if (!sceneName) {
        const target = await this.getCurrentProgramSceneName().catch(() => "");
        if (target) scenes.add(target);
      }
    } catch { /* ignore */ }

    for (const scene of scenes) {
      const hidePromises = toHide.map((src) => this.hideOverlaySource(scene, src));
      if (!keepSet.has(resources.fsBgSource)) {
        hidePromises.push(this.hideOverlaySource(scene, this.getTargetFullscreenBgSourceName(scene, resources)));
      }
      await Promise.all(hidePromises);
      this.invalidateActiveMceOverlayState(scene);
    }

  }

  // ── High-level actions ──

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
  async pushBible(data: {
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
  }): Promise<void> {
    return this.runSerializedBibleMutation(async () => {
      const resources = getDockResources();
      const currentProgramSceneBeforeTarget = await this.getCurrentProgramSceneName().catch(() => "");
      let sceneName: string;
      let studioMode = false;

      // Detect mode switch early — delete old clone before getting new target
      const mode = data.overlayMode ?? "fullscreen";
      const prevMode = this._lastBibleMode;
      const modeChanged = prevMode !== "" && prevMode !== mode;
      if (modeChanged) {
        // Switch OBS Preview away from the bible clone so deleteClone()
        // does not skip it.
        try {
          const previewScene = await this.getCurrentPreviewSceneName().catch(() => "");
          const biblePreviewName = TAB_PREVIEW_SCENE_NAMES.bible;
          if (previewScene === biblePreviewName) {
            const previewState = this.getStoredPreviewSceneStateForTab("bible");
            const original = previewState?.originalSceneName
              || this.getPreviewBaseSceneName(previewScene);
            if (original) {
              await this.setCurrentPreviewScene(original);
              await this.waitForSceneMatch("preview", original).catch(() => { });
            }
          }
        } catch { /* ignore */ }
        await this.deleteClone(undefined, "bible").catch(() => { });
        this._lastBiblePushSignature = "";
        this._lastBibleFullscreenSetupSignature = "";
        this._bibleLtInitialized = false;
        this._presentationProgramScene = "";
      }

      if (data.targetScene) {
        // Custom target scene — ensure it exists, skip clone logic
        sceneName = data.targetScene;
        if (!await this.hasObsScene(sceneName).catch(() => false)) {
          await this.call("CreateScene", { sceneName })
            .then(() => { this._knownScenes.add(sceneName); })
            .catch(() => { });
        }
        studioMode = await this.isStudioModeEnabled().catch(() => false);
        if (studioMode) {
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
          studioMode = await this.isStudioModeEnabled().catch(() => false);
        } else {
          const target = await this.getPresentationTargetScene("bible");
          sceneName = target.sceneName;
          studioMode = target.studioMode;
        }
      }

      if (!sceneName) throw new Error("Could not determine the current OBS scene.");

      // Ensure the live program scene is visible behind overlays in MCE Presentation
      await this.ensureProgramSceneAsSourceInPresentation();

      const pushSignature = this.buildBiblePushSignature(sceneName, currentProgramSceneBeforeTarget, data);
      if (pushSignature === this._lastBiblePushSignature) {
        // Still ensure correct ticker positioning — another tab may have
        // reordered scene items since the last Bible push.
        const browserSrc = this._fullscreenSceneDefs["bible"]?.browserSourceName;
        if (browserSrc) {
          await this.ensureTickerAboveSource(sceneName, browserSrc).catch(() => {});
        }
        return;
      }

      const verseRange = data.verseRange ?? String(data.verse);
      const ref = data.referenceLabel ?? `${data.book} ${data.chapter}:${verseRange}`;
      const backgroundOnly = Boolean(data.backgroundOnly);
      const primaryText = backgroundOnly ? "" : (data.verseText || ref);
      const referenceText = backgroundOnly ? "" : `${ref} (${data.translation})`;
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
        // ── Lower-third: unified browser source, shown in user's scene ──
        // Uses the same "MCE Browser - Bible" source as fullscreen.
        // When entering lower-third: add to user's scene (source stays in MCE Presentation — CSS handles mode).
        const browserSourceName = this._fullscreenSceneDefs["bible"].browserSourceName;
        const userScene = currentProgramSceneBeforeTarget || sceneName;

        // Ensure the source exists (creates if first time)
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
          const { overlayTheme, backgroundTheme } = this.prepareDedicatedLowerThirdTheme(effectiveThemeSettings);

          if (modeChanged) this._bibleLtInitialized = false;

          if (!this._bibleLtInitialized) {
            // Clean up any leftover fullscreen scene sources from previous mode
            const fsDef = this._fullscreenSceneDefs["bible"];
            if (fsDef) {
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

            if (backgroundTheme) {
              await this._ensureLowerThirdBgSource(sceneName, backgroundTheme);
            } else {
              await this._hideLowerThirdBgSource(sceneName);
            }

            this._bibleLtInitialized = true;
          } else {
            // Fast path: source already set up, just update BG if theme changed
            if (backgroundTheme) {
              await this._ensureLowerThirdBgSource(sceneName, backgroundTheme);
            } else {
              await this._hideLowerThirdBgSource(sceneName);
            }
          }

          const ltBgNames = this._ltBgNames(sceneName);
          await this.ensureActiveMceOverlaySource(
            sceneName,
            browserSourceName,
            [browserSourceName, ltBgNames.a, ltBgNames.b],
            resources,
          );

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
          // Always use the fullscreen HTML — it handles both modes via .lt-mode CSS class.
          // Mode switching is done purely via CSS --overlay-data, never via URL change.
          cssOverlayBaseUrl = `${this.getOverlayBaseUrl()}/bible-overlay-fullscreen.html?tab=bible`;
          useCssOverlayTransport = true;
          url = `${cssOverlayBaseUrl}#data=${encodeURIComponent(JSON.stringify(cssOverlayPacket))}`;
        } else {
          // ── Lower-third without theme settings: use unified fullscreen HTML ──
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
          cssOverlayBaseUrl = `${this.getOverlayBaseUrl()}/bible-overlay-fullscreen.html?tab=bible`;
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

          await this.ensureActiveMceOverlaySource(
            sceneName,
            browserSourceName,
            [browserSourceName],
            resources,
          );
        }
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
        cssOverlayBaseUrl = `${this.getOverlayBaseUrl()}/bible-overlay-fullscreen.html?tab=bible`;
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
              await this.ensureActiveMceOverlaySource(
                sceneName,
                def.browserSourceName,
                [def.browserSourceName, def.bgSourceName, `${def.bgSourceName} 2`],
                resources,
              );
              this.publishFullscreenOverlayPacket({
                slide: (packetWithMode.slide as Record<string, unknown> | null) ?? null,
                theme: (packetWithMode.theme as Record<string, unknown> | null) ?? null,
                live: true,
                blanked: Boolean(packetWithMode.blanked),
                timestamp: Number(packetWithMode.timestamp) || Date.now(),
                mode: String(mode || "fullscreen"),
              }, "bible");
              this._bibleLtInitialized = true;
              this._lastBiblePushSignature = pushSignature;
              return;
            } catch {
              this._lastBibleFullscreenSetupSignature = "";
            }
          }

        // Ensure the unified source exists in MCE Presentation
        await this._ensureFullscreenScene("bible");

        // Hide the source in user's scene if it was there from lower-third mode
        const userScene = currentProgramSceneBeforeTarget || sceneName;
        if (userScene && userScene !== PRESENTATION_SCENE_NAME) {
          await this.hideOverlaySource(userScene, def.browserSourceName);
        }

        // Create a persistent OBS background source below the browser source.
        const hasSeparateBg = this._hasSeparateFullscreenBg(effectiveThemeSettings);
        if (hasSeparateBg) {
          await this._ensureFullscreenBgSource("bible", effectiveThemeSettings);
        } else {
          await this._hideFullscreenBgSource("bible");
        }

        await this.ensureActiveMceOverlaySource(
          sceneName,
          def.browserSourceName,
          [def.browserSourceName, def.bgSourceName, `${def.bgSourceName} 2`],
          resources,
        );

        // Bootstrap the browser source only when the page/theme transport changes.
        // Normal verse changes are delivered below via BroadcastChannel/localStorage
        // so OBS does not reload or repaint the browser source.
        {
          // Include mode so the fullscreen HTML removes lt-mode class when switching back
          const packetWithMode = { ...packet, mode };
          const overlayThemeCss = this.buildCssOverlayDataCss(packetWithMode, themeCss);
          await this.setBrowserSourceUrl(def.browserSourceName, cssOverlayBaseUrl, false, overlayThemeCss);
          this._lastCssOverlayPacketBySource[def.browserSourceName] = packetWithMode;
          this._lastCssOverlayBaseUrlBySource[def.browserSourceName] = cssOverlayBaseUrl;
          this._lastCssOverlayThemeCssBySource[def.browserSourceName] = themeCss || "";
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
            await this.call("SetSceneItemEnabled", {
              sceneName,
              sceneItemId: browserItem.sceneItemId,
              sceneItemEnabled: true,
            });
          }
        } catch { /* ignore */ }

        if (sceneItemId !== null) {
          await this.ensureTickerAboveSource(sceneName, def.browserSourceName).catch(() => { });
        }

        // If browser source not found, create it directly in MCE Presentation
        if (sceneItemId === null) {
          try {
            const canvas = await this.getCanvasSize();
            const overlayUrl = `${this.getOverlayBaseUrl()}/${def.overlayFile}?tab=bible`;
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

        await this.promotePresentationScene("bible").catch(() => { });

        const animation = effectiveThemeSettings?.animation as string | undefined;
        if (animation && animation !== "none" && sceneItemId && !alreadyImported) {
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
        }, "bible");

        // For fullscreen mode, we already handled the scene-based update above.
        // For lower-third mode: keep the fullscreen HTML loaded (no URL change)
        // and send mode + data via CSS overlay transport only. The fullscreen
        // HTML detects the mode field and animates to lower-third layout.
        if (mode === "lower-third") {
          const browserSourceName = this._fullscreenSceneDefs["bible"].browserSourceName;
          const overlayCss = this.buildCssOverlayDataCss(packetWithMode, themeCss);
          await this.setBrowserSourceUrl(browserSourceName, cssOverlayBaseUrl, false, overlayCss);
          this._lastCssOverlayPacketBySource[browserSourceName] = packetWithMode;
          this._lastCssOverlayBaseUrlBySource[browserSourceName] = cssOverlayBaseUrl;
          this._lastCssOverlayThemeCssBySource[browserSourceName] = themeCss || "";
        }
      } else if (mode === "lower-third") {
        const browserSourceName = this._fullscreenSceneDefs["bible"].browserSourceName;
        if (modeChanged && this._lastCssOverlayBaseUrlBySource[browserSourceName]) {
          // Same mode-switch shortcut: skip URL reload, just update CSS
          try {
            const fallbackCss = themeCss || "";
            await this.call("SetInputSettings", {
              inputName: browserSourceName,
              inputSettings: { css: fallbackCss },
            });
          } catch { /* best effort */ }
        } else {
          await this.setBrowserSourceUrl(browserSourceName, url, modeChanged, themeCss || undefined);
        }
      }

      this._lastBiblePushSignature = pushSignature;
    });
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
      const currentScene = await this.getCurrentProgramSceneName().catch(() => "");
      if (currentScene && currentScene !== scene) {
        await Promise.all([
          this.hideOverlaySource(currentScene, browserSourceName).catch(() => { }),
          this.hideSceneSource(currentScene, resources.bibleScene).catch(() => { }),
          this.hideFullscreenBg(currentScene, resources).catch(() => { }),
          this._hideLowerThirdBgSource(currentScene).catch(() => { }),
        ]);
        this.invalidateActiveMceOverlayState(currentScene);

        // Remove fullscreen scene source from user's scene if present
        const fsDef = this._fullscreenSceneDefs["bible"];
        if (fsDef) {
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

      // Clean up the bible clone scene (studio mode)
      await this.deleteClone(undefined, "bible").catch(() => { });

      // Restore Program scene to what it was before Bible was pushed
      await this.restoreProgramSceneBeforePush("bible");

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

    await this.ensureTickerAboveSource(sceneName, resources.ltSource).catch(() => { });
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
    const baseUrl = `${this.getOverlayBaseUrl()}/${mode === "fullscreen" ? "bible-overlay-fullscreen.html" : "bible-overlay-lower-third.html"}?tab=sermon`;

    this.publishFullscreenOverlayPacket(packet, "sermon");
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

  // ── Worship lyrics overlay ──

  /**
   * Push worship lyrics to OBS as an overlay in the current scene.
   * Supports both fullscreen and lower-third overlay modes.
   */
  async pushWorshipLyrics(data: {
    sectionText: string;
    sectionLabel: string;
    songTitle: string;
    artist?: string;
    overlayMode?: "fullscreen" | "lower-third";
    ltTheme?: DockLTThemeRef;
    values?: Record<string, string>;
    bibleThemeSettings?: Record<string, unknown> | null;
    liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
    backgroundOnly?: boolean;
  }): Promise<void> {
    return this._pushTabContent(data, "worship");
  }

  async pushAnnouncement(data: {
    sectionText: string;
    sectionLabel: string;
    songTitle: string;
    artist?: string;
    overlayMode?: "fullscreen" | "lower-third";
    ltTheme?: DockLTThemeRef;
    values?: Record<string, string>;
    bibleThemeSettings?: Record<string, unknown> | null;
    liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
    backgroundOnly?: boolean;
  }): Promise<void> {
    return this._pushTabContent(data, "announcements");
  }

  /** Shared tab-content push for worship and announcements */
  private async _pushTabContent(
    data: {
      sectionText: string;
      sectionLabel: string;
      songTitle: string;
      artist?: string;
      overlayMode?: "fullscreen" | "lower-third";
      ltTheme?: DockLTThemeRef;
      values?: Record<string, string>;
      bibleThemeSettings?: Record<string, unknown> | null;
      liveOverrides?: DockLiveThemeOverrides | Record<string, unknown> | null;
      backgroundOnly?: boolean;
    },
    tab: "worship" | "announcements",
  ): Promise<void> {
    const isWorship = tab === "worship";
    const runSerialized = isWorship
      ? this.runSerializedWorshipMutation.bind(this)
      : this.runSerializedAnnouncementMutation.bind(this);
    const sourceKey = isWorship ? "worshipSource" : "announcementSource";
    const getInitialized = () => isWorship ? this._worshipInitialized : this._announcementInitialized;
    const setInitialized = (v: boolean) => { if (isWorship) this._worshipInitialized = v; else this._announcementInitialized = v; };
    const getCssBootstrapped = () => isWorship ? this._worshipCssOverlayBootstrapped : this._announcementCssOverlayBootstrapped;
    const setCssBootstrapped = (v: boolean) => { if (isWorship) this._worshipCssOverlayBootstrapped = v; else this._announcementCssOverlayBootstrapped = v; };
    const getLastPushSignature = () => isWorship ? this._lastWorshipPushSignature : this._lastAnnouncementPushSignature;
    const setLastPushSignature = (v: string) => { if (isWorship) this._lastWorshipPushSignature = v; else this._lastAnnouncementPushSignature = v; };

    return runSerialized(async () => {
      const resources = getDockResources();
      const sourceName = resources[sourceKey];
      const currentProgramSceneBeforeTarget = await this.getCurrentProgramSceneName().catch(() => "");

      // Detect mode switch early — delete old clone before getting new target
      const mode = data.overlayMode ?? "lower-third";
      const prevMode = this._lastOverlayMode[sourceName];
      const modeChanged = prevMode !== undefined && prevMode !== mode;
      if (modeChanged) {
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
        setCssBootstrapped(false);
        setLastPushSignature("");
        this._presentationProgramScene = "";
      }

      const target = mode === "lower-third"
        ? await this.getPresentationTargetScene(tab)
        : await this.getTargetScene(tab);
      const sceneName = target.sceneName;
      if (!sceneName) throw new Error("Could not determine the current OBS scene.");
      const presentationLive = mode === "fullscreen" && !target.studioMode;

      // Ensure the live program scene is visible behind overlays in MCE Presentation
      await this.ensureProgramSceneAsSourceInPresentation();

      // Dedup: skip identical pushes
      const pushSignature = this.buildWorshipPushSignature(sceneName, data);
      if (pushSignature === getLastPushSignature()) {
        return;
      }

      const backgroundOnly = Boolean(data.backgroundOnly);
      const sectionText = backgroundOnly ? "" : data.sectionText;
      const sectionLabel = backgroundOnly ? "" : cleanWorshipObsLabel(data.sectionLabel);
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
        if (!getInitialized() || modeChanged) {
          await this.clearAllOverlays([resources.worshipScene, resources.fsBgSource], sceneName, resources);
          await this.hideOverlaySource(sceneName, sourceName);
          await this._hideLowerThirdBgSource(sceneName).catch(() => { });
          await this.ensureDedicatedScene(resources.worshipScene);
          await this.ensureOverlaySource(resources.worshipScene, sourceName, undefined, undefined, true);
          await this.ensureFullscreenBg(resources.worshipScene, effectiveThemeSettings, true, resources);
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
          await this.ensureFullscreenBg(resources.worshipScene, effectiveThemeSettings, true, resources);
          if (!presentationLive) {
            await this.ensureFullscreenTargetBg(sceneName, resources.worshipScene, effectiveThemeSettings, true, resources);
          }
        }

        await this.ensureActiveMceOverlaySource(
          resources.worshipScene,
          sourceName,
          [sourceName, resources.fsBgSource],
          resources,
        );

        if (presentationLive) {
          await this.promotePresentationScene(tab).catch(() => { });
        }

        const { cleanSettings, css } = this.stripThemeDataUris(effectiveThemeSettings);
        themeCss = stripCompatModeCSS(css);
        const slide = sectionText ? {
          id: `dock-${tab}-slide`,
          reference: "",
          text: sectionText,
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
        cssOverlayBaseUrl = `${this.getOverlayBaseUrl()}/bible-overlay-fullscreen.html?tab=${tab}`;
        useCssOverlayTransport = true;
        url = `${cssOverlayBaseUrl}#data=${encodeURIComponent(JSON.stringify(packet))}`;
      } else {
        // ── OBS lower-third theme path (custom HTML/CSS themes) ──
        if (data.ltTheme) {
          if (!getInitialized() || modeChanged) {
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

          if (!getInitialized() || modeChanged) {
            await this.clearAllOverlays(sourceName, sceneName, resources);
            await this.hideSceneSource(sceneName, resources.worshipScene);
            await this.hideFullscreenBg(sceneName, resources);
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true);
            setInitialized(true);
          } else {
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true).catch(() => { });
          }

          const wltHasSeparateBg = this.hasVisualBackground(effectiveThemeSettings);
          if (wltHasSeparateBg) {
            await this._ensureLowerThirdBgSource(sceneName, effectiveThemeSettings);
          } else {
            await this._hideLowerThirdBgSource(sceneName);
          }

          const ltBgNames = this._ltBgNames(sceneName);
          await this.ensureActiveMceOverlaySource(
            sceneName,
            sourceName,
            [sourceName, ltBgNames.a, ltBgNames.b],
            resources,
          );

          const { cleanSettings: wltClean, css } = this.stripThemeDataUris(overlayTheme);
          themeCss = stripCompatModeCSS(css);
          const slide = this.buildBibleSlide(sectionText, sectionLabel);
          cssOverlayPacket = {
            slide,
            theme: wltClean ?? null,
            live: true,
            blanked: false,
            timestamp: Date.now(),
            mode,
          };
          cssOverlayBaseUrl = `${this.getOverlayBaseUrl()}/bible-overlay-fullscreen.html?tab=${tab}`;
          useCssOverlayTransport = true;
          url = `${cssOverlayBaseUrl}#data=${encodeURIComponent(JSON.stringify(cssOverlayPacket))}`;
        } else {
          if (!getInitialized() || modeChanged) {
            await this.clearAllOverlays(sourceName, sceneName, resources);
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true);
            setInitialized(true);
          } else {
            await this.ensureOverlaySource(sceneName, sourceName, undefined, undefined, true).catch(() => { });
          }

          const slide = this.buildBibleSlide(sectionText, sectionLabel);
          cssOverlayPacket = {
            slide,
            theme: null,
            live: true,
            blanked: false,
            timestamp: Date.now(),
            mode,
          };
          cssOverlayBaseUrl = `${this.getOverlayBaseUrl()}/bible-overlay-fullscreen.html?tab=${tab}`;
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

      if (useCssOverlayTransport && cssOverlayPacket) {
        this.publishFullscreenOverlayPacket({
          slide: (cssOverlayPacket.slide as Record<string, unknown> | null) ?? null,
          theme: (cssOverlayPacket.theme as Record<string, unknown> | null) ?? null,
          live: true,
          blanked: Boolean(cssOverlayPacket.blanked),
          timestamp: Number(cssOverlayPacket.timestamp) || Date.now(),
          mode: String(mode || "fullscreen"),
        }, tab);
        if (!getCssBootstrapped()) {
          const overlayCss = this.buildCssOverlayDataCss(cssOverlayPacket, themeCss);
          await this.setBrowserSourceUrl(sourceName, cssOverlayBaseUrl, false, overlayCss);
          setCssBootstrapped(true);
          this._lastCssOverlayPacketBySource[sourceName] = cssOverlayPacket;
          this._lastCssOverlayBaseUrlBySource[sourceName] = cssOverlayBaseUrl;
          this._lastCssOverlayThemeCssBySource[sourceName] = themeCss || "";
        }
      } else {
        await this.setBrowserSourceUrl(sourceName, url, modeChanged, themeCss || undefined);
      }

      setLastPushSignature(pushSignature);
    });
  }

  async clearAnnouncement(): Promise<void> {
    return this.runSerializedAnnouncementMutation(async () => {
      this._lastAnnouncementPushSignature = "";
      const resources = getDockResources();
      const sourceName = resources.announcementSource;
      const scene = PRESENTATION_SCENE_NAME;
      const batchRequests = [
        ...(await this._buildHideBatchRequests(scene, [sourceName])),
      ];

      if (batchRequests.length > 0) {
        await this.callBatch(batchRequests, 2).catch(() => { });
        this.invalidateSceneItemListCache(scene);
        this.invalidateActiveMceOverlayState(scene);
      }

      await this.deleteClone(undefined, "announcements").catch(() => { });
      this._announcementInitialized = false;
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

      const currentScene = await this.getCurrentProgramSceneName().catch(() => "");
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

      // Remove fullscreen scene source from user's scene if present
      if (currentScene && currentScene !== scene) {
        const fsDef = this._fullscreenSceneDefs["worship"];
        if (fsDef) {
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
    return `${this.getOverlayBaseUrl()}/lower-third-overlay.html#data=${encoded}`;
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

  // ── State Recovery ──

  /**
   * Scan OBS for currently-active overlay sources created by the dock.
   * Parses the URL hash of each source to reconstruct what's currently live.
   * Call this on app start to restore the staged/live state after a restart.
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
    worship: { sectionLabel: string; sectionText: string; songTitle: string; artist: string; overlayMode: string } | null;
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
      worship: { sectionLabel: string; sectionText: string; songTitle: string; artist: string; overlayMode: string } | null;
      lowerThird: { name: string; role: string } | null;
    } = { bible: null, worship: null, lowerThird: null };

    if (!this.isConnected) return result;

    const sourcesToCheck = [
      { name: this._fullscreenSceneDefs["bible"].browserSourceName, type: "bible" as const },
      { name: DOCK_WORSHIP_SOURCE, type: "worship" as const },
      { name: DOCK_LT_SOURCE, type: "lowerThird" as const },
    ];

    for (const { name, type } of sourcesToCheck) {
      try {
        // Check if the input exists at all - skip if not created yet
        const inputList = await this.call("GetInputList") as {
          inputs: Array<{ inputName: string }>;
        };
        const inputExists = inputList.inputs.some((i) => i.inputName === name);
        if (!inputExists) continue;

        // Check if the input has content
        const resp = await this.call("GetInputSettings", { inputName: name }) as {
          inputSettings: { url?: string };
        };
        const url = resp.inputSettings?.url || "";
        if (!url || url === "about:blank" || !url.includes("#data=")) continue;

        // Check if the source is currently enabled in the target scene
        let isEnabled = false;
        try {
          const sceneName = await this.getCurrentProgramSceneName().catch(() => "");
          if (sceneName) {
            const items = await this.call("GetSceneItemList", { sceneName }) as {
              sceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemEnabled: boolean }>;
            };
            const item = items.sceneItems.find((i) => i.sourceName === name);
            if (item) {
              // Get enabled state
              const enabledResp = await this.call("GetSceneItemEnabled", {
                sceneName,
                sceneItemId: item.sceneItemId,
              }) as { sceneItemEnabled: boolean };
              isEnabled = enabledResp.sceneItemEnabled;
            }
          }
        } catch { /* ignore */ }

        if (!isEnabled) continue;

        // Parse the URL hash data
        const encoded = url.split("#data=")[1];
        if (!encoded) continue;

        const data = JSON.parse(decodeURIComponent(encoded));
        if (data.blanked) continue; // Source exists but is blanked — treat as cleared

        if (type === "bible") {
          // Fullscreen bible has data.slide, LT bible has data.values
          if (data.slide) {
            const rawCompareColumns: unknown[] = Array.isArray(data.slide.columns) ? data.slide.columns : [];
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
              reference: data.slide.reference || "",
              text: data.slide.text || "",
              overlayMode: url.includes("lower-third") ? "lower-third" : "fullscreen",
              compare:
                data.slide.layout === "compare" && compareColumns.length === 2
                  ? {
                    enabled: true,
                    layout: typeof data.slide.compareLayout === "string"
                      ? data.slide.compareLayout
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
          } else if (data.values) {
            result.bible = {
              reference: data.values.reference || data.values.role || "",
              text: data.values.name || data.values.text || "",
              overlayMode: "lower-third",
              compare: null,
            };
          }
        } else if (type === "worship") {
          if (data.slide) {
            // Fullscreen worship (uses bible fullscreen overlay)
            const ref = (data.slide.reference || "").split(" · ");
            result.worship = {
              sectionLabel: ref[1] || data.slide.verseRange || "",
              sectionText: data.slide.text || "",
              songTitle: (ref[0] || "").split(" — ")[0] || "",
              artist: (ref[0] || "").split(" — ")[1] || "",
              overlayMode: "fullscreen",
            };
          } else if (data.values) {
            // LT worship
            result.worship = {
              sectionLabel: data.values.label || data.values.role || "",
              sectionText: data.values.lyrics || data.values.text || data.values.name || "",
              songTitle: data.values.songName || data.values.title || "",
              artist: data.values.artist || "",
              overlayMode: "lower-third",
            };
          }
        } else if (type === "lowerThird") {
          if (data.values) {
            result.lowerThird = {
              name: data.values.name || "",
              role: data.values.role || "",
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
    const { sceneName } = await this.getTargetScene("media");
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
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(ext);

    const mediaVideoSource = "MCE Media - Video";
    const mediaImageSource = "MCE Media - Image";
    const mediaPatternSource = "MCE Media - Pattern";
    const mediaImageAudioSource = "MCE Media - Image Audio";
    const mediaTextSource = "MCE Media - Text";

    const target = await this.getTargetScene("media");
    const sceneName = target.sceneName;
    if (!sceneName) throw new Error("No active scene found in OBS");

    // Ensure the live program scene is visible behind overlays in MCE Presentation
    await this.ensureProgramSceneAsSourceInPresentation();

    // Hide the sources we DON'T need — only hide the opposite type with animation
    const mediaSource = isImage ? mediaImageSource : mediaVideoSource;
    const hidePromises: Promise<void>[] = [];
    if (isImage) {
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
    const target = await this.getTargetScene("media");
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
    const target = await this.getTargetScene("media");
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

    const target = await this.getTargetScene("media");
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
        const target = await this.getTargetScene("media");
        if (target.sceneName) {
          await this.hideOverlaySource(target.sceneName, mediaTextSource);
        }
      } catch { /* ignore */ }
      return;
    }

    const target = await this.getTargetScene("media");
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

    // Move to top of z-order
    try {
      const updated = await this.call("GetSceneItemList", { sceneName }) as {
        sceneItems: Array<{ sourceName: string; sceneItemId: number; sceneItemIndex: number }>;
      };
      const topIndex = Math.max(0, updated.sceneItems.length - 1);
      const currentItem = updated.sceneItems.find((i) => i.sceneItemId === sceneItemId);
      if (currentItem && currentItem.sceneItemIndex !== topIndex) {
        await this.call("SetSceneItemIndex", {
          sceneName,
          sceneItemId,
          sceneItemIndex: topIndex,
        });
      }
    } catch { /* ignore */ }

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
      overlayFile: "bible-overlay-fullscreen.html",
    },
    worship: {
      sceneName: DOCK_PRESENTATION_SCENE,
      browserSourceName: "MCE Browser - Worship",
      bgSourceName: "MCE BG - Worship",
      overlayFile: "bible-overlay-fullscreen.html",
    },
    announcements: {
      sceneName: DOCK_PRESENTATION_SCENE,
      browserSourceName: "MCE Browser - Announcements",
      bgSourceName: "MCE BG - Announcements",
      overlayFile: "bible-overlay-fullscreen.html",
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
    const tabQuery = key === "bible" || key === "worship" ? `?tab=${key}` : "";
    const overlayUrl = `${this.getOverlayBaseUrl()}/${def.overlayFile}${tabQuery}`;
    const sourceSignature = `${overlayUrl}|${canvas.width}x${canvas.height}`;

    // Ensure MCE Presentation exists
    await this.ensureDedicatedScene(DOCK_PRESENTATION_SCENE);

    // Ensure browser source exists inside MCE Presentation
    let browserItemId: number | null = null;
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
        this._lastFullscreenSourceSignature[def.browserSourceName] = sourceSignature;
        this.invalidateSceneItemListCache(DOCK_PRESENTATION_SCENE);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("600")) {
          try {
            const added = await this.call("CreateSceneItem", { sceneName: DOCK_PRESENTATION_SCENE, sourceName: def.browserSourceName, sceneItemEnabled: true }) as { sceneItemId: number };
            browserItemId = added.sceneItemId;
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
      if (this._lastFullscreenSceneItemSignature[def.browserSourceName] === sceneItemSignature) {
        return { sceneName: DOCK_PRESENTATION_SCENE, browserItemId };
      }
      try {
        await this.call("SetSceneItemTransform", {
          sceneName: DOCK_PRESENTATION_SCENE,
          sceneItemId: browserItemId,
          positionX: 0, positionY: 0,
          boundsType: "OBS_BOUNDS_STRETCH",
          boundsWidth: canvas.width, boundsHeight: canvas.height,
          boundsAlignment: 0, rotation: 0,
        });
        await this.call("SetSceneItemIndex", { sceneName: DOCK_PRESENTATION_SCENE, sceneItemId: browserItemId, sceneItemIndex: 0 });
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
    let neededKind: "image_source" | "color_source_v3" | "ffmpeg_source" | null = null;
    let neededSettings: Record<string, unknown> = {};
    if (nativeBg) {
      neededKind = nativeBg.inputKind;
      neededSettings = nativeBg.inputSettings;
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
        boundsType: "OBS_BOUNDS_STRETCH",
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
