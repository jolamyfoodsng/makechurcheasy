/**
 * DockPage.tsx — MakeChurchEasy Dock Control Panel
 *
 * The dock keeps Bible, Worship, and Media production controls inside OBS.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { dockClient, type DockStateMessage } from "../services/dockBridge";
import { INTERFACE_LOCALES } from "../i18n/localeCatalog";
import {
  applyInterfaceLanguagePreference,
  getInterfaceLanguageLabel,
  getResolvedInterfaceLanguage,
} from "../services/interfaceLanguage";
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
import { useKeyboardShortcuts, type ShortcutDefinition, type ShortcutCategory, formatShortcut } from "./useKeyboardShortcuts";
import BibleCommandPalette from "../components/BibleCommandPalette";
import { InterfaceLanguagePrompt } from "../components/InterfaceLanguagePrompt";
import { BibleProvider } from "../bible/bibleStore";
import { useDockDragDrop } from "./useDockDragDrop";
import { useDockUpload } from "./useDockUpload";
import { ensureObsConnected } from "./obsConnectionGuard";
import { getRecommendedPollingInterval } from "../services/performanceManager";
import { getDefaultOBSUrl, readDesktopConfigCache, DEFAULT_DESKTOP_CONFIG } from "../services/desktopConfig";
import { coerce, lt } from "semver";
import {
  type ProjectionSettings,
  loadProjectionSettings,
  saveProjectionSettings,
} from "./dockProjectionSettings";

function isOlderVersion(currentVersion: string, targetVersion: string): boolean {
  const current = coerce(currentVersion)?.version;
  const target = coerce(targetVersion)?.version;
  if (!current || !target) return false;
  return lt(current, target);
}

function getDockDownloadUrl(
  cfg: typeof DEFAULT_DESKTOP_CONFIG,
): string {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return cfg.appUpdates.windowsDownloadUrl || cfg.appUpdates.releaseNotesUrl;
  if (ua.includes("Mac") || ua.includes("Macintosh")) {
    return cfg.appUpdates.macDownloadUrl || cfg.appUpdates.releaseNotesUrl;
  }
  return cfg.appUpdates.linuxDownloadUrl || cfg.appUpdates.releaseNotesUrl;
}
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
const DOCK_TAB_PREWARM_DELAY_MS = 250;

interface DockShellPreferences {
  activeTab?: DockTab | "live";
  disabledTabs?: DockTab[];
}

const PREWARMED_DOCK_TABS: DockTab[] = [];

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

export default function DockPage() {
  const { t } = useTranslation();
  // Synchronous config reader (reads from cache, falls back to defaults)
  const cfg = readDesktopConfigCache() || DEFAULT_DESKTOP_CONFIG;

  const dockRootRef = useRef<HTMLDivElement>(null);
  const shellPreferences = loadDockShellPreferences();
  const { effective, setTheme } = useAppTheme();
  const [activeTab, setActiveTab] = useState<DockTab>(() => resolveDockTab(shellPreferences.activeTab));
  const [disabledTabs, setDisabledTabs] = useState<DockTab[]>(() => shellPreferences.disabledTabs ?? []);
  const [mountedTabs, setMountedTabs] = useState<Record<DockTab, boolean>>(() => ({
    planner: activeTab === "planner",
    bible: PREWARMED_DOCK_TABS.includes("bible") || activeTab === "bible",
    worship: PREWARMED_DOCK_TABS.includes("worship") || activeTab === "worship",
    media: activeTab === "media",
    multiview: activeTab === "multiview",
    ministry: activeTab === "ministry",
  }));
  const [dockHeight, setDockHeight] = useState(0);
  const verticalTabs = dockHeight > 0 && dockHeight < 550;
  const compactToolbar = dockHeight > 0 && dockHeight <= 550;
  const [tickerOutputMode, setTickerOutputMode] = useState<"source" | "scene">(() => {
    try { return (localStorage.getItem("dock-ticker-output-mode") as "source" | "scene") || "scene"; } catch { return "scene"; }
  });
  const [obsConnected, setObsConnected] = useState(false);
  const [obsError, setObsError] = useState("");
  const [isReloadingDock, setIsReloadingDock] = useState(false);
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

  // Refresh plan from overlay server on every tab switch
  useEffect(() => {
    void fetchPlanFromOverlayServer();
  }, [activeTab]);

  useEffect(() => {
    setMountedTabs((current) => (
      current[activeTab]
        ? current
        : { ...current, [activeTab]: true }
    ));
  }, [activeTab]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMountedTabs((current) => {
        if (current.bible && current.worship) return current;
        return {
          ...current,
          bible: true,
          worship: true,
        };
      });
    }, DOCK_TAB_PREWARM_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

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
    const root = dockRootRef.current;
    if (!root) return;

    let inFlight = false;
    let lastActivationAt = 0;
    const MIN_INTERVAL = 150;

    const handleDockClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const trigger = target.closest('button, [role="tab"]');
      if (!trigger || !root.contains(trigger)) return;

      const now = Date.now();
      if (inFlight || now - lastActivationAt < MIN_INTERVAL) return;
      lastActivationAt = now;
      inFlight = true;

      void dockObsClient.ensurePresentationPreviewActive().catch(() => { }).finally(() => {
        inFlight = false;
      });
    };

    root.addEventListener("click", handleDockClick, true);
    return () => root.removeEventListener("click", handleDockClick, true);
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

  // ── Version policy: show latest-version notice without locking the dock ──
  useEffect(() => {
    const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined;
    const latestVersion = cfg.appUpdates.latestVersion;
    if (!currentVersion || !latestVersion || !isOlderVersion(currentVersion, latestVersion)) {
      setVersionAge({ daysOld: 0, forceUpdate: false });
      return;
    }
    setVersionAge({ daysOld: 0, forceUpdate: true, currentVersion, latestVersion });
  }, [cfg.appUpdates.latestVersion]);

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
    autoReconnectTimer = setInterval(tryConnect, getRecommendedPollingInterval(2000));

    const unsubObs = dockObsClient.onStatusChange((status: DockObsStatus, err?: string) => {
      setObsConnected(status === "connected");
      setObsError(status === "error" ? (err || t('dock.connectionFailed')) : "");

      if (status === "connected") {
        // Stop auto-reconnect — we're connected
        if (autoReconnectTimer) { clearInterval(autoReconnectTimer); autoReconnectTimer = null; }

        dockObsClient.waitUntilReady().then(() =>
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
          }),
        ).catch((error) => {
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
      setObsError(err instanceof Error ? err.message : t('dock.connectionFailed'));
    }
  }, [obsPwInput, obsUrlInput]);

  const activeTabDef = DOCK_TABS.find((tab) => tab.id === activeTab) ?? DOCK_TABS[0];
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
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [showTabVisibility, setShowTabVisibility] = useState(false);
  const [showProjectionSettings, setShowProjectionSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showClearScenesConfirm, setShowClearScenesConfirm] = useState(false);
  const [clearScenesLoading, setClearScenesLoading] = useState(false);

  // ── Language Selector ──
  const [interfaceLanguage, setInterfaceLanguage] = useState<string>(() => getResolvedInterfaceLanguage());
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);

  return (
    <div className={`dock-root${verticalTabs ? " dock-root--vertical-tabs" : ""}`} ref={dockRootRef}>
      <InterfaceLanguagePrompt />
      {/* ═══ VERTICAL NAV (left side when dock is short) ═══ */}
      {verticalTabs && (
        <nav className="dock-vertical-nav" aria-label={t('page.dockSections')}>
          {DOCK_TABS.filter((tab) => !disabledTabs.includes(tab.id)).map((tab) => (
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
              {t('page.forceUpdate')}
              {versionAge.currentVersion && versionAge.latestVersion && (
                <> v{versionAge.currentVersion} → v{versionAge.latestVersion}</>
              )}
            </span>
            <a
              href={getDockDownloadUrl(cfg) || "https://makechurcheasy.creatorstudioslabs.stream/downloads"}
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

        <div className="dock-shell-header">
          <div className="dock-shell-status">
            <div className="dock-shell-status__left">
              <button
                type="button"
                className="dock-shell-icon-btn"
                onClick={() => setShowSettingsMenu(true)}
                aria-label={t('dock.menu')}
                title={t('dock.menu')}
              >
                <Icon name="menu" size={14} />
              </button>
              <div className="dock-shell-status__center">
                <div className="dock-shell-titleline">
                  <span className="dock-shell-titleline__app">{t('dock.mceStudio')}</span>
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
                aria-label={t('page.reloadDock')}
                title={isReloadingDock ? t('page.connecting') : t('page.reloadDock')}
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
                    {INTERFACE_LOCALES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
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
                  const toggleableTabs: Array<{ tab: DockTab; label: string; icon: string }> = [
                    { tab: "multiview", label: t('page.shortcutTabMultiview'), icon: "grid_view" },
                    { tab: "ministry", label: t('page.shortcutTabMinistry'), icon: "campaign" },
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
                  <span>{t('dock.tickerOutput')}</span>
                </div>
                <div className="dock-sidebar__subpanel">
                  {([
                    { mode: "source" as const, icon: "view_module", label: t('dock.source'), desc: t('dock.insideCurrentScene') },
                    { mode: "scene" as const, icon: "dashboard", label: t('dock.scene'), desc: t('dock.dedicatedSceneWithProgramBehind') },
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
                        color: tickerOutputMode === mode ? "var(--dock-accent, #3B82F6)" : "var(--dock-text, #E2E8F0)",
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: 11,
                        transition: "background 0.15s",
                      }}
                      title={t('common.confirm')}>
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
                  title={t('page.projectionSettings')}>
                  <Icon name="videocam" size={16} />
                  <span>{t('page.projectionSettings')}</span>
                  <Icon name={showProjectionSettings ? "expand_less" : "expand_more"} size={14} />
                </button>
                {showProjectionSettings && (
                  <div className="dock-sidebar__subpanel">
                    {/* Scene Handling */}
                    <div className="dock-sidebar__section-label">{t('page.sceneHandling')}</div>
                    <div className="dock-sidebar__radio-group">
                      {([
                        { mode: "auto-duplicate" as const, icon: "content_copy", label: t('page.autoDuplicateProgramScene'), desc: t('page.dedicatedSceneWithProgramBehind') },
                        { mode: "reference" as const, icon: "link", label: t('page.referenceProgramScene'), desc: t('page.liveSceneSourceMirrorsProgram') },
                        { mode: "no-clone" as const, icon: "block", label: t('page.dontCloneProgramScene'), desc: t('page.projectsDirectlyWithoutDuplicating') },
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
                            color: projectionSettings.sceneMode === mode ? "var(--dock-accent, #3B82F6)" : "var(--dock-text, #E2E8F0)",
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: 11,
                            transition: "background 0.15s",
                          }}
                          title={t('common.confirm')}>
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
                    <div className="dock-sidebar__section-label" style={{ marginTop: 8 }}>{t('dock.tickerLayerPriority')}</div>
                    <div className="dock-sidebar__radio-group">
                      <div
                        className="dock-sidebar__radio"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 3,
                          background: "var(--dock-accent-bg, rgba(99,102,241,0.12))",
                          color: "var(--dock-accent, #3B82F6)",
                          textAlign: "left",
                          fontSize: 11,
                        }}>
                        <Icon name="flip_to_front" size={14} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{t('ministry.tickerAboveContent')}</div>
                          <div style={{ fontSize: 10, opacity: 0.6 }}>{t('dock.tickerRemainsVisibleOnTop')}</div>
                        </div>
                        <Icon name="check" size={12} />
                      </div>
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
                      <span>{t('page.restoreSceneAfterProjection')}</span>
                    </label>
                    <div style={{ fontSize: 10, opacity: 0.5, padding: "2px 8px 0 22px", lineHeight: 1.4 }}>
                      {t('page.returnsObsToPreviousState')}
                    </div>

                    <label
                      className="dock-sidebar__check"
                      style={{ marginTop: 8, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={projectionSettings.hideOtherMceSourcesOnSend}
                        onChange={(e) => setProjectionSettings((s) => ({ ...s, hideOtherMceSourcesOnSend: e.target.checked }))}
                      />
                      <span>{t('page.hideOtherMceSourcesOnSend', 'Hide Other MCE Sources on Send')}</span>
                    </label>
                    <div style={{ fontSize: 10, opacity: 0.5, padding: "2px 8px 0 22px", lineHeight: 1.4 }}>
                      {t(
                        'page.hideOtherMceSourcesOnSendDesc',
                        'When off, sending Bible, Worship, media, or lower thirds keeps other MCE Presentation sources visible.',
                      )}
                    </div>

                    {/* Lower Thirds → Presentation Only */}
                    <label
                      className="dock-sidebar__check"
                      style={{ marginTop: 8, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked


                      />
                      <span>{t('page.presentationOnly', 'Lower Thirds in Presentation')}</span>
                    </label>
                    <div style={{ fontSize: 10, opacity: 0.5, padding: "2px 8px 0 22px", lineHeight: 1.4 }}>
                      {t('page.presentationOnlyDesc', 'Lower thirds go to MCE Presentation only, not the Program scene')}
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
                  title={t('dock.history')}>
                  <Icon name="history" size={16} />
                  <span>{t('dock.history')}</span>
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
              </div>
            </div>
          </div>
        )}

        {/* ── Clear All MCE Scenes Confirmation ── */}
        {showClearScenesConfirm && (
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

        {showReconnectModal && (
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
            {mountedTabs.planner && (
              <div
                key="planner-pane"
                className="dock-content-pane"
                hidden={activeTab !== "planner"}
                aria-hidden={activeTab !== "planner"}
                style={activeTab === "planner" ? undefined : { display: "none" }}
              >
                <DockPlannerTab
                  staged={staged}
                  onStage={handleStage}
                  initialSnapshot={servicePlanner}
                />
              </div>
            )}
            {mountedTabs.bible && (
              <div
                key="bible-pane"
                className="dock-content-pane"
                hidden={activeTab !== "bible"}
                aria-hidden={activeTab !== "bible"}
                style={activeTab === "bible" ? undefined : { display: "none" }}
              >
                <DockBibleTab
                  staged={staged}
                  onStage={handleStage}
                  productionDefaults={productionSettings.bible}
                  appConnected={appConnected}
                  isActive={activeTab === "bible"}
                  showHistory={showHistory}
                  onHistoryClose={() => setShowHistory(false)}
                  compactToolbar={compactToolbar}
                />
              </div>
            )}
            {mountedTabs.worship && (
              <div
                key="worship-pane"
                className="dock-content-pane"
                hidden={activeTab !== "worship"}
                aria-hidden={activeTab !== "worship"}
                style={activeTab === "worship" ? undefined : { display: "none" }}
              >
                <DockWorshipTab
                  staged={staged}
                  onStage={handleStage}
                  productionDefaults={productionSettings.worship}
                  isActive={activeTab === "worship"}
                  compactToolbar={compactToolbar}
                />
              </div>
            )}
            {mountedTabs.media && (
              <div
                key="media-pane"
                className="dock-content-pane"
                hidden={activeTab !== "media"}
                aria-hidden={activeTab !== "media"}
                style={activeTab === "media" ? undefined : { display: "none" }}
              >
                <DockMediaTab
                  staged={staged}
                  onStage={handleStage}
                  isActive={activeTab === "media"}
                />
              </div>
            )}
            {mountedTabs.multiview && (
              <div
                key="multiview-pane"
                className="dock-content-pane"
                hidden={activeTab !== "multiview"}
                aria-hidden={activeTab !== "multiview"}
                style={activeTab === "multiview" ? undefined : { display: "none" }}
              >
                <DockMultiviewTab />
              </div>
            )}
            {mountedTabs.ministry && (
              <div
                key="ministry-pane"
                className="dock-content-pane"
                hidden={activeTab !== "ministry"}
                aria-hidden={activeTab !== "ministry"}
                style={activeTab === "ministry" ? undefined : { display: "none" }}
              >
                <DockMinistryTab
                  staged={staged}
                  onStage={handleStage}
                  tickerOutputMode={tickerOutputMode}
                />
              </div>
            )}
          </div>
        </div>
      </div>{/* end dock-main-column */}

      {/* ═══ HORIZONTAL TAB NAVIGATION (bottom, hidden when vertical) ═══ */}
      {!verticalTabs && (
        <nav className="dock-bottom-nav" aria-label={t('page.dockSections')}>
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

      {/* ── Language change confirmation modal ── */}
      {showLanguageModal && pendingLanguage && (
        <div className="dock-modal-overlay" onClick={() => { setShowLanguageModal(false); setPendingLanguage(null); }}>
          <div className="dock-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dock-modal__header">
              <h3>{t('dock.changeLanguage') || 'Change Language'}</h3>
            </div>
            <div className="dock-modal__body">
              <p>{t('dock.changeLanguageConfirm', { language: getInterfaceLanguageLabel(pendingLanguage) }) || `Change interface language to ${getInterfaceLanguageLabel(pendingLanguage)}?`}</p>
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
                  const code = pendingLanguage!;
                  void applyInterfaceLanguagePreference(code, { broadcast: true }).then(setInterfaceLanguage);
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
