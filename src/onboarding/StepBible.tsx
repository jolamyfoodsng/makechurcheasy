/**
 * StepBible — Interactive Bible preview widget for the onboarding wizard.
 *
 * Reproduces the key UX of the Bible presentation engine: version switching,
 * verse selection, and live overlay preview — all self-contained with mock data.
 */

import { useState } from "react";
import {
  Search,
  History,
  ChevronDown,
  ChevronRight,
  Check,
  Book,
} from "lucide-react";

/* ── Mock Data ── */

interface BibleVersion {
  id: string;
  name: string;
  shortName: string;
}

interface BibleVerse {
  ref: string;
  text: string;
}

const VERSIONS: BibleVersion[] = [
  { id: "niv", name: "New International Version", shortName: "NIV" },
  { id: "kjv", name: "King James Version", shortName: "KJV" },
  { id: "esv", name: "English Standard Version", shortName: "ESV" },
  { id: "nlt", name: "New Living Translation", shortName: "NLT" },
  { id: "nasb", name: "New American Standard", shortName: "NASB" },
];

const VERSES: Record<string, Record<string, BibleVerse>> = {
  "john-3-16": {
    niv: { ref: "John 3:16", text: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life." },
    kjv: { ref: "John 3:16", text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." },
    esv: { ref: "John 3:16", text: "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life." },
    nlt: { ref: "John 3:16", text: "For this is how God loved the world: He gave his one and only Son, so that everyone who believes in him will not perish but have eternal life." },
    nasb: { ref: "John 3:16", text: "For God so loved the world, that He gave His only begotten Son, that whoever believes in Him shall not perish, but have life." },
  },
  "psalm-23-1": {
    niv: { ref: "Psalm 23:1", text: "The Lord is my shepherd, I lack nothing." },
    kjv: { ref: "Psalm 23:1", text: "The Lord is my shepherd; I shall not want." },
    esv: { ref: "Psalm 23:1", text: "The Lord is my shepherd; I shall not want." },
    nlt: { ref: "Psalm 23:1", text: "The Lord is my shepherd, I have all that I need." },
    nasb: { ref: "Psalm 23:1", text: "The Lord is my shepherd, I will not be in need." },
  },
  "romans-8-28": {
    niv: { ref: "Romans 8:28", text: "And we know that in all things God works for the good of those who love him, who have been called according to his purpose." },
    kjv: { ref: "Romans 8:28", text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose." },
    esv: { ref: "Romans 8:28", text: "And we know that for those who love God all things work together for good, for those who are called according to his purpose." },
    nlt: { ref: "Romans 8:28", text: "And we know that God causes everything to work together for the good of those who love God and are called according to his purpose." },
    nasb: { ref: "Romans 8:28", text: "And we know that God causes all things to work together for good to those who love God, to those who are called." },
  },
};

/* ── Component ── */

export default function StepBible({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [verseKey, setVerseKey] = useState("john-3-16");
  const [versionId, setVersionId] = useState("niv");
  const [showVerseDropdown, setShowVerseDropdown] = useState(false);

  const verse = VERSES[verseKey]?.[versionId] || VERSES["john-3-16"]["niv"];
  const version = VERSIONS.find((v) => v.id === versionId) || VERSIONS[0];

  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Bible Presentation</h1>
        <p>
          Display scriptures beautifully in your services. Switch versions, browse
          verses, and preview the live overlay — all in real time.
        </p>
      </div>

      {/* ── Interactive Bible Widget ── */}
      <div className="ob-bible-widget">
        {/* Left nav rail */}
        <div className="ob-bible-rail">
          <div className="ob-bible-rail-icon ob-bible-rail-icon--active">
            <Book size={14} />
          </div>
          <div className="ob-bible-rail-icon">
            <Search size={14} />
          </div>
          <div className="ob-bible-rail-icon">
            <History size={14} />
          </div>
        </div>

        {/* Main content */}
        <div className="ob-bible-main">
          {/* Breadcrumb */}
          <div className="ob-bible-breadcrumb">
            <div className="ob-bible-breadcrumb-left">
              <span className="ob-bible-bc-label">Bible</span>
              <span className="ob-bible-bc-sep">/</span>
              <div className="ob-bible-dropdown-wrap">
                <button
                  className="ob-bible-dropdown-trigger"
                  onClick={() => setShowVerseDropdown(!showVerseDropdown)}
                >
                  {verse.ref}
                  <ChevronDown size={12} />
                </button>
                {showVerseDropdown && (
                  <>
                    <div
                      className="ob-bible-dropdown-overlay"
                      onClick={() => setShowVerseDropdown(false)}
                    />
                    <div className="ob-bible-dropdown-menu">
                      {Object.keys(VERSES).map((key) => (
                        <button
                          key={key}
                          onClick={() => {
                            setVerseKey(key);
                            setShowVerseDropdown(false);
                          }}
                          className={`ob-bible-dropdown-item${key === verseKey ? " is-active" : ""}`}
                        >
                          {VERSES[key][versionId].ref}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <span className="ob-bible-viewport-badge">Viewport Ready</span>
          </div>

          {/* Verse display */}
          <div className="ob-bible-verse-area">
            <div className="ob-bible-verse-fade">
              <p className="ob-bible-verse-text">&ldquo;{verse.text}&rdquo;</p>
              <div className="ob-bible-verse-tag">
                {verse.ref} ({version.shortName})
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — versions */}
        <div className="ob-bible-versions">
          <div className="ob-bible-versions-header">
            <span className="ob-bible-versions-title">Versions</span>
            <span className="ob-bible-pulse-dot" />
          </div>
          <div className="ob-bible-versions-list">
            {VERSIONS.map((v) => {
              const sel = v.id === versionId;
              return (
                <button
                  key={v.id}
                  onClick={() => setVersionId(v.id)}
                  className={`ob-bible-version-btn${sel ? " is-selected" : ""}`}
                >
                  <div className="ob-bible-version-info">
                    <span className="ob-bible-version-short">{v.shortName}</span>
                    <span className="ob-bible-version-full">{v.name}</span>
                  </div>
                  {sel && <Check size={12} className="ob-bible-version-check" />}
                </button>
              );
            })}
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
            Next: Worship
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
