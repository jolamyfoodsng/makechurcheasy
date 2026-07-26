import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Loader2,
  MonitorUp,
  PlugZap,
  RefreshCw,
  Router,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";

import DockPage from "../dock/DockPage";
import { dockObsClient, type DockObsStatus } from "../dock/dockObsClient";
import { setOverlayBaseUrlOverride } from "../services/overlayUrl";
import { normalizeOBSWebSocketUrl } from "../services/obsWebSocketUrl";

import "./PresentationSetupPage.css";

const REMOTE_PRESENTATION_SETTINGS_KEY = "mce-remote-presentation-obs";
const PREVIEW_POLL_MS = 2500;

type RemotePresentationSettings = {
  host: string;
  port: string;
  password: string;
  url: string;
};

type PreviewSnapshot = {
  sceneName: string;
  imageData: string | null;
  studioModeEnabled: boolean;
};

type ObsSceneResponse = {
  currentPreviewSceneName?: string;
  currentProgramSceneName?: string;
  sceneName?: string;
};

type RemoteObsCandidate = {
  host: string;
  port: number;
  url: string;
  label: string;
};

type RemoteObsDiscoveryResult = {
  localIp: string;
  subnet: string;
  port: number;
  candidates: RemoteObsCandidate[];
};

type LanOverlayInfo = {
  ip: string;
  port: number;
  baseUrl: string;
};

function loadRemotePresentationSettings(): RemotePresentationSettings {
  try {
    const raw = localStorage.getItem(REMOTE_PRESENTATION_SETTINGS_KEY);
    if (!raw) throw new Error("No saved settings");
    const parsed = JSON.parse(raw) as Partial<RemotePresentationSettings>;
    return {
      host: parsed.host || "",
      port: parsed.port || "4455",
      password: parsed.password || "",
      url: parsed.url || "",
    };
  } catch {
    return { host: "", port: "4455", password: "", url: "" };
  }
}

function saveRemotePresentationSettings(settings: RemotePresentationSettings): void {
  try {
    localStorage.setItem(REMOTE_PRESENTATION_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can fail in embedded browser contexts; connection still works for this session.
  }
}

function buildRemoteObsUrl(host: string, port: string): string {
  const trimmedHost = host.trim();
  const trimmedPort = port.trim() || "4455";

  if (!trimmedHost) return "";
  if (/^wss?:\/\//i.test(trimmedHost)) return normalizeOBSWebSocketUrl(trimmedHost);
  if (/^\d{2,5}$/.test(trimmedHost)) return normalizeOBSWebSocketUrl(trimmedHost);

  const withoutProtocol = trimmedHost
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/\/.*$/, "");

  const hasPort = /:\d{2,5}$/.test(withoutProtocol);
  return normalizeOBSWebSocketUrl(`${withoutProtocol}${hasPort ? "" : `:${trimmedPort}`}`);
}

function getStatusLabel(status: DockObsStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "error":
      return "Connection failed";
    default:
      return "Not connected";
  }
}

