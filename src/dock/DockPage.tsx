/**
 * DockPage.tsx — MakeChurchEasy Dock Control Panel
 *
 * The dock keeps Bible, Worship, and Media production controls inside OBS.
 */

import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { dockClient, dockBridge, type DockStateMessage } from "../services/dockBridge";
import { dockObsClient, type DockObsStatus } from "./dockObsClient";
import { DOCK_TABS, type DockTab, type DockStagedItem } from "./dockTypes";
import type { DockPresentationOutputTarget } from "./dockPresentationTarget";
import { isPresentationLinkTarget } from "./dockPresentationTarget";
import { useAppTheme } from "../hooks/useAppTheme";
import {
  type DockProductionSettingsPayload,
  getDefaultDockProductionSettings,
  loadDockProductionSettings,
} from "../services/productionSettings";
import type { ServicePlannerSnapshot } from "../service-planner/types";
import { installDockTextShortcuts } from "./dockTextShortcuts";
import { useKeyboardShortcuts, type ShortcutDefinition, type ShortcutCategory, formatShortcut } from "./useKeyboardShortcuts";
import { useDockDragDrop } from "./useDockDragDrop";
import { useDockUpload } from "./useDockUpload";
import { ensureObsConnected } from "./obsConnectionGuard";
import { getRecommendedPollingInterval } from "../services/performanceManager";
import { getDefaultOBSUrl, readDesktopConfigCache, DEFAULT_DESKTOP_CONFIG } from "../services/desktopConfig";
import { normalizeOBSWebSocketUrl } from "../services/obsWebSocketUrl";
import DockDropOverlay from "./DockDropOverlay";
import DockUploadToasts from "./DockUploadToasts";
import { DockUpgradeModal } from "./components/DockUpgradeModal";
import { registerUpgradeModal, startPlanRefresh } from "./dockEntitlement";
import { fetchPlanFromOverlayServer } from "../services/entitlementClient";
import { publishDockStagedItemToPresentation } from "../services/presentationDockBridge";
import "./dock.css";
import "./dock-theme.css";
import Icon from "./DockIcon";

const DockBibleTab = lazy(() => import("./tabs/DockBibleTab"));
const DockMediaTab = lazy(() => import("./tabs/DockMediaTab"));
const DockWorshipTab = lazy(() => import("./tabs/DockWorshipTab"));
const DockPlannerTab = lazy(() => import("./tabs/DockPlannerTab"));
const DockMultiviewTab = lazy(() => import("./tabs/DockMultiviewTab"));
const DockMinistryTab = lazy(() => import("./tabs/DockMinistryTab"));
const DockLmTab = lazy(() => import("./tabs/DockLmTab"));
const DockBibleCommandPaletteHost = lazy(() => import("./DockBibleCommandPaletteHost"));

const DOCK_SHELL_PREFS_KEY = "ocs-dock-shell-preferences";
const DOCK_STAGED_ITEM_KEY = "ocs-dock-staged-item";

interface DockShellPreferences {
  activeTab?: DockTab | "live";
  disabledTabs?: DockTab[];
}

import { loadProjectionSettings, saveProjectionSettings, type ProjectionSettings } from "./dockProjectionSettings";

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

function getCompactDockTabLabel(tab: DockTab, t: (key: string) => string): string {
  switch (tab) {
    case "bible":
      return t('page.shortcutTabBible');
    case "worship":
      return t('page.shortcutTabWorship');
    case "media":
      return t('page.shortcutTabMedia');
    case "ministry":
      return t('page.shortcutTabMinistry');
    case "planner":
      return t('page.shortcutTabPlanner');
    case "multiview":
      return t('page.shortcutTabMultiview');
    default:
      return t('dock.defaultTab');
  }
}

function formatDockObsError(message: string): string {
  if (/No source was found.*MCE Presentation.*within the canvas/i.test(message)) {
    return "Please refresh the dock, or check that MakeChurchEasy is running.";
  }
  return message;
}

