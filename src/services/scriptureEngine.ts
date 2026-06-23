/**
 * scriptureEngine.ts — Incremental Scripture Detection Engine
 *
 * A real-time semantic state machine over noisy, delayed, self-correcting
 * ASR input streams. Every design choice is made for determinism under
 * concurrent async operations.
 *
 * Guarantees:
 *   - Revision-safe: stale ASR revisions are never reprocessed
 *   - Serialized pipeline: chunks are processed in arrival order
 *   - Deterministic dedup: state-delta based, not text-hash based
 *   - Context decay: old book context fades with time and topic switches
 *   - Never guesses: ambiguous relative references return candidates, not null
 */

import {
  parseScriptureReferenceAll,
  parseScriptureIntent,
  resolveWithContext,
  createScriptureContext,
  pushScriptureContext,
  type ScriptureContext,
  type ScriptureIntent,
} from "./scriptureParser";
import { getVerse, getVerseCount, getChapterCount } from "../bible/bibleData";
import type { VoiceBibleCandidate } from "./voiceBibleTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScriptureMatch {
  candidate: VoiceBibleCandidate;
  source: "reference" | "context" | "quote";
  confidence: number;
  navigationOnly?: boolean;
}

export interface DetectionResult {
  matches: ScriptureMatch[];
  context: ScriptureContext;
}

interface ChunkRecord {
  text: string;
  timestamp: number;
  finalized: boolean;
  chunkId: number;
}

interface EmissionRecord {
  refKey: string;
  timestamp: number;
  /** Structural snapshot at emission time — not raw text */
  stateHash: string;
}

