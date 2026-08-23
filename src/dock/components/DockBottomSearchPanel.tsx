import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import "./DockBottomSearchPanel.css";

interface Props {
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Render the expand/collapse control in DockBottomToolbar instead of here. */
  toggleInToolbar?: boolean;
}

export default function DockBottomSearchPanel({ expanded, onToggle, children, toggleInToolbar = false }: Props) {
  const { t } = useTranslation();
  const label = t("dock.searchPanel", "Search panel");
  const toggleLabel = expanded
    ? t("dock.collapseSearchPanel", "Collapse search panel")
    : t("dock.expandSearchPanel", "Expand search panel");

  // When the toolbar owns the toggle, keep the closed state completely hidden.
  // The toolbar button remains the standalone affordance for reopening it.
  if (!expanded && toggleInToolbar) return null;

  return (
    <section className={`dock-bottom-search-panel${expanded ? " dock-bottom-search-panel--expanded" : ""}`}>

      {expanded && <div className="dock-bottom-search-panel__body">{children}</div>}
    </section>
  );
}
