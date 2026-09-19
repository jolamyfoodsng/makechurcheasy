/**
 * UpdateNotification.tsx — Centered update dialog for optional releases.
 *
 * Behavior:
 * - Shows the release notes before the user chooses an action
 * - Offers "Update Now" or "Remind me later"
 * - Remembers the reminder choice and re-shows after the reminder window
 * - Shows download progress inline when updating
 */

import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import {
  type UpdateCheckResult,
} from "../services/updateService";
import {
  updateDownloadManager,
  useUpdateDownload,
} from "../services/updateDownloadManager";
import { getReleaseHighlights } from "../services/releaseNotesService";
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
  const downloadState = useUpdateDownload();

  // Register available update with central manager
  useEffect(() => {
    if (result.available) {
      updateDownloadManager.registerAvailableUpdate(
        (result.update as Update) ?? null,
        result.version ?? "",
        result.currentVersion ?? "",
        manualDownloadUrl,
        shouldShowNotification(result),
      );
    }
  }, [result, manualDownloadUrl]);

  const rawStatus = downloadState.status;
  const status: UpdateStatus =
    rawStatus === "downloading" ||
    rawStatus === "installing" ||
    rawStatus === "relaunching" ||
    rawStatus === "error"
      ? rawStatus
      : "prompt";

  const progress = downloadState.progress;
  const errorMsg = downloadState.errorMsg;
  const percentComplete = progress.percent;

  const isBusy = status === "downloading" || status === "installing" || status === "relaunching";

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const highlights = useMemo(() => {
    return getReleaseHighlights(result.version, result.notes);
  }, [result.version, result.notes]);

  const handleUpdate = useCallback(async () => {
    if (!result.update) {
      if (manualDownloadUrl) {
        window.open(manualDownloadUrl, "_blank", "noopener,noreferrer");
        return;
      }
    }
    await updateDownloadManager.startDownload((result.update as Update) ?? null, result.version);
  }, [manualDownloadUrl, result.update, result.version]);

  const handleRetry = useCallback(() => {
    updateDownloadManager.retry();
  }, []);

  const handleRemindLater = useCallback(() => {
    if (updateDownloadManager.isBusy()) {
      updateDownloadManager.dismissModal();
      return;
    }

    updateDownloadManager.dismissModal();
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

  if (!downloadState.isModalVisible) return null;

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

              <section className="update-notification__release-notes" aria-label="Release notes">
                <div className="update-notification__obs-header">
                  <Icon name="auto_awesome" size={13} className="update-notification__obs-header-icon" />
                  <span>What's New in this Update</span>
                </div>

                <div className="update-notification__release-notes-scroll">
                  {highlights.length > 0 ? (
                    <div className="update-obs-list">
                      {highlights.map((highlight) => (
                        <div key={highlight.id} className="update-obs-card">
                          <div className="update-obs-card__header">
                            <div className="update-obs-card__title-row">
                              <span className="update-obs-card__number">{highlight.number}.</span>
                              <span className="update-obs-card__title">{highlight.title}</span>
                              <span className={`update-obs-badge update-obs-badge--${highlight.badge}`}>
                                {highlight.badgeLabel}
                              </span>
                            </div>
                            {highlight.summary && (
                              <p className="update-obs-card__summary">{highlight.summary}</p>
                            )}
                          </div>

                          {highlight.points.length > 0 && (
                            <ul className="update-obs-card__list">
                              {highlight.points.map((pt, pIdx) => (
                                <li key={pIdx} className="update-obs-card__item">
                                  <span className="update-obs-card__bullet" aria-hidden="true">•</span>
                                  <div className="update-obs-card__item-text">
                                    {pt.lead && <strong className="update-obs-card__lead">{pt.lead}: </strong>}
                                    <span>{pt.text}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : result.notes ? (
                    renderReleaseNotes(result.notes)
                  ) : (
                    <p className="update-notification__release-notes--empty">No release notes are available for this update.</p>
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

        {(status === "downloading" || status === "installing") && (
          <div className="update-notification__actions">
            <button
              type="button"
              className="update-notification__btn update-notification__btn--later"
              onClick={handleRemindLater}
              title="Continue in background"
            >
              Continue in Background
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
