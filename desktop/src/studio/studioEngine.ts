/**
 * studioEngine.ts — Presentation Studio: drives the projector without OBS.
 *
 * Program (what the audience sees) is `public/studio-output.html`: the three MCE
 * overlay pages (Bible, Worship, Notes) stacked full size plus a media layer, so
 * every theme renders exactly as in OBS.
 *
 * Transport: the app keeps ONE program state ({revision, active, screen, packets,
 * media}) and POSTs it to the app's local server (`/api/studio-state`). The output
 * page reads it (instantly on a relay ping, and by polling as a fallback) and hands
 * each overlay page its packet through the URL hash, the same way Preview works.
 * Nothing depends on OBS or on a WebSocket staying healthy.
 *
 * Preview (what's next) is the same overlay page in an iframe that ignores the relay
 * (`mceRelay=0`, its own `mceSource`) and gets its packet through the URL hash.
 */
import type { BibleTheme, BibleThemeSettings } from "../bible/types";
import { buildDockProductionSettingsPayload } from "../services/productionSettings";
import { dockObsClient } from "../dock/dockObsClient";
import { overlayBridge } from "../dock/dockOverlayBridge";
import { getOverlayBaseUrl } from "../services/overlayUrl";

export type StudioTextModule = "bible" | "worship" | "notes";
export type StudioModule = StudioTextModule | "media";
export type StudioMode = "fullscreen" | "lower-third";
export type StudioTransition = "fade" | "cut";
export type StudioScreen = "live" | "black" | "logo";

export const STUDIO_MODULES: StudioTextModule[] = ["bible", "worship", "notes"];

export interface StudioMedia {
  kind: "image" | "video";
  /** Path on the overlay server, e.g. /uploads/Welcome.mp4 */
  url: string;
  fit: "contain" | "cover";
  loop: boolean;
  muted: boolean;
}

/** One slide the operator can preview or send live. */
export interface StudioSlide {
  /** Stable key, e.g. "bible:John:3:16:KJV" or "song:<id>:2". */
  key: string;
  module: StudioModule;
  /** Short tile label: "16", "Chorus", "Slide 2". */
  label: string;
  text: string;
  /** Reference / label line for the theme heading ("John 3:16 (KJV)", "" for songs). */
  reference: string;
  /** Title of the item it belongs to (chapter, song, note, media name). */
  itemTitle: string;
  /** Bible verse number, shown big on the tile. */
  verse?: number;
  media?: StudioMedia;
}

export interface StudioThemeSet {
  fullscreen: BibleTheme | null;
  lowerThird: BibleTheme | null;
}

export type StudioThemes = Record<StudioTextModule, StudioThemeSet> & { defaultMode: StudioMode };

const OVERLAY_PAGE: Record<StudioTextModule, string> = {
  bible: "mce-bible-overlay.html?tab=bible",
  worship: "mce-worship-overlay.html?x=1",
  notes: "mce-note.html?x=1",
};

/** The themes picked on the Themes page / in the Dock for Bible, Worship and Notes. */
export async function loadStudioThemes(): Promise<StudioThemes> {
  const payload = await buildDockProductionSettingsPayload();
  const set = (m?: { fullscreenTheme?: BibleTheme; lowerThirdTheme?: BibleTheme }): StudioThemeSet => ({
    fullscreen: m?.fullscreenTheme ?? null,
    lowerThird: m?.lowerThirdTheme ?? null,
  });
  return {
    bible: set(payload.bible),
    worship: set(payload.worship),
    notes: set(payload.notes ?? payload.worship),
    defaultMode: payload.bible?.defaultMode === "lower-third" ? "lower-third" : "fullscreen",
  };
}

/** A theme's settings for one mode (both-looks themes keep each look in `variants`). */
export function themeSettingsForMode(theme: BibleTheme | null, mode: StudioMode): BibleThemeSettings | null {
  if (!theme) return null;
  const variant = mode === "lower-third" ? theme.variants?.lowerThird : theme.variants?.fullscreen;
  return (variant?.settings ?? theme.settings ?? null) as BibleThemeSettings | null;
}

/** Cut = no animation: classic themes get animation "none", layer themes get no in/out per layer. */
export function withoutAnimation(settings: BibleThemeSettings): BibleThemeSettings {
  const next: BibleThemeSettings = { ...settings, animation: "none", animationDuration: 0 };
  const layout = settings.layout;
  if (layout && Array.isArray(layout.layers)) {
    const none = { preset: "none" as const, duration: 0, delay: 0, easing: "linear" as const };
    next.layout = { ...layout, layers: layout.layers.map((layer) => ({ ...layer, in: none, out: none })) };
  }
  return next;
}

