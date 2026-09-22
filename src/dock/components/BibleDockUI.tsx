/**
 * BibleDockUI.tsx — Search and placement components for the Bible dock tab.
 *
 * Bible navigation is intentionally handled by the search field and reader
 * toolbar.
 */

import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import BibleVersionLibrary from "./BibleVersionLibrary";
import DockBottomSearchPanel from "./DockBottomSearchPanel";
import type { DockSearchPlacement } from "../dockSearchPlacement";

type BibleContextualActions = React.ReactNode | (() => React.ReactNode);

interface BibleSearchRowProps {
  searchSection: React.ReactNode;
  activeTranslation: string;
  availableTranslations: Array<{ value: string; label: string; language?: string }>;
  onVersionChange: (version: string) => void;
  compareEnabled: boolean;
  isCompact: boolean;
  isNarrowWidth?: boolean;
  compactActions?: BibleContextualActions;
  headerActions?: BibleContextualActions;
  /** Show compare actions in the row; bottom-only keeps them in the toolbar. */
  showActions?: boolean;
  toolbarCollapsed?: boolean;
  onToolbarCollapseToggle?: () => void;
}

export function BibleSearchRow({
  searchSection,
  activeTranslation,
  availableTranslations,
  onVersionChange,
  compareEnabled,
  isCompact,
  isNarrowWidth = false,
  compactActions,
  headerActions,
  showActions = false,
  toolbarCollapsed = false,
  onToolbarCollapseToggle,
}: BibleSearchRowProps) {
  const { t } = useTranslation();
  const renderedCompactActions = typeof compactActions === "function"
    ? compactActions()
    : compactActions;
  const renderedHeaderActions = typeof headerActions === "function"
    ? headerActions()
    : headerActions;
  const shouldUseNarrowOverflowActions = showActions
    && isNarrowWidth
    && Boolean(renderedCompactActions);

  return (
    <div className="dock-bible-search-row">
      <div className="dock-bible-search-row__input">
        {searchSection}
      </div>
      <div className="dock-bible-search-row__translation">
        <BibleVersionLibrary
          activeTranslation={activeTranslation}
          availableTranslations={availableTranslations}
          onVersionChange={onVersionChange}
          disabled={compareEnabled}
        />
        {shouldUseNarrowOverflowActions ? (
          <div className="dock-bible-compact-actions dock-bible-compact-actions--narrow">
            {renderedCompactActions}
          </div>
        ) : showActions && isCompact && renderedCompactActions ? (
          <div className="dock-bible-compact-actions">
            {renderedCompactActions}
          </div>
        ) : showActions && renderedHeaderActions ? (
          <div className="dock-bible-search-row__actions">
            {renderedHeaderActions}
          </div>
        ) : null}
        {toolbarCollapsed && onToolbarCollapseToggle && (
          <button
            type="button"
            className="dock-bible-actions__overflow dock-bible-actions__uncollapse-btn"
            onClick={onToolbarCollapseToggle}
            aria-label={t("dock.bottomToolbar.expandTooltip", "Expand toolbar")}
            title={t("dock.bottomToolbar.expandTooltip", "Expand toolbar")}
          >
            <Icon name="expand_less" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

interface BibleDockContainerProps {
  activeTranslation: string;
  availableTranslations: Array<{ value: string; label: string; language?: string }>;
  compareEnabled?: boolean;
  onVersionChange: (version: string) => void;
  searchSection: React.ReactNode;
  searchPlacement?: DockSearchPlacement;
  headerActions?: BibleContextualActions;
  compactActions?: BibleContextualActions;
  children: React.ReactNode | ((bottomPanel: React.ReactNode, bottomToolbarActions: React.ReactNode, bottomPanelToggle?: { expanded: boolean; onToggle: () => void }) => React.ReactNode);
  isCompact?: boolean;
  isNarrowWidth?: boolean;
  toolbarCollapsed?: boolean;
  onToolbarCollapseToggle?: () => void;
}

export const BibleDockContainer = forwardRef<HTMLDivElement, BibleDockContainerProps>(function BibleDockContainer({
  activeTranslation,
  availableTranslations,
  compareEnabled = false,
  onVersionChange,
  searchSection,
  headerActions,
  compactActions,
  children,
  isCompact = false,
  isNarrowWidth = false,
  searchPlacement = "top",
  toolbarCollapsed = false,
  onToolbarCollapseToggle,
}, ref) {
  const rootClass = [
    "dock-module",
    "dock-module--bible",
    isCompact ? "dock-module--bible--compact" : "",
    isNarrowWidth ? "dock-module--bible--narrow" : "",
  ].filter(Boolean).join(" ");

  const renderSearchRow = (showActions = false, isBottomPanel = false) => (
    <BibleSearchRow
      searchSection={searchSection}
      activeTranslation={activeTranslation}
      availableTranslations={availableTranslations}
      onVersionChange={onVersionChange}
      compareEnabled={compareEnabled}
      isCompact={isCompact}
      isNarrowWidth={isNarrowWidth}
      compactActions={compactActions}
      headerActions={headerActions}
      showActions={showActions}
      toolbarCollapsed={isBottomPanel ? toolbarCollapsed : false}
      onToolbarCollapseToggle={isBottomPanel ? onToolbarCollapseToggle : undefined}
    />
  );

  const showTopSearch = searchPlacement !== "bottom";
  const showBottomSearch = searchPlacement !== "top";
  const bottomSearchPanel = showBottomSearch ? (
    <DockBottomSearchPanel
      expanded={true}
      toggleInToolbar
    >
      {renderSearchRow(toolbarCollapsed, true)}
    </DockBottomSearchPanel>
  ) : null;
  const bottomPanelToggle = undefined;
  // Keep Compare available in the bottom overflow even when the search row is
  // positioned at the top. The toolbar is the compact action home, so hiding
  // this branch when the search panel moves leaves Compare unexpectedly absent
  // after the toolbar is expanded.
  const bottomToolbarActions = isCompact ? compactActions : headerActions;
  const renderedBottomToolbarActions = typeof bottomToolbarActions === "function"
    ? bottomToolbarActions()
    : bottomToolbarActions;
  const renderedChildren = typeof children === "function"
    ? children(bottomSearchPanel, renderedBottomToolbarActions, bottomPanelToggle)
    : children;

  return (
    <div ref={ref} className={rootClass}>
      {showTopSearch && renderSearchRow(true, false)}

      {renderedChildren}

      {typeof children === "function" ? null : bottomSearchPanel}
    </div>
  );
});
