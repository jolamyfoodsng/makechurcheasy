import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import { lmDockService, type LmDockSnapshot } from "../services/lmDockService";

function isVoiceBibleActive(status: LmDockSnapshot["status"]): boolean {
  return status === "listening" || status === "connecting" || status === "requesting-mic";
}

export default function VoiceBibleResumeBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<LmDockSnapshot>(lmDockService.getSnapshot());

  useEffect(() => lmDockService.subscribe(setSnapshot), []);

  if (!isVoiceBibleActive(snapshot.status) || location.pathname.startsWith("/speech-to-scripture")) {
    return null;
  }

  const latestReference = snapshot.candidates[snapshot.candidates.length - 1]?.label;

  return (
    <div className="app-banner app-banner--info voice-bible-resume-banner" role="status" aria-live="polite">
      <div className="app-banner__content">
        <Icon name="mic" size={16} />
        <div className="voice-bible-resume-banner__copy">
          <strong className="voice-bible-resume-banner__title">
            {t("verseAi.resumeBannerTitle", { defaultValue: "Voice Bible is still transcribing" })}
          </strong>
          <span>
            {latestReference
              ? t("verseAi.resumeBannerDescWithMatch", {
                defaultValue: "Live transcription is still running in the background. Latest match: {{reference}}.",
                reference: latestReference,
              })
              : t("verseAi.resumeBannerDesc", {
                defaultValue: "Live transcription is still running in the background. Return any time to review or stop the session.",
              })}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="app-btn app-btn--primary voice-bible-resume-banner__action"
        onClick={() => navigate("/speech-to-scripture")}
        title={t("verseAi.returnToVoiceBible", { defaultValue: "Return to Voice Bible" })}
      >
        <span>{t("verseAi.returnToVoiceBible", { defaultValue: "Return to Voice Bible" })}</span>
        <Icon name="arrow_forward" size={14} />
      </button>
    </div>
  );
}
