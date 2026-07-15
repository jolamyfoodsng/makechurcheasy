/**
 * WorshipSongModal.tsx — Two-panel song editor with live slide preview
 *
 * Left panel:  Song metadata + lyrics editor
 * Right panel: Live slide preview grid + theme gallery
 *
 * Replaces the old SongFormModal in SongsTab.tsx.
 */

import { ListX, Music, Save, Type, Undo, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";
import { DEFAULT_THEME_SETTINGS, type BibleTheme, type BibleThemeSettings } from "../bible/types";
import { generateSlides, parseWorshipLyricSections } from "./slideEngine";
import { nextAutoSongTitle } from "./songTitleAutoGen";
import type { Slide, Song } from "./types";
import { saveSong } from "./worshipDb";
import "./worshipSongModal.css";

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Resolve a theme's settings by merging with defaults */
function resolveThemeSettings(theme: BibleTheme): BibleThemeSettings {
  return { ...DEFAULT_THEME_SETTINGS, ...theme.settings };
}

/** Build inline style for a slide card background from resolved theme settings */
function themeBackgroundStyle(s: BibleThemeSettings): React.CSSProperties {
  if (s.backgroundImage) {
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,${s.backgroundOpacity * 0.5}), rgba(0,0,0,${s.backgroundOpacity * 0.5})), url(${s.backgroundImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { backgroundColor: s.backgroundColor };
}

/** Slide layout presets — user picks a formatting strategy, not a raw number */
const LAYOUT_PRESETS = [
  { key: "1", label: "1 Line", linesPerSlide: 1, autoSplit: true },
  { key: "2", label: "2 Lines", linesPerSlide: 2, autoSplit: true },
  { key: "3", label: "3 Lines", linesPerSlide: 3, autoSplit: true },
  { key: "4", label: "4 Lines", linesPerSlide: 4, autoSplit: true },
  { key: "manual", label: "Manual", linesPerSlide: 2, autoSplit: false },
] as const;

/* ── Fullscreen themes only ─────────────────────────────────────────────── */

const FULLSCREEN_THEMES: BibleTheme[] = BUILTIN_THEMES.filter(
  (t) => t.templateType === "fullscreen" && !t.hidden,
);

/* ── Auto-split helper ──────────────────────────────────────────────────── */

/** Reformat raw lyrics text so each slide group is separated by a blank line. */
function reformatLyrics(text: string, linesPerSlide: number): string {
  if (!text.trim()) return text;
  const raw = text.replace(/\n{2,}/g, "\n").trim();
  const sections = parseWorshipLyricSections(raw, linesPerSlide);
  if (sections.length === 0) return text;
  const formatted = sections
    .map((section) => {
      const label = section.label ? `${section.label}:` : "";
      const chunks: string[] = [];
      for (let i = 0; i < section.lines.length; i += linesPerSlide) {
        chunks.push(section.lines.slice(i, i + linesPerSlide).join("\n"));
      }
      return [label, ...chunks].filter(Boolean).join("\n\n");
    })
    .filter(Boolean)
    .join("\n\n");
  return formatted || text;
}

function capitalizeLyricsText(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line.replace(/\b([A-Za-z])([A-Za-z'’-]*)/g, (_, first: string, rest: string) =>
        `${first.toUpperCase()}${rest.toLowerCase()}`,
      ),
    )
    .join("\n");
}

function cleanLyricsText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let next = line;
      next = next.replace(/\t/g, " ");
      next = next.replace(/\s{2,}/g, " ");
      next = next.replace(/ ,/g, ",");
      next = next.replace(/ \./g, ".");
      next = next.replace(/ :/g, ":");
      next = next.replace(/([,:;.])([A-Za-z])/g, "$1 $2");
      next = next.replace(/\s+$/g, "");
      return next.trimStart();
    })
    .join("\n");
}

function removeEmptyLyricsLines(text: string): string {
  const lines = text.split("\n");
  const collapsed: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const isBlank = trimmed === "" || /^[^\w]+$/.test(trimmed);
    if (isBlank) {
      blankCount++;
      if (blankCount <= 1) collapsed.push("");
      continue;
    }
    blankCount = 0;
    collapsed.push(line);
  }
  return collapsed.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

