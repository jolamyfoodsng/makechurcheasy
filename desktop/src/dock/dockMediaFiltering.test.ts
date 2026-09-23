import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compareMediaItemsNewest } from "../library/mediaOrdering";

const dockMediaTabSource = readFileSync(
  fileURLToPath(new URL("./tabs/DockMediaTab.tsx", import.meta.url)),
  "utf8",
);

describe("Dock Media Gallery & Template Separation", () => {
  it("defines comprehensive template detection helpers", () => {
    expect(dockMediaTabSource).toContain("function isTemplateMediaItem(");
    expect(dockMediaTabSource).toContain("function isAnimationMediaItem(");
    expect(dockMediaTabSource).toContain("function isTemplateCatalogUploadFile(");
  });

  it("excludes templates from user uploads and library entries", () => {
    expect(dockMediaTabSource).toContain("if (isAnimationMediaItem(item, templateVideos, templatePictures)) return false;");
    expect(dockMediaTabSource).toContain("const isDownloadedTemplate = isTemplateCatalogUploadFile(file)");
  });

  it("does not assign Date.now() to un-timestamped files in fetchUploads", () => {
    expect(dockMediaTabSource).toContain('"1970-01-01T00:00:00.000Z"');
    expect(dockMediaTabSource).not.toContain("new Date(fetchedAt - index).toISOString()");
  });

  it("orders newly uploaded user media ahead of un-timestamped or older media", () => {
    const freshUserUpload = {
      id: "fresh-user-video",
      name: "sermon_video.mp4",
      type: "video",
      diskFileName: `media_${Date.now()}_sermon_video.mp4`,
      uploadedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const untimestampedAsset = {
      id: "untimestamped-1",
      name: "background.mp4",
      type: "video",
      createdAt: "1970-01-01T00:00:00.000Z",
    };

    const olderUpload = {
      id: "older-video",
      name: "older.mp4",
      type: "video",
      diskFileName: "media_1600000000000_older.mp4",
      uploadedAt: "2020-09-13T12:26:40.000Z",
      createdAt: "2020-09-13T12:26:40.000Z",
    };

    const list = [untimestampedAsset, olderUpload, freshUserUpload];
    list.sort(compareMediaItemsNewest);

    expect(list[0].id).toBe("fresh-user-video");
    expect(list[1].id).toBe("older-video");
    expect(list[2].id).toBe("untimestamped-1");
  });
});
