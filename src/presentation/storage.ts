import { getUserScopedKey } from "../services/userScopedStorage";
import type { PresentationTextSlideRecord, PresentationTickerRecord } from "./types";

function getTextSlidesKey(): string {
  return getUserScopedKey("mce-presentation-text-slides");
}

function getTickersKey(): string {
  return getUserScopedKey("mce-presentation-tickers");
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export const TEXT_SLIDE_PRESETS: Array<Pick<PresentationTextSlideRecord, "title" | "subtitle" | "body">> = [
  {
    title: "Welcome to Church",
    subtitle: "MakeChurchEasy",
    body: "Welcome to our service today.",
  },
  {
    title: "Offering Time",
    subtitle: "",
    body: "You can give as led during this part of the service.",
  },
  {
    title: "Please Silence Your Phones",
    subtitle: "",
    body: "Help us keep the room focused and free from interruptions.",
  },
  {
    title: "Service Will Begin Shortly",
    subtitle: "",
    body: "Please take your seats as we get ready to start.",
  },
  {
    title: "Technical Difficulty",
    subtitle: "",
    body: "We are fixing a technical issue. Please stand by.",
  },
];

function createDefaultTextSlides(): PresentationTextSlideRecord[] {
  return TEXT_SLIDE_PRESETS.map((preset, index) => {
    const stamp = nowIso();
    return {
      id: `text-preset-${index + 1}`,
      title: preset.title,
      subtitle: preset.subtitle,
      body: preset.body,
      createdAt: stamp,
      updatedAt: stamp,
    };
  });
}

export function loadPresentationTextSlides(): PresentationTextSlideRecord[] {
  const slides = safeParse<PresentationTextSlideRecord[]>(
    typeof window === "undefined" ? null : localStorage.getItem(getTextSlidesKey()),
    [],
  );
  if (slides.length > 0) {
    return slides;
  }

  const defaults = createDefaultTextSlides();
  savePresentationTextSlides(defaults);
  return defaults;
}

export function savePresentationTextSlides(slides: PresentationTextSlideRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getTextSlidesKey(), JSON.stringify(slides));
}

export function loadPresentationTickers(): PresentationTickerRecord[] {
  return safeParse<PresentationTickerRecord[]>(
    typeof window === "undefined" ? null : localStorage.getItem(getTickersKey()),
    [],
  );
}

export function savePresentationTickers(tickers: PresentationTickerRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getTickersKey(), JSON.stringify(tickers));
}
