/**
 * bibleStore.tsx — React Context + useReducer state management for Bible module
 *
 * Provides BibleProvider and useBible() hook.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { nanoid } from "nanoid";
import type {
  BiblePassage,
  BibleSlide,
  BibleState,
  BibleTheme,
  BibleTranslation,
  QueueItem,
  SlideConfig,
} from "./types";
import { DEFAULT_SLIDE_CONFIG } from "./types";
import { generateSlides } from "./slideEngine";
import {
  addFavorite,
  addToHistory,
  removeFavorite,
  getBibleSettings,
  saveBibleSettings,
  getCustomThemes,
  getFavorites,
  getHistory,
  getInstalledTranslations,
  syncInstalledTranslationsToDock,
} from "./bibleDb";
import { track } from "../services/analytics";
import { BUILTIN_THEMES } from "./themes/builtinThemes";
import { bibleObsService } from "./bibleObsService";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type BibleAction =
  | { type: "SET_TRANSLATION"; translation: BibleTranslation }
  | { type: "SET_SEARCH_QUERY"; query: string }
  | { type: "SELECT_PASSAGE"; passage: BiblePassage }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_SLIDE_CONFIG"; config: SlideConfig }
  // Queue
  | { type: "ADD_TO_QUEUE"; passage: BiblePassage; slides: BibleSlide[] }
  | { type: "REMOVE_FROM_QUEUE"; id: string }
  | { type: "CLEAR_QUEUE" }
  | { type: "REORDER_QUEUE"; fromIndex: number; toIndex: number }
  | { type: "SET_ACTIVE_QUEUE_INDEX"; index: number }
  | { type: "NEXT_SLIDE" }
  | { type: "PREV_SLIDE" }
  | { type: "GO_TO_SLIDE"; queueIndex: number; slideIndex: number }
  // Theme
  | { type: "SET_ACTIVE_THEME"; themeId: string }
  | { type: "SET_THEMES"; themes: BibleTheme[] }
  | { type: "ADD_THEME"; theme: BibleTheme }
  | { type: "UPDATE_THEME"; theme: BibleTheme }
  | { type: "DELETE_THEME"; id: string }
  | { type: "REORDER_THEMES"; fromIndex: number; toIndex: number }
  // Favorites & History
  | { type: "SET_FAVORITES"; favorites: BiblePassage[] }
  | { type: "ADD_FAVORITE"; passage: BiblePassage }
  | { type: "REMOVE_FAVORITE"; reference: string }
  | { type: "SET_HISTORY"; history: BiblePassage[] }
  | { type: "ADD_TO_HISTORY"; passage: BiblePassage }
  // Appearance / accessibility
  | { type: "SET_COLOR_MODE"; mode: "dark" | "light" | "system" }
  | { type: "SET_AUTO_SEND"; enabled: boolean }
  | { type: "SET_REDUCE_MOTION"; enabled: boolean }
  | { type: "SET_HIGH_CONTRAST"; enabled: boolean }
  // Bulk init
  | { type: "INIT"; state: Partial<BibleState> };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: BibleState = {
  translation: "KJV",
  searchQuery: "",
  selectedPassage: null,
  slideConfig: DEFAULT_SLIDE_CONFIG,
  queue: [],
  activeQueueIndex: -1,
  activeThemeId: "classic-dark",
  themes: [...BUILTIN_THEMES],
  history: [],
  favorites: [],
  colorMode: "dark",
  autoSendOnDoubleClick: true,
  reduceMotion: false,
  highContrast: false,
};

function sortThemesForState(themes: BibleTheme[]): BibleTheme[] {
  return [...themes].sort((left, right) => {
    if (left.source === "custom" && right.source !== "custom") return -1;
    if (left.source !== "custom" && right.source === "custom") return 1;
    if (left.source === "custom" && right.source === "custom") {
      return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
    }
    return left.name.localeCompare(right.name);
  });
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function bibleReducer(state: BibleState, action: BibleAction): BibleState {
  switch (action.type) {
    case "SET_TRANSLATION":
      return { ...state, translation: action.translation };

    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.query };

    case "SELECT_PASSAGE":
      return { ...state, selectedPassage: action.passage };

    case "CLEAR_SELECTION":
      return { ...state, selectedPassage: null };

    case "SET_SLIDE_CONFIG":
      return { ...state, slideConfig: action.config };

    // Queue -----------------------------------------------------------------
    case "ADD_TO_QUEUE": {
      const item: QueueItem = {
        id: nanoid(),
        passage: action.passage,
        slides: action.slides,
        currentSlide: 0,
      };
      const queue = [...state.queue, item];
      return {
        ...state,
        queue,
        activeQueueIndex:
          state.activeQueueIndex < 0 ? 0 : state.activeQueueIndex,
      };
    }

    case "REMOVE_FROM_QUEUE": {
      const queue = state.queue.filter((q) => q.id !== action.id);
      let idx = state.activeQueueIndex;
      if (idx >= queue.length) idx = queue.length - 1;
      return { ...state, queue, activeQueueIndex: idx };
    }

    case "CLEAR_QUEUE":
      return { ...state, queue: [], activeQueueIndex: -1 };

    case "REORDER_QUEUE": {
      const queue = [...state.queue];
      const [moved] = queue.splice(action.fromIndex, 1);
      queue.splice(action.toIndex, 0, moved);
      return { ...state, queue };
    }

    case "SET_ACTIVE_QUEUE_INDEX":
      return { ...state, activeQueueIndex: action.index };

    case "NEXT_SLIDE": {
      if (state.activeQueueIndex < 0 || state.queue.length === 0) return state;
      const queue = [...state.queue];
      const current = queue[state.activeQueueIndex];
      if (!current) return state;

      if (current.currentSlide < current.slides.length - 1) {
        // Next slide in current passage
        queue[state.activeQueueIndex] = {
          ...current,
          currentSlide: current.currentSlide + 1,
        };
        return { ...state, queue };
      } else if (state.activeQueueIndex < queue.length - 1) {
        // Move to next queue item
        return { ...state, activeQueueIndex: state.activeQueueIndex + 1 };
      }
      return state;
    }

    case "PREV_SLIDE": {
      if (state.activeQueueIndex < 0 || state.queue.length === 0) return state;
      const queue = [...state.queue];
      const current = queue[state.activeQueueIndex];
      if (!current) return state;

      if (current.currentSlide > 0) {
        queue[state.activeQueueIndex] = {
          ...current,
          currentSlide: current.currentSlide - 1,
        };
        return { ...state, queue };
      } else if (state.activeQueueIndex > 0) {
        const prevIdx = state.activeQueueIndex - 1;
        const prevItem = queue[prevIdx];
        queue[prevIdx] = {
          ...prevItem,
          currentSlide: prevItem.slides.length - 1,
        };
        return { ...state, queue, activeQueueIndex: prevIdx };
      }
      return state;
    }

    case "GO_TO_SLIDE": {
      const queue = [...state.queue];
      const item = queue[action.queueIndex];
      if (!item) return state;
      queue[action.queueIndex] = {
        ...item,
        currentSlide: Math.max(
          0,
          Math.min(action.slideIndex, item.slides.length - 1)
        ),
      };
      return { ...state, queue, activeQueueIndex: action.queueIndex };
    }

    // Theme -----------------------------------------------------------------
    case "SET_ACTIVE_THEME":
      return { ...state, activeThemeId: action.themeId };

    case "SET_THEMES":
      return { ...state, themes: sortThemesForState(action.themes) };

    case "ADD_THEME":
      return { ...state, themes: sortThemesForState([...state.themes, action.theme]) };

    case "UPDATE_THEME":
      return {
        ...state,
        themes: sortThemesForState(state.themes.map((t) =>
          t.id === action.theme.id ? action.theme : t
        )),
      };

    case "DELETE_THEME":
      return {
        ...state,
        themes: state.themes.filter((t) => t.id !== action.id),
        activeThemeId:
          state.activeThemeId === action.id
            ? "classic-dark"
            : state.activeThemeId,
      };

    case "REORDER_THEMES": {
      const themes = [...state.themes];
      const [moved] = themes.splice(action.fromIndex, 1);
      themes.splice(action.toIndex, 0, moved);
      return { ...state, themes };
    }

    // Favorites & History ---------------------------------------------------
    case "SET_FAVORITES":
      return { ...state, favorites: action.favorites };

    case "ADD_FAVORITE":
      return {
        ...state,
        favorites: state.favorites.some(
          (f) => f.reference === action.passage.reference
        )
          ? state.favorites
          : [...state.favorites, action.passage],
      };

    case "REMOVE_FAVORITE":
      return {
        ...state,
        favorites: state.favorites.filter(
          (f) => f.reference !== action.reference
        ),
      };

    case "SET_HISTORY":
      return { ...state, history: action.history };

    case "ADD_TO_HISTORY":
      return {
        ...state,
        history: [action.passage, ...state.history].slice(0, 100),
      };

    // Appearance / Accessibility -------------------------------------------
    case "SET_COLOR_MODE":
      return { ...state, colorMode: action.mode };

    case "SET_AUTO_SEND":
      return { ...state, autoSendOnDoubleClick: action.enabled };

    case "SET_REDUCE_MOTION":
      return { ...state, reduceMotion: action.enabled };

    case "SET_HIGH_CONTRAST":
      return { ...state, highContrast: action.enabled };

    // Init ------------------------------------------------------------------
    case "INIT":
      return { ...state, ...action.state };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface BibleContextValue {
  state: BibleState;
  dispatch: Dispatch<BibleAction>;

  // Convenience actions
  addToQueue: (passage: BiblePassage) => void;
  removeFromQueue: (id: string) => void;
  nextSlide: () => void;
  prevSlide: () => void;
  goToSlide: (queueIndex: number, slideIndex: number) => void;
  toggleFavorite: (passage: BiblePassage) => void;
  recordHistory: (passage: BiblePassage) => void;
  setTheme: (themeId: string) => void;
  goBlank: () => void;
  goClear: () => void;

  /** Currently active slide or null */
  currentSlide: BibleSlide | null;
  /** Currently active queue item or null */
  currentQueueItem: QueueItem | null;
  /** Currently active theme */
  activeTheme: BibleTheme | null;
}

