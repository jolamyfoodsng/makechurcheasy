/**
 * bibleNavigationContext.ts — Persistent Bible navigation state
 *
 * A simple singleton store that tracks the current book/chapter/verse
 * across the entire session. Updated by:
 * - Voice Bible service (when a verse is staged via voice)
 * - Bible UI (when a verse is selected/navigated to)
 * - Any other component that displays a verse
 *
 * Used by:
 * - Voice Bible matcher (for relative navigation: "next verse", "go to verse X")
 * - OpenCode/Ollama prompts (to inject current context)
 * - Any component that needs to know the current displayed verse
 */

interface BibleNavigationState {
  book: string | null;
  chapter: number | null;
  verse: number | null;
  translation: string;
  lastUpdatedAt: number;
}

let currentState: BibleNavigationState = {
  book: null,
  chapter: null,
  verse: null,
  translation: "KJV",
  lastUpdatedAt: Date.now(),
};

let listeners: Array<() => void> = [];

/**
 * Get the current navigation state.
 */
export function getNavigation(): Readonly<BibleNavigationState> {
  return currentState;
}

/**
 * Update the navigation state. Call this whenever a verse is displayed.
 */
export function updateNavigation(update: {
  book?: string | null;
  chapter?: number | null;
  verse?: number | null;
  translation?: string;
}): void {
  const prev = currentState;
  currentState = {
    book: update.book !== undefined ? update.book : prev.book,
    chapter: update.chapter !== undefined ? update.chapter : prev.chapter,
    verse: update.verse !== undefined ? update.verse : prev.verse,
    translation: update.translation ?? prev.translation,
    lastUpdatedAt: Date.now(),
  };

  // Notify listeners if anything changed
  if (
    currentState.book !== prev.book ||
    currentState.chapter !== prev.chapter ||
    currentState.verse !== prev.verse ||
    currentState.translation !== prev.translation
  ) {
    listeners.forEach((fn) => fn());
  }
}

/**
 * Update only specific fields, leaving others unchanged.
 */
export function setNavigationPosition(
  book: string,
  chapter: number,
  verse: number,
): void {
  updateNavigation({ book, chapter, verse });
}

/**
 * Update chapter only (resets verse to 1).
 */
export function setNavigationChapter(book: string, chapter: number): void {
  updateNavigation({ book, chapter, verse: 1 });
}

/**
 * Update translation only.
 */
export function setNavigationTranslation(translation: string): void {
  updateNavigation({ translation });
}

/**
 * Subscribe to navigation changes. Returns an unsubscribe function.
 */
export function onNavigationChange(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((fn) => fn !== listener);
  };
}

/**
 * Get a formatted string for display/prompts.
 * e.g. "John 4:5" or "John 4" or "none"
 */
export function formatNavigation(): string {
  const { book, chapter, verse } = currentState;
  if (!book || !chapter) return "none";
  if (verse) return `${book} ${chapter}:${verse}`;
  return `${book} ${chapter}`;
}

/**
 * Build a context payload from the current navigation state.
 * Used as the base context when no other context is available.
 */
export function buildContextFromNavigation(
  translation: string,
  availableTranslations: Array<{ value: string; label: string }>,
): {
  selectedBook: string | null;
  selectedChapter: number | null;
  selectedVerse: number | null;
  translation: string;
  availableTranslations: Array<{ value: string; label: string }>;
} {
  return {
    selectedBook: currentState.book,
    selectedChapter: currentState.chapter,
    selectedVerse: currentState.verse,
    translation,
    availableTranslations,
  };
}
