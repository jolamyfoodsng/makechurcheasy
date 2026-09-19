import type { ReactNode } from "react";
import "./DockBottomSearchPanel.css";

interface Props {
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Render the expand/collapse control in DockBottomToolbar instead of here. */
  toggleInToolbar?: boolean;
}

export default function DockBottomSearchPanel({ expanded, children, toggleInToolbar = false }: Props) {




  // When the toolbar owns the toggle, keep the closed state completely hidden.
  // The toolbar button remains the standalone affordance for reopening it.
  if (!expanded && toggleInToolbar) return null;

  return (
    <section className={`dock-bottom-search-panel${expanded ? " dock-bottom-search-panel--expanded" : ""}`}>

      {expanded && <div className="dock-bottom-search-panel__body">{children}</div>}
    </section>
  );
}
