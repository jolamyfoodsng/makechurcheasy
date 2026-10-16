/**
 * useSlideshow.ts — picture and video slideshows in the Studio (like Holyrics' slide show).
 *
 * The operator selects several pictures (or several videos) in Media and starts a slideshow.
 *   • Pictures move on every N seconds (3–60 s).
 *   • Videos move on when the video ends (its length is read from the file when the
 *     library doesn't know it).
 * Controls: play / pause, previous, next, restart, jump to any item, loop, shuffle, stop.
 * Stopping keeps the place, so the operator can resume where it stopped or start over.
 * Each item goes to the screen through the Studio's normal projection (`project`).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type SlideshowKind = "image" | "video";

export interface SlideshowState {
  /** Media ids in the order the operator selected them. */
  ids: string[];
  kind: SlideshowKind;
  /** Play order: positions into `ids` (shuffled when shuffle is on). */
  order: number[];
  /** Position in `order` of the item on the screen. */
  pos: number;
  playing: boolean;
  /** Pictures: seconds per picture. */
  intervalSec: number;
  loop: boolean;
  shuffle: boolean;
  /** True after the last item when loop is off. */
  finished: boolean;
}

export interface SlideshowOptions {
  /** Put one media item on the screen. `asSlideshowVideo` = don't loop the video. */
  project: (id: string, kind: SlideshowKind) => void | Promise<unknown>;
  /** Length of a video in seconds, when known (library value or read from the file). */
  durationOf: (id: string) => Promise<number | undefined>;
  /** Pause / resume the video on the screen (video slideshows). */
  onVideoPaused?: (paused: boolean) => void;
}

export const SLIDESHOW_INTERVALS = [3, 5, 8, 10, 15, 20, 30, 60];
const PREFS_KEY = "mce-studio-slideshow-prefs";
/** Used for a video whose length can't be read. */
const VIDEO_FALLBACK_SEC = 30;

function readPrefs(): { intervalSec: number; loop: boolean; shuffle: boolean } {
  const fallback = { intervalSec: 5, loop: true, shuffle: false };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as object) } : fallback;
  } catch {
    return fallback;
  }
}

