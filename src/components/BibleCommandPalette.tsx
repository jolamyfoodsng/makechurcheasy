import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { getVerse, getBibleCorpus, searchBible } from "../bible/bibleData";
import { useBible } from "../bible/bibleStore";
import type { BibleTheme, BibleTranslation } from "../bible/types";
import { getAllMedia } from "../library/libraryDb";
import type { MediaItem } from "../library/libraryTypes";
import { getAllServicePlans } from "../service-planner/servicePlannerStore";
import type { ServicePlan } from "../service-planner/types";
import { parseBibleSearch } from "../dock/bibleSearchParser";
import { LT_ALL_THEMES } from "../lowerthirds/themes";
import type { LowerThirdTheme } from "../lowerthirds/types";
import Icon from "./Icon";
import "./bible-command-palette.css";

type PaletteSource = "bible" | "media" | "notes" | "template";
type PaletteFilter = "all" | PaletteSource;
type TemplateKind = "bible" | "lower-third";

type BibleTarget = { type: "bible"; book: string; chapter: number; verse: number };
type MediaTarget = { type: "media"; mediaId: string };
type NoteTarget = { type: "note"; planId: string; cueId: string };
type TemplateTarget = { type: "template"; templateKind: TemplateKind; themeId: string };

type PaletteTarget = BibleTarget | MediaTarget | NoteTarget | TemplateTarget;

interface PaletteResult {
  id: string;
  source: PaletteSource;
  title: string;
  preview: string;
  tag: string;
  icon: string;
  meta?: string;
  thumbnailUrl?: string;
  accentColor?: string;
  score: number;
  target: PaletteTarget;
}

interface BibleCommandPaletteProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onSelectBibleVerse: (book: string, chapter: number, verse: number) => void;
  onSelectTemplate: (templateKind: TemplateKind, themeId: string) => void;
  onNavigate?: (path: string) => void;
}

const RESULT_LIMIT = 120;
const BIBLE_EXACT_LIMIT = 12;
const SEARCH_DEBOUNCE_MS = 120;
const ITEM_HEIGHT = 112;
const ITEM_GAP = 10;
const OVERSCAN = 4;

