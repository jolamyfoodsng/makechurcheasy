import type { CountdownConfig } from "../countdowns/types";
import type { MediaItem } from "../library/libraryTypes";
import { toStoredOverlayAssetUrl } from "./overlayUrl";
import { getPresentationSettings } from "./presentationSettings";
import {
  clearPresentationState,
  publishPresentationState,
  type PresentationRemoteState,
} from "./presentationState";
import type {
  PresentationBibleComparePayload,
  PresentationRemoteItem,
  PresentationStyleSnapshot,
} from "../presentation/types";
import { SCRIPTURE_FONT_FAMILY } from "../bible/scriptureFont";

const PRESENTATION_SCREEN_ZOOM_KEY = "mce-presentation-screen-zoom";
const MIN_PRESENTATION_SCREEN_ZOOM = 0.8;
const MAX_PRESENTATION_SCREEN_ZOOM = 1.8;

function clampPresentationZoom(value: unknown): number {
  const next = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(next)) return 1;
  return Math.max(MIN_PRESENTATION_SCREEN_ZOOM, Math.min(MAX_PRESENTATION_SCREEN_ZOOM, next));
}

export function readPresentationScreenZoom(): number {
  try {
    return clampPresentationZoom(localStorage.getItem(PRESENTATION_SCREEN_ZOOM_KEY));
  } catch {
    return 1;
  }
}

export function savePresentationScreenZoom(value: number): number {
  const next = clampPresentationZoom(value);
  try {
    localStorage.setItem(PRESENTATION_SCREEN_ZOOM_KEY, String(next));
  } catch {
    // Ignore storage failures; the current publish still carries the value.
  }
  return next;
}

function buildState(item: PresentationRemoteItem | null): PresentationRemoteState {
  const { sessionId } = getPresentationSettings();
  return {
    sessionId,
    fullscreen: item,
    lowerThird: null,
    updatedAt: Date.now(),
  };
}

function withScreenPreferences(item: PresentationRemoteItem): PresentationRemoteItem {
  const zoom = readPresentationScreenZoom();
  return {
    ...item,
    meta: {
      ...item.meta,
      zoom,
    },
  };
}

async function publishItem(item: PresentationRemoteItem): Promise<void> {
  await publishPresentationState(buildState(withScreenPreferences(item)));
}

function getRemoteViewerAssetUrl(media: MediaItem): string | undefined {
  if (media.diskFileName) {
    return `/uploads/${encodeURIComponent(media.diskFileName)}`;
  }

  if (media.filePath) {
    const fileName = media.filePath.split(/[\\/]/).pop()?.trim();
    if (fileName) return `/uploads/${encodeURIComponent(fileName)}`;
  }

  const stored = toStoredOverlayAssetUrl(media.url);
  if (stored.startsWith("/uploads/") || stored.startsWith("http") || stored.startsWith("data:")) {
    return stored;
  }

  if (stored.startsWith("/") && !/^\/(Users|Volumes|private|tmp|var)\b/.test(stored)) {
    return stored;
  }

  return undefined;
}

export async function publishBibleToPresentation(payload: {
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  text: string;
  style?: PresentationStyleSnapshot;
  compare?: PresentationBibleComparePayload;
}): Promise<void> {
  const reference = `${payload.book} ${payload.chapter}:${payload.verse}`;
  await publishItem({
    id: `bible-${payload.book}-${payload.chapter}-${payload.verse}-${payload.translation}`,
    source: "bible",
    title: reference,
    reference: payload.translation,
    body: payload.text,
    style: payload.style,
    bibleCompare: payload.compare,
  });
}

export async function publishWorshipToPresentation(payload: {
  title: string;
  artist?: string;
  label?: string;
  content: string;
  slideIndex: number;
  slideCount: number;
  style?: PresentationStyleSnapshot;
  showMeta?: boolean;
}): Promise<void> {
  const showMeta = payload.showMeta === true;
  await publishItem({
    id: `worship-${payload.title}-${payload.slideIndex}`,
    source: "worship",
    title: payload.title,
    subtitle: payload.label || `Slide ${payload.slideIndex + 1} of ${payload.slideCount}`,
    reference: payload.artist || undefined,
    body: payload.content,
    style: payload.style,
    meta: {
      showReference: showMeta,
      showTitle: showMeta,
      showSubtitle: showMeta,
    },
  });
}

export async function publishMediaToPresentation(media: MediaItem): Promise<void> {
  const url = getRemoteViewerAssetUrl(media);
  await publishItem({
    id: `media-${media.id}`,
    source: "media",
    variant: "media",
    title: media.name,
    subtitle: media.type === "video" ? "Video" : "Image",
    media: url
      ? {
        kind: media.type,
        url,
        fit: "fill",
        backgroundColor: "#000000",
        playback: media.type === "video"
          ? {
            playing: true,
            muted: true,
            volume: 1,
            loop: true,
            positionSeconds: 0,
            version: Date.now(),
          }
          : undefined,
      }
      : undefined,
    imageUrl: media.type === "image" ? url : undefined,
    videoUrl: media.type === "video" ? url : undefined,
  });
}

export async function publishMinistryToPresentation(payload: {
  speakerName: string;
  speakerRole?: string;
  churchName?: string;
}): Promise<void> {
  await publishItem({
    id: `ministry-${payload.speakerName.trim().toLowerCase().replace(/\s+/g, "-")}`,
    source: "text",
    title: payload.speakerName,
    reference: payload.churchName || "Ministry",
    body: payload.speakerRole || "",
  });
}

