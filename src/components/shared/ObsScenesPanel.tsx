import { useCallback, useMemo, useState } from "react";
import "./obs-scenes-panel.css";
import Icon from "../Icon";

export interface ObsSceneOption {
  sceneName: string;
  sceneIndex?: number;
}

type ObsSendMode = "scene" | "preview" | "program";

interface ObsScenesPanelProps {
  title?: string;
  description?: string;
  contentLabel?: string;
  connected: boolean;
  scenes: ObsSceneOption[];
  mainScene?: string;
  activeScene?: string;
  activeScenes?: string[];
  refreshing?: boolean;
  disabled?: boolean;
  sendLabel?: string;
  onRefresh?: () => void | Promise<void>;
  onSendToScene: (sceneName: string, mode: ObsSendMode) => void | Promise<void>;
}

type BroadcastStatus = "on-air" | "in-preview" | "off-air";

function getBroadcastStatus(
  sceneName: string,
  activeScene: string,
  activeScenes: string[],
  mainScene: string,
): BroadcastStatus {
  if (activeScenes.includes(sceneName)) return "on-air";
  if (sceneName === activeScene && activeScene !== "") return "on-air";
  if (sceneName === mainScene && mainScene !== "") return "in-preview";
  return "off-air";
}

export function ObsScenesPanel({
  title = "OBS Scenes",
  description,
  contentLabel = "overlay",
  connected,
  scenes,
  mainScene = "",
  activeScene = "",
  activeScenes = [],
  refreshing = false,
  disabled = false,
  sendLabel = "Push To OBS",
  onRefresh,
  onSendToScene,
}: ObsScenesPanelProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedScene, setExpandedScene] = useState<string | null>(null);

  const sortedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => {
      if (a.sceneName === mainScene) return -1;
      if (b.sceneName === mainScene) return 1;
      const ai = Number.isFinite(a.sceneIndex) ? (a.sceneIndex as number) : Number.MAX_SAFE_INTEGER;
      const bi = Number.isFinite(b.sceneIndex) ? (b.sceneIndex as number) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.sceneName.localeCompare(b.sceneName);
    });
  }, [scenes, mainScene]);

  const safeSend = useCallback(
    async (sceneName: string, mode: ObsSendMode, key: string) => {
      if (!sceneName) return;
      setBusyKey(key);
      try {
        await onSendToScene(sceneName, mode);
      } finally {
        setBusyKey(null);
      }
    },
    [onSendToScene],
  );

  return (
    <div className="obs-scenes-panel">
      <div className="obs-scenes-panel-head">
        <span className="obs-scenes-panel-title">
          <Icon name="movie" size={15} />
          {title}
        </span>
        {onRefresh && (
          <button
            type="button"
            className="obs-scenes-panel-refresh"
            onClick={() => { void onRefresh(); }}
            disabled={refreshing || Boolean(busyKey)}
            title="Refresh scenes"
          >
            <Icon name="refresh" size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : undefined }} />
          </button>
        )}
      </div>

      <p className="obs-scenes-panel-help">
        {description ?? `These are your current scenes in OBS. Send this ${contentLabel} to any specific scene.`}
      </p>

      {sortedScenes.length === 0 ? (
        <p className="obs-scenes-panel-empty">
          {connected ? "No scenes found in OBS." : "Connect to OBS to discover scenes."}
        </p>
      ) : (
        <div className="obs-scenes-panel-list">
          {sortedScenes.map((scene) => {
            const isServiceScene = scene.sceneName === mainScene && mainScene !== "";
            const sceneBusy = busyKey === `scene:${scene.sceneName}`;
            const status = getBroadcastStatus(scene.sceneName, activeScene, activeScenes, mainScene);
            const isExpanded = expandedScene === scene.sceneName;

            return (
              <div key={scene.sceneName} className={`obs-scenes-panel-item${isExpanded ? " obs-scenes-panel-item--expanded" : ""}`}>
                <Icon name={isServiceScene ? "star" : "videocam"} size={14} style={{ color: isServiceScene ? "#00E676" : "rgba(255, 255, 255, 0.35)" }} />
                <div className="obs-scenes-panel-item-meta">
                  <span className="obs-scenes-panel-item-name">{scene.sceneName}</span>
                  <span className={`obs-scenes-panel-status-badge obs-scenes-panel-status-badge--${status}`}>
                    {status === "on-air" ? "ON AIR" : status === "in-preview" ? "IN PREVIEW" : "OFF AIR"}
                  </span>
                </div>
                <div className="obs-scenes-panel-item-actions">
                  <button
                    type="button"
                    className="obs-scenes-panel-send-btn obs-scenes-panel-send-btn--preview"
                    onClick={() => { void safeSend(scene.sceneName, "preview", `preview:${scene.sceneName}`); }}
                    disabled={!connected || disabled || Boolean(busyKey)}
                    title="Send to Preview"
                  >
                    {sceneBusy ? "…" : "Preview"}
                  </button>
                  <button
                    type="button"
                    className="obs-scenes-panel-send-btn obs-scenes-panel-send-btn--program"
                    onClick={() => { void safeSend(scene.sceneName, "program", `program:${scene.sceneName}`); }}
                    disabled={!connected || disabled || Boolean(busyKey)}
                    title="Push to Program"
                  >
                    {sceneBusy ? "…" : "Program"}
                  </button>
                  <button
                    type="button"
                    className="obs-scenes-panel-advanced-toggle"
                    onClick={() => setExpandedScene(isExpanded ? null : scene.sceneName)}
                    title="Advanced settings"
                  >
                    <Icon name={isExpanded ? "expand_less" : "expand_more"} size={14} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="obs-scenes-panel-advanced-panel">
                    <button
                      type="button"
                      className="obs-scenes-panel-send-btn obs-scenes-panel-send-btn--scene"
                      onClick={() => { void safeSend(scene.sceneName, "scene", `scene:${scene.sceneName}`); }}
                      disabled={!connected || disabled || Boolean(busyKey)}
                    >
                      {sceneBusy ? "Sending…" : sendLabel}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
