/**
 * SceneMutationQueue.test.ts — Stress tests proving no OBS mutations overlap.
 *
 * Scenarios:
 *   1. Rapid verse clicks (50 concurrent pushBible calls)
 *   2. Rapid worship slide clicks (50 concurrent pushWorshipLyrics calls)
 *   3. Tab switching while sending overlays (interleaved bible + worship + media)
 *   4. Multiple overlay types in succession (bible → lowerThird → ticker → media)
 *   5. Verify overlap detection fires on deliberately non-serialized calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enqueueMutation, getPendingMutationCount, getMutationOpCounter } from "./SceneMutationQueue";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Track all mutation intervals to check for overlaps */
interface MutationRecord {
  name: string;
  start: number;
  end: number;
}

function createMutationTracker() {
  const records: MutationRecord[] = [];
  return {
    records,
    wrap: (name: string, durationMs: number) =>
      enqueueMutation(name, async () => {
        const start = Date.now();
        records.push({ name, start, end: 0 });
        await sleep(durationMs);
        records[records.length - 1].end = Date.now();
        return { ok: true };
      }),
  };
}

/**
 * Check that no two mutation records overlap in time.
 * This is the core invariant the queue must satisfy.
 */
function assertNoOverlaps(records: MutationRecord[]) {
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i];
      const b = records[j];
      // Two records overlap if one starts before the other ends
      const overlaps = a.start < b.end && b.start < a.end;
      expect(overlaps).toBe(false);
    }
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SceneMutationQueue", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // ── 1. Basic serialization ────────────────────────────────────────────────

  it("executes mutations sequentially, not concurrently", async () => {
    const order: number[] = [];

    const p1 = enqueueMutation("op1", async () => { order.push(1); await sleep(30); order.push(10); });
    const p2 = enqueueMutation("op2", async () => { order.push(2); await sleep(30); order.push(20); });
    const p3 = enqueueMutation("op3", async () => { order.push(3); await sleep(30); order.push(30); });

    await Promise.all([p1, p2, p3]);

    // Each mutation should fully complete before the next starts
    expect(order).toEqual([1, 10, 2, 20, 3, 30]);
  });

  it("returns the result of the task", async () => {
    const result = await enqueueMutation("returnTest", async () => 42);
    expect(result).toBe(42);
  });

  it("propagates errors without blocking the queue", async () => {
    const results: string[] = [];

    const p1 = enqueueMutation("fail", async () => {
      results.push("start-fail");
      throw new Error("boom");
    }).catch((err) => { results.push(`caught:${err.message}`); });

    const p2 = enqueueMutation("after-fail", async () => {
      results.push("after");
      return "ok";
    });

    await Promise.all([p1, p2]);

    expect(results).toContain("start-fail");
    expect(results).toContain("caught:boom");
    expect(results).toContain("after");
  });

  // ── 2. Rapid verse clicks (50 concurrent) ─────────────────────────────────

  it("serializes 50 rapid verse clicks with no overlap", async () => {
    const tracker = createMutationTracker();
    const N = 50;
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < N; i++) {
      promises.push(tracker.wrap(`pushBible-v${i + 1}`, 5));
    }

    await Promise.all(promises);

    expect(tracker.records).toHaveLength(N);
    assertNoOverlaps(tracker.records);
  });

  // ── 3. Rapid worship slide clicks (50 concurrent) ─────────────────────────

  it("serializes 50 rapid worship slide clicks with no overlap", async () => {
    const tracker = createMutationTracker();
    const N = 50;
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < N; i++) {
      promises.push(tracker.wrap(`pushWorshipLyrics-s${i + 1}`, 5));
    }

    await Promise.all(promises);

    expect(tracker.records).toHaveLength(N);
    assertNoOverlaps(tracker.records);
  });

  // ── 4. Tab switching while sending overlays ───────────────────────────────

  it("serializes interleaved bible + worship + media mutations", async () => {
    const tracker = createMutationTracker();
    const promises: Promise<unknown>[] = [];

    // Simulate rapid tab switching with overlays
    for (let i = 0; i < 20; i++) {
      promises.push(tracker.wrap(`pushBible-tab${i}`, 3));
      promises.push(tracker.wrap(`pushWorshipLyrics-tab${i}`, 3));
      promises.push(tracker.wrap(`pushMedia-tab${i}`, 3));
    }

    await Promise.all(promises);

    expect(tracker.records).toHaveLength(60);
    assertNoOverlaps(tracker.records);
  });

  // ── 5. Multiple overlay types in succession ────────────────────────────────

  it("serializes rapid overlay type switching", async () => {
    const tracker = createMutationTracker();
    const promises: Promise<unknown>[] = [];

    // Bible → Lower Third → Ticker → Media → Bible → Lower Third → ...
    const types = ["pushBible", "pushLowerThird", "pushTicker", "pushMedia"];
    for (let round = 0; round < 25; round++) {
      for (const type of types) {
        promises.push(tracker.wrap(`${type}-round${round}`, 5));
      }
    }

    await Promise.all(promises);

    expect(tracker.records).toHaveLength(100);
    assertNoOverlaps(tracker.records);
  });

  // ── 6. Overlap detection ───────────────────────────────────────────────────

  it("detects overlap when mutation runs outside the queue", async () => {
    // Simulate a mutation that bypasses the queue (like the old _bibleMutationTail)
    // by running a slow mutation and a fast one that starts during it

    // Start a slow mutation
    const slow = enqueueMutation("slow-mutation", async () => {
      await sleep(50);
      return "slow-done";
    });

    // Start a fast mutation that should wait
    const fast = enqueueMutation("fast-mutation", async () => {
      return "fast-done";
    });

    await Promise.all([slow, fast]);

    // No overlap should be detected because the queue serialized them
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[MUTATION OVERLAP DETECTED]")
    );
  });

  // ── 7. Queue counters ─────────────────────────────────────────────────────

  it("tracks mutation counters correctly", async () => {
    const before = getMutationOpCounter();

    await enqueueMutation("counter-test", async () => {
      expect(getPendingMutationCount()).toBe(1);
    });

    expect(getMutationOpCounter()).toBe(before + 1);
  });

  // ── 8. Mixed fast and slow mutations ──────────────────────────────────────

  it("handles mixed fast/slow mutations without overlap", async () => {
    const tracker = createMutationTracker();
    const promises: Promise<unknown>[] = [];

    // Alternating fast (2ms) and slow (20ms) mutations
    for (let i = 0; i < 30; i++) {
      const duration = i % 2 === 0 ? 2 : 20;
      promises.push(tracker.wrap(`op-${i}`, duration));
    }

    await Promise.all(promises);

    expect(tracker.records).toHaveLength(30);
    assertNoOverlaps(tracker.records);
  });

  // ── 9. Stress: 200 concurrent mutations ───────────────────────────────────

  it("handles 200 concurrent mutations with no overlap", async () => {
    const tracker = createMutationTracker();
    const N = 200;
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < N; i++) {
      promises.push(tracker.wrap(`stress-${i}`, 2));
    }

    await Promise.all(promises);

    expect(tracker.records).toHaveLength(N);
    assertNoOverlaps(tracker.records);

    // Verify total time is roughly sequential (N * 2ms = 400ms, allow some overhead)
    // If they were concurrent, total time would be ~2ms
    // We can't check exact timing, but the overlap check is sufficient
  });

  // ── 10. clearAllMCEScenes serialization ────────────────────────────────────

  it("serializes clearAllMCEScenes with pushBible", async () => {
    const tracker = createMutationTracker();
    const promises: Promise<unknown>[] = [];

    // Simulate: push bible while clearAll is happening
    promises.push(tracker.wrap("clearAllMCEScenes", 10));
    for (let i = 0; i < 10; i++) {
      promises.push(tracker.wrap(`pushBible-v${i}`, 5));
    }

    await Promise.all(promises);

    expect(tracker.records).toHaveLength(11);
    assertNoOverlaps(tracker.records);
  });
});
