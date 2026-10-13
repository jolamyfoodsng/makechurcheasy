/**
 * rundownTypes.ts — StageTimer-style rundown model.
 *
 * A Rundown is an ordered list of timers (+ a pool of quick messages) that the
 * operator runs from the OBS Dock. Each timer can point at one of the saved
 * countdown designs made in the Countdowns page.
 */

export type RundownTimerKind = "countdown" | "countup" | "timeofday";

export type RundownMessageColor = "white" | "green" | "yellow" | "red";

export interface RundownTimer {
  id: string;
  name: string;
  speaker: string;
  kind: RundownTimerKind;
  /** countdown: length. countup: optional cap used for warnings (0 = none). timeofday: ignored. */
  durationSeconds: number;
  /** Saved countdown design (CountdownConfig.id). null = built-in default look. */
  designId: string | null;
  /** Turn yellow when this many seconds (or fewer) remain. 0 = never. */
  warnYellowSeconds: number;
  /** Turn red when this many seconds (or fewer) remain. 0 = never. */
  warnRedSeconds: number;
  /** Start the next timer automatically when this one reaches zero. */
  autoNext: boolean;
}

export interface RundownMessage {
  id: string;
  text: string;
  color: RundownMessageColor;
  bold: boolean;
  flash: boolean;
}

export interface Rundown {
  id: string;
  name: string;
  timers: RundownTimer[];
  messages: RundownMessage[];
  /** Show the green/yellow/red progress bar under the timer. */
  showProgressBar: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RundownSnapshot {
  rundowns: Rundown[];
  updatedAt: string;
}

export type RundownStatus = "idle" | "running" | "paused";

/**
 * Live (running) state. Time is stored as a snapshot (`value` captured at `at`)
 * so any screen can compute the current value locally without a tick feed.
 */
export interface RundownLiveState {
  v: 1;
  rundownId: string;
  rundownName: string;
  index: number;
  total: number;
  status: RundownStatus;
  /** countdown → seconds remaining; countup → seconds elapsed; captured at `at`. */
  value: number;
  /** Epoch ms when `value` was captured. */
  at: number;
  timer: RundownTimer | null;
  next: Pick<RundownTimer, "name" | "speaker" | "kind" | "durationSeconds"> | null;
  /** Message currently shown to the speaker / on stream (null = hidden). */
  message: RundownMessage | null;
  showProgressBar: boolean;
}

export type RundownWarnLevel = "green" | "yellow" | "red";

/** Look taken from a saved countdown design (text theme / text settings). */
export interface RundownOverlayStyle {
  fontFamily?: string;
  fontWeight?: number;
  textShadow?: string;
  textTransform?: string;
  /** Google Fonts stylesheet URL for the theme, if any. */
  fontUrl?: string;
}

/** Extra data the countdown overlay receives for rundown timers. */
export interface RundownOverlayExtras {
  style?: RundownOverlayStyle;
  kind: RundownTimerKind;
  durationSeconds: number;
  warnYellowSeconds: number;
  warnRedSeconds: number;
  showProgressBar: boolean;
  name: string;
  speaker: string;
  message: Pick<RundownMessage, "text" | "color" | "bold" | "flash"> | null;
}
