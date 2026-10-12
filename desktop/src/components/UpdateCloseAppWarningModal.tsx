import {
  useUpdateDownload,
  updateDownloadManager,
} from "../services/updateDownloadManager";
import { AlertTriangle } from "lucide-react";
import ModalDialog, { ModalProgress } from "./ModalDialog";

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
    <ModalDialog
      tone="warning"
      role="alertdialog"
      zIndex={100001}
      icon={<AlertTriangle size={26} />}
      title="Download is still in progress"
      // Only the buttons or the X answer this one: a stray click or Esc must not decide for the person.
      onClose={() => updateDownloadManager.cancelAppClose()}
      closeOnBackdrop={false}
      closeOnEscape={false}
      showClose
      extra={
        <ModalProgress
          label="Current Progress"
          value={`${progress.percent}%${progress.contentLength > 0 ? ` · ${formatBytes(progress.downloaded)} / ${formatBytes(progress.contentLength)}` : ""}`}
          percent={progress.percent}
        />
      }
      actions={[
        { label: "Quit Anyway", variant: "dangerGhost", onClick: () => void updateDownloadManager.confirmAppClose() },
        { label: "Keep Downloading", variant: "primary", autoFocus: true, onClick: () => updateDownloadManager.cancelAppClose() },
      ]}
    >
      MakeChurchEazy is currently downloading the latest update {version ? `(v${version})` : ""}.
      If you close the application now, the download will be interrupted and you will need to restart it later.
    </ModalDialog>
  );
}
