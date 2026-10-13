/**
 * layoutMode.ts — adds the layer-design info to an overlay payload.
 * Every place that builds a countdown overlay payload (app preview, OBS service, Dock, rundowns)
 * calls attachLayoutMode(), so one design works for countdowns, count-ups, clocks and rundown timers.
 */
import type { ThemeLayout } from "../themes/layout/types";
import type { CountdownConfig, CountdownLayoutMode, CountdownOverlayPayload } from "./types";

export function isLayoutDesign(config: CountdownConfig | null | undefined): config is CountdownConfig & { layout: ThemeLayout } {
  return !!config && !!config.layout && Array.isArray(config.layout.layers) && config.layout.layers.length > 0;
}

/** Seconds until `endAt` (an ISO date-time, or "HH:MM" meaning the next time that clock reads so). */
export function secondsUntil(endAt: string, now: number): number | null {
  const iso = new Date(endAt).getTime();
  if (Number.isFinite(iso)) return Math.max(0, Math.floor((iso - now) / 1000));
  const m = /^(\d{1,2}):(\d{2})$/.exec(endAt.trim());
  if (!m) return null;
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (target.getTime() <= now) target.setDate(target.getDate() + 1);
  return Math.max(0, Math.floor((target.getTime() - now) / 1000));
}

export function buildLayoutMode(payload: CountdownOverlayPayload, now = Date.now()): CountdownLayoutMode | undefined {
  const cfg = payload.config;
  if (!isLayoutDesign(cfg)) return undefined;
  const rd = payload.rundown;
  const timer = cfg.timer;
  let duration = timer.durationSeconds || 0;
  if (!rd && timer.mode === "end-at-time" && timer.endAt) {
    const left = secondsUntil(timer.endAt, now);
    if (left !== null) duration = left;
  }
  const title = (rd?.name || cfg.text?.title || cfg.title || "").trim();
  return {
    layout: cfg.layout,
    kind: rd?.kind ?? "countdown",
    durationSeconds: rd ? rd.durationSeconds : duration,
    warnYellowSeconds: rd ? rd.warnYellowSeconds : cfg.warnYellowSeconds ?? 0,
    warnRedSeconds: rd ? rd.warnRedSeconds : cfg.warnRedSeconds ?? 0,
    title,
    subtitle: (rd?.speaker || cfg.text?.subtitle || "").trim(),
    name: rd?.name || title,
    speaker: rd?.speaker || "",
    message: cfg.message?.text?.trim() || "",
    overtime: !!rd,
    hour12: true,
  };
}

/** Returns the payload with `layoutMode` when the design is a layer design; otherwise unchanged. */
export function attachLayoutMode(payload: CountdownOverlayPayload): CountdownOverlayPayload {
  const layoutMode = buildLayoutMode(payload, payload.timestamp || Date.now());
  return layoutMode ? { ...payload, layoutMode } : payload;
}
