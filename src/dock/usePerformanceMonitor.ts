/**
 * usePerformanceMonitor.ts — Lightweight performance monitoring hook
 *
 * Tracks heap usage, frame timing, and component render counts.
 * Samples every 2s, keeps the last 30 readings for sparkline display.
 *
 * Uses performance.memory (Chrome/CEF) and performance.now() for frame timing.
 * No external dependencies.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerformanceSnapshot {
  timestamp: number;
  /** JS heap used in MB (0 if unsupported) */
  heapUsedMB: number;
  /** JS heap limit in MB (0 if unsupported) */
  heapLimitMB: number;
  /** Heap usage as fraction 0–1 */
  heapFraction: number;
  /** Average frame time in ms over the last sampling window */
  avgFrameMs: number;
  /** Estimated FPS */
  fps: number;
  /** Number of active React root elements */
  reactRoots: number;
  /** DOM node count */
  domNodes: number;
}

export interface PerformanceMonitor {
  /** Current snapshot */
  current: PerformanceSnapshot;
  /** Last 30 snapshots for sparkline */
  history: PerformanceSnapshot[];
  /** True if browser supports performance.memory */
  memorySupported: boolean;
  /** Force a manual refresh */
  refresh: () => void;
}

const SAMPLE_INTERVAL_MS = 2_000;
const HISTORY_LENGTH = 30;

// ---------------------------------------------------------------------------
// Frame timing tracker — uses requestAnimationFrame
// ---------------------------------------------------------------------------

class FrameTracker {
  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private rafId = 0;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Returns average frame time in ms over the sampling window, then resets */
  getAverageAndReset(): { avgMs: number; fps: number } {
    if (this.frameTimes.length === 0) return { avgMs: 16.67, fps: 60 };
    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    const avgMs = sum / this.frameTimes.length;
    this.frameTimes = [];
    return {
      avgMs: Math.round(avgMs * 10) / 10,
      fps: Math.round(1000 / avgMs),
    };
  }

  private tick = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    // Only record reasonable frame times (filter out tab-backgrounded frames)
    if (delta > 0 && delta < 200) {
      this.frameTimes.push(delta);
    }
    this.rafId = requestAnimationFrame(this.tick);
  };
}

// ---------------------------------------------------------------------------
// Memory reader — polls performance.memory
// ---------------------------------------------------------------------------

function readMemory(): { usedMB: number; limitMB: number } {
  try {
    // performance.memory is non-standard but available in Chrome/CEF
    const mem = (performance as any).memory;
    if (mem) {
      return {
        usedMB: Math.round(mem.usedJSHeapSize / (1024 * 1024)),
        limitMB: Math.round(mem.jsHeapSizeLimit / (1024 * 1024)),
      };
    }
  } catch { /* not available */ }
  return { usedMB: 0, limitMB: 0 };
}

// ---------------------------------------------------------------------------
// DOM / React counters
// ---------------------------------------------------------------------------

function countDomNodes(): number {
  try {
    return document.getElementsByTagName("*").length;
  } catch {
    return 0;
  }
}

function countReactRoots(): number {
  try {
    // React 18+ stores root on __reactContainer$ or __reactFiber$
    const all = document.querySelectorAll("[id]");
    let count = 0;
    for (const el of all) {
      const keys = Object.keys(el);
      for (const key of keys) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactContainer$")) {
          count++;
          break;
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function createEmptySnapshot(): PerformanceSnapshot {
  return {
    timestamp: Date.now(),
    heapUsedMB: 0,
    heapLimitMB: 0,
    heapFraction: 0,
    avgFrameMs: 16.67,
    fps: 60,
    reactRoots: 0,
    domNodes: 0,
  };
}

export function usePerformanceMonitor(enabled = true): PerformanceMonitor {
  const [current, setCurrent] = useState<PerformanceSnapshot>(createEmptySnapshot);
  const [history, setHistory] = useState<PerformanceSnapshot[]>([]);
  const frameTrackerRef = useRef<FrameTracker | null>(null);
  const memorySupportedRef = useRef(false);

  // Check memory support once
  useEffect(() => {
    memorySupportedRef.current = typeof (performance as any).memory !== "undefined";
  }, []);

  // Frame tracker lifecycle
  useEffect(() => {
    if (!enabled) return;
    const tracker = new FrameTracker();
    tracker.start();
    frameTrackerRef.current = tracker;
    return () => {
      tracker.stop();
      frameTrackerRef.current = null;
    };
  }, [enabled]);

  // Sampling loop
  useEffect(() => {
    if (!enabled) return;

    const sample = () => {
      const { usedMB, limitMB } = readMemory();
      const fraction = limitMB > 0 ? usedMB / limitMB : 0;
      const frameData = frameTrackerRef.current?.getAverageAndReset() ?? { avgMs: 16.67, fps: 60 };

      const snap: PerformanceSnapshot = {
        timestamp: Date.now(),
        heapUsedMB: usedMB,
        heapLimitMB: limitMB,
        heapFraction: Math.round(fraction * 100) / 100,
        avgFrameMs: frameData.avgMs,
        fps: frameData.fps,
        reactRoots: countReactRoots(),
        domNodes: countDomNodes(),
      };

      setCurrent(snap);
      setHistory((prev) => [...prev.slice(-(HISTORY_LENGTH - 1)), snap]);
    };

    // Initial sample
    sample();

    const interval = setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled]);

  const refresh = useCallback(() => {
    const { usedMB, limitMB } = readMemory();
    const fraction = limitMB > 0 ? usedMB / limitMB : 0;
    const frameData = frameTrackerRef.current?.getAverageAndReset() ?? { avgMs: 16.67, fps: 60 };

    const snap: PerformanceSnapshot = {
      timestamp: Date.now(),
      heapUsedMB: usedMB,
      heapLimitMB: limitMB,
      heapFraction: Math.round(fraction * 100) / 100,
      avgFrameMs: frameData.avgMs,
      fps: frameData.fps,
      reactRoots: countReactRoots(),
      domNodes: countDomNodes(),
    };

    setCurrent(snap);
    setHistory((prev) => [...prev.slice(-(HISTORY_LENGTH - 1)), snap]);
  }, []);

  return {
    current,
    history,
    memorySupported: memorySupportedRef.current,
    refresh,
  };
}
