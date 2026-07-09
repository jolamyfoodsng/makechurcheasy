/**
 * obsRequestQueue.ts — OBS WebSocket request queue with rate limiting
 *
 * Provides concurrency limiting, rate limiting, request deduplication,
 * automatic backoff on slow/error responses, and latency tracking.
 * Shared singleton used by both obsService.ts and dockObsClient.ts.
 *
 * Usage:
 *   const result = await obsRequestQueue.enqueue(
 *     "GetSceneList",
 *     () => obs.call("GetSceneList"),
 *     { priority: "normal", dedupeKey: "GetSceneList" }
 *   );
 */

import * as perf from "./performanceManager";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestOptions {
  /** Deduplication key — if identical key is in-flight, return existing promise */
  dedupeKey?: string;
  /** Request priority — high bypasses rate limiter queue */
  priority?: "high" | "normal";
  /** Timeout in ms — defaults to 5000 */
  timeoutMs?: number;
}

export interface RequestStats {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  queueDepth: number;
  dedupCount: number;
  backoffActive: boolean;
  backoffMultiplier: number;
  inFlight: number;
}

interface LatencyEntry {
  timestamp: number;
  /** Total time including queue wait — used for stats/display */
  latencyMs: number;
  /** Actual WebSocket round-trip time (fn() duration only) — used for backoff */
  callLatencyMs: number;
}

// ---------------------------------------------------------------------------
// Sliding window rate limiter
// ---------------------------------------------------------------------------

class RateLimiter {
  private timestamps: number[] = [];

  constructor(private maxPerSecond: number) { }

  updateBudget(maxPerSecond: number): void {
    this.maxPerSecond = maxPerSecond;
  }

  /** Returns a promise that resolves when it's safe to send a request */
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    // Remove timestamps older than 1 second
    this.timestamps = this.timestamps.filter(t => now - t < 1000);

    if (this.timestamps.length < this.maxPerSecond) {
      this.timestamps.push(now);
      return;
    }

    // Wait until the oldest request in the window expires
    const oldest = this.timestamps[0];
    const waitMs = 1000 - (now - oldest) + 10; // +10ms safety margin
    await sleep(Math.max(0, waitMs));

    // Re-check after waiting
    const afterWait = Date.now();
    this.timestamps = this.timestamps.filter(t => afterWait - t < 1000);
    this.timestamps.push(afterWait);
  }

  /** Current requests in the sliding window */
  get currentRate(): number {
    const now = Date.now();
    return this.timestamps.filter(t => now - t < 1000).length;
  }
}

// ---------------------------------------------------------------------------
// Concurrency semaphore
// ---------------------------------------------------------------------------

class Semaphore {
  private waitQueue: Array<() => void> = [];
  private running = 0;

  constructor(private max: number) { }

  updateMax(max: number): void {
    this.max = max;
  }

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>(resolve => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    if (this.waitQueue.length > 0 && this.running < this.max) {
      this.running++;
      const next = this.waitQueue.shift()!;
      next();
    }
  }

  get inFlight(): number {
    return this.running;
  }

  get queueLength(): number {
    return this.waitQueue.length;
  }
}

// ---------------------------------------------------------------------------
// Main queue
// ---------------------------------------------------------------------------

const LOG_PREFIX = "[OBS-Q]";
const LATENCY_WINDOW = 50;
const STATS_LOG_INTERVAL_MS = 30_000;
const BACKOFF_THRESHOLD_P95_MS = 1000;
const BACKOFF_SUSTAINED_SECONDS = 30;
const BACKOFF_FACTOR = 0.75; // reduce budget by 25%

let totalRequests = 0;
let completedRequests = 0;
let failedRequests = 0;
let dedupCount = 0;
let backoffActive = false;
let backoffMultiplier = 1;
const latencies: LatencyEntry[] = [];
const inFlightDedupes = new Map<string, Promise<unknown>>();

const semaphore = new Semaphore(perf.getMaxConcurrentRequests());
const rateLimiter = new RateLimiter(perf.getOBSRequestBudget());

// Stats logging
let statsLogTimer: ReturnType<typeof setInterval> | null = null;

function startStatsLogging(): void {
  if (statsLogTimer) return;
  statsLogTimer = setInterval(() => {
    if (totalRequests === 0) return;
    const stats = getStats();
    console.log(
      `${LOG_PREFIX} Requests: ${stats.completedRequests}/${stats.totalRequests} ` +
      `| Failed: ${stats.failedRequests} | Avg: ${stats.avgLatencyMs}ms ` +
      `| P95: ${stats.p95LatencyMs}ms | In-flight: ${stats.inFlight} ` +
      `| Deduped: ${stats.dedupCount} | Queue: ${stats.queueDepth} ` +
      `| Backoff: ${stats.backoffActive ? `${(stats.backoffMultiplier * 100).toFixed(0)}%` : "off"}`
    );
  }, STATS_LOG_INTERVAL_MS);
}

