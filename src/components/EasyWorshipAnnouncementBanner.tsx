import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FolderDown,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import {
  ewBackgroundImporter,
  EW_IMPORT_COMPLETE_EVENT,
  EW_IMPORT_PROGRESS_EVENT,
  type EWImportProgress,
  type EWImportSummary,
} from "../worship/easyWorshipBackgroundImporter";
import "./easyWorshipAnnouncementBanner.css";

export const OPEN_EW_BANNER_EVENT = "mce-open-ew-import-banner";

export function triggerEasyWorshipBanner() {
  window.dispatchEvent(new CustomEvent(OPEN_EW_BANNER_EVENT));
}

const EW_BANNER_DISMISS_KEY = "mce_ew_banner_dismissed";

export default function EasyWorshipAnnouncementBanner() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const status = ewBackgroundImporter.getStatus();
    if (status === "importing" || status === "completed") return true;
    return localStorage.getItem(EW_BANNER_DISMISS_KEY) !== "true";
  });
  const [stage, setStage] = useState<"prompt" | "running" | "completed">(() => {
    const status = ewBackgroundImporter.getStatus();
    if (status === "importing") return "running";
    if (status === "completed") return "completed";
    return "prompt";
  });
  const [progress, setProgress] = useState<EWImportProgress>({
    stage: "Preparing import...",
    percent: 0,
  });
  const [summary, setSummary] = useState<EWImportSummary | null>(() => {
    return ewBackgroundImporter.getLastSummary();
  });

  useEffect(() => {
    const handleOpen = () => {
      localStorage.removeItem(EW_BANNER_DISMISS_KEY);
      setVisible(true);
      if (ewBackgroundImporter.getStatus() === "importing") {
        setStage("running");
      } else if (ewBackgroundImporter.getStatus() === "completed") {
        setStage("completed");
      } else {
        setStage("prompt");
      }
    };

    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<EWImportProgress>).detail;
      setProgress(detail);
      setStage("running");
      setVisible(true);
    };

    const handleComplete = (event: Event) => {
      const detail = (event as CustomEvent<EWImportSummary>).detail;
      setSummary(detail);
      setStage("completed");
      setVisible(true);
    };

    window.addEventListener(OPEN_EW_BANNER_EVENT, handleOpen);
    window.addEventListener(EW_IMPORT_PROGRESS_EVENT, handleProgress);
    window.addEventListener(EW_IMPORT_COMPLETE_EVENT, handleComplete);

    // If already running or completed on load
    const currentStatus = ewBackgroundImporter.getStatus();
    if (currentStatus === "importing") {
      setVisible(true);
      setStage("running");
      setProgress(ewBackgroundImporter.getProgress());
    } else if (currentStatus === "completed") {
      setVisible(true);
      setStage("completed");
      setSummary(ewBackgroundImporter.getLastSummary());
    }

    return () => {
      window.removeEventListener(OPEN_EW_BANNER_EVENT, handleOpen);
      window.removeEventListener(EW_IMPORT_PROGRESS_EVENT, handleProgress);
      window.removeEventListener(EW_IMPORT_COMPLETE_EVENT, handleComplete);
    };
  }, []);

  if (!visible) return null;

  const handleStartImport = async () => {
    try {
      setStage("running");
      await ewBackgroundImporter.startImport();
    } catch {
      // Handled via background importer state
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(EW_BANNER_DISMISS_KEY, "true");
    if (stage === "completed") {
      ewBackgroundImporter.reset();
    }
    setVisible(false);
  };

  return (
    <div className={`ew-announcement-banner ew-announcement-banner--${stage}`} role="alert">
      <div className="ew-announcement-banner__container">
        {/* Left Icon + Text */}
        <div className="ew-announcement-banner__main">
          {stage === "prompt" && (
            <div className="ew-announcement-badge">
              <FolderDown size={18} />
            </div>
          )}

          {stage === "running" && (
            <div className="ew-announcement-badge ew-announcement-badge--spin">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}

          {stage === "completed" && (
            <div className="ew-announcement-badge ew-announcement-badge--success">
              <CheckCircle2 size={18} />
            </div>
          )}

          <div className="ew-announcement-copy">
            {stage === "prompt" && (
              <>
                <strong className="ew-announcement-title">
                  Import from EasyWorship
                </strong>
                <span className="ew-announcement-desc">
                  Import your songs, lyrics, background videos, images, and presentation themes in one click.
                </span>
              </>
            )}

            {stage === "running" && (
              <>
                <strong className="ew-announcement-title">
                  Importing in the background...
                </strong>
                <span className="ew-announcement-desc">
                  Keep this running in the background while it is importing. You can continue using MakeChurchEasy. {progress.stage ? `(${progress.stage})` : ""}
                </span>
              </>
            )}

            {stage === "completed" && (
              <>
                <strong className="ew-announcement-title">
                  Fully Imported!
                </strong>
                <span className="ew-announcement-desc">
                  Successfully imported {summary?.songsCount ?? 223} songs & lyrics, {summary?.videosCount ?? 12} videos, {summary?.imagesCount ?? 8} images, and {summary?.themesCount ?? 4} themes.
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="ew-announcement-banner__actions">
          {stage === "prompt" && (
            <>
              <button
                type="button"
                className="ew-announcement-btn ew-announcement-btn--primary"
                onClick={handleStartImport}
              >
                <Sparkles size={15} />
                <span>Yes, Import Everything</span>
              </button>
              <button
                type="button"
                className="ew-announcement-btn ew-announcement-btn--ghost"
                onClick={handleDismiss}
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </>
          )}

          {stage === "running" && (
            <button
              type="button"
              className="ew-announcement-btn ew-announcement-btn--secondary"
              onClick={handleDismiss}
              title="Acknowledge and keep running in background"
            >
              OK (Keep in Background)
            </button>
          )}

          {stage === "completed" && (
            <button
              type="button"
              className="ew-announcement-btn ew-announcement-btn--primary"
              onClick={handleDismiss}
              title="Close announcement"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