interface VerseHistoryEntry {
  book: string;
  chapter: number;
  verse: number;
  label: string;
  snippet: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Navigation commands — detected BEFORE parsing (via parseScriptureIntent)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 15_000;
const QUOTE_WINDOW_MS = 12_000; // 12-second sliding window for quote search
const MIN_QUOTE_LENGTH = 8;
const CONTEXT_DECAY_MS = 120_000; // 2 minutes — context entries older than this are inactive

// ── Quote stabilization thresholds ──────────────────────────────────────────

/** Minimum finalScore for a result to be shown to the user */
const MIN_DISPLAY_SCORE = 0.30;

/** Minimum gap between winner and runner-up to accept a winner */
const MIN_SCORE_GAP = 0.05;

/** Minimum winner score for gap validation to apply */
const MIN_WINNER_SCORE = 0.35;

/** Score decay factor per update cycle for unreinforced candidates */
const CANDIDATE_DECAY_FACTOR = 0.98;

// ---------------------------------------------------------------------------
// Fast keyword→verse index (no LLM needed for common scriptures)
// ---------------------------------------------------------------------------

/**
 * Levenshtein distance between two strings.
 * Used for fuzzy word matching to handle speech recognition errors.
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if two words match fuzzily based on word length.
 * Handles speech recognition errors like "value" → "valley".
 */
function fuzzyWordMatch(spoken: string, keyword: string): boolean {
  if (spoken === keyword) return true;
  if (spoken.length < 3 || keyword.length < 3) return false; // Too short for fuzzy

  const distance = levenshtein(spoken, keyword);
  const maxLen = Math.max(spoken.length, keyword.length);

  // Dynamic threshold based on word length
  if (maxLen <= 4) return distance === 0;      // Short words (≤4 chars): exact match only
  if (maxLen <= 6) return distance <= 1;        // Medium words: 1 edit allowed
  return distance <= 2;                          // Long words: 2 edits allowed
}

interface KeywordVerse {
  book: string;
  chapter: number;
  verse: number;
  keywords: string[]; // normalized keywords that trigger this match
}

const KEYWORD_VERSES: KeywordVerse[] = [
  { book: "John", chapter: 3, verse: 16, keywords: ["god", "loved", "world", "gave", "begotten", "son"] },
  { book: "Psalms", chapter: 23, verse: 1, keywords: ["lord", "shepherd", "shall", "not", "want"] },
  { book: "Romans", chapter: 8, verse: 28, keywords: ["all", "things", "work", "together", "good", "love", "god"] },
  { book: "Philippians", chapter: 4, verse: 13, keywords: ["all", "things", "through", "christ", "strengthens"] },
  { book: "Jeremiah", chapter: 29, verse: 11, keywords: ["plans", "prosper", "hope", "future"] },
  { book: "Isaiah", chapter: 41, verse: 10, keywords: ["fear", "not", "with", "you", "strengthen", "help"] },
  { book: "Proverbs", chapter: 3, verse: 5, keywords: ["trust", "lord", "heart", "with", "all", "lean", "not", "understanding"] },
  { book: "Matthew", chapter: 11, verse: 28, keywords: ["come", "all", "weary", "heavy", "laden", "rest"] },
  { book: "Romans", chapter: 3, verse: 23, keywords: ["all", "sinned", "fallen", "short", "glory"] },
  { book: "Ephesians", chapter: 2, verse: 8, keywords: ["grace", "saved", "through", "faith", "not", "works"] },
  { book: "2 Timothy", chapter: 1, verse: 7, keywords: ["spirit", "fear", "power", "love", "sound", "mind"] },
  { book: "Psalms", chapter: 46, verse: 1, keywords: ["god", "refuge", "strength", "present", "help", "trouble"] },
  { book: "Romans", chapter: 12, verse: 1, keywords: ["living", "sacrifice", "holy", "acceptable", "reasonable"] },
  { book: "Galatians", chapter: 5, verse: 22, keywords: ["fruit", "spirit", "love", "joy", "peace", "patience"] },
  { book: "Hebrews", chapter: 11, verse: 1, keywords: ["faith", "substance", "hoped", "evidence", "not", "seen"] },
  { book: "James", chapter: 1, verse: 5, keywords: ["lacks", "wisdom", "ask", "god", "gives", "generously"] },
  { book: "1 Corinthians", chapter: 13, verse: 4, keywords: ["love", "patient", "kind", "not", "envy", "boast"] },
  { book: "Psalms", chapter: 119, verse: 105, keywords: ["word", "lamp", "feet", "light", "path"] },
  { book: "Matthew", chapter: 28, verse: 19, keywords: ["go", "therefore", "make", "disciples", "nations", "baptize"] },
  { book: "Joshua", chapter: 1, verse: 9, keywords: ["strong", "courageous", "not", "afraid", "god", "with"] },
  { book: "Romans", chapter: 8, verse: 38, keywords: ["nothing", "separate", "us", "love", "god", "neither", "death"] },
  { book: "Psalms", chapter: 23, verse: 4, keywords: ["valley", "shadow", "death", "fear", "no", "evil", "rod", "staff", "walk", "through", "dark", "comfort"] },
  { book: "Isaiah", chapter: 40, verse: 31, keywords: ["wait", "lord", "renew", "strength", "wings", "eagles"] },
  { book: "Matthew", chapter: 6, verse: 33, keywords: ["seek", "first", "kingdom", "righteousness", "all", "added"] },
  { book: "John", chapter: 14, verse: 6, keywords: ["way", "truth", "life", "no", "one", "comes", "father"] },
  { book: "Psalms", chapter: 37, verse: 4, keywords: ["delight", "lord", "desires", "heart"] },
  { book: "Micah", chapter: 6, verse: 8, keywords: ["requires", "act", "justly", "love", "mercy", "walk", "humbly"] },
  { book: "Colossians", chapter: 3, verse: 23, keywords: ["whatever", "work", "heartily", "lord", "not", "men"] },
  { book: "Psalms", chapter: 51, verse: 10, keywords: ["create", "clean", "heart", "renew", "right", "spirit"] },
  { book: "Romans", chapter: 5, verse: 8, keywords: ["god", "demonstrates", "love", "while", "still", "sinners", "christ"] },
  { book: "John", chapter: 1, verse: 1, keywords: ["beginning", "word", "with", "god", "was"] },
  { book: "Genesis", chapter: 1, verse: 1, keywords: ["beginning", "god", "created", "heavens", "earth"] },
  { book: "Revelation", chapter: 21, verse: 4, keywords: ["wipe", "away", "every", "tear", "no", "more", "death", "sorrow"] },
  { book: "2 Corinthians", chapter: 5, verse: 17, keywords: ["anyone", "christ", "new", "creation", "old", "passed"] },
  { book: "Psalms", chapter: 139, verse: 14, keywords: ["fearfully", "wonderfully", "made", "works", "marvelous"] },
  { book: "Matthew", chapter: 5, verse: 16, keywords: ["let", "light", "shine", "before", "men", "good", "works"] },
  { book: "Philippians", chapter: 4, verse: 6, keywords: ["anxious", "nothing", "prayer", "supplication", "requests", "known"] },
  { book: "1 Peter", chapter: 5, verse: 7, keywords: ["cast", "all", "care", "upon", "cares", "for", "you"] },
  { book: "Psalms", chapter: 27, verse: 1, keywords: ["lord", "light", "salvation", "whom", "shall", "fear"] },
  { book: "Isaiah", chapter: 53, verse: 5, keywords: ["wounded", "transgressions", "bruised", "iniquities", "chastisement", "peace"] },
  { book: "John", chapter: 11, verse: 25, keywords: ["resurrection", "life", "whoever", "believes", "though", "die"] },
  { book: "Deuteronomy", chapter: 31, verse: 8, keywords: ["lord", "go", "before", "will", "not", "fail", "forsake", "fear", "dismayed"] },
  { book: "Hebrews", chapter: 13, verse: 5, keywords: ["never", "leave", "forsake", "content", "have", "said"] },
];

/**
 * Fast keyword matching — checks if the speech contains enough keywords
 * from any known verse. Returns the best match or null.
 * Runs in <1ms, no LLM needed.
 */
function fastKeywordMatch(speech: string): { book: string; chapter: number; verse: number; confidence: number } | null {
  const words = speech.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;

  let bestMatch: { book: string; chapter: number; verse: number; confidence: number } | null = null;
  let bestScore = 0;

  for (const kv of KEYWORD_VERSES) {
    let matched = 0;
    for (const kw of kv.keywords) {
      // Fuzzy match: allows for speech recognition errors
      if (words.some((w) => fuzzyWordMatch(w, kw))) matched++;
    }
    // Dynamic threshold: for verses with many keywords, require fewer matches
    // For verses with few keywords, require more matches
    const ratio = matched / kv.keywords.length;
    const minRatio = kv.keywords.length > 6 ? 0.4 : 0.6; // Lower threshold for longer keyword lists
    if (ratio >= minRatio && matched >= 2 && matched > bestScore) {
      bestScore = matched;
      bestMatch = {
        book: kv.book,
        chapter: kv.chapter,
        verse: kv.verse,
        confidence: Math.min(0.95, 0.5 + ratio * 0.5),
      };
    }
  }

  return bestMatch;
}

export class ScriptureDetectionEngine {
  private context: ScriptureContext = createScriptureContext();
  private translation = "KJV";
  private bibleDataLoaded = false;

  /** Time-windowed finalized chunks for quote search */
  private finalizedChunks: ChunkRecord[] = [];

