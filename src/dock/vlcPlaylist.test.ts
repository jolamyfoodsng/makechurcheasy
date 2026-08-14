import { describe, expect, it } from "vitest";
import { buildVlcPlaylistItems } from "./vlcPlaylist";

describe("buildVlcPlaylistItems", () => {
  it("uses OBS's value field for every playlist location", () => {
    expect(buildVlcPlaylistItems([
      "/Users/example/uploads/first video.mp4",
      "https://cdn.example.test/second-video.mp4",
    ])).toEqual([
      {
        hidden: false,
        selected: false,
        value: "/Users/example/uploads/first video.mp4",
      },
      {
        hidden: false,
        selected: false,
        value: "https://cdn.example.test/second-video.mp4",
      },
    ]);
  });

  it("does not send blank playlist rows", () => {
    expect(buildVlcPlaylistItems(["", "  ", "/tmp/valid.mp4"])).toEqual([
      {
        hidden: false,
        selected: false,
        value: "/tmp/valid.mp4",
      },
    ]);
  });
});