function RemoteObsConnectPanel({
  settings,
  status,
  error,
  discovering,
  discoveryResult,
  discoveryError,
  onChange,
  onConnect,
  onDiscover,
  onSelectCandidate,
  onBack,
}: {
  settings: RemotePresentationSettings;
  status: DockObsStatus;
  error: string;
  discovering: boolean;
  discoveryResult: RemoteObsDiscoveryResult | null;
  discoveryError: string;
  onChange: (settings: RemotePresentationSettings) => void;
  onConnect: () => void;
  onDiscover: () => void;
  onSelectCandidate: (candidate: RemoteObsCandidate) => void;
  onBack: () => void;
}) {
  const connecting = status === "connecting";
  const remoteUrl = useMemo(() => buildRemoteObsUrl(settings.host, settings.port), [settings.host, settings.port]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConnect();
  };

  return (
    <div className="remote-presentation-page remote-presentation-page--centered">
      <button type="button" className="remote-back-button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back
      </button>

      <section className="remote-connect-card" aria-labelledby="remote-presentation-title">
        <div className="remote-connect-card__icon">
          <MonitorUp size={32} />
        </div>

        <div className="remote-connect-card__header">
          <p className="remote-eyebrow">Remote Presentation</p>
          <h1 id="remote-presentation-title">Connect to OBS on another laptop</h1>
          <p>
            This presentation page does not use OBS on this computer. Enter the IP address of the laptop running OBS, then continue to the dock controls.
          </p>
        </div>

        <form className="remote-connect-form" onSubmit={submit}>
          <label className="remote-field">
            <span>OBS laptop IP address</span>
            <input
              value={settings.host}
              onChange={(event) => onChange({ ...settings, host: event.target.value })}
              placeholder="Enter OBS laptop IP, e.g. 192.168.1.25"
              autoComplete="off"
              autoFocus
            />
          </label>

          <div className="remote-connect-form__grid">
            <label className="remote-field">
              <span>OBS WebSocket port</span>
              <input
                value={settings.port}
                onChange={(event) => onChange({ ...settings, port: event.target.value })}
                placeholder="4455"
                inputMode="numeric"
                autoComplete="off"
              />
            </label>

            <label className="remote-field">
              <span>Password (Optional)</span>
              <input
                value={settings.password}
                onChange={(event) => onChange({ ...settings, password: event.target.value })}
                placeholder="Enter OBS WebSocket password"
                type="password"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="remote-url-preview">
            <Wifi size={16} />
            <span>{remoteUrl || "ws://192.168.1.25:4455"}</span>
          </div>

          <div className="remote-connect-actions">
            <button
              className="remote-secondary-button remote-discover-button"
              type="button"
              disabled={connecting || discovering}
              onClick={onDiscover}
            >
              {discovering ? <Loader2 className="remote-spin" size={18} /> : <Router size={18} />}
              {discovering ? "Scanning network..." : "Find OBS Automatically"}
            </button>

            <button className="remote-primary-button" type="submit" disabled={connecting || !settings.host.trim()}>
              {connecting ? <Loader2 className="remote-spin" size={20} /> : <PlugZap size={20} />}
              {connecting ? "Connecting To Remote OBS..." : "Connect To Remote OBS"}
            </button>
          </div>

          {(discoveryResult || discoveryError) ? (
            <div className="remote-discovery-panel">
              {discoveryError ? (
                <span className="remote-discovery-message">{discoveryError}</span>
              ) : discoveryResult ? (
                <>
                  <div className="remote-discovery-header">
                    <strong>
                      {discoveryResult.candidates.length
                        ? `Found ${discoveryResult.candidates.length} possible OBS server${discoveryResult.candidates.length === 1 ? "" : "s"}`
                        : "No OBS server found"}
                    </strong>
                    <span>Scanned {discoveryResult.subnet} on port {discoveryResult.port}</span>
                  </div>

                  {discoveryResult.candidates.length ? (
                    <div className="remote-discovery-list">
                      {discoveryResult.candidates.map((candidate) => (
                        <button
                          key={candidate.url}
                          type="button"
                          className="remote-discovery-candidate"
                          onClick={() => onSelectCandidate(candidate)}
                        >
                          <MonitorUp size={18} />
                          <span>{candidate.host}</span>
                          <small>{candidate.url}</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="remote-discovery-message">
                      Make sure both laptops are on the same Wi-Fi and OBS WebSocket Server is enabled.
                    </span>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="remote-connect-alert" role="alert">
              <ShieldCheck size={16} />
              <span>{error}</span>
            </div>
          ) : null}
        </form>

        <div className="remote-connect-steps">
          <div>
            <strong>On Laptop 2</strong>
            <span>Open OBS → Tools → WebSocket Server Settings → Enable server.</span>
          </div>
          <div>
            <strong>On Laptop 1</strong>
            <span>Use the Laptop 2 IP address. Both laptops must be on the same network.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function RemotePreviewPanel({
  status,
  targetUrl,
  overlayBaseUrl,
}: {
  status: DockObsStatus;
  targetUrl: string;
  overlayBaseUrl: string;
}) {
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const refreshPreview = useCallback(async () => {
    if (status !== "connected") return;

    setLoading(true);
    setPreviewError("");

    try {
      const studio = await dockObsClient.call("GetStudioModeEnabled") as { studioModeEnabled?: boolean };
      const studioModeEnabled = Boolean(studio.studioModeEnabled);
      const sceneResponse = studioModeEnabled
        ? await dockObsClient.call("GetCurrentPreviewScene") as ObsSceneResponse
        : await dockObsClient.call("GetCurrentProgramScene") as ObsSceneResponse;

      const sceneName = (
        sceneResponse.currentPreviewSceneName ||
        sceneResponse.currentProgramSceneName ||
        sceneResponse.sceneName ||
        ""
      ).trim();

      if (!sceneName) {
        setSnapshot(null);
        setPreviewError("OBS did not return an active scene.");
        return;
      }

      const imageResponse = await dockObsClient.call("GetSourceScreenshot", {
        sourceName: sceneName,
        imageFormat: "png",
        imageWidth: 960,
      }) as { imageData?: string };

      setSnapshot({
        sceneName,
        studioModeEnabled,
        imageData: imageResponse.imageData || null,
      });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Could not load OBS preview.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refreshPreview();
    if (status !== "connected") return;
    const interval = window.setInterval(() => {
      void refreshPreview();
    }, PREVIEW_POLL_MS);
    return () => window.clearInterval(interval);
  }, [refreshPreview, status]);

  return (
    <aside className="remote-preview-panel" aria-label="Remote OBS preview">
      <div className="remote-preview-panel__header">
        <div>
          <p className="remote-eyebrow">Remote OBS Preview</p>
          <h2>{snapshot?.sceneName || "Waiting for scene"}</h2>
        </div>
        <button type="button" className="remote-icon-button" onClick={() => void refreshPreview()} title="Refresh preview">
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="remote-preview-meta">
        <span className={`remote-status-pill remote-status-pill--${status}`}>
          {status === "connected" ? <CheckCircle2 size={16} /> : <Router size={16} />}
          {getStatusLabel(status)}
        </span>
        <span>{targetUrl}</span>
        {overlayBaseUrl ? <span>Overlay: {overlayBaseUrl}</span> : null}
        {snapshot ? <span>{snapshot.studioModeEnabled ? "Preview scene" : "Program scene"}</span> : null}
      </div>

      <div className="remote-preview-stage">
        {snapshot?.imageData ? (
          <img src={snapshot.imageData} alt={`Remote OBS ${snapshot.sceneName} preview`} />
        ) : loading ? (
          <div className="remote-preview-skeleton" aria-label="Loading OBS preview" />
        ) : (
          <div className="remote-preview-empty">
            <Eye size={48} />
            <strong>No preview yet</strong>
            <span>{previewError || "Connect to remote OBS and push content from the dock controls."}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function PresentationSetupPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<RemotePresentationSettings>(() => loadRemotePresentationSettings());
  const [status, setStatus] = useState<DockObsStatus>("disconnected");
  const [error, setError] = useState("");
  const [connectedUrl, setConnectedUrl] = useState(settings.url);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<RemoteObsDiscoveryResult | null>(null);
  const [discoveryError, setDiscoveryError] = useState("");
  const [remoteOverlayBaseUrl, setRemoteOverlayBaseUrl] = useState("");

  useEffect(() => {
    const unsubscribe = dockObsClient.onStatusChange((nextStatus, nextError) => {
      setStatus(nextStatus);
      if (nextError) setError(nextError);
      if (nextStatus === "connected") setError("");
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      setOverlayBaseUrlOverride(null);
    };
  }, []);

  const updateSettings = useCallback((nextSettings: RemotePresentationSettings) => {
    setSettings(nextSettings);
    saveRemotePresentationSettings(nextSettings);
  }, []);

  const handleSelectCandidate = useCallback((candidate: RemoteObsCandidate) => {
    updateSettings({
      ...settings,
      host: candidate.host,
      port: String(candidate.port),
      url: candidate.url,
    });
    setError("");
  }, [settings, updateSettings]);

  const handleDiscover = useCallback(async () => {
    const parsedPort = Number.parseInt(settings.port.trim() || "4455", 10);
    const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4455;

    setDiscovering(true);
    setDiscoveryError("");
    setDiscoveryResult(null);
    setError("");

    try {
      const result = await invoke<RemoteObsDiscoveryResult>("discover_remote_obs_hosts", { port });
      setDiscoveryResult(result);

      if (result.candidates.length === 1) {
        const [candidate] = result.candidates;
        updateSettings({
          ...settings,
          host: candidate.host,
          port: String(candidate.port),
          url: candidate.url,
        });
      }
    } catch (discoverError) {
      setDiscoveryError(discoverError instanceof Error ? discoverError.message : "Could not scan this network for OBS.");
    } finally {
      setDiscovering(false);
    }
  }, [settings, updateSettings]);

  const handleConnect = useCallback(async () => {
    const url = buildRemoteObsUrl(settings.host, settings.port);
    if (!url) {
      setError("Enter the IP address of the laptop running OBS.");
      return;
    }

    setError("");
    setStatus("connecting");

    try {
      const overlayInfo = await invoke<LanOverlayInfo>("get_lan_overlay_info", {
        targetHost: settings.host.trim(),
      });
      setOverlayBaseUrlOverride(overlayInfo.baseUrl);
      setRemoteOverlayBaseUrl(overlayInfo.baseUrl);

      await dockObsClient.connect(url, settings.password || undefined, true, { persist: false });
      const nextSettings = { ...settings, url };
      saveRemotePresentationSettings(nextSettings);
      setSettings(nextSettings);
      setConnectedUrl(url);
      setStatus("connected");
    } catch (connectError) {
      setOverlayBaseUrlOverride(null);
      setRemoteOverlayBaseUrl("");
      await dockObsClient.disconnect().catch(() => undefined);
      setStatus("error");
      setError(connectError instanceof Error ? connectError.message : "Could not connect to remote OBS.");
    }
  }, [settings]);

  const handleBack = useCallback(() => {
    setOverlayBaseUrlOverride(null);
    setRemoteOverlayBaseUrl("");
    void dockObsClient.disconnect();
    navigate("/", { replace: false });
  }, [navigate]);

  if (status !== "connected") {
    return (
      <RemoteObsConnectPanel
        settings={settings}
        status={status}
        error={error}
        discovering={discovering}
        discoveryResult={discoveryResult}
        discoveryError={discoveryError}
        onChange={updateSettings}
        onConnect={handleConnect}
        onDiscover={handleDiscover}
        onSelectCandidate={handleSelectCandidate}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="remote-presentation-page remote-presentation-page--workspace">
      <header className="remote-presentation-header">
        <div className="remote-presentation-header__main">
          <button type="button" className="remote-icon-button" onClick={handleBack} title="Back to main app" aria-label="Back to main app">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="remote-eyebrow">Remote Presentation</p>
            <h1>Control OBS on another laptop</h1>
            <p>Use the dock controls below. All OBS actions are sent to the remote OBS WebSocket target, not the OBS on this computer.</p>
          </div>
        </div>
        <button
          type="button"
          className="remote-secondary-button"
          onClick={() => {
            setOverlayBaseUrlOverride(null);
            setRemoteOverlayBaseUrl("");
            void dockObsClient.disconnect();
            setStatus("disconnected");
          }}
        >
          Change Remote OBS
        </button>
      </header>

      <main className="remote-presentation-workspace">
        <section className="remote-dock-panel" aria-label="Remote dock controls">
          <DockPage externalObsSession presentationBibleLmSplit />
        </section>
        <RemotePreviewPanel status={status} targetUrl={connectedUrl} overlayBaseUrl={remoteOverlayBaseUrl} />
      </main>
    </div>
  );
}
