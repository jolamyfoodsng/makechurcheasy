import { describe, expect, it } from "vitest";
import {
  compareMediaItemsNewest,
  getMediaSortTimestamp,
  getUploadTimestampFromFileName,
} from "./mediaOrdering";

describe("media upload ordering", () => {
  it("reads the upload marker from generated filenames", () => {
    expect(getUploadTimestampFromFileName("media_1787647609533_intro.mp4")).toBe(
      "2026-08-25T08:46:49.533Z",
    );
  });

  it("uses the explicit upload time before a stale createdAt value", () => {
    expect(getMediaSortTimestamp({
      createdAt: "2020-01-01T00:00:00.000Z",
      uploadedAt: "2026-08-24T12:00:00.000Z",
    })).toBe(Date.parse("2026-08-24T12:00:00.000Z"));
  });

  it("uses the latest download time for refreshed template media", () => {
    const refreshed = {
      id: "template-video",
      name: "template-video.mp4",
      type: "video",
      createdAt: "2020-01-01T00:00:00.000Z",
      downloadedAt: "2026-08-25T12:00:00.000Z",
    };
    const older = {
      id: "older-video",
      name: "older-video.mp4",
      type: "video",
      createdAt: "2026-08-24T12:00:00.000Z",
    };

    expect(compareMediaItemsNewest(refreshed, older)).toBeLessThan(0);
  });

  it("puts placeholder dates behind real uploads", () => {
    const newest = {
      id: "new-video",
      name: "new-video.mp4",
      type: "video",
      diskFileName: "media_1787647609533_new-video.mp4",
      createdAt: "0001-01-01T00:00:00.000Z",
    };
    const legacy = {
      id: "legacy-video",
      name: "legacy-video.mp4",
      type: "video",
      createdAt: "0001-01-01T00:00:00.000Z",
    };

    expect(compareMediaItemsNewest(newest, legacy)).toBeLessThan(0);
  });

  it("uses a stable key when uploads share the same timestamp", () => {
    const first = {
      id: "b-upload",
      name: "b.png",
      type: "image",
      uploadedAt: "2026-08-24T12:00:00.000Z",
    };
    const second = {
      id: "a-upload",
      name: "a.png",
      type: "image",
      uploadedAt: "2026-08-24T12:00:00.000Z",
    };

    expect(compareMediaItemsNewest(first, second)).toBeGreaterThan(0);
    expect(compareMediaItemsNewest(second, first)).toBeLessThan(0);
  });
});
