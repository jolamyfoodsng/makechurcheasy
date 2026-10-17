import {
  useUpdateDownload,
  updateDownloadManager,
} from "../services/updateDownloadManager";
import { CloudDownload } from "./icons/NativeIcons";
import ModalDialog, { ModalProgress } from "./ModalDialog";

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
    <ModalDialog
      tone="info"
      zIndex={100000}
      icon={<CloudDownload size={26} />}
      title="Your update will continue downloading"
      onClose={() => updateDownloadManager.closeBackgroundNotice()}
      extra={
        <ModalProgress
          label={`MakeChurchEazy ${version ? `v${version}` : "Update"}`}
          value={`${progress.percent}%${progress.contentLength > 0 ? ` (${formatBytes(progress.downloaded)} / ${formatBytes(progress.contentLength)})` : ""}`}
          percent={progress.percent}
        />
      }
      hint="You can check live progress at any time in the banner pinned at the top of your screen, or under Settings > About."
      actions={[
        {
          label: "View Download",
          variant: "ghost",
          onClick: () => {
            updateDownloadManager.closeBackgroundNotice();
            updateDownloadManager.openModal();
          },
        },
        { label: "Got It", variant: "primary", onClick: () => updateDownloadManager.closeBackgroundNotice() },
      ]}
    >
      MakeChurchEazy is downloading the update in the background so you can continue
      working without disruption. MakeChurchEazy will not restart on its own: when the
      download finishes you can restart, or it will install the next time you close the app.
    </ModalDialog>
  );
}
