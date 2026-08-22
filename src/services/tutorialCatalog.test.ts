import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentTutorialVideos,
  getYouTubeEmbedUrl,
  normalizeTutorialCatalog,
  setTutorialProgressStatus,
  type TutorialPlaylist,
} from "./tutorialCatalog";

const playlist: TutorialPlaylist = {
  playlistId: "start-here",
  title: "Start here",
  description: "",
  category: "Basics",
  tags: [],
  featured: true,
  enabled: true,
  sortOrder: 0,
  videos: [
    { videoId: "new", title: "New", description: "", youtubeUrl: "https://youtu.be/abcdefghijk", tags: [], release: "current", featured: false, enabled: true, sortOrder: 0 },
    { videoId: "old", title: "Old", description: "", youtubeUrl: "https://youtu.be/lmnopqrstuv", tags: [], release: "legacy", featured: false, enabled: true, sortOrder: 1 },
  ],
};

describe("tutorial catalogue", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      key: () => null,
      get length() { return values.size; },
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage, location: { pathname: "/" } });
  });

  it("keeps only valid enabled playlists and sorts their videos", () => {
    const catalogue = normalizeTutorialCatalog([{ ...playlist, videos: [...playlist.videos].reverse() }, { playlistId: "", title: "Invalid" }]);
    expect(catalogue).toHaveLength(1);
    expect(catalogue[0].videos.map((video) => video.videoId)).toEqual(["new", "old"]);
  });

  it("does not surface legacy videos in the app", () => {
    expect(getCurrentTutorialVideos(playlist).map((video) => video.videoId)).toEqual(["new"]);
  });

  it("creates a safe privacy-enhanced YouTube embed URL", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/watch?v=abcdefghijk")).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0&modestbranding=1");
    expect(getYouTubeEmbedUrl("not a url")).toBeNull();
  });

  it("stores a manual completion state", () => {
    const progress = setTutorialProgressStatus({}, "new", "completed");
    expect(progress.new.status).toBe("completed");
  });
});
