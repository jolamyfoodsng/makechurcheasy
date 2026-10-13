/**
 * rundownEngine.ts — pure timing/state helpers for rundowns (no React, no I/O).
 */

import type {
  Rundown,
  RundownLiveState,
  RundownMessage,
  RundownOverlayExtras,
  RundownTimer,
  RundownTimerKind,
  RundownWarnLevel,
} from "./rundownTypes";

// ── Factories ──────────────────────────────────────────────────────────────

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createTimer(partial: Partial<RundownTimer> = {}): RundownTimer {
  return {
    id: newId("tm"),
    name: "Timer",
    speaker: "",
    kind: "countdown",
    durationSeconds: 300,
    designId: null,
    warnYellowSeconds: 60,
    warnRedSeconds: 15,
    autoNext: false,
    ...partial,
  };
}

export function createMessage(partial: Partial<RundownMessage> = {}): RundownMessage {
  return {
    id: newId("msg"),
    text: "Message",
    color: "white",
    bold: false,
    flash: false,
    ...partial,
  };
}

export function createRundown(name = "Sunday Service"): Rundown {
  const now = new Date().toISOString();
  return {
    id: newId("rd"),
    name,
    timers: [
      createTimer({ name: "Welcome", durationSeconds: 120, warnYellowSeconds: 30, warnRedSeconds: 10 }),
      createTimer({ name: "Worship", durationSeconds: 1200 }),
      createTimer({ name: "Sermon", durationSeconds: 2400, warnYellowSeconds: 300, warnRedSeconds: 60 }),
    ],
    messages: [
      createMessage({ text: "Wrap up", color: "yellow", bold: true }),
      createMessage({ text: "TIME IS UP!", color: "red", bold: true, flash: true }),
      createMessage({ text: "Slow down", color: "white" }),
    ],
    showProgressBar: true,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Duration parsing / formatting ──────────────────────────────────────────

/** "5" → 5 min, "5:30" → 5m30s, "1:05:00" → 1h05m. Returns null if invalid. */
export function parseDuration(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const parts = raw.split(":").map((p) => p.trim());
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.length === 1) return nums[0] * 60;
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

/** 125 → "02:05", 3725 → "1:02:05", -5 → "-00:05". */
export function formatDuration(totalSeconds: number, opts: { forceHours?: boolean } = {}): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(totalSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0 || opts.forceHours) return `${sign}${h}:${mm}:${ss}`;
  return `${sign}${mm}:${ss}`;
}

export function formatTimeOfDay(date: Date, hour12 = true): string {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  if (!hour12) return `${String(h).padStart(2, "0")}:${m}:${s}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}:${s} ${h < 12 ? "AM" : "PM"}`;
}

// ── Live state ─────────────────────────────────────────────────────────────

export function initialValue(timer: RundownTimer | null): number {
  if (!timer) return 0;
  return timer.kind === "countdown" ? timer.durationSeconds : 0;
}

function nextSummary(rundown: Rundown, index: number): RundownLiveState["next"] {
  const n = rundown.timers[index + 1];
  return n ? { name: n.name, speaker: n.speaker, kind: n.kind, durationSeconds: n.durationSeconds } : null;
}

export function makeLive(
  rundown: Rundown,
  index: number,
  now: number,
  prev?: Pick<RundownLiveState, "message"> | null,
): RundownLiveState {
  const i = Math.min(Math.max(0, index), Math.max(0, rundown.timers.length - 1));
  const timer = rundown.timers[i] ?? null;
  return {
    v: 1,
    rundownId: rundown.id,
    rundownName: rundown.name,
    index: i,
    total: rundown.timers.length,
    status: "idle",
    value: initialValue(timer),
    at: now,
    timer,
    next: nextSummary(rundown, i),
    message: prev?.message ?? null,
    showProgressBar: rundown.showProgressBar,
  };
}

/** Current value (remaining for countdown, elapsed for countup) at `now`. */
export function currentValue(state: RundownLiveState, now: number): number {
  if (state.status !== "running" || !state.timer) return state.value;
  const dt = Math.max(0, (now - state.at) / 1000);
  if (state.timer.kind === "countdown") return state.value - dt;
  if (state.timer.kind === "countup") return state.value + dt;
  return state.value;
}

function snap(state: RundownLiveState, now: number): RundownLiveState {
  return { ...state, value: currentValue(state, now), at: now };
}

export function startLive(state: RundownLiveState, now: number): RundownLiveState {
  return { ...snap(state, now), status: "running" };
}

export function pauseLive(state: RundownLiveState, now: number): RundownLiveState {
  return { ...snap(state, now), status: "paused" };
}

export function resetLive(state: RundownLiveState, now: number): RundownLiveState {
  return { ...state, status: "idle", value: initialValue(state.timer), at: now };
}

export function adjustLive(state: RundownLiveState, deltaSeconds: number, now: number): RundownLiveState {
  const s = snap(state, now);
  return { ...s, value: s.value + deltaSeconds };
}

export function setMessage(state: RundownLiveState, message: RundownMessage | null): RundownLiveState {
  return { ...state, message };
}

/** Jump to timer `index`; keeps the visible message. Optionally start immediately. */
export function goToTimer(
  rundown: Rundown,
  state: RundownLiveState | null,
  index: number,
  now: number,
  autoStart: boolean,
): RundownLiveState {
  const next = makeLive(rundown, index, now, state);
  return autoStart ? startLive(next, now) : next;
}

/** True when a running countdown hit zero and its timer asks to roll on. */
export function shouldAutoAdvance(state: RundownLiveState, now: number): boolean {
  if (state.status !== "running" || !state.timer) return false;
  if (state.timer.kind !== "countdown" || !state.timer.autoNext) return false;
  if (state.index >= state.total - 1) return false;
  return currentValue(state, now) <= 0;
}

// ── Warning colours / progress ─────────────────────────────────────────────

/** Seconds left for warning purposes (countdown value, or cap − elapsed for count-up with a cap). */
export function remainingForWarning(kind: RundownTimerKind, value: number, durationSeconds: number): number | null {
  if (kind === "countdown") return value;
  if (kind === "countup" && durationSeconds > 0) return durationSeconds - value;
  return null;
}

export function warnLevel(
  kind: RundownTimerKind,
  value: number,
  durationSeconds: number,
  yellow: number,
  red: number,
): RundownWarnLevel {
  const left = remainingForWarning(kind, value, durationSeconds);
  if (left === null) return "green";
  if (red > 0 && left <= red) return "red";
  if (yellow > 0 && left <= yellow) return "yellow";
  if (left <= 0) return "red";
  return "green";
}

/** 0..1 progress for the bar (0 = just started). */
export function progressFraction(kind: RundownTimerKind, value: number, durationSeconds: number): number {
  if (durationSeconds <= 0 || kind === "timeofday") return 0;
  const elapsed = kind === "countdown" ? durationSeconds - value : value;
  return Math.min(1, Math.max(0, elapsed / durationSeconds));
}

export const WARN_COLORS: Record<RundownWarnLevel, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
};

export const MESSAGE_COLORS: Record<RundownMessage["color"], string> = {
  white: "#ffffff",
  green: "#4ade80",
  yellow: "#facc15",
  red: "#f87171",
};

// ── Display helpers (shared by Dock + presenter logic) ─────────────────────

export function displayText(state: RundownLiveState, now: number): string {
  const t = state.timer;
  if (!t) return "--:--";
  if (t.kind === "timeofday") return formatTimeOfDay(new Date(now));
  const v = currentValue(state, now);
  const rounded = t.kind === "countdown" ? Math.ceil(v) : Math.floor(v);
  return formatDuration(rounded, { forceHours: Math.abs(rounded) >= 3600 });
}

export function overlayExtras(state: RundownLiveState): RundownOverlayExtras | null {
  const t = state.timer;
  if (!t) return null;
  return {
    kind: t.kind,
    durationSeconds: t.durationSeconds,
    warnYellowSeconds: t.warnYellowSeconds,
    warnRedSeconds: t.warnRedSeconds,
    showProgressBar: state.showProgressBar,
    name: t.name,
    speaker: t.speaker,
    message: state.message
      ? { text: state.message.text, color: state.message.color, bold: state.message.bold, flash: state.message.flash }
      : null,
  };
}
