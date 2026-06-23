/**
 * StepWorship — Interactive Worship lyrics preview widget for onboarding.
 *
 * Reproduces the worship projection workflow: song selection, lyric slide
 * stepping, theme switching — all self-contained with mock data.
 */

import { useState } from "react";
import {
  Music,
  Palette,
  Search,
  ChevronRight,
} from "lucide-react";

/* ── Mock Data ── */

interface SongSlide {
  id: string;
  label: string;
  lines: string[];
}

interface Song {
  id: string;
  title: string;
  key: string;
  bpm: number;
  slides: SongSlide[];
}

interface WorshipTheme {
  id: string;
  name: string;
  gradient: string;
}

const SONGS: Song[] = [
  {
    id: "great-are-you-lord",
    title: "Great Are You Lord",
    key: "E",
    bpm: 72,
    slides: [
      { id: "s1", label: "Verse 1", lines: ["Great are You, Lord", "You are holy and just", "By Your power we trust", "In Your amazing love"] },
      { id: "s2", label: "Chorus", lines: ["It's Your breath in our lungs", "So we pour out our praise", "We pour out our praise to You"] },
      { id: "s3", label: "Bridge", lines: ["All the earth will shout Your praise", "Our hearts will cry, these bones will sing", "Great are You, Lord"] },
    ],
  },
  {
    id: "goodness-of-god",
    title: "Goodness Of God",
    key: "D",
    bpm: 74,
    slides: [
      { id: "g1", label: "Verse 1", lines: ["I love You, Lord", "For Your mercy never fails me", "All my days, I've been held in Your hands"] },
      { id: "g2", label: "Chorus", lines: ["All my life You have been faithful", "All my life You have been so, so good", "I will sing of the goodness of God"] },
    ],
  },
];

const THEMES: WorshipTheme[] = [
  { id: "cosmic", name: "Cosmic Twilight", gradient: "linear-gradient(135deg, #0c0d1b, #2a1b41, #0d0718)" },
  { id: "emerald", name: "Emerald Glade", gradient: "linear-gradient(135deg, #071317, #092c25, #040c0f)" },
  { id: "sunset", name: "Velvet Amber", gradient: "linear-gradient(135deg, #1c1012, #351025, #14080a)" },
];

/* ── Component ── */

export default function StepWorship({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [selectedSongId, setSelectedSongId] = useState("great-are-you-lord");
  const [slideIndex, setSlideIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [themeId, setThemeId] = useState("cosmic");
  const [activeTab, setActiveTab] = useState<"songs" | "themes">("songs");

  const song = SONGS.find((s) => s.id === selectedSongId) || SONGS[0];
  const slide = song.slides[slideIndex] || song.slides[0];
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];

  const filteredSongs = SONGS.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectSong = (id: string) => {
    setSelectedSongId(id);
    setSlideIndex(0);
  };

  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Worship Lyrics</h1>
        <p>
          Manage songs, track keys &amp; tempos, select projection backdrops,
          and display worship lyrics live — step by step with ease.
        </p>
      </div>

      {/* ── Interactive Worship Widget ── */}
      <div className="ob-worship-widget">
        {/* Left nav rail */}
        <div className="ob-worship-rail">
          <button
            className={`ob-worship-rail-btn${activeTab === "songs" ? " is-active" : ""}`}
            onClick={() => setActiveTab("songs")}
            title="Songs"
          >
            <Music size={14} />
          </button>
          <button
            className={`ob-worship-rail-btn${activeTab === "themes" ? " is-active" : ""}`}
            onClick={() => setActiveTab("themes")}
            title="Themes"
          >
            <Palette size={14} />
          </button>
        </div>

        {/* Middle selection column */}
        <div className="ob-worship-panel">
          {activeTab === "songs" ? (
            <>
              <div className="ob-worship-panel-header">
                <span className="ob-worship-panel-title">Songs</span>
                <div className="ob-worship-search">
                  <Search size={10} />
                  <input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="ob-worship-list">
                {filteredSongs.map((s) => {
                  const sel = s.id === selectedSongId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => selectSong(s.id)}
                      className={`ob-worship-song-btn${sel ? " is-selected" : ""}`}
                    >
                      <div className="ob-worship-song-info">
                        <span className="ob-worship-song-title">{s.title}</span>
                        <span className="ob-worship-song-meta">
                          Key: {s.key} &bull; {s.bpm} BPM
                        </span>
                      </div>
                      <ChevronRight size={12} className="ob-worship-song-arrow" />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="ob-worship-panel-header">
                <span className="ob-worship-panel-title">Themes</span>
                <span className="ob-worship-panel-sub">Choose overlay backdrop</span>
              </div>
              <div className="ob-worship-list">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setThemeId(t.id)}
                    className={`ob-worship-theme-btn${t.id === themeId ? " is-selected" : ""}`}
                  >
                    <div
                      className="ob-worship-theme-swatch"
                      style={{ background: t.gradient }}
                    />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right — projection preview */}
        <div className="ob-worship-preview">
          <div className="ob-worship-preview-header">
            <span className="ob-worship-preview-label">Projection View</span>
            <span className="ob-worship-live-badge">Active Stream</span>
            <div className="ob-worship-steppers">
              <button
                onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
                disabled={slideIndex === 0}
                className="ob-worship-step-btn"
              >
                ←
              </button>
              <span className="ob-worship-step-counter">
                {slideIndex + 1}/{song.slides.length}
              </span>
              <button
                onClick={() => setSlideIndex((i) => Math.min(song.slides.length - 1, i + 1))}
                disabled={slideIndex === song.slides.length - 1}
                className="ob-worship-step-btn"
              >
                →
              </button>
            </div>
          </div>

          <div className="ob-worship-backdrop">
            <div
              className="ob-worship-backdrop-gradient"
              style={{ background: theme.gradient }}
            />
            <div className="ob-worship-backdrop-overlay" />
            <div className="ob-worship-backdrop-live">
              <span className="ob-worship-backdrop-ping" />
              LIVE OVERLAY
            </div>
            <div className="ob-worship-backdrop-content">
              <div className="ob-worship-lyrics">
                {slide.lines.map((line, idx) => (
                  <p key={`${slide.id}-${idx}`} className="ob-worship-lyric-line">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack}>
            Back
          </button>
          <button className="ob-btn ob-btn--secondary" onClick={onNext}>
            <ChevronRight size={14} />
            Next: Media
          </button>
        </div>
        <button className="ob-btn ob-btn--primary" onClick={onNext}>
          Continue
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
