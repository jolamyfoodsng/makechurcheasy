/**
 * DockUploadToasts.tsx — Toast notifications for upload progress and results.
 *
 * Renders a fixed stack of toasts at the bottom-right of the dock.
 */

import { useTranslation } from "react-i18next";
import Icon from "./DockIcon";
import type { UploadToast } from "./useDockUpload";

interface Props {
  toasts: UploadToast[];
  uploading: boolean;
  progress: { current: number; total: number } | null;
  onDismiss: (id: string) => void;
}

export default function DockUploadToasts({ toasts, uploading, progress, onDismiss }: Props) {
  const { t } = useTranslation();
  return (
    <div className="dock-upload-toast-stack" aria-live="polite">
      {uploading && progress && (
        <div className="dock-upload-toast dock-upload-toast--progress">
          <Icon name="upload" size={12} />
          <span>
            {t('upload.uploading', { current: progress.current, total: progress.total })}
          </span>
        </div>
      )}
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`dock-upload-toast dock-upload-toast--${toast.tone}`}
          onClick={() => onDismiss(toast.id)}
          role="button"
          tabIndex={0}
        >
          <Icon
            name={toast.tone === "success" ? "check_circle" : toast.tone === "error" ? "error" : "info"}
            size={12}
          />
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
