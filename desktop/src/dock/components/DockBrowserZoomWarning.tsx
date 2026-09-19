import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import { useDockBrowserZoomWarning } from "../dockBrowserZoom";

export default function DockBrowserZoomWarning() {
  const { t } = useTranslation();
  const { isZoomedIn } = useDockBrowserZoomWarning();

  if (!isZoomedIn) return null;

  return (
    <div className="dock-browser-zoom-warning" role="alert" aria-live="assertive" aria-atomic="true">
      <Icon name="warning" size={16} />
      <div className="dock-browser-zoom-warning__copy">
        <strong>{t("page.browserZoomWarningTitle", "Browser zoom is above 100%")}</strong>
        <span>
          {t(
            "page.browserZoomWarningDescription",
            "Browser zoom changes the Dock layout, which can move controls off-screen and make text hard to read. Right-click this OBS/Chrome page and choose “Reset zoom” to return to 100%.",
          )}
        </span>
      </div>
      <span className="dock-browser-zoom-warning__action">
        {t("page.browserZoomWarningAction", "Right-click → Reset zoom")}
      </span>
    </div>
  );
}