function resolveSettings(
  themes: StudioThemes | null,
  module: StudioTextModule,
  mode: StudioMode,
  transition: StudioTransition,
): Record<string, unknown> | null {
  if (!themes) return null;
  const set = themes[module];
  const theme = mode === "lower-third" ? set.lowerThird ?? set.fullscreen : set.fullscreen ?? set.lowerThird;
  const settings = themeSettingsForMode(theme, mode);
  if (!settings) return null;
  return (transition === "cut" ? withoutAnimation(settings) : settings) as unknown as Record<string, unknown>;
}

export interface StudioPacket {
  module: StudioTextModule;
  data: Record<string, unknown>;
  css: string;
}

/** The overlay packet for a text slide (null slide = clear that module). */
export function buildStudioPacket(
  module: StudioTextModule,
  slide: StudioSlide | null,
  themes: StudioThemes | null,
  mode: StudioMode,
  transition: StudioTransition,
): StudioPacket {
  const { data, css } = dockObsClient.buildStudioOverlayPacket({
    text: slide?.text ?? "",
    reference: slide?.reference ?? "",
    mode,
    themeSettings: resolveSettings(themes, module, mode, transition),
  });
  return { module, data, css };
}

/** The packet the Dock uses to blank a source: plays the exit animation, then nothing. */
function blankPacket(mode: StudioMode): Record<string, unknown> {
  const timestamp = Date.now();
  return { slide: null, theme: null, live: false, blanked: true, timestamp, mode, revision: timestamp };
}

// ── Program state ──────────────────────────────────────────────────────────

export interface StudioProgramState {
  revision: number;
  /** Which layer is on screen (the others are hidden after their exit animation). */
  active: StudioModule | null;
  screen: StudioScreen;
  logoUrl?: string;
  churchName?: string;
  packets: Partial<Record<StudioTextModule, Record<string, unknown>>>;
  media: StudioMedia | null;
  /** What Preview shows, for Preview projectors (always rendered as Cut, no curtain). */
  preview?: StudioPreviewState;
}

export interface StudioPreviewState {
  active: StudioModule | null;
  packets: Partial<Record<StudioTextModule, Record<string, unknown>>>;
  media: StudioMedia | null;
}

let lastRevision = 0;
function nextRevision(): number {
  lastRevision = Math.max(Date.now(), lastRevision + 1);
  return lastRevision;
}

let program: StudioProgramState = { revision: 0, active: null, screen: "live", packets: {}, media: null };
let postChain: Promise<void> = Promise.resolve();

export function getProgramState(): StudioProgramState {
  return program;
}

/** Write the new state to the local server and ping the output page over the relay. */
function commit(next: Omit<StudioProgramState, "revision">): void {
  program = { ...next, revision: nextRevision() };
  const body = JSON.stringify(program);
  const revision = program.revision;
  postChain = postChain
    .then(async () => {
      const base = await getOverlayBaseUrl();
      // text/plain keeps it a "simple" request (no CORS preflight).
      await fetch(`${base}/api/studio-state`, { method: "POST", headers: { "Content-Type": "text/plain" }, body });
      overlayBridge.publish({ channel: "studio", type: "studio-ping", revision });
    })
    .catch((error) => {
      console.warn("[Studio] Could not update the output:", error);
    });
}

/** Screen state on top of the content: live, black, or the church logo. */
export function setProgramScreen(screen: StudioScreen, extra: { logoUrl?: string; churchName?: string } = {}): void {
  commit({
    ...program,
    screen,
    logoUrl: screen === "logo" ? extra.logoUrl : undefined,
    churchName: screen === "logo" ? extra.churchName : undefined,
  });
}

/**
 * Send a slide to Program. The module that was live is blanked first (it plays
 * its exit animation), and the screen goes back to live (lifts Black / Logo).
 */
