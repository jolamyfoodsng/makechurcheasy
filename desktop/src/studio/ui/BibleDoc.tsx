/**
 * BibleDoc.tsx — the Bible in the Studio, in two parts:
 *  - BibleNav (left panel): search + translation, and the book list. Click a book to drop down its chapters.
 *  - BibleVerses (bottom Content tab): the chapter's verses, wide, like a reading list.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "../../components/icons/NativeIcons";
import { getChapterCount } from "../../bible/bibleData";
import { BIBLE_BOOKS } from "../../bible/types";
import { parseBibleSearch } from "../../dock/bibleSearchParser";
import { bookColors } from "../studioBooks";
import type { StudioVerse } from "../useStudioBible";

interface BibleNavProps {
  translations: string[];
  translation: string;
  onTranslation: (abbr: string) => void;
  book: string;
  chapter: number;
  chapterCount: number;
  onGoTo: (book: string, chapter: number, verse?: number) => void;
}

export function BibleNav(props: BibleNavProps) {
  const { translations, translation, onTranslation, book, chapter, chapterCount, onGoTo } = props;
  const [query, setQuery] = useState("");
  const [openBook, setOpenBook] = useState<string | null>(book);
  const [pickedCount, setPickedCount] = useState(chapterCount);
  const booksRef = useRef<HTMLDivElement>(null);
  const [transOpen, setTransOpen] = useState(false);

  // Follow the book when it changes from the search box, Verse AI or the ‹ › buttons.
  useEffect(() => {
    setOpenBook(book);
    setPickedCount(chapterCount);
  }, [book, chapterCount]);

  useEffect(() => {
    if (!openBook) return;
    // After layout: put the open book at the top of the list so its chapters are in view.
    const id = requestAnimationFrame(() => {
      const box = booksRef.current;
      const item = box?.querySelector<HTMLElement>("[data-open='true']");
      if (box && item) box.scrollTop = Math.max(0, item.offsetTop - box.offsetTop - 4);
    });
    return () => cancelAnimationFrame(id);
  }, [openBook, pickedCount]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    try {
      return parseBibleSearch(query, { context: { currentBook: book, currentChapter: chapter } })
        .filter((r) => r.book && r.chapter !== null && r.action !== "clear")
        .slice(0, 6);
    } catch {
      return [];
    }
  }, [query, book, chapter]);

  const submit = (index = 0) => {
    const hit = suggestions[index];
    if (!hit || hit.chapter === null) return;
    onGoTo(hit.book, hit.chapter, hit.verse ?? undefined);
    setQuery("");
  };

  const toggleBook = async (name: string) => {
    if (openBook === name) {
      setOpenBook(null);
      return;
    }
    setOpenBook(name);
    if (name === book) {
      setPickedCount(chapterCount);
      return;
    }
    try {
      setPickedCount(await getChapterCount(name, translation));
    } catch {
      setPickedCount(1);
    }
  };

  return (
    <div className="sx-bible">
      <div className="sx-bible__search">
        <div className="sx-search">
          <Search size={15} />
          <input
            value={query}
            placeholder='e.g. j316, joh316, john 3:16, or "for God"'
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setQuery("");
            }}
            aria-label="Find a verse"
          />
        </div>
        <div className="sx-trans">
          <button type="button" className="sx-trans__btn" onClick={() => setTransOpen((v) => !v)} aria-expanded={transOpen}>
            {translation} <ChevronDown size={12} />
          </button>
          {transOpen && (
            <div className="sx-trans__menu" role="listbox">
              {translations.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="option"
                  aria-selected={t === translation}
                  className={t === translation ? "is-on" : ""}
                  onClick={() => { onTranslation(t); setTransOpen(false); }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        {suggestions.length > 0 && (
          <ul className="sx-suggest" role="listbox">
            {suggestions.map((s, i) => (
              <li key={`${s.label}-${i}`}>
                <button type="button" onClick={() => submit(i)}>{s.label}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sx-bible__cols">
        <div className="sx-col sx-col--books" ref={booksRef} role="tree" aria-label="Books">
          {(BIBLE_BOOKS as readonly string[]).map((b) => {
            const isOpen = b === openBook;
            return (
              <div key={b} className="sx-bookitem" data-open={isOpen ? "true" : undefined}>
                <button
                  type="button"
                  role="treeitem"
                  aria-expanded={isOpen}
                  className={`sx-bk${isOpen ? " is-open" : ""}${b === book ? " is-current" : ""}`}
                  onClick={() => void toggleBook(b)}
                >
                  <span className="sx-bk__dot" style={{ background: bookColors(b).base }} />
                  <span className="sx-bk__name">{b}</span>
                  <ChevronDown size={13} className={`sx-bk__chev${isOpen ? " is-flipped" : ""}`} />
                </button>
                {isOpen && (
                  <div className="sx-chapters" role="group" aria-label={`${b} chapters`}>
                    {Array.from({ length: Math.max(1, pickedCount) }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`sx-chapter${b === book && n === chapter ? " is-on" : ""}`}
                        onClick={() => onGoTo(b, n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface BibleVersesProps {
  book: string;
  chapter: number;
  translation: string;
  verses: StudioVerse[];
  loading: boolean;
  /** Verse in Preview, and the verse on the screen (null when it is another chapter). */
  previewVerse: number;
  liveVerse: number | null;
  onStep: (delta: 1 | -1) => void;
  onPickVerse: (verse: number) => void;
  onLiveVerse: (verse: number) => void;
}

export function BibleVerses(props: BibleVersesProps) {
  const { book, chapter, translation, verses, loading, previewVerse, liveVerse, onStep, onPickVerse, onLiveVerse } = props;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-preview='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [previewVerse, book, chapter, verses.length]);

  return (
    <div className="sx-versepane">
  <div className="sx-bible__nav">
    <button type="button" className="sx-iconbtn" onClick={() => onStep(-1)} aria-label="Previous chapter"><ChevronLeft size={16} /></button>
    <div className="sx-bible__title">{book} {chapter}</div>
    <button type="button" className="sx-iconbtn" onClick={() => onStep(1)} aria-label="Next chapter"><ChevronRight size={16} /></button>
  </div>
  <div className="sx-verses" ref={listRef}>
{loading && verses.length === 0 && <div className="sx-empty">Loading…</div>}
{!loading && verses.length === 0 && (
  <div className="sx-empty">This chapter isn't in {translation}. Pick another translation.</div>
)}
{verses.map((v) => {
  const isPreview = v.verse === previewVerse;
  const isLive = v.verse === liveVerse;
  return (
    <div
      key={v.verse}
      role="button"
      tabIndex={0}
      data-preview={isPreview ? "true" : undefined}
      className={`sx-verse${isPreview ? " is-preview" : ""}${isLive ? " is-live" : ""}`}
      onClick={() => onPickVerse(v.verse)}
      onDoubleClick={() => onLiveVerse(v.verse)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onPickVerse(v.verse);
      }}
    >
      <span className="sx-verse__num">{v.verse}</span>
      <span className="sx-verse__text">{v.text}</span>
      {isLive && <span className="sx-verse__live">LIVE</span>}
    </div>
  );
})}
  </div>
    </div>
  );
}
