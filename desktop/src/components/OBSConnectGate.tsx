import { useState, useEffect, useRef } from "react";
import { obsService, type ConnectionStatus } from "../services/obsService";
import { loadData, updateData } from "../services/store";
import { getDefaultOBSUrl } from "../services/desktopConfig";
import Icon from "./Icon";

interface Props {
  children: React.ReactNode;
}

export function OBSConnectGate({ children }: Props) {
  const [, setStatus] = useState<ConnectionStatus>(obsService.status);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState(getDefaultOBSUrl());
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [, setAutoConnectTried] = useState(false);
  const [showConnectPanel, setShowConnectPanel] = useState(false);
  const autoConnectRef = useRef(false);

  // Subscribe to OBS status changes
  useEffect(() => {
    const unsub = obsService.onStatusChange((s, err) => {
      setStatus(s);
      if (err) setError(err);
    });
    setStatus(obsService.status);

    // Listen for custom event to show connection panel
    const handleShowConnectPanel = () => {
      setShowConnectPanel(true);
    };

    window.addEventListener('showOBSConnectPanel', handleShowConnectPanel);

    return () => {
      unsub();
      window.removeEventListener('showOBSConnectPanel', handleShowConnectPanel);
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnectRef.current) return;
    autoConnectRef.current = true;

    (async () => {
      try {
        const data = await loadData();
        const { url: savedUrl, password: savedPw, autoConnect } = data.obsWebSocket;

        if (savedUrl) setUrl(savedUrl);
        if (savedPw) setPassword(savedPw);

        if (autoConnect && savedUrl) {
          setConnecting(true);
          setError(null);
          try {
            await obsService.connect(savedUrl, savedPw || undefined);
            await updateData({
              obsWebSocket: { url: savedUrl, password: savedPw, autoConnect: true },
            });
          } catch {
            // Failed
          } finally {
            setConnecting(false);
          }
        }
      } catch {
        // Store read failed
      } finally {
        setAutoConnectTried(true);
      }
    })();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connecting) return;

    setConnecting(true);
    setError(null);

    try {
      await obsService.connect(url, password || undefined);
      await updateData({
        obsWebSocket: { url, password, autoConnect: true },
      });
      setShowConnectPanel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  // Always render children
  return (
    <>
      {children}

      {/* Connection Modal */}
      {showConnectPanel && (
        <div
          className="obs-connect-backdrop"
          onClick={() => setShowConnectPanel(false)}
        >
          <div
            className="obs-connect-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Connect to OBS"
          >
            <button
              type="button"
              className="obs-connect-panel__close"
              onClick={() => setShowConnectPanel(false)}
              aria-label="Close"
             title="Close">
              <Icon name="close" size={18} />
            </button>

            <div className="obs-connect-panel__header">
              <div className="obs-connect-panel__icon">
                <Icon name="cast" size={24} />
              </div>
              <h2 className="obs-connect-panel__title">Connect to OBS</h2>
              <p className="obs-connect-panel__subtitle">
                Enable WebSocket to control OBS remotely
              </p>
            </div>

            <div className="obs-connect-panel__steps">
              <h3 className="obs-connect-panel__steps-title">Setup Instructions</h3>
              <ol className="obs-connect-panel__steps-list">
                <li className="obs-connect-panel__step">
                  <span className="obs-connect-panel__step-num">1</span>
                  <div className="obs-connect-panel__step-content">
                    <strong>Open OBS Studio</strong>
                    <span className="obs-connect-panel__step-desc">Launch OBS on your computer</span>
                  </div>
                </li>
                <li className="obs-connect-panel__step">
                  <span className="obs-connect-panel__step-num">2</span>
                  <div className="obs-connect-panel__step-content">
                    <strong>Go to Tools → Settings</strong>
                    <span className="obs-connect-panel__step-desc">Access OBS settings from the menu bar</span>
                  </div>
                </li>
                <li className="obs-connect-panel__step">
                  <span className="obs-connect-panel__step-num">3</span>
                  <div className="obs-connect-panel__step-content">
                    <strong>Open WebSocket Server Settings</strong>
                    <span className="obs-connect-panel__step-desc">Find "WebSocket Server Settings" in the left sidebar</span>
                  </div>
                </li>
                <li className="obs-connect-panel__step">
                  <span className="obs-connect-panel__step-num">4</span>
                  <div className="obs-connect-panel__step-content">
                    <strong>Enable WebSocket server</strong>
                    <span className="obs-connect-panel__step-desc">Check the box and set a password (optional)</span>
                  </div>
                </li>
                <li className="obs-connect-panel__step">
                  <span className="obs-connect-panel__step-num">5</span>
                  <div className="obs-connect-panel__step-content">
                    <strong>Click Apply → OK</strong>
                    <span className="obs-connect-panel__step-desc">Save your settings</span>
                  </div>
                </li>
              </ol>
            </div>

            <div className="obs-connect-panel__divider" />

            <form onSubmit={handleConnect} className="obs-connect-panel__form">
              <div className="obs-field">
                <label>Server URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="ws://localhost:4455"
                />
              </div>
              <div className="obs-field">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              {error && <div className="obs-error">{error}</div>}
              <button type="submit" disabled={connecting} className="obs-connect-panel__connect-btn" title="Connect">
                {connecting ? "Connecting..." : "Connect to OBS"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
