import type { BibleVerse, BibleTheme } from "../bible/types";
import type { MediaItem } from "../library/libraryTypes";
import { toStoredOverlayAssetUrl } from "../services/overlayUrl";
import type { Song, Slide } from "../worship/types";
import type {
  PresentationCountdownPayload,
  PresentationMediaPayload,
  PresentationMediaPlaybackState,
  PresentationRemoteItem,
  PresentationStyleSnapshot,
  PresentationTextAlign,
  PresentationTickerPayload,
  PresentationTextSlideRecord,
} from "./types";

export const DEFAULT_PRESENTATION_STYLE: PresentationStyleSnapshot = {
  fontFamily: '"CMG Sans", "Inter", sans-serif',
  fontSize: 64,
  fontWeight: 700,
  lineHeight: 1.2,
  textColor: "#FFFFFF",
  textAlign: "center",
  textShadow: "0 12px 40px rgba(0,0,0,0.48)",
  backgroundColor: "#050816",
  backgroundOpacity: 1,
  overlayColor: "#000000",
  overlayOpacity: 0.38,
  padding: 28,
  safeArea: 56,
};

function toStoredAsset(value: string | undefined): string | undefined {
  const stored = toStoredOverlayAssetUrl(value);
  return stored || undefined;
}

function coerceAlign(value: string | undefined): PresentationTextAlign {
  if (value === "left" || value === "right") {
    return value;
  }
  return "center";
}

export function themeToStyle(
  theme: BibleTheme | undefined,
  overrides: Partial<PresentationStyleSnapshot> = {},
): PresentationStyleSnapshot {
  const settings = theme?.settings;
  return {
    ...DEFAULT_PRESENTATION_STYLE,
    fontFamily: settings?.fontFamily || DEFAULT_PRESENTATION_STYLE.fontFamily,
    fontSize: settings?.fontSize || DEFAULT_PRESENTATION_STYLE.fontSize,
    fontWeight: settings?.fontWeight === "light" ? 300 : settings?.fontWeight === "normal" ? 500 : 700,
    lineHeight: settings?.lineHeight || DEFAULT_PRESENTATION_STYLE.lineHeight,
    textColor: settings?.fontColor || DEFAULT_PRESENTATION_STYLE.textColor,
    textAlign: coerceAlign(settings?.textAlign),
    textShadow: settings?.textShadow || DEFAULT_PRESENTATION_STYLE.textShadow,
    backgroundColor: settings?.backgroundColor || DEFAULT_PRESENTATION_STYLE.backgroundColor,
    backgroundImage: toStoredAsset(settings?.backgroundImage),
    backgroundVideo: toStoredAsset(settings?.backgroundVideo),
    backgroundOpacity: settings?.backgroundOpacity ?? DEFAULT_PRESENTATION_STYLE.backgroundOpacity,
    overlayColor: settings?.fullscreenShadeColor || DEFAULT_PRESENTATION_STYLE.overlayColor,
    overlayOpacity: settings?.fullscreenShadeEnabled
      ? (settings?.fullscreenShadeOpacity ?? DEFAULT_PRESENTATION_STYLE.overlayOpacity)
      : 0,
    padding: settings?.padding || DEFAULT_PRESENTATION_STYLE.padding,
    safeArea: settings?.safeArea || DEFAULT_PRESENTATION_STYLE.safeArea,
    themeId: theme?.id,
    themeName: theme?.name,
    ...overrides,
  };
}

export function getMediaViewerUrl(media: MediaItem): string {
  if (media.diskFileName) {
    return `/uploads/${encodeURIComponent(media.diskFileName)}`;
  }
  const stored = toStoredOverlayAssetUrl(media.url);
  return stored || media.url;
}