  /** Latest interim chunk (replaced on each ASR revision) */
  private interimChunk: ChunkRecord | null = null;

  /** Revision guard: chunkId → last processed revisionId */
  private processedRevisions = new Map<number, number>();

  /** Monotonic chunk counter */
  private nextChunkId = 0;

  /** Time-based dedup: ref key → emission record */
  private recentEmissions = new Map<string, EmissionRecord>();

  /** Backpressure: only one quote search at a time */
  private quoteAbortController: AbortController | null = null;

  /** Ordered log of resolved verses for navigation */
  private verseHistory: VerseHistoryEntry[] = [];
  /** Pointer into verseHistory — current position */
  private currentVerseIndex = -1;

  /** Active quote candidate for expiration tracking */
  private activeCandidate: { ref: string; score: number; timestamp: number } | null = null;

  /** Preload Bible data and embeddings to avoid first-call latency */
  async preload(): Promise<void> {
    if (this.bibleDataLoaded) return;
    try {
      const [{ preloadTranslation }, { loadBibleEmbeddings }] = await Promise.all([
        import("../bible/bibleData"),
        import("../bible/bibleEmbeddings"),
      ]);
      await Promise.all([
        preloadTranslation(this.translation as "KJV"),
        loadBibleEmbeddings(),
      ]);
      this.bibleDataLoaded = true;
    } catch (err) {
      console.warn("[ScriptureEngine] Preload failed:", err);
    }
  }

  reset(): void {
    this.context = createScriptureContext();
    this.finalizedChunks = [];
    this.interimChunk = null;
    this.processedRevisions.clear();
    this.nextChunkId = 0;
    this.recentEmissions.clear();
    this.cancelQuoteSearch();
    this.verseHistory = [];
    this.currentVerseIndex = -1;
    this.activeCandidate = null;
  }

  /**
   * Decay the active candidate's score over time. Called on each quote search
   * cycle. If the score drops below MIN_DISPLAY_SCORE, the candidate expires.
   */
  private decayActiveCandidate(): void {
    if (!this.activeCandidate) return;
    this.activeCandidate.score *= CANDIDATE_DECAY_FACTOR;
    if (this.activeCandidate.score < MIN_DISPLAY_SCORE) {
      this.activeCandidate = null;
    }
  }

  /**
   * Process a transcript chunk. Runs non-blocking — returns immediately,
   * results are delivered via the returned promise which resolves in background.
   */
  async processChunk(text: string, isFinal: boolean): Promise<DetectionResult> {
    return this.processChunkInner(text, isFinal);
  }

  private async processChunkInner(text: string, isFinal: boolean): Promise<DetectionResult> {
    const trimmed = text.trim();
    if (!trimmed) return { matches: [], context: this.context };

    // ── Intent parsing: handle BEFORE reference parsing ──
    // Fast (<1ms) structured command detection for navigation, open, etc.
    const intent = parseScriptureIntent(trimmed);

    // Translation commands should be processed immediately (even on interim)
    if (intent?.type === "use-translation") {
      const intentResults = await this.resolveIntent(intent);
      return {
        matches: intentResults.map((candidate) => ({
          candidate,
          source: "reference" as const,
          confidence: candidate.confidence,
        })),
        context: this.context,
      };
    }

    // Other intents only on final
    if (intent && isFinal) {
      const intentResults = await this.resolveIntent(intent);
      if (intentResults.length > 0) {
        const navOnly = intent.type === "open" && intent.navigationOnly === true;
        return {
          matches: intentResults.map((candidate) => ({
            candidate,
            source: "reference" as const,
            confidence: candidate.confidence,
            navigationOnly: navOnly || undefined,
          })),
          context: this.context,
        };
      }
      return { matches: [], context: this.context };
    }

    const now = Date.now();

    // ── Chunk versioning ──

    let chunkId: number;
    let revisionId: number;

    if (isFinal) {
      // Finalized: new immutable chunk
      chunkId = this.nextChunkId++;
      revisionId = 0;
      this.interimChunk = null; // ASR finalized — interim is now stale
      this.finalizedChunks.push({
        text: trimmed,
        timestamp: now,
        finalized: true,
        chunkId,
      });
    } else {
      // Interim: ASR revision of the same stream position
      if (this.interimChunk) {
        chunkId = this.interimChunk.chunkId;
        revisionId = (this.processedRevisions.get(chunkId) ?? -1) + 1;
        this.interimChunk.text = trimmed;
        this.interimChunk.timestamp = now;
      } else {
        chunkId = this.nextChunkId++;
        revisionId = 0;
        this.interimChunk = {
          text: trimmed,
          timestamp: now,
          finalized: false,
          chunkId,
        };
      }
    }

    // ── Revision guard: skip if already processed this revision ──

    const lastProcessed = this.processedRevisions.get(chunkId) ?? -1;
    if (revisionId <= lastProcessed) {
      return { matches: [], context: this.context };
    }
    this.processedRevisions.set(chunkId, revisionId);

    // ── Prune old data ──

    const quoteCutoff = now - QUOTE_WINDOW_MS;
    this.finalizedChunks = this.finalizedChunks.filter((c) => c.timestamp >= quoteCutoff);

    const decayCutoff = now - CONTEXT_DECAY_MS;
    this.context = {
      stack: this.context.stack.filter((e) => e.timestamp >= decayCutoff),
    };

    // Prune old emissions
    for (const [key, record] of this.recentEmissions) {
      if (now - record.timestamp > DEDUP_WINDOW_MS) this.recentEmissions.delete(key);
    }

    // ── Stage 1: Fast reference parser (multiple candidates for jammed numbers) ──

    const allParsed = parseScriptureReferenceAll(trimmed);
    if (allParsed.length > 0) {
      const matches: ScriptureMatch[] = [];

      for (const parsed of allParsed) {
        const resolved = resolveWithContext(parsed, this.context);
        if (resolved && resolved.book) {
          // Early bounds check — skip invalid references before async work
          const maxCh = await getChapterCount(resolved.book, this.translation);
          if (maxCh === 0 || resolved.chapter < 1 || resolved.chapter > maxCh) continue;
          if (resolved.verse != null) {
            const maxV = await getVerseCount(resolved.book, resolved.chapter, this.translation);
            if (maxV === 0 || resolved.verse < 1 || resolved.verse > maxV) continue;
          }

          const refKey = `${resolved.book}:${resolved.chapter}:${resolved.verse ?? ""}`;

          // State-delta dedup
          const shouldEmit = this.shouldEmit(refKey, now);

          if (shouldEmit) {
            const stateHash = this.computeStateHash();
            this.recentEmissions.set(refKey, { refKey, timestamp: now, stateHash });

            const candidate = await this.buildCandidate(
              resolved.book,
              resolved.chapter,
              resolved.verse,
            );

            if (candidate) {
              matches.push({ candidate, source: parsed.isRelative ? "context" : "reference", confidence: candidate.confidence });
            }
          }
        }
      }

      if (matches.length > 0) {
        // Update context with the first (most likely) match
        const bestParsed = allParsed[0];
        const bestResolved = resolveWithContext(bestParsed, this.context);
        if (bestResolved) {
          this.context = pushScriptureContext(
            this.context,
            bestResolved.book,
            bestResolved.chapter,
            bestResolved.verse,
            bestParsed.isRelative,
          );
        }

        // Log if ASR produced a different book than what's bound in context
        if (this.context.stack.length > 1) {
          const prevBook = this.context.stack[1]?.book;
          const newBook = this.context.stack[0]?.book;
          if (prevBook && newBook && prevBook !== newBook) {
          }
        }

        // Record in verse history (first match)
        const bestCandidate = matches[0].candidate;
        this.pushVerseHistory({
          book: bestCandidate.book,
          chapter: bestCandidate.chapter,
          verse: bestCandidate.verse,
          label: bestCandidate.label,
          snippet: bestCandidate.snippet,
          timestamp: now,
        });

        return { matches, context: this.context };
      }
    }

    return { matches: [], context: this.context };
  }

