import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import { useDockBrowserZoomWarning } from "../dockBrowserZoom";

export default function DockBrowserZoomWarning() {
  const { t } = useTranslation();
  const { isZoomedIn, resetShortcut } = useDockBrowserZoomWarning();

  if (!isZoomedIn) return null;

  return (
    <div className="dock-browser-zoom-warning" role="alert" aria-live="assertive">
      <Icon name="warning" size={16} />
      <div className="dock-browser-zoom-warning__copy">
        <strong>{t("page.browserZoomWarningTitle", "Browser zoom is above 100%")}</strong>
        <span>
          {t(
            "page.browserZoomWarningDescription",
            "Reset the OBS/Chrome page zoom to 100% so the Dock stays readable and controls do not move off-screen.",
          )}
        </span>
      </div>
      <kbd aria-label={t("page.browserZoomResetShortcut", "Reset zoom shortcut")}>{resetShortcut}</kbd>
    </div>
  );
}
