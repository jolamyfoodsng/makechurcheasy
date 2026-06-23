/**
 * DockDropOverlay.tsx — Full-tab overlay shown when files are dragged over the dock.
 *
 * Renders a semi-transparent backdrop with upload icon and instructions.
 * Fades in/out via CSS transition.
 */

import Icon from "./DockIcon";

interface Props {
  visible: boolean;
}

export default function DockDropOverlay({ visible }: Props) {
  return (
    <div
      className={`dock-drop-overlay${visible ? " dock-drop-overlay--active" : ""}`}
      aria-hidden="true"
    >
      <div className="dock-drop-overlay__card">
        <div className="dock-drop-overlay__icon">
          <Icon name="cloud_upload" size={28} />
        </div>
        <div className="dock-drop-overlay__title">Drop files to upload</div>
        <div className="dock-drop-overlay__subtitle">
          Images and videos are supported
        </div>
      </div>
    </div>
  );
}
