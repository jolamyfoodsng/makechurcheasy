import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  Minus,
  MonitorUp,
  Pause,
  Play,
  PlugZap,
  Plus,
  RefreshCw,
  RotateCcw,
  Router,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";

import DockPage from "../dock/DockPage";
import type { DockTab } from "../dock/dockTypes";
import { dockObsClient, type DockObsStatus } from "../dock/dockObsClient";
import { setOverlayBaseUrlOverride } from "../services/overlayUrl";
import { normalizeOBSWebSocketUrl } from "../services/obsWebSocketUrl";
import {
  getPresentationSettings,
  regenerateSession,
  type PresentationSettings,
} from "../services/presentationSettings";
import {
  readPresentationScreenZoom,
  savePresentationScreenZoom,
} from "../services/presentationPublish";
import { syncPresentationRemoteAccessInfo } from "../services/presentationRemote";
import {
  EMPTY_PRESENTATION_REMOTE_STATE,
  fetchPresentationState,
  publishPresentationState,
  readLocalPresentationState,
  subscribeLocalPresentationState,
  type PresentationRemoteState,
} from "../services/presentationState";
import { launchPresentationScreen } from "../services/presentationWindow";
import type { PresentationMediaPlaybackState, PresentationRemoteItem } from "../presentation/types";

import "./PresentationSetupPage.css";

const REMOTE_PRESENTATION_SETTINGS_KEY = "mce-remote-presentation-obs";
const PREVIEW_POLL_MS = 2500;
const PRESENTATION_ZOOM_STEP = 0.1;
const PRESENTATION_PREVIEW_WIDTH = 1280;
const PRESENTATION_PREVIEW_HEIGHT = 720;

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

type PresentationSetupView = "choose" | "remote-obs" | "link";

function clampPresentationPanelZoom(value: number): number {
  return Math.max(0.8, Math.min(1.8, Math.round(value * 100) / 100));
}

function getFallbackVideoPlayback(): PresentationMediaPlaybackState {
  return {
    playing: true,
    muted: true,
    volume: 1,
    loop: true,
    positionSeconds: 0,
    version: Date.now(),
  };
}

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