export function buildBiblePresentationItem(params: {
  verse: BibleVerse;
  translation: string;
  style: PresentationStyleSnapshot;
  sequenceIndex: number;
  sequenceTotal: number;
}): PresentationRemoteItem {
  const { verse, translation, style, sequenceIndex, sequenceTotal } = params;
  return {
    id: `bible-${translation}-${verse.book}-${verse.chapter}-${verse.verse}`,
    source: "bible",
    variant: "text",
    title: verse.text,
    reference: `${verse.book} ${verse.chapter}:${verse.verse} (${translation})`,
    style,
    meta: {
      sequenceIndex,
      sequenceTotal,
      sequenceLabel: `Verse ${verse.verse}`,
    },
  };
}

export function buildWorshipPresentationItem(params: {
  song: Song;
  slide: Slide;
  slideIndex: number;
  slideCount: number;
  style: PresentationStyleSnapshot;
}): PresentationRemoteItem {
  const { song, slide, slideIndex, slideCount, style } = params;
  return {
    id: `worship-${song.id}-${slide.id}`,
    source: "worship",
    variant: "text",
    title: slide.content,
    subtitle: slide.label,
    reference: song.metadata.title,
    style,
    meta: {
      sequenceIndex: slideIndex,
      sequenceTotal: slideCount,
      sequenceLabel: slide.label,
    },
  };
}

export function buildTextPresentationItem(params: {
  slide: PresentationTextSlideRecord;
  style: PresentationStyleSnapshot;
}): PresentationRemoteItem {
  const { slide, style } = params;
  return {
    id: slide.id,
    source: "text",
    variant: "text",
    title: slide.title,
    subtitle: slide.subtitle || undefined,
    body: slide.body,
    style,
  };
}

export function buildMediaPresentationItem(params: {
  media: MediaItem;
  mediaPayload: PresentationMediaPayload;
}): PresentationRemoteItem {
  const { media, mediaPayload } = params;
  return {
    id: `media-${media.id}`,
    source: "media",
    variant: "media",
    title: media.name,
    subtitle: media.type === "video" ? "Video" : "Image",
    media: mediaPayload,
    imageUrl: media.type === "image" ? mediaPayload.url : undefined,
    videoUrl: media.type === "video" ? mediaPayload.url : undefined,
  };
}

export function buildCountdownPresentationItem(params: {
  title: string;
  subtitle?: string;
  countdown: PresentationCountdownPayload;
  style: PresentationStyleSnapshot;
}): PresentationRemoteItem {
  const { title, subtitle, countdown, style } = params;
  return {
    id: `countdown-${countdown.sourceCountdownId || "draft"}`,
    source: "countdown",
    variant: "countdown",
    title,
    subtitle,
    countdown,
    style,
  };
}

export function buildTickerPresentationItem(params: {
  ticker: PresentationTickerPayload;
  style: PresentationStyleSnapshot;
}): PresentationRemoteItem {
  const { ticker, style } = params;
  return {
    id: `ticker-${ticker.sourceTickerId || "draft"}`,
    source: "ticker",
    variant: "ticker",
    title: "Ticker",
    ticker,
    style,
  };
}

export function createVideoPlaybackState(
  patch: Partial<PresentationMediaPlaybackState> = {},
): PresentationMediaPlaybackState {
  return {
    playing: true,
    muted: true,
    volume: 1,
    loop: true,
    positionSeconds: 0,
    version: Date.now(),
    ...patch,
  };
}

export function describePresentationItem(item: PresentationRemoteItem | null): string {
  if (!item) return "Nothing selected";
  switch (item.source) {
    case "bible":
      return item.reference || "Bible";
    case "worship":
      return item.reference || item.subtitle || "Worship";
    case "media":
      return item.title || "Media";
    case "text":
      return item.title || "Text";
    case "countdown":
      return item.title || "Countdown";
    case "ticker":
      return item.ticker?.text || "Ticker";
    default:
      return item.title || "Presentation item";
  }
}

export function cloneTickerPayload(ticker: PresentationTickerPayload): PresentationTickerPayload {
  return {
    ...ticker,
    version: Date.now(),
  };
}
