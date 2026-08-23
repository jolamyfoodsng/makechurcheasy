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

  return (
    <section className={`dock-bottom-search-panel${expanded ? " dock-bottom-search-panel--expanded" : ""}`}>
      <div className="dock-bottom-search-panel__header">
        <div className="dock-bottom-search-panel__title" aria-label={label} title={label}>
          <Icon name="search" size={13} />
          <span className="dock-bottom-search-panel__label">{label}</span>
        </div>
        {!toggleInToolbar && (
          <button
            type="button"
            className="dock-bottom-search-panel__toggle"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            <Icon name={expanded ? "expand_more" : "expand_less"} size={15} />
          </button>
        )}
      </div>
      {expanded && <div className="dock-bottom-search-panel__body">{children}</div>}
    </section>
  );
}
