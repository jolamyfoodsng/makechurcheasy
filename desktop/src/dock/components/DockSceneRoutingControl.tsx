import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { isUserSelectableObsScene } from "../../services/dockSceneNames";
import { dockObsClient } from "../dockObsClient";
import type {
  DockSceneOutputMode,
  DockSceneRoute,
  DockSceneRouteModule,
  DockSceneRouteTarget,
} from "../dockSceneRouting";
import { ensureObsConnected } from "../obsConnectionGuard";
import Icon from "../DockIcon";

interface Props {
  module: DockSceneRouteModule;
  route: DockSceneRoute;
  onRouteChange: (patch: Partial<DockSceneRoute>) => void;
  disabled?: boolean;
  title?: string;
  placement?: "above" | "below";
  showLabel?: boolean;
  iconName?: string;
}

export default function DockSceneRoutingControl({
  module,
  route,
  onRouteChange,
  disabled = false,
  title,
  placement = "below",
  showLabel = false,
  iconName = "settings",
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controlRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);

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
      if (route.enabled && route.targets.length === 0 && choices[0]) {
        onRouteChange({
          sceneName: choices[0],
          targets: [{ sceneName: choices[0], mode: "inherit" }],
        });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("media.unableToLoadScenes", "Unable to load OBS scenes."));
    } finally {
      setLoading(false);
    }
  }, [disabled, onRouteChange, route.enabled, route.targets.length, t]);

  useEffect(() => {
    if (open) void loadScenes();
  }, [loadScenes, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!controlRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
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

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPosition(null);
      return;
    }

    const updatePopoverPosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover?.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 480;
      const viewportPadding = 8;
      const gap = 8;
      const popoverWidth = popoverRect?.width || Math.min(300, viewportWidth - viewportPadding * 2);
      const popoverHeight = popoverRect?.height || 420;

      // Prefer the natural reading direction: open beside the trigger to the
      // right, then flip left when a narrow/scaled dock has no room there.
      const rightPosition = triggerRect.right + gap;
      const leftPosition = triggerRect.left - popoverWidth - gap;
      const canOpenRight = rightPosition + popoverWidth <= viewportWidth - viewportPadding;
      const canOpenLeft = leftPosition >= viewportPadding;
      const left = canOpenRight
        ? rightPosition
        : canOpenLeft
          ? leftPosition
          : Math.max(
            viewportPadding,
            Math.min(rightPosition, viewportWidth - popoverWidth - viewportPadding),
          );

      const spaceAbove = triggerRect.top - viewportPadding;
      const spaceBelow = viewportHeight - triggerRect.bottom - viewportPadding;
      const fitsAbove = spaceAbove >= popoverHeight + gap;
      const fitsBelow = spaceBelow >= popoverHeight + gap;
      const preferredTop = placement === "above"
        ? (fitsAbove ? triggerRect.top - popoverHeight - gap : triggerRect.bottom + gap)
        : (fitsBelow ? triggerRect.bottom + gap : triggerRect.top - popoverHeight - gap);
      const top = Math.max(
        viewportPadding,
        Math.min(preferredTop, viewportHeight - popoverHeight - viewportPadding),
      );

      setPopoverPosition((current) => (
        current?.top === top && current.left === left ? current : { top, left }
      ));
    };

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    window.visualViewport?.addEventListener("resize", updatePopoverPosition);

    const resizeObserver = typeof ResizeObserver !== "undefined" && popoverRef.current
      ? new ResizeObserver(updatePopoverPosition)
      : null;
    if (resizeObserver && popoverRef.current) resizeObserver.observe(popoverRef.current);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
      window.visualViewport?.removeEventListener("resize", updatePopoverPosition);
      resizeObserver?.disconnect();
    };
  }, [open, placement]);

  if (disabled) return null;

  const label = title ?? t("sceneRouting.title", "Scene output");
  const selectedTargets = route.targets;
  const selectedTargetByScene = new Map(selectedTargets.map((target) => [target.sceneName, target]));
  const supportsFormatOverrides = module === "bible" || module === "worship" || module === "notes";
  const formatOptions: Array<{ value: DockSceneOutputMode; label: string }> = [
    { value: "inherit", label: t("sceneRouting.followTab", "Follow tab") },
    { value: "fullscreen", label: t("sceneRouting.fullscreenOutput", "Full screen") },
    { value: "lower-third", label: t("sceneRouting.lowerThirdOutput", "Lower third") },
  ];
  const updateTargets = (targets: DockSceneRouteTarget[]) => {
    onRouteChange({
      targets,
      sceneName: targets[0]?.sceneName ?? "",
      enabled: targets.length > 0 ? route.enabled : false,
    });
  };
  const handleTargetToggle = (sceneName: string, checked: boolean) => {
    const nextTargets = checked
      ? [...selectedTargets, { sceneName, mode: "inherit" as const }]
      : selectedTargets.filter((target) => target.sceneName !== sceneName);
    updateTargets(nextTargets);
  };
  const handleTargetModeChange = (sceneName: string, mode: DockSceneOutputMode) => {
    updateTargets(selectedTargets.map((target) => (
      target.sceneName === sceneName ? { ...target, mode } : target
    )));
  };
  const handleRouteEnabledChange = (enabled: boolean) => {
    if (enabled && selectedTargets.length === 0) {
      const fallbackScene = route.sceneName || scenes[0] || "";
      const targets = fallbackScene
        ? [{ sceneName: fallbackScene, mode: "inherit" as const }]
        : [];
      onRouteChange({ enabled: targets.length > 0, sceneName: fallbackScene, targets });
      return;
    }
    onRouteChange({ enabled });
  };
  const summary = route.enabled && selectedTargets.length > 0
    ? selectedTargets.length === 1
      ? `${t("sceneRouting.to", "To")} ${selectedTargets[0].sceneName}`
      : `${t("sceneRouting.to", "To")} ${selectedTargets.length} ${t("sceneRouting.scenes", "scenes")}`
    : t("sceneRouting.presentation", "MCE Presentation");

  return (
    <div ref={controlRef} style={{ position: "relative", display: "inline-flex", width: showLabel ? "100%" : undefined }}>
      <button
        type="button"
        ref={triggerRef}
        className={`dock-btm-toolbar__icon-btn${route.enabled ? " dock-btm-toolbar__icon-btn--active" : ""}${showLabel ? " dock-scene-routing-control__trigger--labelled" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${label}: ${summary}`}
      >
        <Icon name={iconName} size={14} />
        {showLabel && <span>{label}</span>}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          data-dock-keep-overflow-open="true"
          role="dialog"
          aria-label={label}
          style={{
            position: "fixed",
            top: popoverPosition?.top ?? 0,
            left: popoverPosition?.left ?? 0,
            zIndex: 10000,
            width: 344,
            maxWidth: "calc(100vw - 16px)",
            boxSizing: "border-box",
            padding: 10,
            border: "1px solid var(--dock-border)",
            borderRadius: 8,
            background: "var(--dock-surface)",
            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.28)",
            color: "var(--dock-text)",
            visibility: popoverPosition ? "visible" : "hidden",
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

          <label className="dock-scene-routing-control__toggle">
            <input
              type="checkbox"
              checked={route.enabled}
              onChange={(event) => handleRouteEnabledChange(event.target.checked)}
            />
            <span className="dock-scene-routing-control__toggle-copy">
              <span className="dock-scene-routing-control__label">{t("sceneRouting.sendToScene", "Send to another scene")}</span>
              <small>
                {t("sceneRouting.sendToSceneHint", "Use the selected scene.")}
              </small>
            </span>
          </label>

          <div className="dock-scene-routing-control__section">
            <div className="dock-scene-routing-control__section-head">
              <span>{t("sceneRouting.targetScenes", "Target scenes")}</span>
              <span className="dock-scene-routing-control__count">{selectedTargets.length}</span>
            </div>
            <div className="dock-scene-routing-control__scene-list" role="group" aria-label={t("sceneRouting.targetScenes", "Target scenes")}>
              {scenes.length === 0 ? (
                <div className="dock-scene-routing-control__empty">
                  {loading ? t("media.loadingScenes", "Loading scenes…") : t("media.noScenesAvailable", "No scenes available")}
                </div>
              ) : scenes.map((sceneName) => {
                const target = selectedTargetByScene.get(sceneName);
                return (
                  <div key={sceneName} className={`dock-scene-routing-control__scene-row${target ? " is-selected" : ""}`}>
                    <label className="dock-scene-routing-control__scene-check">
                      <input
                        type="checkbox"
                        checked={Boolean(target)}
                        disabled={!route.enabled || loading}
                        onChange={(event) => handleTargetToggle(sceneName, event.target.checked)}
                      />
                      <span title={sceneName}>{sceneName}</span>
                    </label>
                    {supportsFormatOverrides && target && (
                      <select
                        className="dock-scene-routing-control__mode-select"
                        value={target.mode}
                        disabled={!route.enabled}
                        aria-label={`${sceneName} ${t("sceneRouting.outputFormat", "output format")}`}
                        onChange={(event) => handleTargetModeChange(sceneName, event.target.value as DockSceneOutputMode)}
                      >
                        {formatOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
            <small className="dock-scene-routing-control__hint">
              {supportsFormatOverrides
                ? t("sceneRouting.targetScenesHint", "Select one or more scenes and choose how each one should receive this content.")
                : t("sceneRouting.targetScenesSimpleHint", "Select one or more scenes for this output.")}
            </small>
          </div>

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
        </div>,
        document.body,
      )}
    </div>
  );
}