function PresentationModeChooser({
  onBack,
  onUseBrowserLink,
  onUseRemoteObs,
}: {
  onBack: () => void;
  onUseBrowserLink: () => void;
  onUseRemoteObs: () => void;
}) {
  return (
    <div className="remote-presentation-page remote-presentation-page--centered">
      <button type="button" className="remote-back-button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back
      </button>

      <section className="remote-connect-card remote-connect-card--choice" aria-labelledby="presentation-choice-title">
        <div className="remote-connect-card__header">
          <p className="remote-eyebrow">Presentation</p>
          <h1 id="presentation-choice-title">Choose how you want to show the presentation</h1>
          <p>
            Use the same dock controls, then choose whether the live screen should update a browser link or control OBS on another laptop.
          </p>
        </div>

        <div className="remote-choice-grid">
          <article className="remote-choice-card">
            <div className="remote-choice-card__icon">
              <ExternalLink size={28} />
            </div>
            <div className="remote-choice-card__body">
              <h2>Presentation Link</h2>
              <p>
                Use the same dock page on this laptop. Copy the generated link and open it on another laptop, browser tab, or projector screen.
              </p>
            </div>
            <ul className="remote-choice-card__list">
              <li>Same Bible, worship, media, and ministry dock</li>
              <li>Updates a browser presentation link</li>
              <li>No OBS connection required for this option</li>
            </ul>
            <button type="button" className="remote-primary-button" onClick={onUseBrowserLink}>
              <ExternalLink size={18} />
              Use Dock With Link
            </button>
          </article>

          <article className="remote-choice-card">
            <div className="remote-choice-card__icon remote-choice-card__icon--obs">
              <MonitorUp size={28} />
            </div>
            <div className="remote-choice-card__body">
              <h2>OBS On Another Laptop</h2>
              <p>
                Use this when OBS is running on Laptop 2. Connect to that OBS WebSocket target, then control it from this laptop.
              </p>
            </div>
            <ul className="remote-choice-card__list">
              <li>Connect to OBS on the second laptop</li>
              <li>Use dock-style remote controls</li>
              <li>Best for OBS-based broadcast output</li>
            </ul>
            <button type="button" className="remote-secondary-button remote-choice-card__button" onClick={onUseRemoteObs}>
              <MonitorUp size={18} />
              Set Up Remote OBS
            </button>
          </article>
        </div>
      </section>
    </div>
  );
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

function PresentationLinkPanel({
  showScreenZoom,
}: {
  showScreenZoom: boolean;
}) {
  const [session, setSession] = useState<PresentationSettings>(() => getPresentationSettings());
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [remoteState, setRemoteState] = useState<PresentationRemoteState | null>(null);
  const [zoom, setZoom] = useState(() => readPresentationScreenZoom());
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0.25);

  const currentItem = remoteState?.fullscreen ?? null;
  const currentVideoItem =
    currentItem?.media?.kind === "video" || Boolean(currentItem?.videoUrl)
      ? currentItem
      : null;
  const currentVideoPlayback = currentVideoItem?.media?.playback ?? getFallbackVideoPlayback();

  const refreshLink = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const info = await syncPresentationRemoteAccessInfo(session.sessionId);
      const next = getPresentationSettings();
      setSession(next);
      setMessage(info.running ? "Presentation link is ready on this network." : "Presentation link is ready locally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh the presentation link.");
    } finally {
      setBusy(false);
    }
  }, [session.sessionId]);

  useEffect(() => {
    void refreshLink();
  }, [refreshLink]);

  useEffect(() => {
    const node = previewStageRef.current;
    if (!node) return undefined;

    const updateScale = () => {
      const rect = node.getBoundingClientRect();
      const next = Math.max(
        0.1,
        Math.min(rect.width / PRESENTATION_PREVIEW_WIDTH, rect.height / PRESENTATION_PREVIEW_HEIGHT),
      );
      setPreviewScale((previous) => Math.abs(previous - next) < 0.001 ? previous : next);
    };

    updateScale();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScale);
    observer?.observe(node);
    window.addEventListener("resize", updateScale);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchPresentationState(session.sessionId)
      .then((state) => {
        if (!cancelled) setRemoteState(state);
      })
      .catch(() => {
        if (!cancelled) setRemoteState(null);
      });

    const unsubscribe = subscribeLocalPresentationState(session.sessionId, (state) => {
      setRemoteState(state);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [session.sessionId]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(session.presentationLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [session.presentationLink]);

  const handleLaunch = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await launchPresentationScreen(session.sessionId, session.presentationLink);
      setMessage(`Screen opened on ${result.monitorName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not launch the presentation screen.");
    } finally {
      setBusy(false);
    }
  }, [session.presentationLink, session.sessionId]);

  const handleRegenerate = useCallback(async () => {
    const next = regenerateSession();
    setSession(next);
    setCopied(false);
    setMessage(`Presentation link changed to ${next.publicToken}.`);
  }, []);

  const updateLiveItem = useCallback(
    async (updater: (item: PresentationRemoteItem) => PresentationRemoteItem) => {
      const baseState =
        remoteState ??
        readLocalPresentationState(session.sessionId) ??
        (await fetchPresentationState(session.sessionId)) ??
        EMPTY_PRESENTATION_REMOTE_STATE(session.sessionId);
      const item = baseState.fullscreen;
      if (!item) return;

      const nextState: PresentationRemoteState = {
        ...baseState,
        sessionId: session.sessionId,
        fullscreen: updater(item),
        lowerThird: null,
        updatedAt: Date.now(),
      };
      setRemoteState(nextState);
      await publishPresentationState(nextState);
    },
    [remoteState, session.sessionId],
  );

  const handleZoomChange = useCallback(
    (nextValue: number) => {
      const next = savePresentationScreenZoom(clampPresentationPanelZoom(nextValue));
      setZoom(next);
      void updateLiveItem((item) => ({
        ...item,
        meta: {
          ...item.meta,
          zoom: next,
        },
      })).catch((error) => {
        console.warn("[PresentationSetup] Failed to update presentation zoom:", error);
      });
    },
    [updateLiveItem],
  );

  const updateVideoPlayback = useCallback(
    (patch: Partial<PresentationMediaPlaybackState>) => {
      void updateLiveItem((item) => {
        if (!item.media && !item.videoUrl) return item;
        const playback = item.media?.playback ?? getFallbackVideoPlayback();
        const volume = patch.volume == null
          ? playback.volume
          : Math.max(0, Math.min(1, Number(patch.volume)));
        return {
          ...item,
          media: {
            kind: item.media?.kind ?? "video",
            url: item.media?.url ?? item.videoUrl ?? "",
            posterUrl: item.media?.posterUrl,
            fit: item.media?.fit ?? "fill",
            backgroundColor: item.media?.backgroundColor ?? "#000000",
            playback: {
              ...playback,
              ...patch,
              volume,
              muted: patch.muted ?? (volume === 0 ? true : playback.muted),
              version: Date.now(),
            },
          },
          videoUrl: item.videoUrl,
        };
      }).catch((error) => {
        console.warn("[PresentationSetup] Failed to update video playback:", error);
      });
    },
    [updateLiveItem],
  );

  return (
    <aside className="remote-preview-panel remote-link-panel" aria-label="Presentation link">
      <div className="remote-preview-panel__header">
        <div>
          <p className="remote-eyebrow">Browser Link</p>
          <h2>Presentation screen</h2>
        </div>
        <button type="button" className="remote-icon-button" onClick={() => void refreshLink()} disabled={busy} title="Refresh link">
          {busy ? <Loader2 className="remote-spin" size={20} /> : <RefreshCw size={20} />}
        </button>
      </div>

      <div className="remote-link-body">
        <div className="remote-link-stage" ref={previewStageRef}>
          <iframe
            key={session.sessionId}
            className="remote-link-preview-frame"
            src={session.presentationLink}
            title="Presentation screen live preview"
            style={{
              width: PRESENTATION_PREVIEW_WIDTH,
              height: PRESENTATION_PREVIEW_HEIGHT,
              transform: `scale(${previewScale})`,
            }}
          />
        </div>

        <div className="remote-link-control-bar" aria-label="Presentation screen controls">
          {showScreenZoom ? (
            <div className="remote-link-control-group">
              <div className="remote-link-control-heading">
                <span>Screen zoom</span>
                <strong>{Math.round(zoom * 100)}%</strong>
              </div>
              <div className="remote-link-zoom-row">
                <button
                  type="button"
                  className="remote-mini-control"
                  onClick={() => handleZoomChange(zoom - PRESENTATION_ZOOM_STEP)}
                  disabled={zoom <= 0.8}
                  title="Zoom out"
                >
                  <Minus size={16} />
                </button>
                <input
                  className="remote-link-zoom-slider"
                  type="range"
                  min="0.8"
                  max="1.8"
                  step="0.05"
                  value={zoom}
                  onChange={(event) => handleZoomChange(Number(event.target.value))}
                  aria-label="Presentation screen zoom"
                />
                <button
                  type="button"
                  className="remote-mini-control"
                  onClick={() => handleZoomChange(zoom + PRESENTATION_ZOOM_STEP)}
                  disabled={zoom >= 1.8}
                  title="Zoom in"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          ) : null}

          {currentVideoItem ? (
            <div className="remote-link-control-group">
              <div className="remote-link-control-heading">
                <span>Video</span>
                <strong>{currentVideoPlayback.muted ? "Muted" : `${Math.round((currentVideoPlayback.volume ?? 1) * 100)}%`}</strong>
              </div>
              <div className="remote-video-controls">
                <button
                  type="button"
                  className="remote-mini-control remote-mini-control--wide"
                  onClick={() => updateVideoPlayback({ playing: !currentVideoPlayback.playing })}
                  title={currentVideoPlayback.playing ? "Pause video" : "Play video"}
                >
                  {currentVideoPlayback.playing ? <Pause size={16} /> : <Play size={16} />}
                  <span>{currentVideoPlayback.playing ? "Pause" : "Play"}</span>
                </button>
                <button
                  type="button"
                  className="remote-mini-control"
                  onClick={() => updateVideoPlayback({ playing: true, positionSeconds: 0 })}
                  title="Restart video"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  type="button"
                  className="remote-mini-control"
                  onClick={() => updateVideoPlayback({ muted: !currentVideoPlayback.muted })}
                  title={currentVideoPlayback.muted ? "Unmute video" : "Mute video"}
                >
                  {currentVideoPlayback.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  className="remote-video-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={currentVideoPlayback.volume ?? 1}
                  onChange={(event) => updateVideoPlayback({
                    volume: Number(event.target.value),
                    muted: Number(event.target.value) <= 0,
                  })}
                  aria-label="Presentation video volume"
                />
              </div>
            </div>
          ) : null}
        </div>

        <label className="remote-link-field">
          <span>Presentation link</span>
          <input readOnly value={session.presentationLink} />
        </label>

        <div className="remote-link-actions">
          <button type="button" className="remote-primary-button" onClick={() => void handleCopy()}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? "Copied" : "Copy Link"}
          </button>
          <button type="button" className="remote-secondary-button" onClick={() => void handleLaunch()} disabled={busy}>
            <ExternalLink size={18} />
            Launch Screen
          </button>
          <button type="button" className="remote-secondary-button" onClick={() => void handleRegenerate()}>
            <RotateCcw size={18} />
            Change Link
          </button>
        </div>

        {message ? (
          <div className="remote-link-message" role="status">
            <Wifi size={16} />
            <span>{message}</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default function PresentationSetupPage({
  initialView = "choose",
}: {
  initialView?: PresentationSetupView;
}) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<RemotePresentationSettings>(() => loadRemotePresentationSettings());
  const [status, setStatus] = useState<DockObsStatus>("disconnected");
  const [error, setError] = useState("");
  const [connectedUrl, setConnectedUrl] = useState(settings.url);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<RemoteObsDiscoveryResult | null>(null);
  const [discoveryError, setDiscoveryError] = useState("");
  const [linkDockActiveTab, setLinkDockActiveTab] = useState<DockTab>("bible");
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

  const handleBackHome = useCallback(() => {
    navigate("/", { replace: false });
  }, [navigate]);

  const handleBackToPresentationOptions = useCallback(() => {
    setOverlayBaseUrlOverride(null);
    setRemoteOverlayBaseUrl("");
    void dockObsClient.disconnect();
    setStatus("disconnected");
    setError("");
    navigate("/presentation", { replace: false });
  }, [navigate]);

  const handleUseBrowserLink = useCallback(() => {
    navigate("/presentation/link", { replace: false });
  }, [navigate]);

  const handleUseRemoteObs = useCallback(() => {
    navigate("/presentation/remote-obs", { replace: false });
  }, [navigate]);

  if (initialView === "choose") {
    return (
      <PresentationModeChooser
        onBack={handleBackHome}
        onUseBrowserLink={handleUseBrowserLink}
        onUseRemoteObs={handleUseRemoteObs}
      />
    );
  }

  if (initialView === "link") {
    return (
      <div className="remote-presentation-page remote-presentation-page--workspace">
        <header className="remote-presentation-header">
          <div className="remote-presentation-header__main">
            <button type="button" className="remote-icon-button" onClick={handleBackToPresentationOptions} title="Back to presentation options" aria-label="Back to presentation options">
              <ArrowLeft size={20} />
            </button>
            <div>
              <p className="remote-eyebrow">Presentation Link</p>
              <h1>Use the dock with a browser link</h1>
              <p>Use the same dock controls below. Bible, worship, media, ministry, and countdown actions update the presentation link instead of OBS.</p>
            </div>
          </div>
        </header>

        <main className="remote-presentation-workspace remote-presentation-workspace--link">
          <section className="remote-dock-panel" aria-label="Presentation link dock controls">
            <DockPage
              presentationBibleLmSplit
              presentationOutputTarget="link"
              hideLowerThirdControls
              hideTickerControls
              hiddenTabs={["multiview"]}
              hideShellHeader
              onActiveTabChange={setLinkDockActiveTab}
            />
          </section>
          <PresentationLinkPanel showScreenZoom={linkDockActiveTab === "media"} />
        </main>
      </div>
    );
  }

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
        onBack={handleBackToPresentationOptions}
      />
    );
  }

  return (
    <div className="remote-presentation-page remote-presentation-page--workspace">
      <header className="remote-presentation-header">
        <div className="remote-presentation-header__main">
          <button type="button" className="remote-icon-button" onClick={handleBackToPresentationOptions} title="Back to presentation options" aria-label="Back to presentation options">
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
            setError("");
          }}
        >
          Change Remote OBS
        </button>
      </header>

      <main className="remote-presentation-workspace">
        <section className="remote-dock-panel" aria-label="Remote dock controls">
            <DockPage
              externalObsSession
              presentationBibleLmSplit
              presentationOutputTarget="obs"
              hideLowerThirdControls
              hideTickerControls
              hiddenTabs={["multiview"]}
              hideShellHeader
            />
        </section>
        <RemotePreviewPanel status={status} targetUrl={connectedUrl} overlayBaseUrl={remoteOverlayBaseUrl} />
      </main>
    </div>
  );
}
