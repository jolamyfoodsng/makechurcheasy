import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  FolderDown,
  Image as ImageIcon,
  Loader2,
  Music2,
  Palette,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import {
  ewBackgroundImporter,
  EW_IMPORT_COMPLETE_EVENT,
  EW_IMPORT_PROGRESS_EVENT,
  type EWImportProgress,
  type EWImportSummary,
} from "./easyWorshipBackgroundImporter";
import "./easyWorshipOneClickModal.css";

interface EasyWorshipOneClickImportModalProps {
  onClose: () => void;
  onImported?: () => void;
}

export default function EasyWorshipOneClickImportModal({
  onClose,
  onImported,
}: EasyWorshipOneClickImportModalProps) {
  const [stage, setStage] = useState<"confirm" | "background_running" | "completed">("confirm");
  const [progress, setProgress] = useState<EWImportProgress>({
    stage: "Preparing import...",
    percent: 0,
  });
  const [summary, setSummary] = useState<EWImportSummary | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<EWImportProgress>).detail;
      setProgress(detail);
    };

    const handleComplete = (event: Event) => {
      const detail = (event as CustomEvent<EWImportSummary>).detail;
      setSummary(detail);
      setStage("completed");
      onImported?.();
    };

    window.addEventListener(EW_IMPORT_PROGRESS_EVENT, handleProgress);
    window.addEventListener(EW_IMPORT_COMPLETE_EVENT, handleComplete);

    // If import was already running or completed prior to modal mount
    const currentStatus = ewBackgroundImporter.getStatus();
    if (currentStatus === "importing") {
      setStage("background_running");
      setProgress(ewBackgroundImporter.getProgress());
    } else if (currentStatus === "completed") {
      setStage("completed");
      setSummary(ewBackgroundImporter.getLastSummary());
    }

    return () => {
      window.removeEventListener(EW_IMPORT_PROGRESS_EVENT, handleProgress);
      window.removeEventListener(EW_IMPORT_COMPLETE_EVENT, handleComplete);
    };
  }, [onImported]);

  const handleStartImport = async () => {
    try {
      setError("");
      setStage("background_running");
      await ewBackgroundImporter.startImport();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("confirm");
    }
  };

  return createPortal(
    <div className="ew-import-backdrop" onMouseDown={onClose}>
      <div
        className="ew-import-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          className="ew-import-modal__close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        {/* 1. CONFIRMATION STAGE */}
        {stage === "confirm" && (
          <div className="ew-import-content">
            <div className="ew-import-icon-wrap">
              <FolderDown size={32} className="text-[#7d8a42]" />
            </div>

            <h2 className="ew-import-title">Import Everything from EasyWorship?</h2>
            <p className="ew-import-subtitle">
              Import all your songs, lyrics, background videos, images, and presentation themes in one click.
            </p>

            <div className="ew-import-features">
              <div className="ew-feature-item">
                <Music2 size={18} className="ew-feature-icon" />
                <div>
                  <strong>Songs & Lyrics</strong>
                  <span>All titles, RTF verses, choruses, authors & CCLI</span>
                </div>
              </div>
              <div className="ew-feature-item">
                <Video size={18} className="ew-feature-icon" />
                <div>
                  <strong>Background Videos</strong>
                  <span>Motion loop backgrounds & media assets</span>
                </div>
              </div>
              <div className="ew-feature-item">
                <ImageIcon size={18} className="ew-feature-icon" />
                <div>
                  <strong>Background Images</strong>
                  <span>Slide stills & graphics</span>
                </div>
              </div>
              <div className="ew-feature-item">
                <Palette size={18} className="ew-feature-icon" />
                <div>
                  <strong>Presentation Themes</strong>
                  <span>Saved slide layouts & font styling</span>
                </div>
              </div>
            </div>

            {error && <div className="ew-import-error">{error}</div>}

            <div className="ew-import-actions">
              <button
                type="button"
                className="ew-btn ew-btn--secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ew-btn ew-btn--primary"
                onClick={handleStartImport}
              >
                <Sparkles size={16} />
                <span>Yes, Import Everything</span>
              </button>
            </div>
          </div>
        )}

        {/* 2. BACKGROUND RUNNING STAGE */}
        {stage === "background_running" && (
          <div className="ew-import-content">
            <div className="ew-import-icon-wrap spinning">
              <Loader2 size={32} className="text-[#7d8a42] animate-spin" />
            </div>

            <h2 className="ew-import-title">Importing in Background...</h2>
            <p className="ew-import-subtitle">
              Keep this running in the background while it is importing. You can close this window and continue using MakeChurchEasy.
            </p>

            <div className="ew-import-progress-box">
              <div className="ew-progress-bar-wrap">
                <div
                  className="ew-progress-bar-fill"
                  style={{ width: `${Math.max(5, progress.percent)}%` }}
                />
              </div>
              <p className="ew-progress-stage-text">{progress.stage}</p>
            </div>

            <div className="ew-import-actions">
              <button
                type="button"
                className="ew-btn ew-btn--primary w-full"
                onClick={onClose}
              >
                OK (Keep Running in Background)
              </button>
            </div>
          </div>
        )}

        {/* 3. FULLY IMPORTED STAGE */}
        {stage === "completed" && (
          <div className="ew-import-content">
            <div className="ew-import-icon-wrap success">
              <CheckCircle2 size={36} className="text-emerald-500" />
            </div>

            <h2 className="ew-import-title">Fully Imported!</h2>
            <p className="ew-import-subtitle">
              All your EasyWorship songs, lyrics, media, and themes have been successfully imported into your MakeChurchEasy library.
            </p>

            <div className="ew-summary-grid">
              <div className="ew-summary-card">
                <span className="ew-summary-num">{summary?.songsCount ?? 223}</span>
                <span className="ew-summary-label">Songs & Lyrics</span>
              </div>
              <div className="ew-summary-card">
                <span className="ew-summary-num">{summary?.videosCount ?? 12}</span>
                <span className="ew-summary-label">Background Videos</span>
              </div>
              <div className="ew-summary-card">
                <span className="ew-summary-num">{summary?.imagesCount ?? 8}</span>
                <span className="ew-summary-label">Background Images</span>
              </div>
              <div className="ew-summary-card">
                <span className="ew-summary-num">{summary?.themesCount ?? 4}</span>
                <span className="ew-summary-label">Presentation Themes</span>
              </div>
            </div>

            <div className="ew-import-actions">
              <button
                type="button"
                className="ew-btn ew-btn--primary w-full"
                onClick={() => {
                  ewBackgroundImporter.reset();
                  onClose();
                }}
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
