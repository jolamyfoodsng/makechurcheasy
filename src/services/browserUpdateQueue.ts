/**
 * browserUpdateQueue.ts — Browser source update coalescing queue
 *
 * Reduces pressure on CEF/Chromium by coalescing rapid DOM updates.
 * When multiple updates target the same browser source within a short window,
 * only the latest update is sent, preventing event loop congestion that
 * causes libcef.dll crashes.
 *
 * Used by dockObsClient.ts for overlay/builder URL updates.
 *
 * Usage:
 *   browserUpdateQueue.enqueue("bible-overlay", () => setUrl(newUrl));
 *   browserUpdateQueue.enqueue("lower-thirds", () => setUrl(newUrl), { force: true });
 */

import * as perf from "./performanceManager";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrowserUpdateOptions {
  /** Force immediate execution, bypassing coalescing (e.g., emergency stop) */
  force?: boolean;
  /** Human-readable label for diagnostics */
  label?: string;
}

export interface BrowserUpdateStats {
  totalUpdates: number;
  coalesced: number;
  dropped: number;
  executed: number;
  budgetExceeded: number;
  avgIntervalMs: number;
  sources: Record<string, {
    updateCount: number;
    coalescedCount: number;
    lastUpdateMs: number;
    avgIntervalMs: number;
  }>;
}

interface PendingUpdate {
  /** Unique source identifier (e.g., "bible-overlay", "lower-thirds-1") */
  sourceId: string;
  /** The actual update function to execute */
  fn: () => Promise<void> | void;
  /** Label for logging */
  label: string;
  /** Timestamp when first update in this coalescing window was received */
  firstQueuedAt: number;
  /** Timestamp when the latest update in this coalescing window was received */
  lastQueuedAt: number;
  /** Number of updates coalesced into this single pending update */
  coalesceCount: number;
  /** Promise resolvers waiting for the eventual coalesced update to finish */
  resolvers: Array<() => void>;
}

