/**
 * studioSlides.ts — turns songs, notes and media into the slide cards the Studio shows.
 */
import type { Song } from "../worship/types";
import type { Slide } from "../worship/types";
import type { MediaItem } from "../library/libraryTypes";
import type { StudioSlide } from "./studioEngine";

/** A slide plus what the card needs to draw itself. */
export interface DeckSlide extends StudioSlide {
  /** Song section type, for the card's colour. */
  tone?: Slide["type"];
  /** Small picture for media cards (data or overlay-server path). */
  thumb?: string;
}

export function songSlides(song: Song): DeckSlide[] {
  return (song.slides || []).map((slide, index) => ({
    key: `song:${song.id}:${index}`,
    module: "worship" as const,
    label: slide.label || `Slide ${index + 1}`,
    text: slide.content,
    reference: "",
    itemTitle: song.metadata.title,
    tone: slide.type,
    origin: { kind: "song" as const, id: song.id, index },
  }));
}

/** The overlay-server path of a library item (so it works on any origin). */
export function mediaPath(item: MediaItem): string {
  if (item.diskFileName) return `/uploads/${encodeURIComponent(item.diskFileName)}`;
  return (item.url || "").replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i, "");
}

/** A rendered PDF / Word / PowerPoint page (they live in the media library as pictures). */
export function isDocumentPage(item: MediaItem): boolean {
  return Boolean(item.documentId) || item.source === "document-conversion";
}

export function mediaSlide(item: MediaItem, fit?: "contain" | "cover"): DeckSlide | null {
  if (item.type !== "image" && item.type !== "video" && item.type !== "audio") return null;
  const url = mediaPath(item);
  if (!url) return null;
  const doc = isDocumentPage(item);
  const label = item.type === "video" ? "Video" : item.type === "audio" ? "Sound" : doc ? `Page ${item.documentPageNumber ?? 1}` : "Picture";
  return {
    key: `media:${item.id}`,
    module: "media",
    label,
    text: "",
    reference: "",
    itemTitle: doc ? (item.documentSourceName || item.name) : item.name,
    thumb: item.thumbnailUrl || (item.type === "image" ? url : undefined),
    // Document pages are shown whole; pictures and videos fill the screen (as before).
    media: { kind: item.type, url, fit: fit ?? (doc ? "contain" : "cover"), loop: item.type !== "audio", muted: false },
    origin: { kind: doc ? "doc" : "media", id: item.id, index: doc ? (item.documentPageNumber ?? 1) - 1 : undefined },
  };
}

interface ToneStyle {
  /** Card tag background and text colours. */
  bg: string;
  fg: string;
  name: string;
}

const TONES: Record<string, ToneStyle> = {
  verse: { bg: "#1d3a72", fg: "#cfe0ff", name: "VERSE" },
  chorus: { bg: "#4a2a6e", fg: "#e6d3ff", name: "CHORUS" },
  "pre-chorus": { bg: "#5a2a56", fg: "#f3d3ef", name: "PRE-CHORUS" },
  bridge: { bg: "#1c5a4a", fg: "#c9f5e6", name: "BRIDGE" },
  tag: { bg: "#6a4a14", fg: "#ffe7b3", name: "TAG" },
  intro: { bg: "#3a4258", fg: "#dbe2f5", name: "INTRO" },
  outro: { bg: "#3a4258", fg: "#dbe2f5", name: "OUTRO" },
  other: { bg: "#3a4258", fg: "#dbe2f5", name: "" },
};

export function toneStyle(tone?: string): ToneStyle {
  return (tone && TONES[tone]) || TONES.other;
}