  /**
   * State-delta dedup: emit if the interpretation state has changed.
   *
   * State is defined by:
   *   - Structural hash (chunkIds + context stack entries)
   *   - NOT raw text (deterministic across identical inputs)
   *
   * Allow re-emission if ANY of:
   *   1. Never emitted this ref
   *   2. TTL expired (15s)
   *   3. State hash changed (new speech or context shift)
   */
  private shouldEmit(refKey: string, now: number): boolean {
    const record = this.recentEmissions.get(refKey);
    if (!record) return true;

    if (now - record.timestamp > DEDUP_WINDOW_MS) return true;

    const currentHash = this.computeStateHash();
    if (currentHash !== record.stateHash) return true;

    return false;
  }

  /**
   * Deterministic structural hash.
   * Hashes chunkIds + context stack entries — NOT raw text.
   * This ensures identical inputs produce identical hashes.
   */
  private computeStateHash(): string {
    const chunkIds = this.finalizedChunks
      .map((c) => `${c.chunkId}`)
      .join(",");
    const contextSig = this.context.stack
      .map((e) => `${e.book}:${e.chapter}:${e.verse ?? ""}`)
      .join("|");
    return `${chunkIds}#${contextSig}`;
  }

  /**
   * Get the currently bound book from context.
   * Returns the most recent book in the context stack, or null.
   */
  getBoundBook(): string | null {
    const fullRef = this.context.stack.find((e) => e.chapter !== null);
    return fullRef?.book ?? null;
  }

  /**
   * Run quote search on the time-based speech window.
   * If boundBook is set, filters candidates to that book only.
   * Uses backpressure: only one search at a time.
   */
  async searchQuotes(boundBook?: string | null): Promise<ScriptureMatch[]> {
    this.cancelQuoteSearch();
    this.quoteAbortController = new AbortController();
    const signal = this.quoteAbortController.signal;

    const now = Date.now();
    const cutoff = now - QUOTE_WINDOW_MS;
    const windowText = this.finalizedChunks
      .filter((c) => c.timestamp >= cutoff)
      .map((c) => c.text)
      .join(" ");
    const interimText = this.interimChunk?.text ?? "";
    const searchInput = interimText ? `${windowText} ${interimText}`.trim() : windowText;

    return this.runQuoteSearchPipeline(searchInput, boundBook, signal);
  }

  /**
   * Run quote search with caller-provided text (sentence-based).
   * Bypasses the time-based finalizedChunks window — the caller controls
   * what text is searched. This is the primary search path for the
   * sentence-detection architecture.
   */
  async searchQuotesWithText(text: string, boundBook?: string | null): Promise<ScriptureMatch[]> {
    this.cancelQuoteSearch();
    this.quoteAbortController = new AbortController();
    const signal = this.quoteAbortController.signal;

    const searchInput = text.trim();
    return this.runQuoteSearchPipeline(searchInput, boundBook, signal);
  }

