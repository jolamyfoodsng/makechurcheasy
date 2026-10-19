import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { DockSceneRoute } from "../dockSceneRouting";
import Icon from "../DockIcon";
import "./DockSceneRouteSendControl.css";

export interface DockSceneRouteSendControlProps {
  /** The current scene routing configuration for this module (e.g. lower-third). */
  route?: DockSceneRoute | null;
  /** Callback when scene routing is modified (e.g. disabled from the dropdown). */
  onRouteChange?: (patch: Partial<DockSceneRoute>) => void;
  /** Callback to send to OBS. Receives { bypassSceneRoute: true } if routing should be bypassed. */
  onSend: (options?: { bypassSceneRoute?: boolean }) => void | Promise<void>;
  /** Loading/busy state while sending to OBS. */
  sending?: boolean;
  /** Disabled state for the button. */
  disabled?: boolean;
  /** Custom button class name. Defaults to "dock-btn dock-btn--sm dock-btn--primary". */
  className?: string;
  /** Inline style overrides for the button. */
  style?: React.CSSProperties;
  /** Label for the button. Defaults to "Send to OBS". */
  label?: string;
  /** Icon name for the button. Defaults to "play_arrow". */
  iconName?: string;
  /** Hover title. */
  title?: string;
  /** Optional content type label for the question (e.g. "scripture", "worship slide", "note", "lower-third"). Defaults to "lower-third". */
  itemLabel?: string;
}

/**
 * DockSceneRouteSendControl — "Send to OBS" button that detects when scene routing is ON.
 *
 * When scene routing is OFF:
 *   Immediately executes `onSend()`.
 *
 * When scene routing is ON (e.g. sent to another scene like "BRB SCENE"):
 *   Clicking the button drops down a popover menu letting the operator know
 *   that scene routing is active, and provides:
 *   1. An option to send to the target scene as routed.
 *   2. An option to disable scene routing and send to the standard OBS output immediately.
 */
