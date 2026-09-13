/**
 * Shared shape and small helpers for the Dock Time tools.
 *
 * The browser overlay receives this packet unchanged, so the timer keeps
 * advancing and the clock keeps updating inside OBS without repeated Dock
 * requests.
 */

export type DockTimeTool = "timer" | "clock";
export type DockTimeDisplayMode = "fullscreen" | "lower-third";
export type DockTimePlacement = "left" | "right";

export interface DockTimerOverlayState {
  /** Seconds already elapsed before the current running period. */
  elapsedSeconds: number;
  /** Epoch milliseconds marking when the current running period began. */
  startedAt: number | null;
  running: boolean;
}

export interface DockClockOverlayState {
  hour12: boolean;
  showSeconds: boolean;
  showDate: boolean;
}

export interface DockTimeOverlayData {
  tool: DockTimeTool;
  mode: DockTimeDisplayMode;
  placement: DockTimePlacement;
  label: string;
  timer?: DockTimerOverlayState;
  clock?: DockClockOverlayState;
  timestamp: number;
}

/** Full-canvas source used for Time's centred, full-screen output. */
export const DOCK_TIME_SOURCE_NAME = "MCE Time";
/** Dedicated lower-third source so a Time card can sit over live content. */
export const DOCK_TIME_LOWER_THIRD_SOURCE_NAME = "MCE Lower Third - Time";

export function getDockTimeSourceName(mode: DockTimeDisplayMode): string {
  return mode === "lower-third"
    ? DOCK_TIME_LOWER_THIRD_SOURCE_NAME
    : DOCK_TIME_SOURCE_NAME;
}

export function getTimerElapsedSeconds(
  timer: DockTimerOverlayState,
  now = Date.now(),
): number {
  const base = Math.max(0, Math.floor(timer.elapsedSeconds || 0));
  if (!timer.running || !timer.startedAt) return base;
  return base + Math.max(0, Math.floor((now - timer.startedAt) / 1000));
}

export function formatTimeDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
