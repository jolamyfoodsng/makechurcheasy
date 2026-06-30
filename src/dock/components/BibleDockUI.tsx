/**
 * BibleDockUI.tsx — Separated UI components for the Bible dock tab.
 *
 * Architecture:
 * - BibleDockContainer: Stateful wrapper, layout, responsive behavior
 * - BibleTopbar: Toggle logic, expanded/collapsed rendering
 * - BibleControls: Pure presentational controls (book, chapter, verse, version)
 */

import { useEffect, useState } from "react";
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
  onOptionsClick: () => void;
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
          aria-label={t("bible.chooseBook")}
         title="Choose Book">
          <span className="dock-bible-controls__book-label"></span>
          <span className="dock-bible-controls__book-name">
            {selectedBook ?? t("bible.chooseBook")}
          </span>
          <Icon name="expand_more" size={14} />
        </button>

        {isBookDropdownOpen && (
          <div className="dock-bible-controls__book-dropdown" role="listbox" aria-label="Bible books" onMouseDown={(e) => e.stopPropagation()}>
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
  children: React.ReactNode;
}

export function BibleTopbar({ isExpanded, selectedBook: _selectedBook, onToggle, headerActions, children }: BibleTopbarProps) {
  const { t } = useTranslation();
  return (
    <section className={`dock-bible-topbar${isExpanded ? " dock-bible-topbar--expanded" : ""}`}>
      <div className="dock-bible-topbar__header">
        <button
          type="button"
          className="dock-bible-topbar__toggle-btn"
          onClick={onToggle}
          aria-label={isExpanded ? t("bible.closeOptions") : t("bible.options")}
          title={isExpanded ? t("bible.closeOptions") : t("bible.options")}
        >
          <Icon name="book_open" size={14} />
          {/* <Icon name={isExpanded ? "expand_less" : "expand_more"} size={14} /> */}
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
  onBookToggle: (event: React.MouseEvent) => void;
  onBookSelect: (book: string) => void;
  onChapterToggle: (event: React.MouseEvent) => void;
  onChapterSelect: (chapter: number) => void;
  onVerseToggle: (event: React.MouseEvent) => void;
  onVerseSelect: (verse: number) => void;
  onVersionChange: (version: string) => void;
  onOptionsClick: () => void;
  onGoToChapter?: () => void;
  onTranslationsChanged?: () => void;
  abbreviateBook: (book: string) => string;
  BOOK_CHAPTERS: typeof import("../dockTypes").BOOK_CHAPTERS;
  searchSection: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export function BibleDockContainer({
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
  onBookToggle,
  onBookSelect,
  onChapterToggle,
  onChapterSelect,
  onVerseToggle,
  onVerseSelect,
  onVersionChange,
  onOptionsClick,
  onGoToChapter,
  onTranslationsChanged,
  abbreviateBook,
  BOOK_CHAPTERS,
  searchSection,
  headerActions,
  children,
}: BibleDockContainerProps) {
  // create a usestate that becomes true when the screen width is less than 200px, and false when it is greater than 200px
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

  return (
    <div className="dock-module dock-module--bible">
      {/* Search bar + Translation select row */}
      <div className="dock-bible-search-row">
        <div className="dock-bible-search-row__input">{searchSection}</div>
        <div className="dock-bible-search-row__translation">
          <BibleVersionLibrary
            activeTranslation={activeTranslation}
            availableTranslations={_availableTranslations}
            onVersionChange={onVersionChange}
            onTranslationsChanged={onTranslationsChanged}
          />
          <BibleTopbar
            isExpanded={isTopbarExpanded}
            selectedBook={selectedBook}
            onToggle={() => setIsTopbarExpanded((prev: boolean) => !prev)}
            headerActions={headerActions}
          >
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
              onOptionsClick={onOptionsClick}
              onGoToChapter={onGoToChapter}
              abbreviateBook={abbreviateBook}
              BOOK_CHAPTERS={BOOK_CHAPTERS}
            />
          </BibleTopbar>
        </div>



      </div>

      {/* Topbar with toggle */}
      {/* Main content area */}
      {children}
    </div>
  );
}
