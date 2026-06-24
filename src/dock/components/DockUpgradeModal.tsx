/**
 * DockUpgradeModal.tsx — Compact upgrade prompt for OBS Browser Dock
 *
 * Stripped-down version of UpgradeModal without plan comparisons or promo details.
 * Designed to fit the dock's constrained viewport.
 */

import { Lock, Zap } from "lucide-react";

interface DockUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  message?: string;
}

export function DockUpgradeModal({ open, onClose, message }: DockUpgradeModalProps) {
  if (!open) return null;

  return (
    <div className="ssm-backdrop" onClick={onClose}>
      <div className="ssm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="um-close" onClick={onClose} aria-label="Close">
          <span className="material-icons" style={{ fontSize: 18 }}>close</span>
        </button>

        <div className="dock-upgrade">
          <div className="dock-upgrade__icon">
            <Lock size={28} strokeWidth={2} />
          </div>
          <h2 className="dock-upgrade__title">Upgrade Required</h2>
          <p className="dock-upgrade__message">
            {message || "Upgrade to access this feature and more."}
          </p>

          <div className="dock-upgrade__actions">
            <button className="dock-upgrade__btn dock-upgrade__btn--secondary" onClick={onClose}>
              Maybe Later
            </button>
            <button
              className="dock-upgrade__btn dock-upgrade__btn--primary"
              onClick={() => window.open("https://makechurcheasy.creatorstudioslabs.stream/pricing", "_blank")}
            >
              <Zap size={15} />
              <span>Upgrade</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DockUpgradeModal;