function removeVerseNumbers(text: string): string {
  return text
    .replace(/^\d+[.)]\s*/gm, "")
    .replace(/^\[[\d]+\]\s*/gm, "")
    .replace(/^\([\d]+\)\s*/gm, "")
    .replace(/^Verse\s+\d+\s*:?\s*/gim, "");
}

/* ── Component ───────────────────────────────────────────────────────────── */

interface WorshipSongEditorProps {
  song?: Song;
  onClose: () => void;
  onSave: () => void;
}

export default function WorshipSongEditor({ song, onClose, onSave }: WorshipSongEditorProps) {
  const [title, setTitle] = useState(song?.metadata.title ?? nextAutoSongTitle());
  const [artist, setArtist] = useState(song?.metadata.artist ?? "");
  const [lyrics, setLyrics] = useState(song?.lyrics ?? "");
  const [autoSplit, setAutoSplit] = useState(song?.autoSplit ?? true);
  const [linesPerSlide, setLinesPerSlide] = useState(song?.linesPerSlide ?? 2);
  const [selectedThemeId, setSelectedThemeId] = useState<string>(
    song?.themeId ?? FULLSCREEN_THEMES[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef(lyrics);
  const lyricsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const formatUndoRef = useRef<string>("");
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
  lyricsRef.current = lyrics;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  /* ESC to close */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* NOTE: reformatLyrics removed — it inserted \n\n between slide groups within
     sections, which the Dock parser (splitting on \n\n) misinterpreted as
     section boundaries, destroying the song structure. */

  /* ── Live slide generation ── */
  const slides: Slide[] = useMemo(
    () => (lyrics.trim() ? generateSlides(lyrics, linesPerSlide, autoSplit) : []),
    [lyrics, linesPerSlide, autoSplit],
  );

  /* ── Resolved theme for preview ── */
  const resolvedTheme = useMemo(() => {
    const found = FULLSCREEN_THEMES.find((t) => t.id === selectedThemeId);
    return found ? resolveThemeSettings(found) : { ...DEFAULT_THEME_SETTINGS };
  }, [selectedThemeId]);

  const bgStyle = useMemo(() => themeBackgroundStyle(resolvedTheme), [resolvedTheme]);

  /* ── Cycle to next theme ── */
  const cycleTheme = useCallback(() => {
    setSelectedThemeId((prev) => {
      const idx = FULLSCREEN_THEMES.findIndex((t) => t.id === prev);
      return FULLSCREEN_THEMES[(idx + 1) % FULLSCREEN_THEMES.length].id;
    });
  }, []);

  /* ── Layout preset selection ── */
  const activeLayoutKey = useMemo(() => {
    if (!autoSplit) return "manual";
    const match = LAYOUT_PRESETS.find(
      (p) => p.autoSplit && p.linesPerSlide === linesPerSlide,
    );
    return match?.key ?? "manual";
  }, [autoSplit, linesPerSlide]);

  const handleLayoutChange = useCallback(
    (preset: (typeof LAYOUT_PRESETS)[number]) => {
      if (preset.autoSplit) {
        const formatted = reformatLyrics(lyricsRef.current, preset.linesPerSlide);
        setLyrics(formatted);
      }
      setLinesPerSlide(preset.linesPerSlide);
      setAutoSplit(preset.autoSplit);
    },
    [],
  );

  const syncSelectionRange = useCallback(() => {
    const textarea = lyricsTextareaRef.current;
    if (!textarea) return;
    setSelectionRange({
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
    });
  }, []);

  const applyLyricsTransformation = useCallback((
    transform: (text: string) => string,
    mode: "selection-or-all" | "all" = "selection-or-all",
  ) => {
    const textarea = lyricsTextareaRef.current;
    const current = lyricsRef.current;
    const start = textarea?.selectionStart ?? selectionRange.start;
    const end = textarea?.selectionEnd ?? selectionRange.end;
    const hasSelection = end > start;

    formatUndoRef.current = current;

    let nextLyrics = current;
    let nextStart = start;
    let nextEnd = end;

    if (mode === "selection-or-all" && hasSelection) {
      const selectedText = current.slice(start, end);
      const transformed = transform(selectedText);
      nextLyrics = `${current.slice(0, start)}${transformed}${current.slice(end)}`;
      nextEnd = start + transformed.length;
    } else {
      nextLyrics = transform(current);
      if (hasSelection) {
        nextStart = Math.min(start, nextLyrics.length);
        nextEnd = Math.min(end, nextLyrics.length);
      } else {
        nextStart = 0;
        nextEnd = 0;
      }
    }

    setLyrics(nextLyrics);
    requestAnimationFrame(() => {
      const node = lyricsTextareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(nextStart, nextEnd);
      setSelectionRange({ start: nextStart, end: nextEnd });
    });
  }, [selectionRange.end, selectionRange.start]);

  const handleUndoFormatting = useCallback(() => {
    if (!formatUndoRef.current) return;
    const previous = formatUndoRef.current;
    setLyrics(previous);
    requestAnimationFrame(() => {
      const node = lyricsTextareaRef.current;
      if (!node) return;
      node.focus();
      const end = Math.min(previous.length, selectionRange.end);
      const start = Math.min(previous.length, selectionRange.start);
      node.setSelectionRange(start, end);
      setSelectionRange({ start, end });
    });
    formatUndoRef.current = "";
  }, [selectionRange.end, selectionRange.start]);

  /* ── Line / slide counts ── */
  const lineCount = useMemo(() => {
    return lyrics.split("\n").filter((l) => l.trim().length > 0).length;
  }, [lyrics]);

  const selectionLength = Math.max(0, selectionRange.end - selectionRange.start);

  /* ── Save handler ── */
  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const updated: Song = {
        id: song?.id ?? uid(),
        metadata: {
          title: title.trim(),
          artist: artist.trim(),
        },
        lyrics,
        slides,
        createdAt: song?.createdAt ?? now,
        updatedAt: now,
        themeId: selectedThemeId || undefined,
        autoSplit,
        linesPerSlide,
      };
      await saveSong(updated);
      onSave();
    } catch (err) {
      console.error("[WorshipSongEditor] Failed to save song:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [title, artist, lyrics, slides, song, onSave, selectedThemeId, autoSplit, linesPerSlide]);

  const isEdit = !!song;

  return (
    <div
      className="ws-modal-backdrop"
      ref={backdropRef}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        className="ws-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit Song" : "Add Song"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <header className="ws-modal-header">
          <div className="ws-modal-header-left">
            <div className="ws-modal-header-icon">
              <Music size={14} />
            </div>
            <h2 className="ws-modal-title">{isEdit ? "Edit Song" : "Add Song"}</h2>
          </div>
          <button className="ws-modal-close" onClick={onClose} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>

        {/* ── Body ── */}
        <div className="ws-modal-body">
          {/* Left panel — metadata + lyrics */}
          <div className="ws-left-panel">
            <div className="ws-left-fields">
              <div>
                <label className="ws-field-label">Song Title</label>
                <input
                  ref={titleRef}
                  className="ws-field-input"
                  type="text"
                  placeholder="e.g. Way Maker"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="ws-field-label">Artist</label>
                <input
                  className="ws-field-input"
                  type="text"
                  placeholder="Optional"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                />
              </div>
            </div>

            <div className="ws-layout-bar">
              <label className="ws-layout-label" htmlFor="ws-layout-select">Slide Layout</label>
              <select
                id="ws-layout-select"
                className="ws-field-input ws-layout-select"
                value={activeLayoutKey}
                onChange={(e) => {
                  const preset = LAYOUT_PRESETS.find((p) => p.key === e.target.value);
                  if (preset) handleLayoutChange(preset);
                }}
              >
                {LAYOUT_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-lyrics-wrap">
              <div className="ws-lyrics-toolbar">
                <div className="ws-lyrics-toolbar__meta">
                  <span className="ws-lyrics-toolbar__meta-icon">
                    <Type size={12} />
                  </span>
                  <span>{selectionLength > 0 ? `${selectionLength} selected` : "Lyrics tools"}</span>
                </div>
                <div className="ws-lyrics-toolbar__group" aria-label="Text case controls">
                  <button
                    type="button"
                    className="ws-lyrics-toolbar__btn ws-lyrics-toolbar__btn--case"
                    onClick={() => applyLyricsTransformation((text) => text.toLocaleUpperCase())}
                    title="Uppercase"
                    aria-label="Uppercase"
                  >
                    TT
                  </button>
                  <button
                    type="button"
                    className="ws-lyrics-toolbar__btn ws-lyrics-toolbar__btn--case"
                    onClick={() => applyLyricsTransformation((text) => text.toLocaleLowerCase())}
                    title="Lowercase"
                    aria-label="Lowercase"
                  >
                    tt
                  </button>
                  <button
                    type="button"
                    className="ws-lyrics-toolbar__btn ws-lyrics-toolbar__btn--case"
                    onClick={() => applyLyricsTransformation(capitalizeLyricsText)}
                    title="Capitalize"
                    aria-label="Capitalize"
                  >
                    Tt
                  </button>
                </div>
                <button
                  type="button"
                  className="ws-lyrics-toolbar__btn"
                  onClick={() => applyLyricsTransformation(cleanLyricsText, "all")}
                  title="Clean text"
                >
                  <Wand2 size={12} />
                  <span>Clean</span>
                </button>
                <button
                  type="button"
                  className="ws-lyrics-toolbar__btn"
                  onClick={() => applyLyricsTransformation(removeEmptyLyricsLines, "all")}
                  title="Remove empty lines"
                >
                  <ListX size={12} />
                  <span>Trim Gaps</span>
                </button>
                <button
                  type="button"
                  className="ws-lyrics-toolbar__btn"
                  onClick={() => applyLyricsTransformation(removeVerseNumbers, "all")}
                  title="Remove verse numbers"
                >
                  <span>#</span>
                  <span>Strip Numbers</span>
                </button>
                <button
                  type="button"
                  className="ws-lyrics-toolbar__btn"
                  onClick={handleUndoFormatting}
                  title="Undo formatting"
                  disabled={!formatUndoRef.current}
                >
                  <Undo size={12} />
                  <span>Undo</span>
                </button>
              </div>
              <textarea
                ref={lyricsTextareaRef}
                className="ws-lyrics-textarea"
                style={{ fontFamily: '"Charis SIL", "SF Mono", "Noto Sans Mono", "Fira Code", "Consolas", monospace' }}
                placeholder={"Verse 1:\nLine 1\nLine 2\n\nChorus:\nChorus line 1\nChorus line 2"}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                onSelect={syncSelectionRange}
                onKeyUp={syncSelectionRange}
                onMouseUp={syncSelectionRange}
                onFocus={syncSelectionRange}
              />
            </div>

            <div className="ws-left-footer">
              <span>{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
              <span>{slides.length} slide{slides.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Right panel — slide preview + theme gallery */}
          <div className="ws-right-panel">
            <div className="ws-preview-scroll">
              <h3 className="ws-preview-heading">Slide Preview</h3>

              {slides.length === 0 ? (
                <div className="ws-preview-empty">
                  <Music size={40} />
                  <p>Type lyrics to see slides here</p>
                </div>
              ) : (
                <div className="ws-preview-grid">
                  {slides.map((slide) => (
                    <div
                      key={slide.id}
                      className="ws-slide-card"
                      style={bgStyle}
                    >
                      <span className="ws-slide-card-label">{slide.label}</span>
                      <div className="ws-slide-card-content">
                        {slide.content.split("\n").map((line, i) => (
                          <p
                            key={i}
                            style={{
                              color: resolvedTheme.fontColor,
                              fontFamily: resolvedTheme.fontFamily,
                              textShadow: resolvedTheme.textShadow,
                            }}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Theme gallery strip */}
            <div className="ws-theme-strip">
              <button
                type="button"
                className="ws-theme-cycle"
                onClick={cycleTheme}
                title="Click to cycle theme"
              >
                <div
                  className="ws-theme-cycle-preview"
                  style={bgStyle}
                />
                <span className="ws-theme-cycle-name">
                  {FULLSCREEN_THEMES.find((t) => t.id === selectedThemeId)?.name ?? "Theme"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="ws-modal-footer">
          {error && <p className="ws-save-error">{error}</p>}
          <button className="ws-btn-secondary" onClick={onClose} title="Cancel">
            Cancel
          </button>
          <button
            className="ws-btn-primary"
            disabled={!title.trim() || saving}
            onClick={handleSave}
            title="Update">
            <Save size={14} />
            {saving ? "Saving…" : isEdit ? "Update Song" : "Save Song"}
          </button>
        </footer>
      </div>
    </div>
  );
}
