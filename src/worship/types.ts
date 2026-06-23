/**
 * types.ts — Worship Module type definitions
 */

export interface Slide {
  id: string;
  label: string;
  content: string;
  isContinuation: boolean;
  type: "verse" | "chorus" | "bridge" | "tag" | "pre-chorus" | "intro" | "outro" | "other";
}

export interface LyricSection {
  id: string;
  label: string;
  shortLabel: string;
  type: Slide["type"];
  lines: string[];
  startSlideIndex: number;
  slideCount: number;
}

export interface SongMetadata {
  title: string;
  artist: string;
  language?: string;
  key?: string;
  tags?: string[];
}

export interface Song {
  id: string;
  metadata: SongMetadata;
  lyrics: string;
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
  importSourceName?: string;
  importSourceType?: "manual" | "online";
  importSourceUrl?: string;
  archived?: boolean;
  archivedAt?: string | null;
  /** ID of the BibleThemeSettings theme selected in the song editor */
  themeId?: string;
  /** Whether auto-split was enabled when this song was saved */
  autoSplit?: boolean;
  /** Number of lyric lines per slide when auto-split is enabled */
  linesPerSlide?: number;
}

export interface SplitConfig {
  linesPerSlide: number;
  identifyChorus: boolean;
}
