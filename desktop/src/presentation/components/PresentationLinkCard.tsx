import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, RefreshCcw, RotateCcw, Wifi, WifiOff } from "lucide-react";

import type {
  PresentationConnectionStatus,
  PresentationSessionSettings,
} from "../types";

interface PresentationLinkCardProps {
  session: PresentationSessionSettings;
  connectionStatus: PresentationConnectionStatus;
  onCopy: () => Promise<void> | void;
  onOpen: () => Promise<void> | void;
  onRegenerate: () => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
}

function getStatusLabel(status: PresentationConnectionStatus, viewers: number): string {
  if (status === "connected") {
    return viewers > 1 ? `Remote Screens — ${viewers} connected` : "Remote Screen — Connected";
  }
  if (status === "disconnected") {
    return "Remote Screen — Disconnected";
  }
  if (status === "error") {
    return "Remote Screen — Error";
  }
  return "Remote Screen — Waiting";
}

export function PresentationLinkCard({
  session,
  connectionStatus,
  onCopy,
  onOpen,
  onRegenerate,
  onRefresh,
}: PresentationLinkCardProps) {
  const [copied, setCopied] = useState(false);

  const statusLabel = useMemo(
    () => getStatusLabel(connectionStatus, session.connectedViewers),
    [connectionStatus, session.connectedViewers],
  );

  const handleCopy = async () => {
    await onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="presentation-link-card">
      <div className="presentation-link-card__header">
        <div>
          <div className="presentation-panel-title">Presentation Screen</div>
          <div className="presentation-link-status">
            {connectionStatus === "connected" ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{statusLabel}</span>
          </div>
        </div>
        <button
          type="button"
          className="presentation-icon-button"
          onClick={() => void onRefresh()}
          title="Refresh remote screen status"
        >
          <RefreshCcw size={15} />
        </button>
      </div>

      <div className="presentation-link-row">
        <input
          readOnly
          value={session.presentationLink}
          className="presentation-input presentation-input--mono"
        />
      </div>

      <div className="presentation-link-actions">
        <button type="button" className="presentation-button primary" onClick={handleCopy}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          <span>{copied ? "Copied" : "Copy Link"}</span>
        </button>
        <button type="button" className="presentation-button" onClick={() => void onOpen()}>
          <ExternalLink size={15} />
          <span>Open Screen</span>
        </button>
        <button type="button" className="presentation-button" onClick={() => void onRegenerate()}>
          <RotateCcw size={15} />
          <span>Regenerate Link</span>
        </button>
      </div>
    </section>
  );
}
