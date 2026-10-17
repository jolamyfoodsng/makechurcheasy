/**
 * StudioModal.tsx — a small centred dialog over the Studio (Settings, Theme picker).
 * Click outside or press Esc to close. Rendered inside the Studio so it uses its colours.
 */
import { useEffect, type ReactNode } from "react";
import { X } from "../../components/icons/NativeIcons";
import { isRecordingShortcut } from "../shortcuts";

interface StudioModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** A wider dialog (theme grid). */
  wide?: boolean;
  /** The biggest dialog (the large Preview / Output view). */
  big?: boolean;
  /** Something small on the right of the title. */
  actions?: ReactNode;
}

export default function StudioModal({ title, onClose, children, wide, big, actions }: StudioModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While a new shortcut is being recorded, Esc only cancels that.
      if (e.key === "Escape" && !isRecordingShortcut()) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="st-modal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`st-modal__card${wide ? " is-wide" : ""}${big ? " is-big" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="st-modal__head">
          <h2>{title}</h2>
          {actions}
          <button type="button" className="st-iconbtn" onClick={onClose} aria-label="Close" title="Close (Esc)"><X size={16} /></button>
        </header>
        <div className="st-modal__body">{children}</div>
      </div>
    </div>
  );
}
