/**
 * cycleSet.ts — graphics that run through a set of items (Social Handles shows one
 * platform after another). For these the Dock shows "Cycles" (how many times the whole
 * set runs before it animates out) instead of "Duration on screen (sec)".
 *
 * The graphic itself reports how long one cycle takes (`data-kx-cycle-sec`, see
 * sunday-lower-thirds.js) and public/lower-third-overlay.html turns kxCycles into the
 * auto-out time. This file only mirrors that maths so the Dock can show "about 40 s".
 */
import type { LowerThirdTheme } from "./types";

/** Setting key stored with the theme values and read by the overlay. */
export const CYCLES_KEY = "kxCycles";
/** The graphic's own "seconds per item" field. The Dock moves it next to Cycles / Speed. */
export const PER_KEY = "per";
/** Choices in the dropdown. 0 keeps looping until Animate out. */
export const CYCLE_PRESETS = ["1", "2", "3", "4", "5", "10"];
export const DEFAULT_CYCLES = "1";
const MIN_SECONDS_PER_ITEM = 2.5;
const DEFAULT_SECONDS_PER_ITEM = 4;

export interface CycleInfo {
  /** Items in the set, e.g. platforms. */
  items: number;
  secondsPerItem: number;
  /** Seconds for the whole set to show once. */
  cycleSeconds: number;
  /** Singular / plural noun for the hint, e.g. "platform". */
  noun: string;
}

/** True for graphics built as a set of items (a platform list). Its "seconds per item" field lives in the motion controls. */
export function isCycleTheme(theme: LowerThirdTheme): boolean {
  return theme.variables.some((v) => v.key === "plats" && v.type === "list")
    && theme.variables.some((v) => v.key === PER_KEY);
}

function pick(theme: LowerThirdTheme, values: Record<string, string>, key: string): string | undefined {
  const typed = values[key];
  if (typed !== undefined && typed !== "") return typed;
  return theme.variables.find((v) => v.key === key)?.defaultValue;
}

/** The set size and timing for a cycling graphic, or null when it is not a set of two or more. */
export function getCycleInfo(theme: LowerThirdTheme, values: Record<string, string>): CycleInfo | null {
  const listVar = theme.variables.find((v) => v.key === "plats" && v.type === "list");
  if (!listVar) return null;
  const items = String(pick(theme, values, "plats") ?? "").split(/[\s,]+/).filter(Boolean).length;
  if (items < 2) return null;
  const per = parseFloat(String(pick(theme, values, PER_KEY) ?? ""));
  const secondsPerItem = Math.max(MIN_SECONDS_PER_ITEM, Number.isFinite(per) && per > 0 ? per : DEFAULT_SECONDS_PER_ITEM);
  return { items, secondsPerItem, cycleSeconds: items * secondsPerItem, noun: "platform" };
}

/** Whole number of cycles from a stored value. 0 = keep looping; empty = the default. */
export function parseCycles(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return Number(DEFAULT_CYCLES);
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 99) : Number(DEFAULT_CYCLES);
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m}m ${rest}s` : `${m}m`;
}
