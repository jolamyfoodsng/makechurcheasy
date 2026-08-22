/**
 * BibleDockUI.tsx — Separated UI components for the Bible dock tab.
 *
 * Architecture:
 * - BibleDockContainer: Stateful wrapper, layout, responsive behavior
 * - BibleTopbar: Toggle logic, expanded/collapsed rendering
 * - BibleControls: Pure presentational controls (book, chapter, verse, version)
 */

import { forwardRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import BibleVersionLibrary from "./BibleVersionLibrary";
import DockBottomSearchPanel from "./DockBottomSearchPanel";
import type { DockSearchPlacement } from "../dockSearchPlacement";

interface BibleControlsProps {
  selectedBook: string | null;
  selectedChapter: number | null;
  selectedVerse: number | null;
  chapterCount: number;
  verseCount: number;
  isBookDropdownOpen: boolean;
  isChapterDropdownOpen: boolean;
  isVerseDropdownOpen: boolean;
  onBookToggle: (event: React.MouseEvent) => void;
  onBookSelect: (book: string) => void;
  onChapterToggle: (event: React.MouseEvent) => void;
  onChapterSelect: (chapter: number) => void;
  onVerseToggle: (event: React.MouseEvent) => void;
  onVerseSelect: (verse: number) => void;
  canGoPreviousChapter: boolean;
  canGoNextChapter: boolean;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onGoToChapter?: () => void;
  abbreviateBook: (book: string) => string;
  BOOK_CHAPTERS: typeof import("../dockTypes").BOOK_CHAPTERS;
}

export function BibleControls({
  selectedBook,
  selectedChapter,
  selectedVerse,
  chapterCount,
  verseCount,
  isBookDropdownOpen,
  isChapterDropdownOpen,
  isVerseDropdownOpen,
  onBookToggle,
  onBookSelect,
  onChapterToggle,
  onChapterSelect,
  onVerseToggle,
  onVerseSelect,
  canGoPreviousChapter,
  canGoNextChapter,
  onPreviousChapter,
  onNextChapter,
  abbreviateBook,
  BOOK_CHAPTERS,
}: BibleControlsProps) {
  const { t } = useTranslation();
  return (
    <div className="dock-bible-controls">
      {/* Book Selector */}
      <div
        className={[
          "dock-bible-controls__book-card",
          isBookDropdownOpen ? "dock-bible-controls__book-card--open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className="dock-bible-controls__book-trigger"
          onClick={onBookToggle}
          disabled={!selectedBook}
          aria-haspopup="listbox"
          aria-expanded={isBookDropdownOpen}
          aria-label={t("bible.chooseBook", "Choose book")}
          title={t("bible.chooseBook", "Choose book")}>
          <span className="dock-bible-controls__book-label">{t("bible.book", "Book")}</span>
          <span className="dock-bible-controls__book-name">
            {selectedBook ?? t("bible.chooseBook", "Choose book")}
          </span>
          <Icon name="expand_more" size={14} />
        </button>

        {isBookDropdownOpen && (
          <div className="dock-bible-controls__book-dropdown" role="listbox" aria-label={t("bible.bibleBooks", "Bible books")} onMouseDown={(e) => e.stopPropagation()}>
            <div className="dock-bible-controls__dropdown-header">
              <span>{t("bible.selectBook", "Select book")}</span>
            </div>
            <div className="dock-bible-grid dock-bible-grid--console">
              {Object.keys(BOOK_CHAPTERS).map((book) => {
                const isActive = book === selectedBook;
                return (
                  <button
                    key={`book-option-${book}`}
                    type="button"
                    className={`dock-bible-book-btn${isActive ? " dock-bible-book-btn--active" : ""}`}
                    onClick={() => onBookSelect(book)}
                    role="option"
                    aria-selected={isActive}
                    aria-label={book}
                    title={book}
                  >
                    <span className="dock-bible-book-btn__abbr">{abbreviateBook(book)}</span>
                    <span className="dock-bible-book-btn__name">{book}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Chapter + Verse Row */}
      <div className="dock-bible-controls__compact">
        {/* Chapter Selector */}
        <div
          className={[
            "dock-bible-controls__chapter-picker",
            isChapterDropdownOpen ? "dock-bible-controls__chapter-picker--open" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <button
            type="button"
            className="dock-bible-controls__chapter-trigger"
            onClick={onChapterToggle}
            disabled={!selectedBook || !selectedChapter || chapterCount <= 0}
            aria-haspopup="listbox"
            aria-expanded={isChapterDropdownOpen}
            aria-label={t("bible.chooseChapter")}
            title="Expand">
            <span className="dock-bible-controls__compact-label">Ch</span>
            <span className="dock-bible-controls__compact-value">{selectedChapter ?? "--"}</span>
            <Icon name="expand_more" size={12} />
          </button>

          {isChapterDropdownOpen && (
            <div className="dock-bible-controls__chapter-dropdown" role="listbox" aria-label="Chapters" onMouseDown={(e) => e.stopPropagation()}>
              {Array.from({ length: chapterCount }, (_, index) => {
                const chapter = index + 1;
                const isActive = chapter === selectedChapter;
                return (
                  <button
                    key={`chapter-option-${chapter}`}
                    type="button"
                    className={`dock-bible-controls__chapter-option${isActive ? " dock-bible-controls__chapter-option--active" : ""}`}
                    onClick={() => onChapterSelect(chapter)}
                    role="option"
                    aria-selected={isActive}
                    title={t("bible.chapter", { number: chapter })}
                  >
                    {chapter}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="dock-bible-controls__chapter-nav"
          aria-label={t("bible.chapterNavigation", "Chapter navigation")}
        >
          <button
            type="button"
            className="dock-bible-controls__chapter-nav-btn"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPreviousChapter();
            }}
            disabled={!canGoPreviousChapter}
            aria-label={t("bible.previousChapter", "Previous chapter")}
            title={t("bible.previousChapter", "Previous chapter")}
          >
            <Icon name="chevron_left" size={14} />
          </button>
          <button
            type="button"
            className="dock-bible-controls__chapter-nav-btn"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onNextChapter();
            }}
            disabled={!canGoNextChapter}
            aria-label={t("bible.nextChapter", "Next chapter")}
            title={t("bible.nextChapter", "Next chapter")}
          >
            <Icon name="chevron_right" size={14} />
          </button>
        </div>



        {/* Verse Selector */}
        <div
          className={[
            "dock-bible-controls__verse-picker",
            isVerseDropdownOpen ? "dock-bible-controls__verse-picker--open" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <button
            type="button"
            className="dock-bible-controls__verse-trigger"
            onClick={onVerseToggle}
            disabled={!selectedBook || !selectedChapter || verseCount <= 0}
            aria-haspopup="listbox"
            aria-expanded={isVerseDropdownOpen}
            aria-label={t("bible.chooseVerse")}
            title="Expand">
            <span className="dock-bible-controls__compact-label">V</span>
            <span className="dock-bible-controls__compact-value">{selectedVerse ?? "--"}</span>
            <Icon name="expand_more" size={12} />
          </button>

          {isVerseDropdownOpen && (
            <div className="dock-bible-controls__verse-dropdown" role="listbox" aria-label="Verses" onMouseDown={(e) => e.stopPropagation()}>
              {Array.from({ length: verseCount }, (_, index) => {
                const verse = index + 1;
                const isActive = verse === selectedVerse;
                return (
                  <button
                    key={`verse-option-${verse}`}
                    type="button"
                    className={`dock-bible-controls__verse-option${isActive ? " dock-bible-controls__verse-option--active" : ""}`}
                    onClick={() => onVerseSelect(verse)}
                    role="option"
                    aria-selected={isActive}
                    title={t("bible.verse", { number: verse })}
                  >
                    {verse}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Version + Options */}

    </div>
  );
}

interface BibleTopbarProps {
  isExpanded: boolean;
  selectedBook: string | null;
  onToggle: () => void;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
  hideToggle?: boolean;
}

export function BibleTopbar({
  isExpanded,
  selectedBook: _selectedBook,
  onToggle,
  headerActions,
  children,
  hideToggle = false,
}: BibleTopbarProps) {
  const { t } = useTranslation();
  const toggleLabel = isExpanded
    ? t("bible.closeBibleBrowser", "Close Bible browser")
    : t("bible.browseBible", "Browse Bible");

  return (
    <section className={`dock-bible-topbar${isExpanded ? " dock-bible-topbar--expanded" : ""}`}>
      <div className="dock-bible-topbar__header">
        {!hideToggle && (
          <button
            type="button"
            className={`dock-bible-topbar__toggle-btn${isExpanded ? " dock-bible-topbar__toggle-btn--active" : ""}`}
            onClick={onToggle}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            <Icon name="menu_book" size={14} />
            <Icon name={isExpanded ? "expand_less" : "expand_more"} size={12} />
          </button>
        )}
        {headerActions}
      </div>

      {isExpanded && children}
    </section>
  );
}

type BibleContextualActions = React.ReactNode | ((isExpanded: boolean, onToggle: () => void) => React.ReactNode);

interface BibleSearchRowProps {
  searchSection: React.ReactNode;
  activeTranslation: string;
  availableTranslations: Array<{ value: string; label: string; language?: string }>;
  onVersionChange: (version: string) => void;
  compareEnabled: boolean;
  isCompact: boolean;
  isNarrowWidth?: boolean;
  compactActions?: BibleContextualActions;
  isExpanded: boolean;
  onToggle: () => void;
  headerActions?: BibleContextualActions;
  hideBrowseToggle?: boolean;
  showHeaderActionsWhenBrowseHidden?: boolean;
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
  isExpanded,
  onToggle,
  headerActions,
  hideBrowseToggle = false,
  showHeaderActionsWhenBrowseHidden = false,
}: BibleSearchRowProps) {
  const renderedCompactActions = typeof compactActions === "function"
    ? compactActions(isExpanded, onToggle)
    : compactActions;
  const renderedHeaderActions = typeof headerActions === "function"
    ? headerActions(isExpanded, onToggle)
    : headerActions;
  const shouldUseNarrowOverflowActions = isNarrowWidth && Boolean(renderedCompactActions);

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
        ) : hideBrowseToggle && showHeaderActionsWhenBrowseHidden && renderedHeaderActions ? (
          <div className="dock-bible-search-row__actions">{renderedHeaderActions}</div>
        ) : !hideBrowseToggle && isCompact && renderedCompactActions ? (
          <div className="dock-bible-compact-actions">{renderedCompactActions}</div>
        ) : !hideBrowseToggle ? (
          <BibleTopbar
            isExpanded={isExpanded}
            selectedBook={null}
            onToggle={onToggle}
            headerActions={renderedHeaderActions}
            hideToggle={hideBrowseToggle}
          />
        ) : null}
      </div>
    </div>
  );
}

interface BibleDockContainerProps {
  isTopbarExpanded: boolean;
  setIsTopbarExpanded: (value: boolean | ((prev: boolean) => boolean)) => void;
  selectedBook: string | null;
  selectedChapter: number | null;
  selectedVerse: number | null;
  activeTranslation: string;
  chapterCount: number;
  verseCount: number;
  isBookDropdownOpen: boolean;
  isChapterDropdownOpen: boolean;
  isVerseDropdownOpen: boolean;
  availableTranslations: Array<{ value: string; label: string; language?: string }>;
  compareEnabled?: boolean;
  onBookToggle: (event: React.MouseEvent) => void;
  onBookSelect: (book: string) => void;
  onChapterToggle: (event: React.MouseEvent) => void;
  onChapterSelect: (chapter: number) => void;
  onVerseToggle: (event: React.MouseEvent) => void;
  onVerseSelect: (verse: number) => void;
  canGoPreviousChapter: boolean;
  canGoNextChapter: boolean;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onVersionChange: (version: string) => void;
  onGoToChapter?: () => void;
  abbreviateBook: (book: string) => string;
  BOOK_CHAPTERS: typeof import("../dockTypes").BOOK_CHAPTERS;
  searchSection: React.ReactNode;
  searchPlacement?: DockSearchPlacement;
  headerActions?: BibleContextualActions;
  compactActions?: BibleContextualActions;
  children: React.ReactNode | ((bottomPanel: React.ReactNode, bottomToolbarActions: React.ReactNode) => React.ReactNode);
  isCompact?: boolean;
  isNarrowWidth?: boolean;
}

export const BibleDockContainer = forwardRef<HTMLDivElement, BibleDockContainerProps>(function BibleDockContainer({
  isTopbarExpanded,
  setIsTopbarExpanded,
  selectedBook,
  selectedChapter,
  selectedVerse,
  activeTranslation,
  chapterCount,
  verseCount,
  isBookDropdownOpen,
  isChapterDropdownOpen,
  isVerseDropdownOpen,
  availableTranslations: _availableTranslations,
  compareEnabled = false,
  onBookToggle,
  onBookSelect,
  onChapterToggle,
  onChapterSelect,
  onVerseToggle,
  onVerseSelect,
  canGoPreviousChapter,
  canGoNextChapter,
  onPreviousChapter,
  onNextChapter,
  onVersionChange,
  onGoToChapter,
  abbreviateBook,
  BOOK_CHAPTERS,
  searchSection,
  headerActions,
  compactActions,
  children,
  isCompact = false,
  isNarrowWidth = false,
  searchPlacement = "top",
}: BibleDockContainerProps, ref) {
  const [_isNarrowScreen, _setIsNarrowScreen] = useState(false);
  const [isBottomSearchExpanded, setIsBottomSearchExpanded] = useState(true);
  const [isBottomBrowseExpanded, setIsBottomBrowseExpanded] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      _setIsNarrowScreen(window.innerWidth < 200);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);

    return () => {
      window.removeEventListener("resize", checkScreenSize);
    };
  }, []);

  const rootClass = [
    "dock-module",
    "dock-module--bible",
    isCompact ? "dock-module--bible--compact" : "",
    isNarrowWidth ? "dock-module--bible--narrow" : "",
  ].filter(Boolean).join(" ");
  const browseControls = (
    <BibleControls
      selectedBook={selectedBook}
      selectedChapter={selectedChapter}
      selectedVerse={selectedVerse}
      chapterCount={chapterCount}
      verseCount={verseCount}
      isBookDropdownOpen={isBookDropdownOpen}
      isChapterDropdownOpen={isChapterDropdownOpen}
      isVerseDropdownOpen={isVerseDropdownOpen}
      onBookToggle={onBookToggle}
      onBookSelect={onBookSelect}
      onChapterToggle={onChapterToggle}
      onChapterSelect={onChapterSelect}
      onVerseToggle={onVerseToggle}
      onVerseSelect={onVerseSelect}
      canGoPreviousChapter={canGoPreviousChapter}
      canGoNextChapter={canGoNextChapter}
      onPreviousChapter={onPreviousChapter}
      onNextChapter={onNextChapter}
      onGoToChapter={onGoToChapter}
      abbreviateBook={abbreviateBook}
      BOOK_CHAPTERS={BOOK_CHAPTERS}
    />
  );

  const renderSearchRow = (
    expanded: boolean,
    onToggle: () => void,
    hideBrowseToggle = false,
    showHeaderActionsWhenBrowseHidden = false,
  ) => (
    <BibleSearchRow
      searchSection={searchSection}
      activeTranslation={activeTranslation}
      availableTranslations={_availableTranslations}
      onVersionChange={onVersionChange}
      compareEnabled={compareEnabled}
      isCompact={isCompact}
      isNarrowWidth={isNarrowWidth}
      compactActions={compactActions}
      isExpanded={expanded}
      onToggle={onToggle}
      headerActions={headerActions}
      hideBrowseToggle={hideBrowseToggle}
      showHeaderActionsWhenBrowseHidden={showHeaderActionsWhenBrowseHidden}
    />
  );

  const showTopSearch = searchPlacement !== "bottom";
  const showBottomSearch = searchPlacement !== "top";
  const bottomSearchPanel = showBottomSearch ? (
    <DockBottomSearchPanel
      expanded={isBottomSearchExpanded}
      onToggle={() => setIsBottomSearchExpanded((current) => !current)}
    >
      {isBottomBrowseExpanded && (
        <div className="dock-bible-controls-panel dock-bible-controls-panel--bottom">
          {browseControls}
        </div>
      )}
      {renderSearchRow(
        isBottomBrowseExpanded,
        () => setIsBottomBrowseExpanded((current) => !current),
        true,
      )}
    </DockBottomSearchPanel>
  ) : null;
  const bottomBrowseExpanded = searchPlacement === "bottom"
    ? isBottomBrowseExpanded
    : isTopbarExpanded;
  const onBottomBrowseToggle = searchPlacement === "bottom"
    ? () => setIsBottomBrowseExpanded((current) => !current)
    : () => setIsTopbarExpanded((current) => !current);
  const bottomToolbarActions = isCompact
    ? (searchPlacement === "top"
      ? null
      : (typeof compactActions === "function"
        ? compactActions(bottomBrowseExpanded, onBottomBrowseToggle)
        : compactActions))
    : (searchPlacement === "top"
      ? null
      : (typeof headerActions === "function"
        ? headerActions(bottomBrowseExpanded, onBottomBrowseToggle)
        : headerActions));
  const renderedChildren = typeof children === "function"
    ? children(bottomSearchPanel, bottomToolbarActions)
    : children;

  return (
    <div ref={ref} className={rootClass}>
      {showTopSearch && renderSearchRow(
        isTopbarExpanded,
        () => setIsTopbarExpanded((prev: boolean) => !prev),
        true,
        true,
      )}

      {showTopSearch && isTopbarExpanded && (
        <div className="dock-bible-controls-panel">
          {browseControls}
        </div>
      )}

      {/* Main content area */}
      {renderedChildren}

      {typeof children === "function" ? null : bottomSearchPanel}
    </div>
  );
});
