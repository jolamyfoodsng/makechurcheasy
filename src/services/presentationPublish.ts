import type { CountdownConfig } from "../countdowns/types";
import type { MediaItem } from "../library/libraryTypes";
import { toStoredOverlayAssetUrl } from "./overlayUrl";
import { getPresentationSettings } from "./presentationSettings";
import {
  clearPresentationState,
  publishPresentationState,
  type PresentationRemoteState,
} from "./presentationState";
import type { PresentationRemoteItem } from "../presentation/types";

function buildState(item: PresentationRemoteItem | null): PresentationRemoteState {
  const { sessionId } = getPresentationSettings();
  return {
    sessionId,
    fullscreen: item,
    lowerThird: null,
    updatedAt: Date.now(),
  };
}

async function publishItem(item: PresentationRemoteItem): Promise<void> {
  await publishPresentationState(buildState(item));
}

function getRemoteViewerAssetUrl(media: MediaItem): string | undefined {
  if (media.diskFileName) {
    return `/uploads/${encodeURIComponent(media.diskFileName)}`;
  }

  const stored = toStoredOverlayAssetUrl(media.url);
  if (stored.startsWith("/uploads/")) {
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
}): Promise<void> {
  const reference = `${payload.book} ${payload.chapter}:${payload.verse}`;
  await publishItem({
    id: `bible-${payload.book}-${payload.chapter}-${payload.verse}-${payload.translation}`,
    source: "bible",
    title: reference,
    reference: payload.translation,
    body: payload.text,
  });
}

export async function publishWorshipToPresentation(payload: {
  title: string;
  artist?: string;
  label?: string;
  content: string;
  slideIndex: number;
  slideCount: number;
}): Promise<void> {
  await publishItem({
    id: `worship-${payload.title}-${payload.slideIndex}`,
    source: "worship",
    title: payload.title,
    subtitle: payload.label || `Slide ${payload.slideIndex + 1} of ${payload.slideCount}`,
    reference: payload.artist || undefined,
    body: payload.content,
  });
}

export async function publishMediaToPresentation(media: MediaItem): Promise<void> {
  await publishItem({
    id: `media-${media.id}`,
    source: "media",
    title: media.name,
    subtitle: media.type === "video" ? "Video" : "Image",
    imageUrl: media.type === "image" ? getRemoteViewerAssetUrl(media) : undefined,
    videoUrl: media.type === "video" ? getRemoteViewerAssetUrl(media) : undefined,
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

export async function publishCountdownToPresentation(countdown: CountdownConfig): Promise<void> {
  const subtitle = countdown.timer.mode === "fixed-duration"
    ? `${Math.floor(countdown.timer.durationSeconds / 60)} min`
    : countdown.timer.endAt || "Countdown";

  await publishItem({
    id: `countdown-${countdown.id}`,
    source: "countdown",
    title: countdown.title || "Countdown",
    subtitle,
    countdown: {
      config: countdown,
      startedAt: Date.now(),
    },
  });
}

export async function clearPresentationScreen(): Promise<void> {
  const { sessionId } = getPresentationSettings();
  await clearPresentationState(sessionId);
}
