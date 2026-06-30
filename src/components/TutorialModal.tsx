import { useEffect, useCallback } from "react";
import { X, ExternalLink, Play, Youtube } from "lucide-react";
import { track } from "../services/analytics";

const YOUTUBE_CHANNEL = "https://www.youtube.com/@MakeChurchEasy";

interface Tutorial {
  title: string;
  duration: string;
  url: string;
  thumbnail: string;
}

const TUTORIALS: Tutorial[] = [
  {
    title: "Getting Started with MakeChurchEasy",
    duration: "5:32",
    url: "https://www.youtube.com/watch?v=placeholder1",
    thumbnail: "",
  },
  {
    title: "Connecting OBS to MakeChurchEasy",
    duration: "4:18",
    url: "https://www.youtube.com/watch?v=placeholder2",
    thumbnail: "",
  },
  {
    title: "Using Voice Bible",
    duration: "6:45",
    url: "https://www.youtube.com/watch?v=placeholder3",
    thumbnail: "",
  },
  {
    title: "Creating Your First Overlay",
    duration: "7:10",
    url: "https://www.youtube.com/watch?v=placeholder4",
    thumbnail: "",
  },
];

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
}

export function TutorialModal({ open, onClose }: TutorialModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="tutorial-modal-overlay" onClick={onClose}>
      <div
        className="tutorial-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Watch Tutorials"
      >
        <div className="tutorial-modal-header">
          <div>
            <h3 className="tutorial-modal-title">Watch Tutorials on YouTube</h3>
            <p className="tutorial-modal-subtitle">
              Learn how to get the most out of MakeChurchEasy.
            </p>
          </div>
          <button
            className="tutorial-modal-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="tutorial-modal-list">
          {TUTORIALS.map((t) => (
            <a
              key={t.url}
              className="tutorial-row"
              href={t.url}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                track("tutorial_video_clicked", { title: t.title })
              }
            >
              <div className="tutorial-thumb">
                {t.thumbnail ? (
                  <img src={t.thumbnail} alt={t.title} />
                ) : (
                  <Play size={20} className="tutorial-thumb-icon" />
                )}
              </div>
              <div className="tutorial-info">
                <p className="tutorial-title">{t.title}</p>
                <p className="tutorial-duration">{t.duration}</p>
              </div>
              <ExternalLink size={16} className="tutorial-link-icon" />
            </a>
          ))}
        </div>

        <a
          className="tutorial-view-all"
          href={YOUTUBE_CHANNEL}
          target="_blank"
          rel="noreferrer"
          onClick={() => track("tutorial_channel_clicked")}
        >
          <Youtube size={18} />
          View All Tutorials on YouTube
        </a>
      </div>
    </div>
  );
}
