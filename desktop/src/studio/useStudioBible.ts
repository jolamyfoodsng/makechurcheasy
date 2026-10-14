/**
 * useStudioBible.ts — the Bible the Studio is looking at: translation, book, chapter and its verses.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getChapter, getChapterCount } from "../bible/bibleData";
import { getInstalledTranslations } from "../bible/bibleDb";
import { BIBLE_BOOKS } from "../bible/types";

const KEY = "mce-studio-bible";

export interface StudioVerse {
  verse: number;
  text: string;
}

interface Saved {
  translation: string;
  book: string;
  chapter: number;
}

function readSaved(): Saved {
  const fallback: Saved = { translation: "KJV", book: "John", chapter: 3 };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    const book = (BIBLE_BOOKS as readonly string[]).includes(String(parsed.book)) ? String(parsed.book) : fallback.book;
    const chapter = Number.isFinite(parsed.chapter) && Number(parsed.chapter) > 0 ? Number(parsed.chapter) : fallback.chapter;
    return { translation: String(parsed.translation || fallback.translation), book, chapter };
  } catch {
    return fallback;
  }
}

export interface StudioBible {
  translations: string[];
  translation: string;
  setTranslation: (abbr: string) => void;
  book: string;
  chapter: number;
  chapterCount: number;
  verses: StudioVerse[];
  loading: boolean;
  /** `book|chapter|translation` the verses belong to (they lag behind a fast navigation). */
  loadedKey: string;
  /** Go to a book and chapter. */
  goTo: (book: string, chapter: number) => void;
  /** Move to the next (+1) or previous (-1) chapter, crossing books. */
  step: (delta: 1 | -1) => Promise<void>;
}

export function useStudioBible(): StudioBible {
  const saved = useRef(readSaved()).current;
  const [translations, setTranslations] = useState<string[]>(["KJV"]);
  const [translation, setTranslationState] = useState(saved.translation);
  const [book, setBook] = useState(saved.book);
  const [chapter, setChapter] = useState(saved.chapter);
  const [chapterCount, setChapterCount] = useState(0);
  const [verses, setVerses] = useState<StudioVerse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getInstalledTranslations()
      .then((list) => {
        if (cancelled) return;
        const abbrs = list.map((t) => t.abbr).filter(Boolean);
        const merged = Array.from(new Set(["KJV", ...abbrs]));
        setTranslations(merged);
        setTranslationState((current) => (merged.includes(current) ? current : "KJV"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ translation, book, chapter }));
    } catch {
      /* ignore */
    }
  }, [translation, book, chapter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [count, passage] = await Promise.all([
          getChapterCount(book, translation),
          getChapter(book, chapter, translation),
        ]);
        if (cancelled) return;
        setChapterCount(count);
        setVerses(passage.verses.map((v) => ({ verse: v.verse, text: v.text })));
        setLoadedKey(`${book}|${chapter}|${translation}`);
      } catch {
        if (!cancelled) {
          setChapterCount(0);
          setVerses([]);
          setLoadedKey(`${book}|${chapter}|${translation}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [book, chapter, translation]);

  const goTo = useCallback((nextBook: string, nextChapter: number) => {
    setBook(nextBook);
    setChapter(Math.max(1, nextChapter));
  }, []);

  const step = useCallback(async (delta: 1 | -1) => {
    const books = BIBLE_BOOKS as readonly string[];
    const at = books.indexOf(book);
    if (delta === 1) {
      if (chapter < chapterCount) {
        setChapter(chapter + 1);
      } else if (at >= 0 && at < books.length - 1) {
        setBook(books[at + 1]);
        setChapter(1);
      }
      return;
    }
    if (chapter > 1) {
      setChapter(chapter - 1);
    } else if (at > 0) {
      const previous = books[at - 1];
      const count = await getChapterCount(previous, translation).catch(() => 1);
      setBook(previous);
      setChapter(Math.max(1, count));
    }
  }, [book, chapter, chapterCount, translation]);

  return {
    translations,
    translation,
    setTranslation: setTranslationState,
    book,
    chapter,
    chapterCount,
    verses,
    loading,
    loadedKey,
    goTo,
    step,
  };
}
