import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isUserSelectableObsScene } from "../../services/dockSceneNames";
import { dockObsClient } from "../dockObsClient";
import type { DockSceneRoute, DockSceneRouteModule } from "../dockSceneRouting";
import { ensureObsConnected } from "../obsConnectionGuard";
import Icon from "../DockIcon";

interface Props {
  module: DockSceneRouteModule;
  route: DockSceneRoute;
  onRouteChange: (patch: Partial<DockSceneRoute>) => void;
  disabled?: boolean;
  title?: string;
  placement?: "above" | "below";
}

export default function DockSceneRoutingControl({
  module: _module,
  route,
  onRouteChange,
  disabled = false,
  title,
  placement = "below",
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controlRef = useRef<HTMLDivElement | null>(null);

  const loadScenes = useCallback(async () => {
    if (disabled) return;
    setLoading(true);
    setError("");
    try {
      await ensureObsConnected();
      const [sceneList, currentScene] = await Promise.all([
        dockObsClient.call("GetSceneList") as Promise<{ scenes?: Array<{ sceneName?: string | null }> }>,
        dockObsClient.call("GetCurrentProgramScene") as Promise<{ currentProgramSceneName?: string; sceneName?: string }>,
      ]);
      const currentName = String(currentScene.currentProgramSceneName || currentScene.sceneName || "").trim();
      const choices = (sceneList.scenes ?? [])
        .map((scene) => String(scene.sceneName || "").trim())
        .filter(isUserSelectableObsScene)
        .sort((a, b) => {
          if (a === currentName) return -1;
          if (b === currentName) return 1;
          return a.localeCompare(b);
        });
      setScenes(choices);
      if (route.enabled && !route.sceneName && choices[0]) {
        onRouteChange({ sceneName: choices[0] });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("media.unableToLoadScenes", "Unable to load OBS scenes."));
    } finally {
      setLoading(false);
    }
  }, [disabled, onRouteChange, route.enabled, route.sceneName, t]);

  useEffect(() => {
    if (open) void loadScenes();
  }, [loadScenes, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (disabled) return null;

  const label = title ?? t("sceneRouting.title", "Scene output");
  const summary = route.enabled && route.sceneName
    ? `${t("sceneRouting.to", "To")} ${route.sceneName}`
    : t("sceneRouting.presentation", "MCE Presentation");

  return (
    <div ref={controlRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className={`dock-btm-toolbar__icon-btn${route.enabled ? " dock-btm-toolbar__icon-btn--active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${label}: ${summary}`}
      >
        <Icon name="settings" size={14} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          style={{
            position: "absolute",
            ...(placement === "above"
              ? { bottom: "calc(100% + 6px)" }
              : { top: "calc(100% + 6px)" }),
            right: 0,
            zIndex: 80,
            width: 268,
            padding: 10,
            border: "1px solid var(--dock-border)",
            borderRadius: 8,
            background: "var(--dock-surface)",
            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.28)",
            color: "var(--dock-text)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{label}</div>
              <div style={{ marginTop: 2, fontSize: 10, color: "var(--dock-text-dim)" }}>
                {t("sceneRouting.independentHint", "Separate OBS output.")}
              </div>
            </div>
            <button
              type="button"
              className="dock-btm-toolbar__icon-btn"
              onClick={() => void loadScenes()}
              disabled={loading}
              title={t("common.refresh", "Refresh scenes")}
              aria-label={t("common.refresh", "Refresh scenes")}
            >
              <Icon name="refresh" size={14} />
            </button>
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 7, cursor: "pointer", fontSize: 11, lineHeight: 1.35 }}>
            <input
              type="checkbox"
              checked={route.enabled}
              onChange={(event) => {
                const enabled = event.target.checked;
                onRouteChange({ enabled, sceneName: enabled && !route.sceneName ? (scenes[0] ?? "") : route.sceneName });
              }}
            />
            <span>
              <span style={{ display: "block", fontWeight: 600 }}>{t("sceneRouting.sendToScene", "Send to another scene")}</span>
              <small style={{ display: "block", color: "var(--dock-text-dim)", marginTop: 2 }}>
                {t("sceneRouting.sendToSceneHint", "Use the selected scene.")}
              </small>
            </span>
          </label>

          <label style={{ display: "block", marginTop: 9 }}>
            <span style={{ display: "block", marginBottom: 4, fontSize: 10, color: "var(--dock-text-dim)" }}>{t("media.scene", "Scene")}</span>
            <select
              className="dock-input"
              value={route.sceneName}
              disabled={!route.enabled || loading || scenes.length === 0}
              onChange={(event) => onRouteChange({ sceneName: event.target.value })}
              style={{ width: "100%", minHeight: 32, fontSize: 11 }}
            >
              {scenes.length === 0 ? (
                <option value="">{loading ? t("media.loadingScenes", "Loading scenes…") : t("media.noScenesAvailable", "No scenes available")}</option>
              ) : (
                <>
                  {!route.sceneName && <option value="">{t("sceneRouting.selectScene", "Select a scene")}</option>}
                  {scenes.map((sceneName) => <option key={sceneName} value={sceneName}>{sceneName}</option>)}
                </>
              )}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 9, cursor: route.enabled ? "pointer" : "not-allowed", opacity: route.enabled ? 1 : 0.55, fontSize: 11, lineHeight: 1.35 }}>
            <input
              type="checkbox"
              checked={route.syncPresentation}
              disabled={!route.enabled}
              onChange={(event) => onRouteChange({ syncPresentation: event.target.checked })}
            />
            <span>
              <span style={{ display: "block", fontWeight: 600 }}>{t("sceneRouting.syncMce", "Also update MCE Presentation")}</span>
              <small style={{ display: "block", color: "var(--dock-text-dim)", marginTop: 2 }}>
                {t("sceneRouting.syncMceHint", "Update both outputs.")}
              </small>
            </span>
          </label>

          {error && <div style={{ marginTop: 8, color: "var(--dock-red)", fontSize: 10, lineHeight: 1.35 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
