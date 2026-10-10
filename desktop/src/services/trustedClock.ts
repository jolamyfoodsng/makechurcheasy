/**
 * trustedClock.ts — a clock that agrees with the server.
 *
 * Forced-update deadlines are set by the server. If we compared them to the
 * raw system clock, a wrong clock (or one wound back on purpose) would stretch
 * the countdown. Every fresh config response teaches us the difference between
 * the server's clock and ours; we remember it so the countdown stays right
 * even offline.
 */

const CLOCK_OFFSET_KEY = "ocs-trusted-clock-offset-v1";
const MAX_PLAUSIBLE_OFFSET_MS = 30 * 24 * 3_600_000;

let offsetMs: number | null = null;

function readOffset(): number {
  if (offsetMs !== null) return offsetMs;
  try {
    const raw = localStorage.getItem(CLOCK_OFFSET_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    offsetMs = Number.isFinite(parsed) ? parsed : 0;
  } catch {
    offsetMs = 0;
  }
  return offsetMs;
}

/**
 * Call with the `serverTime` of a response that was JUST fetched. Never call it
 * with a cached response: its timestamp is old and would skew the offset.
 */
export function noteServerTime(serverTime?: string | null): void {
  if (!serverTime) return;
  const serverMs = Date.parse(serverTime);
  if (!Number.isFinite(serverMs)) return;
  const offset = serverMs - Date.now();
  if (Math.abs(offset) > MAX_PLAUSIBLE_OFFSET_MS) return;
  offsetMs = offset;
  try {
    localStorage.setItem(CLOCK_OFFSET_KEY, String(offset));
  } catch {
    // non-critical
  }
}

/** Current time in ms, corrected to the server's clock when we have seen it. */
export function getTrustedNowMs(): number {
  return Date.now() + readOffset();
}
