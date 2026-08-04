import type { DockStagedItem } from "../dock/dockTypes";
import type {
  PresentationBackgroundType,
  PresentationStyleSnapshot,
  PresentationTextAlign,
} from "../presentation/types";
import { toStoredOverlayAssetUrl } from "./overlayUrl";
import { withScriptureFontFallback } from "../bible/scriptureFont";
import {
  clearPresentationScreen,
  publishBibleToPresentation,
  publishWorshipToPresentation,
} from "./presentationPublish";
import type {
  PresentationBibleCompareColumn,
  PresentationBibleCompareLayout,
} from "../presentation/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clamp01(value: unknown, fallback: number): number {
  const next = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(1, next));
}

function normalizeTextAlign(value: unknown): PresentationTextAlign {
  return value === "left" || value === "right" || value === "center" ? value : "center";
}

function normalizeCompareLayout(value: unknown): PresentationBibleCompareLayout {
  return value === "side-by-side" ? "side-by-side" : "line-by-line";
}

function normalizeBackgroundType(value: unknown): PresentationBackgroundType | undefined {
  return value === "off" ||
    value === "theme" ||
    value === "color" ||
    value === "image" ||
    value === "pattern" ||
    value === "video"
    ? value
    : undefined;
}

function getPresentationAssetUrl(value: unknown, filePath: unknown): string | undefined {
  const stored = toStoredOverlayAssetUrl(asString(value));
  const path = asString(filePath);
  const fileName = path.split(/[\\/]/).pop()?.trim();

  if (stored.startsWith("blob:") && fileName) {
    return `/uploads/${encodeURIComponent(fileName)}`;
  }

  if (stored.startsWith("/uploads/") || stored.startsWith("http") || stored.startsWith("data:") || stored.startsWith("blob:")) {
    return stored;
  }
  if (stored.startsWith("/") && !/^\/(Users|Volumes|private|tmp|var)\b/.test(stored)) {
    return stored;
  }

  if (fileName) return `/uploads/${encodeURIComponent(fileName)}`;

  return stored || undefined;
}

function getPresentationPatternUrl(value: unknown): string | undefined {
  const raw = asString(value).trim();
  if (!raw || raw === "__FROM_CSS__") return undefined;
  if (
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("/")
  ) {
    return getPresentationAssetUrl(raw, undefined);
  }
  return undefined;
}

function buildPresentationStyle(data: Record<string, unknown>): PresentationStyleSnapshot | undefined {
  const themeSettings = asRecord(data.bibleThemeSettings);
  const liveOverrides = asRecord(data.liveOverrides);
  const merged = { ...themeSettings, ...liveOverrides };
  if (!Object.keys(merged).length) return undefined;

  return {
    themeId: asString(data.theme) || undefined,
    fontFamily: withScriptureFontFallback(asString(merged.fontFamily)),
    fontSize: asNumber(merged.fontSize, 64),
    fontWeight: asString(merged.fontWeight) || 700,
    lineHeight: asNumber(merged.lineHeight, 1.2),
    textColor: asString(merged.fontColor) || asString(merged.textColor) || "#ffffff",
    textAlign: normalizeTextAlign(merged.textAlign),
    textShadow: asString(merged.textShadow) || "0 12px 40px rgba(0,0,0,0.45)",
    backgroundColor: asString(merged.backgroundColor) || "#000000",
    backgroundColorEnd: asString(merged.backgroundColorEnd) || undefined,
    bgGradientAngle: asNumber(merged.bgGradientAngle, 180),
    backgroundType: normalizeBackgroundType(merged.backgroundType),
    backgroundImage: getPresentationAssetUrl(merged.backgroundImage, merged.backgroundImageFilePath),
    backgroundVideo: getPresentationAssetUrl(merged.backgroundVideo, merged.backgroundVideoFilePath),
    backgroundPattern: getPresentationPatternUrl(merged.backgroundPattern),
    backgroundOpacity: clamp01(merged.backgroundOpacity, 1),
    overlayColor: asString(merged.fullscreenShadeColor) || "#000000",
    overlayOpacity: merged.fullscreenShadeEnabled === false
      ? 0
      : clamp01(merged.fullscreenShadeOpacity, 0),
    padding: asNumber(merged.padding, 80),
    safeArea: asNumber(merged.safeArea, 50),
  };
}

export async function publishDockStagedItemToPresentation(item: DockStagedItem | null): Promise<void> {
  if (!item) {
    await clearPresentationScreen();
    return;
  }

  const data = asRecord(item.data);

  if (item.type === "bible") {
    const compare = asRecord(data.compare);
    const compareColumns = Array.isArray(compare.columns) ? compare.columns : [];
    const presentationCompareColumns: PresentationBibleCompareColumn[] = compareColumns
      .map((column) => {
        const record = asRecord(column);
        const reference = asString(record.referenceLabel);
        const translation = asString(record.translation);
        const text = asString(record.verseText);
        if (!text) return null;
        return {
          reference,
          translation,
          text,
        };
      })
      .filter((column): column is PresentationBibleCompareColumn => Boolean(column))
      .slice(0, 2);
    const compareTranslationLabel = presentationCompareColumns
      .map((column) => column.translation)
      .filter(Boolean)
      .join(" vs ");

    await publishBibleToPresentation({
      book: asString(data.book) || item.label,
      chapter: asNumber(data.chapter),
      verse: asNumber(data.verse),
      translation: compareTranslationLabel || asString(data.translation) || asString(data.translationA) || asString(data.translationB),
      text: asString(data.verseText) || item.subtitle || item.label,
      style: buildPresentationStyle(data),
      compare: presentationCompareColumns.length === 2
        ? {
          layout: normalizeCompareLayout(compare.layout || data.compareLayout),
          columns: presentationCompareColumns,
        }
        : undefined,
    });
    return;
  }

  if (item.type === "worship") {
    const song = asRecord(data.song);
    await publishWorshipToPresentation({
      title: asString(song.title) || asString(data.songTitle) || item.subtitle || item.label,
      artist: asString(song.artist) || asString(data.artist),
      label: asString(data.sectionLabel) || item.label,
      content: asString(data.sectionText) || item.subtitle || item.label,
      slideIndex: asNumber(data.sectionIdx),
      slideCount: asNumber(data.slideCount, 1),
      style: buildPresentationStyle(data),
      showMeta: data.presentationShowMeta === true,
    });
  }

  if (item.type === "notes") {
    await publishWorshipToPresentation({
      title: asString(data.songTitle) || item.label,
      artist: "",
      label: asString(data.sectionLabel) || item.label,
      content: asString(data.sectionText) || item.subtitle || item.label,
      slideIndex: asNumber(data.slideIdx),
      slideCount: 1,
      style: buildPresentationStyle(data),
      showMeta: false,
    });
  }
}
