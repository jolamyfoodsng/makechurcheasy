/**
 * studioDockAdapter.ts — turns what the Dock puts on screen into Studio items.
 *
 * The Dock's staged item already carries the exact theme settings, look
 * (full screen / lower third) and text it would send to OBS, so the projector
 * looks the same as OBS.
 */
import type { DockStagedItem } from "../dock/dockTypes";
import type { MediaItem } from "../library/libraryTypes";
import type { BibleThemeSettings } from "../bible/types";
import { dockObsClient } from "../dock/dockObsClient";
import { withoutAnimation, type StudioItem, type StudioMedia, type StudioMode, type StudioTransition } from "./studioEngine";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The look (full screen / lower third) the Dock chose for this item. */
export function dockItemMode(item: DockStagedItem): StudioMode {
  return record(item.data).overlayMode === "lower-third" ? "lower-third" : "fullscreen";
}

/** A Dock staged item (Bible, Worship, Notes) as a Studio item, or null when it isn't shown on screen. */
export function studioItemFromDock(item: DockStagedItem, transition: StudioTransition): StudioItem | null {
  const data = record(item.data);
  const module = item.type === "bible" ? "bible" : item.type === "worship" ? "worship" : item.type === "notes" ? "notes" : null;
  if (!module) return null;

  const body = module === "bible" ? text(data.verseText) : text(data.sectionText);
  const content = body || item.subtitle || item.label;
  const reference = module === "bible"
    ? text(data.displayReferenceLabel) || text(data.referenceLabel) || item.label
    : "";

  const merged = { ...record(data.bibleThemeSettings), ...record(data.liveOverrides) };
  const hasTheme = Object.keys(merged).length > 0;
  const settings = hasTheme
    ? (transition === "cut" ? withoutAnimation(merged as unknown as BibleThemeSettings) : merged)
    : null;

  const { data: packet } = dockObsClient.buildStudioOverlayPacket({
    text: content,
    reference,
    verseRange: text(data.verseRange) || undefined,
    lineCount: count(data.lineCount),
    mode: dockItemMode(item),
    themeSettings: settings as Record<string, unknown> | null,
  });
  return { module, data: packet, label: reference || item.label };
}

/** A picture or video the Dock's Media tab sent. */
export function studioItemFromMedia(media: MediaItem, fit?: string): StudioItem | null {
  if (media.type !== "image" && media.type !== "video") return null;
  const raw = text(media.url);
  const url = media.diskFileName
    ? `/uploads/${encodeURIComponent(media.diskFileName)}`
    : raw.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i, "");
  if (!url) return null;
  const item: StudioMedia = {
    kind: media.type,
    url,
    fit: fit === "contain" ? "contain" : "cover",
    loop: true,
    muted: false,
  };
  return { module: "media", media: item, label: media.name };
}