function savePrefs(p: { intervalSec: number; loop: boolean; shuffle: boolean }): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function shuffled(n: number, first?: number): number[] {
  const list = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  if (first !== undefined) {
    const at = list.indexOf(first);
    if (at > 0) [list[0], list[at]] = [list[at], list[0]];
  }
  return list;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function useSlideshow({ project, durationOf, onVideoPaused }: SlideshowOptions) {
  const [show, setShow] = useState<SlideshowState | null>(null);
  /** Where the last slideshow stopped, so it can be resumed. */
  const [resume, setResume] = useState<{ ids: string[]; index: number } | null>(null);
  const prefs = useRef(readPrefs());

  // Time left on the current item, so pause / resume continues instead of starting over.
  const remainingMs = useRef<number | null>(null);
  const deadline = useRef(0);
  const [progressKey, setProgressKey] = useState(0);

  const projectRef = useRef(project);
  projectRef.current = project;
  const durationRef = useRef(durationOf);
  durationRef.current = durationOf;
  const pausedRef = useRef(onVideoPaused);
  pausedRef.current = onVideoPaused;

  const currentId = show ? show.ids[show.order[show.pos]] : undefined;

  // Actions read the latest state from a ref and project once (never inside a state updater,
  // which React may run twice).
  const showRef = useRef<SlideshowState | null>(null);
  showRef.current = show;
  const commit = useCallback((next: SlideshowState | null) => {
    showRef.current = next;
    setShow(next);
  }, []);

  const showAt = useCallback((state: SlideshowState, pos: number) => {
    const id = state.ids[state.order[pos]];
    remainingMs.current = null;
    if (id) void projectRef.current(id, state.kind);
    setProgressKey((k) => k + 1);
    commit({ ...state, pos, finished: false });
  }, [commit]);

  /** Start a slideshow with these items (in this order), at `startIndex` (an index into ids). */
  const start = useCallback((ids: string[], kind: SlideshowKind, startIndex = 0) => {
    if (!ids.length) return;
    const p = prefs.current;
    const first = Math.min(Math.max(0, startIndex), ids.length - 1);
    const order = p.shuffle ? shuffled(ids.length, first) : ids.map((_, i) => i);
    setResume(null);
    showAt({
      ids, kind, order, pos: 0, playing: true,
      intervalSec: p.intervalSec, loop: p.loop, shuffle: p.shuffle, finished: false,
    }, p.shuffle ? 0 : first);
  }, [showAt]);

  const goTo = useCallback((pos: number) => {
    const s = showRef.current;
    if (!s) return;
    if (s.kind === "video" && !s.playing) pausedRef.current?.(false);
    showAt({ ...s, playing: true }, Math.min(Math.max(0, pos), s.order.length - 1));
  }, [showAt]);

  const next = useCallback(() => {
    const s = showRef.current;
    if (!s) return;
    if (s.pos + 1 < s.order.length) showAt(s, s.pos + 1);
    else if (s.loop) showAt(s.shuffle ? { ...s, order: shuffled(s.ids.length) } : s, 0);
    else commit({ ...s, playing: false, finished: true });
  }, [showAt, commit]);

  const prev = useCallback(() => {
    const s = showRef.current;
    if (!s) return;
    if (s.pos > 0) showAt(s, s.pos - 1);
    else showAt(s, s.loop ? s.order.length - 1 : 0);
  }, [showAt]);

  /** Back to the first item and play. */
  const restart = useCallback(() => {
    const s = showRef.current;
    if (s) showAt({ ...s, playing: true }, 0);
  }, [showAt]);

  const pause = useCallback(() => {
    const s = showRef.current;
    if (!s || !s.playing) return;
    remainingMs.current = Math.max(0, deadline.current - Date.now());
    if (s.kind === "video") pausedRef.current?.(true);
    commit({ ...s, playing: false });
  }, [commit]);

  const play = useCallback(() => {
    const s = showRef.current;
    if (!s) return;
    if (s.finished) { showAt({ ...s, playing: true }, 0); return; }
    if (s.playing) return;
    if (s.kind === "video") pausedRef.current?.(false);
    commit({ ...s, playing: true });
  }, [showAt, commit]);

  /** End the slideshow. What is on the screen stays; the place is kept for "Resume". */
  const stop = useCallback(() => {
    const s = showRef.current;
    if (!s) return;
    setResume({ ids: s.ids, index: s.order[s.pos] ?? 0 });
    remainingMs.current = null;
    commit(null);
  }, [commit]);

  const setIntervalSec = useCallback((sec: number) => {
    prefs.current = { ...prefs.current, intervalSec: sec };
    savePrefs(prefs.current);
    remainingMs.current = null;
    const s = showRef.current;
    if (s) commit({ ...s, intervalSec: sec });
    setProgressKey((k) => k + 1);
  }, [commit]);

  const setLoop = useCallback((loop: boolean) => {
    prefs.current = { ...prefs.current, loop };
    savePrefs(prefs.current);
    const s = showRef.current;
    if (s) commit({ ...s, loop });
  }, [commit]);

  const setShuffle = useCallback((shuffle: boolean) => {
    prefs.current = { ...prefs.current, shuffle };
    savePrefs(prefs.current);
    const s = showRef.current;
    if (!s) return;
    const currentIndex = s.order[s.pos];
    // Keep the item on the screen; reorder the rest.
    const order = shuffle ? shuffled(s.ids.length, currentIndex) : s.ids.map((_, i) => i);
    commit({ ...s, shuffle, order, pos: order.indexOf(currentIndex) });
  }, [commit]);

  /** The place a stopped slideshow of exactly these items can resume at (index into ids), or null. */
  const resumeIndexFor = useCallback((ids: string[]): number | null => (
    resume && sameSet(resume.ids, ids) ? resume.index : null
  ), [resume]);

  // The timer that moves to the next item.
  const [itemMs, setItemMs] = useState(0);
  useEffect(() => {
    if (!show?.playing || !currentId) return undefined;
    let cancelled = false;
    let timer = 0;
    const run = (fullMs: number) => {
      if (cancelled) return;
      setItemMs(fullMs);
      const wait = remainingMs.current ?? fullMs;
      deadline.current = Date.now() + wait;
      timer = window.setTimeout(() => { if (!cancelled) next(); }, wait);
    };
    if (show.kind === "image") {
      run(show.intervalSec * 1000);
    } else {
      void durationRef.current(currentId).then((sec) => run(((sec && sec > 0 ? sec : VIDEO_FALLBACK_SEC) + 0.4) * 1000));
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [show?.playing, show?.kind, show?.intervalSec, currentId, progressKey, next]);

  const timeLeft = useCallback((): number => {
    if (!show) return 0;
    if (show.playing) return Math.max(0, deadline.current - Date.now());
    return remainingMs.current ?? itemMs;
  }, [show, itemMs]);

  return {
    show,
    currentId,
    /** Full length of the item on the screen, ms (for the progress bar). */
    itemMs,
    /** Time left on the item on the screen, ms. */
    timeLeft,
    progressKey,
    start, stop, play, pause, next, prev, restart, goTo,
    setIntervalSec, setLoop, setShuffle,
    resumeIndexFor,
  };
}

/** Read a video's length from the file (when the library doesn't know it). */
export function probeVideoDuration(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let done = false;
    const finish = (value?: number) => {
      if (done) return;
      done = true;
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : undefined);
    video.onerror = () => finish(undefined);
    window.setTimeout(() => finish(undefined), 8000);
    video.src = url;
  });
}
