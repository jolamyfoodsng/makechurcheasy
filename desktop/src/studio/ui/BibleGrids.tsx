/**
 * BibleGrids.tsx — the Holyrics-style picker along the bottom: all 66 books (coloured by
 * group), then the chapter numbers and the verse numbers of the open chapter.
 */
import { BIBLE_BOOKS } from "../../bible/types";
import { BOOK_GROUP_COLORS, bookColors, bookGroupAt } from "../studioBooks";
import type { CSSProperties } from "react";

interface BibleGridsProps {
  book: string;
  chapter: number;
  chapterCount: number;
  verseCount: number;
  previewVerse: number;
  liveVerse: number | null;
  onBook: (book: string) => void;
  onChapter: (chapter: number) => void;
  onPickVerse: (verse: number) => void;
  onLiveVerse: (verse: number) => void;
}

export default function BibleGrids(props: BibleGridsProps) {
  const { book, chapter, chapterCount, verseCount, previewVerse, liveVerse, onBook, onChapter, onPickVerse, onLiveVerse } = props;
  const colors = bookColors(book);
  const chapters = Array.from({ length: Math.max(0, chapterCount) }, (_, i) => i + 1);
  const verses = Array.from({ length: Math.max(0, verseCount) }, (_, i) => i + 1);

  return (
    <div className="sx-grids">
      <div className="sx-books" role="listbox" aria-label="Books">
        {(BIBLE_BOOKS as readonly string[]).map((name, index) => {
          const c = BOOK_GROUP_COLORS[bookGroupAt(index)];
          const on = name === book;
          const style: CSSProperties = { background: on ? c.dark : c.base, borderColor: on ? "#fff" : "rgba(255,255,255,0.14)" };
          return (
            <button key={name} type="button" role="option" aria-selected={on} className={`sx-book${on ? " is-on" : ""}`} style={style} onClick={() => onBook(name)}>
              {name}
            </button>
          );
        })}
      </div>
      <div className="sx-nums">
        <div className="sx-nums__col">
          <div className="sx-nums__head"><span>CHAPTER · {book}</span><span>{chapterCount} chapters</span></div>
          <div className="sx-nums__grid">
            {chapters.map((n) => {
              const on = n === chapter;
              return (
                <button key={n} type="button" className={`sx-num${on ? " is-on" : ""}`} style={{ background: on ? colors.dark : colors.base }} onClick={() => onChapter(n)}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
        <div className="sx-nums__col">
          <div className="sx-nums__head"><span>VERSE · click = Preview · double-click = Live</span><span>{verseCount} verses</span></div>
          <div className="sx-nums__grid">
            {verses.map((n) => {
              const isLive = n === liveVerse;
              const isPreview = n === previewVerse && !isLive;
              const cls = `sx-num${isLive ? " is-live" : ""}${isPreview ? " is-preview" : ""}`;
              return (
                <button key={n} type="button" className={cls} style={{ background: isLive ? undefined : isPreview ? colors.dark : colors.light }} onClick={() => onPickVerse(n)} onDoubleClick={() => onLiveVerse(n)}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
