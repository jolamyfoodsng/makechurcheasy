import {
  useUpdateDownload,
  updateDownloadManager,
} from "../services/updateDownloadManager";
import { AlertTriangle, X } from "lucide-react";
import "./UpdateModals.css";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UpdateCloseAppWarningModal() {
  const { showAppCloseWarning, progress, version } = useUpdateDownload();

  if (!showAppCloseWarning) return null;

  return (
    <div
      className="update-modal-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="close-warning-title"
      style={{ zIndex: 100001 }}
    >
      <div className="update-modal-card">
        <div className="update-modal-header">
          <div className="update-modal-header__title update-modal-header__title--warning">
            <AlertTriangle size={16} />
            <span>Update In Progress</span>
          </div>
          <button
            type="button"
            className="update-modal-header__close"
            onClick={() => updateDownloadManager.cancelAppClose()}
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="update-modal-body">
          <h3 id="close-warning-title">Download is still in progress</h3>
          <p>
            MakeChurchEasy is currently downloading the latest update {version ? `(v${version})` : ""}.
            If you close the application now, the download will be interrupted and you will need to restart it later.
          </p>

          <div className="update-modal-preview">
            <div className="update-modal-preview__row">
              <span className="update-modal-preview__label">Current Progress</span>
              <span className="update-modal-preview__val">
                {progress.percent}%
                {progress.contentLength > 0 && ` · ${formatBytes(progress.downloaded)} / ${formatBytes(progress.contentLength)}`}
              </span>
            </div>
            <div className="update-modal-preview__track">
              <div
                className="update-modal-preview__fill"
                style={{ width: `${Math.max(4, progress.percent)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="update-modal-footer">
          <button
            type="button"
            className="update-modal-btn update-modal-btn--danger"
            onClick={() => void updateDownloadManager.confirmAppClose()}
          >
            Quit Anyway
          </button>
          <button
            type="button"
            className="update-modal-btn update-modal-btn--primary"
            onClick={() => updateDownloadManager.cancelAppClose()}
            autoFocus
          >
            Keep Downloading
          </button>
        </div>
      </div>
    </div>
  );
}