export default function DockPage({
  externalObsSession = false,
  presentationBibleLmSplit = false,
  presentationOutputTarget = "obs",
  enablePresentationAssistantMicControls = false,
  hideLowerThirdControls = false,
  hideTickerControls = false,
  hiddenTabs = [],
  hideShellHeader = false,
  onActiveTabChange,
}: {
  externalObsSession?: boolean;
  presentationBibleLmSplit?: boolean;
  presentationOutputTarget?: DockPresentationOutputTarget;
  enablePresentationAssistantMicControls?: boolean;
  hideLowerThirdControls?: boolean;
  hideTickerControls?: boolean;
  hiddenTabs?: DockTab[];
  hideShellHeader?: boolean;
  onActiveTabChange?: (tab: DockTab) => void;
} = {}) {
  const { t } = useTranslation();
  const presentationLinkMode = isPresentationLinkTarget(presentationOutputTarget);
  // Synchronous config reader (reads from cache, falls back to defaults)
  const cfg = readDesktopConfigCache() || DEFAULT_DESKTOP_CONFIG;

  const dockRootRef = useRef<HTMLDivElement>(null);
  const shellPreferences = loadDockShellPreferences();
  const { effective, setTheme } = useAppTheme();
  const [activeTab, setActiveTab] = useState<DockTab>(() => resolveDockTab(shellPreferences.activeTab));
  const [disabledTabs, setDisabledTabs] = useState<DockTab[]>(() => shellPreferences.disabledTabs ?? []);
  const [dockHeight, setDockHeight] = useState(0);
  const verticalTabs = dockHeight > 0 && dockHeight < 550;
  const [obsConnected, setObsConnected] = useState(false);
  const [obsError, setObsError] = useState("");
  const [staged, setStaged] = useState<DockStagedItem | null>(() => loadDockStagedItem());
  const [appConnected, setAppConnected] = useState(false);
  const [obsUrlInput, setObsUrlInput] = useState(getDefaultOBSUrl());
  const [obsPwInput, setObsPwInput] = useState("");
  const [productionSettings, setProductionSettings] = useState<DockProductionSettingsPayload>(
    getDefaultDockProductionSettings(),
  );
  const [servicePlanner, setServicePlanner] = useState<ServicePlannerSnapshot | null>(null);
  const [projectionSettings, setProjectionSettings] = useState<ProjectionSettings>(() => loadProjectionSettings());
  const [upgradeModalMsg, setUpgradeModalMsg] = useState("");
  const hiddenTabsKey = hiddenTabs.join("|");
  const hiddenTabIds = useMemo(() => new Set<DockTab>(hiddenTabs), [hiddenTabsKey]);
  const visibleDockTabs = useMemo(() => DOCK_TABS.filter((tab) => !hiddenTabIds.has(tab.id)), [hiddenTabIds]);
  const navigableDockTabs = useMemo(
    () => visibleDockTabs.filter((tab) => !disabledTabs.includes(tab.id)),
    [disabledTabs, visibleDockTabs],
  );

  const updateProjectionSceneMode = useCallback((sceneMode: ProjectionSettings["sceneMode"]) => {
    setProjectionSettings((current) => {
      const next = { ...current, sceneMode };
      saveProjectionSettings(next);
      void dockObsClient.applyProjectionSettings({ allowSceneMutation: true }).catch((error) => {
        console.warn("[Dock] Failed to apply OBS output routing:", error);
      });
      return next;
    });
  }, []);

  // Register the upgrade modal trigger so any dock tab can show it.
  useEffect(() => {
    registerUpgradeModal((msg) => setUpgradeModalMsg(msg));
    startPlanRefresh();

    // Initialize device performance detection for dock (non-blocking)
    import("../services/performanceManager").then((m) =>
      m.init().catch((err) => {
        console.warn("[Dock] Performance manager init failed (non-critical):", err);
      }),
    );

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

  useEffect(() => {
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

  useEffect(() => {
    if (visibleDockTabs.some((tab) => tab.id === activeTab)) return;
    setActiveTab(visibleDockTabs[0]?.id ?? "bible");
  }, [activeTab, visibleDockTabs]);

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

  // ── Track dock height for responsive tab layout ──
  useEffect(() => {
    const el = dockRootRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDockHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void loadDockProductionSettings().then(setProductionSettings).catch(() => { });
  }, []);

  // ── Force update: fetch latest release info and check pub_date ──
  useEffect(() => {
    const RELEASES_API = "https://api.github.com/repos/jolamyfoodsng/makechurcheasy-releases/releases/latest";
    const CACHE_KEY = "ocs-dock-update-cache-v1";

    // Use config for force-update settings (fallback: 21 days, enabled)
    const FORCE_UPDATE_DAYS = Math.round((cfg.appUpdates.gracePeriodHours || 24 * 21) / 24);
    const forceEnabled = cfg.appUpdates.forceUpdatesEnabled;

    const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined;

    if (!forceEnabled) return;

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

    if (!externalObsSession && !presentationLinkMode) {
      // First attempt — immediate
      tryConnect();

      // Retry every 2 seconds until connected
      autoReconnectTimer = setInterval(tryConnect, getRecommendedPollingInterval(2000));
    }

    const unsubObs = dockObsClient.onStatusChange((status: DockObsStatus, err?: string) => {
      setObsConnected(status === "connected");
      setObsError(status === "error" ? formatDockObsError(err || t('dock.connectionFailed')) : "");

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
                label: compareLabel || recovered.bible.reference || t('dock.bibleVerseFallback'),
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
                label: recovered.worship.sectionLabel || t('dock.worshipFallback'),
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
      if (!externalObsSession && !presentationLinkMode) {
        dockObsClient.disconnect();
      }
    };
  }, [externalObsSession, presentationLinkMode]);

  const handleStage = useCallback((item: DockStagedItem | null) => {
    setStaged(item);
    if (!presentationLinkMode) return;
    void publishDockStagedItemToPresentation(item).catch((error) => {
      console.warn("[Dock] Failed to publish staged item to presentation link:", error);
    });
  }, [presentationLinkMode]);

  const handleManualConnect = useCallback(async () => {
    setObsError("");
    try {
      const obsUrl = normalizeOBSWebSocketUrl(obsUrlInput);
      setObsUrlInput(obsUrl);
      await ensureObsConnected(obsUrl, obsPwInput || undefined);
    } catch (err) {
      setObsError(formatDockObsError(err instanceof Error ? err.message : t('dock.connectionFailed')));
    }
  }, [obsPwInput, obsUrlInput]);

  const nextTheme = effective === "dark" ? "light" : "dark";
  const themeToggleLabel = nextTheme === "dark" ? t('dock.switchToDarkMode') : t('dock.switchToLightMode');
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
    { key: "2", handler: () => setActiveTab("bible"), label: t('page.shortcutTabBible'), category: t('page.shortcutCategoryNavigation') as ShortcutCategory },
    { key: "3", handler: () => setActiveTab("worship"), label: t('page.shortcutTabWorship'), category: t('page.shortcutCategoryNavigation') as ShortcutCategory },
    { key: "4", handler: () => setActiveTab("media"), label: t('page.shortcutTabMedia'), category: t('page.shortcutCategoryNavigation') as ShortcutCategory },
    { key: "5", handler: () => setActiveTab("planner"), label: t('page.shortcutTabPlanner'), category: t('page.shortcutCategoryNavigation') as ShortcutCategory },
    { key: "6", handler: () => setActiveTab("multiview"), label: t('page.shortcutTabMultiview'), category: t('page.shortcutCategoryNavigation') as ShortcutCategory },
    { key: "7", handler: () => setActiveTab("ministry"), label: t('page.shortcutTabMinistry'), category: t('page.shortcutCategoryNavigation') as ShortcutCategory },
    { key: "k", handler: () => openCommandPalette(""), label: t('page.shortcutCommandPalette'), category: t('page.shortcutCategoryUtility') as ShortcutCategory },
    { key: "t", handler: () => setTheme(nextTheme), label: themeToggleLabel, category: t('page.shortcutCategoryUtility') as ShortcutCategory },
    { key: "/", handler: () => setShowShortcutsHelp((v) => !v), label: t('page.shortcutsHelp'), category: t('page.shortcutCategoryUtility') as ShortcutCategory },
  ];

  const { toasts } = useKeyboardShortcuts(shortcuts, true);

  // ── Settings Menu State ──
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  // Listen for dock-open-menu custom event (fired by tab headers)
  useEffect(() => {
    const handler = () => setShowSettingsMenu((prev) => !prev);
    window.addEventListener("dock-open-menu", handler);
    return () => window.removeEventListener("dock-open-menu", handler);
  }, []);
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [showTabVisibility, setShowTabVisibility] = useState(false);
  const [showProjectionSettings, setShowProjectionSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showClearScenesConfirm, setShowClearScenesConfirm] = useState(false);
  const [clearScenesLoading, setClearScenesLoading] = useState(false);

  // ── Language Selector ──
  const ALL_LANGUAGES: string[] = ["English", "French", "Spanish", "Portuguese", "Yoruba", "Igbo", "Hausa", "Ghanaian"];
  const [interfaceLanguage, setInterfaceLanguage] = useState<string>(() => localStorage.getItem("mce_interface_language") || "English");
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);

  return (
    <div className={`dock-root${verticalTabs ? " dock-root--vertical-tabs" : ""}`} ref={dockRootRef}>
      {/* ═══ VERTICAL NAV (left side when dock is short) ═══ */}
      {verticalTabs && (
        <nav className="dock-vertical-nav" aria-label={t('page.dockSections')}>
          {navigableDockTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`dock-vertical-nav__item${activeTab === tab.id ? " dock-vertical-nav__item--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              title={tab.label}
              data-label={tab.label}
            >
              <Icon name={tab.icon} size={18} />
            </button>
          ))}
        </nav>
      )}

      <div className="dock-main-column">
        {/* ── Force Update Banner ── */}
        {versionAge.forceUpdate && (
          <div className="dock-force-update-banner">
            <Icon name="warning" size={14} />
            <span>
              {t('page.forceUpdate')} — {t('page.updateReady', { days: versionAge.daysOld })}
              {versionAge.currentVersion && versionAge.latestVersion && (
                <> v{versionAge.currentVersion} → v{versionAge.latestVersion}</>
              )}
            </span>
            <a
              href="https://github.com/nicholasracisz/makechurcheasy/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="dock-force-update-banner__link"
            >
              {t('page.downloadUpdate')}
            </a>
          </div>
        )}

        {/* ── Maintenance Mode Banner ── */}
        {cfg.security.maintenanceMode && (
          <div className="dock-force-update-banner" style={{ background: "var(--accent, #f59e0b)", color: "#000" }}>
            <Icon name="build" size={14} />
            <span>{t('page.maintenance')}</span>
          </div>
        )}

        {/* ── Page Header (hamburger L, refresh R) ── */}
        {!hideShellHeader && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setHeaderCollapsed((prev) => !prev)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHeaderCollapsed((prev) => !prev); } }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: headerCollapsed ? "2px 8px" : "6px 8px",
            borderBottom: "1px solid rgba(51, 65, 85, 0.3)",
            flexShrink: 0,
            cursor: "pointer",
            userSelect: "none",
          }}
          title={headerCollapsed ? "Expand header" : "Collapse header"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Icon name={headerCollapsed ? "chevron_right" : "expand_more"} size={14} style={{ color: "#9CA3AF", flexShrink: 0 }} />
            {!headerCollapsed && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowSettingsMenu((prev) => !prev); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28, height: 28,
                  border: "none",
                  borderRadius: 3,
                  background: "transparent",
                  color: "#9CA3AF",
                  cursor: "pointer",
                }}
                title="Menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/></svg>
              </button>
            )}
          </div>
          {!headerCollapsed && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); window.location.reload(); }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28, height: 28,
                border: "none",
                borderRadius: 3,
                background: "transparent",
                color: "#9CA3AF",
                cursor: "pointer",
              }}
              title="Refresh"
            >
              <Icon name="refresh" size={14} />
            </button>
          )}
        </div>
        )}

        {/* ── Sidebar ── */}
        {showSettingsMenu && (
          <div className="dock-sidebar-backdrop" onClick={() => setShowSettingsMenu(false)}>
            <div className="dock-sidebar" onClick={(e) => e.stopPropagation()}>
              <div className="dock-sidebar__header">
                <span className="dock-sidebar__title">{t('dock.menu')}</span>
                <button
                  type="button"
                  className="dock-shell-icon-btn"
                  onClick={() => setShowSettingsMenu(false)}
                  aria-label={t('common.close')}
                  title={t('common.close')}>
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
                  title={themeToggleLabel}
                >
                  <Icon name={themeToggleIcon} size={16} />
                  <span>{themeToggleLabel}</span>
                </button>

                {/* Language */}
                <div className="dock-sidebar__item" style={{ cursor: "default" }}>
                  <Icon name="translate" size={16} />
                  <select
                    className="dock-sidebar__select"
                    value={interfaceLanguage}
                    onChange={(e) => {
                      setPendingLanguage(e.target.value);
                      setShowLanguageModal(true);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "inherit",
                      fontSize: "inherit",
                      fontFamily: "inherit",
                      cursor: "pointer",
                      outline: "none",
                      flex: 1,
                      padding: 0,
                    }}
                  >
                    {ALL_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>




                <div className="dock-sidebar__divider" />

                {/* Tab Visibility */}
                <button
                  type="button"
                  className="dock-sidebar__item"
                  onClick={() => setShowTabVisibility(!showTabVisibility)}
                  title={t('page.tabVisibility')}>
                  <Icon name="visibility" size={16} />
                  <span>{t('page.tabVisibility')}</span>
                  <Icon name={showTabVisibility ? "expand_less" : "expand_more"} size={14} />
                </button>
                {showTabVisibility && (() => {
                  const toggleableTabs = ([
                    { tab: "multiview", label: t('page.shortcutTabMultiview'), icon: "grid_view" },
                    { tab: "ministry", label: t('page.shortcutTabMinistry'), icon: "campaign" },
                  ] satisfies Array<{ tab: DockTab; label: string; icon: string }>).filter(({ tab }) => !hiddenTabIds.has(tab));
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

                {!presentationLinkMode && (
                  <>
                    <div className="dock-sidebar__divider" />

                    {/* Advanced OBS Output */}
                    <button
                      type="button"
                      className="dock-sidebar__item"
                      onClick={() => setShowProjectionSettings(!showProjectionSettings)}
                      title={t('page.advancedObsOutput', 'Advanced OBS Output')}>
                      <Icon name="videocam" size={16} />
                      <span>{t('page.advancedObsOutput', 'Advanced OBS Output')}</span>
                      <Icon name={showProjectionSettings ? "expand_less" : "expand_more"} size={14} />
                    </button>
                    {showProjectionSettings && (
                      <div className="dock-sidebar__subpanel">
                        {/* Scene Routing */}
                        <div className="dock-sidebar__section-label">{t('page.sceneRouting', 'Scene Routing')}</div>
                        <div className="dock-sidebar__radio-group">
                          {([
                            {
                              mode: "auto-duplicate" as const,
                              icon: "visibility",
                              label: t('page.programBackgroundOn', 'Program background on'),
                              desc: t('page.programBackgroundOnDesc', 'Put the current Program scene under MCE Presentation immediately.'),
                            },
                            {
                              mode: "no-clone" as const,
                              icon: "visibility_off",
                              label: t('page.programBackgroundOff', 'Program background off'),
                              desc: t('page.programBackgroundOffDesc', 'Do not place the Program scene inside MCE Presentation.'),
                            },
                          ]).map(({ mode, icon, label, desc }) => (
                            <button
                              key={mode}
                              type="button"
                              className={`dock-sidebar__radio${projectionSettings.sceneMode === mode ? " dock-sidebar__radio--active" : ""}`}
                              aria-pressed={projectionSettings.sceneMode === mode}
                              onClick={() => updateProjectionSceneMode(mode)}
                              title={label}>
                              <Icon name={icon} size={14} />
                              <div className="dock-sidebar__radio-copy">
                                <div className="dock-sidebar__radio-title">{label}</div>
                                <div className="dock-sidebar__radio-desc">{desc}</div>
                              </div>
                              {projectionSettings.sceneMode === mode && <Icon name="check" size={12} />}
                            </button>
                          ))}
                        </div>

                        <div className="dock-sidebar__section-label dock-sidebar__section-label--spaced">{t('page.sendBehavior', 'Send Behavior')}</div>

                        <label className="dock-sidebar__check dock-sidebar__check--stacked">
                          <input
                            type="checkbox"
                            checked={projectionSettings.hideOtherMceSourcesOnSend}
                            onChange={(e) => setProjectionSettings((s) => ({ ...s, hideOtherMceSourcesOnSend: e.target.checked }))}
                          />
                          <span className="dock-sidebar__check-copy">
                            <span>{t('page.clearOtherMceOverlays', 'Hide other MCE overlays when sending')}</span>
                            <small>{t('page.clearOtherMceOverlaysDesc', 'Keeps only the new item and ticker visible when you send content.')}</small>
                          </span>
                        </label>

                        <label className="dock-sidebar__check dock-sidebar__check--stacked">
                          <input
                            type="checkbox"
                            checked={projectionSettings.restoreOriginalScene}
                            onChange={(e) => setProjectionSettings((s) => ({ ...s, restoreOriginalScene: e.target.checked }))}
                          />
                          <span className="dock-sidebar__check-copy">
                            <span>{t('page.returnToPreviousScene', 'Return to previous Program scene after clear')}</span>
                            <small>{t('page.returnToPreviousSceneDesc', 'When MCE clears its overlay, OBS goes back to the scene that was live before.')}</small>
                          </span>
                        </label>
                      </div>
                    )}
                  </>
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
                  title={t('dock.history')}>
                  <Icon name="history" size={16} />
                  <span>{t('dock.history')}</span>
                </button>

                {!presentationLinkMode && (
                  <>
                    <div className="dock-sidebar__divider" />

                    {/* OBS Connection */}
                    <button
                      type="button"
                      className="dock-sidebar__item"
                      onClick={() => {
                        setShowSettingsMenu(false);
                        setShowReconnectModal(true);
                      }}
                      title={t('page.connection')}>
                      <Icon name="link" size={16} />
                      <span>{obsConnected ? t('dock.reconnectToObs') : t('dock.connectToObs')}</span>
                    </button>

                    <div className="dock-sidebar__divider" />

                    {/* Clear All MCE Scenes */}
                    <button
                      type="button"
                      className="dock-sidebar__item"
                      onClick={() => {
                        setShowSettingsMenu(false);
                        setShowClearScenesConfirm(true);
                      }}
                      style={{ color: "var(--dock-red, #EF4444)" }}
                      title={t('page.clearAllScenes')}>
                      <Icon name="delete_sweep" size={16} />
                      <span>{t('page.clearAllScenes')}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Clear All MCE Scenes Confirmation ── */}
        {!presentationLinkMode && showClearScenesConfirm && (
          <div className="dock-dialog-backdrop" onClick={() => { if (!clearScenesLoading) setShowClearScenesConfirm(false); }}>
            <div className="dock-dialog dock-dialog--compact" onClick={(e) => e.stopPropagation()}>
              <div className="dock-dialog__header">
                <div>
                  <div className="dock-dialog__eyebrow" style={{ color: "var(--dock-red, #EF4444)" }}>{t('page.dangerZone')}</div>
                  <h2 className="dock-dialog__title">{t('page.clearAllScenesConfirm')}</h2>
                </div>
                <button
                  type="button"
                  className="dock-dialog__close"
                  onClick={() => { if (!clearScenesLoading) setShowClearScenesConfirm(false); }}
                  aria-label={t('common.close')}
                  title={t('common.close')}>
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div className="dock-dialog__body">
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                  {t('dock.clearAllScenesWarning')}
                </p>
                <ul style={{ margin: "8px 0", paddingLeft: 20, fontSize: 12, lineHeight: 1.6, color: "var(--dock-text-secondary, #94A3B8)" }}>
                  <li>{t('page.mceScenes')}</li>
                  <li>{t('page.mcePreService')}</li>
                  <li>{t('page.mvLayouts')}</li>
                  <li>{t('page.mceSources')}</li>
                </ul>
                <p style={{ margin: 0, fontSize: 11, color: "var(--dock-text-dim, #64748B)", lineHeight: 1.4 }}>
                  {t('dock.clearAllScenesOwnScenes')}
                </p>
              </div>
              <div className="dock-dialog__actions">
                <button
                  type="button"
                  className="dock-btn dock-btn--sm"
                  disabled={clearScenesLoading}
                  onClick={() => setShowClearScenesConfirm(false)}
                  title={t('page.clearAllScenesCancel')}>
                  {t('page.clearAllScenesCancel')}
                </button>
                <button
                  type="button"
                  className="dock-btn dock-btn--sm dock-btn--danger"
                  disabled={clearScenesLoading}
                  onClick={async () => {
                    if (!obsConnected) return;
                    setClearScenesLoading(true);
                    try {
                      const result = await dockObsClient.clearAllMCEScenes();
                      console.log(`[DockOBS] Cleared ${result.deletedScenes} scenes, cleaned ${result.cleanedSources} sources`);
                    } catch (err) {
                      console.error("[DockOBS] Failed to clear MCE scenes:", err);
                    } finally {
                      setClearScenesLoading(false);
                      setShowClearScenesConfirm(false);
                    }
                  }}
                  title={t('common.loading')}>
                  {clearScenesLoading ? t('common.loading') : t('page.clearAllScenesContinue')}
                </button>
              </div>
            </div>
          </div>
        )}

        {!presentationLinkMode && showReconnectModal && (
          <div className="dock-dialog-backdrop" onClick={() => setShowReconnectModal(false)}>
            <div className="dock-dialog dock-dialog--compact" onClick={(e) => e.stopPropagation()}>
              <div className="dock-dialog__header">
                <div>
                  <div className="dock-dialog__eyebrow">{t('page.connection')}</div>
                  <h2 className="dock-dialog__title">{t('page.obsWebSocket')}</h2>
                </div>
                <button
                  type="button"
                  className="dock-dialog__close"
                  onClick={() => setShowReconnectModal(false)}
                  aria-label={t('common.close')}
                  title={t('common.close')}>
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
                    placeholder={t('dock.passwordOptional')}
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
                    title={t('dock.reconnectToObs')}>
                    <Icon name="link" size={16} />
                    {obsConnected ? t('page.reconnect') : t('page.connection')}
                  </button>
                </div>
                <div className="dock-settings-panel__hint">
                  {t('page.makeSureEnabled')}
                </div>
              </div>
            </div>
          </div>
        )}



        <div className="dock-content">

          <div className="dock-content-main">
            <Suspense fallback={<div className="dock-tab-loading">{t('common.loading')}</div>}>
              {activeTab === "planner" && (
                <DockPlannerTab
                  staged={staged}
                  onStage={handleStage}
                  initialSnapshot={servicePlanner}
                />
              )}
              {activeTab === "bible" && (
                presentationBibleLmSplit ? (
                  <div className="dock-presentation-bible-lm-split">
                    <section className="dock-presentation-bible-lm-pane" aria-label="Bible dock">
                      <div className="dock-presentation-bible-lm-pane__title">Bible</div>
                      <DockBibleTab
                        staged={staged}
                        onStage={handleStage}
                        productionDefaults={productionSettings.bible}
                        appConnected={appConnected}
                        presentationOutputTarget={presentationOutputTarget}
                        showHistory={showHistory}
                        onHistoryClose={() => setShowHistory(false)}
                      />
                    </section>
                    <section className="dock-presentation-bible-lm-pane" aria-label="Scripture assistant dock">
                      <div className="dock-presentation-bible-lm-pane__title">Scripture Assistant</div>
                      <DockLmTab
                        presentationOutputTarget={presentationOutputTarget}
                        enablePresentationMicControls={enablePresentationAssistantMicControls}
                      />
                    </section>
                  </div>
                ) : (
                  <DockBibleTab
                    staged={staged}
                    onStage={handleStage}
                    productionDefaults={productionSettings.bible}
                    appConnected={appConnected}
                    presentationOutputTarget={presentationOutputTarget}
                    fullscreenOnly={hideLowerThirdControls}
                    showHistory={showHistory}
                    onHistoryClose={() => setShowHistory(false)}
                  />
                )
              )}
              {activeTab === "worship" && (
                <DockWorshipTab
                  staged={staged}
                  onStage={handleStage}
                  productionDefaults={productionSettings.worship}
                  presentationOutputTarget={presentationOutputTarget}
                  fullscreenOnly={hideLowerThirdControls}
                />
              )}
              {activeTab === "media" && (
                <DockMediaTab
                  staged={staged}
                  onStage={handleStage}
                  presentationOutputTarget={presentationOutputTarget}
                />
              )}
              {activeTab === "multiview" && (
                <DockMultiviewTab />
              )}
              {activeTab === "ministry" && (
                <DockMinistryTab
                  staged={staged}
                  onStage={handleStage}
                  presentationOutputTarget={presentationOutputTarget}
                  hideTickerControls={hideTickerControls}
                  hideLowerThirdControls={hideLowerThirdControls}
                />
              )}
            </Suspense>
          </div>
        </div>
      </div>

      {/* ═══ HORIZONTAL TAB NAVIGATION (bottom, hidden when vertical) ═══ */}
      {!verticalTabs && (
        <nav className="dock-bottom-nav" aria-label={t('page.dockSections')}>
          {navigableDockTabs.map((tab) => (
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
              <span className="dock-bottom-nav__label-short">{getCompactDockTabLabel(tab.id, t)}</span>
            </button>
          ))}
        </nav>
      )}

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
          aria-label={t('page.keyboardShortcuts')}
        >
          <div className="dock-shortcuts-overlay__content" onClick={(e) => e.stopPropagation()}>
            <div className="dock-shortcuts-overlay__header">
              <div>
                <div className="dock-shortcuts-overlay__eyebrow">{t('dock.dockLabel')}</div>
                <div className="dock-shortcuts-overlay__title">{t('page.keyboardShortcuts')}</div>
              </div>
              <button
                type="button"
                className="dock-shortcuts-overlay__close"
                onClick={() => setShowShortcutsHelp(false)}
                aria-label={t('common.close')}
                title={t('common.close')}>
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="dock-shortcuts-overlay__body">
              <div className="dock-shortcuts-section">
                <div className="dock-shortcuts-section__label">{t('dock.navigation')}</div>
                <div className="dock-shortcuts-list">
                  {[
                    { key: "2", label: t('page.shortcutTabBible') },
                    { key: "3", label: t('page.shortcutTabWorship') },
                    { key: "4", label: t('page.shortcutTabMedia') },
                    { key: "5", label: t('page.shortcutTabPlanner') },
                    { key: "6", label: t('page.shortcutTabMultiview') },
                    { key: "7", label: t('page.shortcutTabMinistry') },
                  ].map((s) => (
                    <div key={s.key} className="dock-shortcuts-item">
                      <span className="dock-shortcuts-item__key">{formatShortcut(s.key)}</span>
                      <span className="dock-shortcuts-item__label">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="dock-shortcuts-section">
                <div className="dock-shortcuts-section__label">{t('dock.utility')}</div>
                <div className="dock-shortcuts-list">
                  {[
                    { key: "k", label: t('page.shortcutCommandPalette') },
                    { key: "t", label: t('dock.toggleTheme') },
                    { key: "s", label: t('dock.toggleSettings') },
                    { key: "/", label: t('page.shortcutsHelp') },
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
              {t('dock.shortcutsFooterPrefix')} <kbd>{t('page.shortcutAlt')}</kbd> + <kbd>{t('page.shortcutShift')}</kbd> + <kbd>/</kbd> {t('dock.shortcutsFooterSuffix')}
            </div>
          </div>
        </div>
      )}

      {/* ── Command Palette ── */}
      {showCommandPalette && (
        <Suspense fallback={null}>
          <DockBibleCommandPaletteHost
            open={showCommandPalette}
            initialQuery={commandPaletteInitialQuery}
            onClose={() => setShowCommandPalette(false)}
            onSelectBibleVerse={handleCommandPaletteSelectBibleVerse}
            onSelectTemplate={handleCommandPaletteSelectTemplate}
          />
        </Suspense>
      )}

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

      {/* ── Language change confirmation modal ── */}
      {showLanguageModal && pendingLanguage && (
        <div className="dock-modal-overlay" onClick={() => { setShowLanguageModal(false); setPendingLanguage(null); }}>
          <div className="dock-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dock-modal__header">
              <h3>{t('dock.changeLanguage') || 'Change Language'}</h3>
            </div>
            <div className="dock-modal__body">
              <p>{t('dock.changeLanguageConfirm', { language: pendingLanguage }) || `Change interface language to ${pendingLanguage}?`}</p>
            </div>
            <div className="dock-modal__footer">
              <button
                type="button"
                className="dock-btn dock-btn--ghost"
                onClick={() => { setShowLanguageModal(false); setPendingLanguage(null); }}
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                type="button"
                className="dock-btn dock-btn--primary"
                onClick={() => {
                  const lang = pendingLanguage!;
                  const langToCode: Record<string, string> = {
                    English: "en", French: "fr", Spanish: "es", Portuguese: "pt",
                    Yoruba: "yo", Igbo: "ig", Hausa: "ha", Ghanaian: "gh",
                  };
                  const code = langToCode[lang] || "en";
                  localStorage.setItem("mce_interface_language", lang);
                  i18n.changeLanguage(code);
                  dockBridge.sendLanguageChanged(code);
                  setInterfaceLanguage(lang);
                  setShowLanguageModal(false);
                  setPendingLanguage(null);
                }}
              >
                {t('dock.changeLanguage') || 'Change Language'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
