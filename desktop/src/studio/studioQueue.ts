/**
 * studioQueue.ts — the plain rules behind the Studio's Verse AI lists (no React, so they are tested):
 *
 *  Detected     every reference the pastor actually said this session, newest last.
 *  Queue        the operator's working list: detected references plus verses added by hand.
 *               New detections are appended once; removing or reordering is the operator's call.
 *  Auto mode    projects a detected reference by itself only when it is certain (a spoken
 *               chapter AND verse, not a "possible match"), only once, and not more often than
 *               the cool-down allows. Suggestions are never projected automatically.
 */
import type { VoiceBibleCandidate } from "../services/voiceBibleTypes";

export function candidateKey(c: Pick<VoiceBibleCandidate, "book" | "chapter" | "verse" | "endVerse">): string {
  return `${c.book}|${c.chapter}|${c.verse}|${c.endVerse ?? ""}`;
}

/** Add candidates that are not in the list yet (and were not removed by the operator), newest first. */
export function appendNew(
  list: VoiceBibleCandidate[],
  incoming: VoiceBibleCandidate[],
  removed: ReadonlySet<string> = new Set(),
): VoiceBibleCandidate[] {
  const known = new Map(list.map((c) => [candidateKey(c), c]));
  const seen = new Set(known.keys());
  const added: VoiceBibleCandidate[] = [];
  const refreshed = new Set<string>();
  // The service lists newest first, and so does the queue: the latest verse is at the top.
  for (const c of incoming) {
    const key = candidateKey(c);
    if (removed.has(key) || refreshed.has(key)) continue;
    const old = known.get(key);
    // Said again later: it comes back to the top with its new time (and Auto mode can show it again).
    if (old && (c.detectedAt ?? 0) > (old.detectedAt ?? 0)) {
      refreshed.add(key);
      added.push(c);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(c);
  }
  if (added.length === 0) return list;
  return [...added, ...list.filter((c) => !refreshed.has(candidateKey(c)))];
}

/** Move one entry from `from` to `to` (both indexes in the list). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/** Spoken references come back at full confidence; a chapter alone is 0.9; quote matches are lower. */
export const AUTO_MIN_CONFIDENCE = 0.97;
export const AUTO_COOLDOWN_MS = 4000;

/** A reference Auto mode may put on the screen by itself. */
export function isAutoProjectable(c: VoiceBibleCandidate): boolean {
  return c.source !== "fuzzy"
    && Number.isFinite(c.confidence)
    && c.confidence >= AUTO_MIN_CONFIDENCE
    && Number.isInteger(c.verse)
    && c.verse > 0;
}

/** Identifies one mention: the same verse said again later is a new mention. */
export function mentionKey(c: VoiceBibleCandidate): string {
  return `${candidateKey(c)}@${typeof c.detectedAt === "number" ? c.detectedAt : 0}`;
}

export interface AutoTarget {
  book: string;
  chapter: number;
  verse: number;
  endVerse?: number;
  translation: string;
  /** Keys of every candidate this target covers (a spoken passage arrives as one per verse). */
  keys: string[];
  label: string;
}

export interface AutoState {
  /** Only detections after this moment count (when Auto mode was switched on). */
  since: number;
  /** When Auto mode last projected something. */
  lastAt: number;
  /** Candidates already handled (projected, or passed over because a newer one came in). */
  handled: ReadonlySet<string>;
}

export interface AutoDecision {
  /** Project this now (null = nothing to do). */
  target: AutoTarget | null;
  /** Wait this long and ask again (cool-down still running). 0 = no need. */
  retryInMs: number;
  /** Keys to mark handled even if nothing is projected (older detections a newer one replaced). */
  skip: string[];
}

/**
 * Decide what Auto mode should project. Only the newest eligible detection is shown; older ones
 * that are still waiting are passed over (they stay in the Queue for a manual click). Verses of one
 * spoken passage ("John 3:16 to 18") arrive together and are projected as one range.
 */
export function decideAutoProjection(detected: VoiceBibleCandidate[], state: AutoState, now: number): AutoDecision {
  const eligible = detected.filter((c) => {
    const at = typeof c.detectedAt === "number" ? c.detectedAt : 0;
    return at >= state.since && !state.handled.has(mentionKey(c)) && isAutoProjectable(c);
  });
  if (eligible.length === 0) return { target: null, retryInMs: 0, skip: [] };
  const wait = state.lastAt + AUTO_COOLDOWN_MS - now;
  if (state.lastAt > 0 && wait > 0) return { target: null, retryInMs: wait, skip: [] };

  const newestAt = Math.max(...eligible.map((c) => c.detectedAt ?? 0));
  const newest = eligible.filter((c) => (c.detectedAt ?? 0) === newestAt);
  const first = newest[0];
  const sameChapter = newest.filter((c) => c.book === first.book && c.chapter === first.chapter);
  const verses = sameChapter.map((c) => c.verse).sort((a, b) => a - b);
  const consecutive = verses.every((v, i) => i === 0 || v === verses[i - 1] + 1);
  const start = consecutive ? verses[0] : first.verse;
  const end = consecutive ? Math.max(verses[verses.length - 1], ...sameChapter.map((c) => c.endVerse ?? c.verse)) : (first.endVerse ?? first.verse);
  const covered = consecutive ? sameChapter : [first];
  const keys = covered.map(mentionKey);
  const skip = eligible.map(mentionKey).filter((k) => !keys.includes(k));
  return {
    target: {
      book: first.book,
      chapter: first.chapter,
      verse: start,
      endVerse: end > start ? end : undefined,
      translation: first.translation,
      keys,
      label: end > start ? `${first.book} ${first.chapter}:${start}-${end}` : `${first.book} ${first.chapter}:${start}`,
    },
    retryInMs: 0,
    skip,
  };
}

const STOP = new Set([
  "the", "and", "that", "this", "with", "for", "you", "your", "his", "her", "him", "they", "them", "their", "our",
  "unto", "shall", "will", "have", "has", "had", "was", "were", "are", "but", "not", "all", "from", "which", "what",
  "when", "who", "into", "upon", "there", "thee", "thou", "thy", "ye", "hath", "him", "its", "it's", "be", "is",
  "of", "to", "in", "a", "an", "it", "he", "she", "we", "i", "my", "me", "so", "as", "at", "by", "on", "or", "if",
  "do", "did", "no", "up", "out", "then", "than", "also", "even", "let", "say", "said", "says", "about", "just",
]);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).map((w) => w.replace(/'s$/, "").replace(/'/g, ""));
}

function stem(word: string): string {
  return word.replace(/(eth|est|ing|ed|es|s)$/, "");
}

/**
 * Why a suggestion showed up: the words it shares with what was just said
 * ("Matches: power, able, imagine"). Plain word overlap, nothing clever.
 */
export function suggestionReason(candidate: Pick<VoiceBibleCandidate, "snippet">, spoken: string, max = 4): string {
  const said = new Map<string, string>();
  for (const w of words(spoken)) if (w.length > 2 && !STOP.has(w)) said.set(stem(w), w);
  const shared: string[] = [];
  const seen = new Set<string>();
  for (const w of words(candidate.snippet || "")) {
    if (w.length <= 2 || STOP.has(w)) continue;
    const s = stem(w);
    if (said.has(s) && !seen.has(s)) {
      seen.add(s);
      shared.push(said.get(s) as string);
    }
    if (shared.length >= max) break;
  }
  return shared.length ? `Matches: ${shared.join(", ")}` : "Close in meaning to what was said";
}
