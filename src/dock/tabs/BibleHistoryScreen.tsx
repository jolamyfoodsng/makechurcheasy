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
import "./BibleHistoryScreen.css";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onBack: () => void;
  onNavigateToVerse: (book: string, chapter: number, verse: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesSearch(item: BibleHistoryItem, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (
    item.reference.toLowerCase().includes(q) ||
    item.book.toLowerCase().includes(q) ||
    String(item.chapter).includes(q) ||
    String(item.verse).includes(q) ||
    item.verseText.toLowerCase().includes(q)
  );
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BibleHistoryScreen({ onBack, onNavigateToVerse }: Props) {
  const { t } = useTranslation();
  const [allItems, setAllItems] = useState<BibleHistoryItem[]>(() => loadBibleHistory());
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<BibleHistoryFilter>("all");
  const [sort, setSort] = useState<BibleHistorySort>("newest");
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  const handleNavigate = useCallback(
    (item: BibleHistoryItem) => {
      onNavigateToVerse(item.book, item.chapter, item.verse);
    },
    [onNavigateToVerse],
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

  return (
    <div className="bible-history-screen">
      {/* ── Sticky Header ── */}
      <div className="bible-history-header">
        <button
          type="button"
          className="bible-history-header__back"
          onClick={onBack}
          aria-label={t("bibleHistory.backToBible")}
         title="Go back">
          <Icon name="arrow_back" size={16} />
        </button>
        <h2 className="bible-history-header__title">{t("bibleHistory.title")}</h2>
        <div className="bible-history-header__spacer" />
      </div>

      {/* ── Search Bar ── */}
      <div className="bible-history-search">
        <Icon name="search" size={14} className="bible-history-search__icon" />
        <input
          className="bible-history-search__input"
          type="text"
          placeholder={t("bibleHistory.searchPlaceholder")}
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
            aria-label={t("bibleHistory.clearSearch")}
           title="Close">
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
         title="Filter">
          <Icon name="filter_list" size={13} />
          <span>{activeFilterLabel}</span>
        </button>
        <button
          type="button"
          className={`bible-history-filter-btn${sort !== "newest" ? " bible-history-filter-btn--active" : ""}`}
          onClick={() => { setShowSortSheet(true); setShowFilterSheet(false); }}
         title="sort">
          <Icon name="sort" size={13} />
          <span>{activeSortLabel}</span>
        </button>
      </div>

      {/* ── Filter Bottom Sheet ── */}
      {showFilterSheet && (
        <div className="bible-history-sheet-backdrop" onClick={() => setShowFilterSheet(false)}>
          <div className="bible-history-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bible-history-sheet__header">
              <span className="bible-history-sheet__title">{t("bibleHistory.filter")}</span>
              <button type="button" className="bible-history-sheet__close" onClick={() => setShowFilterSheet(false)} aria-label={t("common.close")} title="Close">
                <Icon name="close" size={14} />
              </button>
            </div>
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`bible-history-sheet__item${filter === opt.value ? " bible-history-sheet__item--active" : ""}`}
                onClick={() => handleFilterSelect(opt.value)}
               title="Confirm">
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
              <button type="button" className="bible-history-sheet__close" onClick={() => setShowSortSheet(false)} aria-label={t("common.close")} title="Close">
                <Icon name="close" size={14} />
              </button>
            </div>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`bible-history-sheet__item${sort === opt.value ? " bible-history-sheet__item--active" : ""}`}
                onClick={() => handleSortSelect(opt.value)}
               title="Confirm">
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
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="bible-history-card"
                  onClick={() => handleNavigate(item)}
                 title="Book">
                  <div className="bible-history-card__icon">
                    <Icon name="menu_book" size={16} />
                  </div>
                  <div className="bible-history-card__body">
                    <div className="bible-history-card__ref">{item.reference}</div>
                    <div className="bible-history-card__preview">
                      {truncateText(item.verseText, 80)}
                    </div>
                    <div className="bible-history-card__meta">
                      {formatTimeAgo(item.timestamp)}
                      {item.visitCount > 1 && (
                        <span className="bible-history-card__count">
                          · {item.visitCount} visits
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`bible-history-card__fav${item.isFavorite ? " bible-history-card__fav--active" : ""}`}
                    onClick={(e) => handleToggleFavorite(e, item)}
                    aria-label={item.isFavorite ? t("bibleHistory.removeFromFavorites") : t("bibleHistory.addToFavorites")}
                    title={item.isFavorite ? t("bibleHistory.removeFromFavorites") : t("bibleHistory.addToFavorites")}
                  >
                    <Icon name={item.isFavorite ? "star" : "star_border"} size={16} />
                  </button>
                  <div className="bible-history-card__chevron">
                    <Icon name="chevron_right" size={16} />
                  </div>
                </button>
              ))}
            </div>
          ))
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && <div ref={sentinelRef} className="bible-history-sentinel" />}
      </div>
    </div>
  );
}
