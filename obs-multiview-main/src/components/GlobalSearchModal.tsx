/**
 * GlobalSearchModal.tsx — Universal Spotlight Search for Service Hub
 *
 * Triggers when user presses any letter/number key on the Service Hub page.
 * Searches across: Bible verses, Worship songs (title + lyrics), Speaker names.
 * Results grouped by source with category headings, snippet context, keyboard nav.
 *
 * Design: Dark glass-morphism spotlight, matching the existing SmartSearchModal style.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { resolveBookName, searchBible, getVerse, getPassage } from "../bible/bibleData";
import { BIBLE_BOOKS, BOOK_ABBREVS } from "../bible/types";
import { getAllSongs } from "../worship/worshipDb";
import type { Song } from "../worship/types";
import "./global-search.css";
import Icon from "./Icon";

// ── Types ──────────────────────────────────────────────────────────────────

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  /** Navigate to a specific tab/item on the Service Hub */
  onNavigate: (target: GlobalSearchTarget) => void;
  /** Optional initial character(s) that triggered the modal */
  initialQuery?: string;
}

export type GlobalSearchTarget =
  | { type: "bible"; book: string; chapter: number; verse: number }
  | { type: "worship"; songId: string }
  | { type: "speaker"; presetId: string };

interface GlobalSearchResult {
  id: string;
  category: "bible" | "worship" | "speaker";
  title: string;
  subtitle: string;
  snippet: string;
  icon: string;
  target: GlobalSearchTarget;
}

interface SpeakerPreset {
  id: string;
  label: string;
  name: string;
  title: string;
  ministry: string;
  titleLabel: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SPEAKER_PRESETS_STORAGE_KEY = "service-hub.speaker.presets";
const MAX_BIBLE_RESULTS = 5;
const MAX_WORSHIP_RESULTS = 5;
const MAX_SPEAKER_RESULTS = 4;
const DEBOUNCE_MS = 150;

// ── Helpers ────────────────────────────────────────────────────────────────

function loadSpeakerPresets(): SpeakerPreset[] {
  try {
    const raw = localStorage.getItem(SPEAKER_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p: unknown): p is SpeakerPreset =>
        typeof p === "object" && p !== null && "id" in p && "name" in p
    );
  } catch {
    return [];
  }
}

/** Extract a snippet around the match location with ellipsis context */
function extractSnippet(text: string, query: string, contextLen = 40): string {
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) {
    // No match — return first N chars
    return text.length > contextLen * 2
      ? text.slice(0, contextLen * 2) + "…"
      : text;
  }
  const start = Math.max(0, idx - contextLen);
  const end = Math.min(text.length, idx + query.length + contextLen);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}

/** Highlight matching portion in text */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const qLower = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(qLower);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="gs-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * Quick Bible reference parser (simplified from SmartSearchModal).
 * Returns resolved book + chapter + verse if the query looks like a reference.
 */