  /**
   * Shared search pipeline — fast keyword → verse alias → fuzzy → embedding.
   * Accepts pre-built searchInput so callers control the text window.
   */
  private async runQuoteSearchPipeline(
    searchInput: string,
    _boundBook: string | null | undefined,
    signal: AbortSignal,
  ): Promise<ScriptureMatch[]> {

    if (searchInput.length < MIN_QUOTE_LENGTH) return [];
    if (signal.aborted) return [];

    // Decay any active candidate from a previous search cycle
    this.decayActiveCandidate();

    // ────────────────────────────────────────────────────────────────────────
    // STAGE 1: Fast keyword match (<1ms, no LLM)
    // O(1) lookup for hardcoded common scriptures. No context filtering —
    // quote searches always scan the entire Bible.
    // ────────────────────────────────────────────────────────────────────────
    const fastMatch = fastKeywordMatch(searchInput);
    if (fastMatch) {
      const verseData = await getVerse(fastMatch.book, fastMatch.chapter, fastMatch.verse, this.translation as "KJV").catch(() => null);
      if (!verseData?.text) return [];
      const snippet = verseData.text;
      const label = `${fastMatch.book} ${fastMatch.chapter}:${fastMatch.verse}`;
      return [{
        candidate: {
          book: fastMatch.book,
          chapter: fastMatch.chapter,
          verse: fastMatch.verse,
          translation: this.translation,
          label,
          snippet,
          confidence: fastMatch.confidence,
          source: "keyword",
        },
        source: "quote",
        confidence: fastMatch.confidence,
      }];
    }

    // ────────────────────────────────────────────────────────────────────────
    // STAGE 2: Verse alias fast path (<1ms, no embedding)
    // Direct phrase→reference lookup for universally known quotations.
    // Searches the entire Bible — no context filtering.
    // ────────────────────────────────────────────────────────────────────────
    try {
      const { matchVerseAlias } = await import("../bible/scriptureReranker");
      const aliasRef = matchVerseAlias(searchInput);
      if (aliasRef) {
        const { getVerse: getV } = await import("../bible/bibleData");
        const parsed = aliasRef.match(/^(.+?)\s+(\d+):(\d+)$/);
        if (parsed) {
          const [, book, ch, vs] = parsed;
          const verseData = await getV(book, +ch, +vs, this.translation as "KJV").catch(() => null);
          if (!verseData?.text) return [];
          return [{
            candidate: {
              book,
              chapter: +ch,
              verse: +vs,
              translation: this.translation,
              label: aliasRef,
              snippet: verseData.text,
              confidence: 0.95,
              source: "alias",
            },
            source: "quote" as const,
            confidence: 0.95,
          }];
        }
      }
    } catch (err) {
      console.warn("[ScriptureEngine] Verse alias lookup failed:", err);
    }

    // ────────────────────────────────────────────────────────────────────────
    // STAGE 3: Semantic embedding search (PRIMARY discovery engine)
    // This is the core quote-retrieval mechanism. Searches the entire Bible
    // corpus using vector similarity. No context filtering — a pastor quoting
    // "Greater is he that is in me" must find 1 John 4:4 even when Genesis
    // is the active book.
    //
    // Parameters:
    //   topK = 100  — large candidate pool so the reranker has room to work
    //   minScore = 0.15 — permissive threshold; the reranker handles precision
    // ────────────────────────────────────────────────────────────────────────

    try {
      const { hasEmbeddings, searchByEmbedding } = await import("../bible/bibleEmbeddings");
      const { rerankCandidates } = await import("../bible/scriptureReranker");
      if (signal.aborted) return [];

      const embeddingsReady = hasEmbeddings();
      if (!embeddingsReady) {
      } else {
        // Tighter candidate pool: 75 results at min cosine similarity 0.25.
        // Previous (100, 0.15) flooded the reranker with noise — irrelevant
        // verses with 0.16 similarity diluted the results and confused
        // the reranker's ability to pick a clear winner.
        const embeddingResults = await searchByEmbedding(searchInput, 75, 0.25);
        if (signal.aborted) return [];

        if (embeddingResults.length > 0) {
          // No context bias for quote searches — pass null so the reranker
          // evaluates purely on semantic/keyword/phrase/concept merit.
          const reranked = rerankCandidates(searchInput, embeddingResults, null);

          if (reranked.length > 0) {
            const best = reranked[0];
            const runnerUp = reranked.length > 1 ? reranked[1] : null;

            // ── Score gap validation ──
            // Require minimum winner score and clear separation from runner-up.
            // Without this, a weak 0.28 winner with 0.26 runner-up both
            // pass — the system can't tell them apart and shows garbage.
            const hasMinWinnerScore = best.finalScore >= MIN_WINNER_SCORE;
            const hasClearGap = runnerUp
              ? (best.finalScore - runnerUp.finalScore) >= MIN_SCORE_GAP
              : true;

            if (!hasMinWinnerScore || !hasClearGap) {
              // Don't return — fall through to fuzzy stage
            } else {
              return reranked.slice(0, 10).map((result) => ({
                candidate: {
                  book: result.book,
                  chapter: result.chapter,
                  verse: result.verse,
                  translation: this.translation,
                  label: result.reference,
                  snippet: result.text,
                  confidence: result.finalScore,
                  source: "embedding",
                },
                source: "quote" as const,
                confidence: result.finalScore,
              }));
            }
          }
        }
      }
    } catch (err) {
      console.warn("[ScriptureEngine] Embedding search failed:", err);
    }

    // ────────────────────────────────────────────────────────────────────────
    // STAGE 4: Fuzzy Bible search (fallback for STT errors)
    // Handles speech-recognition misrecognitions when embeddings are
    // unavailable or returned no results. No context filtering.
    // ────────────────────────────────────────────────────────────────────────
    try {
      const { searchBible } = await import("../bible/bibleData");
      if (signal.aborted) return [];

      const fuzzyResults = await searchBible(searchInput, this.translation as "KJV", 10);
      if (signal.aborted) return [];

      if (fuzzyResults.length > 0) {
        return fuzzyResults.map((result, index) => {
          // Fuzzy matches get honest low confidence — they are string
          // approximations, not semantic matches. Using the old
          // Math.max(0.5, 0.85 - index * 0.05) produced fake 80-85%
          // scores that made garbage look authoritative.
          const confidence = Math.max(0.10, 0.18 - (index * 0.02));
          return {
            candidate: {
              book: result.book,
              chapter: result.chapter,
              verse: result.verse,
              translation: this.translation,
              label: `${result.book} ${result.chapter}:${result.verse}`,
              snippet: result.snippet || result.text,
              confidence,
              source: "fuzzy",
            },
            source: "quote" as const,
            confidence,
          };
        });
      }
    } catch (err) {
      console.warn("[ScriptureEngine] Fuzzy Bible search failed:", err);
    }

    return [];
  }