export function goLive(
  slide: StudioSlide,
  themes: StudioThemes | null,
  mode: StudioMode,
  transition: StudioTransition,
): void {
  const packets = { ...program.packets };
  const previous = program.active;
  if (previous && previous !== slide.module && previous !== "media") {
    packets[previous] = blankPacket(mode);
  }
  let media = program.media;
  if (slide.module === "media") {
    media = slide.media ?? null;
  } else {
    packets[slide.module] = buildStudioPacket(slide.module, slide, themes, mode, transition).data;
    if (previous === "media") media = null;
  }
  commit({ ...program, active: slide.module, screen: "live", logoUrl: undefined, churchName: undefined, packets, media });
}

/** Something ready to show: an overlay packet for a text module, or a picture / video. */
export type StudioItem =
  | { module: StudioTextModule; data: Record<string, unknown>; label: string }
  | { module: "media"; media: StudioMedia; label: string };

/** Send a ready item (e.g. from the Dock) to Program; the previous module animates out. */
export function goLiveItem(item: StudioItem, mode: StudioMode): void {
  const packets = { ...program.packets };
  const previous = program.active;
  if (previous && previous !== item.module && previous !== "media") {
    packets[previous] = blankPacket(mode);
  }
  let media = program.media;
  if (item.module === "media") {
    media = item.media;
  } else {
    packets[item.module] = item.data;
    if (previous === "media") media = null;
  }
  commit({ ...program, active: item.module, screen: "live", logoUrl: undefined, churchName: undefined, packets, media });
}

/** Show an item on Preview projectors (null = empty Preview). */
export function setPreviewItem(item: StudioItem | null): void {
  const packets = { ...(program.preview?.packets ?? {}) };
  let media: StudioMedia | null = null;
  if (item?.module === "media") media = item.media;
  else if (item) packets[item.module] = item.data;
  commit({ ...program, preview: { active: item?.module ?? null, packets, media } });
}

/** Clear everything on Program (each module animates out). */
export function clearProgram(mode: StudioMode): void {
  const packets: StudioProgramState["packets"] = {};
  for (const module of STUDIO_MODULES) packets[module] = blankPacket(mode);
  commit({ ...program, active: null, screen: "live", logoUrl: undefined, churchName: undefined, packets, media: null });
}

/** Show a slide on Preview projectors (null = empty Preview). */
export function setPreviewState(slide: StudioSlide | null, themes: StudioThemes | null, mode: StudioMode): void {
  const packets = { ...(program.preview?.packets ?? {}) };
  let media: StudioMedia | null = null;
  if (slide?.module === "media") {
    media = slide.media ?? null;
  } else if (slide) {
    packets[slide.module] = buildStudioPacket(slide.module, slide, themes, mode, "cut").data;
  }
  commit({ ...program, preview: { active: slide?.module ?? null, packets, media } });
}

// ── Frames ─────────────────────────────────────────────────────────────────

/** URL of a Preview iframe for a module, with its packet in the hash. */
export function previewFrameUrl(base: string, packet: StudioPacket | null, module: StudioTextModule): string {
  const page = OVERLAY_PAGE[module];
  const hash = packet ? `#data=${encodeURIComponent(JSON.stringify(packet.data))}` : "";
  return `${base}/${page}&mceRelay=0&mceSource=studio-preview-${module}${hash}`;
}

export function programFrameUrl(base: string): string {
  return `${base}/studio-output.html?monitor=1`;
}

/** The in-app Preview monitor: the output page showing the Preview feed. */
export function previewMonitorUrl(base: string): string {
  return `${base}/studio-output.html?monitor=1&feed=preview`;
}

export async function studioBaseUrl(): Promise<string> {
  return getOverlayBaseUrl();
}

// ── Slides ─────────────────────────────────────────────────────────────────

/** Bible verses as slides. */
export function bibleSlides(
  book: string,
  chapter: number,
  translation: string,
  verses: Array<{ verse: number; text: string }>,
): StudioSlide[] {
  return verses.map((v) => ({
    key: `bible:${book}:${chapter}:${v.verse}:${translation}`,
    module: "bible",
    label: String(v.verse),
    verse: v.verse,
    text: v.text,
    reference: `${book} ${chapter}:${v.verse} (${translation})`,
    itemTitle: `${book} ${chapter}`,
  }));
}

/** Split note text into slides on blank lines. */
export function noteSlides(noteId: string, title: string, content: string): StudioSlide[] {
  return content
    .split(/\n[ \t]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, i) => ({
      key: `note:${noteId}:${i}`,
      module: "notes" as const,
      label: `Slide ${i + 1}`,
      text: block,
      reference: "",
      itemTitle: title,
    }));
}
