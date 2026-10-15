/**
 * quoteIndexStore.ts — builds the quote index once per translation and keeps it in memory.
 *
 * The first call starts the (sliced, ~1 s) build; later calls reuse it. `getReadyQuoteIndex` is
 * synchronous and returns null until the build has finished, so a caller can decide not to wait.
 */

import { getRawBibleData } from "./bibleData";
import { buildQuoteIndex, type QuoteIndex } from "./quoteIndex";

const building = new Map<string, Promise<QuoteIndex | null>>();
const ready = new Map<string, QuoteIndex>();

export function warmQuoteIndex(translation = "KJV"): Promise<QuoteIndex | null> {
  const key = translation.toUpperCase();
  const existing = building.get(key);
  if (existing) return existing;
  const task = (async () => {
    const data = await getRawBibleData(key);
    const index = await buildQuoteIndex(data, key);
    ready.set(key, index);
    return index;
  })().catch((error) => {
    building.delete(key);
    console.warn("[QuoteIndex] Build failed:", error);
    return null;
  });
  building.set(key, task);
  return task;
}

export function getReadyQuoteIndex(translation = "KJV"): QuoteIndex | null {
  return ready.get(translation.toUpperCase()) ?? null;
}

/** Test helper. */
export function resetQuoteIndexStore(): void {
  building.clear();
  ready.clear();
}