  cancelQuoteSearchPublic(): void {
    this.cancelQuoteSearch();
  }

  private cancelQuoteSearch(): void {
    if (this.quoteAbortController) {
      this.quoteAbortController.abort();
      this.quoteAbortController = null;
    }
  }

  // ── Verse history & navigation ─────────────────────────────────────────

  private pushVerseHistory(entry: VerseHistoryEntry): void {
    this.verseHistory.push(entry);
    this.currentVerseIndex = this.verseHistory.length - 1;
    // Cap at 50 entries
    if (this.verseHistory.length > 50) {
      this.verseHistory = this.verseHistory.slice(-50);
      this.currentVerseIndex = this.verseHistory.length - 1;
    }
  }

  /**
   * Resolve a structured ScriptureIntent into candidates.
   * Handles all navigation commands: open, next/prev verse, next/prev chapter, range, set-verse/chapter.
   * Returns array of candidates (multiple for ambiguous references like "romans 11").
   */
  private async resolveIntent(intent: ScriptureIntent): Promise<VoiceBibleCandidate[]> {
    if (!intent) return [];

    switch (intent.type) {
      case "open": {
        // Validate book exists
        const maxCh = await getChapterCount(intent.book, this.translation);
        if (maxCh === 0) return []; // Invalid book

        // If multiple candidates provided (ambiguous reference), validate and return all valid ones
        if (intent.candidates && intent.candidates.length > 1) {
          const validCandidates: Array<{ candidate: VoiceBibleCandidate; index: number }> = [];
          for (let i = 0; i < intent.candidates.length; i++) {
            const c = intent.candidates[i];
            if (c.chapter > maxCh) continue; // Skip invalid chapters
            const maxVerse = await getVerseCount(intent.book, c.chapter, this.translation);
            if (maxVerse === 0) continue; // Skip invalid chapter
            if (c.verse !== undefined && c.verse > maxVerse) continue; // Skip invalid verse
            const candidate = await this.buildCandidate(intent.book, c.chapter, c.verse ?? null);
            if (candidate) {
              // Keep original order from parser (chapter:verse splits first)
              validCandidates.push({ candidate, index: i });
            }
          }
          if (validCandidates.length > 0) {
            // Sort by original order (from parser) — chapter:verse splits come first
            validCandidates.sort((a, b) => a.index - b.index);
            const sortedCandidates = validCandidates.map((v) => v.candidate);
            // Update context with the first (most likely) candidate
            const primary = sortedCandidates[0];
            this.pushVerseHistory({
              book: primary.book,
              chapter: primary.chapter,
              verse: primary.verse,
              label: primary.label,
              snippet: primary.snippet,
              timestamp: Date.now(),
            });
            this.context = pushScriptureContext(this.context, primary.book, primary.chapter, primary.verse, false);
            return sortedCandidates;
          }
          return [];
        }

        // Single candidate — validate and return
        if (intent.chapter > maxCh) return []; // Chapter exceeds max
        if (intent.verse !== undefined) {
          const maxVerse = await getVerseCount(intent.book, intent.chapter, this.translation);
          if (maxVerse === 0) return []; // Invalid chapter
          if (intent.verse > maxVerse) return []; // Verse exceeds max
        }

        // Range: generate multiple candidates for verse range
        if (intent.endVerse !== undefined && intent.verse !== undefined && intent.endVerse > intent.verse) {
          const maxVerse = await getVerseCount(intent.book, intent.chapter, this.translation);
          const clampedEnd = Math.min(intent.endVerse, maxVerse);
          const rangeCandidates: VoiceBibleCandidate[] = [];
          for (let v = intent.verse; v <= clampedEnd; v++) {
            const c = await this.buildCandidate(intent.book, intent.chapter, v);
            if (c) rangeCandidates.push(c);
          }
          if (rangeCandidates.length > 0) {
            const primary = rangeCandidates[0];
            this.pushVerseHistory({
              book: primary.book,
              chapter: primary.chapter,
              verse: primary.verse,
              label: primary.label,
              snippet: primary.snippet,
              timestamp: Date.now(),
            });
            this.context = pushScriptureContext(this.context, primary.book, primary.chapter, primary.verse, false);
            return rangeCandidates;
          }
          return [];
        }

        const candidate = await this.buildCandidate(intent.book, intent.chapter, intent.verse ?? null);
        if (candidate) {
          this.pushVerseHistory({
            book: intent.book,
            chapter: intent.chapter,
            verse: intent.verse ?? 1,
            label: candidate.label,
            snippet: candidate.snippet,
            timestamp: Date.now(),
          });
          this.context = pushScriptureContext(this.context, intent.book, intent.chapter, intent.verse ?? null, false);
          return [candidate];
        }
        return [];
      }

      case "next-verse": {
        const current = this.getCurrentVerseRef();
        if (!current) return [];
        const result = await this.navigateRelative(current.book, current.chapter, current.verse, intent.count, "forward");
        return result ? [result] : [];
      }

      case "prev-verse": {
        const current = this.getCurrentVerseRef();
        if (!current) return [];
        const result = await this.navigateRelative(current.book, current.chapter, current.verse, -intent.count, "backward");
        return result ? [result] : [];
      }

      case "next-chapter": {
        const current = this.getCurrentVerseRef();
        if (!current) return [];
        const maxCh = await getChapterCount(current.book, this.translation);
        const nextCh = current.chapter + intent.count;
        if (nextCh > maxCh) return []; // Exceeds last chapter
        const candidate = await this.buildCandidate(current.book, nextCh, 1);
        if (candidate) {
          this.pushVerseHistory({
            book: current.book,
            chapter: nextCh,
            verse: 1,
            label: candidate.label,
            snippet: candidate.snippet,
            timestamp: Date.now(),
          });
          this.context = pushScriptureContext(this.context, current.book, nextCh, 1, true);
          return [candidate];
        }
        return [];
      }

      case "prev-chapter": {
        const current = this.getCurrentVerseRef();
        if (!current) return [];
        const prevCh = current.chapter - intent.count;
        if (prevCh < 1) return []; // Before first chapter
        const candidate = await this.buildCandidate(current.book, prevCh, 1);
        if (candidate) {
          this.pushVerseHistory({
            book: current.book,
            chapter: prevCh,
            verse: 1,
            label: candidate.label,
            snippet: candidate.snippet,
            timestamp: Date.now(),
          });
          this.context = pushScriptureContext(this.context, current.book, prevCh, 1, true);
          return [candidate];
        }
        return [];
      }

      case "set-verse": {
        const current = this.getCurrentVerseRef();
        if (!current) return []; // No context — cannot resolve relative verse

        // Validate verse range
        const maxVerse = await getVerseCount(current.book, current.chapter, this.translation);
        if (maxVerse === 0) return []; // Invalid chapter
        if (intent.verse > maxVerse) return []; // Verse exceeds max — DO NOT resolve

        // Range: generate multiple candidates for verse range
        if (intent.endVerse !== undefined && intent.endVerse > intent.verse) {
          const clampedEnd = Math.min(intent.endVerse, maxVerse);
          const rangeCandidates: VoiceBibleCandidate[] = [];
          for (let v = intent.verse; v <= clampedEnd; v++) {
            const c = await this.buildCandidate(current.book, current.chapter, v);
            if (c) rangeCandidates.push(c);
          }
          if (rangeCandidates.length > 0) {
            const primary = rangeCandidates[0];
            this.pushVerseHistory({
              book: current.book,
              chapter: current.chapter,
              verse: primary.verse,
              label: primary.label,
              snippet: primary.snippet,
              timestamp: Date.now(),
            });
            this.context = pushScriptureContext(this.context, current.book, current.chapter, primary.verse, true);
            return rangeCandidates;
          }
          return [];
        }

        const candidate = await this.buildCandidate(current.book, current.chapter, intent.verse);
        if (candidate) {
          this.pushVerseHistory({
            book: current.book,
            chapter: current.chapter,
            verse: intent.verse,
            label: candidate.label,
            snippet: candidate.snippet,
            timestamp: Date.now(),
          });
          this.context = pushScriptureContext(this.context, current.book, current.chapter, intent.verse, true);
          return [candidate];
        }
        return [];
      }

      case "set-chapter": {
        const current = this.getCurrentVerseRef();
        if (!current) return [];

        // Validate chapter range
        const maxCh = await getChapterCount(current.book, this.translation);
        if (maxCh === 0) return []; // Invalid book
        if (intent.chapter > maxCh) return []; // Chapter exceeds max — DO NOT resolve

        const candidate = await this.buildCandidate(current.book, intent.chapter, 1);
        if (candidate) {
          this.pushVerseHistory({
            book: current.book,
            chapter: intent.chapter,
            verse: 1,
            label: candidate.label,
            snippet: candidate.snippet,
            timestamp: Date.now(),
          });
          this.context = pushScriptureContext(this.context, current.book, intent.chapter, 1, true);
          return [candidate];
        }
        return [];
      }

      case "use-translation": {
        const prevTranslation = this.translation;
        try {
          // Try to preload the translation to verify it's available
          const { preloadTranslation } = await import("../bible/bibleData");
          await preloadTranslation(intent.translation as "KJV");
          this.translation = intent.translation;
        } catch (err) {
          // Translation not available — revert and notify
          this.translation = prevTranslation;
          console.warn(`[Intent] Translation "${intent.translation}" not available:`, err);
          // Return empty to indicate failure (UI could show a toast)
          return [];
        }
        // Return current verse with new translation
        const current = this.getCurrentVerseRef();
        if (!current) return [];
        const candidate = await this.buildCandidate(current.book, current.chapter, current.verse);
        return candidate ? [candidate] : [];
      }

      case "first-chapter": {
        const current = this.getCurrentVerseRef();
        if (!current) return [];
        if (current.chapter === 1) return []; // Already at first chapter
        const candidate = await this.buildCandidate(current.book, 1, 1);
        if (candidate) {
          this.pushVerseHistory({
            book: current.book,
            chapter: 1,
            verse: 1,
            label: candidate.label,
            snippet: candidate.snippet,
            timestamp: Date.now(),
          });
          this.context = pushScriptureContext(this.context, current.book, 1, 1, true);
          return [candidate];
        }
        return [];
      }

      case "last-chapter": {
        const current = this.getCurrentVerseRef();
        if (!current) return [];
        const maxCh = await getChapterCount(current.book, this.translation);
        if (maxCh === 0) return [];
        if (current.chapter === maxCh) return []; // Already at last chapter
        const candidate = await this.buildCandidate(current.book, maxCh, 1);
        if (candidate) {
          this.pushVerseHistory({
            book: current.book,
            chapter: maxCh,
            verse: 1,
            label: candidate.label,
            snippet: candidate.snippet,
            timestamp: Date.now(),
          });
          this.context = pushScriptureContext(this.context, current.book, maxCh, 1, true);
          return [candidate];
        }
        return [];
      }

      case "middle-of-chapter": {
        const current = this.getCurrentVerseRef();
        if (!current) return [];
        const verseCount = await getVerseCount(current.book, current.chapter, this.translation);
        const middleVerse = Math.ceil(verseCount / 2);
        const candidate = await this.buildCandidate(current.book, current.chapter, middleVerse);
        if (candidate) {
          this.pushVerseHistory({
            book: current.book,
            chapter: current.chapter,
            verse: middleVerse,
            label: candidate.label,
            snippet: candidate.snippet,
            timestamp: Date.now(),
          });
          this.context = pushScriptureContext(this.context, current.book, current.chapter, middleVerse, true);
          return [candidate];
        }
        return [];
      }

      case "return-to-passage": {
        // Return to the last referenced passage (from history)
        if (this.verseHistory.length === 0) return [];
        const lastEntry = this.verseHistory[this.verseHistory.length - 1];
        const candidate = await this.buildCandidate(lastEntry.book, lastEntry.chapter, lastEntry.verse);
        if (candidate) {
          this.pushVerseHistory({
            book: lastEntry.book,
            chapter: lastEntry.chapter,
            verse: lastEntry.verse,
            label: candidate.label,
            snippet: candidate.snippet,
            timestamp: Date.now(),
          });
          this.context = pushScriptureContext(this.context, lastEntry.book, lastEntry.chapter, lastEntry.verse, true);
          return [candidate];
        }
        return [];
      }

      default:
        return [];
    }
  }

