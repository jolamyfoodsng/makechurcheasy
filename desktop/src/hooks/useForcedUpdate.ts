import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchAppSettings,
  getDownloadUrlForCurrentPlatform,
  getLiveCountdown,
  getTrustedNowMs,
  refreshAppSettings,
  getForcedUpdateState,
  recordOverlayDismiss,
  shouldReshowOverlay,
  type ForcedUpdateState,
} from "../services/forcedUpdateService";
import { fetchVersionFloor } from "../services/updateService";

export interface UseForcedUpdateReturn {
  state: ForcedUpdateState;
  isVisible: boolean;
  dismiss?: () => void;
  refetch: () => void;
}

const FLOOR_START_KEY = "ocs-version-floor-first-seen-v1";

/** First time this computer saw the current version floor (stable across polls). */
function getFloorStartedAt(minimumVersion: string): string {
  try {
    const raw = localStorage.getItem(FLOOR_START_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { minimumVersion?: string; startedAt?: string };
      if (saved.minimumVersion === minimumVersion && saved.startedAt) return saved.startedAt;
    }
    const startedAt = new Date(getTrustedNowMs()).toISOString();
    localStorage.setItem(FLOOR_START_KEY, JSON.stringify({ minimumVersion, startedAt }));
    return startedAt;
  } catch {
    return new Date(getTrustedNowMs()).toISOString();
  }
}

/**
 * useForcedUpdate — Periodic polling and state management for forced updates,
 * version floor enforcement, and emergency maintenance locks.
 *
 * Works in both Tauri desktop and browser/OBS dock environments.
 * Polls the backend API every 15 seconds and re-checks on focus / visibility.
 */
export function useForcedUpdate(): UseForcedUpdateReturn {
  const [forcedUpdateState, setForcedUpdateState] = useState<ForcedUpdateState>(() =>
    getForcedUpdateState(null)
  );

  const inFlightRef = useRef(false);

  const refetch = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    Promise.all([
      refreshAppSettings().catch(() => fetchAppSettings().catch(() => null)),
      fetchVersionFloor().catch(() => null),
    ])
      .then(([settings, floorResult]) => {
        let computed = getForcedUpdateState(settings);

        // If version floor from server is blocked, enforce the lock even if
        // getForcedUpdateState did not catch it
        if (!computed.active && floorResult?.blocked) {
          const gracePeriodHours = Math.max(0, floorResult.gracePeriodHours || 0);
          const isHardLock = gracePeriodHours === 0;
          // Anchor the countdown: the server's deadline when we have it,
          // otherwise the first time we saw this policy (remembered, so the
          // countdown does not restart on every poll).
          const startedAt = isHardLock
            ? new Date(getTrustedNowMs()).toISOString()
            : getFloorStartedAt(floorResult.minimumVersion);
          const lockAt = isHardLock
            ? startedAt
            : settings?.enforcementDeadlineAt ||
              new Date(new Date(startedAt).getTime() + gracePeriodHours * 3600 * 1000).toISOString();
          const hoursLeft = isHardLock
            ? 0
            : Math.max(0, (new Date(lockAt).getTime() - getTrustedNowMs()) / 3_600_000);

          computed = {
            blocked: isHardLock || hoursLeft <= 0,
            active: true,
            lockType: "forced-update",
            requiredVersion: floorResult.minimumVersion,
            hoursRemaining: isHardLock ? null : hoursLeft,
            gracePeriodHours: isHardLock ? null : gracePeriodHours,
            startedAt,
            lockAt,
            updateMessage:
              settings?.updateMessage ||
              `A new version of MakeChurchEasy is required. Your version is v${floorResult.currentVersion}. Update to v${floorResult.minimumVersion} or later to continue.`,
            currentVersion: floorResult.currentVersion,
            downloadUrl: settings ? getDownloadUrlForCurrentPlatform(settings) : "",
            releaseNotesUrl: settings?.releaseNotesUrl || "",
            loading: false,
          };
        }

        setForcedUpdateState(computed);
      })
      .catch(() => {
        // Fall back to offline cached evaluation if available
        setForcedUpdateState(getForcedUpdateState(null));
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, []);

  useEffect(() => {
    refetch();

    // Poll every 15 seconds so admin updates reflect promptly
    const intervalId = window.setInterval(refetch, 15 * 1000);

    // Re-check immediately on focus, online, and visibilitychange
    const handleFocus = () => refetch();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refetch]);

  const dismiss = useCallback(() => {
    recordOverlayDismiss(forcedUpdateState.hoursRemaining ?? 0);
    setForcedUpdateState((prev) => ({ ...prev, active: false }));
  }, [forcedUpdateState.hoursRemaining]);

  // The final 24 hours (and anything after the deadline) cannot be dismissed.
  const live = getLiveCountdown(forcedUpdateState);
  const isVisible = Boolean(
    forcedUpdateState.active &&
    (live.modalLocked || shouldReshowOverlay(live.hoursRemaining))
  );

  return {
    state: forcedUpdateState,
    isVisible,
    dismiss: live.modalLocked ? undefined : dismiss,
    refetch,
  };
}
