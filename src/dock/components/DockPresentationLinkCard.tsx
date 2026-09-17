import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import { copyTextToClipboard } from "../bibleClipboard";
import { getPresentationSettings } from "../../services/presentationSettings";
import "./DockPresentationLinkCard.css";

interface DockPresentationLinkCardProps {
  onOpenHelp?: () => void;
}

export default function DockPresentationLinkCard({ onOpenHelp }: DockPresentationLinkCardProps) {
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
    <section
      className="dock-presentation-link-card dock-presentation-link-bar"
      aria-label={t("dock.freePlanOutput", "Free plan presentation link")}
    >
      <div className="dock-presentation-link-bar__main">
        <span className="dock-presentation-link-bar__tag">
          <Icon name="link" size={13} />
          <span>{t("dock.browserSource", "OBS Browser Source:")}</span>
        </span>
        <code
          className="dock-presentation-link-bar__code"
          title={presentationLink}
        >
          {presentationLink}
        </code>
      </div>

      <div className="dock-presentation-link-bar__actions">
        <button
          type="button"
          className="dock-btn dock-btn--primary dock-btn--sm dock-presentation-link-bar__copy-btn"
          onClick={() => void handleCopy()}
          disabled={!presentationLink}
          title={t("dock.copyPresentationLink", "Copy presentation link")}
          data-testid="dock-copy-presentation-link"
        >
          <Icon name={copied ? "check" : "content_copy"} size={13} />
          <span>{copied ? t("common.copied", "Copied") : t("common.copy", "Copy")}</span>
        </button>

        {onOpenHelp && (
          <button
            type="button"
            className="dock-presentation-link-bar__help-btn"
            onClick={onOpenHelp}
            title={t("dock.setupInstructions", "OBS setup instructions")}
            aria-label={t("dock.setupInstructions", "OBS setup instructions")}
          >
            <Icon name="help_outline" size={14} />
          </button>
        )}
      </div>
    </section>
  );
}