function parseQuickRef(input: string): { book: string; chapter: number; verse: number } | null {
  const raw = input.trim();
  if (!raw) return null;

  // Standard: "John 3:16", "Ps 23:1", "1 Cor 13:4"
  const std = raw.match(
    /^((?:\d\s*)?[a-zA-Z][a-zA-Z\s]*?)[\s.]*(\d+)(?:\s*[:.]?\s*(\d+))?$/
  );
  if (std) {
    const book = resolveBookName(std[1].trim());
    if (book) {
      const ch = parseInt(std[2], 10);
      const v = std[3] ? parseInt(std[3], 10) : 1;
      return { book, chapter: ch, verse: v };
    }
  }

  // Compact: "j316" → John 3:16
  const compact = raw.match(/^(\d?\s*[a-zA-Z]+)(\d{1,3})(\d{2})$/);
  if (compact) {
    const book = resolveBookName(compact[1].trim());
    if (book) {
      const ch = parseInt(compact[2], 10);
      const v = parseInt(compact[3], 10);
      if (ch > 0 && v > 0) return { book, chapter: ch, verse: v };
    }
  }

  return null;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function GlobalSearchModal({
  open,
  onClose,
  onNavigate,
  initialQuery = "",
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const songsCache = useRef<Song[]>([]);
  const songsCacheLoaded = useRef(false);

  // Pre-load worship songs on first open for instant search
  useEffect(() => {
    if (open && !songsCacheLoaded.current) {
      getAllSongs()
        .then((songs) => {
          songsCache.current = songs;
          songsCacheLoaded.current = true;
        })
        .catch(() => {});
    }
  }, [open]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setResults([]);
      setSelectedIndex(0);
      setLoading(false);
      // Focus the modal container (not the input) so arrow keys navigate results instantly.
      // Typed characters are forwarded to the input by the modal's onKeyDown handler.
      setTimeout(() => {
        modalRef.current?.focus();
      }, 50);
    } else {
      // Clear cache staleness flag on close so next open refreshes
      songsCacheLoaded.current = false;
    }
  }, [open, initialQuery]);

  // ── Search engine ──
  const performSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const allResults: GlobalSearchResult[] = [];
      const qLower = trimmed.toLowerCase();

      // ─── 1. SPEAKER SEARCH (instant — localStorage) ───
      const speakerPresets = loadSpeakerPresets();
      for (const preset of speakerPresets) {
        if (allResults.filter((r) => r.category === "speaker").length >= MAX_SPEAKER_RESULTS) break;
        const searchable = `${preset.name} ${preset.title} ${preset.ministry} ${preset.label} ${preset.titleLabel}`.toLowerCase();
        if (searchable.includes(qLower)) {
          const matchField = preset.name.toLowerCase().includes(qLower)
            ? preset.name
            : preset.title.toLowerCase().includes(qLower)
            ? preset.title
            : preset.ministry.toLowerCase().includes(qLower)
            ? preset.ministry
            : preset.label;
          allResults.push({
            id: `speaker-${preset.id}`,
            category: "speaker",
            title: preset.name || preset.label,
            subtitle: [preset.title, preset.ministry].filter(Boolean).join(" · "),
            snippet: matchField,
            icon: "mic",
            target: { type: "speaker", presetId: preset.id },
          });
        }
      }

      // ─── 2. WORSHIP SONG SEARCH (instant — cached in memory) ───
      if (!songsCacheLoaded.current) {
        try {
          songsCache.current = await getAllSongs();
          songsCacheLoaded.current = true;
        } catch { /* skip */ }
      }

      for (const song of songsCache.current) {
        if (allResults.filter((r) => r.category === "worship").length >= MAX_WORSHIP_RESULTS) break;

        const titleMatch = song.metadata.title.toLowerCase().includes(qLower);
        const artistMatch = song.metadata.artist?.toLowerCase().includes(qLower);
        const lyricsMatch = song.lyrics?.toLowerCase().includes(qLower);

        if (titleMatch || artistMatch || lyricsMatch) {
          let snippet = "";
          if (lyricsMatch && song.lyrics) {
            snippet = extractSnippet(song.lyrics, trimmed);
          } else if (artistMatch) {
            snippet = `Artist: ${song.metadata.artist}`;
          } else {
            // Show first line of lyrics
            const firstLine = (song.lyrics || "").split("\n").find((l) => l.trim());
            snippet = firstLine ? firstLine.trim().slice(0, 80) : "";
          }

          allResults.push({
            id: `worship-${song.id}`,
            category: "worship",
            title: song.metadata.title,
            subtitle: song.metadata.artist || "",
            snippet,
            icon: "music_note",
            target: { type: "worship", songId: song.id },
          });
        }
      }

      // ─── 3. BIBLE SEARCH ───
      // First try as a Bible reference
      const ref = parseQuickRef(trimmed);
      if (ref) {
        try {
          const verse = await getVerse(ref.book, ref.chapter, ref.verse, "KJV");
          if (verse) {
            allResults.push({
              id: `bible-ref-${verse.book}-${verse.chapter}-${verse.verse}`,
              category: "bible",
              title: `${verse.book} ${verse.chapter}:${verse.verse}`,
              subtitle: "KJV",
              snippet: verse.text,
              icon: "menu_book",
              target: { type: "bible", book: verse.book, chapter: verse.chapter, verse: verse.verse },
            });
          }
        } catch { /* skip */ }

        // Also add nearby verses
        try {
          const passage = await getPassage(ref.book, ref.chapter, ref.verse, ref.verse + 2, "KJV");
          for (const v of passage.verses) {
            if (v.verse === ref.verse) continue; // skip exact (already added)
            if (allResults.filter((r) => r.category === "bible").length >= MAX_BIBLE_RESULTS) break;
            allResults.push({
              id: `bible-near-${v.book}-${v.chapter}-${v.verse}`,
              category: "bible",
              title: `${v.book} ${v.chapter}:${v.verse}`,
              subtitle: "KJV",
              snippet: v.text,
              icon: "menu_book",
              target: { type: "bible", book: v.book, chapter: v.chapter, verse: v.verse },
            });
          }
        } catch { /* skip */ }
      }

      // If query is letters matching a book name, show that book
      if (!ref && trimmed.match(/^[a-zA-Z\s]+$/) && trimmed.length >= 2) {
        const lc = trimmed.toLowerCase();
        const matchingBooks: string[] = [];
        for (const book of BIBLE_BOOKS) {
          if (matchingBooks.length >= 3) break;
          const bookLower = book.toLowerCase();
          if (bookLower.startsWith(lc) || bookLower.includes(lc)) {
            matchingBooks.push(book);
            continue;
          }
          const abbrevs = BOOK_ABBREVS[book] || [];
          for (const ab of abbrevs) {
            if (ab.toLowerCase().startsWith(lc)) {
              matchingBooks.push(book);
              break;
            }
          }
        }
        for (const book of matchingBooks) {
          if (allResults.filter((r) => r.category === "bible").length >= MAX_BIBLE_RESULTS) break;
          try {
            const v = await getVerse(book, 1, 1, "KJV");
            if (v) {
              allResults.push({
                id: `bible-book-${book}`,
                category: "bible",
                title: `${book} 1:1`,
                subtitle: "KJV",
                snippet: v.text,
                icon: "menu_book",
                target: { type: "bible", book, chapter: 1, verse: 1 },
              });
            }
          } catch { /* skip */ }
        }
      }

      // Keyword search if no Bible reference results and query is >= 3 chars
      if (
        allResults.filter((r) => r.category === "bible").length === 0 &&
        trimmed.length >= 3
      ) {
        try {
          const kwResults = await searchBible(trimmed, "KJV", MAX_BIBLE_RESULTS);
          for (const kr of kwResults) {
            allResults.push({
              id: `bible-kw-${kr.book}-${kr.chapter}-${kr.verse}`,
              category: "bible",
              title: `${kr.book} ${kr.chapter}:${kr.verse}`,
              subtitle: "KJV",
              snippet: kr.snippet || kr.text,
              icon: "menu_book",
              target: { type: "bible", book: kr.book, chapter: kr.chapter, verse: kr.verse },
            });
          }
        } catch { /* skip */ }
      }

      setResults(allResults);
      setSelectedIndex(0);
    } catch (err) {
      console.error("[GlobalSearch] Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      performSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, open, performSearch]);

  // ── Keyboard navigation (handles all keys on the modal container) ──
  const handleModalKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            onNavigate(results[selectedIndex].target);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "Backspace":
          e.preventDefault();
          setQuery((prev) => prev.slice(0, -1));
          break;
        default:
          // Forward printable single characters to the query (typing without input focus)
          if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
            e.preventDefault();
            setQuery((prev) => prev + e.key);
          }
          break;
      }
    },
    [results, selectedIndex, onNavigate, onClose]
  );

  // Also handle keys when the input is focused (so arrow navigation still works from the input)
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            onNavigate(results[selectedIndex].target);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, onNavigate, onClose]
  );

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── Group results by category for display ──
  const groupedResults = useMemo(() => {
    const groups: { category: string; label: string; icon: string; items: GlobalSearchResult[] }[] = [];

    const bible = results.filter((r) => r.category === "bible");
    const worship = results.filter((r) => r.category === "worship");
    const speaker = results.filter((r) => r.category === "speaker");

    if (bible.length > 0) {
      groups.push({ category: "bible", label: "Bible", icon: "menu_book", items: bible });
    }
    if (worship.length > 0) {
      groups.push({ category: "worship", label: "Worship Songs", icon: "music_note", items: worship });
    }
    if (speaker.length > 0) {
      groups.push({ category: "speaker", label: "Speakers", icon: "mic", items: speaker });
    }

    return groups;
  }, [results]);

  if (!open) return null;

  return (
    <div className="gs-backdrop" onClick={onClose}>
      <div
        className="gs-modal"
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleModalKeyDown}
      >
        {/* ── Search Input ── */}
        <div className="gs-input-wrap">
          <Icon name="search" size={20} className="gs-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="gs-input"
            placeholder="Search Bible, Worship Songs, Speakers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <div className="gs-input-hints">
            {query && (
              <button
                className="gs-clear-btn"
                onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                title="Clear"
              >
                <Icon name="close" size={20} />
              </button>
            )}
            <kbd className="gs-kbd">ESC</kbd>
          </div>
        </div>

        {/* ── Results ── */}
        {query.trim().length > 0 && (
          <div className="gs-results" ref={listRef}>
            {loading && results.length === 0 && (
              <div className="gs-status">
                <Icon name="sync" size={20} className="spin" />
                <span>Searching…</span>
              </div>
            )}

            {!loading && results.length === 0 && query.trim().length > 0 && (
              <div className="gs-status gs-empty">
                <Icon name="search_off" size={20} />
                <span>No results for "{query}"</span>
              </div>
            )}

            {groupedResults.map((group) => (
              <div key={group.category} className="gs-group">
                <div className="gs-group-header">
                  <Icon name={group.icon} size={20} className="gs-group-icon" />
                  <span className="gs-group-label">{group.label}</span>
                  <span className="gs-group-count">{group.items.length}</span>
                </div>

                {group.items.map((result) => {
                  const globalIdx = results.indexOf(result);
                  return (
                    <div
                      key={result.id}
                      className={`gs-result ${globalIdx === selectedIndex ? "gs-result--active" : ""}`}
                      data-index={globalIdx}
                      onClick={() => {
                        onNavigate(result.target);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <Icon name={result.icon} size={18} className={`gs-result-icon gs-result-icon--${result.category}`} />
                      <div className="gs-result-body">
                        <div className="gs-result-top">
                          <span className="gs-result-title">
                            {highlightMatch(result.title, query)}
                          </span>
                          {result.subtitle && (
                            <span className="gs-result-subtitle">{result.subtitle}</span>
                          )}
                        </div>
                        <p className="gs-result-snippet">
                          {highlightMatch(result.snippet, query)}
                        </p>
                      </div>
                      {globalIdx === selectedIndex && (
                        <kbd className="gs-kbd gs-kbd--sm">↵</kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="gs-footer">
          <span className="gs-footer-hint">
            <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Navigate
          </span>
          <span className="gs-footer-hint">
            <kbd>↵</kbd> Select
          </span>
          <span className="gs-footer-hint">
            <kbd>ESC</kbd> Close
          </span>
          <span className="gs-footer-hint" style={{ marginLeft: "auto", opacity: 0.5 }}>
            Bible · Songs · Speakers
          </span>
        </div>
      </div>
    </div>
  );
}
