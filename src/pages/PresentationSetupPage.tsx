import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Copy, ExternalLink, Globe, Info, RotateCcw, Users } from "lucide-react";

import {
  type PresentationSettings,
  getPresentationSettings,
  regenerateSession,
  savePresentationSettings,
} from "../services/presentationSettings";
import { syncPresentationRemoteAccessInfo } from "../services/presentationRemote";
import { fetchPresentationViewerCount } from "../services/presentationState";
import { launchPresentationScreen } from "../services/presentationWindow";

import "./PresentationSetupPage.css";

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="ps-section-header">
      <span className="ps-section-number">{number}</span>
      <h3 className="ps-section-title">{title}</h3>
    </div>
  );
}

interface PresentationLinkCardProps {
  settings: PresentationSettings;
  onUpdate: (patch: Partial<PresentationSettings>) => void;
}

function PresentationLinkCard({ settings, onUpdate }: PresentationLinkCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(settings.presentationLink).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }).catch(() => { });
  }, [settings.presentationLink]);

  const handleOpen = useCallback(() => {
    void launchPresentationScreen(settings.sessionId, settings.presentationLink);
  }, [settings.presentationLink, settings.sessionId]);

  const handleRegenerate = useCallback(() => {
    const updated = regenerateSession();
    onUpdate(updated);
    void syncPresentationRemoteAccessInfo(updated.sessionId)
      .then((remoteInfo) => {
        onUpdate({
          ...updated,
          presentationLink: remoteInfo.link,
          connectedViewers: 0,
        });
      })
      .catch(() => { });
  }, [onUpdate]);

  return (
    <div className="ps-config-card ps-config-card--hero">
      <div className="ps-config-card-header">
        <Globe size={16} />
        <span>Presentation link</span>
      </div>

      <p className="ps-config-copy">
        This link is generated and hosted locally by MakeChurchEasy on this machine. Open it on the projector computer, another laptop on the same network, or launch it directly on an extended display from here.
      </p>

      <label className="ps-label">Presentation URL</label>
      <div className="ps-link-row">
        <input className="ps-input ps-input--link" readOnly value={settings.presentationLink} />
        <button className="ps-btn ps-btn--small" onClick={handleCopy} title="Copy link">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button className="ps-btn ps-btn--small" onClick={handleOpen} title="Open screen">
          <ExternalLink size={14} />
        </button>
        <button className="ps-btn ps-btn--small" onClick={handleRegenerate} title="Regenerate link">
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="ps-launch-actions">
        <button className="ps-btn ps-btn--primary ps-btn--medium" onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy Link"}
        </button>
        <button className="ps-btn ps-btn--secondary ps-btn--medium" onClick={handleOpen}>
          <ExternalLink size={14} />
          Open Screen
        </button>
      </div>

      <p className="ps-launch-note">
        Regenerating the link rotates the local token and disconnects the old screen URL without changing the rest of the presentation console.
      </p>

      <div className="ps-viewers">
        <Users size={14} />
        <span>Connected screens: {settings.connectedViewers}</span>
      </div>
    </div>
  );
}

const PRESENTATION_USAGE_STEPS = [
  {
    title: "Copy the local link",
    description: "Open it on the projector machine or another laptop on the same network.",
  },
  {
    title: "Open the screen here",
    description: "Launch Screen opens a clean presentation window and pushes it to the external display when one is connected.",
  },
  {
    title: "Control from the console",
    description: "Select Ministry or Bible content, preview it locally, then click Present.",
  },
];

function PresentationUsageCard() {
  return (
    <div className="ps-config-card ps-config-card--guide">
      <div className="ps-config-card-header">
        <Info size={16} />
        <span>How it works</span>
      </div>

      <p className="ps-config-copy ps-config-copy--compact">
        The presentation feature now runs through one locally hosted screen link. There is no OBS setup inside this flow.
      </p>

      <div className="ps-guide-list">
        {PRESENTATION_USAGE_STEPS.map((step, index) => (
          <div key={step.title} className="ps-guide-item">
            <div className="ps-guide-step">
              <span className="ps-guide-step-number">{index + 1}</span>
              <div className="ps-guide-step-body">
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PresentationSetupPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PresentationSettings>(() => getPresentationSettings());

  useEffect(() => {
    let cancelled = false;

    const syncRemoteStatus = async () => {
      const current = getPresentationSettings();
      const [remoteInfo, viewerCount] = await Promise.all([
        syncPresentationRemoteAccessInfo(current.sessionId),
        fetchPresentationViewerCount(current.sessionId).catch(() => 0),
      ]);

      if (cancelled) return;

      const nextSettings = {
        ...current,
        presentationLink: remoteInfo.link,
        connectedViewers: viewerCount,
      };

      setSettings(nextSettings);
      savePresentationSettings(nextSettings);
    };

    void syncRemoteStatus();
    const interval = window.setInterval(() => {
      void syncRemoteStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const handleUpdate = useCallback((patch: Partial<PresentationSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch, updatedAt: new Date().toISOString() };
      savePresentationSettings(next);
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    savePresentationSettings(settings);
    navigate("/presentation/console");
  }, [navigate, settings]);

  return (
    <div className="ps-page">
      <div className="ps-container">
        <div className="ps-header">
          <h1 className="ps-title">Presentation Screen Setup</h1>

        </div>

        <div className="ps-section">
          <SectionHeader number={1} title="Presentation setup" />
          <div className="ps-overview-grid">
            <PresentationLinkCard settings={settings} onUpdate={handleUpdate} />
            <PresentationUsageCard />
          </div>
        </div>

        <div className="ps-footer">
          <button className="ps-btn ps-btn--primary ps-btn--large" onClick={handleContinue}>
            Open Presentation Console
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
