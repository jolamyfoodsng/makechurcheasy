import { describe, expect, it } from "vitest";
import { compareTemplateAssetsNewest } from "./templateVideos";

describe("template catalog ordering", () => {
  it("puts the most recently modified template first", () => {
    const newest = {
      fileName: "new-video.mp4",
      modified: "2026-08-26T12:00:00.000Z",
    };
    const older = {
      fileName: "old-video.mp4",
      modified: "2026-08-25T12:00:00.000Z",
    };

    expect([older, newest].sort(compareTemplateAssetsNewest)[0]).toBe(newest);
  });
});
