import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import { DOCK_ONBOARDING_KEY, DOCK_ONBOARDING_COMPLETED_EVENT } from "./DockOnboardingTour";
import "./DockScheduleIntroModal.css";

export const DOCK_SCHEDULE_INTRO_KEY = "__mce_dock_schedule_intro_v1";
export const DOCK_OPEN_SCHEDULE_GUIDE_EVENT = "mce-open-schedule-guide";

interface Props {
  open?: boolean;
  onClose?: () => void;
}

export function DockScheduleIntroModal({ open: controlledOpen, onClose: controlledClose }: Props) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : internalOpen;

  useEffect(() => {
    const handleOpenEvent = () => {
      setInternalOpen(true);
    };
    window.addEventListener(DOCK_OPEN_SCHEDULE_GUIDE_EVENT, handleOpenEvent);
    return () => {
      window.removeEventListener(DOCK_OPEN_SCHEDULE_GUIDE_EVENT, handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (isControlled) return;
    try {
      if (typeof localStorage === "undefined") return;
      const seen = localStorage.getItem(DOCK_SCHEDULE_INTRO_KEY);
      if (seen === "true") return;

      const hasCompletedTour = localStorage.getItem(DOCK_ONBOARDING_KEY) === "true";

      if (hasCompletedTour) {
        // Step-by-step dock guide was already finished: show schedule modal after brief settle delay
        const timer = setTimeout(() => {
          setInternalOpen(true);
        }, 900);
        return () => clearTimeout(timer);
      }

      // Step-by-step dock guide is still pending: wait until it is finished or skipped first
      let showTimer: ReturnType<typeof setTimeout> | null = null;
      const handleTourCompleted = () => {
        const stillSeen = localStorage.getItem(DOCK_SCHEDULE_INTRO_KEY);
        if (stillSeen !== "true") {
          showTimer = setTimeout(() => {
            setInternalOpen(true);
          }, 600);
        }
      };

      window.addEventListener(DOCK_ONBOARDING_COMPLETED_EVENT, handleTourCompleted);
      return () => {
        window.removeEventListener(DOCK_ONBOARDING_COMPLETED_EVENT, handleTourCompleted);
        if (showTimer) clearTimeout(showTimer);
      };
    } catch {
      // Ignore localStorage errors
    }
  }, [isControlled]);

  const handleDismiss = useCallback(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(DOCK_SCHEDULE_INTRO_KEY, "true");
      }
    } catch {
      // Ignore
    }
    if (controlledClose) {
      controlledClose();
    } else {
      setInternalOpen(false);
    }
  }, [controlledClose]);

  if (!isOpen) return null;

  return (
    <div className="ssm-backdrop dock-schedule-intro-backdrop" onClick={handleDismiss} role="dialog" aria-modal="true" aria-labelledby="dock-schedule-intro-title">
      <div className="ssm-modal dock-schedule-intro-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="um-close"
          onClick={handleDismiss}
          aria-label={t("common.close", "Close")}
          title={t("common.close", "Close")}
        >
          <Icon name="close" size={18} />
        </button>

        <div className="dock-schedule-intro__header">
          <div className="dock-schedule-intro__icon-badge">
            <Icon name="playlist_play" size={26} />
          </div>
          <div className="dock-schedule-intro__header-text">
            <span className="dock-schedule-intro__badge">{t("schedule.intro.badge", "New Feature")}</span>
            <h2 id="dock-schedule-intro-title" className="dock-schedule-intro__title">
              {t("schedule.intro.title", "Service Schedule & History")}
            </h2>
            <p className="dock-schedule-intro__desc">
              {t("schedule.intro.subtitle", "Organize scriptures, songs, and media in one place, or instantly recall anything previously projected.")}
            </p>
          </div>
        </div>

        <div className="dock-schedule-intro__body">
          <div className="dock-schedule-intro__location-banner">
            <Icon name="pin_drop" size={16} className="dock-schedule-intro__location-icon" />
            <span>
              <strong>{t("schedule.intro.locationLabel", "Where to find it:")}</strong>{" "}
              {t(
                "schedule.intro.locationText",
                "Located on the left edge of your Dock. Click the playlist icon (📋) on the left sidebar to open or collapse it anytime."
              )}
            </span>
          </div>

          <div className="dock-schedule-intro__cards">
            <div className="dock-schedule-intro__card">
              <div className="dock-schedule-intro__card-dot" />
              <div className="dock-schedule-intro__card-content">
                <h4 className="dock-schedule-intro__card-title">
                  {t("schedule.intro.point1Title", "1. Schedule & History Side-by-Side")}
                </h4>
                <p className="dock-schedule-intro__card-detail">
                  {t("schedule.intro.point1Detail", "Shares space next to Bible, Worship, or Notes. Switch tabs to view your queued items or past projection history.")}
                </p>
              </div>
            </div>

            <div className="dock-schedule-intro__card">
              <div className="dock-schedule-intro__card-dot" />
              <div className="dock-schedule-intro__card-content">
                <h4 className="dock-schedule-intro__card-title">
                  {t("schedule.intro.point2Title", "2. One-Click Live Projection")}
                </h4>
                <p className="dock-schedule-intro__card-detail">
                  {t("schedule.intro.point2Detail", "Click any card in Schedule or History to instantly display it on your live screen and OBS.")}
                </p>
              </div>
            </div>

            <div className="dock-schedule-intro__card">
              <div className="dock-schedule-intro__card-dot" />
              <div className="dock-schedule-intro__card-content">
                <h4 className="dock-schedule-intro__card-title">
                  {t("schedule.intro.point3Title", "3. Resize & Pin")}
                </h4>
                <p className="dock-schedule-intro__card-detail">
                  {t("schedule.intro.point3Detail", "Drag the right edge to adjust width, or click the Pin icon to keep it open permanently.")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="dock-schedule-intro__footer">
          <span className="dock-schedule-intro__hint">
            <Icon name="help_outline" size={13} />
            {t("schedule.intro.reopenHint", "You can reopen this guide anytime from the Schedule header (? icon).")}
          </span>
          <button
            type="button"
            className="dock-btn dock-btn--primary dock-schedule-intro__get-started-btn"
            onClick={handleDismiss}
          >
            <span>{t("schedule.intro.gotIt", "Got it, let's go")}</span>
            <Icon name="check" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default DockScheduleIntroModal;
