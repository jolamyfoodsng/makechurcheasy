/**
 * WorshipSongModal.tsx — Two-panel song editor with live slide preview
 *
 * Left panel:  Song metadata + lyrics editor
 * Right panel: Live slide preview grid + theme gallery
 *
 * Replaces the old SongFormModal in SongsTab.tsx.
 */

import { Music, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUILTIN_THEMES } from "../bible/themes/builtinThemes";
import { DEFAULT_THEME_SETTINGS, type BibleTheme, type BibleThemeSettings } from "../bible/types";
import { generateSlides } from "./slideEngine";
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

/** Build inline style for a theme gallery thumbnail */

/* ── Fullscreen themes only ─────────────────────────────────────────────── */

const FULLSCREEN_THEMES: BibleTheme[] = BUILTIN_THEMES.filter(
  (t) => t.templateType === "fullscreen" && !t.hidden,
);

/* ── Component ───────────────────────────────────────────────────────────── */

interface WorshipSongModalProps {
  song?: Song;
  onClose: () => void;
  onSave: () => void;
}

export default function WorshipSongModal({ song, onClose, onSave }: WorshipSongModalProps) {
  const [title, setTitle] = useState(song?.metadata.title ?? nextAutoSongTitle());
  const [artist, setArtist] = useState(song?.metadata.artist ?? "");
  const [lyrics, setLyrics] = useState(song?.lyrics ?? "");
  const [autoSplit, setAutoSplit] = useState(song?.autoSplit ?? true);
  const [linesPerSlide, setLinesPerSlide] = useState(song?.linesPerSlide ?? 2);
  const [selectedThemeId] = useState<string>(
    song?.themeId ?? FULLSCREEN_THEMES[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

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

  /* ── Line / slide counts ── */
  const lineCount = useMemo(() => {
    return lyrics.split("\n").filter((l) => l.trim().length > 0).length;
  }, [lyrics]);

  /* ── Save handler ── */
  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
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
      console.error("[WorshipSongModal] Failed to save song:", err);
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

            <div className="ws-autosplit-bar">
              <label className="ws-autosplit-label">
                <input
                  type="checkbox"
                  checked={autoSplit}
                  onChange={(e) => setAutoSplit(e.target.checked)}
                />
                Auto-split
              </label>
              {autoSplit && (
                <div className="ws-autosplit-controls">
                  <span className="ws-autosplit-hint">Lines:</span>
                  <input
                    type="number"
                    className="ws-autosplit-num"
                    min={1}
                    max={20}
                    value={linesPerSlide}
                    onChange={(e) =>
                      setLinesPerSlide(Math.max(1, parseInt(e.target.value) || 1))
                    }
                  />
                </div>
              )}
            </div>

            <div className="ws-lyrics-wrap">
              <textarea
                className="ws-lyrics-textarea"
                style={{ fontFamily: '"Charis SIL", "SF Mono", "Noto Sans Mono", "Fira Code", "Consolas", monospace' }}
                placeholder={"Verse 1:\nLine 1\nLine 2\n\nChorus:\nChorus line 1\nChorus line 2"}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
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

            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="ws-modal-footer">
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
