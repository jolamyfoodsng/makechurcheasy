import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Settings2 } from "lucide-react";

import { PresentationLinkCard } from "./PresentationLinkCard";
import type {
  PresentationConnectionStatus,
  PresentationMode,
  PresentationSessionSettings,
} from "../types";

interface PresentationTopTabsProps {
  title: string;
  description: string;
  mode: PresentationMode;
  onChange: (mode: PresentationMode) => void;
  onBack: () => void | Promise<void>;
  session: PresentationSessionSettings;
  connectionStatus: PresentationConnectionStatus;
  onCopyLink: () => Promise<void> | void;
  onOpenScreen: () => Promise<void> | void;
  onRegenerateLink: () => Promise<void> | void;
  onRefreshStatus: () => Promise<void> | void;
}

export function PresentationTopTabs({
  title,
  description,
  mode,
  onChange,
  onBack,
  session,
  connectionStatus,
  onCopyLink,
  onOpenScreen,
  onRegenerateLink,
  onRefreshStatus,
}: PresentationTopTabsProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSettingsOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isSettingsOpen]);

  return (
    <div className="presentation-top-tabs-bar">
      <button
        type="button"
        className="presentation-icon-button presentation-top-tabs-back"
        title="Back to setup"
        aria-label="Back to setup"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
      </button>

      <div className="presentation-top-tabs-copy">
        <h1>{title}</h1>
        <div className="presentation-top-tabs-copy__row">
          <p>{description}</p>
          <span className={`presentation-status-indicator ${connectionStatus}`}>
            <span className="presentation-status-indicator__dot" />
            {connectionStatus === "connected"
              ? session.connectedViewers > 1
                ? `${session.connectedViewers} screens`
                : "Connected"
              : connectionStatus === "disconnected"
                ? "Disconnected"
                : connectionStatus === "error"
                  ? "Error"
                  : "Waiting"}
          </span>
        </div>
      </div>

      <div className="presentation-top-tabs" role="tablist" aria-label="Presentation mode">
        <button
          type="button"
          className={`presentation-top-tab${mode === "ministry" ? " is-active" : ""}`}
          onClick={() => onChange("ministry")}
        >
          Ministry
        </button>
        <button
          type="button"
          className={`presentation-top-tab${mode === "bible" ? " is-active" : ""}`}
          onClick={() => onChange("bible")}
        >
          Bible
        </button>
      </div>

      <div className="presentation-top-tabs-settings" ref={popoverRef}>
        <button
          type="button"
          className={`presentation-icon-button presentation-top-tabs-settings__button${isSettingsOpen ? " is-active" : ""}`}
          title="Presentation screen settings"
          aria-label="Presentation screen settings"
          aria-haspopup="dialog"
          aria-expanded={isSettingsOpen}
          onClick={() => setIsSettingsOpen((open) => !open)}
        >
          <Settings2 size={16} />
        </button>

        {isSettingsOpen ? (
          <div className="presentation-top-tabs-settings__popover" role="dialog" aria-label="Presentation screen settings">
            <PresentationLinkCard
              session={session}
              connectionStatus={connectionStatus}
              onCopy={onCopyLink}
              onOpen={onOpenScreen}
              onRegenerate={onRegenerateLink}
              onRefresh={onRefreshStatus}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
