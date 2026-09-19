import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchAppSettings,
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
          const startedAt = new Date().toISOString();
          const gracePeriodHours = Math.max(0, floorResult.gracePeriodHours || 0);
          const isHardLock = gracePeriodHours === 0;

          computed = {
            blocked: isHardLock,
            active: true,
            lockType: "forced-update",
            requiredVersion: floorResult.minimumVersion,
            hoursRemaining: gracePeriodHours > 0 ? gracePeriodHours : null,
            gracePeriodHours: gracePeriodHours > 0 ? gracePeriodHours : null,
            startedAt,
            lockAt:
              gracePeriodHours > 0
                ? new Date(Date.now() + gracePeriodHours * 3600 * 1000).toISOString()
                : startedAt,
            updateMessage:
              settings?.updateMessage ||
              `A new version of MakeChurchEasy is required. Your version is v${floorResult.currentVersion}. Update to v${floorResult.minimumVersion} or later to continue.`,
            currentVersion: floorResult.currentVersion,
            downloadUrl: settings?.windowsDownloadUrl || "",
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

  const isVisible = Boolean(
    forcedUpdateState.active &&
    (forcedUpdateState.blocked || shouldReshowOverlay(forcedUpdateState.hoursRemaining))
  );

  return {
    state: forcedUpdateState,
    isVisible,
    dismiss: forcedUpdateState.blocked ? undefined : dismiss,
    refetch,
  };
}