export async function publishTextOverlayToPresentation(payload: {
  headline?: string;
  subline?: string;
  textColor?: string;
  align?: PresentationStyleSnapshot["textAlign"];
  headlineSize?: number;
  background?: {
    enabled?: boolean;
    bgType?: "color" | "image" | "pattern";
    color?: string;
    opacity?: number;
    imageDataUrl?: string | null;
    patternSvgData?: string | null;
    padding?: number;
  };
}): Promise<void> {
  const headline = payload.headline?.trim() ?? "";
  const subline = payload.subline?.trim() ?? "";
  const background = payload.background;
  const backgroundEnabled = Boolean(background?.enabled);
  const backgroundImage = backgroundEnabled
    ? (background?.bgType === "image" ? background.imageDataUrl || undefined : background?.bgType === "pattern" ? background.patternSvgData || undefined : undefined)
    : undefined;

  await publishItem({
    id: `media-text-${Date.now()}`,
    source: "text",
    title: "Media Text",
    body: [headline, subline].filter(Boolean).join("\n"),
    style: {
      fontFamily: SCRIPTURE_FONT_FAMILY,
      fontSize: Math.max(48, Number(payload.headlineSize || 72)),
      fontWeight: 800,
      lineHeight: 1.12,
      textColor: payload.textColor || "#ffffff",
      textAlign: payload.align || "center",
      textShadow: "0 12px 42px rgba(0,0,0,0.62)",
      backgroundColor: backgroundEnabled && background?.bgType === "color" ? background.color || "#000000" : "#000000",
      backgroundImage,
      backgroundOpacity: backgroundEnabled ? Math.max(0, Math.min(1, Number(background?.opacity ?? 1))) : 1,
      overlayColor: "#000000",
      overlayOpacity: 0,
      padding: Math.max(24, Number(background?.padding || 48)),
      safeArea: 72,
    },
    meta: {
      showReference: false,
      showTitle: false,
      showSubtitle: false,
    },
  });
}

export async function publishCountdownToPresentation(countdown: CountdownConfig): Promise<void> {
  const now = new Date().toISOString();
  const subtitle = countdown.timer.mode === "fixed-duration"
    ? `${Math.floor(countdown.timer.durationSeconds / 60)} min`
    : countdown.timer.endAt || "Countdown";

  await publishItem({
    id: `countdown-${countdown.id}`,
    source: "countdown",
    variant: "countdown",
    title: countdown.title || "Countdown",
    subtitle,
    style: {
      fontFamily: countdown.text.fontFamily || "Inter, system-ui, sans-serif",
      fontSize: Math.max(32, Number(countdown.text.fontSize || 48) * 1.6),
      fontWeight: countdown.text.fontWeight || 700,
      lineHeight: countdown.text.lineHeight || 1.2,
      textColor: countdown.text.color || "#ffffff",
      textAlign: "center",
      textShadow: countdown.text.shadowEnabled
        ? `${countdown.text.shadowOffsetX || 0}px ${countdown.text.shadowOffsetY || 4}px ${countdown.text.shadowBlur || 12}px ${countdown.text.shadowColor || "#000000"}`
        : "none",
      backgroundColor: countdown.background.color || "#050816",
      backgroundImage: countdown.background.type === "image" ? countdown.background.imageUrl : undefined,
      backgroundVideo: countdown.background.type === "video" ? countdown.background.videoUrl : undefined,
      backgroundOpacity: Math.max(0, Math.min(1, Number(countdown.background.overlayOpacity ?? 0.6))),
      overlayColor: "#000000",
      overlayOpacity: Math.max(0, Math.min(1, Number(countdown.background.overlayOpacity ?? 0.6))),
      padding: 80,
      safeArea: 50,
    },
    countdown: {
      title: countdown.title || "Countdown",
      mode: countdown.timer.mode === "end-at-time" ? "time" : "duration",
      status: "running",
      durationSeconds: Math.max(0, Math.floor(countdown.timer.durationSeconds || 0)),
      startedAt: now,
      endsAt: countdown.timer.endAt,
      completionMessage: countdown.message?.text || "",
      soundEnabled: false,
      showTitle: Boolean(countdown.text.title || countdown.title),
      showHours: countdown.timer.showHours,
      showMinutes: countdown.timer.showMinutes,
      showSeconds: countdown.timer.showSeconds,
      updatedAt: now,
      sourceCountdownId: countdown.id,
      sourceConfig: countdown,
    },
  });
}

export async function publishTickerToPresentation(payload: {
  text: string;
  divider?: string;
  messageSpacing?: number;
  position: "top" | "bottom";
  speed: number;
  textColor?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontFamily?: string;
  paused?: boolean;
}): Promise<void> {
  await publishItem({
    id: "ticker-live",
    source: "ticker",
    variant: "ticker",
    title: "Ticker",
    ticker: {
      text: payload.text,
      divider: payload.divider,
      messageSpacing: payload.messageSpacing,
      position: payload.position,
      direction: "rtl",
      speed: payload.speed,
      textColor: payload.textColor || "#ffffff",
      backgroundColor: payload.backgroundColor || "#0f172a",
      fontSize: payload.fontSize || 32,
      fontFamily: payload.fontFamily || SCRIPTURE_FONT_FAMILY,
      paused: Boolean(payload.paused),
      hidden: false,
      version: Date.now(),
    },
  });
}

export async function clearPresentationScreen(): Promise<void> {
  const { sessionId } = getPresentationSettings();
  await clearPresentationState(sessionId);
}
