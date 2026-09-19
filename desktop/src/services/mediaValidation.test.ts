import { describe, expect, it } from "vitest";
import {
  getMediaKind,
  isSupportedMediaFile,
  isSupportedImageFile,
  isSupportedVideoFile,
  DOCK_MEDIA_ACCEPT,
} from "./mediaValidation";

describe("media kind detection", () => {
  it("falls back to the extension when the native picker provides no MIME type", () => {
    expect(getMediaKind({ name: "service-video.mp4", type: "" } as File)).toBe("video");
    expect(getMediaKind({ name: "service-slide.png", type: "" } as File)).toBe("image");
    expect(getMediaKind({ name: "service-audio.mp3", type: "" } as File)).toBe("audio");
  });

  it("detects extended video formats with empty MIME types", () => {
    const videoFiles = [
      "clip.mkv", "presentation.webm", "recording.avi", "stream.flv",
      "broadcast.ts", "camcorder.mts", "mobile.3gp", "render.mov", "promo.wmv",
    ];
    for (const name of videoFiles) {
      const file = { name, type: "" } as File;
      expect(isSupportedMediaFile(file)).toBe(true);
      expect(isSupportedVideoFile(file)).toBe(true);
      expect(getMediaKind(file)).toBe("video");
    }
  });

  it("detects image formats with empty MIME types", () => {
    const imageFiles = ["slide.png", "photo.jpg", "graphic.webp", "icon.svg", "banner.avif"];
    for (const name of imageFiles) {
      const file = { name, type: "" } as File;
      expect(isSupportedMediaFile(file)).toBe(true);
      expect(isSupportedImageFile(file)).toBe(true);
      expect(getMediaKind(file)).toBe("image");
    }
  });

  it("detects extended audio formats with empty MIME types", () => {
    const audioFiles = [
      "sermon.wav", "choir.flac", "podcast.m4a", "track.ogg", "speech.opus",
      "worship.aac", "anthem.aiff", "music.wma", "hymn.mid",
    ];
    for (const name of audioFiles) {
      const file = { name, type: "" } as File;
      expect(isSupportedMediaFile(file)).toBe(true);
      expect(getMediaKind(file)).toBe("audio");
    }
  });

  it("DOCK_MEDIA_ACCEPT includes wildcards and explicit audio, video, image, document extensions", () => {
    expect(DOCK_MEDIA_ACCEPT).toContain("video/*");
    expect(DOCK_MEDIA_ACCEPT).toContain("audio/*");
    expect(DOCK_MEDIA_ACCEPT).toContain("image/*");
    // Extensions so OS dialogs don't filter them out
    expect(DOCK_MEDIA_ACCEPT).toContain(".mkv");
    expect(DOCK_MEDIA_ACCEPT).toContain(".webm");
    expect(DOCK_MEDIA_ACCEPT).toContain(".mp4");
    expect(DOCK_MEDIA_ACCEPT).toContain(".mov");
    expect(DOCK_MEDIA_ACCEPT).toContain(".mp3");
    expect(DOCK_MEDIA_ACCEPT).toContain(".wav");
    expect(DOCK_MEDIA_ACCEPT).toContain(".m4a");
    expect(DOCK_MEDIA_ACCEPT).toContain(".flac");
    expect(DOCK_MEDIA_ACCEPT).toContain(".pdf");
    expect(DOCK_MEDIA_ACCEPT).toContain(".docx");
    expect(DOCK_MEDIA_ACCEPT).toContain(".pptx");
  });
});