function stopStatsLogging(): void {
  if (statsLogTimer) {
    clearInterval(statsLogTimer);
    statsLogTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Backoff detection
// ---------------------------------------------------------------------------

function checkBackoff(): void {
  const now = Date.now();
  const recent = latencies.filter(l => now - l.timestamp < BACKOFF_SUSTAINED_SECONDS * 1000);
  if (recent.length < 10) return; // need enough samples

  // Use actual WebSocket call latency for backoff decisions, NOT total queue time.
  // This prevents the backoff feedback loop where rate limiter wait inflates latency
  // → backoff reduces budget → more wait → more backoff → death spiral.
  const sorted = recent.map(l => l.callLatencyMs).sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index];

  if (p95 > BACKOFF_THRESHOLD_P95_MS && !backoffActive) {
    backoffActive = true;
    backoffMultiplier = BACKOFF_FACTOR;
    const newBudget = Math.max(1, Math.floor(perf.getOBSRequestBudget() * backoffMultiplier));
    rateLimiter.updateBudget(newBudget);
    console.warn(`${LOG_PREFIX} Backoff activated — P95 latency ${p95}ms > ${BACKOFF_THRESHOLD_P95_MS}ms, budget reduced to ${newBudget}/s`);
  } else if (p95 < BACKOFF_THRESHOLD_P95_MS * 0.6 && backoffActive) {
    // Recovery — latency dropped well below threshold
    backoffActive = false;
    backoffMultiplier = 1;
    rateLimiter.updateBudget(perf.getOBSRequestBudget());
    console.log(`${LOG_PREFIX} Backoff cleared — P95 latency ${p95}ms recovered`);
  }
}

// ---------------------------------------------------------------------------
// Performance tier change listener
// ---------------------------------------------------------------------------

perf.onPerformanceTierChange((profile) => {
  if (!backoffActive) {
    rateLimiter.updateBudget(profile.requestsPerSecondBudget);
  }
  semaphore.updateMax(profile.maxConcurrentRequests);
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue an OBS WebSocket request.
 * Wraps the raw call with rate limiting, concurrency control, dedup, and backoff.
 */
export async function enqueue<T>(
  label: string,
  fn: () => Promise<T>,
  options: RequestOptions = {}
): Promise<T> {
  const { dedupeKey, priority = "normal", timeoutMs = 5000 } = options;

  // Deduplication — if same key is in-flight, return existing promise
  if (dedupeKey && inFlightDedupes.has(dedupeKey)) {
    dedupCount++;
    return inFlightDedupes.get(dedupeKey) as Promise<T>;
  }

  totalRequests++;
  startStatsLogging();

  const execute = async (): Promise<T> => {
    const queueStartTime = performance.now();

    // Acquire concurrency slot
    await semaphore.acquire();

    // Rate limit (high-priority bypasses for critical scene switches)
    if (priority !== "high") {
      await rateLimiter.waitForSlot();
    }

    // Now measure the actual WebSocket call time (after all queue/rate-limiting)
    const callStartTime = performance.now();
    try {
      const result = await withTimeout(fn(), timeoutMs);
      const callLatencyMs = performance.now() - callStartTime;
      const totalTime = performance.now() - queueStartTime;

      completedRequests++;
      recordLatency(totalTime, callLatencyMs);

      if (callLatencyMs > 500) {
        console.warn(`${LOG_PREFIX} Slow call: ${label} actual call took ${callLatencyMs.toFixed(0)}ms`);
      }

      return result;
    } catch (err) {
      const callLatencyMs = performance.now() - callStartTime;
      const totalTime = performance.now() - queueStartTime;
      failedRequests++;
      recordLatency(totalTime, callLatencyMs);
      throw err;
    } finally {
      semaphore.release();
      if (dedupeKey) {
        inFlightDedupes.delete(dedupeKey);
      }
    }
  };

  const promise = execute();

  // Track in-flight for deduplication
  if (dedupeKey) {
    inFlightDedupes.set(dedupeKey, promise);
  }

  return promise;
}

/**
 * Get current queue statistics.
 */
export function getStats(): RequestStats {
  const now = Date.now();
  const recent = latencies.filter(l => now - l.timestamp < 60_000);
  const avgLatencyMs = recent.length > 0
    ? Math.round(recent.reduce((a, b) => a + b.latencyMs, 0) / recent.length)
    : 0;
  const sorted = recent.map(l => l.latencyMs).sort((a, b) => a - b);
  const p95LatencyMs = sorted.length > 0
    ? Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1])
    : 0;

  return {
    totalRequests,
    completedRequests,
    failedRequests,
    avgLatencyMs,
    p95LatencyMs,
    queueDepth: semaphore.queueLength,
    dedupCount,
    backoffActive,
    backoffMultiplier,
    inFlight: semaphore.inFlight,
  };
}

/**
 * Reset all stats (e.g., on reconnect).
 */
export function resetStats(): void {
  totalRequests = 0;
  completedRequests = 0;
  failedRequests = 0;
  dedupCount = 0;
  backoffActive = false;
  backoffMultiplier = 1;
  latencies.length = 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function recordLatency(latencyMs: number, callLatencyMs: number): void {
  latencies.push({ timestamp: Date.now(), latencyMs, callLatencyMs });
  if (latencies.length > LATENCY_WINDOW * 2) {
    latencies.splice(0, latencies.length - LATENCY_WINDOW);
  }
  checkBackoff();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`OBS request timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Cleanup — call on app shutdown.
 */
export function destroy(): void {
  stopStatsLogging();
  inFlightDedupes.clear();
}
