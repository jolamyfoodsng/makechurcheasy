/**
 * countdownTime.ts — turns a timer reading into the `ThemeContent` a countdown design draws.
 *
 * One design works for countdowns, count-ups, time-of-day clocks and rundown timers: every
 * source reduces to (kind, value, duration) and this file produces the tokens
 * ({time} {mm} {ss} {title}…) and the live warning state (level, progress fraction).
 * Pure — no React, no I/O.
 */

import type { ThemeContent, ThemeLive, WarnLevel } from "../themes/layout/types";
import { progressFraction, warnLevel } from "./rundownEngine";
import type { RundownTimerKind } from "./rundownTypes";

export interface CountdownContentInput {
  kind: RundownTimerKind;
  /** countdown: seconds left (may go negative); countup: seconds elapsed; timeofday: ignored. */
  value: number;
  /** Total length in seconds (countdown start / count-up cap). 0 = none. */
  durationSeconds?: number;
  /** Turn yellow at this many seconds left. 0 = off. */
  warnYellowSeconds?: number;
  /** Turn red at this many seconds left. 0 = off. */
  warnRedSeconds?: number;
  title?: string;
  subtitle?: string;
  message?: string;
  name?: string;
  speaker?: string;
  /** Used by timeofday. */
  now?: Date;
  hour12?: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export interface TimeParts {
  sign: string;
  d: number;
  h: number;
  m: number;
  s: number;
  totalHours: number;
  totalMinutes: number;
}

export function splitSeconds(value: number): TimeParts {
  const abs = Math.abs(Math.trunc(value));
  return {
    sign: value < 0 ? "-" : "",
    d: Math.floor(abs / 86400),
    h: Math.floor((abs % 86400) / 3600),
    m: Math.floor((abs % 3600) / 60),
    s: abs % 60,
    totalHours: Math.floor(abs / 3600),
    totalMinutes: Math.floor(abs / 60),
  };
}

/** Token values for a countdown / count-up reading. */
export function durationTokens(value: number): Record<string, string> {
  const p = splitSeconds(value);
  const hasHours = p.totalHours > 0;
  // Hours are the running total (so a 30-hour timer reads 30:00:00) unless days are in play.
  const hours = p.d > 0 ? p.h : p.totalHours;
  const mins = p.m;
  return {
    sign: p.sign,
    // {time}: "4:58" or "1:04:58" — leading unit not padded.
    time: hasHours ? `${hours}:${pad2(mins)}:${pad2(p.s)}` : `${p.m}:${pad2(p.s)}`,
    // {tm}: "04:58" or "1:04:58" — minutes padded.
    tm: hasHours ? `${hours}:${pad2(mins)}:${pad2(p.s)}` : `${pad2(p.m)}:${pad2(p.s)}`,
    // {tmm}: always hours:minutes:seconds, "00:04:58".
    tmm: `${pad2(hours)}:${pad2(mins)}:${pad2(p.s)}`,
    d: String(p.d),
    dd: pad2(p.d),
    h: String(hours),
    hh: pad2(hours),
    m: String(mins),
    mm: pad2(mins),
    s: String(p.s),
    ss: pad2(p.s),
    ampm: "",
  };
}

/** Token values for a time-of-day clock. */
export function clockTokens(now: Date, hour12 = true): Record<string, string> {
  const h24 = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const h = hour12 ? (h24 % 12 === 0 ? 12 : h24 % 12) : h24;
  const ampm = hour12 ? (h24 < 12 ? "AM" : "PM") : "";
  return {
    sign: "",
    time: `${h}:${pad2(m)}:${pad2(s)}`,
    tm: `${pad2(h)}:${pad2(m)}`,
    tmm: `${pad2(h)}:${pad2(m)}:${pad2(s)}`,
    d: "0",
    dd: "00",
    h: String(h),
    hh: pad2(h),
    m: String(m),
    mm: pad2(m),
    s: String(s),
    ss: pad2(s),
    ampm,
  };
}

/** The warn level + progress for the layer engine. `level` is undefined when no warnings are set. */
export function buildLive(input: CountdownContentInput): ThemeLive {
  const kind = input.kind;
  const duration = Math.max(0, input.durationSeconds || 0);
  const yellow = Math.max(0, input.warnYellowSeconds || 0);
  const red = Math.max(0, input.warnRedSeconds || 0);
  const hasWarn = kind !== "timeofday" && (yellow > 0 || red > 0);
  const live: ThemeLive = {
    fraction: kind === "timeofday" ? 0 : progressFraction(kind, input.value, duration),
  };
  if (hasWarn) {
    live.level = warnLevel(kind, input.value, duration, yellow, red) as WarnLevel;
  }
  if (duration > 0 && kind !== "timeofday") {
    if (yellow > 0) live.yellowFrom = Math.min(1, Math.max(0, 1 - yellow / duration));
    if (red > 0) live.redFrom = Math.min(1, Math.max(0, 1 - red / duration));
  }
  return live;
}

export function buildCountdownContent(input: CountdownContentInput): ThemeContent {
  const timeTokens =
    input.kind === "timeofday" ? clockTokens(input.now || new Date(), input.hour12 !== false) : durationTokens(input.value);
  const extra: Record<string, string> = {
    ...timeTokens,
    title: input.title ?? "",
    subtitle: input.subtitle ?? "",
    message: input.message ?? "",
    name: input.name ?? input.title ?? "",
    speaker: input.speaker ?? "",
  };
  return { text: "", reference: "", extra, live: buildLive(input) };
}
