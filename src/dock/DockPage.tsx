/**
 * DockPage.tsx — MakeChurchEasy Dock Control Panel
 *
 * The dock keeps Bible, Worship + Notes, and Media production controls inside OBS.
 */

import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef, useTransition, type CSSProperties, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { dockClient, dockBridge, type DockStateMessage } from "../services/dockBridge";
import { dockObsClient, type DockObsStatus } from "./dockObsClient";
import { DOCK_TABS, type DockTab, type DockStagedItem } from "./dockTypes";
import type { DockPresentationOutputTarget } from "./dockPresentationTarget";
import { isPresentationLinkTarget } from "./dockPresentationTarget";
import { useAppTheme } from "../hooks/useAppTheme";
import {
  APP_APPEARANCE_PALETTES,
  DEFAULT_DOCK_VISUALS,
  getDockAppearanceCssVariables,
  type DockVisualPreferences,
} from "../services/appAppearance";
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
import DockBrowserZoomWarning from "./components/DockBrowserZoomWarning";
import { registerUpgradeModal, startPlanRefresh } from "./dockEntitlement";
import { publishDockStagedItemToPresentation } from "../services/presentationDockBridge";
import {
  DEFAULT_DOCK_FONT_SCALE,
  DEFAULT_DOCK_FONT_FAMILY,
  DOCK_FONT_FAMILY_GROUPS,
  DOCK_FONT_FAMILY_OPTIONS,
  DOCK_FONT_SCALE_OPTIONS,
  buildDockFontFamilyStack,
  hydrateDockTypographyPreferences,
  loadDockFontFamily,
  loadDockFontScale,
  normalizeDockFontFamily,
  normalizeDockFontScale,
  saveDockFontFamily,
  saveDockFontScale,
} from "./dockFontFamily";
import {
  DEFAULT_DOCK_OUTPUT_FONT_FAMILY,
  DEFAULT_DOCK_OUTPUT_FONT_SCALE,
  hydrateDockOutputTypographyPreferences,
  saveDockOutputFontFamily,
  saveDockOutputFontScale,
} from "./dockOutputTypography";
import {
  downloadDockSession,
  importDockSessionFromFile,
} from "./dockSessionTransfer";
import {
  hydrateNativeDockSettings,
  isNativeDockSettingsHydrated,
  readNativeDockSetting,
  writeNativeDockSetting,
} from "../services/localDockSettings";
import "./dock.css";
import "./dock-theme.css";
import "../accessibility.css";
import Icon from "./DockIcon";
import {
  normalizeDockSearchPlacement,
  type DockSearchPlacement,
} from "./dockSearchPlacement";

const loadDockBibleTab = () => import("./tabs/DockBibleTab");
const loadDockMediaTab = () => import("./tabs/DockMediaTab");
const loadDockWorshipTab = () => import("./tabs/DockWorshipTab");
const loadDockPlannerTab = () => import("./tabs/DockPlannerTab");
const loadDockMultiviewTab = () => import("./tabs/DockMultiviewTab");
const loadDockMinistryTab = () => import("./tabs/DockMinistryTab");
const loadDockLmTab = () => import("./tabs/DockLmTab");
const loadDockBibleCommandPaletteHost = () => import("./DockBibleCommandPaletteHost");

const DockBibleTab = lazy(loadDockBibleTab);
const DockMediaTab = lazy(loadDockMediaTab);
const DockWorshipTab = lazy(loadDockWorshipTab);
const DockPlannerTab = lazy(loadDockPlannerTab);
const DockMultiviewTab = lazy(loadDockMultiviewTab);
const DockMinistryTab = lazy(loadDockMinistryTab);
const DockLmTab = lazy(loadDockLmTab);
const DockBibleCommandPaletteHost = lazy(loadDockBibleCommandPaletteHost);

const DOCK_TAB_PRELOADERS: Partial<Record<DockTab, () => Promise<unknown>>> = {
  bible: loadDockBibleTab,
  worship: loadDockWorshipTab,
  media: loadDockMediaTab,
  planner: loadDockPlannerTab,
  multiview: loadDockMultiviewTab,
  ministry: loadDockMinistryTab,
};

const DOCK_TAB_SHORTCUTS = [
  { key: "1", tab: "bible" as DockTab, labelKey: "page.shortcutTabBible" },
  { key: "2", tab: "worship" as DockTab, labelKey: "page.shortcutTabWorship" },
  { key: "3", tab: "media" as DockTab, labelKey: "page.shortcutTabMedia" },
  { key: "4", tab: "ministry" as DockTab, labelKey: "page.shortcutTabMinistry" },
  { key: "5", tab: "multiview" as DockTab, labelKey: "page.shortcutTabMultiview" },
] as const;

function preloadDockTab(tab: DockTab): void {
  void DOCK_TAB_PRELOADERS[tab]?.();
}

const DOCK_SHELL_PREFS_KEY = "ocs-dock-shell-preferences";
const DOCK_STAGED_ITEM_KEY = "ocs-dock-staged-item";

interface DockShellPreferences {
  activeTab?: DockTab | "live";
  disabledTabs?: DockTab[];
  searchPlacement?: DockSearchPlacement;
}

import { loadProjectionSettings, saveProjectionSettings, type ProjectionSettings } from "./dockProjectionSettings";

function resolveDockTab(tab?: DockTab | "live" | null): DockTab {
  if (tab === "notes") return "worship";
  if (tab === "planner" || tab === "bible" || tab === "worship" || tab === "media" || tab === "multiview" || tab === "ministry") {
    return tab;
  }
  return "bible";
}

function loadDockStagedItem(): DockStagedItem | null {
  const parsed = readNativeDockSetting<DockStagedItem | null>(DOCK_STAGED_ITEM_KEY);
  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.type !== "string" || typeof parsed.label !== "string") return null;
  return parsed;
}

