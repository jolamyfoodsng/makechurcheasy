/**
 * ministryLayers.ts — the Studio's Ministry tools (ticker, countdown, clock) as Screen Mix layers.
 *
 * Each tool is drawn on the Studio output by the same page the Dock sends to OBS, so it looks
 * the same in both places:
 *   ticker    → the ticker's own HTML page, in a strip along the top or bottom
 *   countdown → countdown-overlay.html#data=… (and countdown-bg-overlay.html for classic designs)
 *   clock     → time-overlay.html#data=…
 * The countdown and clock pages keep time themselves; a new `#data=` only changes what they show.
 * Pure — no React, no storage.
 */

import { attachLayoutMode, isLayoutDesign } from "../countdowns/layoutMode";
import type { CountdownConfig, CountdownOverlayPayload } from "../countdowns/types";
import type { DockClockOverlayState, DockTimeDisplayMode, DockTimeOverlayData, DockTimePlacement } from "../dock/timeOverlay";
import type { StudioMixLayer } from "./studioMix";

export const MINISTRY_LAYER_IDS = {
  ticker: "mix-ministry-ticker",
  countdownBg: "mix-ministry-countdown-bg",
  countdown: "mix-ministry-countdown",
  clock: "mix-ministry-clock",
} as const;

/** Height of the ticker strip on a 1920 × 1080 screen (the Dock's OBS source is the same). */
export const TICKER_STRIP_HEIGHT = 80;

export function tickerLayer(html: string, position: "top" | "bottom", key: string): StudioMixLayer {
  return {
    id: MINISTRY_LAYER_IDS.ticker,
    kind: "page",
    name: "Ticker",
    shown: true,
    pageHtml: html,
    pageBox: position,
    pageHeight: TICKER_STRIP_HEIGHT,
    pageKey: key,
  };
}

// ── Countdown ──

/** A running or paused countdown: `remaining` seconds as read at `at` (epoch ms). */
export interface CountdownLive {
  designId: string;
  remaining: number;
  running: boolean;
  at: number;
}

export function countdownRemaining(live: CountdownLive, now = Date.now()): number {
  if (!live.running) return live.remaining;
  return live.remaining - Math.max(0, now - live.at) / 1000;
}

export function startCountdown(designId: string, seconds: number, now = Date.now()): CountdownLive {
  return { designId, remaining: Math.max(0, Math.round(seconds)), running: true, at: now };
}

export function pauseCountdown(live: CountdownLive, now = Date.now()): CountdownLive {
  return { ...live, remaining: Math.max(0, Math.round(countdownRemaining(live, now))), running: false, at: now };
}

export function resumeCountdown(live: CountdownLive, now = Date.now()): CountdownLive {
  return { ...live, running: true, at: now };
}

export function adjustCountdown(live: CountdownLive, deltaSeconds: number, now = Date.now()): CountdownLive {
  const current = countdownRemaining(live, now);
  return { ...live, remaining: Math.max(0, Math.round(current + deltaSeconds)), at: now };
}

/** The design with the title the operator typed (layer designs read `text.title`). */
export function withTitle(design: CountdownConfig, title: string): CountdownConfig {
  const value = title.trim();
  if (!value) return design;
  return { ...design, text: { ...design.text, title: value } };
}

/**
 * The countdown's layers. `reveal` plays the design's entrance (only when it first goes on);
 * pause, resume and ± time just hand the page the new reading.
 */
export function countdownLayers(
  design: CountdownConfig,
  live: CountdownLive,
  baseUrl: string,
  opts: { reveal: boolean; now?: number },
): StudioMixLayer[] {
  const now = opts.now ?? Date.now();
  const remaining = Math.max(0, Math.round(countdownRemaining(live, now)));
  const payload: CountdownOverlayPayload = attachLayoutMode({
    config: design,
    baseUrl,
    timestamp: now,
    sync: { paused: !live.running, remaining },
    reveal: opts.reveal,
  });
  const layers: StudioMixLayer[] = [];
  if (!isLayoutDesign(design)) {
    // A classic design's picture or video background is its own page underneath.
    layers.push({
      id: MINISTRY_LAYER_IDS.countdownBg,
      kind: "page",
      name: "Countdown background",
      shown: true,
      pageUrl: `/countdown-bg-overlay.html#data=${encodeURIComponent(JSON.stringify({ config: design, baseUrl, timestamp: now }))}`,
      pageBox: "full",
      pageKey: `bg-${design.id}-${design.updatedAt ?? ""}`,
    });
  }
  layers.push({
    id: MINISTRY_LAYER_IDS.countdown,
    kind: "page",
    name: design.title || "Countdown",
    shown: true,
    pageUrl: `/countdown-overlay.html#data=${encodeURIComponent(JSON.stringify(payload))}`,
    pageBox: "full",
    pageKey: `cd-${design.id}`,
  });
  return layers;
}

// ── Clock ──

export interface ClockSettings extends DockClockOverlayState {
  label: string;
  mode: DockTimeDisplayMode;
  placement: DockTimePlacement;
}

export const DEFAULT_CLOCK: ClockSettings = {
  label: "",
  mode: "lower-third",
  placement: "bottom-right",
  theme: "digital-modern",
  color: "#ffffff",
  transparentBg: true,
  hour12: true,
  showSeconds: true,
  showDate: false,
};

const PLACEMENTS: DockTimePlacement[] = ["left", "right", "top-left", "top-right", "bottom-left", "bottom-right", "center"];
const CLOCK_THEMES = ["digital-modern", "analog-wall", "broadcast-pill", "neon", "elegant"] as const;

/** The clock part of the Dock's saved Time settings ("dock-time-tools-v1"), checked. */
export function readClockSettings(raw: unknown): ClockSettings {
  const value = raw && typeof raw === "object" ? (raw as { clock?: unknown }).clock : null;
  if (!value || typeof value !== "object") return { ...DEFAULT_CLOCK };
  const c = value as Partial<ClockSettings>;
  return {
    label: typeof c.label === "string" ? c.label.slice(0, 80) : "",
    mode: c.mode === "fullscreen" ? "fullscreen" : "lower-third",
    placement: PLACEMENTS.includes(c.placement as DockTimePlacement) ? (c.placement as DockTimePlacement) : DEFAULT_CLOCK.placement,
    theme: CLOCK_THEMES.includes(c.theme as (typeof CLOCK_THEMES)[number]) ? c.theme : DEFAULT_CLOCK.theme,
    color: typeof c.color === "string" && /^#[0-9a-f]{3,8}$/i.test(c.color) ? c.color : DEFAULT_CLOCK.color,
    transparentBg: c.transparentBg !== false,
    hour12: c.hour12 !== false,
    showSeconds: c.showSeconds !== false,
    showDate: c.showDate === true,
  };
}

export function clockPacket(clock: ClockSettings, now = Date.now()): DockTimeOverlayData {
  const { label, mode, placement, ...face } = clock;
  return { tool: "clock", mode, placement, label: label.trim(), clock: face, timestamp: now };
}

export function clockLayer(clock: ClockSettings, now = Date.now()): StudioMixLayer {
  return {
    id: MINISTRY_LAYER_IDS.clock,
    kind: "page",
    name: "Clock",
    shown: true,
    pageUrl: `/time-overlay.html#data=${encodeURIComponent(JSON.stringify(clockPacket(clock, now)))}`,
    pageBox: "full",
    pageKey: "clock",
  };
}