export default function DockSceneRouteSendControl({
  route,
  onRouteChange,
  onSend,
  sending = false,
  disabled = false,
  className = "dock-btn dock-btn--sm dock-btn--primary",
  style,
  label,
  iconName = "play_arrow",
  title,
  itemLabel,
}: DockSceneRouteSendControlProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);

  const targets = route?.targets ?? [];
  const targetCount = targets.length;
  const isMulti = targetCount > 1;
  const primarySceneName = targets[0]?.sceneName ?? "";

  const hasActiveRoute = Boolean(route?.enabled && targetCount > 0);
  const targetSummary = useMemo(() => {
    return targets.map((t) => t.sceneName).filter(Boolean).join(", ");
  }, [targets]);

  const badgeText = useMemo(() => {
    if (targetCount === 0) return "";
    if (targetCount === 1) return primarySceneName;
    return `${targetCount} Scenes`;
  }, [targetCount, primarySceneName]);

  const confirmTitle = isMulti
    ? t("sceneRouting.sendToConfirmTitleMulti", "Send to {{count}} target scenes?", { count: targetCount })
    : t("sceneRouting.sendToConfirmTitleSingle", "Send to {{scene}}?", { scene: primarySceneName });

  const confirmDesc = isMulti
    ? (itemLabel
      ? t("sceneRouting.sendToConfirmDescMultiCustom", "Your {{item}} is currently set to project to {{count}} scenes:", { item: itemLabel, count: targetCount })
      : t("sceneRouting.sendToConfirmDescMulti", "Currently set to project to {{count}} scenes:", { count: targetCount }))
    : (itemLabel
      ? t("sceneRouting.sendToConfirmDescSingleCustom", "Your {{item}} is currently set to project to {{scene}}.", { item: itemLabel, scene: primarySceneName })
      : t("sceneRouting.sendToConfirmDescSingle", "Your lower-third is currently set to project to {{scene}}.", { scene: primarySceneName }));

  const sendToTargetLabel = isMulti
    ? t("sceneRouting.sendToTargetOptionMulti", "Yes, send to all {{count}} scenes", { count: targetCount })
    : t("sceneRouting.sendToTargetOptionSingle", "Yes, send to {{scene}}", { scene: primarySceneName });

  const sendToTargetSub = isMulti
    ? t("sceneRouting.sendToTargetSubMulti", "Projects to {{scenes}}", { scenes: targetSummary })
    : t("sceneRouting.sendToTargetSubSingle", "Projects to {{scene}}", { scene: primarySceneName });

  const sendToMceSub = isMulti
    ? t("sceneRouting.sendToMceAloneSubMulti", "Turns off target scenes and sends to presentation")
    : t("sceneRouting.sendToMceAloneSubSingle", "Turns off {{scene}} and sends to presentation", { scene: primarySceneName });

  const defaultLabel = label ?? t("common.sendToObs", "Send to OBS");
  const buttonTitle = title ?? (
    hasActiveRoute
      ? `${defaultLabel} (${t("sceneRouting.routedTo", "Routed to:")} ${targetSummary})`
      : defaultLabel
  );

  const handleButtonClick = () => {
    if (disabled || sending) return;
    if (!hasActiveRoute) {
      void onSend({ bypassSceneRoute: false });
      return;
    }
    setMenuOpen((open) => !open);
  };

  const handleSendToRoutedScene = useCallback(() => {
    setMenuOpen(false);
    void onSend({ bypassSceneRoute: false });
  }, [onSend]);

  const handleDisableAndSend = useCallback(() => {
    setMenuOpen(false);
    onRouteChange?.({ enabled: false });
    void onSend({ bypassSceneRoute: true });
  }, [onRouteChange, onSend]);

  // Close dropdown if route becomes inactive externally
  useEffect(() => {
    if (!hasActiveRoute && menuOpen) {
      setMenuOpen(false);
    }
  }, [hasActiveRoute, menuOpen]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Smart popover positioning (prefer opening above the button because the dock action bar is at the bottom)
  useLayoutEffect(() => {
    if (!menuOpen) {
      setPopoverPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover?.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 480;
      const viewportPadding = 8;
      const gap = 8;
      const popoverWidth = popoverRect?.width || Math.min(320, viewportWidth - viewportPadding * 2);
      const popoverHeight = popoverRect?.height || 220;

      // Position horizontally: align with trigger left, clamped to viewport
      let left = triggerRect.left;
      if (left + popoverWidth > viewportWidth - viewportPadding) {
        left = viewportWidth - popoverWidth - viewportPadding;
      }
      if (left < viewportPadding) {
        left = viewportPadding;
      }

      // Position vertically: prefer opening above the button
      const spaceAbove = triggerRect.top - viewportPadding;
      const spaceBelow = viewportHeight - triggerRect.bottom - viewportPadding;
      const fitsAbove = spaceAbove >= popoverHeight + gap;
      const fitsBelow = spaceBelow >= popoverHeight + gap;

      const top = fitsAbove
        ? triggerRect.top - popoverHeight - gap
        : fitsBelow
          ? triggerRect.bottom + gap
          : Math.max(viewportPadding, triggerRect.top - popoverHeight - gap);

      setPopoverPosition((current) => (
        current?.top === top && current.left === left ? current : { top, left }
      ));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);

    const resizeObserver = typeof ResizeObserver !== "undefined" && popoverRef.current
      ? new ResizeObserver(updatePosition)
      : null;
    if (resizeObserver && popoverRef.current) resizeObserver.observe(popoverRef.current);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      resizeObserver?.disconnect();
    };
  }, [menuOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${className}${sending ? " dock-btn--loading" : ""}${hasActiveRoute ? " dock-scene-route-send-btn--routed" : ""}`}
        onClick={handleButtonClick}
        disabled={disabled || sending}
        style={style}
        title={buttonTitle}
        aria-haspopup={hasActiveRoute ? "menu" : undefined}
        aria-expanded={hasActiveRoute ? menuOpen : undefined}
      >
        <Icon name={iconName} size={14} />
        <span>{defaultLabel}</span>
        {hasActiveRoute && (
          <>
            <span className="dock-scene-route-send-btn__route-badge" title={targetSummary}>
              <Icon name="alt_route" size={11} />
              <span className="dock-scene-route-send-btn__route-text">{badgeText}</span>
            </span>
            <Icon
              name={menuOpen ? "expand_more" : "expand_less"}
              size={13}
              className="dock-scene-route-send-btn__arrow"
            />
          </>
        )}
      </button>

      {menuOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          data-dock-keep-overflow-open="true"
          role="menu"
          aria-label={t("sceneRouting.routedOutputMenu", "Routed output options")}
          style={{
            position: "fixed",
            top: popoverPosition?.top ?? 0,
            left: popoverPosition?.left ?? 0,
            zIndex: 10001,
            width: 330,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: "calc(100vh - 16px)",
            overflowY: "auto",
            boxSizing: "border-box",
            padding: 12,
            border: "1px solid var(--dock-border)",
            borderRadius: 10,
            background: "var(--dock-surface)",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
            visibility: popoverPosition ? "visible" : "hidden",
          }}
        >
          <div className="dock-scene-route-send-menu">
            {/* Header: Friendly & direct question */}
            <div className="dock-scene-route-send-menu__head">
              <div className="dock-scene-route-send-menu__badge-row">
                <div className="dock-scene-route-send-menu__title">
                  {confirmTitle}
                </div>
                <button
                  type="button"
                  className="dock-btn dock-btn--ghost dock-btn--compact dock-scene-route-send-menu__close"
                  onClick={() => setMenuOpen(false)}
                  title={t("common.close", "Close")}
                  aria-label={t("common.close", "Close")}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div className="dock-scene-route-send-menu__desc">
                {confirmDesc}
              </div>
              {isMulti && (
                <div className="dock-scene-route-send-menu__scenes-list">
                  {targets.map((t) => (
                    <span key={t.sceneName} className="dock-scene-route-send-menu__scene-tag">
                      <Icon name="check" size={11} /> {t.sceneName}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Option 1: Yes, send to target scene(s) */}
            <button
              type="button"
              className="dock-btn dock-scene-route-send-menu__action-btn dock-scene-route-send-menu__action-btn--routed"
              onClick={handleSendToRoutedScene}
              title={sendToTargetLabel}
            >
              <div className="dock-scene-route-send-menu__btn-main">
                <Icon name="play_arrow" size={14} />
                <span>{sendToTargetLabel}</span>
              </div>
              <div className="dock-scene-route-send-menu__btn-sub">
                {sendToTargetSub}
              </div>
            </button>

            {/* Option 2: No, send to MCE Presentation alone */}
            <button
              type="button"
              className="dock-btn dock-scene-route-send-menu__action-btn dock-scene-route-send-menu__action-btn--disable"
              onClick={handleDisableAndSend}
              title={t("sceneRouting.sendToMceAlone", "No, send to MCE Presentation alone")}
            >
              <div className="dock-scene-route-send-menu__btn-main">
                <Icon name="desktop_windows" size={15} />
                <span>{t("sceneRouting.sendToMceAlone", "No, send to MCE Presentation alone")}</span>
              </div>
              <div className="dock-scene-route-send-menu__btn-sub">
                {sendToMceSub}
              </div>
            </button>

            {/* Footer Actions */}
            <div className="dock-scene-route-send-menu__footer">
              <button
                type="button"
                className="dock-btn dock-btn--ghost dock-btn--compact"
                style={{ fontSize: 11, color: "var(--dock-text-dim)" }}
                onClick={() => setMenuOpen(false)}
              >
                {t("common.cancel", "Cancel")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
