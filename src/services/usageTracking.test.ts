/**
 * usageTracking.test.ts — Tests for usage sync logic.
 *
 * Validates resource counting, payload construction, and filtering
 * that mirrors the syncUsageToServer() function in usageSync.ts.
 */

import { describe, it, expect } from "vitest";

// ── Inline logic (mirrors syncUsageToServer payload construction) ──

interface MockSong {
  id: string;
  title: string;
  archived?: boolean;
}

interface MockMedia {
  id: string;
  type: "image" | "video";
  name: string;
}

interface MockTheme {
  id: string;
  name: string;
  templateType: "fullscreen" | "lower-third" | "side-by-side";
}

interface MockTranslation {
  id: string;
  abbr: string;
  name: string;
}

function countSongs(songs: MockSong[]): number {
  return songs.filter((s) => !s.archived).length;
}

function countMediaByType(media: MockMedia[]): { images: number; videos: number } {
  const images = media.filter((m) => m.type === "image").length;
  const videos = media.filter((m) => m.type === "video").length;
  return { images, videos };
}

function countThemes(themes: MockTheme[]): { themes: number; lowerThirds: number } {
  const themesCount = themes.filter((t) => t.templateType === "fullscreen").length;
  const lowerThirds = themes.filter(
    (t) => t.templateType === "lower-third" || t.templateType === "side-by-side"
  ).length;
  return { themes: themesCount, lowerThirds };
}

function buildUsagePayload(opts: {
  songs: MockSong[];
  media: MockMedia[];
  themes: MockTheme[];
  translations: MockTranslation[];
}): {
  songs: number;
  images: number;
  videos: number;
  themes: number;
  lowerThirds: number;
  devices: number;
  bibleVersions: number;
} {
  const { images, videos } = countMediaByType(opts.media);
  const { themes, lowerThirds } = countThemes(opts.themes);

  return {
    songs: countSongs(opts.songs),
    images,
    videos,
    themes,
    lowerThirds,
    devices: 0, // server tracks device count
    bibleVersions: opts.translations.length,
  };
}

// ── Tests ──

describe("Usage tracking — song counting", () => {
  it("counts all non-archived songs", () => {
    const songs: MockSong[] = [
      { id: "1", title: "Song A" },
      { id: "2", title: "Song B" },
      { id: "3", title: "Song C", archived: true },
    ];
    expect(countSongs(songs)).toBe(2);
  });

  it("returns 0 for empty list", () => {
    expect(countSongs([])).toBe(0);
  });

  it("counts all songs when none archived", () => {
    const songs: MockSong[] = [
      { id: "1", title: "A" },
      { id: "2", title: "B" },
    ];
    expect(countSongs(songs)).toBe(2);
  });

  it("returns 0 when all songs archived", () => {
    const songs: MockSong[] = [
      { id: "1", title: "A", archived: true },
      { id: "2", title: "B", archived: true },
    ];
    expect(countSongs(songs)).toBe(0);
  });
});

describe("Usage tracking — media counting", () => {
  it("separates images and videos", () => {
    const media: MockMedia[] = [
      { id: "1", type: "image", name: "photo.jpg" },
      { id: "2", type: "video", name: "clip.mp4" },
      { id: "3", type: "image", name: "banner.png" },
    ];
    const result = countMediaByType(media);
    expect(result.images).toBe(2);
    expect(result.videos).toBe(1);
  });

  it("returns zeros for empty media", () => {
    const result = countMediaByType([]);
    expect(result.images).toBe(0);
    expect(result.videos).toBe(0);
  });

  it("handles all images", () => {
    const media: MockMedia[] = [
      { id: "1", type: "image", name: "a.jpg" },
      { id: "2", type: "image", name: "b.jpg" },
    ];
    expect(countMediaByType(media)).toEqual({ images: 2, videos: 0 });
  });

  it("handles all videos", () => {
    const media: MockMedia[] = [
      { id: "1", type: "video", name: "a.mp4" },
    ];
    expect(countMediaByType(media)).toEqual({ images: 0, videos: 1 });
  });
});

describe("Usage tracking — theme counting", () => {
  it("separates fullscreen themes from lower-thirds", () => {
    const themes: MockTheme[] = [
      { id: "1", name: "Theme A", templateType: "fullscreen" },
      { id: "2", name: "Lower A", templateType: "lower-third" },
      { id: "3", name: "Side A", templateType: "side-by-side" },
      { id: "4", name: "Theme B", templateType: "fullscreen" },
    ];
    const result = countThemes(themes);
    expect(result.themes).toBe(2);
    expect(result.lowerThirds).toBe(2);
  });

  it("counts lower-third and side-by-side together", () => {
    const themes: MockTheme[] = [
      { id: "1", name: "LT", templateType: "lower-third" },
      { id: "2", name: "SB", templateType: "side-by-side" },
    ];
    expect(countThemes(themes).lowerThirds).toBe(2);
  });

  it("returns zeros for empty themes", () => {
    expect(countThemes([])).toEqual({ themes: 0, lowerThirds: 0 });
  });
});

describe("Usage tracking — full payload construction", () => {
  it("builds correct payload from mixed data", () => {
    const payload = buildUsagePayload({
      songs: [
        { id: "1", title: "A" },
        { id: "2", title: "B", archived: true },
      ],
      media: [
        { id: "1", type: "image", name: "a.jpg" },
        { id: "2", type: "video", name: "b.mp4" },
      ],
      themes: [
        { id: "1", name: "T", templateType: "fullscreen" },
        { id: "2", name: "L", templateType: "lower-third" },
      ],
      translations: [{ id: "1", abbr: "KJV", name: "King James" }],
    });

    expect(payload).toEqual({
      songs: 1,
      images: 1,
      videos: 1,
      themes: 1,
      lowerThirds: 1,
      devices: 0,
      bibleVersions: 1,
    });
  });

  it("returns all zeros for empty data", () => {
    const payload = buildUsagePayload({
      songs: [],
      media: [],
      themes: [],
      translations: [],
    });

    expect(payload).toEqual({
      songs: 0,
      images: 0,
      videos: 0,
      themes: 0,
      lowerThirds: 0,
      devices: 0,
      bibleVersions: 0,
    });
  });

  it("devices is always 0 (server-tracked)", () => {
    const payload = buildUsagePayload({
      songs: [],
      media: [],
      themes: [],
      translations: [],
    });
    expect(payload.devices).toBe(0);
  });
});
