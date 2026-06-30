/**
 * ForceUpdateModal.tsx — Blocking modal shown when the app version is too old.
 *
 * Progressive urgency:
 *   - Day 14-20: Persistent (can't dismiss, but app still works)
 *   - Day 21+: Full lockout (app is blocked until updated)
 *
 * The modal downloads and installs the update inline.
 */

import { useState, useCallback } from "react";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  type UpdateCheckResult,
  type DownloadProgress,
} from "../services/updateService";
import type { Update } from "@tauri-apps/plugin-updater";
import Icon from "./Icon";

interface ForceUpdateModalProps {
  result: UpdateCheckResult;
  daysOld: number;
  /** If true, app is fully blocked */
  locked: boolean;
}

type UpdateStatus = "prompt" | "downloading" | "installing" | "relaunching" | "error";

function formatCountdown(daysOld: number): string {
  const remaining = Math.max(0, 21 - daysOld);
  if (remaining === 0) return "App is locked";
  return `${remaining} day${remaining === 1 ? "" : "s"} until lockout`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ForceUpdateModal({ result, daysOld, locked }: ForceUpdateModalProps) {
  const [status, setStatus] = useState<UpdateStatus>("prompt");
  const [progress, setProgress] = useState<DownloadProgress>({ contentLength: 0, downloaded: 0 });
  const [errorMsg, setErrorMsg] = useState("");

  const percentComplete =
    progress.contentLength > 0
      ? Math.round((progress.downloaded / progress.contentLength) * 100)
      : 0;

  const handleUpdate = useCallback(async () => {
    // If no Update object (fake/test result), check for a real update first
    let update = result.update;
    if (!update) {
      try {
        setStatus("downloading");
        setProgress({ contentLength: 0, downloaded: 0 });
        const realResult = await checkForUpdate();
        if (realResult.update) {
          update = realResult.update;
        } else if (realResult.error) {
          // Network error — can't reach update server
          const isOffline = /network|fetch|failed to fetch|internet|ENOTFOUND|ECONNREFUSED/i.test(realResult.error);
          setErrorMsg(
            isOffline
              ? "No internet connection. Please connect to the internet and try again."
              : realResult.error || "Could not check for updates."
          );
          setStatus("error");
          return;
        } else {
          // No real update available — app is up to date
          setErrorMsg("Your app is already up to date. No update needed.");
          setStatus("error");
          return;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        const isOffline = /network|fetch|failed to fetch|internet|ENOTFOUND|ECONNREFUSED/i.test(msg);
        setErrorMsg(
          isOffline
            ? "No internet connection. Please connect to the internet and try again."
            : msg || "Could not check for updates."
        );
        setStatus("error");
        return;
      }
    }
    try {
      setStatus("downloading");
      await downloadAndInstallUpdate(
        update as Update,
        (p) => setProgress(p),
        (s) => setStatus(s)
      );
    } catch (err: any) {
      console.error("[ForceUpdate] Update failed:", err);
      setErrorMsg(err?.message || "Update failed. Please try again.");
      setStatus("error");
    }
  }, [result.update]);

  const handleRetry = useCallback(() => {
    setStatus("prompt");
    setProgress({ contentLength: 0, downloaded: 0 });
    setErrorMsg("");
  }, []);

  const statusConfig: Record<UpdateStatus, { icon: string; label: string }> = {
    prompt: { icon: "system_update", label: "Update Required" },
    downloading: { icon: "downloading", label: "Downloading..." },
    installing: { icon: "refresh", label: "Installing..." },
    relaunching: { icon: "restart_alt", label: "Relaunching..." },
    error: { icon: "error_outline", label: "Update Failed" },
  };

  const { icon, label } = statusConfig[status];
  const isBusy = status === "downloading" || status === "installing" || status === "relaunching";

  return (
    <div className="force-update-overlay" onClick={locked ? undefined : undefined}>
      <div className="force-update-modal">
        {/* Urgency banner */}
        <div className={`force-update-banner ${locked ? "force-update-banner--locked" : ""}`}>
          <Icon name={locked ? "lock" : "warning"} size={16} />
          <span>{locked ? "App Locked" : formatCountdown(daysOld)}</span>
        </div>

        {/* Header */}
        <div className="force-update-header">
          <Icon name={icon} size={24} className={isBusy ? "force-update-icon--spin" : ""} />
          <div>
            <h2 className="force-update-title">{label}</h2>
            <p className="force-update-subtitle">
              Your version is {daysOld} day{daysOld === 1 ? "" : "s"} out of date
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="force-update-body">
          {status === "prompt" && (
            <>
              <p className="force-update-message">
                {result.version
                  ? `MakeChurchEasy v${result.version} is available. Please update to continue using the app.`
                  : `A new version of MakeChurchEasy is available. Please update to continue using the app.`}
              </p>

              {result.version && (
                <div className="force-update-versions">
                  <span className="force-update-version-current">v{result.currentVersion ?? "current"}</span>
                  <span className="force-update-arrow">→</span>
                  <span className="force-update-version-new">v{result.version}</span>
                </div>
              )}

              {result.notes && (
                <div className="force-update-changelog">
                  <p className="force-update-changelog-label">What's New</p>
                  <p className="force-update-changelog-text">{result.notes.slice(0, 300)}</p>
                </div>
              )}
            </>
          )}

          {status === "downloading" && (
            <div className="force-update-progress">
              <div className="force-update-progress-track">
                <div className="force-update-progress-fill" style={{ width: `${percentComplete}%` }} />
              </div>
              <span className="force-update-progress-text">
                {percentComplete}% — {formatBytes(progress.downloaded)} / {formatBytes(progress.contentLength)}
              </span>
            </div>
          )}

          {status === "installing" && (
            <div className="force-update-progress">
              <div className="force-update-progress-track">
                <div className="force-update-progress-fill force-update-progress-fill--pulse" style={{ width: "100%" }} />
              </div>
              <span className="force-update-progress-text">Installing update...</span>
            </div>
          )}

          {status === "relaunching" && (
            <p className="force-update-progress-text">Restarting MakeChurchEasy...</p>
          )}

          {status === "error" && (
            <div className="force-update-error">
              <Icon name="error_outline" size={16} />
              <p>{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="force-update-actions">
          {status === "prompt" && (
            <button className="force-update-btn force-update-btn--primary" onClick={handleUpdate} title="Update now">
              <Icon name="system_update" size={14} />
              <span>Update Now</span>
            </button>
          )}

          {status === "error" && (
            <button className="force-update-btn force-update-btn--primary" onClick={handleRetry} title="Refresh">
              <Icon name="refresh" size={14} />
              <span>Try Again</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
