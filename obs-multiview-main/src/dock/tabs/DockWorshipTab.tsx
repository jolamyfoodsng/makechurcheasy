/**
 * DockWorshipTab.tsx — Worship tab for the OBS Browser Dock
 *
 * Two views:
 *   1. Song List — shows saved songs with search
 *   2. Lyric Controller — shows song sections (verse/chorus/bridge)
 *      with live/preview indicators and send controls
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { DockStagedItem, DockWorshipSection } from "../dockTypes";
import type { DockLTThemeRef } from "../dockObsClient";
import { dockObsClient } from "../dockObsClient";
import DockLTThemePicker from "../components/DockLTThemePicker";
import DockBibleThemePicker from "../components/DockBibleThemePicker";
import { BUILTIN_THEMES } from "../../bible/themes/builtinThemes";
import type { BibleTheme } from "../../bible/types";
import { dockClient } from "../../services/dockBridge";
import Icon from "../../components/Icon";

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
}

type OverlayMode = "fullscreen" | "lower-third";

/** Minimal song type for the dock (imported from worshipDb dynamically) */
interface DockSong {
  id: string;
  title: string;
  artist: string;
  sections: DockWorshipSection[];
}

/**
 * Parse raw song lyrics into sections.
 * Supports multiple formats:
 *   - Bracketed headers: [Verse 1], [Chorus], etc.
 *   - Stanza breaks: double newlines separate sections
 *   - Falls back to treating entire lyrics as one section
 */
function parseLyricSections(lyrics: string): DockWorshipSection[] {
  if (!lyrics.trim()) return [];

  const sections: DockWorshipSection[] = [];
  const lines = lyrics.split("\n");
  let currentLabel = "";
  let currentLines: string[] = [];
  let id = 1;
  let hasBracketHeaders = false;

  // First pass: check if any bracketed headers exist
  for (const line of lines) {
    if (/^\[.+\]\s*$/.test(line)) {
      hasBracketHeaders = true;
      break;
    }
  }

  if (hasBracketHeaders) {
    // Parse by bracketed headers
    for (const line of lines) {
      const match = line.match(/^\[(.+)\]\s*$/);
      if (match) {
        if (currentLines.length > 0) {
          sections.push({
            id: `sec-${id++}`,
            label: currentLabel || `Verse ${sections.length + 1}`,
            text: currentLines.join("\n").trim(),
          });
          currentLines = [];
        }
        currentLabel = match[1];
      } else {
        currentLines.push(line);
      }
    }
    if (currentLines.length > 0) {
      sections.push({
        id: `sec-${id++}`,
        label: currentLabel || `Verse ${sections.length + 1}`,
        text: currentLines.join("\n").trim(),
      });
    }
  } else {
    // Parse by stanza breaks (double newlines)
    const stanzas = lyrics.split(/\n\s*\n/).filter((s) => s.trim());
    if (stanzas.length > 1) {
      for (const stanza of stanzas) {
        sections.push({
          id: `sec-${id++}`,
          label: `Verse ${sections.length + 1}`,
          text: stanza.trim(),
        });
      }
    } else {
      // Single block — treat as one section
      sections.push({
        id: `sec-1`,
        label: "Verse 1",
        text: lyrics.trim(),
      });
    }
  }

  return sections;
}