const BibleContext = createContext<BibleContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BibleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(bibleReducer, initialState);

  // Load persisted data on mount
  useEffect(() => {
    track("bible_opened");
    (async () => {
      try {
        const [settings, favorites, historyEntries, customThemes, installedTranslations] =
          await Promise.all([
            getBibleSettings().catch(() => ({})),
            getFavorites().catch(() => []),
            getHistory().catch(() => []),
            getCustomThemes().catch(() => []),
            getInstalledTranslations().catch(() => []),
          ]);
        const installedSet = new Set((installedTranslations || []).map((entry) => entry.abbr.toUpperCase()));
        const preferredTranslation = String((settings as Record<string, unknown>).defaultTranslation ?? "KJV").toUpperCase();
        const resolvedTranslation =
          preferredTranslation === "KJV" || installedSet.has(preferredTranslation)
            ? preferredTranslation
            : "KJV";

        const allThemes = [
          ...BUILTIN_THEMES,
          ...(customThemes || []),
        ];

        dispatch({
          type: "INIT",
          state: {
            translation: resolvedTranslation as BibleTranslation,
            slideConfig: (settings as Record<string, unknown>).slideConfig as typeof DEFAULT_SLIDE_CONFIG ?? DEFAULT_SLIDE_CONFIG,
            activeThemeId: ((settings as Record<string, unknown>).activeThemeId as string) ?? "classic-dark",
            favorites: favorites || [],
            history: (historyEntries || []).map((e) => e.passage),
            themes: allThemes,
            colorMode: ((settings as Record<string, unknown>).colorMode as "dark" | "light" | "system") ?? "dark",
            autoSendOnDoubleClick: ((settings as Record<string, unknown>).autoSendOnDoubleClick as boolean) ?? true,
            reduceMotion: ((settings as Record<string, unknown>).reduceMotion as boolean) ?? false,
            highContrast: ((settings as Record<string, unknown>).highContrast as boolean) ?? false,
          },
        });

        syncInstalledTranslationsToDock().catch((err) => {
          console.warn("[BibleStore] Failed to sync installed translations to dock:", err);
        });
      } catch (err) {
        console.warn("Failed to load Bible settings (non-fatal):", err);
        // Still dispatch INIT with defaults so the context is available
        dispatch({
          type: "INIT",
          state: {
            translation: "KJV" as BibleTranslation,
            slideConfig: DEFAULT_SLIDE_CONFIG,
            activeThemeId: "classic-dark",
            favorites: [],
            history: [],
            themes: [...BUILTIN_THEMES],
            colorMode: "dark",
            autoSendOnDoubleClick: true,
            reduceMotion: false,
            highContrast: false,
          },
        });
      } finally {
        // initialization complete
      }
    })();
  }, []);

  const reloadThemesFromDb = useCallback(async () => {
    try {
      const customThemes = await getCustomThemes();
      dispatch({ type: "SET_THEMES", themes: [...BUILTIN_THEMES, ...customThemes] });
    } catch (err) {
      console.warn("[BibleStore] Failed to reload themes:", err);
    }
  }, []);

  useEffect(() => {
    const refreshThemes = () => {
      void reloadThemesFromDb();
    };
    window.addEventListener("focus", refreshThemes);
    window.addEventListener("obs-themes-updated", refreshThemes);
    return () => {
      window.removeEventListener("focus", refreshThemes);
      window.removeEventListener("obs-themes-updated", refreshThemes);
    };
  }, [reloadThemesFromDb]);

  // Persist settings on change
  useEffect(() => {
    saveBibleSettings({
      defaultTranslation: state.translation,
      slideConfig: state.slideConfig,
      activeThemeId: state.activeThemeId,
      colorMode: state.colorMode,
      autoSendOnDoubleClick: state.autoSendOnDoubleClick,
      reduceMotion: state.reduceMotion,
      highContrast: state.highContrast,
    }).catch(console.error);
  }, [state.translation, state.slideConfig, state.activeThemeId, state.colorMode, state.autoSendOnDoubleClick, state.reduceMotion, state.highContrast]);

  // Convenience actions
  const addToQueue = useCallback(
    (passage: BiblePassage) => {
      const slides = generateSlides(passage, state.slideConfig);
      dispatch({ type: "ADD_TO_QUEUE", passage, slides });
      track("bible_verse_staged", {
        translation: passage.translation ?? "unknown",
        overlayMode: state.activeThemeId ?? "unknown",
      });
    },
    [state.slideConfig, state.activeThemeId]
  );

  const removeFromQueue = useCallback((id: string) => {
    dispatch({ type: "REMOVE_FROM_QUEUE", id });
  }, []);

  const nextSlide = useCallback(() => {
    dispatch({ type: "NEXT_SLIDE" });
  }, []);

  const prevSlide = useCallback(() => {
    dispatch({ type: "PREV_SLIDE" });
  }, []);

  const goToSlide = useCallback(
    (queueIndex: number, slideIndex: number) => {
      dispatch({ type: "GO_TO_SLIDE", queueIndex, slideIndex });
    },
    []
  );

  const toggleFavorite = useCallback(
    (passage: BiblePassage) => {
      const isFav = state.favorites.some(
        (f) => f.reference === passage.reference
      );
      if (isFav) {
        dispatch({ type: "REMOVE_FAVORITE", reference: passage.reference });
        removeFavorite(passage.reference).catch(console.error);
      } else {
        dispatch({ type: "ADD_FAVORITE", passage });
        addFavorite(passage).catch(console.error);
        track("bible_favorite_added");
      }
    },
    [state.favorites]
  );

  const recordHistory = useCallback((passage: BiblePassage) => {
    dispatch({ type: "ADD_TO_HISTORY", passage });
    addToHistory(passage).catch(console.error);
  }, []);

  const setTheme = useCallback((themeId: string) => {
    dispatch({ type: "SET_ACTIVE_THEME", themeId });
    track("bible_theme_applied", { themeId });
  }, []);

  const goBlank = useCallback(() => {
    bibleObsService.toggleBlank().catch(console.error);
  }, []);

  const goClear = useCallback(() => {
    bibleObsService.clearOverlay().catch(console.error);
  }, []);

  // Derived values
  const currentQueueItem =
    state.activeQueueIndex >= 0 && state.activeQueueIndex < state.queue.length
      ? state.queue[state.activeQueueIndex]
      : null;

  const currentSlide = currentQueueItem
    ? currentQueueItem.slides[currentQueueItem.currentSlide] ?? null
    : null;

  const activeTheme =
    state.themes.find((t) => t.id === state.activeThemeId) ?? null;

  // ── Global OBS push: keeps output in sync across page navigations ──
  // Slides are pushed immediately when selected (no preview/live distinction).
  const prevLiveRef = useRef<BibleSlide | null>(null);
  useEffect(() => {
    if (currentSlide) {
      bibleObsService.pushSlide(
        currentSlide,
        activeTheme?.settings ?? null,
        true,
        false,
        activeTheme?.templateType
      );
      if (prevLiveRef.current?.id !== currentSlide.id) {
        track("bible_verse_live", {
          translation: state.translation ?? "unknown",
          overlayMode: activeTheme?.templateType ?? "unknown",
        });
      }
    }
    prevLiveRef.current = currentSlide;
  }, [currentSlide, activeTheme]);

  const value: BibleContextValue = {
    state,
    dispatch,
    addToQueue,
    removeFromQueue,
    nextSlide,
    prevSlide,
    goToSlide,
    toggleFavorite,
    recordHistory,
    setTheme,
    goBlank,
    goClear,
    currentSlide,
    currentQueueItem,
    activeTheme,
  };

  return (
    <BibleContext.Provider value={value}>{children}</BibleContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBible(): BibleContextValue {
  const ctx = useContext(BibleContext);
  if (!ctx) {
    throw new Error("useBible() must be used within <BibleProvider>");
  }
  return ctx;
}
