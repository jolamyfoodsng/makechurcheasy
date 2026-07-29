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
}

export function BibleTopbar({ isExpanded, selectedBook: _selectedBook, onToggle, headerActions, children }: BibleTopbarProps) {
  const { t } = useTranslation();
  const toggleLabel = isExpanded
    ? t("bible.closeBibleBrowser", "Close Bible browser")
    : t("bible.browseBible", "Browse Bible");

  return (
    <section className={`dock-bible-topbar${isExpanded ? " dock-bible-topbar--expanded" : ""}`}>
      <div className="dock-bible-topbar__header">
        <button
          type="button"
          className={`dock-bible-topbar__toggle-btn${isExpanded ? " dock-bible-topbar__toggle-btn--active" : ""}`}
          onClick={onToggle}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          <Icon name="menu_book" size={14} />
          <span className="dock-bible-topbar__toggle-label">{t("bible.browse", "Browse")}</span>
          <Icon name={isExpanded ? "expand_less" : "expand_more"} size={12} />
        </button>
        {headerActions}
      </div>

      {isExpanded && children}
    </section>
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
  availableTranslations: Array<{ value: string; label: string }>;
  compareEnabled?: boolean;
  onBookToggle: (event: React.MouseEvent) => void;
  onBookSelect: (book: string) => void;
  onChapterToggle: (event: React.MouseEvent) => void;
  onChapterSelect: (chapter: number) => void;
  onVerseToggle: (event: React.MouseEvent) => void;
  onVerseSelect: (verse: number) => void;
  onVersionChange: (version: string) => void;
  onGoToChapter?: () => void;
  onTranslationsChanged?: () => void;
  abbreviateBook: (book: string) => string;
  BOOK_CHAPTERS: typeof import("../dockTypes").BOOK_CHAPTERS;
  searchSection: React.ReactNode;
  headerActions?: React.ReactNode;
  compactActions?: React.ReactNode;
  onMenuClick?: () => void;
  children: React.ReactNode;
  isCompact?: boolean;
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
  onVersionChange,
  onGoToChapter,
  onTranslationsChanged,
  abbreviateBook,
  BOOK_CHAPTERS,
  searchSection,
  headerActions,
  compactActions,
  children,
  isCompact = false,
  onMenuClick,
}: BibleDockContainerProps, ref) {
  const [_isNarrowScreen, _setIsNarrowScreen] = useState(false);

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
      onGoToChapter={onGoToChapter}
      abbreviateBook={abbreviateBook}
      BOOK_CHAPTERS={BOOK_CHAPTERS}
    />
  );

  return (
    <div ref={ref} className={rootClass}>
      {/* Search bar + Translation select row */}
      <div className="dock-bible-search-row">
        <div className="dock-bible-search-row__input">
          {isCompact && onMenuClick && (
            <button
              type="button"
              className="dock-shell-icon-btn dock-bible-search-row__menu-btn"
              onClick={onMenuClick}
              aria-label="Menu"
              title="Menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/></svg>
            </button>
          )}
          {searchSection}
        </div>
        <div className="dock-bible-search-row__translation">
          <BibleVersionLibrary
            activeTranslation={activeTranslation}
            availableTranslations={_availableTranslations}
            onVersionChange={onVersionChange}
            onTranslationsChanged={onTranslationsChanged}
            disabled={compareEnabled}
          />
          {isCompact && compactActions ? (
            <div className="dock-bible-compact-actions">{compactActions}</div>
          ) : (
            <BibleTopbar
              isExpanded={isTopbarExpanded}
              selectedBook={selectedBook}
              onToggle={() => setIsTopbarExpanded((prev: boolean) => !prev)}
              headerActions={headerActions}
            />
          )}
        </div>
      </div>

      {isTopbarExpanded && (
        <div className="dock-bible-controls-panel">
          {browseControls}
        </div>
      )}

      {/* Main content area */}
      {children}
    </div>
  );
});
