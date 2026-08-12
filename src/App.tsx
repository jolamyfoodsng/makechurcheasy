/**
 * App.tsx — MakeChurchEasy
 *
 * Root component with React Router.
 *
 * Startup sequence:
 *   1. Splash screen shown (environment-specific onboarding splash)
 *   2. Resources pre-loaded + GitHub update check runs in parallel
 *   3. If update available → non-blocking floating notification (bottom-right)
 *   4. App continues polling for updates while running
 *   5. Main app is always accessible — updates never block workflow
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { OBSConnectGate } from "./components/OBSConnectGate";
import AuthGate from "./components/AuthGate";
import LicenseGuard from "./components/LicenseGuard";
import FeatureGuard from "./components/FeatureGuard";
import { useAuth } from "./contexts/AuthContext";
import { initLicenseGuard, reverifyOnAuth } from "./services/licenseGuard";
import { AppShell } from "./AppShell";
import { MVSettings } from "./multiview/pages/MVSettings";
import { MVShell } from "./multiview/MVShell";
import { BibleProvider } from "./bible/bibleStore";
import { LowerThirdProvider } from "./lowerthirds/lowerThirdStore";
import SplashScreen from "./components/SplashScreen";
import UpdateNotification from "./components/UpdateNotification";
import ForceUpdateModal from "./components/ForceUpdateModal";
import ForcedUpdateOverlay from "./components/ForcedUpdateOverlay";
import VersionFloorWarningBanner from "./components/VersionFloorWarningBanner";
import TrialModal, { hasTrialWelcomeBeenShown, markTrialWelcomeAsShown } from "./components/TrialModal";
import TrialExpiredUpgradeModal from "./components/TrialExpiredUpgradeModal";
import VerificationGate from "./components/VerificationGate";
import { getDeviceId } from "./services/authService";
import Icon from "./components/Icon";
import { checkForUpdate, downloadAndInstallUpdate, downloadAndInstallFromGitHub, getVersionAge, fetchVersionFloor, type UpdateCheckResult, type DownloadProgress } from "./services/updateService";
import {
  fetchAppSettings,
  getForcedUpdateState,
  shouldReshowOverlay,
  recordOverlayDismiss,
  type ForcedUpdateState,
} from "./services/forcedUpdateService";
import { initOverlayUrl } from "./services/overlayUrl";
import { migrateFromLegacyDatabases } from "./services/db";
import { getSettings, MV_SETTINGS_UPDATED_EVENT, seedTemplates, syncLayoutsToDock, type MVSettings as MVSettingsType } from "./multiview/mvStore";
import { STARTER_TEMPLATES } from "./multiview/templates";
import { applyBrandingSettingsToDom } from "./services/branding";
import { useAppTheme } from "./hooks/useAppTheme";
import { getAppTitle, getSplashImageSrc } from "./services/envConfig";
import DevDashboard from "./pages/DevDashboard";
import { getPresentationRemoteAccessInfo } from "./services/presentationRemote";

import { dockBridge } from "./services/dockBridge";
import { initDockCommandHandler } from "./services/dockCommandHandler";
import { initMobileRemoteCommandBridge } from "./services/mobileRemoteCommandBridge";
import { getUserScopedKey } from "./services/userScopedStorage";
import { lmDockService } from "./services/lmDockService";
import { obsService } from "./services/obsService";
import { appStatusManager } from "./services/appStatusManager";
import { serviceStore as svcStore } from "./services/serviceStore";
import { getAllSongs, getSong, saveSong, syncSongsToDock } from "./worship/worshipDb";
import { generateSlides } from "./worship/slideEngine";
import { checkEntitlementSync } from "./services/entitlementClient";
import { getEffectivePlan } from "./services/licenseService";
import type { Song } from "./worship/types";
import type { MediaItem } from "./library/libraryTypes";
import { deleteMedia, getAllMedia, saveMedia } from "./library/libraryDb";
import { syncCustomThemesToDock, syncInstalledTranslationsToDock } from "./bible/bibleDb";
import ResourcesPage from "./pages/ResourcesPage";
import ProductionHomePage from "./pages/ProductionHomePage";
import MultiViewGalleryPage from "./pages/MultiViewGalleryPage";
import CountdownsPage from "./pages/CountdownsPage";
import ProductionThemeSettingsPage from "./pages/ProductionThemeSettingsPage";
import OnboardingPage from "./pages/OnboardingPage";
import PresentationSetupPage from "./pages/PresentationSetupPage";
import ServicePlannerPage from "./pages/ServicePlannerPage";
import SpeechToScripturePage from "./pages/SpeechToScripturePage";
import TranscriptLibraryPage from "./pages/TranscriptLibraryPage";
import TranscriptDetailPage from "./pages/TranscriptDetailPage";
import CreditsPage from "./pages/CreditsPage";
import CreditsGuard from "./components/CreditsGuard";
import { AnnouncementModalHost } from "./components/AnnouncementModalHost";
import {
  getServicePlannerSnapshot,
  importDockServicePlansFromUploads,
  saveServicePlan,
  syncServicePlansToDock,
} from "./service-planner/servicePlannerStore";
import type { ServicePlan } from "./service-planner/types";
import { buildDockProductionSettingsPayload, syncProductionSettingsToDock } from "./services/productionSettings";
import {
  loadWorshipDockSongSaveCommand,
  saveWorshipDockSongSaveResult,
  type WorshipDockSongSavePayload,
} from "./services/worshipDockInterop";
import { appendTextToDockNotes, loadDockNotes, syncDockNotesToDock } from "./dock/dockNotesStorage";
import type { DockNotesAppendCommand } from "./services/dockNotesInterop";
import { getLiveToolsSnapshot, syncLiveToolsToDock } from "./live-tools/liveToolStore";
import { getCountdownSnapshot } from "./countdowns/countdownStore";
import { STORES, putRecord } from "./services/db";
import { MEDIA_FILE_ACCEPT, isSupportedLibraryImportFile, saveLibraryMediaFile } from "./library/MediaTab";
import {
  trackAppStarted,
  trackAppClosed,
  trackObsConnected,
  trackObsDisconnected,
} from "./services/analytics";
import {
  trackAppStarted as trackAppStartedBackend,
  trackAppClosed as trackAppClosedBackend,
  trackObsConnected as trackObsConnectedBackend,
} from "./services/tracking";
import "./multiview/mv.css";
import "./bible/bible.css";
import "./lowerthirds/lowerthirds.css";
import "./App.css";
import "./NewDashboard.css";
import "./compat-mode.css";
import "./accessibility.css";
import { getRecommendedPollingInterval } from "./services/performanceManager";

const UPDATE_POLL_INTERVAL_MS = 30_000;
const WORSHIP_DOCK_SAVE_POLL_INTERVAL_MS = 500;
const DOCK_WORSHIP_PREFS_APP_KEY = "dock-worship-preferences";

async function saveWorshipSongFromDockPayload(payload: WorshipDockSongSavePayload): Promise<{
  song: Song;
  songs: Song[];
}> {
  const id = payload.id?.trim();
  const title = payload.title?.trim();
  const lyrics = payload.lyrics?.trim();
  if (!id || !title || !lyrics) {
    throw new Error("Song title and lyrics are required.");
  }

  const existing = await getSong(id);
  const now = new Date().toISOString();
  const autoSplit = payload.autoSplit ?? existing?.autoSplit ?? true;
  const linesPerSlide = payload.linesPerSlide ?? existing?.linesPerSlide ?? 2;
  const themeId = payload.themeId ?? existing?.themeId;
  const song: Song = {
    id,
    metadata: {
      title,
      artist: payload.artist?.trim() ?? "",
    },
    lyrics,
    slides: generateSlides(lyrics, linesPerSlide, autoSplit),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    importSourceName: payload.importSourceName ?? existing?.importSourceName,
    importSourceType: payload.importSourceType ?? existing?.importSourceType ?? "manual",
    importSourceUrl: payload.importSourceUrl ?? existing?.importSourceUrl,
    archived: existing?.archived,
    archivedAt: existing?.archivedAt,
    autoSplit,
    linesPerSlide,
    themeId,
  };

  await saveSong(song);
  const songs = await getAllSongs();
  return { song, songs };
}

// ── Transcript page wrappers (use router params/navigate) ────────────────────

function TranscriptLibraryPageWrapper() {
  const navigate = useNavigate();
  return (
    <TranscriptLibraryPage
      onOpenTranscript={(id) => navigate(`/transcripts/${id}`)}
      onNewSession={() => navigate("/speech-to-scripture")}
    />
  );
}

function TranscriptDetailPageWrapper() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/transcripts" replace />;
  return (
    <TranscriptDetailPage
      transcriptId={id}
      onBack={() => navigate("/transcripts")}
    />
  );
}

function PublicPresentationRoute() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function openPresentationViewer() {
      const cleanSessionId = sessionId.trim();
      if (!cleanSessionId) {
        setError("Presentation link is missing a session id.");
        return;
      }

      try {
        const info = await getPresentationRemoteAccessInfo(cleanSessionId);
        const candidates = [info.localLink, info.link].filter(Boolean);
        const currentUrl = new URL(window.location.href);
        const target = candidates.find((candidate) => {
          try {
            const parsed = new URL(candidate);
            return parsed.origin !== currentUrl.origin || parsed.pathname !== currentUrl.pathname;
          } catch {
            return false;
          }
        });

        if (cancelled) return;
        if (target) {
          window.location.replace(target);
          return;
        }

        const params = new URLSearchParams({ sessionId: cleanSessionId });
        if (info.wsPort > 0) params.set("wsPort", String(info.wsPort));
        window.location.replace(`/presentation.html?${params.toString()}`);
      } catch (routeError) {
        if (!cancelled) {
          setError(routeError instanceof Error ? routeError.message : "Could not open the presentation screen.");
        }
      }
    }

    void openPresentationViewer();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#000", color: "#f8fafc" }}>
      <div style={{ display: "grid", gap: 10, justifyItems: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
        <Icon name={error ? "warning" : "present_to_all"} size={28} />
        <span>{error || "Opening presentation screen..."}</span>
      </div>
    </div>
  );
}

function App() {
  const { t } = useTranslation();
  // ── Global theme (dark/light) ──
  useAppTheme();
  const { user, setUser } = useAuth();
  const mceOnboardingDone =
    localStorage.getItem("mce-onboarding-complete") === "true";
  const [globalMediaDragging, setGlobalMediaDragging] = useState(false);
  const [globalMediaUploading, setGlobalMediaUploading] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const dragCounterRef = useRef(0);
  const globalMediaInputRef = useRef<HTMLInputElement | null>(null);

  // Send the user's plan song limit to the dock so it can filter accordingly.
  // Use a ref so the callback always reads the latest user, avoiding stale
  // closures inside useEffect([], []) handlers.
  const userRef = useRef(user);
  userRef.current = user;
  const sendSongLimitToDock = useCallback(() => {
    const effectivePlan = getEffectivePlan(userRef.current);
    const { limit: songLimit } = checkEntitlementSync("songs", effectivePlan);
    dockBridge.sendState({
      type: "state:song-limit",
      payload: songLimit,
      timestamp: Date.now(),
    });
    dockBridge.sendState({
      type: "state:plan-update",
      payload: { plan: effectivePlan },
      timestamp: Date.now(),
    });
    // Persist to localStorage so the dock JSON fallback can read it
    // even when BroadcastChannel is slow or unavailable.
    try {
      localStorage.setItem(getUserScopedKey("ocs-dock-song-limit"), String(songLimit));
      localStorage.setItem(getUserScopedKey("ocs-dock-plan"), effectivePlan);
    } catch { /* ignore */ }
  }, []);

  const sendNotesToDock = useCallback((notes = loadDockNotes()) => {
    dockBridge.sendState({
      type: "state:notes-updated",
      payload: { notes, snapshot: true },
      timestamp: Date.now(),
    });
    void syncDockNotesToDock(notes);
  }, []);

  // Write song limit to localStorage immediately when user changes,
  // so the dock always has the correct limit even before any
  // BroadcastChannel message is received.
  useEffect(() => {
    if (user) {
      const effectivePlan = getEffectivePlan(user);
      const { limit } = checkEntitlementSync("songs", effectivePlan);
      try {
        localStorage.setItem(getUserScopedKey("ocs-dock-song-limit"), String(limit));
        localStorage.setItem(getUserScopedKey("ocs-dock-plan"), effectivePlan);
      } catch { /* ignore */ }
      dockBridge.sendState({
        type: "state:plan-update",
        payload: { plan: effectivePlan },
        timestamp: Date.now(),
      });
      void getAllSongs()
        .then((allSongs) => {
          const { limit } = checkEntitlementSync("songs", effectivePlan);
          const songs = (limit > 0 && limit < 9999) ? allSongs.slice(0, limit) : allSongs;
          dockBridge.sendState({
            type: "state:songs-data",
            payload: songs,
            timestamp: Date.now(),
          });
        })
        .catch((err) => {
          console.warn("[App] Failed to send songs after auth update:", err);
        });
      sendNotesToDock();
      void syncSongsToDock().catch(() => { });
    }
  }, [sendNotesToDock, user]);

  useEffect(() => {
    const s = getSettings();
    applyBrandingSettingsToDom({ brandColor: s.brandColor, churchName: s.churchName });

    // Set document title based on environment
    document.title = getAppTitle();

    // Initialize dock bridge so the OBS Browser Dock can communicate
    dockBridge.init();

    // Wire up dock commands → OBS actions (bible:go-live, speaker:go-live, etc.)
    const unsubDockCmd = initDockCommandHandler();

    let unsubMobileRemote: (() => void) | null = null;
    void initMobileRemoteCommandBridge()
      .then((unsub) => {
        unsubMobileRemote = unsub;
      })
      .catch((error) => {
        console.warn("[MobileRemote] Command bridge unavailable:", error);
      });

    // Wire up LM dock mic capture + AssemblyAI streaming
    const unsubLmDock = lmDockService.init();

    // Dynamic app icon — updates macOS dock icon based on OBS + speech state
    const unsubAppStatus = appStatusManager.init();

    // Relay OBS connection status to the dock
    const unsubObs = obsService.onStatusChange((status) => {
      dockBridge.sendObsStatus(status === "connected");
    });

    // Relay service status to the dock
    const unsubSvc = svcStore.subscribe((state) => {
      dockBridge.sendServiceStatus(state.status, state.serviceName);
    });

    // Handle state requests from the dock
    const unsubCmd = dockBridge.onCommand(async (cmd) => {
      if (cmd.type === "request-state") {
        const productionSettings = await buildDockProductionSettingsPayload().catch(() => undefined);
        const servicePlanner = await getServicePlannerSnapshot().catch(() => undefined);
        const liveTools = await getLiveToolsSnapshot().catch(() => undefined);
        const countdowns = await getCountdownSnapshot().catch(() => undefined);
        dockBridge.sendFullState({
          obsConnected: obsService.status === "connected",
          serviceStatus: svcStore.status,
          productionSettings,
          servicePlanner,
          liveTools,
          countdowns,
        });
      }

      // Proactively send library data when dock pings (handles refresh race condition)
      if (cmd.type === "ping") {
        try {
          const allSongs = await getAllSongs();
          sendSongLimitToDock();
          const { limit: songLimit } = checkEntitlementSync("songs", getEffectivePlan(userRef.current));
          const songs = (songLimit > 0 && songLimit < 9999) ? allSongs.slice(0, songLimit) : allSongs;
          dockBridge.sendState({
            type: "state:songs-data",
            payload: songs,
            timestamp: Date.now(),
          });
        } catch (err) {
          console.warn("[App] Failed to send songs on ping:", err);
        }

        // Also send countdowns on ping so dock has current state after reload
        try {
          const countdownSnapshot = await getCountdownSnapshot();
          dockBridge.sendState({
            type: "state:countdowns",
            payload: countdownSnapshot,
            timestamp: Date.now(),
          });
        } catch (err) {
          console.warn("[App] Failed to send countdowns on ping:", err);
        }

        sendNotesToDock();
      }

      if (cmd.type === "request-service-plans") {
        try {
          const snapshot = await getServicePlannerSnapshot();
          dockBridge.sendState({
            type: "state:service-plans",
            payload: snapshot,
            timestamp: Date.now(),
          });
        } catch (err) {
          console.warn("[App] Failed to send service plans to dock:", err);
        }
      }

      if (cmd.type === "service-plan:save") {
        try {
          const plan = await saveServicePlan(cmd.payload as ServicePlan);
          const snapshot = await getServicePlannerSnapshot();
          dockBridge.sendState({
            type: "state:service-plan-save-result",
            payload: { commandId: cmd.commandId, ok: true, plan },
            timestamp: Date.now(),
          });
          dockBridge.sendState({
            type: "state:service-plans",
            payload: snapshot,
            timestamp: Date.now(),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          dockBridge.sendState({
            type: "state:service-plan-save-result",
            payload: { commandId: cmd.commandId, ok: false, error: message },
            timestamp: Date.now(),
          });
          console.warn("[App] Failed to save service plan from dock:", err);
        }
      }

      // Dock is requesting library data (songs) via BroadcastChannel
      if (cmd.type === "request-library-data") {
        try {
          const allSongs = await getAllSongs();
          const media = getAllMedia();
          sendSongLimitToDock();
          const { limit: songLimit } = checkEntitlementSync("songs", getEffectivePlan(userRef.current));
          const songs = (songLimit > 0 && songLimit < 9999) ? allSongs.slice(0, songLimit) : allSongs;
          dockBridge.sendState({
            type: "state:songs-data",
            payload: songs,
            timestamp: Date.now(),
          });
          dockBridge.sendState({
            type: "state:media-data",
            payload: media,
            timestamp: Date.now(),
          });
          sendNotesToDock();
        } catch (err) {
          console.warn("[App] Failed to send library data to dock:", err);
        }
      }

      if (cmd.type === "media:save") {
        try {
          const item = cmd.payload as MediaItem;
          if (!item?.id || !item?.name || !item?.type || !item?.url || !item?.createdAt) {
            throw new Error("Invalid media payload.");
          }
          saveMedia(item);
          dockBridge.sendState({
            type: "state:media-data",
            payload: getAllMedia(),
            timestamp: Date.now(),
          });
        } catch (err) {
          console.warn("[App] Failed to save dock media:", err);
        }
      }

      if (cmd.type === "media:delete") {
        try {
          const payload = cmd.payload as { id?: string } | null;
          const id = payload?.id?.trim();
          if (!id) {
            throw new Error("Invalid media delete payload.");
          }
          await deleteMedia(id);
          const updated = await getAllMedia();
          dockBridge.sendState({
            type: "state:media-data",
            payload: updated,
            timestamp: Date.now(),
          });
        } catch (err) {
          console.warn("[App] Failed to delete dock media:", err);
        }
      }

      if (cmd.type === "worship:song-save") {
        try {
          const { song, songs } = await saveWorshipSongFromDockPayload(cmd.payload as WorshipDockSongSavePayload);
          dockBridge.sendState({
            type: "state:worship-song-save-result",
            payload: { commandId: cmd.commandId, ok: true, song },
            timestamp: Date.now(),
          });
          sendSongLimitToDock();
          const { limit: songLimit } = checkEntitlementSync("songs", getEffectivePlan(userRef.current));
          const limitedSongs = (songLimit > 0 && songLimit < 9999) ? songs.slice(0, songLimit) : songs;
          dockBridge.sendState({
            type: "state:songs-data",
            payload: limitedSongs,
            timestamp: Date.now(),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          dockBridge.sendState({
            type: "state:worship-song-save-result",
            payload: { commandId: cmd.commandId, ok: false, error: message },
            timestamp: Date.now(),
          });
          console.warn("[App] Failed to save dock Worship song:", err);
        }
      }

      if (cmd.type === "worship:save-preferences") {
        try {
          const payload = cmd.payload;
          if (!payload || typeof payload !== "object") {
            throw new Error("Invalid worship preference payload.");
          }
          // Keep the app bridge on the same user-scoped IndexedDB key as the
          // standalone dock. The old unscoped key is still read as a legacy
          // migration by dockPreferenceStorage.
          await putRecord(
            STORES.APP_SETTINGS,
            payload,
            getUserScopedKey(DOCK_WORSHIP_PREFS_APP_KEY),
          );
        } catch (err) {
          console.warn("[App] Failed to save dock Worship preferences:", err);
        }
      }

      if (cmd.type === "notes:append") {
        try {
          const payload = cmd.payload as DockNotesAppendCommand | null;
          if (!payload?.commandId || !payload.text?.trim()) {
            throw new Error("Invalid notes payload.");
          }
          const result = appendTextToDockNotes(payload.text, payload.title, {
            sourceId: payload.commandId,
          });
          if (result) {
            void syncDockNotesToDock(result.notes);
            dockBridge.sendState({
              type: "state:notes-updated",
              payload: { notes: result.notes, commandId: payload.commandId },
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          console.warn("[App] Failed to append dock note:", err);
        }
      }

      // LM Dock: Start listening
      if (cmd.type === "lm:start") {
        try {
          const payload = cmd.payload as { micId?: string } | null;
          const micId = payload?.micId;
          void lmDockService.startListening(micId || undefined);
        } catch (err) {
          console.warn("[App] Failed to start LM listening:", err);
        }
      }

      // LM Dock: Stop listening
      if (cmd.type === "lm:stop") {
        try {
          lmDockService.stopListening();
        } catch (err) {
          console.warn("[App] Failed to stop LM listening:", err);
        }
      }
    });

    let lastProcessedWorshipSaveCommandId = "";
    const worshipSaveFallbackStartedAt = Date.now();
    let worshipSaveFallbackInFlight = false;
    const pollWorshipSaveFallback = async () => {
      if (worshipSaveFallbackInFlight) return;
      worshipSaveFallbackInFlight = true;
      try {
        const command = await loadWorshipDockSongSaveCommand().catch(() => null);
        if (!command || command.commandId === lastProcessedWorshipSaveCommandId) return;
        if (command.timestamp < worshipSaveFallbackStartedAt - 1_000) {
          lastProcessedWorshipSaveCommandId = command.commandId;
          return;
        }

        lastProcessedWorshipSaveCommandId = command.commandId;
        try {
          const { song, songs } = await saveWorshipSongFromDockPayload(command.payload);
          await saveWorshipDockSongSaveResult({
            commandId: command.commandId,
            timestamp: Date.now(),
            ok: true,
            song,
          });
          dockBridge.sendState({
            type: "state:worship-song-save-result",
            payload: { commandId: command.commandId, ok: true, song },
            timestamp: Date.now(),
          });
          sendSongLimitToDock();
          const { limit: songLimit } = checkEntitlementSync("songs", getEffectivePlan(userRef.current));
          const limitedSongs = (songLimit > 0 && songLimit < 9999) ? songs.slice(0, songLimit) : songs;
          dockBridge.sendState({
            type: "state:songs-data",
            payload: limitedSongs,
            timestamp: Date.now(),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await saveWorshipDockSongSaveResult({
            commandId: command.commandId,
            timestamp: Date.now(),
            ok: false,
            error: message,
          });
          dockBridge.sendState({
            type: "state:worship-song-save-result",
            payload: { commandId: command.commandId, ok: false, error: message },
            timestamp: Date.now(),
          });
          console.warn("[App] Failed to save fallback dock Worship song:", err);
        }
      } finally {
        worshipSaveFallbackInFlight = false;
      }
    };
    void pollWorshipSaveFallback();
    const worshipSaveFallbackTimer = window.setInterval(
      () => void pollWorshipSaveFallback(),
      getRecommendedPollingInterval(WORSHIP_DOCK_SAVE_POLL_INTERVAL_MS),
    );

    return () => {
      window.clearInterval(worshipSaveFallbackTimer);
      unsubObs();
      unsubSvc();
      unsubCmd();
      unsubDockCmd();
      unsubMobileRemote?.();
      unsubLmDock();
      unsubAppStatus();
    };
  }, []);

  useEffect(() => {
    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<MVSettingsType>).detail;
      syncProductionSettingsToDock().catch(() => { });
      dockBridge.sendBrandingUpdated({
        brandLogoPath: detail?.brandLogoPath ?? "",
        brandColor: detail?.brandColor ?? "",
        brandSecondaryColor: detail?.brandSecondaryColor ?? "",
        churchName: detail?.churchName ?? "",
        mainPastorName: detail?.mainPastorName ?? "",
      });
    };
    window.addEventListener(MV_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => window.removeEventListener(MV_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
  }, []);
  // ── Splash state ──
  const [splashVisible, setSplashVisible] = useState(true);
  const [resourcesReady, setResourcesReady] = useState(false);

  // ── Update state ──
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [versionAge, setVersionAge] = useState<{ daysOld: number; forceUpdate: boolean; persistent: boolean }>({ daysOld: 0, forceUpdate: false, persistent: false });

  // ── Version floor check (fetched from server — admin-controlled) ──
  const [versionFloorBlocked, setVersionFloorBlocked] = useState<{
    blocked: boolean;
    currentVersion: string;
    minimumVersion: string;
    gracePeriodHours: number;
  } | null>(null);

  // ── Version floor grace period countdown ──
  const [versionFloorGraceStartedAt, setVersionFloorGraceStartedAt] = useState<string | null>(null);
  const [versionFloorGraceDismissed, setVersionFloorGraceDismissed] = useState(false);

  // ── In-app update state for version floor screen ──
  const [floorUpdateStatus, setFloorUpdateStatus] = useState<
    "idle" | "checking" | "downloading" | "installing" | "relaunching" | "error"
  >("idle");
  const [floorUpdateProgress, setFloorUpdateProgress] = useState<DownloadProgress>({ contentLength: 0, downloaded: 0 });
  const [floorUpdateError, setFloorUpdateError] = useState<string | null>(null);

  // ── Server-driven forced update (admin-controlled) ──
  const [forcedUpdateState, setForcedUpdateState] = useState<ForcedUpdateState>({
    blocked: false,
    active: false,
    lockType: null,
    requiredVersion: "",
    hoursRemaining: null,
    gracePeriodHours: null,
    startedAt: null,
    lockAt: null,
    updateMessage: "",
    currentVersion: "",
    downloadUrl: "",
    releaseNotesUrl: "",
    loading: true,
  });

  const startupDone = useRef(false);
  const updatePollBusyRef = useRef(false);

  // ── Version floor grace period countdown → hard lock transition ──
  useEffect(() => {
    if (!versionFloorGraceStartedAt || !versionFloorBlocked || versionFloorBlocked.blocked) return;

    const graceHours = versionFloorBlocked.gracePeriodHours;
    if (!graceHours || graceHours <= 0) return;

    const check = () => {
      const endMs = new Date(versionFloorGraceStartedAt).getTime() + graceHours * 60 * 60 * 1000;
      if (Date.now() >= endMs) {
        setVersionFloorBlocked((prev) => prev ? { ...prev, blocked: true } : prev);
        setVersionFloorGraceStartedAt(null);
      }
    };

    // Check immediately, then every 30 seconds
    check();
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, [versionFloorGraceStartedAt, versionFloorBlocked?.blocked, versionFloorBlocked?.gracePeriodHours]);

  // ── Startup: load resources + check for updates in parallel ──
  useEffect(() => {
    if (startupDone.current) return;
    startupDone.current = true;

    // Track app started (also tracks app_installed on first launch)
    trackAppStarted();
    trackAppStartedBackend();

    // Initialize the license guard (central subscription enforcement)
    initLicenseGuard().catch(() => {
      // Non-critical — will retry on next verification cycle
    });

    const minSplashTime = new Promise((r) => setTimeout(r, 2000));

    const updateCheck = checkForUpdate()
      .then((result) => {
        // Always process the result — even when no update is available,
        // we need the date for version age computation (forced update after 21 days)
        if (result.available || result.date) {
          setUpdateResult(result);
          setVersionAge(getVersionAge(result, typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined));
        }
      })
      .catch(() => {
        // If update check fails (no internet, etc.), let the app proceed
      });

    // Fetch server-driven forced update settings
    const forcedUpdateCheck = fetchAppSettings()
      .then((settings) => {
        setForcedUpdateState(getForcedUpdateState(settings));
      })
      .catch(() => {
        // If fetch fails, proceed without server-driven forced update
      });

    // Fetch version floor from server (admin-configured minimum)
    const FLOOR_GRACE_KEY = "ocs-version-floor-grace-v1";
    fetchVersionFloor()
      .then((result) => {
        if (!result) return;

        if (result.gracePeriodHours > 0) {
          // Grace period configured — track it in localStorage
          let startedAt: string;
          try {
            const existing = localStorage.getItem(FLOOR_GRACE_KEY);
            if (existing) {
              const rec = JSON.parse(existing) as { startedAt: string; minimumVersion: string };
              // If the minimum version changed, reset the grace period
              if (rec.minimumVersion === result.minimumVersion) {
                startedAt = rec.startedAt;
              } else {
                startedAt = new Date().toISOString();
              }
            } else {
              startedAt = new Date().toISOString();
            }
          } catch {
            startedAt = new Date().toISOString();
          }

          // Persist the grace record
          try {
            localStorage.setItem(
              FLOOR_GRACE_KEY,
              JSON.stringify({ startedAt, minimumVersion: result.minimumVersion })
            );
          } catch { /* non-critical */ }

          // Check if grace period has already expired
          const endMs = new Date(startedAt).getTime() + result.gracePeriodHours * 60 * 60 * 1000;
          if (Date.now() >= endMs) {
            // Grace period expired — show hard lock
            setVersionFloorBlocked(result);
          } else {
            // Still in grace — show warning banner
            setVersionFloorBlocked({ ...result, blocked: false });
            setVersionFloorGraceStartedAt(startedAt);
          }
        } else {
          // No grace period — immediate hard lock (original behavior)
          setVersionFloorBlocked(result);
        }
      })
      .catch(() => {
        // If fetch fails, don't block — proceed normally
      });

    // Initialize the overlay URL (queries Tauri for the local server port)
    const overlayInit = initOverlayUrl().catch(() => {
      // Fallback to window.location.origin if Tauri command fails
    });

    // Initialize device performance detection (non-blocking)
    import("./services/performanceManager").then((m) =>
      m.init().catch((err) => {
        console.warn("[App] Performance manager init failed (non-critical):", err);
      }),
    );

    // Run one-time migration from legacy databases (non-blocking)
    migrateFromLegacyDatabases().catch((err) => {
      console.warn("[App] Legacy DB migration failed (non-critical):", err);
    });

    // Run one-time upload of local content to MongoDB (non-blocking)
    import("./services/migrationService").then((m) =>
      m.runContentMigrationIfNeeded().catch((err) => {
        console.warn("[App] MongoDB content migration failed (non-critical):", err);
      }),
    );

    // Seed starter multiview templates into IndexedDB (non-blocking, skips existing)
    seedTemplates(STARTER_TEMPLATES).then(() => {
      // Sync layouts to dock after seeding completes
      syncLayoutsToDock().catch(() => { });
    }).catch((err) => {
      console.warn("[App] Template seeding failed (non-critical):", err);
    });

    // Sync dock-first production data to dock JSON files on startup.
    syncSongsToDock().catch(() => { });
    syncDockNotesToDock().catch(() => { });
    syncCustomThemesToDock().catch(() => { });
    syncInstalledTranslationsToDock().catch(() => { });
    syncProductionSettingsToDock().catch(() => { });
    syncLiveToolsToDock().catch(() => { });
    importDockServicePlansFromUploads()
      .then(() => syncServicePlansToDock())
      .catch(() => { });

    // Rehydrate theme favorites from durable storage, then sync them to dock JSON.
    import("./services/favoriteThemes").then(({
      hydrateFavoriteThemes,
      syncLTFavoritesToDock,
      syncBibleFavoritesToDock,
      syncFavoriteBibleThemesToDock,
    }) => {
      hydrateFavoriteThemes()
        .then(() => Promise.all([
          syncLTFavoritesToDock(),
          syncBibleFavoritesToDock(),
          syncFavoriteBibleThemesToDock(),
        ]))
        .catch(() => { });
    }).catch(() => { });

    // Preload the splash image itself + any critical resources
    const preload = new Promise<void>((resolve) => {
      const img = new Image();
      img.src = getSplashImageSrc();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // proceed even if image fails
    });

    // Wait for: minimum splash time + preload + update check + overlay init + forced update check
    Promise.all([minSplashTime, preload, updateCheck, overlayInit, forcedUpdateCheck]).then(() => {
      setResourcesReady(true);
    });
  }, []);

  // ── Re-verify license when user logs in (BUG 2) ──
  const prevUserRef = useRef(user);
  useEffect(() => {
    const prev = prevUserRef.current;
    prevUserRef.current = user;
    // User just logged in (was null, now has a value)
    if (!prev && user) {
      reverifyOnAuth().catch(() => { });
    }
  }, [user]);

  // ── Splash done callback ──
  const handleSplashDone = useCallback(() => {
    setSplashVisible(false);
  }, []);

  // ── Track app closed ──
  useEffect(() => {
    const startTime = Date.now();
    const handleBeforeUnload = () => {
      trackAppClosed(Date.now() - startTime);
      trackAppClosedBackend(Math.round((Date.now() - startTime) / 1000));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ── Track OBS connection status ──
  useEffect(() => {
    let prevConnected = false;
    const unsub = obsService.onStatusChange((status) => {
      const connected = status === "connected";
      if (connected && !prevConnected) {
        trackObsConnected();
        trackObsConnectedBackend();
      } else if (!connected && prevConnected) {
        trackObsDisconnected();
      }
      prevConnected = connected;
    });
    return unsub;
  }, []);

  // ── Continuous update polling while app is running ──
  useEffect(() => {
    if (splashVisible) return;
    if (updateResult?.available && updateResult.update) return;
    // Stop polling when force update is already shown (e.g. from cached offline data)
    if (versionAge.forceUpdate && updateResult) return;

    let cancelled = false;

    const pollForUpdates = async () => {
      if (updatePollBusyRef.current) return;
      updatePollBusyRef.current = true;
      try {
        const result = await checkForUpdate();
        if (cancelled) return;
        const curVer = result.currentVersion ?? (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined);
        if (result.available && result.update) {
          setUpdateResult((prev) => {
            if (prev?.available && prev.version === result.version) {
              return prev;
            }
            return result;
          });
          setVersionAge(getVersionAge(result, curVer));
        } else if (result.date) {
          // Offline fallback: cached date returned, check if version is stale
          setUpdateResult((prev) => {
            if (prev?.date === result.date && !prev?.available) {
              return prev;
            }
            return result;
          });
          setVersionAge(getVersionAge(result, curVer));
        }
      } catch {
        // Keep polling.
      } finally {
        updatePollBusyRef.current = false;
      }
    };

    void pollForUpdates();
    const intervalId = window.setInterval(() => {
      void pollForUpdates();
    }, UPDATE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [splashVisible, updateResult?.available, updateResult?.update, updateResult?.version, versionAge.forceUpdate, updateResult]);

  // ── Update: dismiss (hide notification, app continues) ──
  const handleDismissUpdate = useCallback(() => {
    setUpdateResult(null);
  }, []);

  // ── Update: remind later (hide temporarily, app continues) ──
  const handleRemindLaterUpdate = useCallback(() => {
    setUpdateResult(null);
  }, []);

  // ── Server-driven forced update / emergency lock check ──
  const refetchForcedUpdate = useCallback(() => {
    fetchAppSettings()
      .then((settings) => {
        setForcedUpdateState(getForcedUpdateState(settings));
      })
      .catch(() => { /* non-critical */ });
  }, []);

  // Poll every 60 seconds (emergency lock needs to take effect quickly)
  useEffect(() => {
    if (splashVisible) return;

    const intervalId = window.setInterval(refetchForcedUpdate, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [splashVisible, refetchForcedUpdate]);

  // Re-check on window focus / visibility change (near-instant lock activation)
  useEffect(() => {
    if (splashVisible) return;

    const handleFocus = () => refetchForcedUpdate();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [splashVisible, refetchForcedUpdate]);

  // ── Trial welcome modal ──
  useEffect(() => {
    if (user && user.trial && !user.trial.welcomeShown) {
      // Also check localStorage to ensure we don't show again
      if (!hasTrialWelcomeBeenShown()) {
        const trialEnds = user.trial?.endsAt;
        if (trialEnds && new Date(trialEnds) > new Date()) {
          setShowTrialModal(true);
          trackAppStarted(); // reuse existing analytics
        }
      }
    }
  }, [user]);

  const handleTrialModalDismiss = useCallback(async () => {
    markTrialWelcomeAsShown();
    setShowTrialModal(false);
    if (user) {
      try {
        const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.creatorstudioslabs.stream";
        const deviceId = getDeviceId();
        await fetch(`${API_BASE}/api/auth/trial-welcome`, {
          method: "POST",
          headers: {
            ...(deviceId ? { "X-Device-Id": deviceId } : {}),
          },
        });
      } catch (e) {
        console.error("[App] Failed to mark trial welcome shown:", e);
      }
      setUser({ ...user, trial: { ...user.trial, welcomeShown: true } });
    }
  }, [user, setUser]);

  const handleGlobalMediaUpload = useCallback(async (files: FileList | File[]) => {
    const queue = Array.from(files).filter(isSupportedLibraryImportFile);
    if (queue.length === 0) return;
    setGlobalMediaUploading(true);
    try {
      for (const file of queue) {
        await saveLibraryMediaFile(file);
      }
      dockBridge.sendState({
        type: "state:media-data",
        payload: getAllMedia(),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn("[App] Global media upload failed:", error);
    } finally {
      setGlobalMediaUploading(false);
      if (globalMediaInputRef.current) {
        globalMediaInputRef.current.value = "";
      }
    }
  }, []);

  useEffect(() => {
    if (splashVisible) {
      setGlobalMediaDragging(false);
      dragCounterRef.current = 0;
      return;
    }

    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current += 1;
      setGlobalMediaDragging(true);
    };
    const handleDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setGlobalMediaDragging(true);
    };
    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setGlobalMediaDragging(false);
      }
    };
    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setGlobalMediaDragging(false);
      if (event.dataTransfer?.files?.length) {
        void handleGlobalMediaUpload(event.dataTransfer.files);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleGlobalMediaUpload, splashVisible, updateResult]);

  // ── In-app update handler for version floor screen ──
  const handleFloorUpdate = useCallback(async () => {
    setFloorUpdateStatus("checking");
    setFloorUpdateError(null);
    try {
      // Try Tauri auto-updater first (works when signed binary exists)
      const result = await checkForUpdate();
      if (result.available && result.update) {
        setFloorUpdateStatus("downloading");
        await downloadAndInstallUpdate(
          result.update,
          (progress) => setFloorUpdateProgress(progress),
          (status) => setFloorUpdateStatus(status === "relaunching" ? "relaunching" : status as "downloading" | "installing"),
        );
        return;
      }

      // No signed binary from Tauri updater — download platform installer
      // directly from GitHub Releases and launch it in-app
      await downloadAndInstallFromGitHub(
        (progress) => setFloorUpdateProgress(progress),
        (status) => setFloorUpdateStatus(status),
      );
    } catch (err: any) {
      console.error("[App] Floor update failed:", err);
      setFloorUpdateError(err?.message || "Update failed. Please try again.");
      setFloorUpdateStatus("error");
    }
  }, []);

  return (
    <div className="app">
      <input
        ref={globalMediaInputRef}
        type="file"
        accept={MEDIA_FILE_ACCEPT}
        multiple
        style={{ display: "none" }}
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) {
            void handleGlobalMediaUpload(files);
          }
        }}
      />
      {/* 1. Splash screen — shown until resources ready */}
      {splashVisible && (
        <SplashScreen ready={resourcesReady} onDone={handleSplashDone} />
      )}

      {/* 2a. Version floor block — server-configured minimum, no self-update possible */}
      {!splashVisible && versionFloorBlocked?.blocked && (
        <div className="force-update-overlay">
          <div className="force-update-modal">
            <div className="force-update-banner force-update-banner--locked">
              <Icon name="lock" size={16} />
              <span>{t("update.versionNotSupported")}</span>
            </div>
            <div className="force-update-header">
              <Icon name="system_update" size={24} />
              <div>
                <h2 className="force-update-title">{t("update.updateRequired")}</h2>
                <p className="force-update-subtitle">
                  v{versionFloorBlocked.currentVersion} · {t("update.versionNoLongerSupported")}
                </p>
              </div>
            </div>
            <div className="force-update-body">
              <p className="force-update-message">
                {t("update.versionBlockedMessage")}
              </p>

              {floorUpdateStatus === "idle" && (
                <button
                  onClick={handleFloorUpdate}
                  className="force-update-button"
                  title={t("update.updateNow")}>
                  <Icon name="system_update" size={18} />
                  {t("update.updateNow")}
                </button>
              )}

              {floorUpdateStatus === "checking" && (
                <div className="force-update-progress-row">
                  <Icon name="sync" size={16} className="force-update-icon--spin" />
                  <span>{t("update.checkingForUpdates")}…</span>
                </div>
              )}

              {floorUpdateStatus === "downloading" && (
                <div className="force-update-progress-row">
                  <div className="force-update-progress-bar">
                    <div
                      className="force-update-progress-fill"
                      style={{
                        width: floorUpdateProgress.contentLength
                          ? `${(floorUpdateProgress.downloaded / floorUpdateProgress.contentLength) * 100}%`
                          : "60%",
                      }}
                    />
                  </div>
                  <span className="force-update-progress-text">
                    {floorUpdateProgress.contentLength
                      ? `${Math.round((floorUpdateProgress.downloaded / floorUpdateProgress.contentLength) * 100)}%`
                      : `${t("update.downloading")}…`}
                  </span>
                </div>
              )}

              {floorUpdateStatus === "installing" && (
                <div className="force-update-progress-row">
                  <Icon name="sync" size={16} className="force-update-icon--spin" />
                  <span>{t("update.installingUpdate")}…</span>
                </div>
              )}

              {floorUpdateStatus === "relaunching" && (
                <div className="force-update-progress-row">
                  <Icon name="sync" size={16} className="force-update-icon--spin" />
                  <span>{t("update.relaunching")}…</span>
                </div>
              )}

              {floorUpdateStatus === "error" && (
                <div className="force-update-error-row">
                  <p className="force-update-error-text">{floorUpdateError}</p>
                  <button
                    onClick={handleFloorUpdate}
                    className="force-update-button"
                    title={t("updateNotification.tryAgain")}>
                    {t("updateNotification.tryAgain")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version floor grace period countdown — shown while grace window is active */}
      {!splashVisible &&
        versionFloorBlocked &&
        !versionFloorBlocked.blocked &&
        versionFloorGraceStartedAt &&
        !versionFloorGraceDismissed && (
          <VersionFloorWarningBanner
            currentVersion={versionFloorBlocked.currentVersion}
            minimumVersion={versionFloorBlocked.minimumVersion}
            startedAt={versionFloorGraceStartedAt}
            gracePeriodHours={versionFloorBlocked.gracePeriodHours}
            onUpdate={handleFloorUpdate}
            onDismiss={() => setVersionFloorGraceDismissed(true)}
            updateStatus={floorUpdateStatus}
          />
        )}

      {/* 2a-b. Server-driven forced update overlay (admin-controlled) — countdown or locked */}
      {!splashVisible && !versionFloorBlocked?.blocked && forcedUpdateState.active &&
        (forcedUpdateState.blocked || shouldReshowOverlay(forcedUpdateState.hoursRemaining)) && (
          <ForcedUpdateOverlay
            state={forcedUpdateState}
            onDismiss={
              forcedUpdateState.blocked
                ? undefined
                : () => {
                  recordOverlayDismiss(forcedUpdateState.hoursRemaining ?? 0);
                  setForcedUpdateState((s) => ({ ...s, active: false }));
                }
            }
          />
        )}

      {/* 2b. Force update modal — blocks app when version is too old (age-based) */}
      {!splashVisible && !versionFloorBlocked && updateResult?.available && versionAge.forceUpdate && (
        <ForceUpdateModal
          result={updateResult}
          daysOld={versionAge.daysOld}
          locked={true}
        />
      )}

      {/* 3. Non-blocking update notification — floats in bottom-right (only when not forced) */}
      {!splashVisible && !versionFloorBlocked && updateResult?.available && !versionAge.forceUpdate && (
        <UpdateNotification
          result={updateResult}
          onDismiss={handleDismissUpdate}
          onRemindLater={handleRemindLaterUpdate}
        />
      )}

      {/* 4. Main app — always rendered after splash, but blocked by force update modal */}
      {!splashVisible && (
        <Routes>
          <Route path="p/:sessionId" element={<PublicPresentationRoute />} />
          <Route
            path="*"
            element={
              <AuthGate>
                <Routes>
                  <Route
                    path="presentation/*"
                    element={
                      <VerificationGate>
                        <LicenseGuard>
                          <LowerThirdProvider>
                            <Routes>
                              <Route index element={<PresentationSetupPage />} />
                              <Route path="link" element={<PresentationSetupPage initialView="link" />} />
                              <Route path="console" element={<Navigate to="/presentation/link" replace />} />
                              <Route path="remote-obs" element={<PresentationSetupPage initialView="remote-obs" />} />
                              <Route path="setup" element={<Navigate to="/presentation/remote-obs" replace />} />
                              <Route path="*" element={<Navigate to="/presentation" replace />} />
                            </Routes>
                          </LowerThirdProvider>
                        </LicenseGuard>
                      </VerificationGate>
                    }
                  />
                  <Route
                    path="*"
                    element={
                      <OBSConnectGate>
                        <VerificationGate>
                          <LicenseGuard>
                            <LowerThirdProvider>
                              <Routes>
                          {/* Onboarding — standalone layout, no sidebar */}
                          {!mceOnboardingDone && (
                            <Route path="onboarding" element={<OnboardingPage />} />
                          )}
                          <Route element={<AppShell />}>
                            <Route
                              index
                              element={
                                mceOnboardingDone ? <ProductionHomePage /> : <Navigate to="/onboarding" replace />
                              }
                            />
                            <Route path="live-tools" element={<Navigate to="/" replace />} />
                            <Route path="live" element={<Navigate to="/" replace />} />
                            <Route path="service" element={<Navigate to="/" replace />} />
                            <Route path="resources" element={<BibleProvider><ResourcesPage /></BibleProvider>} />
                            <Route path="service-planner" element={<ServicePlannerPage />} />

                            <Route path="songs" element={<Navigate to="/resources?tab=worship" replace />} />
                            <Route path="bible-library" element={<Navigate to="/resources?tab=bible" replace />} />
                            <Route path="bible/translations" element={<Navigate to="/resources?tab=bible" replace />} />
                            <Route path="production/themes" element={<ProductionThemeSettingsPage />} />
                            <Route path="settings" element={<BibleProvider><MVSettings /></BibleProvider>} />
                            <Route path="speech-to-scripture" element={<CreditsGuard><SpeechToScripturePage /></CreditsGuard>} />
                            <Route path="gallery" element={<FeatureGuard feature="multiview"><MultiViewGalleryPage /></FeatureGuard>} />
                            <Route path="countdowns" element={<CountdownsPage />} />
                            <Route path="credits" element={<CreditsPage />} />
                            <Route path="transcripts" element={<CreditsGuard><TranscriptLibraryPageWrapper /></CreditsGuard>} />
                            <Route path="transcripts/:id" element={<CreditsGuard><TranscriptDetailPageWrapper /></CreditsGuard>} />
                            <Route path="library" element={<Navigate to="/resources" replace />} />
                            <Route path="templates" element={<Navigate to="/production/themes" replace />} />
                            <Route path="templates/*" element={<Navigate to="/production/themes" replace />} />
                            <Route path="hub" element={<Navigate to="/" replace />} />
                            <Route path="hub/*" element={<Navigate to="/" replace />} />
                            <Route path="service-hub" element={<Navigate to="/" replace />} />
                            <Route path="service-control-hub" element={<Navigate to="/" replace />} />
                            <Route path="quick-merge" element={<Navigate to="/" replace />} />
                            <Route path="broadcast" element={<Navigate to="/" replace />} />
                            <Route path="bible" element={<Navigate to="/settings" replace />} />
                            <Route path="bible/*" element={<Navigate to="/settings" replace />} />
                            <Route path="worship" element={<Navigate to="/resources" replace />} />
                            <Route path="lower-thirds" element={<Navigate to="/production/themes" replace />} />
                            <Route path="scenes" element={<Navigate to="/settings" replace />} />
                            <Route path="multiview" element={<MVShell />} />
                            <Route path="multiview/*" element={<MVShell />} />
                            <Route path="new" element={<Navigate to="/" replace />} />

                            {/* Developer Tools */}
                            <Route path="dev/db" element={<DevDashboard />} />
                          </Route>

                          <Route path="*" element={<Navigate to="/" replace />} />
                              </Routes>
                            </LowerThirdProvider>
                          </LicenseGuard>
                        </VerificationGate>
                      </OBSConnectGate>
                    }
                  />
                </Routes>
              </AuthGate>
            }
          />
        </Routes>
      )}

      {/* 5. Trial welcome modal — overlays app after auth */}
      {showTrialModal && user?.trial?.endsAt && (
        <TrialModal
          trialDays={user.trial?.durationDays || 14}
          trialEndsAt={user.trial.endsAt}
          isExistingUser={(user.trial?.durationDays || 0) >= 10}
          onDismiss={handleTrialModalDismiss}
        />
      )}

      {!splashVisible && <TrialExpiredUpgradeModal />}

      {globalMediaDragging && !splashVisible && (
        <div className="app-global-media-drop-overlay" aria-hidden="true">
          <div className="app-global-media-drop-overlay__card">
            <Icon name="cloud_upload" size={24} />
            <div className="app-global-media-drop-overlay__title">{t("library.mediaTab.dropOverlay.appTitle")}</div>
            <div className="app-global-media-drop-overlay__text">
              {t("library.mediaTab.dropOverlay.appText")}
            </div>
          </div>
        </div>
      )}

      {globalMediaUploading && !splashVisible && (
        <div className="app-global-media-uploading">{t("library.mediaTab.addModal.saving")}...</div>
      )}

      <AnnouncementModalHost />
    </div>
  );
}

export default App;
