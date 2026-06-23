/**
 * bibleHistoryTypes.ts — Bible history types and localStorage persistence
 *
 * Stores recently-opened scriptures with favorites, visit counts,
 * and grouped-by-date views for the Bible History Screen.
 */

import { getUserScopedKey } from "../../services/userScopedStorage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BibleHistoryItem {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  verseText: string;
  timestamp: number;
  isFavorite: boolean;
  visitCount: number;
}

export interface BibleHistoryGroup {
  label: string;
  items: BibleHistoryItem[];
}

export type BibleHistoryFilter = "all" | "favorites" | "today" | "this-week" | "this-month";
export type BibleHistorySort = "newest" | "oldest" | "most-viewed";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "ocs-dock-bible-history-v1";
const MAX_ITEMS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `bh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isToday(ts: number): boolean {
  const now = startOfDay(new Date());
  const item = startOfDay(new Date(ts));
  return item.getTime() === now.getTime();
}

function isYesterday(ts: number): boolean {
  const now = startOfDay(new Date());
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const item = startOfDay(new Date(ts));
  return item.getTime() === yesterday.getTime();
}

function isThisWeek(ts: number): boolean {
  const now = startOfDay(new Date());
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return ts >= weekAgo.getTime();
}

function isThisMonth(ts: number): boolean {
  const now = startOfDay(new Date());
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  return ts >= monthAgo.getTime();
}

function formatDateLabel(ts: number): string {
  const date = new Date(ts);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// localStorage CRUD
// ---------------------------------------------------------------------------

export function loadBibleHistory(): BibleHistoryItem[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BibleHistoryItem =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.book === "string" &&
        typeof item.chapter === "number" &&
        typeof item.verse === "number",
    );
  } catch {
    return [];
  }
}

function saveBibleHistory(items: BibleHistoryItem[]): void {
  try {
    localStorage.setItem(getUserScopedKey(STORAGE_KEY), JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // ignore OBS CEF storage failures
  }
}

/**
 * Called when a user opens a scripture. If the reference already exists,
 * update its timestamp and visit count. Otherwise, insert a new item.
 */
export function addToBibleHistory(
  book: string,
  chapter: number,
  verse: number,
  verseText: string,
): BibleHistoryItem[] {
  const items = loadBibleHistory();
  const reference = `${book} ${chapter}:${verse}`;
  const existing = items.find(
    (item) =>
      item.book === book &&
      item.chapter === chapter &&
      item.verse === verse,
  );

  let updated: BibleHistoryItem[];
  if (existing) {
    updated = items.map((item) =>
      item.id === existing.id
        ? { ...item, timestamp: Date.now(), visitCount: item.visitCount + 1, verseText }
        : item,
    );
  } else {
    const newItem: BibleHistoryItem = {
      id: generateId(),
      book,
      chapter,
      verse,
      reference,
      verseText,
      timestamp: Date.now(),
      isFavorite: false,
      visitCount: 1,
    };
    updated = [newItem, ...items];
  }

  saveBibleHistory(updated);
  return updated;
}

export function toggleFavorite(historyId: string): BibleHistoryItem[] {
  const items = loadBibleHistory();
  const updated = items.map((item) =>
    item.id === historyId ? { ...item, isFavorite: !item.isFavorite } : item,
  );
  saveBibleHistory(updated);
  return updated;
}

export function deleteHistoryItem(historyId: string): BibleHistoryItem[] {
  const items = loadBibleHistory();
  const updated = items.filter((item) => item.id !== historyId);
  saveBibleHistory(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Filtering & Sorting
// ---------------------------------------------------------------------------

export function filterHistory(
  items: BibleHistoryItem[],
  filter: BibleHistoryFilter,
): BibleHistoryItem[] {
  switch (filter) {
    case "favorites":
      return items.filter((item) => item.isFavorite);
    case "today":
      return items.filter((item) => isToday(item.timestamp));
    case "this-week":
      return items.filter((item) => isThisWeek(item.timestamp));
    case "this-month":
      return items.filter((item) => isThisMonth(item.timestamp));
    default:
      return items;
  }
}

export function sortHistory(
  items: BibleHistoryItem[],
  sort: BibleHistorySort,
): BibleHistoryItem[] {
  const sorted = [...items];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => a.timestamp - b.timestamp);
    case "most-viewed":
      return sorted.sort((a, b) => b.visitCount - a.visitCount);
    case "newest":
    default:
      return sorted.sort((a, b) => b.timestamp - a.timestamp);
  }
}

// ---------------------------------------------------------------------------
// Grouping by date
// ---------------------------------------------------------------------------

export function groupHistoryByDate(items: BibleHistoryItem[]): BibleHistoryGroup[] {
  const groups = new Map<string, BibleHistoryItem[]>();

  for (const item of items) {
    let label: string;
    if (isToday(item.timestamp)) {
      label = "Today";
    } else if (isYesterday(item.timestamp)) {
      label = "Yesterday";
    } else {
      label = formatDateLabel(item.timestamp);
    }

    const existing = groups.get(label);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(label, [item]);
    }
  }

  return Array.from(groups.entries()).map(([label, groupItems]) => ({
    label,
    items: groupItems,
  }));
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return formatDateLabel(timestamp);
}