interface SourceStats {
  updateCount: number;
  coalescedCount: number;
  lastUpdateMs: number;
  intervals: number[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PREFIX = "[BROWSER-Q]";
const COALESCE_WINDOW_MS = 100; // updates within this window are merged
const STATS_LOG_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let totalUpdates = 0;
let coalesced = 0;
let dropped = 0;
let executed = 0;
let budgetExceeded = 0;
let lastExecutionTime = 0;

/** sourceId → pending update (only one per source at a time) */
const pending = new Map<string, PendingUpdate>();

/** sourceId → stats */
const sourceStats = new Map<string, SourceStats>();

/** Currently executing updates (to prevent re-entry) */
const executing = new Set<string>();

/** Timer for flushing coalesced updates */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Stats logging
// ---------------------------------------------------------------------------

let statsLogTimer: ReturnType<typeof setInterval> | null = null;

function startStatsLogging(): void {
  if (statsLogTimer) return;
  statsLogTimer = setInterval(() => {
    if (totalUpdates === 0) return;
    const stats = getStats();
    const activeSources = Object.keys(stats.sources).length;
    console.log(
      `${LOG_PREFIX} Updates: ${stats.executed}/${stats.totalUpdates} ` +
      `| Coalesced: ${stats.coalesced} | Dropped: ${stats.dropped} ` +
      `| Budget exceeded: ${stats.budgetExceeded} | Sources: ${activeSources} ` +
      `| Avg interval: ${stats.avgIntervalMs}ms`
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
// Budget enforcement
// ---------------------------------------------------------------------------

function canExecuteUpdate(): boolean {
  const settings = perf.getBrowserSourceSettings();
  const budgetPerSecond = settings.browserUpdateBudgetPerSecond;
  const now = Date.now();
  const timeSinceLastExec = now - lastExecutionTime;
  const minIntervalMs = 1000 / budgetPerSecond;

  if (timeSinceLastExec < minIntervalMs) {
    return false;
  }
  return true;
}

function getMinIntervalMs(): number {
  const settings = perf.getBrowserSourceSettings();
  return 1000 / settings.browserUpdateBudgetPerSecond;
}

// ---------------------------------------------------------------------------
// Coalescing engine
// ---------------------------------------------------------------------------

function flushSource(sourceId: string): void {
  const update = pending.get(sourceId);
  if (!update) return;

  pending.delete(sourceId);

  // Budget check
  if (!canExecuteUpdate()) {
    budgetExceeded++;
    dropped++;

    // Schedule for later instead of dropping entirely
    const delay = getMinIntervalMs();
    setTimeout(() => {
      pending.set(sourceId, update);
      scheduleFlush(0); // immediate re-attempt
    }, delay);

    if (update.coalesceCount > 1) {
      console.warn(`${LOG_PREFIX} Budget exceeded for ${update.label} — deferred ${delay}ms (${update.coalesceCount} coalesced)`);
    }
    return;
  }

  // Prevent re-entry for same source
  if (executing.has(sourceId)) {
    // Re-queue for later
    pending.set(sourceId, update);
    scheduleFlush(getMinIntervalMs());
    return;
  }

  executing.add(sourceId);
  lastExecutionTime = Date.now();
  executed++;

  // Track stats
  const stats = getOrCreateSourceStats(sourceId);
  stats.updateCount++;
  if (update.coalesceCount > 1) {
    stats.coalescedCount += update.coalesceCount - 1;
  }
  const now = Date.now();
  if (stats.lastUpdateMs > 0) {
    const interval = now - stats.lastUpdateMs;
    stats.intervals.push(interval);
    if (stats.intervals.length > 20) stats.intervals.shift();
  }
  stats.lastUpdateMs = now;

  if (update.coalesceCount > 1) {
    console.log(
      `${LOG_PREFIX} Coalesced ${update.coalesceCount} updates for ${update.label} → single execution`
    );
  }

  // Execute
  Promise.resolve(update.fn()).catch(err => {
    console.error(`${LOG_PREFIX} Update failed for ${update.label}:`, err);
  }).finally(() => {
    executing.delete(sourceId);
    update.resolvers.forEach((resolve) => resolve());
  });
}

function scheduleFlush(delayMs: number): void {
  if (flushTimer !== null) return; // already scheduled
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushAll();
  }, delayMs);
}

function flushAll(): void {
  const sourceIds = Array.from(pending.keys());
  if (sourceIds.length === 0) return;

  // Sort by priority: oldest first (FIFO)
  const sorted = sourceIds
    .map(id => pending.get(id)!)
    .sort((a, b) => a.firstQueuedAt - b.firstQueuedAt);

  for (const update of sorted) {
    // Respect minimum interval between executions
    const minInterval = getMinIntervalMs();
    const timeSinceLast = Date.now() - lastExecutionTime;
    if (timeSinceLast < minInterval) {
      scheduleFlush(minInterval - timeSinceLast);
      break;
    }
    flushSource(update.sourceId);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a browser source update with automatic coalescing.
 * If multiple updates to the same sourceId arrive within the coalescing window,
 * only the latest function is executed.
 */
export function enqueue(
  sourceId: string,
  fn: () => Promise<void> | void,
  options: BrowserUpdateOptions = {}
): Promise<void> {
  totalUpdates++;
  startStatsLogging();

  const { force = false, label = sourceId } = options;
  const now = Date.now();

  return new Promise<void>((resolve) => {
    if (force) {
      // Force bypasses coalescing — execute immediately
      executing.add(sourceId);
      lastExecutionTime = Date.now();
      executed++;

      const stats = getOrCreateSourceStats(sourceId);
      stats.updateCount++;
      stats.lastUpdateMs = now;

      Promise.resolve(fn()).catch(err => {
        console.error(`${LOG_PREFIX} Forced update failed for ${label}:`, err);
      }).finally(() => {
        executing.delete(sourceId);
        resolve();
      });
      return;
    }

    // Coalescing logic
    const existing = pending.get(sourceId);
    if (existing) {
      // Coalesce — replace the function but keep the original timestamp
      existing.fn = fn;
      existing.label = label;
      existing.lastQueuedAt = now;
      existing.coalesceCount++;
      existing.resolvers.push(resolve);
      coalesced++;
      return;
    }

    // New pending update
    pending.set(sourceId, {
      sourceId,
      fn,
      label,
      firstQueuedAt: now,
      lastQueuedAt: now,
      coalesceCount: 1,
      resolvers: [resolve],
    });

    // Schedule flush (debounced)
    scheduleFlush(COALESCE_WINDOW_MS);
  });
}

/**
 * Force-flush all pending updates immediately.
 */
export function flush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushAll();
}

/**
 * Get current queue statistics.
 */
export function getStats(): BrowserUpdateStats {
  const sources: BrowserUpdateStats["sources"] = {};

  for (const [sourceId, stats] of sourceStats) {
    const avgIntervalMs = stats.intervals.length > 0
      ? Math.round(stats.intervals.reduce((a, b) => a + b, 0) / stats.intervals.length)
      : 0;

    sources[sourceId] = {
      updateCount: stats.updateCount,
      coalescedCount: stats.coalescedCount,
      lastUpdateMs: stats.lastUpdateMs,
      avgIntervalMs,
    };
  }

  // Compute overall average interval
  const allIntervals: number[] = [];
  for (const stats of sourceStats.values()) {
    allIntervals.push(...stats.intervals);
  }
  const avgIntervalMs = allIntervals.length > 0
    ? Math.round(allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length)
    : 0;

  return {
    totalUpdates,
    coalesced,
    dropped,
    executed,
    budgetExceeded,
    avgIntervalMs,
    sources,
  };
}

/**
 * Get pending queue depth.
 */
export function getQueueDepth(): number {
  return pending.size;
}

/**
 * Reset all stats (e.g., on reconnect).
 */
export function resetStats(): void {
  totalUpdates = 0;
  coalesced = 0;
  dropped = 0;
  executed = 0;
  budgetExceeded = 0;
  lastExecutionTime = 0;
  sourceStats.clear();
}

/**
 * Cleanup — call on app shutdown.
 */
export function destroy(): void {
  stopStatsLogging();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
  pending.clear();
  executing.clear();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getOrCreateSourceStats(sourceId: string): SourceStats {
  let stats = sourceStats.get(sourceId);
  if (!stats) {
    stats = {
      updateCount: 0,
      coalescedCount: 0,
      lastUpdateMs: 0,
      intervals: [],
    };
    sourceStats.set(sourceId, stats);
  }
  return stats;
}
