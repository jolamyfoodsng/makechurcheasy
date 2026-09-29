import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getSceneMediaSourceName,
  isMediaNativeManagedSource,
  DOCK_MEDIA_AUDIO_SOURCE,
  DOCK_MEDIA_VIDEO_SOURCE,
  DOCK_MEDIA_IMAGE_SOURCE,
  DOCK_PRESENTATION_SCENE,
} from "./dockObsClient";

const dockMediaTabSource = readFileSync(
  fileURLToPath(new URL("./tabs/DockMediaTab.tsx", import.meta.url)),
  "utf8",
);

describe("Dock Scene Media Independence", () => {
  it("targets standard MCE Presentation sources when target scene is MCE Presentation", () => {
    expect(getSceneMediaSourceName("audio", "Worship Song.mp3", DOCK_PRESENTATION_SCENE))
      .toBe(DOCK_MEDIA_AUDIO_SOURCE);
    expect(getSceneMediaSourceName("video", "Intro Video.mp4", DOCK_PRESENTATION_SCENE))
      .toBe(DOCK_MEDIA_VIDEO_SOURCE);
    expect(getSceneMediaSourceName("image", "Slide.png", DOCK_PRESENTATION_SCENE))
      .toBe(DOCK_MEDIA_IMAGE_SOURCE);
  });

  it("generates isolated scene-specific source names when target scene is another scene", () => {
    const customAudioSource = getSceneMediaSourceName(
      "audio",
      "Special Praise.mp3",
      "Auxiliary Room Scene",
      "media:special-praise-123",
    );

    // Must NOT be the global MCE Presentation audio source
    expect(customAudioSource).not.toBe(DOCK_MEDIA_AUDIO_SOURCE);
    expect(customAudioSource).toMatch(/^MCE Scene Audio - Special Praise - [a-z0-9]+$/i);

    const customVideoSource = getSceneMediaSourceName(
      "video",
      "Welcome.mp4",
      "Lobby Display",
      "media:welcome-456",
    );
    expect(customVideoSource).not.toBe(DOCK_MEDIA_VIDEO_SOURCE);
    expect(customVideoSource).toMatch(/^MCE Scene Video - Welcome - [a-z0-9]+$/i);
  });

  it("ensures different media items in other scenes have distinct source names", () => {
    const source1 = getSceneMediaSourceName("audio", "Track A.mp3", "Scene 1", "key-a");
    const source2 = getSceneMediaSourceName("audio", "Track B.mp3", "Scene 2", "key-b");
    expect(source1).not.toBe(source2);
  });

  it("recognizes isolated scene media sources as native media in isMediaNativeManagedSource", () => {
    expect(isMediaNativeManagedSource(DOCK_MEDIA_AUDIO_SOURCE)).toBe(true);
    expect(isMediaNativeManagedSource(DOCK_MEDIA_VIDEO_SOURCE)).toBe(true);
    expect(isMediaNativeManagedSource(DOCK_MEDIA_IMAGE_SOURCE)).toBe(true);
    expect(isMediaNativeManagedSource("MCE Scene Audio - Track - 12345678")).toBe(true);
    expect(isMediaNativeManagedSource("MCE Scene Video - Clip - 12345678")).toBe(true);
    expect(isMediaNativeManagedSource("MCE Scene Image - Photo - 12345678")).toBe(true);
    expect(isMediaNativeManagedSource("MCE Audio - Track")).toBe(true);
    expect(isMediaNativeManagedSource("Bible - MCE Presentation")).toBe(false);
  });

  it("DockMediaTab passes sceneSendSelection to buildSceneMediaSourceName so sources remain independent", () => {
    expect(dockMediaTabSource).toContain("sourceName: buildSceneMediaSourceName(entry, sceneSendSelection)");
    expect(dockMediaTabSource).toContain("function buildSceneMediaSourceName(entry: DockMediaEntry, targetScene?: string): string");
  });
});