export default function DockWorshipTab({ onStage }: Props) {
  const [songs, setSongs] = useState<DockSong[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSong, setSelectedSong] = useState<DockSong | null>(null);
  const [liveIdx, setLiveIdx] = useState<number | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<DockLTThemeRef | null>(null);
  const [selectedFSTheme, setSelectedFSTheme] = useState<BibleTheme>(BUILTIN_THEMES[0]);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("lower-third");

  // ── Song loading logic (reusable so we can refresh) ──
  const mapSongs = useCallback(
    (all: Array<{ id: string; metadata: { title: string; artist?: string }; lyrics?: string }>): DockSong[] =>
      all.map((s) => ({
        id: s.id,
        title: s.metadata.title,
        artist: s.metadata.artist || "",
        sections: parseLyricSections(s.lyrics || ""),
      })),
    []
  );

  const loadSongs = useCallback(async () => {
    console.log("[DockWorshipTab] Loading songs...");

    // Strategy 1: try IndexedDB (works when dock runs in same Tauri webview)
    try {
      const { getAllSongs } = await import("../../worship/worshipDb");
      const all = await getAllSongs();
      console.log("[DockWorshipTab] IndexedDB returned", all.length, "songs");
      if (all.length > 0) {
        setSongs(mapSongs(all));
        return;
      }
    } catch (err) {
      console.log("[DockWorshipTab] IndexedDB not available:", err);
    }

    // Strategy 2: fetch from overlay server (works when dock runs in OBS CEF)
    try {
      const res = await fetch("/uploads/dock-worship-songs.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const all = await res.json();
      console.log("[DockWorshipTab] JSON fetch returned", Array.isArray(all) ? all.length : 0, "songs");
      if (Array.isArray(all) && all.length > 0) {
        setSongs(mapSongs(all));
        return;
      }
    } catch (err) {
      console.log("[DockWorshipTab] JSON fetch failed:", err);
    }

    console.warn("[DockWorshipTab] No songs found from any source");
  }, [mapSongs]);

  // Load songs on mount
  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  // Listen for library-updated signal to refresh songs
  useEffect(() => {
    const unsub = dockClient.onState((msg) => {
      if (msg.type === "state:library-updated" || msg.type === "state:songs-data") {
        loadSongs();
      }
    });
    return unsub;
  }, [loadSongs]);

  const filteredSongs = searchQuery.trim()
    ? songs.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.artist.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : songs;

  const handleSelectSong = useCallback((song: DockSong) => {
    setSelectedSong(song);
    setLiveIdx(null);
    setPreviewIdx(null);
  }, []);

  const handleSectionClick = useCallback(
    (idx: number) => {
      if (!selectedSong) return;
      const section = selectedSong.sections[idx];
      if (!section) return;
      setPreviewIdx(idx);
      onStage({
        type: "worship",
        label: section.label,
        subtitle: `${selectedSong.title}${selectedSong.artist ? ` — ${selectedSong.artist}` : ""}`,
        data: {
          song: selectedSong,
          sectionIdx: idx,
          sectionText: section.text,
          overlayMode,
          ltTheme: overlayMode === "lower-third" ? selectedTheme : undefined,
          bibleThemeSettings: overlayMode === "fullscreen" ? selectedFSTheme.settings : undefined,
        },
      });
    },
    [selectedSong, selectedTheme, selectedFSTheme, overlayMode, onStage]
  );

  const handleGoLiveSection = useCallback(
    (idx: number) => {
      setLiveIdx(idx);
      setPreviewIdx(null);
      if (selectedSong) {
        const section = selectedSong.sections[idx];
        if (section) {
          onStage({
            type: "worship",
            label: `${section.label} (LIVE)`,
            subtitle: selectedSong.title,
            data: {
              song: selectedSong,
              sectionIdx: idx,
              sectionText: section.text,
              overlayMode,
              ltTheme: overlayMode === "lower-third" ? selectedTheme : undefined,
              bibleThemeSettings: overlayMode === "fullscreen" ? selectedFSTheme.settings : undefined,
              isLive: true,
            },
          });
        }
      }
    },
    [selectedSong, selectedTheme, selectedFSTheme, overlayMode, onStage]
  );

  const handleClearLyrics = useCallback(() => {
    setLiveIdx(null);
    setPreviewIdx(null);
    onStage(null);
    // Also clear the OBS overlay source directly
    if (dockObsClient.isConnected) {
      dockObsClient.clearWorshipLyrics().catch((err) =>
        console.warn("[DockWorshipTab] clearWorshipLyrics failed:", err)
      );
    }
  }, [onStage]);

  // ── Re-stage current section when overlay mode changes ──
  const prevOverlayMode = useRef(overlayMode);
  useEffect(() => {
    if (prevOverlayMode.current === overlayMode) return;   // skip mount
    prevOverlayMode.current = overlayMode;

    const idx = previewIdx ?? liveIdx;
    if (!selectedSong || idx === null) return;
    const section = selectedSong.sections[idx];
    if (!section) return;

    onStage({
      type: "worship",
      label: previewIdx !== null ? section.label : `${section.label} (LIVE)`,
      subtitle: `${selectedSong.title}${selectedSong.artist ? ` — ${selectedSong.artist}` : ""}`,
      data: {
        song: selectedSong,
        sectionIdx: idx,
        sectionText: section.text,
        overlayMode,
        ltTheme: overlayMode === "lower-third" ? selectedTheme : undefined,
        bibleThemeSettings: overlayMode === "fullscreen" ? selectedFSTheme.settings : undefined,
        ...(liveIdx !== null && previewIdx === null ? { isLive: true } : {}),
      },
    });
  }, [overlayMode, selectedSong, previewIdx, liveIdx, selectedTheme, selectedFSTheme, onStage]);

  const handleBackToSongList = useCallback(() => {
    setSelectedSong(null);
    setLiveIdx(null);
    setPreviewIdx(null);
  }, []);

  // ── Song list view ──
  if (!selectedSong) {
    return (
      <>
        <div className="dock-search">
          <Icon name="search" size={20} />
          <input
            className="dock-input"
            placeholder="Search songs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {filteredSongs.length === 0 && (
          <div className="dock-empty">
            <Icon name="music_off" size={20} />
            <div className="dock-empty__title">
              {songs.length === 0 ? "No Songs" : "No Results"}
            </div>
            <div className="dock-empty__text">
              {songs.length === 0
                ? "Add songs in the app's Worship module."
                : `No songs match "${searchQuery}"`}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="dock-section-label" style={{ margin: 0 }}>Songs ({filteredSongs.length})</div>
          <button
            className="dock-btn"
            style={{ padding: "2px 6px", fontSize: 11, minWidth: 0 }}
            onClick={loadSongs}
            title="Refresh song list"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
        {filteredSongs.map((song) => (
          <div
            key={song.id}
            className="dock-card"
            onClick={() => handleSelectSong(song)}
          >
            <div className="dock-card__title">{song.title}</div>
            {song.artist && <div className="dock-card__subtitle">{song.artist}</div>}
          </div>
        ))}
      </>
    );
  }

  // ── Lyric controller view ──
  return (
    <>
      {/* Back button */}
      <div className="dock-breadcrumb">
        <button className="dock-breadcrumb-btn" onClick={handleBackToSongList}>
          <Icon name="arrow_back" size={20} />
          Songs
        </button>
        <span className="dock-breadcrumb-sep">›</span>
        <span className="dock-breadcrumb-current">{selectedSong.title}</span>
      </div>

      {/* Overlay mode toggle */}
      <div className="dock-section-label" style={{ marginTop: 4 }}>Overlay Mode</div>
      <div className="dock-theme-bar" style={{ marginBottom: 8 }}>
        <button
          className={`dock-theme-pill${overlayMode === "fullscreen" ? " dock-theme-pill--active" : ""}`}
          onClick={() => setOverlayMode("fullscreen")}
        >
          <Icon name="fullscreen" size={14} />
          Fullscreen
        </button>
        <button
          className={`dock-theme-pill${overlayMode === "lower-third" ? " dock-theme-pill--active" : ""}`}
          onClick={() => setOverlayMode("lower-third")}
        >
          <Icon name="subtitles" size={14} />
          Lower Third
        </button>
      </div>

      {/* Theme selector — changes based on overlay mode */}
      {overlayMode === "fullscreen" ? (
        <DockBibleThemePicker
          selectedThemeId={selectedFSTheme.id}
          onSelect={setSelectedFSTheme}
          label="Worship Fullscreen Theme"
        />
      ) : (
        <DockLTThemePicker
          selectedThemeId={selectedTheme?.id ?? null}
          onSelect={(t) => {
            setSelectedTheme(t);
            // Re-stage if a section is already selected
            if (selectedSong && previewIdx !== null) {
              const section = selectedSong.sections[previewIdx];
              if (section) {
                onStage({
                  type: "worship",
                  label: section.label,
                  subtitle: selectedSong.title,
                  data: { song: selectedSong, sectionIdx: previewIdx, sectionText: section.text, ltTheme: t, overlayMode },
                });
              }
            }
          }}
          category="worship"
          label="Worship Lower Third Theme"
          tags={["worship", "lyrics", "song", "chorus", "verse", "music"]}
        />
      )}

      {/* Song sections */}
      <div className="dock-section-label">Lyrics</div>

      {selectedSong.sections.length === 0 && (
        <div className="dock-empty" style={{ padding: 16 }}>
          <Icon name="lyrics" size={20} />
          <div className="dock-empty__text">
            This song has no lyrics sections.
          </div>
        </div>
      )}

      {selectedSong.sections.map((section, idx) => (
        <div
          key={section.id}
          className={`dock-lyric-card${
            liveIdx === idx
              ? " dock-lyric-card--live"
              : previewIdx === idx
                ? " dock-lyric-card--preview"
                : ""
          }`}
          onClick={() => handleSectionClick(idx)}
          onDoubleClick={() => handleGoLiveSection(idx)}
        >
          <div className="dock-lyric-card__header">
            <span className="dock-lyric-card__label">{section.label}</span>
            {liveIdx === idx && (
              <span className="dock-lyric-badge dock-lyric-badge--live">
                <Icon name="fiber_manual_record" size={8} />
                Live
              </span>
            )}
            {previewIdx === idx && liveIdx !== idx && (
              <span className="dock-lyric-badge dock-lyric-badge--preview">Preview</span>
            )}
          </div>
          <div className="dock-lyric-card__text">{section.text}</div>
        </div>
      ))}

      {/* Clear lyrics button */}
      <div className="dock-spacer" />
      <button
        className="dock-btn dock-btn--danger"
        style={{ width: "100%" }}
        onClick={handleClearLyrics}
        disabled={liveIdx === null && previewIdx === null}
      >
        <Icon name="clear" size={20} />
        Clear Lyrics
      </button>
    </>
  );
}