const SOURCE_PRIORITY: Record<PaletteSource, number> = {
  bible: 0,
  template: 1,
  notes: 2,
  media: 3,
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearch(value: string): string[] {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreTextMatch(query: string, ...candidates: Array<string | undefined | null>): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const tokens = tokenizeSearch(normalizedQuery);
  let best = 0;

  for (const rawCandidate of candidates) {
    const candidate = normalizeSearchText(rawCandidate ?? "");
    if (!candidate) continue;

    if (candidate === normalizedQuery) {
      best = Math.max(best, 1000);
      continue;
    }

    if (candidate.startsWith(normalizedQuery)) {
      best = Math.max(best, 860 - Math.min(160, candidate.indexOf(normalizedQuery)));
      continue;
    }

    const compactCandidate = candidate.replace(/\s+/g, "");
    const compactQuery = normalizedQuery.replace(/\s+/g, "");
    if (compactCandidate.includes(compactQuery)) {
      best = Math.max(best, 780 - Math.min(180, compactCandidate.indexOf(compactQuery)));
      continue;
    }

    if (candidate.includes(normalizedQuery)) {
      best = Math.max(best, 720 - Math.min(160, candidate.indexOf(normalizedQuery)));
      continue;
    }

    if (tokens.length > 0 && tokens.every((token) => candidate.includes(token))) {
      const penalty = tokens.reduce((sum, token) => sum + Math.min(20, candidate.indexOf(token) < 0 ? 20 : candidate.indexOf(token)), 0);
      best = Math.max(best, 640 - penalty);
      continue;
    }

    const tokenHits = tokens.filter((token) => candidate.includes(token)).length;
    if (tokenHits > 0) {
      best = Math.max(best, 420 + tokenHits * 60);
    }
  }

  return best;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDimensions(width?: number, height?: number): string {
  if (!width || !height) return "";
  return `${width}×${height}`;
}

function highlightText(value: string, query: string): ReactNode {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return value;

  const safeQuery = escapeRegExp(normalizedQuery);
  const regex = new RegExp(`(${safeQuery})`, "ig");
  const segments = value.split(regex);

  if (segments.length === 1) return value;

  return segments.map((segment, index) => {
    if (index % 2 === 1) {
      // eslint-disable-next-line react/no-array-index-key
      return <mark key={`${segment}-${index}`} className="bcp-highlight">{segment}</mark>;
    }
    // eslint-disable-next-line react/no-array-index-key
    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

function makeBiblePreview(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 180) return cleaned;
  return `${cleaned.slice(0, 180).trimEnd()}…`;
}

function getTemplatePreviewStyle(accentColor?: string): CSSProperties {
  const accent = accentColor?.trim() || "#6A34DE";
  return {
    background: `linear-gradient(135deg, rgba(15, 18, 28, 0.96), color-mix(in srgb, rgba(15, 18, 28, 0.96) 58%, ${accent} 42%))`,
    borderColor: `color-mix(in srgb, ${accent} 42%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 22%, transparent), 0 10px 26px rgba(0, 0, 0, 0.24)`,
    color: "#fff",
  };
}

function isRelevantBibleVerse(query: string, target: { book: string; chapter: number | null; verse: number | null }): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return false;
  if (target.chapter == null || target.verse == null) return false;

  const compact = normalized.replace(/\s+/g, "");
  const ref = normalizeSearchText(`${target.book} ${target.chapter}:${target.verse}`).replace(/\s+/g, "");
  return ref.includes(compact) || compact.includes(ref);
}

function rankResults(results: PaletteResult[]): PaletteResult[] {
  return [...results].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const leftPriority = SOURCE_PRIORITY[left.source];
    const rightPriority = SOURCE_PRIORITY[right.source];
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.title.localeCompare(right.title);
  });
}

async function buildBibleResults(query: string, translation: BibleTranslation): Promise<PaletteResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const refCandidates = parseBibleSearch(trimmed).filter((candidate) => candidate.chapter !== null && candidate.verse !== null);
  const exactResults: PaletteResult[] = [];

  for (const [index, candidate] of refCandidates.slice(0, BIBLE_EXACT_LIMIT).entries()) {
    if (candidate.chapter === null || candidate.verse === null) continue;
    const verse = await getVerse(candidate.book, candidate.chapter, candidate.verse, translation).catch(() => null);
    if (!verse) continue;

    exactResults.push({
      id: `bible-exact-${candidate.book}-${candidate.chapter}-${candidate.verse}`,
      source: "bible",
      title: candidate.label,
      preview: makeBiblePreview(verse.text),
      tag: "Bible",
      icon: "menu_book",
      meta: `${translation.toUpperCase()} · ${candidate.book} ${candidate.chapter}:${candidate.verse}`,
      score: 1200 - index * 10 + (candidate.score ?? 0),
      target: {
        type: "bible",
        book: candidate.book,
        chapter: candidate.chapter,
        verse: candidate.verse,
      },
    });
  }

  const keywordResults = trimmed.length >= 2
    ? await searchBible(trimmed, translation, 24).catch(() => [])
    : [];

  const keywordMatches: PaletteResult[] = keywordResults
    .filter((match) => isRelevantBibleVerse(trimmed, match))
    .map((match, index) => ({
      id: `bible-keyword-${match.book}-${match.chapter}-${match.verse}`,
      source: "bible",
      title: `${match.book} ${match.chapter}:${match.verse}`,
      preview: makeBiblePreview(match.snippet || match.text),
      tag: "Bible",
      icon: "menu_book",
      meta: `${translation.toUpperCase()} · Verse match`,
      score: 860 - index * 4,
      target: {
        type: "bible",
        book: match.book,
        chapter: match.chapter,
        verse: match.verse,
      },
    }));

  const deduped = new Map<string, PaletteResult>();
  for (const result of [...exactResults, ...keywordMatches]) {
    deduped.set(result.id, result);
  }
  return rankResults(Array.from(deduped.values()));
}

