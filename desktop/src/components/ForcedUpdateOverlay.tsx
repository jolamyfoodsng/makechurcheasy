/**
 * ForcedUpdateOverlay.tsx — Full-screen overlay for forced updates
 *
 * Two modes:
 *   1. Countdown mode: closeable, shows time remaining, "Update Now" button
 *   2. Locked mode: no dismiss, only "Update Now", blocks all app usage
 *
 * The countdown continues offline because it's computed from the local
 * forcedUpdateStartedAt timestamp stored in localStorage.
 */

import { useState, useCallback, useEffect } from "react";
import {
  checkForUpdate,
  downloadAndInstallVerifiedUpdate,
  type DownloadProgress,
} from "../services/updateService";
import type { Update } from "@tauri-apps/plugin-updater";
import { exit } from "@tauri-apps/plugin-process";
import type { ForcedUpdateState, LockType } from "../services/forcedUpdateService";
import Icon from "./Icon";

interface ForcedUpdateOverlayProps {
  state: ForcedUpdateState;
  onDismiss?: () => void;
  onRefresh?: () => void | Promise<void>;
  isDock?: boolean;
}

type UpdateStatus = "prompt" | "downloading" | "installing" | "relaunching" | "error";

// ── Formatting helpers ─────────────────────────────────────────────────────

