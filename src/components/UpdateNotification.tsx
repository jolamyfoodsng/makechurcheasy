/**
 * UpdateNotification.tsx — Centered update dialog for optional releases.
 *
 * Behavior:
 * - Shows the release notes before the user chooses an action
 * - Offers "Update Now" or "Remind me later"
 * - Remembers the reminder choice and re-shows after the reminder window
 * - Shows download progress inline when updating
 */

import { useState, useCallback, useEffect, type ReactNode } from "react";
import {
  downloadAndInstallUpdate,
  type UpdateCheckResult,
  type DownloadProgress,
} from "../services/updateService";
import type { Update } from "@tauri-apps/plugin-updater";
import Icon from "./Icon";

interface UpdateNotificationProps {
  result: UpdateCheckResult;
  onRemindLater: () => void;
  manualDownloadUrl?: string;
  releaseNotesUrl?: string;
  message?: string;
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

function renderReleaseNotes(notes: string): ReactNode {
  const lines = notes.slice(0, 12_000).split(/\r?\n/);

  return lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={`space-${index}`} className="update-notification__note-space" />;

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      return <h3 key={`heading-${index}`}>{heading[1]}</h3>;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      return (
        <div key={`bullet-${index}`} className="update-notification__note-bullet">
          <span aria-hidden="true">•</span>
          <span>{bullet[1]}</span>
        </div>
      );
    }

    return <p key={`paragraph-${index}`}>{trimmed}</p>;
  });
}

export default function UpdateNotification({
  result,
  onRemindLater,
  manualDownloadUrl,
  releaseNotesUrl,
  message,
}: UpdateNotificationProps) {
  const [status, setStatus] = useState<UpdateStatus>("prompt");
  const [progress, setProgress] = useState<DownloadProgress>({ contentLength: 0, downloaded: 0 });
  const [errorMsg, setErrorMsg] = useState("");
  const [visible, setVisible] = useState(() => shouldShowNotification(result));

  // Re-check visibility when update result changes (e.g., from polling)
  useEffect(() => {
    setVisible(shouldShowNotification(result));
  }, [result.version, result.available]);

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
    if (!result.update) {
      if (manualDownloadUrl) {
        window.open(manualDownloadUrl, "_blank", "noopener,noreferrer");
        return;
      }
      setErrorMsg("No update package is available for this device yet.");
      setStatus("error");
      return;
    }
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
  }, [manualDownloadUrl, result.update]);

  const handleRetry = useCallback(() => {
    setStatus("prompt");
    setProgress({ contentLength: 0, downloaded: 0 });
    setErrorMsg("");
  }, []);

  const handleRemindLater = useCallback(() => {
    setVisible(false);
    // Remind again after four hours, matching the explicit "Remind me later"
    // action and the close button.
    savePrefs({
      ...loadPrefs(),
      remindLaterAt: Date.now() + 4 * 60 * 60 * 1000,
    });
    setTimeout(() => onRemindLater(), 300);
  }, [onRemindLater]);

  const statusConfig: Record<UpdateStatus, string> = {
    prompt: "system_update",
    downloading: "downloading",
    installing: "refresh",
    relaunching: "restart_alt",
    error: "error_outline",
  };

  const icon = statusConfig[status];
  const isBusy = status === "downloading" || status === "installing" || status === "relaunching";

  if (!visible) return null;

  return (
    <div
      className="update-notification update-notification--visible"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-notification-title"
    >
      <div className="update-notification__card">
        <div className="update-notification__titlebar">
          <div className="update-notification__titlebar-label">
            <Icon name={icon} size={14} className={isBusy ? "update-notification__icon--spin" : ""} />
            <span>New update available</span>
          </div>
        </div>

        <button
          type="button"
          className="update-notification__close"
          onClick={handleRemindLater}
          aria-label="Remind me later"
          title="Remind me later"
        >
          <Icon name="close" size={14} />
        </button>

        <div className="update-notification__body">
          {status === "prompt" && (
            <>
              <p className="update-notification__eyebrow">
                {message || "There is a new update available:"}
              </p>

              <h2 id="update-notification-title" className="update-notification__release-title">
                MakeChurchEasy {result.version || "update"}
              </h2>

              <div className="update-notification__versions">
                <span className="update-notification__version-current">v{result.currentVersion}</span>
                <Icon name="arrow_forward" size={12} className="update-notification__arrow" />
                <span className="update-notification__version-new">v{result.version}</span>
              </div>

              {(result.notes || releaseNotesUrl) && (
                <section className="update-notification__release-notes" aria-label="Release notes">
                  <div className="update-notification__release-notes-scroll">
                    {result.notes ? renderReleaseNotes(result.notes) : (
                      <p>No release notes are available for this update.</p>
                    )}
                  </div>
                  {releaseNotesUrl && (
                    <button
                      type="button"
                      className="update-notification__changelog-btn"
                      onClick={() => window.open(releaseNotesUrl, "_blank", "noopener,noreferrer")}
                      title="Open full release notes"
                    >
                      <Icon name="open_in_new" size={12} />
                      Open full release notes
                    </button>
                  )}
                </section>
              )}

              {!result.notes && !releaseNotesUrl && (
                <div className="update-notification__release-notes update-notification__release-notes--empty">
                  <p>No release notes are available for this update.</p>
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
            <p className="update-notification__progress-text">Restarting MakeChurchEasy...</p>
          )}

          {status === "error" && (
            <div className="update-notification__error">
              <p>{errorMsg}</p>
            </div>
          )}
        </div>

        {status === "prompt" && (
          <div className="update-notification__actions">
            <button
              type="button"
              className="update-notification__btn update-notification__btn--update"
              onClick={handleUpdate}
             title="Update now">
              Update Now
            </button>
            <button
              type="button"
              className="update-notification__btn update-notification__btn--later"
              onClick={handleRemindLater}
              title="Remind me later"
            >
              Remind me later
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="update-notification__actions">
            <button
              type="button"
              className="update-notification__btn update-notification__btn--later"
              onClick={handleRemindLater}
              title="Remind me later"
            >
              Remind me later
            </button>
            <button
              type="button"
              className="update-notification__btn update-notification__btn--update"
              onClick={handleRetry}
             title="Try Again">
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
