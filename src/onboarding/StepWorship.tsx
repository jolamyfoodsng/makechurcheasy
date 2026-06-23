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


  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Worship Lyrics</h1>
        <p>
          Manage songs, track keys &amp; tempos, select projection backdrops,
          and display worship lyrics live — step by step with ease.
        </p>
      </div>


      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack}>
            Back
          </button>
          {/* <button className="ob-btn ob-btn--secondary" onClick={onNext}>
            <ChevronRight size={14} />
            Next: Media
          </button> */}
          <button className="ob-btn ob-btn--primary" onClick={onNext}>
            Continue
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
