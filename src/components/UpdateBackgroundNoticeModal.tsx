import {
  useUpdateDownload,
  updateDownloadManager,
} from "../services/updateDownloadManager";
import { CloudDownload, X, Info } from "lucide-react";
import "./UpdateModals.css";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UpdateBackgroundNoticeModal() {
  const { showBackgroundNotice, progress, version } = useUpdateDownload();

  if (!showBackgroundNotice) return null;

  return (
    <div
      className="update-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bg-notice-title"
      onClick={() => updateDownloadManager.closeBackgroundNotice()}
    >
      <div
        className="update-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="update-modal-header">
          <div className="update-modal-header__title update-modal-header__title--info">
            <CloudDownload size={16} />
            <span>Downloading in Background</span>
          </div>
          <button
            type="button"
            className="update-modal-header__close"
            onClick={() => updateDownloadManager.closeBackgroundNotice()}
            aria-label="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>

        <div className="update-modal-body">
          <h3 id="bg-notice-title">Your update will continue downloading</h3>
          <p>
            MakeChurchEasy is downloading the update in the background so you can continue
            working without disruption. We will let you know as soon as the installation is ready.
          </p>

          <div className="update-modal-preview">
            <div className="update-modal-preview__row">
              <span className="update-modal-preview__label">
                MakeChurchEasy {version ? `v${version}` : "Update"}
              </span>
              <span className="update-modal-preview__val">
                {progress.percent}%
                {progress.contentLength > 0 && ` (${formatBytes(progress.downloaded)} / ${formatBytes(progress.contentLength)})`}
              </span>
            </div>
            <div className="update-modal-preview__track">
              <div
                className="update-modal-preview__fill"
                style={{ width: `${Math.max(4, progress.percent)}%` }}
              />
            </div>
          </div>

          <div className="update-modal-tip">
            <Info size={14} />
            <span>
              You can check live progress at any time in the banner pinned at the top of your screen,
              or under Settings &gt; About.
            </span>
          </div>
        </div>

        <div className="update-modal-footer">
          <button
            type="button"
            className="update-modal-btn update-modal-btn--secondary"
            onClick={() => {
              updateDownloadManager.closeBackgroundNotice();
              updateDownloadManager.openModal();
            }}
          >
            View Download
          </button>
          <button
            type="button"
            className="update-modal-btn update-modal-btn--primary"
            onClick={() => updateDownloadManager.closeBackgroundNotice()}
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
