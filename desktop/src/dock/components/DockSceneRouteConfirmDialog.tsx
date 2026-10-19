import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { DockSceneRoute } from "../dockSceneRouting";
import Icon from "../DockIcon";
import "./DockSceneRouteSendControl.css";

export interface DockSceneRouteConfirmDialogProps {
  open: boolean;
  route?: DockSceneRoute | null;
  itemLabel?: string;
  onConfirmRouted: () => void | Promise<void>;
  onSendToMceAlone: () => void | Promise<void>;
  onCancel: () => void;
  sending?: boolean;
}

/**
 * DockSceneRouteConfirmDialog — Modal dialog prompted when an operator projects
 * content (Bible, Worship, Notes) while Output is routed to another scene.
 *
 * Provides a conversational prompt:
 * 1. "▶ Yes, send to [Scene]"
 * 2. "🖥️ No, send to MCE Presentation alone"
 * 3. "Cancel"
 */
export default function DockSceneRouteConfirmDialog({
  open,
  route,
  itemLabel,
  onConfirmRouted,
  onSendToMceAlone,
  onCancel,
  sending = false,
}: DockSceneRouteConfirmDialogProps) {
  const { t } = useTranslation();

  const targets = route?.targets ?? [];
  const targetCount = targets.length;
  const isMulti = targetCount > 1;
  const primarySceneName = targets[0]?.sceneName ?? "";
  const targetSummary = useMemo(() => {
    return targets.map((t) => t.sceneName).filter(Boolean).join(", ");
  }, [targets]);

  const confirmTitle = isMulti
    ? t("sceneRouting.sendToConfirmTitleMulti", "Send to {{count}} target scenes?", { count: targetCount })
    : t("sceneRouting.sendToConfirmTitleSingle", "Send to {{scene}}?", { scene: primarySceneName });

  const confirmDesc = isMulti
    ? (itemLabel
      ? t("sceneRouting.sendToConfirmDescMultiCustom", "Your {{item}} is currently set to project to {{count}} scenes:", { item: itemLabel, count: targetCount })
      : t("sceneRouting.sendToConfirmDescMulti", "Currently set to project to {{count}} scenes:", { count: targetCount }))
    : (itemLabel
      ? t("sceneRouting.sendToConfirmDescSingleCustom", "Your {{item}} is currently set to project to {{scene}}.", { item: itemLabel, scene: primarySceneName })
      : t("sceneRouting.sendToConfirmDescSingleContent", "Currently set to project to {{scene}}.", { scene: primarySceneName }));

  const sendToTargetLabel = isMulti
    ? t("sceneRouting.sendToTargetOptionMulti", "Yes, send to all {{count}} scenes", { count: targetCount })
    : t("sceneRouting.sendToTargetOptionSingle", "Yes, send to {{scene}}", { scene: primarySceneName });

  const sendToTargetSub = isMulti
    ? t("sceneRouting.sendToTargetSubMulti", "Projects to {{scenes}}", { scenes: targetSummary })
    : t("sceneRouting.sendToTargetSubSingle", "Projects to {{scene}}", { scene: primarySceneName });

  const sendToMceSub = isMulti
    ? t("sceneRouting.sendToMceAloneSubMulti", "Turns off target scenes and sends to presentation")
    : t("sceneRouting.sendToMceAloneSubSingle", "Turns off {{scene}} and sends to presentation", { scene: primarySceneName });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const content = (
    <div
      className="dock-dialog-backdrop"
      role="presentation"
      onClick={onCancel}
      style={{ zIndex: 10002 }}
    >
      <div
        className="dock-dialog dock-dialog--compact dock-scene-route-confirm-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 340,
          maxWidth: "calc(100vw - 24px)",
          padding: 16,
          borderRadius: 12,
          background: "var(--dock-surface)",
          border: "1px solid var(--dock-border)",
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5)",
          color: "var(--dock-text)",
        }}
      >
        <div className="dock-scene-route-send-menu">
          {/* Header */}
          <div className="dock-scene-route-send-menu__head">
            <div className="dock-scene-route-send-menu__badge-row">
              <div className="dock-scene-route-send-menu__title">
                {confirmTitle}
              </div>
              <button
                type="button"
                className="dock-btn dock-btn--ghost dock-btn--compact dock-scene-route-send-menu__close"
                onClick={onCancel}
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
            onClick={onConfirmRouted}
            disabled={sending}
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
            onClick={onSendToMceAlone}
            disabled={sending}
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

          {/* Footer */}
          <div className="dock-scene-route-send-menu__footer">
            <button
              type="button"
              className="dock-btn dock-btn--ghost dock-btn--compact"
              style={{ fontSize: 11, color: "var(--dock-text-dim)" }}
              onClick={onCancel}
            >
              {t("common.cancel", "Cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}
