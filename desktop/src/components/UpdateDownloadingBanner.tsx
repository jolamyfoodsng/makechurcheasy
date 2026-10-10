import {
  useUpdateDownload,
  updateDownloadManager,
} from "../services/updateDownloadManager";
import { Loader2, ArrowUpRight, CheckCircle2, RotateCw } from "lucide-react";
import "./UpdateDownloadingBanner.css";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UpdateDownloadingBanner() {
  const { status, progress, version, isModalVisible, readyBannerDismissed } = useUpdateDownload();

  if (status === "ready" && !isModalVisible && !readyBannerDismissed) {
    return (
      <aside
        className="update-downloading-banner update-downloading-banner--ready"
        role="status"
        aria-live="polite"
        aria-label="Software update ready to install"
      >
        <div className="update-downloading-banner__row">
          <div className="update-downloading-banner__info">
            <CheckCircle2 size={16} className="update-downloading-banner__ready-icon" />
            <div className="update-downloading-banner__text">
              <span>Update {version ? `v${version}` : ""} is ready.</span>
              <span className="update-downloading-banner__bytes">
                · Restart when convenient — it also installs when you close the app.
              </span>
            </div>
          </div>

          <div className="update-downloading-banner__actions">
            <button
              type="button"
              className="update-downloading-banner__btn update-downloading-banner__btn--primary"
              onClick={() => void updateDownloadManager.installNow()}
              title="Install the update and restart MakeChurchEasy"
            >
              <RotateCw size={14} />
              <span>Restart Now</span>
            </button>
            <button
              type="button"
              className="update-downloading-banner__btn"
              onClick={() => updateDownloadManager.dismissReadyBanner()}
              title="Install when I close MakeChurchEasy"
            >
              <span>Later</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  const isBusy =
    status === "downloading" ||
    status === "installing" ||
    status === "relaunching";

  // Only display the pinned banner when downloading/installing in the background (modal is closed)
  if (!isBusy || isModalVisible) {
    return null;
  }

  const isDownloading = status === "downloading";
  const isInstalling = status === "installing";
  const isRelaunching = status === "relaunching";

  return (
    <aside
      className="update-downloading-banner"
      role="status"
      aria-live="polite"
      aria-label="Software update download in progress"
    >
      <div className="update-downloading-banner__row">
        <div className="update-downloading-banner__info">
          <Loader2 size={16} className="update-downloading-banner__spinner" />
          <div className="update-downloading-banner__text">
            <span>
              {isDownloading && (
                <>
                  Downloading update {version ? `v${version}` : ""}...
                  {progress.percent > 0 ? ` (${progress.percent}%)` : ""}
                </>
              )}
              {isInstalling && <>Installing update...</>}
              {isRelaunching && <>Restarting MakeChurchEasy...</>}
            </span>
            {isDownloading && progress.contentLength > 0 && (
              <span className="update-downloading-banner__bytes">
                · {formatBytes(progress.downloaded)} of {formatBytes(progress.contentLength)}
              </span>
            )}
          </div>
        </div>

        <div className="update-downloading-banner__actions">
          <button
            type="button"
            className="update-downloading-banner__btn"
            onClick={() => updateDownloadManager.openModal()}
            title="Open update details"
          >
            <span>View Details</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>

      <div className="update-downloading-banner__track">
        <div
          className={`update-downloading-banner__fill ${!isDownloading ? "update-downloading-banner__fill--pulse" : ""}`}
          style={{ width: isDownloading ? `${Math.max(4, progress.percent)}%` : "100%" }}
        />
      </div>
    </aside>
  );
}
