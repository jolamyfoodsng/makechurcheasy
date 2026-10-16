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
import "./DockSceneRoutingControl.css";
import { useDockOutputTarget } from "../dockOutputTargetContext";

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

/** OBS scene routing ("Output → Send to another scene"). Hidden when the Dock drives the Presentation link / Studio. */
export default function DockSceneRoutingControl(props: Props) {
  const target = useDockOutputTarget();
  if (target === "link") return null;
  return <DockSceneRoutingControlInner {...props} />;
}

function DockSceneRoutingControlInner({
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

  const [draftRoute, setDraftRoute] = useState<DockSceneRoute>(route);

  useEffect(() => {
    if (open) {
      setDraftRoute(route);
    }
  }, [open, route]);

  if (disabled) return null;

  const label = title ?? t("sceneRouting.title", "Scene output");
  const selectedTargets = draftRoute.targets;
  const selectedTargetByScene = new Map(selectedTargets.map((target) => [target.sceneName, target]));
  const supportsFormatOverrides = module === "bible" || module === "worship" || module === "notes";
  const formatOptions: Array<{ value: DockSceneOutputMode; label: string }> = [
    { value: "inherit", label: t("sceneRouting.followTab", "Follow tab") },
    { value: "fullscreen", label: t("sceneRouting.fullscreenOutput", "Full screen") },
    { value: "lower-third", label: t("sceneRouting.lowerThirdOutput", "Lower third") },
  ];
  const updateDraftTargets = (targets: DockSceneRouteTarget[], enabledOverride?: boolean) => {
    const isEnabled = enabledOverride !== undefined ? enabledOverride : (targets.length > 0 ? true : false);
    setDraftRoute((current) => ({
      ...current,
      targets,
      sceneName: targets[0]?.sceneName ?? "",
      enabled: isEnabled,
    }));
  };
  const handleTargetToggle = (sceneName: string, checked: boolean) => {
    const nextTargets = checked
      ? [...selectedTargets, { sceneName, mode: "inherit" as const }]
      : selectedTargets.filter((target) => target.sceneName !== sceneName);
    updateDraftTargets(nextTargets, checked ? true : undefined);
  };
  const handleTargetModeChange = (sceneName: string, mode: DockSceneOutputMode) => {
    setDraftRoute((current) => ({
      ...current,
      targets: current.targets.map((target) => (
        target.sceneName === sceneName ? { ...target, mode } : target
      )),
    }));
  };
  const handleRouteEnabledChange = (enabled: boolean) => {
    if (enabled && selectedTargets.length === 0) {
      const fallbackScene = draftRoute.sceneName || scenes[0] || "";
      const targets = fallbackScene
        ? [{ sceneName: fallbackScene, mode: "inherit" as const }]
        : [];
      setDraftRoute((current) => ({
        ...current,
        enabled: targets.length > 0,
        sceneName: fallbackScene,
        targets,
      }));
      return;
    }
    setDraftRoute((current) => ({ ...current, enabled }));
  };
  const handleSave = () => {
    onRouteChange(draftRoute);
    setOpen(false);
  };
  const handleCancel = () => {
    setDraftRoute(route);
    setOpen(false);
  };
  const summary = route.enabled && route.targets.length > 0
    ? route.targets.length === 1
      ? `${t("sceneRouting.to", "To")} ${route.targets[0].sceneName}`
      : `${t("sceneRouting.to", "To")} ${route.targets.length} ${t("sceneRouting.scenes", "scenes")}`
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
            maxHeight: "calc(100vh - 16px)",
            overflowY: "auto",
            maxWidth: "calc(100vw - 16px)",
            boxSizing: "border-box",
            padding: 12,
            border: "1px solid var(--dock-border)",
            borderRadius: 8,
            background: "var(--dock-surface)",
            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.28)",
            color: "var(--dock-text)",
            visibility: popoverPosition ? "visible" : "hidden",
          }}
        >
          <div className="dock-scene-routing-popover">
            <div className="dock-scene-routing-popover__head">
              <div>
                <div className="dock-scene-routing-popover__title">{label}</div>
                <div className="dock-scene-routing-popover__sub">
                  {t("sceneRouting.independentHint", "Separate OBS output.")}
                </div>
              </div>
              <button
                type="button"
                className="dock-btn dock-btn--ghost dock-btn--compact dock-scene-routing-popover__refresh"
                onClick={() => void loadScenes()}
                disabled={loading}
                title={t("common.refresh", "Refresh scenes")}
                aria-label={t("common.refresh", "Refresh scenes")}
              >
                <Icon name="refresh" size={14} />
              </button>
            </div>

            <label className={`dock-scene-routing-control__toggle${draftRoute.enabled ? " is-on" : ""}`}>
              <input
                type="checkbox"
                className="dock-scene-routing-control__check"
                checked={draftRoute.enabled}
                onChange={(event) => handleRouteEnabledChange(event.target.checked)}
              />
              <span className="dock-scene-routing-control__toggle-copy">
                <span className="dock-scene-routing-control__label">{t("sceneRouting.sendToScene", "Send to another scene")}</span>
                <small>{t("sceneRouting.sendToSceneHint", "Use the selected scene.")}</small>
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
                          className="dock-scene-routing-control__check"
                          checked={Boolean(target)}
                          disabled={loading}
                          onChange={(event) => handleTargetToggle(sceneName, event.target.checked)}
                        />
                        <span title={sceneName}>{sceneName}</span>
                      </label>
                      {supportsFormatOverrides && target && (
                        <select
                          className="dock-scene-routing-control__mode-select"
                          value={target.mode}
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

            <label className="dock-scene-routing-control__sync">
              <input
                type="checkbox"
                className="dock-scene-routing-control__check"
                checked={draftRoute.syncPresentation}
                onChange={(event) => setDraftRoute((current) => ({ ...current, syncPresentation: event.target.checked }))}
              />
              <span className="dock-scene-routing-control__toggle-copy">
                <span className="dock-scene-routing-control__label">{t("sceneRouting.syncMce", "Also update MCE Presentation")}</span>
                <small>{t("sceneRouting.syncMceHint", "Update both outputs.")}</small>
              </span>
            </label>

            {error && <div className="dock-scene-routing-popover__error">{error}</div>}

            <div className="dock-scene-routing-popover__footer">
              <button type="button" className="dock-btn dock-btn--secondary dock-btn--compact" onClick={handleCancel}>
                {t("common.cancel", "Cancel")}
              </button>
              <button type="button" className="dock-btn dock-btn--primary dock-btn--compact" onClick={handleSave}>
                {t("common.save", "Save")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
