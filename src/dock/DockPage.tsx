/**
 * DockPage.tsx — MakeChurchEasy Dock Control Panel
 *
 * The dock keeps Bible, Worship, and Media production controls inside OBS.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { dockClient, type DockStateMessage } from "../services/dockBridge";
import { dockObsClient, type DockObsStatus } from "./dockObsClient";
import { DOCK_TABS, type DockTab, type DockStagedItem } from "./dockTypes";
import DockBibleTab from "./tabs/DockBibleTab";
import DockMediaTab from "./tabs/DockMediaTab";
import DockWorshipTab from "./tabs/DockWorshipTab";
import DockPlannerTab from "./tabs/DockPlannerTab";
import DockMultiviewTab from "./tabs/DockMultiviewTab";
import DockMinistryTab from "./tabs/DockMinistryTab";
import { useAppTheme } from "../hooks/useAppTheme";
import {
  type DockProductionSettingsPayload,
  getDefaultDockProductionSettings,
  loadDockProductionSettings,
} from "../services/productionSettings";
import type { ServicePlannerSnapshot } from "../service-planner/types";
import { installDockTextShortcuts } from "./dockTextShortcuts";
import { useKeyboardShortcuts, type ShortcutDefinition, formatShortcut } from "./useKeyboardShortcuts";
import BibleCommandPalette from "../components/BibleCommandPalette";
import { BibleProvider } from "../bible/bibleStore";
import { useDockDragDrop } from "./useDockDragDrop";
import { useDockUpload } from "./useDockUpload";
import { ensureObsConnected } from "./obsConnectionGuard";
import { getUserScopedKey } from "../services/userScopedStorage";
import DockDropOverlay from "./DockDropOverlay";
import DockUploadToasts from "./DockUploadToasts";
import { DockUpgradeModal } from "./components/DockUpgradeModal";
import { registerUpgradeModal, startPlanRefresh } from "./dockEntitlement";
import { fetchPlanFromOverlayServer } from "../services/entitlementClient";
import "./dock.css";
import "./dock-theme.css";
import Icon from "./DockIcon";

const DOCK_SHELL_PREFS_KEY = "ocs-dock-shell-preferences";
const DOCK_STAGED_ITEM_KEY = "ocs-dock-staged-item";

interface DockShellPreferences {
  activeTab?: DockTab | "live";
  disabledTabs?: DockTab[];
}

interface ProjectionSettings {
  /** "auto-duplicate" = clone current Program scene into MCE Presentation; "no-clone" = skip */
  sceneMode: "auto-duplicate" | "no-clone";
  /** "ticker-above" = ticker stays on top; "content-above" = MCE content on top (default) */
  tickerLayerPriority: "ticker-above" | "content-above";
  /** When true, restore the original Program scene after projection ends */
  restoreOriginalScene: boolean;
}

const PROJECTION_SETTINGS_KEY = "ocs-dock-projection-settings";
const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
  sceneMode: "auto-duplicate",
  tickerLayerPriority: "content-above",
  restoreOriginalScene: false,
};

