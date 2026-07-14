/**
 * PresentationSetupPage.tsx — Presentation screen setup
 *
 * This page is intentionally URL-first:
 * - copy one presentation link
 * - open it on another laptop in a browser
 * - or use the same link in an OBS Browser Source on that laptop
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Copy, ExternalLink, Globe, RotateCcw, Users } from "lucide-react";
import {
  type PresentationSettings,
  getPresentationSettings,
  savePresentationSettings,
  regenerateSession,
} from "../services/presentationSettings";
import { fetchPresentationViewerCount } from "../services/presentationState";
import { syncPresentationRemoteAccessInfo } from "../services/presentationRemote";
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

function normalizeLinkOnlySettings(settings: PresentationSettings): PresentationSettings {
  return {
    ...settings,
    outputMode: "remote-presentation",
    localObsEnabled: false,
    remotePresentationEnabled: true,
    routes: {
      bibleFullscreen: "remote-presentation",
      bibleLowerThird: "remote-presentation",
      worshipFullscreen: "remote-presentation",
      worshipLowerThird: "remote-presentation",
      ministry: "remote-presentation",
      countdown: "remote-presentation",
    },
  };
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
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [settings.presentationLink]);

  const handleOpen = useCallback(() => {
    void launchPresentationScreen(settings.sessionId, settings.presentationLink);
  }, [settings.presentationLink, settings.sessionId]);

  const handleRegenerate = useCallback(() => {
    const updated = regenerateSession();
    onUpdate({
      sessionId: updated.sessionId,
      presentationLink: updated.presentationLink,
      connectedViewers: 0,
    });
    void syncPresentationRemoteAccessInfo(updated.sessionId)
      .then((remoteInfo) => {
        onUpdate({
          sessionId: updated.sessionId,
          presentationLink: remoteInfo.link,
          connectedViewers: 0,
        });
      })
      .catch(() => {});
  }, [onUpdate]);

  return (
    <div className="ps-config-card ps-config-card--hero">
      <div className="ps-config-card-header">
        <Globe size={16} />
        <span>Presentation Screen Link</span>
      </div>

      <p className="ps-config-copy">
        Share this one link with the presentation laptop. On this computer, Launch Screen opens a dedicated presentation window and sends it to the external display automatically when one is connected.
      </p>

      <label className="ps-label">Presentation URL</label>
      <div className="ps-link-row">
        <input className="ps-input ps-input--link" readOnly value={settings.presentationLink} />
        <button className="ps-btn ps-btn--small" onClick={handleCopy} title="Copy link">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button className="ps-btn ps-btn--small" onClick={handleOpen} title="Launch screen">
          <ExternalLink size={14} />
        </button>
        <button className="ps-btn ps-btn--small" onClick={handleRegenerate} title="Regenerate link">
          <RotateCcw size={14} />
        </button>
      </div>

        <div className="ps-launch-actions">
          <button className="ps-btn ps-btn--primary ps-btn--medium" onClick={handleCopy} title="Copy presentation link">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy Link"}
          </button>
          <button className="ps-btn ps-btn--secondary ps-btn--medium" onClick={handleOpen} title="Open presentation screen">
            <ExternalLink size={14} />
            Launch Screen
          </button>
        </div>
        <p className="ps-launch-note">
          If a second display is connected, Launch Screen opens there. The same link still works on another laptop or inside an OBS Browser Source.
        </p>
        <div className="ps-viewers">
          <Users size={14} />
          <span>Connected screens: {settings.connectedViewers}</span>
      </div>
    </div>
  );
}

export default function PresentationSetupPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PresentationSettings>(() =>
    normalizeLinkOnlySettings(getPresentationSettings()),
  );

  useEffect(() => {
    let cancelled = false;

    const syncRemoteStatus = async () => {
      const nextSettings = normalizeLinkOnlySettings(getPresentationSettings());
      const [remoteInfo, nextViewerCount] = await Promise.all([
        syncPresentationRemoteAccessInfo(nextSettings.sessionId),
        fetchPresentationViewerCount(nextSettings.sessionId).catch(() => 0),
      ]);

      if (cancelled) return;

      setSettings({
        ...nextSettings,
        presentationLink: remoteInfo.link,
        connectedViewers: nextViewerCount,
      });
    };

    void syncRemoteStatus();

    const interval = window.setInterval(() => {
      void syncRemoteStatus();
    }, 5000);

    const handleRefresh = () => {
      void syncRemoteStatus();
    };

    window.addEventListener("focus", handleRefresh);
    window.addEventListener("storage", handleRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("storage", handleRefresh);
    };
  }, []);

  const handleUpdate = useCallback((patch: Partial<PresentationSettings>) => {
    setSettings((prev) => {
      const updated = normalizeLinkOnlySettings({ ...prev, ...patch });
      savePresentationSettings(updated);
      return updated;
    });
  }, []);

  const handleContinue = useCallback(() => {
    savePresentationSettings(normalizeLinkOnlySettings(settings));
    navigate("/hub?mode=live");
  }, [navigate, settings]);

  return (
    <div className="ps-page">
      <div className="ps-container">
        <div className="ps-header">
          <h1 className="ps-title">Presentation Screen Setup</h1>
          <p className="ps-subtitle">
            Keep it simple: launch a dedicated presentation screen on this computer, or copy the same link to another laptop.
          </p>
        </div>

        <div className="ps-section">
          <SectionHeader number={1} title="Presentation link" />
          <PresentationLinkCard settings={settings} onUpdate={handleUpdate} />
        </div>

        <div className="ps-section">
          <SectionHeader number={2} title="How to use it" />
          <div className="ps-config-card">
            <div className="ps-guide-list">
              <div className="ps-guide-item">
                <strong>Browser on another laptop</strong>
                <span>Copy the link, open it there, and keep that page fullscreen on the projector or extended display.</span>
              </div>
              <div className="ps-guide-item">
                <strong>OBS on another laptop</strong>
                <span>Paste the same link into an OBS Browser Source if you want that laptop to manage the presentation from OBS.</span>
              </div>
              <div className="ps-guide-item">
                <strong>Holyrics-style screen</strong>
                <span>Yes. Launch Screen opens a dedicated presentation window, and if an external display is connected it opens there automatically.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="ps-footer">
          <button className="ps-btn ps-btn--primary ps-btn--large" onClick={handleContinue} title="Open presentation hub">
            Open Presentation Hub
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