function buildMediaResults(query: string, mediaItems: MediaItem[]): PaletteResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const results: PaletteResult[] = [];
  for (const item of mediaItems) {
    const score = scoreTextMatch(
      trimmed,
      item.name,
      item.diskFileName,
      item.filePath,
      item.remoteUrl,
      item.sourceAssetId,
      item.cloudflareKey,
      item.type
    );
    if (score <= 0) continue;

    const preview = item.type === "video"
      ? [
        formatDimensions(item.width, item.height),
        item.durationSec != null ? `${Math.floor(item.durationSec / 60).toString().padStart(2, "0")}:${Math.floor(item.durationSec % 60).toString().padStart(2, "0")}` : "",
      ].filter(Boolean).join(" · ") || "Video"
      : formatDimensions(item.width, item.height) || "Image";

    const metaParts = [
      item.type === "video" ? "Video" : "Image",
      formatFileSize(item.fileSize),
    ].filter(Boolean);

    results.push({
      id: `media-${item.id}`,
      source: "media",
      title: item.name,
      preview,
      tag: "Media",
      icon: item.type === "video" ? "movie" : "image",
      meta: metaParts.join(" · "),
      thumbnailUrl: item.thumbnailUrl || (item.type === "image" ? item.url : undefined),
      score: score + 200,
      target: {
        type: "media",
        mediaId: item.id,
      },
    });
  }

  return results.sort((left, right) => right.score - left.score).slice(0, 24);
}

function buildNoteResults(query: string, plans: ServicePlan[]): PaletteResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const results: PaletteResult[] = [];
  for (const plan of plans) {
    for (const item of plan.items) {
      const score = scoreTextMatch(
        trimmed,
        item.label,
        item.subtitle,
        item.notes,
        plan.title,
        JSON.stringify(item.payloadSnapshot ?? {}),
      );
      if (score <= 0) continue;

      const preview = makeBiblePreview(item.notes || item.subtitle || item.label);
      results.push({
        id: `note-${plan.id}-${item.id}`,
        source: "notes",
        title: item.label,
        preview,
        tag: "Notes",
        icon: "assignment",
        meta: `${plan.title}${item.notes ? " · Saved note" : ""}`,
        score: score + 150,
        target: {
          type: "note",
          planId: plan.id,
          cueId: item.id,
        },
      });
    }
  }

  return rankResults(results).slice(0, 24);
}

function buildBibleThemeResults(query: string, themes: BibleTheme[]): PaletteResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const results: PaletteResult[] = [];
  for (const theme of themes) {
    if (theme.hidden) continue;

    const score = scoreTextMatch(
      trimmed,
      theme.name,
      theme.description,
      theme.category,
      theme.categories?.join(" "),
      theme.templateType
    );
    if (score <= 0) continue;

    results.push({
      id: `theme-${theme.id}`,
      source: "template",
      title: theme.name,
      preview: theme.description || theme.name,
      tag: "Templates",
      icon: "palette",
      meta: `Bible theme · ${theme.templateType === "lower-third" ? "Lower Third" : "Fullscreen"}`,
      thumbnailUrl: theme.preview,
      accentColor: theme.settings.fontColor || "#6A34DE",
      score: score + (theme.source === "custom" ? 30 : 0),
      target: {
        type: "template",
        templateKind: "bible",
        themeId: theme.id,
      },
    });
  }

  return results.sort((left, right) => right.score - left.score).slice(0, 24);
}

function buildLowerThirdThemeResults(query: string, themes: LowerThirdTheme[]): PaletteResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const results: PaletteResult[] = [];
  for (const theme of themes) {
    const score = scoreTextMatch(
      trimmed,
      theme.name,
      theme.description,
      theme.category,
      theme.tags?.join(" "),
      theme.icon
    );
    if (score <= 0) continue;

    results.push({
      id: `lt-theme-${theme.id}`,
      source: "template",
      title: theme.name,
      preview: theme.description || theme.name,
      tag: "Templates",
      icon: theme.icon || "palette",
      meta: `Lower Third · ${theme.category}`,
      accentColor: theme.accentColor || "#6A34DE",
      score: score + 20,
      target: {
        type: "template",
        templateKind: "lower-third",
        themeId: theme.id,
      },
    });
  }

  return results.sort((left, right) => right.score - left.score).slice(0, 24);
}