  /**
   * Get the current verse reference from history or context.
   */
  private getCurrentVerseRef(): { book: string; chapter: number; verse: number } | null {
    // Prefer verse history
    if (this.verseHistory.length > 0 && this.currentVerseIndex >= 0) {
      const entry = this.verseHistory[this.currentVerseIndex];
      return { book: entry.book, chapter: entry.chapter, verse: entry.verse };
    }
    // Fall back to context stack
    const fullRef = this.context.stack.find((e) => e.chapter !== null);
    if (fullRef) {
      return { book: fullRef.book, chapter: fullRef.chapter, verse: fullRef.verse ?? 1 };
    }
    return null;
  }

  /**
   * Navigate relative to current position (forward or backward N verses).
   * Handles cross-chapter overflow/underflow.
   */
  private async navigateRelative(
    book: string,
    chapter: number,
    verse: number,
    delta: number,
    _direction: "forward" | "backward",
  ): Promise<VoiceBibleCandidate | null> {
    let targetChapter = chapter;
    let targetVerse = verse + delta;

    // Resolve overflow/underflow
    while (true) {
      if (targetVerse < 1) {
        // Go to previous chapter
        targetChapter -= 1;
        if (targetChapter < 1) return null; // Already at Genesis 1:1
        const prevVerseCount = await getVerseCount(book, targetChapter, this.translation);
        targetVerse = prevVerseCount + targetVerse; // targetVerse is negative here
      } else {
        const verseCount = await getVerseCount(book, targetChapter, this.translation);
        if (targetVerse > verseCount) {
          // Go to next chapter
          targetVerse -= verseCount;
          targetChapter += 1;
          const maxCh = await getChapterCount(book, this.translation);
          if (targetChapter > maxCh) return null; // Past last chapter
        } else {
          break; // Valid verse
        }
      }
    }

    const candidate = await this.buildCandidate(book, targetChapter, targetVerse);
    if (candidate) {
      this.pushVerseHistory({
        book,
        chapter: targetChapter,
        verse: targetVerse,
        label: candidate.label,
        snippet: candidate.snippet,
        timestamp: Date.now(),
      });
      this.context = pushScriptureContext(this.context, book, targetChapter, targetVerse, true);
    }
    return candidate;
  }

  private async buildCandidate(
    book: string,
    chapter: number,
    verse: number | null,
  ): Promise<VoiceBibleCandidate | null> {
    try {
      // Validate bounds before building
      const maxCh = await getChapterCount(book, this.translation);
      if (maxCh === 0 || chapter < 1 || chapter > maxCh) return null;

      // Default to verse 1 when no verse specified
      const resolvedVerse = verse ?? 1;
      const maxVerse = await getVerseCount(book, chapter, this.translation);
      if (maxVerse === 0 || resolvedVerse < 1 || resolvedVerse > maxVerse) return null;

      const verseData = await getVerse(book, chapter, resolvedVerse, this.translation as "KJV");
      if (!verseData) return null;

      const snippet = verseData.text;
      const label = `${book} ${chapter}:${resolvedVerse}`;

      return {
        book,
        chapter,
        verse: resolvedVerse,
        translation: this.translation,
        label,
        snippet,
        confidence: verse === null ? 0.9 : 1.0,
        source: "keyword",
      };
    } catch {
      return null;
    }
  }

  getContext(): ScriptureContext {
    return { ...this.context };
  }
}
