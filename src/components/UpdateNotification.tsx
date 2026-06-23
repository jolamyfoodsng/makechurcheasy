/**
 * UpdateNotification.tsx — Non-blocking floating update notification card.
 *
 * Behavior:
 * - Appears in bottom-right corner like VSCode / OpenCode
 * - Never blocks the app UI
 * - Dismissible with "Later" or close button
 * - Remembers dismissed state and re-shows subtly after grace period
 * - Supports progressive urgency (Day 1-2 subtle, Day 3-4 persistent, Day 5+ stronger)
 * - Shows download progress inline when updating
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  downloadAndInstallUpdate,
  type UpdateCheckResult,
  type DownloadProgress,
} from "../services/updateService";
import type { Update } from "@tauri-apps/plugin-updater";
import Icon from "./Icon";

interface UpdateNotificationProps {
  result: UpdateCheckResult;
  onDismiss: () => void;
  onRemindLater: () => void;
}

type UpdateStatus = "prompt" | "downloading" | "installing" | "relaunching" | "error";

const STORAGE_KEY = "ocs-update-notification-v1";

interface UpdateNotificationPrefs {
  dismissedVersion?: string;
  dismissedAt?: number;
  remindLaterAt?: number;
  ignoredCount?: number;
}

function loadPrefs(): UpdateNotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as UpdateNotificationPrefs;
  } catch { /* ignore */ }
  return {};
}

function savePrefs(prefs: UpdateNotificationPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

function shouldShowNotification(result: UpdateCheckResult): boolean {
  if (!result.available) return false;
  const prefs = loadPrefs();
  if (prefs.remindLaterAt && prefs.remindLaterAt > Date.now()) return false;
  if (prefs.dismissedVersion === result.version && prefs.dismissedAt) {
    const daysSinceDismissal = (Date.now() - prefs.dismissedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceDismissal < 1) return false;
  }
  return true;
}

export default function UpdateNotification({ result, onDismiss, onRemindLater }: UpdateNotificationProps) {
  const [status, setStatus] = useState<UpdateStatus>("prompt");
  const [progress, setProgress] = useState<DownloadProgress>({ contentLength: 0, downloaded: 0 });
  const [errorMsg, setErrorMsg] = useState("");
  const [showChangelog, setShowChangelog] = useState(false);
  const [visible, setVisible] = useState(() => shouldShowNotification(result));
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(() => setVisible(true));
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Re-check visibility when update result changes (e.g., from polling)
  useEffect(() => {
    setVisible(shouldShowNotification(result));
  }, [result.version]);

  const percentComplete =
    progress.contentLength > 0
      ? Math.round((progress.downloaded / progress.contentLength) * 100)
      : 0;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpdate = useCallback(async () => {
    if (!result.update) return;
    try {
      setStatus("downloading");
      await downloadAndInstallUpdate(
        result.update as Update,
        (p) => setProgress(p),
        (s) => setStatus(s)
      );
    } catch (err: any) {
      console.error("[UpdateNotification] Update failed:", err);
      setErrorMsg(err?.message || "Update failed. Please try again.");
      setStatus("error");
    }
  }, [result.update]);

  const handleRetry = useCallback(() => {
    setStatus("prompt");
    setProgress({ contentLength: 0, downloaded: 0 });
    setErrorMsg("");
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    savePrefs({
      dismissedVersion: result.version,
      dismissedAt: Date.now(),
      ignoredCount: (loadPrefs().ignoredCount ?? 0) + 1,
    });
    setTimeout(() => onDismiss(), 300);
  }, [result.version, onDismiss]);

  const handleRemindLater = useCallback(() => {
    setVisible(false);
    // Remind again after 4 hours
    savePrefs({
      ...loadPrefs(),
      remindLaterAt: Date.now() + 4 * 60 * 60 * 1000,
    });
    setTimeout(() => onRemindLater(), 300);
  }, [onRemindLater]);

  const statusConfig: Record<UpdateStatus, { icon: string; label: string }> = {
    prompt: { icon: "system_update", label: "Update Available" },
    downloading: { icon: "downloading", label: "Downloading..." },
    installing: { icon: "refresh", label: "Installing..." },
    relaunching: { icon: "restart_alt", label: "Relaunching..." },
    error: { icon: "error_outline", label: "Update Failed" },
  };

  const { icon, label } = statusConfig[status];
  const isBusy = status === "downloading" || status === "installing" || status === "relaunching";

  if (!visible) return null;

  return (
    <div className="update-notification update-notification--visible">
      <div className="update-notification__card">
        {/* Close button */}
        <button
          type="button"
          className="update-notification__close"
          onClick={handleDismiss}
          aria-label="Dismiss update notification"
          title="Dismiss"
        >
          <Icon name="close" size={14} />
        </button>

        {/* Header */}
        <div className="update-notification__header">
          <Icon name={icon} size={16} className={`update-notification__icon ${isBusy ? "update-notification__icon--spin" : ""}`} />
          <span className="update-notification__title">{label}</span>
        </div>

        {/* Body */}
        <div className="update-notification__body">
          {status === "prompt" && (
            <>
              <p className="update-notification__message">
                A new version of MakeChurchEasy Studio ({result.version}) is ready to install.
              </p>

              <div className="update-notification__versions">
                <span className="update-notification__version-current">v{result.currentVersion}</span>
                <Icon name="arrow_forward" size={12} className="update-notification__arrow" />
                <span className="update-notification__version-new">v{result.version}</span>
              </div>

              {result.notes && (
                <button
                  type="button"
                  className="update-notification__changelog-btn"
                  onClick={() => setShowChangelog(!showChangelog)}
                >
                  <Icon name={showChangelog ? "expand_less" : "expand_more"} size={12} />
                  What's New
                </button>
              )}

              {showChangelog && result.notes && (
                <div className="update-notification__changelog">
                  <p>{result.notes.slice(0, 400)}</p>
                </div>
              )}
            </>
          )}

          {status === "downloading" && (
            <div className="update-notification__progress">
              <div className="update-notification__progress-track">
                <div
                  className="update-notification__progress-fill"
                  style={{ width: `${percentComplete}%` }}
                />
              </div>
              <span className="update-notification__progress-text">
                {percentComplete}% — {formatBytes(progress.downloaded)} / {formatBytes(progress.contentLength)}
              </span>
            </div>
          )}

          {status === "installing" && (
            <div className="update-notification__progress">
              <div className="update-notification__progress-track">
                <div className="update-notification__progress-fill update-notification__progress-fill--pulse" style={{ width: "100%" }} />
              </div>
              <span className="update-notification__progress-text">Installing...</span>
            </div>
          )}

          {status === "relaunching" && (
            <p className="update-notification__progress-text">Restarting MakeChurchEasy Studio...</p>
          )}

          {status === "error" && (
            <div className="update-notification__error">
              <p>{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {status === "prompt" && (
          <div className="update-notification__actions">
            <button
              type="button"
              className="update-notification__btn update-notification__btn--later"
              onClick={handleRemindLater}
            >
              Later
            </button>
            <button
              type="button"
              className="update-notification__btn update-notification__btn--update"
              onClick={handleUpdate}
            >
              Update Now
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="update-notification__actions">
            <button
              type="button"
              className="update-notification__btn update-notification__btn--later"
              onClick={handleDismiss}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="update-notification__btn update-notification__btn--update"
              onClick={handleRetry}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