function mergeResults(...groups: PaletteResult[][]): PaletteResult[] {
  const deduped = new Map<string, PaletteResult>();
  for (const group of groups) {
    for (const result of group) {
      const existing = deduped.get(result.id);
      if (!existing || result.score > existing.score) {
        deduped.set(result.id, result);
      }
    }
  }
  return rankResults(Array.from(deduped.values())).slice(0, RESULT_LIMIT);
}

export default function BibleCommandPalette({
  open,
  initialQuery = "",
  onClose,
  onSelectBibleVerse,
  onSelectTemplate,
  onNavigate,
}: BibleCommandPaletteProps) {
  const { state } = useBible();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PaletteFilter>("all");
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<number | null>(null);
  const searchRunRef = useRef(0);
  const paletteOpenRef = useRef(false);

  return <></>
  const lowerThirdThemes = useMemo(() => LT_ALL_THEMES, []);

  useEffect(() => {
    paletteOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setFilter("all");
    setSelectedIndex(0);
    setScrollTop(0);
    setLoading(Boolean(initialQuery.trim()));
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
      if (initialQuery) {
        inputRef.current?.setSelectionRange(initialQuery.length, initialQuery.length);
      }
    }, 0);

    void getBibleCorpus(state.translation, 1).catch(() => { });

    let cancelled = false;
    void (async () => {
      try {
        const [nextMedia, nextPlans] = await Promise.all([
          getAllMedia(),
          getAllServicePlans(),
        ]);
        if (cancelled) return;
        setMediaItems(nextMedia);
        setServicePlans(nextPlans);
      } catch {
        if (cancelled) return;
        setMediaItems([]);
        setServicePlans([]);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
    };
  }, [open, initialQuery, state.translation]);

  const filteredResults = useMemo(() => {
    if (filter === "all") return results;
    return results.filter((result) => result.source === filter);
  }, [filter, results]);

  const counts = useMemo(() => ({
    all: results.length,
    bible: results.filter((result) => result.source === "bible").length,
    media: results.filter((result) => result.source === "media").length,
    notes: results.filter((result) => result.source === "notes").length,
    template: results.filter((result) => result.source === "template").length,
  }), [results]);

  useEffect(() => {
    setSelectedIndex(0);
    listRef.current?.scrollTo({ top: 0, behavior: "auto" });
    setScrollTop(0);
  }, [filter, filteredResults.length, query]);

  useEffect(() => {
    if (!open) return;

    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
    }

    const trimmed = query.trim();
    const runId = ++searchRunRef.current;

    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    searchTimerRef.current = window.setTimeout(() => {
      void (async () => {
        const bibleThemeResults = buildBibleThemeResults(trimmed, state.themes);
        const lowerThirdThemeResults = buildLowerThirdThemeResults(trimmed, lowerThirdThemes);
        const mediaResults = buildMediaResults(trimmed, mediaItems);
        const noteResults = buildNoteResults(trimmed, servicePlans);
        const bibleResults = await buildBibleResults(trimmed, state.translation);

        if (!paletteOpenRef.current || runId !== searchRunRef.current) return;

        setResults(mergeResults(
          bibleResults,
          bibleThemeResults,
          lowerThirdThemeResults,
          noteResults,
          mediaResults,
        ));
        setLoading(false);
      })().catch(() => {
        if (!paletteOpenRef.current || runId !== searchRunRef.current) return;
        setResults([]);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, [open, query, state.translation, state.themes, mediaItems, servicePlans, lowerThirdThemes]);

  const activeResult = filteredResults[selectedIndex] ?? null;

  useEffect(() => {
    if (!activeResult || !listRef.current) return;
    const rowTop = selectedIndex * (ITEM_HEIGHT + ITEM_GAP);
    const rowBottom = rowTop + ITEM_HEIGHT + ITEM_GAP;
    const viewportTop = listRef.current.scrollTop;
    const viewportBottom = viewportTop + listRef.current.clientHeight;

    if (rowTop < viewportTop + 12) {
      listRef.current.scrollTop = Math.max(0, rowTop - 12);
    } else if (rowBottom > viewportBottom - 12) {
      listRef.current.scrollTop = rowBottom - listRef.current.clientHeight + 12;
    }
  }, [activeResult, selectedIndex]);

  const handleSelect = useCallback((result: PaletteResult) => {
    switch (result.target.type) {
      case "bible":
        onSelectBibleVerse(result.target.book, result.target.chapter, result.target.verse);
        break;
      case "media":
        if (onNavigate) {
          onNavigate(`/resources?tab=media&mediaId=${encodeURIComponent(result.target.mediaId)}`);
        }
        break;
      case "note":
        if (onNavigate) {
          onNavigate(`/service-planner?planId=${encodeURIComponent(result.target.planId)}&cueId=${encodeURIComponent(result.target.cueId)}`);
        }
        break;
      case "template":
        onSelectTemplate(result.target.templateKind, result.target.themeId);
        break;
      default:
        break;
    }
    onClose();
  }, [onNavigate, onClose, onSelectBibleVerse, onSelectTemplate]);

  const handleDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const isInputLike = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement;
    const isButtonLike = Boolean(target?.closest("button,[role='tab']"));

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (isInputLike) {
      if (event.key === "Enter" && activeResult) {
        event.preventDefault();
        handleSelect(activeResult);
        return;
      }
      if (filteredResults.length > 0 && event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => (current + 1) % filteredResults.length);
        return;
      }
      if (filteredResults.length > 0 && event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => (current - 1 + filteredResults.length) % filteredResults.length);
      }
      return;
    }

    if (isButtonLike) return;

    if (filteredResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % filteredResults.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + filteredResults.length) % filteredResults.length);
      return;
    }

    if (event.key === "Enter" && activeResult) {
      event.preventDefault();
      handleSelect(activeResult);
    }
  }, [activeResult, filteredResults.length, handleSelect, onClose]);

  const listHeight = listRef.current?.clientHeight || 560;
  const visibleCount = Math.max(6, Math.ceil(listHeight / (ITEM_HEIGHT + ITEM_GAP)) + OVERSCAN * 2);
  const startIndex = Math.max(0, Math.min(filteredResults.length, Math.floor(scrollTop / (ITEM_HEIGHT + ITEM_GAP)) - OVERSCAN));
  const endIndex = Math.min(filteredResults.length, startIndex + visibleCount);
  const topSpacer = startIndex * (ITEM_HEIGHT + ITEM_GAP);
  const bottomSpacer = Math.max(0, (filteredResults.length - endIndex) * (ITEM_HEIGHT + ITEM_GAP));
  const visibleResults = filteredResults.slice(startIndex, endIndex);

  if (!open) return null;

  return (
    <div className="bcp-backdrop" onMouseDown={onClose}>
      <div
        className="bcp-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Bible command palette"
      >
        <div className="bcp-search-row">
          <Icon name="search" size={20} className="bcp-search-icon" />
          <input
            ref={inputRef}
            className="bcp-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search across everything..."
            aria-label="Search across Bible, media, notes, and templates"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="bcp-esc-key" aria-hidden="true">ESC</div>
        </div>

        <div className="bcp-tabs" role="tablist" aria-label="Search filters">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={`bcp-tab${filter === "all" ? " is-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            <span>All</span>
            <strong>{counts.all}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "bible"}
            className={`bcp-tab${filter === "bible" ? " is-active" : ""}`}
            onClick={() => setFilter("bible")}
          >
            <span>Bible</span>
            <strong>{counts.bible}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "media"}
            className={`bcp-tab${filter === "media" ? " is-active" : ""}`}
            onClick={() => setFilter("media")}
          >
            <span>Media</span>
            <strong>{counts.media}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "notes"}
            className={`bcp-tab${filter === "notes" ? " is-active" : ""}`}
            onClick={() => setFilter("notes")}
          >
            <span>Notes</span>
            <strong>{counts.notes}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "template"}
            className={`bcp-tab${filter === "template" ? " is-active" : ""}`}
            onClick={() => setFilter("template")}
          >
            <span>Templates</span>
            <strong>{counts.template}</strong>
          </button>
        </div>

        <div
          ref={listRef}
          className="bcp-results"
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop);
          }}
        >
          {loading && filteredResults.length === 0 && (
            <div className="bcp-loading">
              <span className="bcp-spinner" />
              Searching across Bible, media, notes, and templates…
            </div>
          )}

          {!loading && query.trim() && filteredResults.length === 0 && (
            <div className="bcp-empty">
              <strong>No results found</strong>
              <p>Try Bible references, keywords, media names, notes, or templates.</p>
              <ul>
                <li>Bible references</li>
                <li>Keywords</li>
                <li>Media names</li>
                <li>Notes</li>
                <li>Templates</li>
              </ul>
            </div>
          )}

          {filteredResults.length > 0 && (
            <>
              {topSpacer > 0 && <div style={{ height: topSpacer }} aria-hidden="true" />}
              {visibleResults.map((result, index) => {
                const absoluteIndex = startIndex + index;
                const isActive = absoluteIndex === selectedIndex;

                return (
                  <button
                    key={result.id}
                    type="button"
                    className={`bcp-result${isActive ? " is-active" : ""} bcp-result--${result.source}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(absoluteIndex)}
                  >
                    <div className="bcp-result__icon">
                      {result.thumbnailUrl ? (
                        <img src={result.thumbnailUrl} alt="" className="bcp-result__thumb bcp-result__thumb--image" />
                      ) : result.source === "template" ? (
                        <div
                          className="bcp-result__template-preview"
                          style={getTemplatePreviewStyle(result.accentColor)}
                        >
                          <Icon name={result.icon} size={22} />
                        </div>
                      ) : (
                        <div className="bcp-result__icon-tile">
                          <Icon name={result.icon} size={22} />
                        </div>
                      )}
                    </div>

                    <div className="bcp-result__body">
                      <div className="bcp-result__headline">
                        <h3 className="bcp-result__title">{highlightText(result.title, query)}</h3>
                        <span className={`bcp-result__tag bcp-result__tag--${result.source}`}>{result.tag}</span>
                      </div>
                      <p className="bcp-result__preview">{highlightText(result.preview, query)}</p>
                      {result.meta && <p className="bcp-result__meta">{highlightText(result.meta, query)}</p>}
                    </div>

                    <div className="bcp-result__side">
                      {result.source === "media" || result.source === "template" ? (
                        <div
                          className="bcp-result__preview-box"
                          style={result.source === "template" ? getTemplatePreviewStyle(result.accentColor) : undefined}
                        >
                          {result.thumbnailUrl ? (
                            <img src={result.thumbnailUrl} alt="" className="bcp-result__preview-img" />
                          ) : (
                            <div className="bcp-result__preview-fallback">
                              <Icon name={result.source === "media" ? "movie" : "palette"} size={20} />
                              <span>{result.source === "media" ? "Media" : "Template"}</span>
                            </div>
                          )}
                        </div>
                      ) : null}
                      <Icon name="chevron_right" size={18} className="bcp-result__arrow" />
                    </div>
                  </button>
                );
              })}
              {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} aria-hidden="true" />}
            </>
          )}
        </div>

        <div className="bcp-footer">
          <div className="bcp-footer__keys">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>Enter</kbd> Select</span>
            <span><kbd>Esc</kbd> Close</span>
            <span><kbd>Tab</kbd> Filters</span>
          </div>
          <div className="bcp-footer__count">
            {filteredResults.length} result{filteredResults.length === 1 ? "" : "s"} found
          </div>
        </div>
      </div>
    </div>
  );
}
