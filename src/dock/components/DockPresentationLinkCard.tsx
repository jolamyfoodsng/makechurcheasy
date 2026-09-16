import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import { copyTextToClipboard } from "../bibleClipboard";
import { getPresentationSettings } from "../../services/presentationSettings";
import "./DockPresentationLinkCard.css";

export default function DockPresentationLinkCard() {
  const { t } = useTranslation();
  const [presentationLink, setPresentationLink] = useState(
    () => getPresentationSettings().presentationLink,
  );
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const refreshLink = () => {
      setPresentationLink(getPresentationSettings().presentationLink);
    };

    refreshLink();
    const refreshTimer = window.setInterval(refreshLink, 30_000);
    return () => {
      window.clearInterval(refreshTimer);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const link = getPresentationSettings().presentationLink || presentationLink;
    setPresentationLink(link);
    const didCopy = await copyTextToClipboard(link);
    setCopied(didCopy);

    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    if (didCopy) {
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 1800);
    }
  }, [presentationLink]);

  return (
    <section className="dock-presentation-link-card" aria-label={t("dock.freePlanOutput", "Free plan presentation link")}>
      <div className="dock-presentation-link-card__copy">
        <span className="dock-presentation-link-card__icon" aria-hidden="true">
          <Icon name="link" size={16} />
        </span>
        <div className="dock-presentation-link-card__content">
          <strong>{t("dock.freePlanOutput", "Free plan presentation link")}</strong>
          <span>
            {t(
              "dock.freePlanOutputDescription",
              "You are on the Free plan. The Dock will not create or update OBS scenes or sources, including MCE Presentation. Copy this link once and add it to OBS as a single Browser Source. Bible, worship, Notes, Media, and other Dock updates will replace the current view through this same link.",
            )}
          </span>
          <code title={presentationLink}>{presentationLink}</code>
        </div>
      </div>
      <button
        type="button"
        className="dock-btn dock-btn--primary dock-btn--sm dock-presentation-link-card__button"
        onClick={() => void handleCopy()}
        disabled={!presentationLink}
        title={t("dock.copyPresentationLink", "Copy presentation link")}
        data-testid="dock-copy-presentation-link"
      >
        <Icon name={copied ? "check" : "content_copy"} size={14} />
        <span>{copied ? t("common.copied", "Copied") : t("common.copy", "Copy")}</span>
      </button>
    </section>
  );
}
