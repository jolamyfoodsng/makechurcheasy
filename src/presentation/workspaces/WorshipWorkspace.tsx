import { Search } from "lucide-react";

import type { Song, LyricSection } from "../../worship/types";
import type { PresentationTextAlign } from "../types";

interface ThemeOption {
  id: string;
  name: string;
}

interface WorshipWorkspaceProps {
  songs: Song[];
  songQuery: string;
  onSongQueryChange: (value: string) => void;
  selectedSongId: string | null;
  onSelectSong: (songId: string) => void;
  sections: LyricSection[];
  activeSectionId: string | null;
  onSelectSection: (section: LyricSection) => void;
  themeOptions: ThemeOption[];
  selectedThemeId: string;
  onThemeChange: (value: string) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  textAlign: PresentationTextAlign;
  onTextAlignChange: (value: PresentationTextAlign) => void;
  backgroundColor: string;
  onBackgroundColorChange: (value: string) => void;
}

export function WorshipWorkspace({
  songs,
  songQuery,
  onSongQueryChange,
  selectedSongId,
  onSelectSong,
  sections,
  activeSectionId,
  onSelectSection,
  themeOptions,
  selectedThemeId,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  textAlign,
  onTextAlignChange,
  backgroundColor,
  onBackgroundColorChange,
}: WorshipWorkspaceProps) {
  return (
    <div className="presentation-workspace">
      <div className="presentation-workspace__split">
        <div className="presentation-library-panel">
          <div className="presentation-library-search">
            <Search size={16} />
            <input
              value={songQuery}
              className="presentation-input presentation-input--search"
              placeholder="Search songs"
              onChange={(event) => onSongQueryChange(event.target.value)}
            />
          </div>
          <div className="presentation-library-list">
            {songs.map((song) => (
              <button
                key={song.id}
                type="button"
                className={`presentation-library-item${selectedSongId === song.id ? " is-active" : ""}`}
                onClick={() => onSelectSong(song.id)}
              >
                <strong>{song.metadata.title}</strong>
                <span>{song.metadata.artist || "Worship library"}</span>
              </button>
            ))}
            {songs.length === 0 ? (
              <div className="presentation-library-empty">No songs found.</div>
            ) : null}
          </div>
        </div>

        <div className="presentation-library-panel">
          <div className="presentation-panel-title">Sections</div>
          <div className="presentation-library-list">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`presentation-library-item${activeSectionId === section.id ? " is-active" : ""}`}
                onClick={() => onSelectSection(section)}
              >
                <strong>{section.label}</strong>
                <span>{section.lines.join(" ")}</span>
              </button>
            ))}
            {sections.length === 0 ? (
              <div className="presentation-library-empty">Select a song to view sections.</div>
            ) : null}
          </div>
        </div>

        <div className="presentation-settings-panel">
          <div className="presentation-settings-grid">
            <label className="presentation-field">
              <span>Theme</span>
              <select value={selectedThemeId} className="presentation-input" onChange={(event) => onThemeChange(event.target.value)}>
                {themeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="presentation-field">
              <span>Font size</span>
              <input
                type="range"
                min={28}
                max={120}
                value={fontSize}
                onChange={(event) => onFontSizeChange(Number(event.target.value))}
              />
            </label>
            <label className="presentation-field">
              <span>Alignment</span>
              <select value={textAlign} className="presentation-input" onChange={(event) => onTextAlignChange(event.target.value as PresentationTextAlign)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="presentation-field">
              <span>Background</span>
              <input type="color" value={backgroundColor} onChange={(event) => onBackgroundColorChange(event.target.value)} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
