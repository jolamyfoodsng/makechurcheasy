/**
 * DockDropOverlay.tsx — Full-tab overlay shown when files are dragged over the dock.
 *
 * Renders a semi-transparent backdrop with upload icon and instructions.
 * Fades in/out via CSS transition.
 */

import { useTranslation } from "react-i18next";
import Icon from "./DockIcon";

interface Props {
  visible: boolean;
}

export default function DockDropOverlay({ visible }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className={`dock-drop-overlay${visible ? " dock-drop-overlay--active" : ""}`}
      aria-hidden="true"
    >
      <div className="dock-drop-overlay__card">
        <div className="dock-drop-overlay__icon">
          <Icon name="cloud_upload" size={28} />
        </div>
        <div className="dock-drop-overlay__title">{t('drop.title')}</div>
        <div className="dock-drop-overlay__subtitle">
          {t('drop.description')}
        </div>
      </div>
    </div>
  );
}