function loadProjectionSettings(): ProjectionSettings {
  try {
    const raw = localStorage.getItem(getUserScopedKey(PROJECTION_SETTINGS_KEY));
    if (!raw) return { ...DEFAULT_PROJECTION_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ProjectionSettings>;
    return { ...DEFAULT_PROJECTION_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_PROJECTION_SETTINGS };
  }
}

function saveProjectionSettings(next: ProjectionSettings): void {
  try {
    localStorage.setItem(getUserScopedKey(PROJECTION_SETTINGS_KEY), JSON.stringify(next));
  } catch {
    // ignore OBS CEF storage failures
  }
}

function resolveDockTab(tab?: DockTab | "live" | null): DockTab {
  if (tab === "planner" || tab === "bible" || tab === "worship" || tab === "media" || tab === "multiview" || tab === "ministry") {
    return tab;
  }
  return "bible";
}

function loadDockStagedItem(): DockStagedItem | null {
  try {
    const raw = localStorage.getItem(DOCK_STAGED_ITEM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DockStagedItem | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.type !== "string" || typeof parsed.label !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDockStagedItem(item: DockStagedItem | null): void {
  try {
    if (!item) {
      localStorage.removeItem(DOCK_STAGED_ITEM_KEY);
      return;
    }
    localStorage.setItem(DOCK_STAGED_ITEM_KEY, JSON.stringify(item));
  } catch {
    // ignore OBS CEF storage failures
  }
}

function isDockProductionSettingsPayload(value: unknown): value is DockProductionSettingsPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DockProductionSettingsPayload>;
  return Boolean(
    candidate.bible &&
    candidate.worship &&
    candidate.bible.fullscreenTheme &&
    candidate.bible.lowerThirdTheme &&
    candidate.worship.fullscreenTheme &&
    candidate.worship.lowerThirdTheme,
  );
}

function loadDockShellPreferences(): DockShellPreferences {
  try {
    const raw = localStorage.getItem(DOCK_SHELL_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DockShellPreferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDockShellPreferences(next: DockShellPreferences): void {
  try {
    localStorage.setItem(DOCK_SHELL_PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore OBS CEF storage failures
  }
}

function getCompactDockTabLabel(tab: DockTab): string {
  switch (tab) {
    case "bible":
      return "Bible";
    case "worship":
      return "Worship";
    case "media":
      return "Media";
    case "ministry":
      return "Ministry";
    case "planner":
      return "Planner";
    case "multiview":
      return "Multi-View";
    default:
      return "Tab";
  }
}

export default function DockPage() {
  const dockRootRef = useRef<HTMLDivElement>(null);
  const shellPreferences = loadDockShellPreferences();
  const { effective, setTheme } = useAppTheme();
  const [activeTab, setActiveTab] = useState<DockTab>(() => resolveDockTab(shellPreferences.activeTab));
  const [disabledTabs, setDisabledTabs] = useState<DockTab[]>(() => shellPreferences.disabledTabs ?? []);
  const [tickerOutputMode, setTickerOutputMode] = useState<"source" | "scene">(() => {
    try { return (localStorage.getItem("dock-ticker-output-mode") as "source" | "scene") || "source"; } catch { return "source"; }
  });
  const [obsConnected, setObsConnected] = useState(false);
  const [obsError, setObsError] = useState("");
  const [isReloadingDock, setIsReloadingDock] = useState(false);
  const [staged, setStaged] = useState<DockStagedItem | null>(() => loadDockStagedItem());
  const [appConnected, setAppConnected] = useState(false);
  const [obsUrlInput, setObsUrlInput] = useState("ws://localhost:4455");
  const [obsPwInput, setObsPwInput] = useState("");
  const [productionSettings, setProductionSettings] = useState<DockProductionSettingsPayload>(
    getDefaultDockProductionSettings(),
  );
  const [servicePlanner, setServicePlanner] = useState<ServicePlannerSnapshot | null>(null);
  const [movePluginInstalled, setMovePluginInstalled] = useState<boolean | null>(null);
  const [moveNoticeDismissed, setMoveNoticeDismissed] = useState(false);
  const [moveUrlCopied, setMoveUrlCopied] = useState(false);
  const [projectionSettings, setProjectionSettings] = useState<ProjectionSettings>(() => loadProjectionSettings());
  const [upgradeModalMsg, setUpgradeModalMsg] = useState("");

  // Register the upgrade modal trigger so any dock tab can show it.
  useEffect(() => {
    registerUpgradeModal((msg) => setUpgradeModalMsg(msg));
    startPlanRefresh();

    // Also listen for custom dock-upgrade events (from GrowthBadge, etc.)
    const handleUpgradeEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) setUpgradeModalMsg(detail.message);
    };
    window.addEventListener("dock-upgrade", handleUpgradeEvent);
    return () => window.removeEventListener("dock-upgrade", handleUpgradeEvent);
  }, []);

  // ── Force update check (dock runs in OBS CEF, no Tauri updater) ──
  const [versionAge, setVersionAge] = useState<{ daysOld: number; forceUpdate: boolean; currentVersion?: string; latestVersion?: string }>({ daysOld: 0, forceUpdate: false });

  // ── Global drag-and-drop ──
  const { isDragging, onDrop: registerDropHandler } = useDockDragDrop();
  const { uploading, uploadProgress, toasts: uploadToasts, handleFiles, dismissToast } = useDockUpload();

  useEffect(() => {
    return registerDropHandler(handleFiles);
  }, [registerDropHandler, handleFiles]);

  useEffect(() => {
    saveDockShellPreferences({ activeTab, disabledTabs });
  }, [activeTab, disabledTabs]);

  // Refresh plan from overlay server on every tab switch
  useEffect(() => {
    void fetchPlanFromOverlayServer();
  }, [activeTab]);

  // Refresh plan from overlay server on any click in the dock (debounced)
  useEffect(() => {
    let lastRefresh = 0;
    const MIN_INTERVAL = 10_000; // don't poll more than once per 10s
    const handleClick = () => {
      const now = Date.now();
      if (now - lastRefresh < MIN_INTERVAL) return;
      lastRefresh = now;
      void fetchPlanFromOverlayServer();
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    saveDockStagedItem(staged);
  }, [staged]);

  useEffect(() => {
    saveProjectionSettings(projectionSettings);
  }, [projectionSettings]);

  useEffect(() => installDockTextShortcuts(), []);

  useEffect(() => {
    void loadDockProductionSettings().then(setProductionSettings).catch(() => { });
  }, []);

  // Check Move plugin status when OBS connects
  useEffect(() => {
    if (!obsConnected) return;
    void dockObsClient.isMovePluginInstalled().then(setMovePluginInstalled).catch(() => setMovePluginInstalled(false));
  }, [obsConnected]);

  // ── Force update: fetch latest release info and check pub_date ──
  useEffect(() => {
    const RELEASES_API = "https://api.github.com/repos/jolamyfoodsng/makechurcheasy-releases/releases/latest";
    const FORCE_UPDATE_DAYS = 21;
    const CACHE_KEY = "ocs-dock-update-cache-v1";

    const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined;

    fetch(RELEASES_API)
      .then((r) => r.json())
      .then((release: { published_at?: string; tag_name?: string }) => {
        if (!release.published_at) return;
        const releaseDate = new Date(release.published_at);
        const now = new Date();
        const daysOld = Math.floor((now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));

        // Cache for offline fallback
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ date: release.published_at, version: release.tag_name }));
        } catch { /* non-critical */ }

        if (daysOld >= FORCE_UPDATE_DAYS) {
          setVersionAge({ daysOld, forceUpdate: true, currentVersion, latestVersion: release.tag_name });
        }
      })
      .catch(() => {
        // Offline fallback: use cached release date to still enforce 21-day lockout
        try {
          const raw = localStorage.getItem(CACHE_KEY);
          if (raw) {
            const cached = JSON.parse(raw) as { date: string; version: string };
            const releaseDate = new Date(cached.date);
            const now = new Date();
            const daysOld = Math.floor((now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysOld >= FORCE_UPDATE_DAYS) {
              setVersionAge({ daysOld, forceUpdate: true, currentVersion, latestVersion: cached.version });
            }
          }
        } catch { /* non-critical */ }
      });
  }, []);

  const handleOpenMovePlugin = useCallback(() => {
    const url = dockObsClient.getMovePluginDownloadInfo().url;
    // The dock runs in OBS's embedded CEF browser — window.open() stays
    // inside CEF. Route through the overlay server which runs in the
    // native Tauri process and can open the system default browser.
    fetch(`http://127.0.0.1:45678/api/open-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => {
      // Fallback: copy URL to clipboard
      navigator.clipboard.writeText(url).then(() => {
        setMoveUrlCopied(true);
        setTimeout(() => setMoveUrlCopied(false), 3000);
      }).catch(() => { });
    });
  }, []);

  const waitForDockObsConnected = useCallback(async (timeoutMs = 4000) => {
    const startedAt = Date.now();
    while (!dockObsClient.isConnected && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return dockObsClient.isConnected;
  }, []);

  const handleReloadDock = useCallback(async () => {
    if (isReloadingDock) return;
    setIsReloadingDock(true);
    try {
      await dockObsClient.connect(undefined, undefined, true);
      const reconnected = await waitForDockObsConnected();
      if (!reconnected) {
        console.warn("[DockPage] OBS reconnect did not complete before reload; reloading anyway.");
      }
    } finally {
      window.location.reload();
    }
  }, [isReloadingDock, waitForDockObsConnected]);

  useEffect(() => {
    dockClient.init();

    // ── Aggressive auto-reconnect on every dock reload ──
    // Immediately attempt connection using persisted params (URL query → saved → default).
    // If the first attempt fails, retry every 2 seconds until OBS is reachable.
    let autoReconnectTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const tryConnect = () => {
      if (disposed) return;
      if (dockObsClient.isConnected) {
        if (autoReconnectTimer) { clearInterval(autoReconnectTimer); autoReconnectTimer = null; }
        return;
      }
      void dockObsClient.connect();
    };

    // First attempt — immediate
    tryConnect();

    // Retry every 2 seconds until connected
    autoReconnectTimer = setInterval(tryConnect, 2000);

    const unsubObs = dockObsClient.onStatusChange((status: DockObsStatus, err?: string) => {
      setObsConnected(status === "connected");
      setObsError(status === "error" ? (err || "Connection failed") : "");

      if (status === "connected") {
        // Stop auto-reconnect — we're connected
        if (autoReconnectTimer) { clearInterval(autoReconnectTimer); autoReconnectTimer = null; }

        dockObsClient.recoverLiveState().then((recovered) => {
          setStaged((current) => {
            if (current) return current;
            if (recovered.bible) {
              setActiveTab("bible");
              const compare = recovered.bible.compare;
              const leftColumn = compare?.columns?.[0] ?? null;
              const compareLabel =
                compare?.columns?.map((column) => column.referenceLabel).filter(Boolean).join(" | ") || "";
              const compareSubtitle =
                compare?.columns?.map((column) => column.translation).filter(Boolean).join(" · ") || "";
              return {
                type: "bible",
                label: compareLabel || recovered.bible.reference || "Bible Verse",
                subtitle: compareSubtitle || recovered.bible.text || "",
                data: {
                  book: leftColumn?.book ?? "",
                  chapter: leftColumn?.chapter ?? 0,
                  verse: leftColumn?.verse ?? 0,
                  verseEnd: leftColumn?.verseEnd ?? leftColumn?.verse ?? 0,
                  verseRange: leftColumn?.verseRange ?? "",
                  translation: leftColumn?.translation ?? "",
                  referenceLabel: compareLabel || recovered.bible.reference,
                  verseText: recovered.bible.text,
                  overlayMode: recovered.bible.overlayMode,
                  compare,
                  _recovered: true,
                  _dockLive: true,
                },
              };
            }
            if (recovered.worship) {
              setActiveTab("worship");
              return {
                type: "worship",
                label: recovered.worship.sectionLabel || "Worship",
                subtitle: recovered.worship.songTitle || "",
                data: {
                  sectionText: recovered.worship.sectionText,
                  sectionLabel: recovered.worship.sectionLabel,
                  song: { title: recovered.worship.songTitle, artist: recovered.worship.artist },
                  overlayMode: recovered.worship.overlayMode,
                  _recovered: true,
                  _dockLive: true,
                },
              };
            }
            return null;
          });
        }).catch((error) => {
          console.warn("[Dock] Failed to recover live state:", error);
        });
      }
    });

    const unsubState = dockClient.onState((msg: DockStateMessage) => {
      switch (msg.type) {
        case "state:pong":
          setAppConnected(true);
          break;
        case "state:obs-status":
          if (!dockObsClient.isConnected) {
            setObsConnected((msg.payload as { connected: boolean }).connected);
          }
          break;
        case "state:branding-updated": {
          void dockObsClient.refreshBrandingCache().catch(() => { });
          break;
        }
        case "state:update": {
          setAppConnected(true);
          const payload = msg.payload as Record<string, unknown>;
          if (!dockObsClient.isConnected && typeof payload.obsConnected === "boolean") {
            setObsConnected(payload.obsConnected);
          }
          if (isDockProductionSettingsPayload(payload.productionSettings)) {
            setProductionSettings(payload.productionSettings);
          }
          if (payload.servicePlanner) {
            setServicePlanner(payload.servicePlanner as ServicePlannerSnapshot);
          }
          break;
        }
        case "state:service-plans": {
          setServicePlanner(msg.payload as ServicePlannerSnapshot);
          break;
        }
        default:
          break;
      }
    });

    const pingInterval = window.setInterval(() => {
      dockClient.sendCommand({ type: "ping", timestamp: Date.now() });
    }, 5000);

    dockClient.sendCommand({ type: "request-state", timestamp: Date.now() });

    return () => {
      disposed = true;
      if (autoReconnectTimer) clearInterval(autoReconnectTimer);
      unsubObs();
      unsubState();
      window.clearInterval(pingInterval);
      dockObsClient.disconnect();
    };
  }, []);

  const handleStage = useCallback((item: DockStagedItem | null) => {
    setStaged(item);
  }, []);

  const handleManualConnect = useCallback(async () => {
    setObsError("");
    try {
      await ensureObsConnected(obsUrlInput, obsPwInput || undefined);
    } catch (err) {
      setObsError(err instanceof Error ? err.message : "Connection failed");
    }
  }, [obsPwInput, obsUrlInput]);

  const activeTabDef = DOCK_TABS.find((tab) => tab.id === activeTab) ?? DOCK_TABS[0];
  const nextTheme = effective === "dark" ? "light" : "dark";
  const themeToggleLabel = nextTheme === "dark" ? "Switch to dark mode" : "Switch to light mode";
  const themeToggleIcon = nextTheme === "dark" ? "moon" : "sun";

  // ── Keyboard Shortcuts ──────────────────────────────────────────────────
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // ── Command Palette ──
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] = useState("");

  const openCommandPalette = useCallback((initialQuery = "") => {
    setCommandPaletteInitialQuery(initialQuery);
    setShowCommandPalette(true);
  }, []);

  const handleCommandPaletteSelectBibleVerse = useCallback((_book: string, _chapter: number, _verse: number) => {
    setActiveTab("bible");
    setShowCommandPalette(false);
  }, []);

  const handleCommandPaletteSelectTemplate = useCallback((_templateKind: "bible" | "lower-third", _themeId: string) => {
    setShowCommandPalette(false);
  }, []);

  // ── Global input handler to open command palette on text input ──
  useEffect(() => {
    const handleInput = (e: Event) => {
      const target = e.target as HTMLElement;
      // Only trigger on text inputs and textareas — skip file, checkbox, etc.
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        if (target instanceof HTMLInputElement && target.type !== "text" && target.type !== "search") return;
        const value = target.value?.trim() || "";
        // Open palette if user types a meaningful query (3+ chars)
        if (value.length >= 3 && /[a-zA-Z0-9]/.test(value)) {
          openCommandPalette(value);
        }
      }
    };

    document.addEventListener("input", handleInput);
    return () => document.removeEventListener("input", handleInput);
  }, [openCommandPalette]);

  const shortcuts: ShortcutDefinition[] = [
    { key: "2", handler: () => setActiveTab("bible"), label: "Bible", category: "Navigation" },
    { key: "3", handler: () => setActiveTab("worship"), label: "Worship", category: "Navigation" },
    { key: "4", handler: () => setActiveTab("media"), label: "Media", category: "Navigation" },
    { key: "5", handler: () => setActiveTab("planner"), label: "Planner", category: "Navigation" },
    { key: "6", handler: () => setActiveTab("multiview"), label: "Multi-View", category: "Navigation" },
    { key: "7", handler: () => setActiveTab("ministry"), label: "Ministry", category: "Navigation" },
    { key: "k", handler: () => openCommandPalette(""), label: "Command Palette", category: "Utility" },
    { key: "t", handler: () => setTheme(nextTheme), label: themeToggleLabel, category: "Utility" },
    { key: "/", handler: () => setShowShortcutsHelp((v) => !v), label: "Shortcuts help", category: "Utility" },
  ];

  const { toasts } = useKeyboardShortcuts(shortcuts, true);

  // ── Settings Menu State ──
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [showBibleOptions, setShowBibleOptions] = useState(false);
  const [showTabVisibility, setShowTabVisibility] = useState(false);
  const [showProjectionSettings, setShowProjectionSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="dock-root" ref={dockRootRef}>
      {/* ── Force Update Banner ── */}
      {versionAge.forceUpdate && (
        <div className="dock-force-update-banner">
          <Icon name="warning" size={14} />
          <span>
            Update required — your version is {versionAge.daysOld} days old.
            {versionAge.currentVersion && versionAge.latestVersion && (
              <> v{versionAge.currentVersion} → v{versionAge.latestVersion}</>
            )}
          </span>
          <a
            href={(() => {
              const ua = navigator.userAgent.toLowerCase();
              if (ua.includes("mac")) return "https://github.com/jolamyfoodsng/makechurcheasy-releases/releases/download/v4.38.0/MakeChurchEasy_4.38.0_aarch64.dmg";
              return "https://github.com/jolamyfoodsng/makechurcheasy-releases/releases/download/v4.38.0/MakeChurchEasy_4.38.0_x64-setup.exe";
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="dock-force-update-banner__link"
          >
            Download Update
          </a>
        </div>
      )}

      <div className="dock-shell-header">
        <div className="dock-shell-status">
          <div className="dock-shell-status__left">
            <button
              type="button"
              className="dock-shell-icon-btn"
              onClick={() => setShowSettingsMenu(true)}
              aria-label="Menu"
              title="Menu"
            >
              <Icon name="menu" size={14} />
            </button>
            <div className="dock-shell-status__center">
              <div className="dock-shell-titleline">
                <span className="dock-shell-titleline__app">VC Studio</span>
                <span className="dock-shell-titleline__divider">/</span>
                <span className="dock-shell-titleline__section">{activeTabDef.label}</span>
              </div>
            </div>
          </div>



          <div className="dock-shell-status__right">
            <button
              type="button"
              className="dock-shell-icon-btn"
              onClick={() => void handleReloadDock()}
              aria-label="Reload dock"
              title={isReloadingDock ? "Reconnecting..." : "Reload dock"}
              disabled={isReloadingDock}
            >
              <Icon name="refresh" size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Sidebar ── */}
      {showSettingsMenu && (
        <div className="dock-sidebar-backdrop" onClick={() => setShowSettingsMenu(false)}>
          <div className="dock-sidebar" onClick={(e) => e.stopPropagation()}>
            <div className="dock-sidebar__header">
              <span className="dock-sidebar__title">Menu</span>
              <button
                type="button"
                className="dock-shell-icon-btn"
                onClick={() => setShowSettingsMenu(false)}
                aria-label="Close menu"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="dock-sidebar__content">
              {/* Theme */}
              <button
                type="button"
                className="dock-sidebar__item"
                onClick={() => {
                  setTheme(nextTheme);
                  setShowSettingsMenu(false);
                }}
              >
                <Icon name={themeToggleIcon} size={16} />
                <span>{themeToggleLabel}</span>
              </button>

              {/* Bible Options */}
              <button
                type="button"
                className="dock-sidebar__item"
                onClick={() => setShowBibleOptions(!showBibleOptions)}
              >
                <Icon name="menu_book" size={16} />
                <span>Bible Options</span>
                <Icon name={showBibleOptions ? "expand_less" : "expand_more"} size={14} />
              </button>
              {showBibleOptions && (
                <div className="dock-sidebar__subpanel">
                  <label className="dock-sidebar__check">
                    <input type="checkbox" defaultChecked /> Show Bible version
                  </label>
                  <label className="dock-sidebar__check">
                    <input type="checkbox" defaultChecked /> Shorten version
                  </label>
                  <label className="dock-sidebar__check">
                    <input type="checkbox" /> Shorten book names
                  </label>
                  <label className="dock-sidebar__check">
                    <input type="checkbox" /> Show verse numbers
                  </label>
                  <label className="dock-sidebar__check">
                    <input type="checkbox" defaultChecked /> Capitalized references
                  </label>
                  <label className="dock-sidebar__check">
                    <input type="checkbox" defaultChecked /> Version switch updates output
                  </label>
                </div>
              )}

              <div className="dock-sidebar__divider" />

              {/* Tab Visibility */}
              <button
                type="button"
                className="dock-sidebar__item"
                onClick={() => setShowTabVisibility(!showTabVisibility)}
              >
                <Icon name="visibility" size={16} />
                <span>Tab Visibility</span>
                <Icon name={showTabVisibility ? "expand_less" : "expand_more"} size={14} />
              </button>
              {showTabVisibility && (() => {
                const toggleableTabs: Array<{ tab: DockTab; label: string; icon: string }> = [
                  { tab: "multiview", label: "Multi-View", icon: "grid_view" },
                  { tab: "ministry", label: "Ministry", icon: "campaign" },
                ];
                return (
                  <div className="dock-sidebar__subpanel">
                    {toggleableTabs.map(({ tab, label, icon }) => {
                      const isDisabled = disabledTabs.includes(tab);
                      return (
                        <label
                          key={tab}
                          className="dock-sidebar__check"
                          style={{ cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={!isDisabled}
                            onChange={() => {
                              setDisabledTabs((prev) => {
                                const next = isDisabled
                                  ? prev.filter((t) => t !== tab)
                                  : [...prev, tab];
                                return next;
                              });
                              // If the user is on a tab that just got disabled, switch away
                              if (!isDisabled && activeTab === tab) {
                                setActiveTab("bible");
                              }
                            }}
                          />
                          <Icon name={icon} size={13} />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="dock-sidebar__divider" />

              {/* Ticker Output */}
              <div className="dock-sidebar__item" style={{ cursor: "default" }}>
                <Icon name="campaign" size={16} />
                <span>Ticker Output</span>
              </div>
              <div className="dock-sidebar__subpanel">
                {([
                  { mode: "source" as const, icon: "view_module", label: "Source", desc: "Inside current scene" },
                  { mode: "scene" as const, icon: "dashboard", label: "Scene", desc: "Dedicated scene with program behind" },
                ]).map(({ mode, icon, label, desc }) => (
                  <button
                    key={mode}
                    type="button"
                    className="dock-sidebar__radio"
                    onClick={() => {
                      setTickerOutputMode(mode);
                      try { localStorage.setItem("dock-ticker-output-mode", mode); } catch { /* ignore */ }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "6px 8px",
                      border: "none",
                      borderRadius: 3,
                      background: tickerOutputMode === mode ? "var(--dock-accent-bg, rgba(99,102,241,0.12))" : "transparent",
                      color: tickerOutputMode === mode ? "var(--dock-accent, #6366f1)" : "var(--dock-text, #e2e8f0)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 11,
                      transition: "background 0.15s",
                    }}
                  >
                    <Icon name={icon} size={14} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: 10, opacity: 0.6 }}>{desc}</div>
                    </div>
                    {tickerOutputMode === mode && <Icon name="check" size={12} />}
                  </button>
                ))}
              </div>

              <div className="dock-sidebar__divider" />

              {/* Projection Settings */}
              <button
                type="button"
                className="dock-sidebar__item"
                onClick={() => setShowProjectionSettings(!showProjectionSettings)}
              >
                <Icon name="videocam" size={16} />
                <span>Projection Settings</span>
                <Icon name={showProjectionSettings ? "expand_less" : "expand_more"} size={14} />
              </button>
              {showProjectionSettings && (
                <div className="dock-sidebar__subpanel">
                  {/* Scene Handling */}
                  <div className="dock-sidebar__section-label">Scene Handling</div>
                  <div className="dock-sidebar__radio-group">
                    {([
                      { mode: "auto-duplicate" as const, icon: "content_copy", label: "Auto Duplicate Program Scene", desc: "Creates a temporary copy and inserts it in VC" },
                      { mode: "no-clone" as const, icon: "block", label: "Don't Clone Program Scene", desc: "Projects directly without duplicating" },
                    ]).map(({ mode, icon, label, desc }) => (
                      <button
                        key={mode}
                        type="button"
                        className="dock-sidebar__radio"
                        onClick={() => setProjectionSettings((s) => ({ ...s, sceneMode: mode }))}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "6px 8px",
                          border: "none",
                          borderRadius: 3,
                          background: projectionSettings.sceneMode === mode ? "var(--dock-accent-bg, rgba(99,102,241,0.12))" : "transparent",
                          color: projectionSettings.sceneMode === mode ? "var(--dock-accent, #6366f1)" : "var(--dock-text, #e2e8f0)",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 11,
                          transition: "background 0.15s",
                        }}
                      >
                        <Icon name={icon} size={14} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{label}</div>
                          <div style={{ fontSize: 10, opacity: 0.6 }}>{desc}</div>
                        </div>
                        {projectionSettings.sceneMode === mode && <Icon name="check" size={12} />}
                      </button>
                    ))}
                  </div>

                  {/* Ticker Layer Priority */}
                  <div className="dock-sidebar__section-label" style={{ marginTop: 8 }}>Ticker Layer Priority</div>
                  <div className="dock-sidebar__radio-group">
                    {([
                      { mode: "content-above" as const, icon: "flip_to_back", label: "Content Above Ticker", desc: "MakeChurchEasy content takes priority over ticker" },
                      { mode: "ticker-above" as const, icon: "flip_to_front", label: "Ticker Above Content", desc: "Ticker remains visible on top" },
                    ]).map(({ mode, icon, label, desc }) => (
                      <button
                        key={mode}
                        type="button"
                        className="dock-sidebar__radio"
                        onClick={() => setProjectionSettings((s) => ({ ...s, tickerLayerPriority: mode }))}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "6px 8px",
                          border: "none",
                          borderRadius: 3,
                          background: projectionSettings.tickerLayerPriority === mode ? "var(--dock-accent-bg, rgba(99,102,241,0.12))" : "transparent",
                          color: projectionSettings.tickerLayerPriority === mode ? "var(--dock-accent, #6366f1)" : "var(--dock-text, #e2e8f0)",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 11,
                          transition: "background 0.15s",
                        }}
                      >
                        <Icon name={icon} size={14} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{label}</div>
                          <div style={{ fontSize: 10, opacity: 0.6 }}>{desc}</div>
                        </div>
                        {projectionSettings.tickerLayerPriority === mode && <Icon name="check" size={12} />}
                      </button>
                    ))}
                  </div>

                  {/* Restore Original Scene */}
                  <label
                    className="dock-sidebar__check"
                    style={{ marginTop: 8, cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={projectionSettings.restoreOriginalScene}
                      onChange={(e) => setProjectionSettings((s) => ({ ...s, restoreOriginalScene: e.target.checked }))}
                    />
                    <span>Restore scene after projection</span>
                  </label>
                  <div style={{ fontSize: 10, opacity: 0.5, padding: "2px 8px 0 22px", lineHeight: 1.4 }}>
                    Returns OBS to its previous state after projection ends
                  </div>
                </div>
              )}

              <div className="dock-sidebar__divider" />

              {/* History */}
              <button
                type="button"
                className="dock-sidebar__item"
                onClick={() => {
                  setShowHistory(true);
                  setShowSettingsMenu(false);
                }}
              >
                <Icon name="history" size={16} />
                <span>History</span>
              </button>

              <div className="dock-sidebar__divider" />

              {/* OBS Connection */}
              <button
                type="button"
                className="dock-sidebar__item"
                onClick={() => {
                  setShowSettingsMenu(false);
                  setShowReconnectModal(true);
                }}
              >
                <Icon name="link" size={16} />
                <span>{obsConnected ? "Reconnect" : "Connect"} to OBS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showReconnectModal && (
        <div className="dock-dialog-backdrop" onClick={() => setShowReconnectModal(false)}>
          <div className="dock-dialog dock-dialog--compact" onClick={(e) => e.stopPropagation()}>
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">Connection</div>
                <h2 className="dock-dialog__title">OBS WebSocket</h2>
              </div>
              <button
                type="button"
                className="dock-dialog__close"
                onClick={() => setShowReconnectModal(false)}
                aria-label="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              {obsError && (
                <div className="dock-error-msg">
                  <Icon name="error" size={14} />
                  {obsError}
                </div>
              )}
              <div className="dock-settings-form">
                <input
                  className="dock-input"
                  placeholder="ws://localhost:4455"
                  value={obsUrlInput}
                  onChange={(event) => setObsUrlInput(event.target.value)}
                />
                <input
                  className="dock-input"
                  type="password"
                  placeholder="Password (optional)"
                  value={obsPwInput}
                  onChange={(event) => setObsPwInput(event.target.value)}
                />
                <button
                  type="button"
                  className="dock-btn dock-btn--preview dock-btn--block"
                  onClick={() => {
                    void handleManualConnect();
                    setShowReconnectModal(false);
                  }}
                >
                  <Icon name="link" size={16} />
                  {obsConnected ? "Reconnect" : "Connect"}
                </button>
              </div>
              <div className="dock-settings-panel__hint">
                Make sure OBS → Tools → WebSocket Server Settings is enabled.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move Plugin Notice */}
      {obsConnected && movePluginInstalled === false && !moveNoticeDismissed && (
        <div className="dock-settings-panel" style={{ background: "var(--dock-yellow-soft, rgba(255, 193, 7, 0.1))", borderBottom: "1px solid var(--dock-yellow, #ffc107)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
            <Icon name="info" size={14} style={{ color: "var(--dock-yellow, #ffc107)" }} />
            <span style={{ color: "var(--dock-text)" }}>
              <strong>Move Transition</strong> plugin not detected — animated scene items require it.
            </span>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); handleOpenMovePlugin(); }}
              className="dock-btn dock-btn--preview"
              style={{ marginLeft: "auto", padding: "2px 6px", fontSize: 10, whiteSpace: "nowrap" }}
            >
              <Icon name="download" size={12} />
              {moveUrlCopied ? "URL Copied!" : "Install"}
            </a>
            <button
              type="button"
              className="dock-toolbar__btn"
              onClick={() => setMoveNoticeDismissed(true)}
              title="Dismiss"
              style={{ width: 20, height: 20, padding: 0, border: "none", flexShrink: 0 }}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
          <div className="dock-settings-panel__hint" style={{ color: "var(--dock-text-dim)" }}>
            {dockObsClient.getMovePluginDownloadInfo().instructions}
          </div>
        </div>
      )}

      <div className="dock-content">
        <div className="dock-content-main">
          {activeTab === "planner" && (
            <DockPlannerTab
              staged={staged}
              onStage={handleStage}
              initialSnapshot={servicePlanner}
            />
          )}
          {activeTab === "bible" && (
            <DockBibleTab
              staged={staged}
              onStage={handleStage}
              productionDefaults={productionSettings.bible}
              appConnected={appConnected}
              showHistory={showHistory}
              onHistoryClose={() => setShowHistory(false)}
            />
          )}
          {activeTab === "worship" && (
            <DockWorshipTab
              staged={staged}
              onStage={handleStage}
              productionDefaults={productionSettings.worship}
            />
          )}
          {activeTab === "media" && (
            <DockMediaTab
              staged={staged}
              onStage={handleStage}
            />
          )}
          {activeTab === "multiview" && (
            <DockMultiviewTab />
          )}
          {activeTab === "ministry" && (
            <DockMinistryTab
              staged={staged}
              onStage={handleStage}
              tickerOutputMode={tickerOutputMode}
            />
          )}
        </div>
      </div>

      <nav className="dock-bottom-nav" aria-label="Dock sections">
        {DOCK_TABS.filter((tab) => !disabledTabs.includes(tab.id)).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dock-bottom-nav__item${activeTab === tab.id ? " dock-bottom-nav__item--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            aria-label={tab.label}
            title={tab.label}
            data-label={tab.label}
            data-summary={tab.summary}
          >
            <Icon name={tab.icon} size={14} className="dock-bottom-nav__icon" />
            <span className="dock-bottom-nav__label-short">{getCompactDockTabLabel(tab.id)}</span>
          </button>
        ))}
      </nav>

      {/* Keyboard shortcut toast feedback */}
      {toasts.length > 0 && (
        <div className="dock-shortcut-toasts" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className="dock-shortcut-toast">
              {toast.label}
            </div>
          ))}
        </div>
      )}

      {/* Keyboard shortcuts help overlay */}
      {showShortcutsHelp && (
        <div
          className="dock-shortcuts-overlay"
          onClick={() => setShowShortcutsHelp(false)}
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <div className="dock-shortcuts-overlay__content" onClick={(e) => e.stopPropagation()}>
            <div className="dock-shortcuts-overlay__header">
              <div>
                <div className="dock-shortcuts-overlay__eyebrow">Dock</div>
                <div className="dock-shortcuts-overlay__title">Keyboard Shortcuts</div>
              </div>
              <button
                type="button"
                className="dock-shortcuts-overlay__close"
                onClick={() => setShowShortcutsHelp(false)}
                aria-label="Close shortcuts"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="dock-shortcuts-overlay__body">
              <div className="dock-shortcuts-section">
                <div className="dock-shortcuts-section__label">Navigation</div>
                <div className="dock-shortcuts-list">
                  {[
                    { key: "2", label: "Bible" },
                    { key: "3", label: "Worship" },
                    { key: "4", label: "Media" },
                    { key: "5", label: "Planner" },
                    { key: "6", label: "Multi-View" },
                  ].map((s) => (
                    <div key={s.key} className="dock-shortcuts-item">
                      <span className="dock-shortcuts-item__key">{formatShortcut(s.key)}</span>
                      <span className="dock-shortcuts-item__label">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="dock-shortcuts-section">
                <div className="dock-shortcuts-section__label">Utility</div>
                <div className="dock-shortcuts-list">
                  {[
                    { key: "k", label: "Command Palette" },
                    { key: "t", label: "Toggle theme" },
                    { key: "s", label: "Toggle settings" },
                    { key: "/", label: "This help overlay" },
                  ].map((s) => (
                    <div key={s.key} className="dock-shortcuts-item">
                      <span className="dock-shortcuts-item__key">{formatShortcut(s.key)}</span>
                      <span className="dock-shortcuts-item__label">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dock-shortcuts-overlay__footer">
              Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>/</kbd> to toggle this overlay
            </div>
          </div>
        </div>
      )}

      {/* ── Command Palette ── */}
      <BibleProvider>
        <BibleCommandPalette
          open={showCommandPalette}
          initialQuery={commandPaletteInitialQuery}
          onClose={() => setShowCommandPalette(false)}
          onSelectBibleVerse={handleCommandPaletteSelectBibleVerse}
          onSelectTemplate={handleCommandPaletteSelectTemplate}
        />
      </BibleProvider>

      {/* ── Global drag-and-drop overlay ── */}
      <DockDropOverlay visible={isDragging} />

      {/* ── Upload toasts ── */}
      <DockUploadToasts
        toasts={uploadToasts}
        uploading={uploading}
        progress={uploadProgress}
        onDismiss={dismissToast}
      />

      {/* ── Entitlement upgrade modal ── */}
      <DockUpgradeModal
        open={Boolean(upgradeModalMsg)}
        onClose={() => setUpgradeModalMsg("")}
        message={upgradeModalMsg}
      />
    </div>
  );
}
