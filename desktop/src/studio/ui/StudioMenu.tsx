/**
 * StudioMenu.tsx — the small right-click menu used across the Studio (verses, queue, schedule…).
 */
import { useEffect, type ReactNode } from "react";

export interface StudioMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Draw a divider above this item. */
  divider?: boolean;
  hint?: string;
}

export interface StudioMenuState {
  x: number;
  y: number;
  items: StudioMenuItem[];
}

/** Keep the menu inside the window. */
export function menuAt(event: { clientX: number; clientY: number }, items: StudioMenuItem[]): StudioMenuState {
  const height = items.length * 32 + 12;
  return {
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - height)),
    items,
  };
}

export default function StudioMenu({ menu, onClose }: { menu: StudioMenuState | null; onClose: () => void }) {
  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, onClose]);

  if (!menu) return null;
  return (
    <>
      <div className="studio-menu-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="studio-menu st-menu" style={{ left: menu.x, top: menu.y }} role="menu">
        {menu.items.map((item, i) => (
          <div key={`${item.label}-${i}`}>
            {item.divider && <div className="studio-menu__divider" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={item.danger ? "is-danger" : undefined}
              onClick={() => { onClose(); item.onSelect(); }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.hint && <kbd>{item.hint}</kbd>}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
