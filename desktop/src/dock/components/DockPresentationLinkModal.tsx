import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import { copyTextToClipboard } from "../bibleClipboard";
import { getPresentationSettings } from "../../services/presentationSettings";
import "./DockPresentationLinkCard.css";

interface DockPresentationLinkModalProps {
  open: boolean;
  onClose: () => void;
  presentationLink?: string;
}

export function DockPresentationLinkModal({
  open,
  onClose,
  presentationLink: propLink,
}: DockPresentationLinkModalProps) {
  const { t } = useTranslation();
  const [presentationLink, setPresentationLink] = useState(
    () => propLink || getPresentationSettings().presentationLink,
  );
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (propLink) {
      setPresentationLink(propLink);
    } else {
      setPresentationLink(getPresentationSettings().presentationLink);
    }
  }, [propLink, open]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const link = presentationLink || getPresentationSettings().presentationLink;
    if (!link) return;
    const didCopy = await copyTextToClipboard(link);
    setCopied(didCopy);

    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    if (didCopy) {
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 2000);
    }
  }, [presentationLink]);

  if (!open) return null;

  return (
    <div className="ssm-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="dock-presentation-modal-title">
      <div className="ssm-modal dock-presentation-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="um-close"
          onClick={onClose}
          aria-label={t("common.close", "Close")}
          title={t("common.close", "Close")}
        >
          <Icon name="close" size={18} />
        </button>

        <div className="dock-presentation-modal__header">
          <div className="dock-presentation-modal__header-icon">
            <Icon name="link" size={22} />
          </div>
          <div>
            <h2 id="dock-presentation-modal-title" className="dock-presentation-modal__title">
              {t("dock.freePlanNoticeTitle", "You Are on the Free Plan")}
            </h2>
            <p className="dock-presentation-modal__subtitle">
              {t(
                "dock.freePlanNoticeDesc",
                "Your account is on the Free plan. Because of this, automatic OBS scene management and dedicated sources are disabled. All live presentations (Bible, worship lyrics, media, and notes) now display through this single Browser Source link.",
              )}
            </p>
          </div>
        </div>

        <div className="dock-presentation-modal__body">
          <div className="dock-presentation-modal__link-card">
            <span className="dock-presentation-modal__link-label">
              {t("dock.presentationLink", "Your OBS Browser Source Link")}
            </span>
            <div className="dock-presentation-modal__link-row">
              <code className="dock-presentation-modal__link-code" title={presentationLink}>
                {presentationLink}
              </code>
              <button
                type="button"
                className={`dock-btn ${copied ? "dock-btn--success" : "dock-btn--primary"} dock-presentation-modal__copy-btn`}
                onClick={() => void handleCopy()}
                disabled={!presentationLink}
                title={t("dock.copyPresentationLink", "Copy presentation link")}
              >
                <Icon name={copied ? "check" : "content_copy"} size={15} />
                <span>{copied ? t("common.copied", "Copied!") : t("common.copyLink", "Copy Link")}</span>
              </button>
            </div>
          </div>

          <p className="dock-presentation-modal__hint">
            {t(
              "dock.freePlanModalHint",
              "Add this link as a single Browser Source in OBS (recommended resolution: 1920 × 1080). Everything you project from the Dock will update through it dynamically.",
            )}
          </p>
        </div>

        <div className="dock-presentation-modal__actions dock-presentation-modal__actions--single">
          <button
            type="button"
            className="dock-btn dock-btn--primary dock-presentation-modal__done-btn"
            onClick={onClose}
          >
            {t("common.gotIt", "Got it")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DockPresentationLinkModal;
