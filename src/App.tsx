/**
 * App.tsx — MakeChurchEasy Studio
 *
 * Root component with React Router.
 *
 * Startup sequence:
 *   1. Splash screen shown (introductory_loading_image.png)
 *   2. Resources pre-loaded + GitHub update check runs in parallel
 *   3. If update available → non-blocking floating notification (bottom-right)
 *   4. App continues polling for updates while running
 *   5. Main app is always accessible — updates never block workflow
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { OBSConnectGate } from "./components/OBSConnectGate";
import AuthGate from "./components/AuthGate";
import { useAuth } from "./contexts/AuthContext";
import { AppShell } from "./AppShell";
import { MVSettings } from "./multiview/pages/MVSettings";
import { MVShell } from "./multiview/MVShell";
import { BibleProvider } from "./bible/bibleStore";
import { LowerThirdProvider } from "./lowerthirds/lowerThirdStore";
import SplashScreen from "./components/SplashScreen";
import UpdateNotification from "./components/UpdateNotification";
import ForceUpdateModal from "./components/ForceUpdateModal";
import ForcedUpdateOverlay from "./components/ForcedUpdateOverlay";
import TrialModal, { hasTrialWelcomeBeenShown, markTrialWelcomeAsShown } from "./components/TrialModal";
import { getDeviceId } from "./services/authService";
import Icon from "./components/Icon";
import { checkForUpdate, getVersionAge, fetchVersionFloor, type UpdateCheckResult } from "./services/updateService";
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
import DevDashboard from "./pages/DevDashboard";

import { dockBridge } from "./services/dockBridge";
import { initDockCommandHandler } from "./services/dockCommandHandler";
import { getUserScopedKey } from "./services/userScopedStorage";
import { lmDockService } from "./services/lmDockService";
import { obsService } from "./services/obsService";
import { serviceStore as svcStore } from "./services/serviceStore";
import { getAllSongs, getSong, saveSong, syncSongsToDock } from "./worship/worshipDb";
import { generateSlides } from "./worship/slideEngine";
import { checkEntitlementSync } from "./services/entitlementClient";
import { getEffectivePlan } from "./services/licenseService";
import type { Song } from "./worship/types";
import type { MediaItem } from "./library/libraryTypes";
import { deleteMedia, getAllMedia, saveMedia } from "./library/libraryDb";
import { syncInstalledTranslationsToDock } from "./bible/bibleDb";
import ResourcesPage from "./pages/ResourcesPage";
import ProductionHomePage from "./pages/ProductionHomePage";
import MultiViewGalleryPage from "./pages/MultiViewGalleryPage";
import ProductionThemeSettingsPage from "./pages/ProductionThemeSettingsPage";
import OnboardingPage from "./pages/OnboardingPage";
import ServicePlannerPage from "./pages/ServicePlannerPage";
import SpeechToScripturePage from "./pages/SpeechToScripturePage";
import TranscriptLibraryPage from "./pages/TranscriptLibraryPage";
import TranscriptDetailPage from "./pages/TranscriptDetailPage";
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
import { getLiveToolsSnapshot, syncLiveToolsToDock } from "./live-tools/liveToolStore";
import { STORES, putRecord } from "./services/db";
import { MEDIA_FILE_ACCEPT, saveLibraryMediaFile } from "./library/MediaTab";
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
  const song: Song = {
    id,
    metadata: {
      title,
      artist: payload.artist?.trim() ?? "",
    },
    lyrics,
    slides: generateSlides(lyrics, 2, true),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    importSourceName: payload.importSourceName ?? existing?.importSourceName,
    importSourceType: payload.importSourceType ?? existing?.importSourceType ?? "manual",
    importSourceUrl: payload.importSourceUrl ?? existing?.importSourceUrl,
    archived: existing?.archived,
    archivedAt: existing?.archivedAt,
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

function App() {
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
    }
  }, [user]);

  useEffect(() => {
    const s = getSettings();
    applyBrandingSettingsToDom({ brandColor: s.brandColor, churchName: s.churchName });

    // Initialize dock bridge so the OBS Browser Dock can communicate
    dockBridge.init();

    // Wire up dock commands → OBS actions (bible:go-live, speaker:go-live, etc.)
    const unsubDockCmd = initDockCommandHandler();

    // Wire up LM dock mic capture + AssemblyAI streaming
    const unsubLmDock = lmDockService.init();

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
        dockBridge.sendFullState({
          obsConnected: obsService.status === "connected",
          serviceStatus: svcStore.status,
          productionSettings,
          servicePlanner,
          liveTools,
        });
      }

      // Proactively send library data when dock pings (handles refresh race condition)
      if (cmd.type === "ping") {
        try {
          const allSongs = await getAllSongs();
          sendSongLimitToDock();
          const { limit: songLimit } = checkEntitlementSync("songs", userRef.current?.plan);
          const songs = (songLimit > 0 && songLimit < 9999) ? allSongs.slice(0, songLimit) : allSongs;
          dockBridge.sendState({
            type: "state:songs-data",
            payload: songs,
            timestamp: Date.now(),
          });
        } catch (err) {
          console.warn("[App] Failed to send songs on ping:", err);
        }
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
          const { limit: songLimit } = checkEntitlementSync("songs", userRef.current?.plan);
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
          const { limit: songLimit } = checkEntitlementSync("songs", userRef.current?.plan);
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
          await putRecord(STORES.APP_SETTINGS, payload, DOCK_WORSHIP_PREFS_APP_KEY);
        } catch (err) {
          console.warn("[App] Failed to save dock Worship preferences:", err);
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
          const { limit: songLimit } = checkEntitlementSync("songs", userRef.current?.plan);
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
      WORSHIP_DOCK_SAVE_POLL_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(worshipSaveFallbackTimer);
      unsubObs();
      unsubSvc();
      unsubCmd();
      unsubDockCmd();
      unsubLmDock();
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
  } | null>(null);

  // ── Server-driven forced update (admin-controlled) ──
  const [forcedUpdateState, setForcedUpdateState] = useState<ForcedUpdateState>({
    blocked: false,
    active: false,
    lockType: null,
    requiredVersion: "",
    hoursRemaining: null,
    gracePeriodHours: null,
    startedAt: null,
    updateMessage: "",
    loading: true,
  });

  const startupDone = useRef(false);
  const updatePollBusyRef = useRef(false);

  // ── Startup: load resources + check for updates in parallel ──
  useEffect(() => {
    if (startupDone.current) return;
    startupDone.current = true;

    // Track app started (also tracks app_installed on first launch)
    trackAppStarted();
    trackAppStartedBackend();

    const minSplashTime = new Promise((r) => setTimeout(r, 2000));

    const updateCheck = checkForUpdate()
      .then((result) => {
        if (result.available && result.update) {
          setUpdateResult(result);
          setVersionAge(getVersionAge(result, result.currentVersion ?? (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined)));
        } else if (result.date) {
          // Offline fallback: check returned a cached date but no update available
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
    fetchVersionFloor()
      .then((result) => {
        if (result) setVersionFloorBlocked(result);
      })
      .catch(() => {
        // If fetch fails, don't block — proceed normally
      });

    // Initialize the overlay URL (queries Tauri for the local server port)
    const overlayInit = initOverlayUrl().catch(() => {
      // Fallback to window.location.origin if Tauri command fails
    });

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
      img.src = "/introductory_loading_image.png";
      img.onload = () => resolve();
      img.onerror = () => resolve(); // proceed even if image fails
    });

    // Wait for: minimum splash time + preload + update check + overlay init + forced update check
    Promise.all([minSplashTime, preload, updateCheck, overlayInit, forcedUpdateCheck]).then(() => {
      setResourcesReady(true);
    });
  }, []);

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
        const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";
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
    const queue = Array.from(files).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
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
      {!splashVisible && versionFloorBlocked && (
        <div className="force-update-overlay">
          <div className="force-update-modal">
            <div className="force-update-banner force-update-banner--locked">
              <Icon name="lock" size={16} />
              <span>Version Not Supported</span>
            </div>
            <div className="force-update-header">
              <Icon name="system_update" size={24} />
              <div>
                <h2 className="force-update-title">Update Required</h2>
                <p className="force-update-subtitle">
                  v{versionFloorBlocked.currentVersion} is no longer supported
                </p>
              </div>
            </div>
            <div className="force-update-body">
              <p className="force-update-message">
                This version of MakeChurchEasy Studio is no longer supported. Please download and install the latest version from{" "}
                <a
                  href="https://makechurcheasy.creatorstudioslabs.stream"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#8b5cf6", textDecoration: "underline" }}
                >
                  makechurcheasy.creatorstudioslabs.stream
                </a>{" "}
                to continue.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2a-b. Server-driven forced update overlay (admin-controlled) — countdown or locked */}
      {!splashVisible && !versionFloorBlocked && forcedUpdateState.active &&
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
      {!splashVisible && !versionFloorBlocked && updateResult && versionAge.forceUpdate && (
        <ForceUpdateModal
          result={updateResult}
          daysOld={versionAge.daysOld}
          locked={true}
        />
      )}

      {/* 3. Non-blocking update notification — floats in bottom-right (only when not forced) */}
      {!splashVisible && !versionFloorBlocked && updateResult && !versionAge.forceUpdate && (
        <UpdateNotification
          result={updateResult}
          onDismiss={handleDismissUpdate}
          onRemindLater={handleRemindLaterUpdate}
        />
      )}

      {/* 4. Main app — always rendered after splash, but blocked by force update modal */}
      {!splashVisible && (
        <AuthGate>
          <OBSConnectGate>
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
                  <Route path="speech-to-scripture" element={<SpeechToScripturePage />} />
                  <Route path="gallery" element={<MultiViewGalleryPage />} />
                  <Route path="transcripts" element={<TranscriptLibraryPageWrapper />} />
                  <Route path="transcripts/:id" element={<TranscriptDetailPageWrapper />} />
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
          </OBSConnectGate>
        </AuthGate>
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

      {globalMediaDragging && !splashVisible && (
        <div className="app-global-media-drop-overlay" aria-hidden="true">
          <div className="app-global-media-drop-overlay__card">
            <Icon name="cloud_upload" size={24} />
            <div className="app-global-media-drop-overlay__title">Drag to add</div>
            <div className="app-global-media-drop-overlay__text">
              Drop image or video files anywhere in the app to save them into the media library.
            </div>
          </div>
        </div>
      )}

      {globalMediaUploading && !splashVisible && (
        <div className="app-global-media-uploading">Saving media...</div>
      )}
    </div>
  );
}

export default App;
