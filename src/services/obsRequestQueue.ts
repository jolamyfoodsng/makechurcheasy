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
  /** Key for replaceExisting — if a pending (queued) request shares this key, it is cancelled and replaced */
  key?: string;
  /** When true, cancels any pending request with the same `key` and replaces it with this one */
  replaceExisting?: boolean;
  /** Request priority — high bypasses rate limiter queue, low yields to normal */
  priority?: "high" | "normal" | "low";
  /** Timeout in ms — defaults to 5000 */
  timeoutMs?: number;
}

interface QueuedRequest {
  key?: string;
  priority: "high" | "normal" | "low";
  cancelled: boolean;
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export interface RequestStats {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  queueDepth: number;
  dedupCount: number;
  replacedCount: number;
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
  private maxConcurrent = 0;

  constructor(max: number) {
    this.maxConcurrent = max;
  }

  get max(): number {
    return this.maxConcurrent;
  }

  updateMax(max: number): void {
    this.maxConcurrent = max;
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
let replacedCount = 0;
let backoffActive = false;
let backoffMultiplier = 1;
const latencies: LatencyEntry[] = [];
const inFlightDedupes = new Map<string, Promise<unknown>>();
const pendingByKey = new Map<string, QueuedRequest>();
const pendingQueue: QueuedRequest[] = [];
let processingQueue = false;
const recentFailures: Array<{ label: string; error: string; time: string }> = [];

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
    if (recentFailures.length > 0) {
      console.warn(`${LOG_PREFIX} Recent failures:`, recentFailures);
    }
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
 * Wraps the raw call with rate limiting, concurrency control, dedup,
 * replaceExisting cancellation, priority queuing, and backoff.
 */
export async function enqueue<T>(
  _label: string,
  fn: () => Promise<T>,
  options: RequestOptions = {}
): Promise<T> {
  const { dedupeKey, key, replaceExisting, priority = "normal" } = options;

  // ── Deduplication ──
  if (dedupeKey && inFlightDedupes.has(dedupeKey)) {
    dedupCount++;
    return inFlightDedupes.get(dedupeKey) as Promise<T>;
  }

  // ── replaceExisting: cancel any pending request with matching key ──
  if (key && replaceExisting) {
    const existing = pendingByKey.get(key);
    if (existing) {
      existing.cancelled = true;
      pendingByKey.delete(key);
      // Remove from pending queue
      const idx = pendingQueue.indexOf(existing);
      if (idx !== -1) pendingQueue.splice(idx, 1);
      replacedCount++;
    }
  }

  totalRequests++;
  startStatsLogging();

  return new Promise<T>((resolve, reject) => {
    const request: QueuedRequest = {
      key,
      priority,
      cancelled: false,
      fn: () => fn().then(resolve, reject),
      resolve: resolve as (value: unknown) => void,
      reject,
    };

    if (key) {
      pendingByKey.set(key, request);
    }

    // Insert into pending queue ordered by priority
    const pOrder = { high: 0, normal: 1, low: 2 };
    const insertIdx = pendingQueue.findIndex((r) => pOrder[r.priority] > pOrder[priority]);
    if (insertIdx === -1) {
      pendingQueue.push(request);
    } else {
      pendingQueue.splice(insertIdx, 0, request);
    }

    drainQueue();
  });
}

/**
 * Drain the pending queue: start as many requests as concurrency allows,
 * picking the highest-priority non-cancelled items first.
 */
function drainQueue(): void {
  if (processingQueue) return;
  processingQueue = true;

  while (pendingQueue.length > 0 && semaphore.inFlight < semaphore.max) {
    // Pick the highest-priority non-cancelled request
    const idx = pendingQueue.findIndex((r) => !r.cancelled);
    if (idx === -1) {
      pendingQueue.length = 0;
      break;
    }
    const request = pendingQueue[idx];
    pendingQueue.splice(idx, 1);
    if (request.key) pendingByKey.delete(request.key);

    // Fire and forget — concurrency is controlled by the semaphore
    executeRequest(request).catch(() => {});
  }

  processingQueue = false;
}

async function executeRequest(request: QueuedRequest): Promise<void> {
  const callStartTime = performance.now();

  try {
    // Acquire concurrency slot
    await semaphore.acquire();

    if (request.cancelled) {
      semaphore.release();
      return;
    }

    // Rate limit (high-priority bypasses for critical scene switches)
    if (request.priority !== "high") {
      await rateLimiter.waitForSlot();
    }

    if (request.cancelled) {
      semaphore.release();
      return;
    }

    // Execute the actual OBS call
    const t0 = performance.now();
    try {
      await withTimeout(request.fn(), 5000);
      const callLatencyMs = performance.now() - t0;
      const totalTime = performance.now() - callStartTime;

      if (!request.cancelled) {
        completedRequests++;
        recordLatency(totalTime, callLatencyMs);
        if (callLatencyMs > 500) {
          console.warn(`${LOG_PREFIX} Slow call took ${callLatencyMs.toFixed(0)}ms`);
        }
      }
    } catch (err) {
      const callLatencyMs = performance.now() - t0;
      const totalTime = performance.now() - callStartTime;
      if (!request.cancelled) {
        failedRequests++;
        recordLatency(totalTime, callLatencyMs);
      }
    } finally {
      semaphore.release();
      drainQueue();
    }
  } catch {
    semaphore.release();
    drainQueue();
  }
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
    replacedCount,
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
  replacedCount = 0;
  backoffActive = false;
  backoffMultiplier = 1;
  latencies.length = 0;
  recentFailures.length = 0;
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
  pendingByKey.clear();
  pendingQueue.length = 0;
}
