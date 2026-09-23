/**
 * BibleHistoryScreen.tsx — Full-screen Bible history overlay
 *
 * Shows grouped-by-date scripture history with search, filter, sort,
 * favorites, infinite scroll, and navigation back to the Bible tab.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import type {
  BibleHistoryItem,
  BibleHistoryGroup,
  BibleHistoryFilter,
  BibleHistorySort,
} from "./bibleHistoryTypes";
import {
  loadBibleHistory,
  toggleFavorite,
  filterHistory,
  sortHistory,
  groupHistoryByDate,
  formatTimeAgo,
} from "./bibleHistoryTypes";
import { fuzzyMatch } from "../../services/fuzzySearch";
import "./BibleHistoryScreen.css";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onBack: () => void;
  onNavigateToVerse?: (book: string, chapter: number, verse: number) => void;
  onGoToChapter?: (book: string, chapter: number, verse: number) => void;
  onSendToObs?: (book: string, chapter: number, verse: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesSearch(item: BibleHistoryItem, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return (
    fuzzyMatch(q, item.reference) ||
    fuzzyMatch(q, item.book) ||
    fuzzyMatch(q, item.verseText) ||
    String(item.chapter).includes(q) ||
    String(item.verse).includes(q)
  );
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BibleHistoryScreen({
  onBack,
  onNavigateToVerse,
  onGoToChapter,
  onSendToObs,
}: Props) {
  const { t } = useTranslation();
  const [allItems, setAllItems] = useState<BibleHistoryItem[]>(() => loadBibleHistory());
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<BibleHistoryFilter>("all");
  const [sort, setSort] = useState<BibleHistorySort>("newest");
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Responsive Viewport Tracking (100px, 200px, 300px dock heights) ──
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 600,
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 800,
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isShort = viewportHeight <= 420;
  const isUltraShort = viewportHeight <= 260; // e.g. 200px
  const isNanoHeight = viewportHeight <= 145; // e.g. 100px
  const isNarrow = viewportWidth <= 420;
  const isUltraNarrow = viewportWidth <= 280;

  // ── Close on Escape key ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const FILTER_OPTIONS: Array<{ value: BibleHistoryFilter; label: string }> = useMemo(() => [
    { value: "all", label: t("bibleHistory.all") },
    { value: "favorites", label: t("bibleHistory.favorites") },
    { value: "today", label: t("bibleHistory.today") },
    { value: "this-week", label: t("bibleHistory.thisWeek") },
    { value: "this-month", label: t("bibleHistory.thisMonth") },
  ], [t]);

  const SORT_OPTIONS: Array<{ value: BibleHistorySort; label: string }> = useMemo(() => [
    { value: "newest", label: t("bibleHistory.newestFirst") },
    { value: "oldest", label: t("bibleHistory.oldestFirst") },
    { value: "most-viewed", label: t("bibleHistory.mostViewed") },
  ], [t]);

  // ── Refresh when screen opens ──
  useEffect(() => {
    setAllItems(loadBibleHistory());
  }, []);

  // ── Processed list ──
  const processedItems = useMemo(() => {
    let items = allItems.filter((item) => matchesSearch(item, searchQuery));
    items = filterHistory(items, filter);
    items = sortHistory(items, sort);
    return items;
  }, [allItems, searchQuery, filter, sort]);

  // ── Grouped for display ──
  const allGroups = useMemo(() => groupHistoryByDate(processedItems), [processedItems]);

  // ── Visible items (infinite scroll slicing) ──
  const visibleGroups = useMemo(() => {
    let count = 0;
    const result: BibleHistoryGroup[] = [];
    for (const group of allGroups) {
      const remaining = visibleCount - count;
      if (remaining <= 0) break;
      const visibleItems = group.items.slice(0, remaining);
      result.push({ label: group.label, items: visibleItems });
      count += visibleItems.length;
    }
    return result;
  }, [allGroups, visibleCount]);

  const hasMore = visibleCount < processedItems.length;

  // ── Infinite scroll via IntersectionObserver ──
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore) {
          setVisibleCount((prev) => prev + PAGE_SIZE);
        }
      },
      { root: scrollRef.current, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  // ── Reset visible count on filter/search/sort change ──
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, filter, sort]);

  // ── Handlers ──
  const handleToggleFavorite = useCallback((e: React.MouseEvent, item: BibleHistoryItem) => {
    e.stopPropagation();
    const updated = toggleFavorite(item.id);
    setAllItems(updated);
  }, []);

  const handleGoToChapter = useCallback(
    (item: BibleHistoryItem) => {
      if (onGoToChapter) {
        onGoToChapter(item.book, item.chapter, item.verse);
      } else if (onNavigateToVerse) {
        onNavigateToVerse(item.book, item.chapter, item.verse);
      }
    },
    [onGoToChapter, onNavigateToVerse],
  );

  const handleSendToObs = useCallback(
    (item: BibleHistoryItem) => {
      if (onSendToObs) {
        onSendToObs(item.book, item.chapter, item.verse);
      } else if (onNavigateToVerse) {
        onNavigateToVerse(item.book, item.chapter, item.verse);
      }
    },
    [onSendToObs, onNavigateToVerse],
  );


  const handleFilterSelect = useCallback((value: BibleHistoryFilter) => {
    setFilter(value);
    setShowFilterSheet(false);
  }, []);

  const handleSortSelect = useCallback((value: BibleHistorySort) => {
    setSort(value);
    setShowSortSheet(false);
  }, []);

  // ── Active filter/sort labels ──
  const activeFilterLabel = FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? "All";
  const activeSortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Newest First";

  const screenClasses = [
    "bible-history-screen",
    isShort ? "bible-history-screen--short" : "",
    isUltraShort ? "bible-history-screen--ultra-short" : "",
    isNanoHeight ? "bible-history-screen--nano" : "",
    isNarrow ? "bible-history-screen--narrow" : "",
    isUltraNarrow ? "bible-history-screen--ultra-narrow" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={screenClasses}
      role="dialog"
      aria-modal="true"
      aria-label={t("bibleHistory.title", "Bible History")}
    >
      {/* ── Sticky Header ── */}
      <div className="bible-history-header">
        <button
          type="button"
          className="bible-history-header__back"
          onClick={onBack}
          aria-label={t("bibleHistory.backToBible", "Back to Bible")}
          title={t("common.back", "Back")}>
          <Icon name="arrow_back" size={16} />
        </button>
        <h2 className="bible-history-header__title">
          {isUltraNarrow || isNanoHeight ? t("dock.history", "History") : t("bibleHistory.title", "Bible History")}
        </h2>
        <div className="bible-history-header__spacer" />
        <button
          type="button"
          className="bible-history-header__close"
          onClick={onBack}
          aria-label={t("common.close", "Close")}
          title={t("common.close", "Close")}>
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* ── Search Bar ── */}
      <div className="bible-history-search">
        <Icon name="search" size={isShort ? 13 : 14} className="bible-history-search__icon" />
        <input
          className="bible-history-search__input"
          type="text"
          placeholder={t("bibleHistory.searchPlaceholder", "Search history…")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {searchQuery && (
          <button
            type="button"
            className="bible-history-search__clear"
            onClick={() => setSearchQuery("")}
            aria-label={t("bibleHistory.clearSearch", "Clear search")}
            title={t("common.close", "Close")}>
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      {/* ── Filter Row ── */}
      <div className="bible-history-filters">
        <button
          type="button"
          className={`bible-history-filter-btn${filter !== "all" ? " bible-history-filter-btn--active" : ""}`}
          onClick={() => { setShowFilterSheet(true); setShowSortSheet(false); }}
          title={t("common.filter", "Filter")}>
          <Icon name="filter_list" size={isShort ? 13 : 14} />
          <span>{activeFilterLabel}</span>
        </button>
        <button
          type="button"
          className={`bible-history-filter-btn${sort !== "newest" ? " bible-history-filter-btn--active" : ""}`}
          onClick={() => { setShowSortSheet(true); setShowFilterSheet(false); }}
          title={t("common.sort", "Sort")}>
          <Icon name="sort" size={isShort ? 13 : 14} />
          <span>{activeSortLabel}</span>
        </button>
      </div>

      {/* ── Filter Bottom Sheet ── */}
      {showFilterSheet && (
        <div className="bible-history-sheet-backdrop" onClick={() => setShowFilterSheet(false)}>
          <div className="bible-history-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bible-history-sheet__header">
              <span className="bible-history-sheet__title">{t("bibleHistory.filter")}</span>
              <button type="button" className="bible-history-sheet__close" onClick={() => setShowFilterSheet(false)} aria-label={t("common.close")} title={t("common.close")}>
                <Icon name="close" size={14} />
              </button>
            </div>
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`bible-history-sheet__item${filter === opt.value ? " bible-history-sheet__item--active" : ""}`}
                onClick={() => handleFilterSelect(opt.value)}
                title={t("common.confirm")}>
                <span>{opt.label}</span>
                {filter === opt.value && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Sort Bottom Sheet ── */}
      {showSortSheet && (
        <div className="bible-history-sheet-backdrop" onClick={() => setShowSortSheet(false)}>
          <div className="bible-history-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bible-history-sheet__header">
              <span className="bible-history-sheet__title">{t("bibleHistory.sort")}</span>
              <button type="button" className="bible-history-sheet__close" onClick={() => setShowSortSheet(false)} aria-label={t("common.close")} title={t("common.close")}>
                <Icon name="close" size={14} />
              </button>
            </div>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`bible-history-sheet__item${sort === opt.value ? " bible-history-sheet__item--active" : ""}`}
                onClick={() => handleSortSelect(opt.value)}
                title={t("common.confirm")}>
                <span>{opt.label}</span>
                {sort === opt.value && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Scrollable Content ── */}
      <div className="bible-history-scroll" ref={scrollRef}>
        {processedItems.length === 0 ? (
          <div className="bible-history-empty">
            <div className="bible-history-empty__icon">
              <Icon name="menu_book" size={36} />
            </div>
            <div className="bible-history-empty__title">{t("bibleHistory.noHistoryYet")}</div>
            <div className="bible-history-empty__text">
              {t("bibleHistory.scripturesAppear")}
            </div>
          </div>
        ) : (
          visibleGroups.map((group) => (
            <div key={group.label} className="bible-history-group">
              <div className="bible-history-group__label">{group.label}</div>
              {group.items.map((item) => {
                const isHovered = hoveredCardId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`bible-history-card${isHovered ? " bible-history-card--hovered" : ""}`}
                    onMouseEnter={() => setHoveredCardId(item.id)}
                    onMouseLeave={() => setHoveredCardId((curr) => (curr === item.id ? null : curr))}
                    onClick={() => handleGoToChapter(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleGoToChapter(item);
                      }
                    }}
                    title={t("bible.goToChapter", "Go to chapter")}
                  >
                    <div className="bible-history-card__icon" aria-hidden="true">
                      <Icon name="menu_book" size={isShort ? 14 : 16} />
                    </div>
                    <div className="bible-history-card__body">
                      <div className="bible-history-card__header-row">
                        <span className="bible-history-card__ref">{item.reference}</span>
                        <div
                          className="bible-history-card__actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="bible-history-card__action-btn bible-history-card__action-btn--goto"
                            onClick={() => handleGoToChapter(item)}
                            title={t("bible.goToChapter", "Go to chapter")}
                            aria-label={t("bible.goToChapter", "Go to chapter")}
                          >
                            <Icon name="visibility" size={12} />
                            <span>{t("bible.goToChapter", "Go to chapter")}</span>
                          </button>
                          <button
                            type="button"
                            className="bible-history-card__action-btn bible-history-card__action-btn--obs"
                            onClick={() => handleSendToObs(item)}
                            title={t("dock.sendToObs", "Send to OBS")}
                            aria-label={t("dock.sendToObs", "Send to OBS")}
                          >
                            <Icon name="cast" size={12} />
                            <span>{t("dock.sendToObs", "Send to OBS")}</span>
                          </button>
                        </div>
                      </div>
                      <div className={`bible-history-card__preview${isHovered ? " bible-history-card__preview--full" : ""}`}>
                        {isHovered ? item.verseText : truncateText(item.verseText, isNarrow ? 45 : 80)}
                      </div>
                      <div className="bible-history-card__meta">
                        {formatTimeAgo(item.timestamp)}
                        {item.visitCount > 1 && (
                          <span className="bible-history-card__count">
                            · {item.visitCount} {t("common.visits", "visits")}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`bible-history-card__fav${item.isFavorite ? " bible-history-card__fav--active" : ""}`}
                      onClick={(e) => handleToggleFavorite(e, item)}
                      aria-label={item.isFavorite ? t("bibleHistory.removeFromFavorites", "Remove from favorites") : t("bibleHistory.addToFavorites", "Add to favorites")}
                      title={item.isFavorite ? t("bibleHistory.removeFromFavorites", "Remove from favorites") : t("bibleHistory.addToFavorites", "Add to favorites")}
                    >
                      <Icon name={item.isFavorite ? "star" : "star_border"} size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && <div ref={sentinelRef} className="bible-history-sentinel" />}
      </div>
    </div>
  );
}
