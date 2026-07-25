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

export function loadPresentationTextSlides(): PresentationTextSlideRecord[] {
  return safeParse<PresentationTextSlideRecord[]>(
    typeof window === "undefined" ? null : localStorage.getItem(getTextSlidesKey()),
    [],
  );
}

export function savePresentationTextSlides(slides: PresentationTextSlideRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getTextSlidesKey(), JSON.stringify(slides));
}

export const TICKER_PRESETS: Array<Pick<PresentationTickerRecord, "name" | "text" | "position" | "direction" | "speed" | "textColor" | "backgroundColor" | "fontSize">> = [
  {
    name: "Welcome Message",
    text: "Welcome to our service! Glad to have you with us today.",
    position: "bottom",
    direction: "ltr",
    speed: 1,
    textColor: "#FFFFFF",
    backgroundColor: "#0F172A",
    fontSize: 32,
  },
  {
    name: "Announcements",
    text: "Check the bulletin for upcoming events and announcements.",
    position: "bottom",
    direction: "ltr",
    speed: 1,
    textColor: "#FFFFFF",
    backgroundColor: "#1E3A5F",
    fontSize: 32,
  },
  {
    name: "Social Media",
    text: "Follow us on social media for updates and encouragement throughout the week.",
    position: "bottom",
    direction: "ltr",
    speed: 1,
    textColor: "#FFFFFF",
    backgroundColor: "#162040",
    fontSize: 32,
  },
  {
    name: "Prayer Request",
    text: "If you have a prayer request, please fill out a connection card.",
    position: "bottom",
    direction: "ltr",
    speed: 1,
    textColor: "#FFFFFF",
    backgroundColor: "#2D1B4E",
    fontSize: 32,
  },
  {
    name: "Giving Reminder",
    text: "You can give online or text GIVE to (555) 000-0000.",
    position: "bottom",
    direction: "ltr",
    speed: 1,
    textColor: "#FFFFFF",
    backgroundColor: "#1B3A2D",
    fontSize: 32,
  },
];

function createDefaultTickers(): PresentationTickerRecord[] {
  return TICKER_PRESETS.map((preset, index) => {
    const stamp = nowIso();
    return {
      id: `ticker-preset-${index + 1}`,
      ...preset,
      createdAt: stamp,
      updatedAt: stamp,
    };
  });
}

export function loadPresentationTickers(): PresentationTickerRecord[] {
  const tickers = safeParse<PresentationTickerRecord[]>(
    typeof window === "undefined" ? null : localStorage.getItem(getTickersKey()),
    [],
  );
  if (tickers.length > 0) {
    return tickers;
  }

  const defaults = createDefaultTickers();
  savePresentationTickers(defaults);
  return defaults;
}

export function savePresentationTickers(tickers: PresentationTickerRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getTickersKey(), JSON.stringify(tickers));
}