function formatCountdownPrecise(hours: number): string {
  if (hours <= 0) return "Update required now";
  if (hours >= 24) {
    const d = Math.floor(hours / 24);
    const h = Math.round(hours % 24);
    return `${d} day${d === 1 ? "" : "s"}${h > 0 ? ` ${h}h` : ""} remaining`;
  }
  if (hours >= 1) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h${m > 0 ? ` ${m}m` : ""} remaining`;
  }
  const m = Math.max(1, Math.round(hours * 60));
  return `${m}m remaining`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function lockTypeLabel(lockType: LockType | null): string {
  if (lockType === "emergency-lock") return "Emergency Maintenance";
  return "Update Required";
}

function lockTypeIcon(lockType: LockType | null): string {
  if (lockType === "emergency-lock") return "warning";
  return "lock";
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ForcedUpdateOverlay({ state, onDismiss, onRefresh, isDock }: ForcedUpdateOverlayProps) {
  const [status, setStatus] = useState<UpdateStatus>("prompt");
  const [progress, setProgress] = useState<DownloadProgress>({
    contentLength: 0,
    downloaded: 0,
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [dockRefreshing, setDockRefreshing] = useState(false);

  const handleDockRefresh = async () => {
    setDockRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
    } catch {
      // non-critical
    }
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  };

  // Live countdown — tick every 30 seconds for precise display
  const [hoursRemaining, setHoursRemaining] = useState(state.hoursRemaining);

  useEffect(() => {
    setHoursRemaining(state.hoursRemaining);
  }, [state.hoursRemaining]);

  // Local tick for smoother countdown between polls — compute from state prop, not localStorage
  const showLiveCountdown = hoursRemaining !== null && hoursRemaining > 0 && !!state.startedAt;
  useEffect(() => {
    if (!showLiveCountdown || !state.startedAt || state.gracePeriodHours === null) return;

    const id = window.setInterval(() => {
      // Recompute from the state prop (backed by server settings, not localStorage)
      const startMs = new Date(state.startedAt!).getTime();
      const endMs = startMs + state.gracePeriodHours! * 60 * 60 * 1000;
      const remainingMs = endMs - Date.now();
      const hrs = Math.max(0, remainingMs / (60 * 60 * 1000));
      setHoursRemaining(hrs);
    }, 30_000);

    return () => window.clearInterval(id);
  }, [showLiveCountdown, state.startedAt, state.gracePeriodHours]);

  const percentComplete =
    progress.contentLength > 0
      ? Math.round((progress.downloaded / progress.contentLength) * 100)
      : 0;

  const handleUpdate = useCallback(async () => {
    const isNativeTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isNativeTauri) {
      const url = state.downloadUrl || "https://makechurcheazy.com/download";
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      setStatus("downloading");
      setProgress({ contentLength: 0, downloaded: 0 });
      setErrorMsg("");

      const result = await checkForUpdate();
      const update = (result as any).update as Update | undefined;

      await downloadAndInstallVerifiedUpdate(
        update,
        (p) => setProgress(p),
        (s) => setStatus(s),
      );
    } catch (err: any) {
      console.error("[ForcedUpdate] Update failed:", err);
      const fallbackUrl = state.downloadUrl || "https://makechurcheazy.com/download";
      if (fallbackUrl) {
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
        setStatus("prompt");
        return;
      }
      setErrorMsg(err?.message || "Update failed. Please try again.");
      setStatus("error");
    }
  }, [state.downloadUrl]);

  const handleQuit = useCallback(async () => {
    try {
      await exit(0);
    } catch {
      try {
        window.close();
      } catch {
        // CEF in OBS may ignore window.close()
      }
    }
  }, []);

  const handleSupport = useCallback(() => {
    const base =
      import.meta.env.VITE_AUTH_API_URL ||
      "https://api.creatorstudioslabs.stream";
    window.open(`${base}/support`, "_blank", "noopener,noreferrer");
  }, []);

  const handleRetry = useCallback(() => {
    setStatus("prompt");
    setProgress({ contentLength: 0, downloaded: 0 });
    setErrorMsg("");
  }, []);

  const isBlocked = state.blocked;
  const isEmergency = state.lockType === "emergency-lock";
  const showCountdown = !isBlocked && hoursRemaining !== null && hoursRemaining > 0;
  const isBusy = status === "downloading" || status === "installing" || status === "relaunching";

  const bannerBg = isBlocked
    ? "var(--error, #ef4444)"
    : isEmergency
      ? "var(--error, #ef4444)"
      : "var(--warning, #f59e0b)";

  const statusConfig: Record<UpdateStatus, { icon: string; label: string }> = {
    prompt: { icon: "system_update", label: "Update Required" },
    downloading: { icon: "downloading", label: "Downloading..." },
    installing: { icon: "refresh", label: "Installing..." },
    relaunching: { icon: "restart_alt", label: "Relaunching..." },
    error: { icon: "error_outline", label: "Update Failed" },
  };

  const { icon: statusIcon, label: statusLabel } = statusConfig[status];

  return (
    <div
      className="force-update-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0, 0, 0, 0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="force-update-modal"
        style={{
          width: 440,
          maxWidth: "min(440px, calc(100vw - 24px))",
          boxSizing: "border-box",
          background: "var(--surface, #0F172A)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
        }}
      >
        {/* Banner */}
        <div
          style={{
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: bannerBg,
            color: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name={isDock ? (isBlocked ? "lock" : lockTypeIcon(state.lockType)) : lockTypeIcon(state.lockType)} size={14} />
            <span>{isDock ? (isBlocked ? "Dock Blocked" : lockTypeLabel(state.lockType)) : lockTypeLabel(state.lockType)}</span>
          </div>
          {showCountdown && (
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.9 }}>
              {formatCountdownPrecise(hoursRemaining!)}
            </span>
          )}
        </div>

        {/* Header */}
        <div
          style={{
            padding: "20px 24px 0",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <Icon
            name={isDock ? (isBlocked ? "lock" : statusIcon) : statusIcon}
            size={24}
            className={!isDock && isBusy ? "force-update-icon--spin" : ""}
          />
          <div>
            <h2
              className="force-update-title"
              style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}
            >
              {isDock
                ? (isBlocked ? "Dock Blocked" : statusLabel)
                : isBlocked
                ? isEmergency
                  ? "Emergency Lock Active"
                  : "App Locked"
                : isEmergency
                  ? "Emergency Maintenance Scheduled"
                  : statusLabel}
            </h2>
            {state.requiredVersion && (
              <p
                className="force-update-subtitle"
                style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}
              >
                v{state.requiredVersion} is required
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: isDock && isBlocked ? "16px 24px 24px" : "16px 24px" }}>
          {status === "prompt" && (
            <>
              <p
                className="force-update-message"
                style={{
                  margin: "0 0 16px",
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: "var(--text-secondary)",
                }}
              >
                {isDock
                  ? isBlocked
                    ? "This has been blocked because you need to update the app. Please open MakeChurchEasy on this computer to update."
                    : "A new version of MakeChurchEasy is required. Please open MakeChurchEasy on this computer to update before the deadline."
                  : isEmergency
                  ? state.updateMessage
                  : state.updateMessage ||
                    `A new version of MakeChurchEasy is required. Your version is v${state.currentVersion}. Update to v${state.requiredVersion} or later to continue.`}
              </p>

              {!isEmergency && state.requiredVersion && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "var(--surface-hover, rgba(255,255,255,0.05))",
                    marginBottom: showCountdown || (!isDock && isBlocked) ? 16 : 0,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  Your Version: v{state.currentVersion}
                  <br />
                  Required Version: v{state.requiredVersion}
                </div>
              )}

              {showCountdown && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "var(--surface-hover, rgba(255,255,255,0.05))",
                    marginBottom: !isDock && isBlocked ? 16 : 0,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon name="schedule" size={14} />
                  <span>
                    The app will be locked in {formatCountdownPrecise(hoursRemaining!)}.
                    Update before then to avoid disruption.
                  </span>
                </div>
              )}

              {!isDock && isBlocked && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "rgba(239, 68, 68, 0.1)",
                    marginBottom: 16,
                    fontSize: 13,
                    color: "var(--error, #ef4444)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon name="error_outline" size={14} />
                  <span>
                    {isEmergency
                      ? "Emergency lock is active. Access will remain restricted until your administrator disables it."
                      : "Grace period has expired. You must update to continue using the app."}
                  </span>
                </div>
              )}
            </>
          )}

          {status === "downloading" && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "var(--surface-hover, rgba(255,255,255,0.1))",
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 3,
                    background: "var(--primary, #8b5cf6)",
                    width: `${percentComplete}%`,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {percentComplete}% — {formatBytes(progress.downloaded)} / {formatBytes(progress.contentLength)}
              </span>
            </div>
          )}

          {status === "installing" && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "var(--surface-hover, rgba(255,255,255,0.1))",
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                <div
                  className="force-update-progress-fill--pulse"
                  style={{
                    height: "100%",
                    borderRadius: 3,
                    background: "var(--primary, #8b5cf6)",
                    width: "100%",
                  }}
                />
              </div>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Installing update...
              </span>
            </div>
          )}

          {status === "relaunching" && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              Restarting MakeChurchEasy...
            </p>
          )}

          {status === "error" && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 6,
                background: "rgba(239, 68, 68, 0.1)",
                marginBottom: 8,
              }}
            >
              <Icon name="error_outline" size={16} style={{ color: "var(--error, #ef4444)", marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 13, color: "var(--error, #ef4444)", lineHeight: 1.5 }}>
                {errorMsg}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            padding: "0 24px 20px",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {isDock ? (
            <button
              className="force-update-btn force-update-btn--primary"
              onClick={handleDockRefresh}
              disabled={dockRefreshing}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 6,
                border: "none",
                background: "var(--primary, #8b5cf6)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                cursor: dockRefreshing ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: dockRefreshing ? 0.7 : 1,
              }}
              title="I Updated, Refresh"
            >
              <Icon name="refresh" size={16} className={dockRefreshing ? "force-update-icon--spin" : ""} />
              <span>{dockRefreshing ? "Refreshing…" : "I Updated, Refresh"}</span>
            </button>
          ) : (
            <>
              {/* Forced update actions */}
              {status === "prompt" && !isEmergency && (
                <button
                  className="force-update-btn force-update-btn--primary"
                  onClick={handleUpdate}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--primary, #8b5cf6)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                  title="Update now"
                >
                  <Icon name="system_update" size={14} />
                  <span>Update Now</span>
                </button>
              )}

              {status === "prompt" && isEmergency && (
                <button
                  className="force-update-btn force-update-btn--primary"
                  onClick={handleSupport}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--primary, #8b5cf6)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                  title="Support"
                >
                  <Icon name="support_agent" size={14} />
                  <span>Support</span>
                </button>
              )}

              {/* Retry on error */}
              {status === "error" && (
                <button
                  className="force-update-btn force-update-btn--primary"
                  onClick={handleRetry}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--primary, #8b5cf6)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                  title="Refresh"
                >
                  <Icon name="refresh" size={14} />
                  <span>Try Again</span>
                </button>
              )}

              {/* Quit app in blocked modes */}
              {status === "prompt" && isBlocked && (
                <button
                  className="force-update-btn force-update-btn--secondary"
                  onClick={handleQuit}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 6,
                    border: "1px solid var(--border, rgba(255,255,255,0.1))",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                  title="Quit App"
                >
                  Quit App
                </button>
              )}

              {/* Close — only in countdown mode (not blocked) */}
              {status === "prompt" && showCountdown && onDismiss && (
                <button
                  className="force-update-btn force-update-btn--secondary"
                  onClick={onDismiss}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 6,
                    border: "1px solid var(--border, rgba(255,255,255,0.1))",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                  title="Close"
                >
                  {isEmergency ? "Learn More Later" : "Remind Me Later"}
                </button>
              )}
            </>
          )}
        </div>
    </div>
  </div>
  );
}
