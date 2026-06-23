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
  downloadAndInstallUpdate,
  type DownloadProgress,
} from "../services/updateService";
import type { Update } from "@tauri-apps/plugin-updater";
import type { ForcedUpdateState, LockType } from "../services/forcedUpdateService";
import Icon from "./Icon";

interface ForcedUpdateOverlayProps {
  state: ForcedUpdateState;
  onDismiss?: () => void;
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
    return `${h}h ${m}m remaining`;
  }
  const m = Math.round(hours * 60);
  return `${m} minute${m === 1 ? "" : "s"} remaining`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function lockTypeLabel(lockType: LockType | null): string {
  if (lockType === "emergency-lock") return "Emergency Lock";
  return "Update Required";
}

function lockTypeIcon(lockType: LockType | null): string {
  if (lockType === "emergency-lock") return "lock";
  return "warning";
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ForcedUpdateOverlay({ state, onDismiss }: ForcedUpdateOverlayProps) {
  const [status, setStatus] = useState<UpdateStatus>("prompt");
  const [progress, setProgress] = useState<DownloadProgress>({
    contentLength: 0,
    downloaded: 0,
  });
  const [errorMsg, setErrorMsg] = useState("");

  // Live countdown — tick every 30 seconds for precise display
  const [hoursRemaining, setHoursRemaining] = useState(state.hoursRemaining);

  useEffect(() => {
    setHoursRemaining(state.hoursRemaining);
  }, [state.hoursRemaining]);

  // Also do a local tick for smoother countdown between polls
  const showLiveCountdown = hoursRemaining !== null && hoursRemaining > 0 && !!state.startedAt;
  useEffect(() => {
    if (!showLiveCountdown) return;

    const id = window.setInterval(() => {
      // Recompute from localStorage directly for accuracy
      try {
        const raw = localStorage.getItem("ocs-forced-update-record-v1");
        if (!raw) return;
        const record = JSON.parse(raw);
        const startMs = new Date(record.startedAt).getTime();
        const endMs = startMs + record.gracePeriodHours * 60 * 60 * 1000;
        const remainingMs = endMs - Date.now();
        const hrs = Math.max(0, remainingMs / (60 * 60 * 1000));
        setHoursRemaining(hrs);
      } catch {
        // non-critical
      }
    }, 30_000);

    return () => window.clearInterval(id);
  }, [showLiveCountdown, state.startedAt]);

  const percentComplete =
    progress.contentLength > 0
      ? Math.round((progress.downloaded / progress.contentLength) * 100)
      : 0;

  const handleUpdate = useCallback(async () => {
    try {
      setStatus("downloading");
      setProgress({ contentLength: 0, downloaded: 0 });

      const result = await checkForUpdate();
      const update = (result as any).update as Update | undefined;

      if (!update) {
        const isOffline = /network|fetch|failed to fetch|internet|ENOTFOUND|ECONNREFUSED/i.test(
          (result as any).error || ""
        );
        setErrorMsg(
          isOffline
            ? "No internet connection. Please connect to the internet and try again."
            : "No update available. Please download the latest version from the website."
        );
        setStatus("error");
        return;
      }

      await downloadAndInstallUpdate(
        update,
        (p) => setProgress(p),
        (s) => setStatus(s)
      );
    } catch (err: any) {
      console.error("[ForcedUpdate] Update failed:", err);
      setErrorMsg(err?.message || "Update failed. Please try again.");
      setStatus("error");
    }
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
          maxWidth: "90vw",
          background: "var(--surface, #1a1a2e)",
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
            <Icon name={lockTypeIcon(state.lockType)} size={14} />
            <span>{lockTypeLabel(state.lockType)}</span>
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
            name={statusIcon}
            size={24}
            className={isBusy ? "force-update-icon--spin" : ""}
          />
          <div>
            <h2
              className="force-update-title"
              style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}
            >
              {isBlocked
                ? isEmergency
                  ? "Emergency Update Required"
                  : "App Locked"
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
        <div style={{ padding: "16px 24px" }}>
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
                {isBlocked
                  ? state.updateMessage ||
                  `This version of MakeChurchEasy has expired. You must update to v${state.requiredVersion} to continue.`
                  : state.updateMessage ||
                  `A new version of MakeChurchEasy (v${state.requiredVersion}) is available. Please update to continue.`}
              </p>

              {showCountdown && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "var(--surface-hover, rgba(255,255,255,0.05))",
                    marginBottom: 16,
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

              {isBlocked && (
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
                      ? "Emergency lock is active. Only updating the app will restore access."
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
              Restarting MakeChurchEasy Studio...
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
          }}
        >
          {/* Update Now — always present */}
          {status === "prompt" && (
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
            >
              <Icon name="system_update" size={14} />
              <span>Update Now</span>
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
            >
              <Icon name="refresh" size={14} />
              <span>Try Again</span>
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
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