function saveDockStagedItem(item: DockStagedItem | null): void {
  writeNativeDockSetting(DOCK_STAGED_ITEM_KEY, item);
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
  const parsed = readNativeDockSetting<DockShellPreferences>(DOCK_SHELL_PREFS_KEY);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function saveDockShellPreferences(next: DockShellPreferences): void {
  writeNativeDockSetting(DOCK_SHELL_PREFS_KEY, next);
}

function getCompactDockTabLabel(tab: DockTab, t: (key: string) => string): string {
  switch (tab) {
    case "bible":
      return t('page.shortcutTabBible');
    case "worship":
      return t('page.shortcutTabWorship');
    case "notes":
      return t('notes.title');
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

interface DockPageProps {
  externalObsSession?: boolean;
  presentationBibleLmSplit?: boolean;
  presentationOutputTarget?: DockPresentationOutputTarget;
  enablePresentationAssistantMicControls?: boolean;
  hideLowerThirdControls?: boolean;
  hideTickerControls?: boolean;
  hiddenTabs?: DockTab[];
  hideShellHeader?: boolean;
  initialProductionSettings?: DockProductionSettingsPayload;
  onActiveTabChange?: (tab: DockTab) => void;
}

function DockPageContent({
  externalObsSession = false,
  presentationBibleLmSplit = false,
  presentationOutputTarget = "obs",
  enablePresentationAssistantMicControls = false,
  hideLowerThirdControls = false,
  hideTickerControls = false,
  hiddenTabs = [],
  hideShellHeader = false,
  initialProductionSettings,
  onActiveTabChange,
}: DockPageProps = {}) {
  const { t } = useTranslation();
  const presentationLinkMode = isPresentationLinkTarget(presentationOutputTarget);
  // Synchronous config reader (reads from cache, falls back to defaults)
  const cfg = readDesktopConfigCache() || DEFAULT_DESKTOP_CONFIG;

  const dockRootRef = useRef<HTMLDivElement>(null);
  const shellPreferences = loadDockShellPreferences();
  const {
    effective,
    preference: themePreference,
    setTheme,
    appearance,
    setAppearance,
  } = useAppTheme();
  const initialActiveTab = resolveDockTab(shellPreferences.activeTab);
  const initialSearchPlacement = normalizeDockSearchPlacement(shellPreferences.searchPlacement);
  const [activeTab, setActiveTab] = useState<DockTab>(() => initialActiveTab);
  const [searchPlacement, setSearchPlacement] = useState<DockSearchPlacement>(() => initialSearchPlacement);
  const [renderedTab, setRenderedTab] = useState<DockTab>(() => initialActiveTab);
  const [, startTransition] = useTransition();
  const [visitedTabs, setVisitedTabs] = useState<Set<DockTab>>(() => new Set([initialActiveTab]));
  const [disabledTabs, setDisabledTabs] = useState<DockTab[]>(() =>
    (shellPreferences.disabledTabs ?? []).filter((tab) => tab !== "notes"),
  );
  const [dockHeight, setDockHeight] = useState(0);
  const verticalTabs = dockHeight > 0 && dockHeight <= 600;
  const [obsConnected, setObsConnected] = useState(false);
  const [obsError, setObsError] = useState("");
  const [staged, setStaged] = useState<DockStagedItem | null>(() => loadDockStagedItem());
  const [appConnected, setAppConnected] = useState(false);
  const [obsUrlInput, setObsUrlInput] = useState(getDefaultOBSUrl());
  const [obsPwInput, setObsPwInput] = useState("");
  const [productionSettings, setProductionSettings] = useState<DockProductionSettingsPayload>(
    () => initialProductionSettings ?? getDefaultDockProductionSettings(),
  );
  const [servicePlanner, setServicePlanner] = useState<ServicePlannerSnapshot | null>(null);
  const [projectionSettings, setProjectionSettings] = useState<ProjectionSettings>(() => loadProjectionSettings());
  const [dockFontFamily, setDockFontFamily] = useState<string>(() => loadDockFontFamily());
  const [dockFontScale, setDockFontScale] = useState<number>(() => loadDockFontScale());
  const typographyHydrationGenerationRef = useRef(0);
  const [upgradeModalMsg, setUpgradeModalMsg] = useState("");
  const hiddenTabsKey = hiddenTabs.join("|");
  const hiddenTabIds = useMemo(() => new Set<DockTab>(hiddenTabs), [hiddenTabsKey]);
  const visibleDockTabs = useMemo(() => DOCK_TABS.filter((tab) => !hiddenTabIds.has(tab.id)), [hiddenTabIds]);
  const navigableDockTabs = useMemo(
    () => visibleDockTabs.filter((tab) => !disabledTabs.includes(tab.id)),
    [disabledTabs, visibleDockTabs],
  );

  // Keep the tab button and shell state responsive first. Heavy tab trees are
  // rendered in a transition on the next task, so the click is painted before
  // Bible/Worship/Media mount or rerender their larger panels.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      startTransition(() => setRenderedTab(activeTab));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, startTransition]);

  useEffect(() => {
    let cancelled = false;
    const generation = typographyHydrationGenerationRef.current;

    void Promise.all([
      hydrateDockTypographyPreferences(),
      hydrateDockOutputTypographyPreferences(),
    ]).then(([preferences]) => {
      if (cancelled || typographyHydrationGenerationRef.current !== generation) return;
      setDockFontFamily(preferences.fontFamily);
      setDockFontScale(preferences.fontScale);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateProjectionSettings = useCallback((patch: Partial<ProjectionSettings>) => {
    setProjectionSettings((current) => {
      const next = { ...current, ...patch };
      // Persist immediately so a clear/send action in the same interaction
      // sees the checkbox value even before React effects flush.
      saveProjectionSettings(next);
      return next;
    });
  }, []);

  const updateProjectionSceneMode = useCallback((sceneMode: ProjectionSettings["sceneMode"]) => {
    updateProjectionSettings({ sceneMode });
    void dockObsClient.applyProjectionSettings({ allowSceneMutation: true }).catch((error) => {
      console.warn("[Dock] Failed to apply OBS output routing:", error);
    });
  }, [updateProjectionSettings]);

  const updateDockFontFamily = useCallback((value: string) => {
    typographyHydrationGenerationRef.current += 1;
    const next = normalizeDockFontFamily(value);
    setDockFontFamily(next);
    saveDockFontFamily(next);
  }, []);

  const updateDockFontScale = useCallback((value: string) => {
    typographyHydrationGenerationRef.current += 1;
    const next = normalizeDockFontScale(value);
    setDockFontScale(next);
    saveDockFontScale(next);
  }, []);

  const resetDockTypography = useCallback(() => {
    typographyHydrationGenerationRef.current += 1;
    setDockFontFamily(DEFAULT_DOCK_FONT_FAMILY);
    saveDockFontFamily(DEFAULT_DOCK_FONT_FAMILY);
    setDockFontScale(DEFAULT_DOCK_FONT_SCALE);
    saveDockFontScale(DEFAULT_DOCK_FONT_SCALE);
    saveDockOutputFontFamily(DEFAULT_DOCK_OUTPUT_FONT_FAMILY);
    saveDockOutputFontScale(DEFAULT_DOCK_OUTPUT_FONT_SCALE);
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
  const [dockSaveFeedback, setDockSaveFeedback] = useState<{ id: number; message: string } | null>(null);
  const dockSaveFeedbackTimerRef = useRef<number | null>(null);
  const [dockSessionTransferBusy, setDockSessionTransferBusy] = useState(false);
  const [dockSessionFeedback, setDockSessionFeedback] = useState<{ id: number; message: string; tone: "success" | "error" } | null>(null);
  const dockSessionImportInputRef = useRef<HTMLInputElement | null>(null);
  const dockSessionFeedbackTimerRef = useRef<number | null>(null);

  const showDockSaveFeedback = useCallback((message: string) => {
    setDockSaveFeedback({ id: Date.now(), message });
    if (dockSaveFeedbackTimerRef.current !== null) {
      window.clearTimeout(dockSaveFeedbackTimerRef.current);
    }
    dockSaveFeedbackTimerRef.current = window.setTimeout(() => {
      setDockSaveFeedback(null);
      dockSaveFeedbackTimerRef.current = null;
    }, 2200);
  }, []);

  useEffect(() => () => {
    if (dockSaveFeedbackTimerRef.current !== null) {
      window.clearTimeout(dockSaveFeedbackTimerRef.current);
    }
    if (dockSessionFeedbackTimerRef.current !== null) {
      window.clearTimeout(dockSessionFeedbackTimerRef.current);
    }
  }, []);

  const showDockSessionFeedback = useCallback((message: string, tone: "success" | "error" = "success") => {
    setDockSessionFeedback({ id: Date.now(), message, tone });
    if (dockSessionFeedbackTimerRef.current !== null) {
      window.clearTimeout(dockSessionFeedbackTimerRef.current);
    }
    dockSessionFeedbackTimerRef.current = window.setTimeout(() => {
      setDockSessionFeedback(null);
      dockSessionFeedbackTimerRef.current = null;
    }, 3200);
  }, []);

  const handleDockSessionExport = useCallback(async () => {
    if (dockSessionTransferBusy) return;
    setDockSessionTransferBusy(true);
    try {
      const result = await downloadDockSession();
      if (result.cancelled) {
        showDockSessionFeedback("Export cancelled.", "error");
        return;
      }
      const sectionCount = result.session.sections.filter((section) => Object.keys(section.storage).length > 0).length;
      setShowSettingsMenu(false);
      const destination = result.savedPath
        ? `Saved to ${result.savedPath}.`
        : result.usedBrowserDownload
          ? "Downloaded to your browser's Downloads folder."
          : "Saved as a JSON file.";
      showDockSessionFeedback(`Exported ${sectionCount || result.session.sections.length} Dock sections. ${destination}`);
    } catch (error) {
      console.error("[Dock] Failed to export Dock session:", error);
      showDockSessionFeedback("Could not export the Dock session.", "error");
    } finally {
      setDockSessionTransferBusy(false);
    }
  }, [dockSessionTransferBusy, showDockSessionFeedback]);

  const handleDockSessionImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || dockSessionTransferBusy) return;

    setDockSessionTransferBusy(true);
    try {
      const result = await importDockSessionFromFile(file);
      setShowSettingsMenu(false);
      showDockSessionFeedback(`Imported ${result.sectionCount} Dock sections. Refreshing the Dock…`);
      window.setTimeout(() => window.location.reload(), 850);
    } catch (error) {
      console.error("[Dock] Failed to import Dock session:", error);
      showDockSessionFeedback(error instanceof Error ? error.message : "Could not import the Dock session.", "error");
    } finally {
      setDockSessionTransferBusy(false);
    }
  }, [dockSessionTransferBusy, showDockSessionFeedback]);

  // ── Global drag-and-drop ──
  const { isDragging, onDrop: registerDropHandler } = useDockDragDrop();
  const { uploading, uploadProgress, toasts: uploadToasts, handleFiles, dismissToast } = useDockUpload();

  useEffect(() => {
    return registerDropHandler(handleFiles);
  }, [registerDropHandler, handleFiles]);

  useEffect(() => {
    saveDockShellPreferences({
      ...loadDockShellPreferences(),
      activeTab,
      disabledTabs,
      searchPlacement,
    });
  }, [activeTab, disabledTabs, searchPlacement]);

  useEffect(() => {
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

  // Keep a visited tab mounted when the operator moves around the dock. This
  // preserves in-progress work in every dock page instead of resetting the
  // page each time React switches the active tab.
  useEffect(() => {
    setVisitedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    if (visibleDockTabs.some((tab) => tab.id === activeTab)) return;
    setActiveTab(visibleDockTabs[0]?.id ?? "bible");
  }, [activeTab, visibleDockTabs]);

  const mountedDockTabs = useMemo(() => {
    const mounted = new Set(visitedTabs);
    mounted.add(renderedTab);
    return mounted;
  }, [renderedTab, visitedTabs]);

  useEffect(() => {
    saveDockStagedItem(staged);
  }, [staged]);

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
                  translationText: recovered.worship.translationText ?? "",
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

  const shortcuts: ShortcutDefinition[] = [
    ...DOCK_TAB_SHORTCUTS
      .filter(({ tab }) => navigableDockTabs.some((candidate) => candidate.id === tab))
      .map(({ key, tab, labelKey }) => ({
        key,
        modifier: "primary" as const,
        handler: () => setActiveTab(tab),
        label: t(labelKey),
        category: t('page.shortcutCategoryNavigation') as ShortcutCategory,
      })),
    { key: "k", handler: () => openCommandPalette(""), label: t('page.shortcutCommandPalette'), category: t('page.shortcutCategoryUtility') as ShortcutCategory },
    { key: "t", handler: () => setTheme(nextTheme), label: themeToggleLabel, category: t('page.shortcutCategoryUtility') as ShortcutCategory },
    { key: "/", handler: () => setShowShortcutsHelp((v) => !v), label: t('page.shortcutsHelp'), category: t('page.shortcutCategoryUtility') as ShortcutCategory },
  ];

  const { toasts } = useKeyboardShortcuts(shortcuts, true);

  // ── Settings Menu State ──
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
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
  const handleHistoryClose = useCallback(() => setShowHistory(false), []);
  const [showClearScenesConfirm, setShowClearScenesConfirm] = useState(false);
  const [clearScenesLoading, setClearScenesLoading] = useState(false);

  // ── Language Selector ──
  const ALL_LANGUAGES: string[] = ["English", "French", "Spanish", "Portuguese", "Yoruba", "Igbo", "Hausa", "Ghanaian"];
  const [interfaceLanguage, setInterfaceLanguage] = useState<string>(() => readNativeDockSetting<string>("mce_interface_language") || "English");
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);

  const dockStyle = useMemo<CSSProperties>(() => {
    const dockVariables = getDockAppearanceCssVariables(appearance, effective);

    // Keep the effect opt-in, but make the glass preference flow through every
    // Dock component that consumes the shared surface tokens. This means cards,
    // panels, menus, and dialogs receive the same translucent treatment without
    // overriding their active, warning, or destructive state colors.
    if (appearance.dockVisuals.glassSurface) {
      const makeTranslucent = (key: string, opacity: number) => {
        const base = dockVariables[key];
        if (base) dockVariables[key] = `color-mix(in srgb, ${base} ${opacity}%, transparent)`;
      };

      makeTranslucent("--dock-bg-secondary", 94);
      makeTranslucent("--dock-surface", 86);
      makeTranslucent("--dock-surface-alt", 82);
      makeTranslucent("--dock-surface-hover", 78);
      makeTranslucent("--dock-surface-overlay", 80);
      makeTranslucent("--dock-input-bg", 90);
      dockVariables["--dock-card"] = dockVariables["--dock-surface-alt"];
      dockVariables["--dock-card-hover"] = dockVariables["--dock-surface-hover"];
    }

    return {
      ...dockVariables,
      "--dock-font-body": buildDockFontFamilyStack(dockFontFamily),
      "--dock-font-heading": buildDockFontFamilyStack(dockFontFamily),
      "--dock-font-scale": String(dockFontScale),
    } as CSSProperties;
  }, [appearance, effective, dockFontFamily, dockFontScale]);

  const updateDockVisual = useCallback((key: keyof DockVisualPreferences, enabled: boolean) => {
    setAppearance({
      dockVisuals: {
        ...appearance.dockVisuals,
        [key]: enabled,
      },
    });
  }, [appearance.dockVisuals, setAppearance]);

  const resetDockVisuals = useCallback(() => {
    setAppearance({ dockVisuals: { ...DEFAULT_DOCK_VISUALS } });
  }, [setAppearance]);

  const dockRootClassName = [
    "dock-root",
    verticalTabs ? "dock-root--vertical-tabs" : "",
    appearance.dockVisuals.glassSurface ? "dock-root--glass" : "",
    appearance.dockVisuals.radialGlow ? "dock-root--radial-glow" : "",
    appearance.dockVisuals.softShadow ? "dock-root--soft-shadow" : "",
    appearance.dockVisuals.motion ? "dock-root--motion" : "dock-root--motion-off",
    headerCollapsed ? "dock-root--header-collapsed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={dockRootClassName} ref={dockRootRef} style={dockStyle}>
      <input
        ref={dockSessionImportInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleDockSessionImport}
        hidden
        aria-hidden="true"
      />
      <a className="mce-skip-link" href="#dock-main-content">
        {t('mvShell.skipToContent', 'Skip to main content')}
      </a>
      {/* ═══ VERTICAL NAV (left side when dock is short) ═══ */}
      {verticalTabs && (
        <nav className="dock-vertical-nav" aria-label={t('page.dockSections')}>
          {navigableDockTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`dock-vertical-nav__item${activeTab === tab.id ? " dock-vertical-nav__item--active" : ""}`}
              onClick={() => {
                setActiveTab(tab.id);
              }}
              onPointerEnter={() => preloadDockTab(tab.id)}
              onPointerDown={() => preloadDockTab(tab.id)}
              onFocus={() => preloadDockTab(tab.id)}
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
        <DockBrowserZoomWarning />
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

        {/* ── Page Header (hamburger L, refresh and theme R) ── */}
        {!hideShellHeader && (
          <div
            className="dock-inline-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: headerCollapsed ? "0 4px" : "6px 8px",
              borderBottom: "1px solid rgba(51, 65, 85, 0.3)",
              flexShrink: 0,
              userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                type="button"
                aria-expanded={!headerCollapsed}
                aria-controls="dock-shell-header-actions"
                aria-label={headerCollapsed ? t("page.expandHeader", "Expand header") : t("page.collapseHeader", "Collapse header")}
                title={headerCollapsed ? t("page.expandHeader", "Expand header") : t("page.collapseHeader", "Collapse header")}
                onClick={() => setHeaderCollapsed((prev) => !prev)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: headerCollapsed ? 24 : 28,
                  height: headerCollapsed ? 24 : 28,
                  padding: 0,
                  border: "none",
                  borderRadius: 3,
                  background: "transparent",
                  color: "#9CA3AF",
                  cursor: "pointer",
                }}
              >
                <Icon name={headerCollapsed ? "chevron_right" : "expand_more"} size={headerCollapsed ? 12 : 14} />
              </button>
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
                  aria-label={t("page.menu", "Menu")}
                  title={t("page.menu", "Menu")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" /></svg>
                </button>
              )}
            </div>
            <div
              id="dock-shell-header-actions"
              hidden={headerCollapsed}
              style={{ display: "flex", alignItems: "center", gap: 2 }}
            >
              {!headerCollapsed && (
                <>
                  <button
                    type="button"
                    className="dock-inline-header__icon-btn"
                    onClick={() => setTheme(nextTheme)}
                    aria-label={themeToggleLabel}
                    title={themeToggleLabel}
                  >
                    <Icon name={themeToggleIcon} size={14} />
                  </button>
                  <button
                    type="button"
                    className="dock-inline-header__icon-btn"
                    onClick={() => window.location.reload()}
                    aria-label={t("common.refresh", "Refresh")}
                    title={t("common.refresh", "Refresh")}
                  >
                    <Icon name="refresh" size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Sidebar ── */}
        {showSettingsMenu && (
          <div className="dock-sidebar-backdrop" onClick={() => setShowSettingsMenu(false)}>
            <div className="dock-sidebar" role="dialog" aria-modal="true" aria-labelledby="dock-menu-title" onClick={(e) => e.stopPropagation()}>
              <div className="dock-sidebar__header">
                <span id="dock-menu-title" className="dock-sidebar__title">{t('dock.menu')}</span>
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
                {/* Appearance */}
                <button
                  type="button"
                  className={`dock-sidebar__item${showAppearance ? " dock-sidebar__item--open" : ""}`}
                  onClick={() => setShowAppearance((current) => !current)}
                  title={t('page.appearance', 'Appearance')}
                  aria-expanded={showAppearance}
                >
                  <Icon name="palette" size={16} />
                  <span>{t('page.appearance', 'Appearance')}</span>
                  <Icon name={showAppearance ? "expand_less" : "expand_more"} size={14} />
                </button>
                {showAppearance && (
                  <div className="dock-sidebar__subpanel dock-sidebar__appearance-panel">
                    <div className="dock-sidebar__section-label">{t('page.colorMode', 'Color mode')}</div>
                    <div className="dock-appearance-mode" role="group" aria-label={t('page.colorMode', 'Color mode')}>
                      {([
                        ["system", t('page.system', 'System')],
                        ["dark", t('page.dark', 'Dark')],
                        ["light", t('page.light', 'Light')],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          className={`dock-appearance-mode__button${themePreference === mode ? " dock-appearance-mode__button--active" : ""}`}
                          onClick={() => setTheme(mode)}
                          aria-pressed={themePreference === mode}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="dock-sidebar__section-label dock-sidebar__section-label--spaced">
                      {t('page.colorTheme', 'Color theme')}
                    </div>
                    <div className="dock-appearance-palette-grid">
                      {APP_APPEARANCE_PALETTES.map((palette) => {
                        const selected = appearance.palette === palette.id;
                        return (
                          <button
                            key={palette.id}
                            type="button"
                            className={`dock-appearance-palette${selected ? " dock-appearance-palette--active" : ""}`}
                            onClick={() => setAppearance({ palette: palette.id })}
                            aria-pressed={selected}
                            title={palette.description}
                          >
                            <span className="dock-appearance-palette__swatches" aria-hidden="true">
                              {palette.swatches.map((swatch) => (
                                <span key={swatch} style={{ background: swatch }} />
                              ))}
                            </span>
                            <span className="dock-appearance-palette__copy">
                              <span className="dock-appearance-palette__title">{palette.label}</span>
                              <span className="dock-appearance-palette__desc">{palette.description}</span>
                            </span>
                            {selected && <Icon name="check" size={13} />}
                          </button>
                        );
                      })}
                    </div>

                    <label className={`dock-appearance-custom${appearance.palette === "custom" ? " dock-appearance-custom--active" : ""}`}>
                      <span className="dock-appearance-custom__copy">
                        <span className="dock-appearance-palette__title">{t('page.customAccent', 'Custom accent')}</span>
                        <span className="dock-appearance-palette__desc">{t('page.customAccentDesc', 'Use a personal accent color')}</span>
                      </span>
                      <input
                        type="color"
                        value={appearance.customAccent}
                        onChange={(event) => setAppearance({ palette: "custom", customAccent: event.target.value })}
                        aria-label={t('page.customAccent', 'Custom accent')}
                      />
                    </label>
                    <div className="dock-sidebar__hint">
                      {t('page.appearanceScope', 'Applies to the app and Dock controls. OBS Bible, Worship, and graphics styles stay independent.')}
                    </div>

                    <div className="dock-sidebar__section-label dock-sidebar__section-label--spaced">
                      {t('page.dockStyle', 'Dock style')}
                    </div>
                    <div className="dock-appearance-effects">
                      <div className="dock-appearance-effects__intro">
                        {t('page.dockStyleDesc', 'Personalize the entire Dock without changing your live graphics.')}
                      </div>
                      {([
                        ["glassSurface", "layers", t('page.dockGlass', 'Glass surface'), t('page.dockGlassDesc', 'Adds soft translucent depth across Dock surfaces, cards, and dialogs.')],
                        ["radialGlow", "gradient", t('page.dockGlow', 'Accent glow'), t('page.dockGlowDesc', 'Adds a gentle glow from your selected accent color across the Dock.')],
                        ["softShadow", "shadow", t('page.dockShadow', 'Soft shadows'), t('page.dockShadowDesc', 'Adds light elevation to Dock surfaces and controls.')],
                        ["motion", "animation", t('page.dockMotion', 'Smooth motion'), t('page.dockMotionDesc', 'Keeps hover, panel, and tab transitions feeling alive across the Dock.')],
                      ] as const).map(([key, icon, label, description]) => (
                        <label key={key} className="dock-appearance-toggle">
                          <span className="dock-appearance-toggle__copy">
                            <span className="dock-appearance-toggle__title">
                              <Icon name={icon} size={13} />
                              <span>{label}</span>
                            </span>
                            <span className="dock-appearance-toggle__desc">{description}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={appearance.dockVisuals[key]}
                            onChange={(event) => updateDockVisual(key, event.target.checked)}
                            aria-label={label}
                          />
                          <span className="dock-appearance-toggle__track" aria-hidden="true">
                            <span className="dock-appearance-toggle__thumb" />
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="dock-sidebar__reset"
                      onClick={resetDockVisuals}
                      disabled={Object.entries(DEFAULT_DOCK_VISUALS).every(([key, value]) => appearance.dockVisuals[key as keyof DockVisualPreferences] === value)}
                    >
                      <Icon name="restart_alt" size={13} />
                      <span>{t('page.resetDockStyle', 'Reset Dock style')}</span>
                    </button>
                  </div>
                )}

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

                <div className="dock-sidebar__subpanel">
                  <div className="dock-sidebar__section-label">
                    {t('page.dockTypography', 'Dock interface')}
                  </div>
                  <div className="dock-sidebar__select-field">
                    <span className="dock-sidebar__select-label">
                      <Icon name="search" size={14} />
                      <span>{t('page.searchPlacement', 'Search placement')}</span>
                    </span>
                    <div className="dock-appearance-mode" role="group" aria-label={t('page.searchPlacement', 'Search placement')}>
                      {([
                        ["top", t('page.searchPlacementTop', 'Top only')],
                        ["bottom", t('page.searchPlacementBottom', 'Bottom only')],
                      ] as const).map(([placement, label]) => (
                        <button
                          key={placement}
                          type="button"
                          className={`dock-appearance-mode__button${searchPlacement === placement ? " dock-appearance-mode__button--active" : ""}`}
                          onClick={() => setSearchPlacement(placement)}
                          aria-pressed={searchPlacement === placement}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="dock-sidebar__hint">
                      {t('page.searchPlacementDesc', 'Choose where the Bible, Worship, and Notes search card appears in the Dock.')}
                    </div>
                  </div>
                  <label className="dock-sidebar__select-field">
                    <span className="dock-sidebar__select-label">
                      <Icon name="font_download" size={14} />
                      <span>{t('page.dockFontFamily', 'Dock font family')}</span>
                    </span>
                    <select
                      className="dock-sidebar__select"
                      value={dockFontFamily}
                      onChange={(event) => updateDockFontFamily(event.target.value)}
                      aria-label={t('page.dockFontFamily', 'Dock font family')}
                    >
                      <option value="">{t('page.dockFontFamilySourceDefault', 'Use app default')}</option>
                      {DOCK_FONT_FAMILY_GROUPS.map((group) => (
                        <optgroup key={group} label={group}>
                          {DOCK_FONT_FAMILY_OPTIONS.filter((option) => option.group === group).map((option) => (
                            <option key={option.id} value={option.family} style={{ fontFamily: option.family }}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label className="dock-sidebar__select-field">
                    <span className="dock-sidebar__select-label">
                      <Icon name="text_fields" size={14} />
                      <span>{t('page.dockFontSize', 'Dock font size')}</span>
                      <output className="dock-sidebar__value" htmlFor="dock-font-scale">
                        {Math.round(dockFontScale * 100)}%
                      </output>
                    </span>
                    <select
                      id="dock-font-scale"
                      className="dock-sidebar__select"
                      value={String(dockFontScale)}
                      onChange={(event) => updateDockFontScale(event.target.value)}
                      aria-label={t('page.dockFontSize', 'Dock font size')}
                    >
                      {DOCK_FONT_SCALE_OPTIONS.map((option) => (
                        <option key={option.id} value={String(option.value)}>
                          {t(`page.fontSize.${option.id}`, option.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="dock-sidebar__hint">
                    {t('page.dockTypographyDesc', 'Changes the Dock interface only. OBS text uses CMG Sans by default.')}
                  </div>
                  <button
                    type="button"
                    className="dock-sidebar__reset"
                    onClick={resetDockTypography}
                    disabled={dockFontFamily === DEFAULT_DOCK_FONT_FAMILY && dockFontScale === DEFAULT_DOCK_FONT_SCALE}
                  >
                    <Icon name="restart_alt" size={13} />
                    <span>{t('page.resetTypography', 'Reset typography')}</span>
                  </button>
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
                        <label className="dock-sidebar__select-field">
                          <span className="dock-sidebar__select-label">
                            <Icon name={projectionSettings.sceneMode === "auto-duplicate" ? "visibility" : "visibility_off"} size={14} />
                            <span>{t('page.programBackground', 'Program background')}</span>
                          </span>
                          <select
                            className="dock-sidebar__select dock-sidebar__select--routing"
                            value={projectionSettings.sceneMode}
                            onChange={(event) => updateProjectionSceneMode(event.target.value as ProjectionSettings["sceneMode"])}
                            aria-label={t('page.programBackground', 'Program background')}
                          >
                            <option value="no-clone">{t('page.off', 'Off')}</option>
                            <option value="auto-duplicate">{t('page.on', 'On')}</option>
                          </select>
                        </label>
                        <div className="dock-sidebar__hint">
                          {projectionSettings.sceneMode === "auto-duplicate"
                            ? t('page.programBackgroundOnDesc', 'Put the current Program scene under MCE Presentation immediately.')
                            : t('page.programBackgroundOffDesc', 'Do not place the Program scene inside MCE Presentation.')}
                        </div>

                        <div className="dock-sidebar__section-label dock-sidebar__section-label--spaced">{t('page.sendBehavior', 'Send Behavior')}</div>

                        <label className="dock-sidebar__check dock-sidebar__check--stacked">
                          <input
                            type="checkbox"
                            checked={projectionSettings.restoreOriginalScene}
                            onChange={(e) => updateProjectionSettings({ restoreOriginalScene: e.target.checked })}
                          />
                          <span className="dock-sidebar__check-copy">
                            <span>{t('page.returnToPreviousScene', 'Return to previous Program scene after clear')}</span>
                            <small>{t('page.returnToPreviousSceneDesc', 'When MCE clears its overlay, OBS goes back to the scene that was live before.')}</small>
                          </span>
                        </label>

                        <div className="dock-sidebar__section-label dock-sidebar__section-label--spaced">
                          {t('page.sourceVisibility', 'MCE Presentation source visibility')}
                        </div>
                        <label className="dock-sidebar__select-field">
                          <span className="dock-sidebar__select-label">
                            <Icon name={projectionSettings.presentationSourceVisibility === "active-only" ? "visibility_off" : "visibility"} size={14} />
                            <span>{t('page.presentationSourceVisibility', 'MCE Presentation content')}</span>
                          </span>
                          <select
                            className="dock-sidebar__select"
                            value={projectionSettings.presentationSourceVisibility}
                            onChange={(event) => updateProjectionSettings({
                              presentationSourceVisibility: event.target.value as ProjectionSettings["presentationSourceVisibility"],
                            })}
                            aria-label={t('page.presentationSourceVisibility', 'MCE Presentation content')}
                          >
                            <option value="active-only">{t('page.showActiveOnly', 'Show only active MCE content')}</option>
                            <option value="keep-visible">{t('page.keepOtherSourcesVisible', 'Keep all MCE content visible')}</option>
                          </select>
                        </label>
                        <div className="dock-sidebar__hint">
                          {t('page.sourceVisibilityDesc', 'When Bible, Worship, Notes, Media, Ticker, or Countdown is pushed, hide every other MCE-created content source in MCE Presentation. Your own OBS sources are untouched.')}
                        </div>

                        <label className="dock-sidebar__select-field">
                          <span className="dock-sidebar__select-label">
                            <Icon name="branding_watermark" size={14} />
                            <span>{t('page.lowerThirdSourceVisibility', 'Lower third behavior')}</span>
                          </span>
                          <select
                            className="dock-sidebar__select"
                            value={projectionSettings.lowerThirdSourceVisibility}
                            onChange={(event) => updateProjectionSettings({
                              lowerThirdSourceVisibility: event.target.value as ProjectionSettings["lowerThirdSourceVisibility"],
                            })}
                            aria-label={t('page.lowerThirdSourceVisibility', 'Lower third behavior')}
                          >
                            <option value="keep-first">{t('page.lowerThirdKeepFirst', 'Keep the first MCE layer visible')}</option>
                            <option value="active-only">{t('page.lowerThirdActiveOnly', 'Show only the active lower third')}</option>
                          </select>
                        </label>
                        <div className="dock-sidebar__hint">
                          {t('page.lowerThirdSourceVisibilityDesc', 'This applies inside MCE Presentation. OBS sources you created yourself are never changed.')}
                        </div>
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

                {/* Session sections — keep this at the end of the menu after the destructive OBS action. */}
                <div className="dock-sidebar__section-label dock-sidebar__section-label--spaced">
                  {t('page.sessionSections', 'Session sections')}
                </div>
                <div className="dock-session-transfer">
                  <div className="dock-session-transfer__copy">
                    <span className="dock-session-transfer__title">
                      <Icon name="folder_zip" size={13} />
                      <span>{t('page.dockSession', 'Dock Session')}</span>
                    </span>
                    <span className="dock-session-transfer__desc">
                      {t('page.dockSessionDesc', 'Move Bible, lyrics, notes, media, Ministry, Multi-View, and appearance in one JSON file.')}
                    </span>
                  </div>
                  <div className="dock-session-transfer__actions">
                    <button
                      type="button"
                      className="dock-btn dock-btn--preview dock-btn--sm"
                      onClick={() => { void handleDockSessionExport(); }}
                      disabled={dockSessionTransferBusy}
                      title={t('page.exportDockSession', 'Export Dock session')}
                    >
                      <Icon name={dockSessionTransferBusy ? "sync" : "download"} size={13} className={dockSessionTransferBusy ? "dock-spin" : undefined} />
                      {t('common.export', 'Export')}
                    </button>
                    <button
                      type="button"
                      className="dock-btn dock-btn--primary dock-btn--sm"
                      onClick={() => dockSessionImportInputRef.current?.click()}
                      disabled={dockSessionTransferBusy}
                      title={t('page.importDockSession', 'Import Dock session')}
                    >
                      <Icon name={dockSessionTransferBusy ? "sync" : "upload_file"} size={13} className={dockSessionTransferBusy ? "dock-spin" : undefined} />
                      {t('common.import', 'Import')}
                    </button>
                  </div>

                </div>
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



        <main id="dock-main-content" tabIndex={-1} className="dock-content">

          <div className="dock-content-main">
            <Suspense fallback={<div className="dock-tab-loading">{t('common.loading')}</div>}>
              {mountedDockTabs.has("planner") && (
                <div className="dock-tab-panel" hidden={renderedTab !== "planner"}>
                  <DockPlannerTab
                    staged={staged}
                    onStage={handleStage}
                    initialSnapshot={servicePlanner}
                  />
                </div>
              )}
              {mountedDockTabs.has("bible") && (
                <div className="dock-tab-panel" hidden={renderedTab !== "bible"}>
                  {presentationBibleLmSplit ? (
                    <div className="dock-presentation-bible-lm-split">
                      <section className="dock-presentation-bible-lm-pane" aria-label="Bible dock">
                        <div className="dock-presentation-bible-lm-pane__title">Bible</div>
                        <DockBibleTab
                          staged={staged}
                          onStage={handleStage}
                          productionDefaults={productionSettings.bible}
                          appConnected={appConnected}
                          presentationOutputTarget={presentationOutputTarget}
                          searchPlacement={searchPlacement}
                          onSaveFeedback={showDockSaveFeedback}
                          showHistory={showHistory}
                          onHistoryClose={handleHistoryClose}
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
                      searchPlacement={searchPlacement}
                      onSaveFeedback={showDockSaveFeedback}
                      fullscreenOnly={hideLowerThirdControls}
                      showHistory={showHistory}
                      onHistoryClose={handleHistoryClose}
                    />
                  )}
                </div>
              )}
              {mountedDockTabs.has("worship") && (
                <div className="dock-tab-panel" hidden={renderedTab !== "worship"}>
                  <DockWorshipTab
                    staged={staged}
                    onStage={handleStage}
                    productionDefaults={productionSettings.worship}
                    presentationOutputTarget={presentationOutputTarget}
                    searchPlacement={searchPlacement}
                    fullscreenOnly={hideLowerThirdControls}
                    showSubtabs
                    compactVerticalNav={verticalTabs}
                    initialSubTab={shellPreferences.activeTab === "notes" ? "notes" : undefined}
                  />
                </div>
              )}
              {mountedDockTabs.has("media") && (
                <div className="dock-tab-panel" hidden={renderedTab !== "media"}>
                  <DockMediaTab
                    staged={staged}
                    onStage={handleStage}
                    presentationOutputTarget={presentationOutputTarget}
                  />
                </div>
              )}
              {mountedDockTabs.has("multiview") && (
                <div className="dock-tab-panel" hidden={renderedTab !== "multiview"}>
                  <DockMultiviewTab isActive={renderedTab === "multiview"} />
                </div>
              )}
              {mountedDockTabs.has("ministry") && (
                <div className="dock-tab-panel" hidden={renderedTab !== "ministry"}>
                  <DockMinistryTab
                    staged={staged}
                    onStage={handleStage}
                    presentationOutputTarget={presentationOutputTarget}
                    hideTickerControls={hideTickerControls}
                    hideLowerThirdControls={hideLowerThirdControls}
                  />
                </div>
              )}
            </Suspense>
          </div>
        </main>
      </div>

      {/* ═══ HORIZONTAL TAB NAVIGATION (bottom, hidden when vertical) ═══ */}
      {!verticalTabs && (
        <nav className="dock-bottom-nav" aria-label={t('page.dockSections')}>
          {navigableDockTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`dock-bottom-nav__item${activeTab === tab.id ? " dock-bottom-nav__item--active" : ""}`}
              onClick={() => {
                setActiveTab(tab.id);
              }}
              onPointerEnter={() => preloadDockTab(tab.id)}
              onPointerDown={() => preloadDockTab(tab.id)}
              onFocus={() => preloadDockTab(tab.id)}
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
          aria-modal="true"
          aria-labelledby="dock-shortcuts-title"
        >
          <div className="dock-shortcuts-overlay__content" onClick={(e) => e.stopPropagation()}>
            <div className="dock-shortcuts-overlay__header">
              <div>
                <div className="dock-shortcuts-overlay__eyebrow">{t('dock.dockLabel')}</div>
                <div id="dock-shortcuts-title" className="dock-shortcuts-overlay__title">{t('page.keyboardShortcuts')}</div>
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
                  {DOCK_TAB_SHORTCUTS
                    .filter(({ tab }) => navigableDockTabs.some((candidate) => candidate.id === tab))
                    .map((s) => (
                    <div key={s.key} className="dock-shortcuts-item">
                      <span className="dock-shortcuts-item__key">{formatShortcut(s.key, "primary")}</span>
                      <span className="dock-shortcuts-item__label">{t(s.labelKey)}</span>
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

      {dockSaveFeedback && (
        <div className="dock-feedback-toast-stack" aria-live="polite" aria-atomic="true">
          <div key={dockSaveFeedback.id} className="dock-feedback-toast" role="status">
            <Icon name="check_circle" size={13} />
            <span>{dockSaveFeedback.message}</span>
          </div>
        </div>
      )}

      {dockSessionFeedback && (
        <div className="dock-feedback-toast-stack" aria-live="polite" aria-atomic="true">
          <div
            key={dockSessionFeedback.id}
            className={`dock-feedback-toast${dockSessionFeedback.tone === "error" ? " dock-feedback-toast--error" : ""}`}
            role={dockSessionFeedback.tone === "error" ? "alert" : "status"}
          >
            <Icon name={dockSessionFeedback.tone === "error" ? "error" : "check_circle"} size={13} />
            <span>{dockSessionFeedback.message}</span>
          </div>
        </div>
      )}

      {/* ── Entitlement upgrade modal ── */}
      <DockUpgradeModal
        open={Boolean(upgradeModalMsg)}
        onClose={() => setUpgradeModalMsg("")}
        message={upgradeModalMsg}
      />

      {/* ── Language change confirmation modal ── */}
      {showLanguageModal && pendingLanguage && (
        <div className="dock-modal-overlay" onClick={() => { setShowLanguageModal(false); setPendingLanguage(null); }}>
          <div className="dock-modal" role="dialog" aria-modal="true" aria-labelledby="dock-language-title" onClick={(e) => e.stopPropagation()}>
            <div className="dock-modal__header">
              <h3 id="dock-language-title">{t('dock.changeLanguage') || 'Change Language'}</h3>
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
                  writeNativeDockSetting("mce_interface_language", lang);
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

/**
 * The Dock must hydrate the native settings database before mounting the
 * content component. Otherwise every useState initializer can briefly see a
 * default value and another component can act on that value during startup.
 */
export default function DockPage(props: DockPageProps = {}) {
  const [settingsReady, setSettingsReady] = useState(() => isNativeDockSettingsHydrated());
  const [initialProductionSettings, setInitialProductionSettings] = useState<DockProductionSettingsPayload | null>(null);

  useEffect(() => {
    if (settingsReady && initialProductionSettings) return;

    let cancelled = false;
    let retryTimer: number | null = null;

    const hydrate = async () => {
      try {
        await hydrateNativeDockSettings();
        const productionSettings = await loadDockProductionSettings();
        if (!cancelled) {
          setInitialProductionSettings(productionSettings);
          setSettingsReady(true);
        }
      } catch (error) {
        console.warn("[Dock] Waiting for the local settings database:", error);
        if (!cancelled) {
          retryTimer = window.setTimeout(() => {
            void hydrate();
          }, 500);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [initialProductionSettings, settingsReady]);

  if (!settingsReady || !initialProductionSettings) {
    return (
      <div className="dock-tab-loading" role="status" aria-live="polite">
        Loading saved Dock settings…
      </div>
    );
  }

  // The equivalent `return <DockPageContent {...props} />` is intentionally
  // held until the persisted startup snapshot is ready.
  return <DockPageContent {...props} initialProductionSettings={initialProductionSettings} />;
}
