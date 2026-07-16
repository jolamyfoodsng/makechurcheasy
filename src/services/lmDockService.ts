/**
 * lmDockService.ts — Main-app service for LM Dock mic capture + AssemblyAI realtime STT.
 *
 * Uses Rust-side cpal audio capture (via Tauri commands) so mic access
 * works even in the Tauri WKWebView where navigator.mediaDevices is unavailable.
 *
 * The Tauri backend captures mic audio and streams short PCM frames to
 * AssemblyAI's realtime WebSocket API for live transcription turns.
 *
 * Transcript is stored as TranscriptEntry[] — each finalized speech segment
 * is its own line. Interim text is a separate active entry with a live indicator.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { dockBridge } from "./dockBridge";
import { ScriptureDetectionEngine } from "./scriptureEngine";
import { createScriptureSpeechState, resolveScriptureSpeech, type ScriptureSpeechState } from "./scriptureParser";
import { getOverlayBaseUrl } from "./overlayUrl";
import { getSettings as getMvSettings } from "../multiview/mvStore";
import type { VoiceBibleCandidate, TranscriptEntry, DetectionSpeed, LmDockTelemetry } from "./voiceBibleTypes";
import { DETECTION_SPEED_CONFIG } from "./voiceBibleTypes";
import { getVoiceBibleSettings } from "./voiceBibleSettings";

/**
 * Detect hallucinated transcripts from AssemblyAI.
 * When the model lacks a language hint, it can produce random text in
 * multiple languages (German, Italian, French, etc.) instead of actual speech.
 * This filters out entries that contain non-Latin script characters.
 */
function isHallucinated(text: string): boolean {
  if (!text.trim()) return false;
  // Count non-ASCII letters (Cyrillic, CJK, Arabic, etc.)
  const nonLatin = text.match(/[\u0400-\u04FF\u0370-\u03FF\u0600-\u06FF\u0980-\u09FF\u0E00-\u0E7F\u1100-\u11FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g);
  const letterCount = text.replace(/[^a-zA-Z]/g, "").length;
  if (letterCount === 0) return false;
  // If non-Latin letters make up more than 10% of the text, it's likely hallucinated
  return (nonLatin?.length ?? 0) / letterCount > 0.1;
}

const ASSEMBLYAI_API_KEYS = (
  (import.meta as any).env?.VITE_ASSEMBLYAI_API_KEYS ?? ""
)
  .split(",")
  .map((k: string) => k.trim())
  .filter(Boolean);

function getAssemblyAiKey(): string {
  if (ASSEMBLYAI_API_KEYS.length === 0) {
    console.warn("[VoiceService] No API keys configured. Set speech service API keys in your .env file.");
    return "";
  }
  return ASSEMBLYAI_API_KEYS[Math.floor(Math.random() * ASSEMBLYAI_API_KEYS.length)];
}

export type LmServiceStatus = "idle" | "requesting-mic" | "connecting" | "listening" | "error";

export interface LmDockSnapshot {
  status: LmServiceStatus;
  entries: TranscriptEntry[];
  candidates: VoiceBibleCandidate[];
  queue: VoiceBibleCandidate[];      // Auto-pushed to OBS (reference commands)
  suggestions: VoiceBibleCandidate[]; // Manual push only (quote matches)
  matching: boolean;
  error?: string;
  inputLevel: number;
  startedAt?: number;
  detectionSpeed: DetectionSpeed;
  telemetry?: LmDockTelemetry;
}

type SnapshotListener = (snapshot: LmDockSnapshot) => void;

/**
 * Relay URL helper — builds absolute URLs to the overlay server's HTTP relay.
 * In the Tauri webview, relative URLs resolve to tauri://localhost which
 * doesn't have the relay. The overlay server (127.0.0.1:<port>) does.
 */
async function relayUrl(path: string): Promise<string> {
  return `${await getOverlayBaseUrl()}${path}`;
}

let _entryId = 0;
function nextEntryId(): string {
  return `e${++_entryId}`;
}

class LmDockService {
  private initialized = false;
  private unsubscribeDock: (() => void) | null = null;
  private listeners = new Set<SnapshotListener>();
  private snapshot: LmDockSnapshot = {
    status: "idle",
    entries: [],
    candidates: [],
    queue: [],
    suggestions: [],
    matching: false,
    inputLevel: 0,
    detectionSpeed: "balanced",
  };

  // Audio refs — Rust-side AssemblyAI realtime STT (via Tauri commands)
  private transcriptUnlisten: UnlistenFn | null = null;
  private statusUnlisten: UnlistenFn | null = null;
  private levelUnlisten: UnlistenFn | null = null;
  private visibilityHandler: (() => void) | null = null;
  private focusHandler: (() => void) | null = null;
  private blurHandler: (() => void) | null = null;
  private scriptureEngine = new ScriptureDetectionEngine();
  /** Speech buffer for phrase-based matching */
  private speechBuffer = "";
  private lastSpeechTime = 0;
  private pauseCheckTimer: ReturnType<typeof setInterval> | null = null;
  private commandPollTimer: ReturnType<typeof setInterval> | null = null;
  /** Async queue for matching — ensures chunks are processed in order */
  private matchingQueue: Promise<void> = Promise.resolve();
  /** Throttled live quote search state */
  private liveQuoteSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private liveQuoteSearchPendingText = "";
  private lastLiveQuoteSearchAt = 0;
  /** Cooldown: prevent auto-push to OBS more than once every 3 seconds */
  private lastAutoPushTime = 0;
  private static readonly AUTO_PUSH_COOLDOWN_MS = 3000;
  /** One-shot flag: auto-push to OBS only once per listening session */
  private hasAutoPushed = false;
  /** Resolved overlay base URL (http://127.0.0.1:<port>) — set once at init */
  private overlayBaseUrl: string | null = null;

  // ── Sentence detection state ──────────────────────────────────────────────
  /** Accumulated text for the current sentence (across ASR finals) */
  private sentenceBuffer = "";
  /** Monotonically increasing search ID — discards stale results */
  private latestSearchId = 0;
  private static readonly PAUSE_THRESHOLD_MS = 1000;
  private static readonly LIVE_QUOTE_SEARCH_WINDOW_WORDS = 18;

  // ── Interim provisional search ────────────────────────────────────────────
  /** Debounce timer for provisional quote search on interim text */
  private interimSearchTimer: ReturnType<typeof setTimeout> | null = null;
  /** Last interim text that was submitted for provisional search */
  private lastInterimSearched = "";
  /** Prevent duplicate starts when BroadcastChannel and HTTP relay overlap. */
  private startInFlight = false;
  /** Invalidates stale start attempts when stop/start races happen. */
  private sessionToken = 0;
  /** Throttle audio level notifications to avoid render storms. */
  private lastLevelNotifyAt = 0;
  private lastLevelValue = 0;

  // ── Detection speed ───────────────────────────────────────────────────────
  /** Current detection speed mode */
  private detectionSpeed: DetectionSpeed = "balanced";
  /** Cached detection speed config */
  private get speedConfig() {
    return DETECTION_SPEED_CONFIG[this.detectionSpeed];
  }
  /** Fast speech-state resolver for continuations and corrections */
  private scriptureSpeechState: ScriptureSpeechState = createScriptureSpeechState();

  // ── Telemetry ─────────────────────────────────────────────────────────────
  private telemetry: LmDockTelemetry = {
    lastSpeechAt: 0,
    lastSearchAt: 0,
    lastResultsAt: 0,
    speechToSearchMs: 0,
    searchToResultsMs: 0,
    totalLatencyMs: 0,
    searchCount: 0,
    avgLatencyMs: 0,
  };
  /** Rolling latency accumulator for average calculation */
  private latencySum = 0;
  /** Last observed speech timestamp for live-search telemetry */
  private lastSpeechReceivedAt = 0;

  /**
   * Keep only the most recent clause for quote matching.
   * Long transcripts get noisy quickly; the verse clue is usually in the tail.
   */
  private buildLiveQuoteSearchText(text: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";

    const words = normalized.split(" ");
    if (words.length <= LmDockService.LIVE_QUOTE_SEARCH_WINDOW_WORDS) {
      return normalized;
    }

    return words.slice(-LmDockService.LIVE_QUOTE_SEARCH_WINDOW_WORDS).join(" ");
  }

  /**
   * Throttle quote searches so we update during speech instead of waiting
   * for a full pause. The latest text wins.
   */
  private scheduleLiveQuoteSearch(text: string): void {
    const searchText = this.buildLiveQuoteSearchText(text);
    if (!searchText) return;

    this.liveQuoteSearchPendingText = searchText;

    if (this.liveQuoteSearchTimer) return;

    const throttleMs = this.speedConfig.debounceMs;
    const now = Date.now();
    const elapsed = now - this.lastLiveQuoteSearchAt;
    const delay = Math.max(0, throttleMs - elapsed);

    this.liveQuoteSearchTimer = setTimeout(() => {
      this.liveQuoteSearchTimer = null;
      const pending = this.liveQuoteSearchPendingText.trim();
      if (!pending || pending === this.lastInterimSearched) return;

      this.lastLiveQuoteSearchAt = Date.now();
      this.lastInterimSearched = pending;
      this.telemetry.lastSearchAt = Date.now();
      this.telemetry.speechToSearchMs = this.lastSpeechReceivedAt > 0
        ? this.telemetry.lastSearchAt - this.lastSpeechReceivedAt
        : 0;

      this.matchingQueue = this.matchingQueue.then(() =>
        this.runQuoteSearchWithText(pending, Date.now()),
      );
    }, delay);
  }

  init(): () => void {
    if (this.initialized) return () => { };
    this.initialized = true;

    // Eagerly resolve the overlay base URL so relay POSTs always use
    // http://127.0.0.1:<port> instead of falling back to tauri://localhost
    // or http://localhost (Vite dev server) which would hit the wrong proxy.
    getOverlayBaseUrl().then((url) => {
      this.overlayBaseUrl = url;
      console.log("[lmDockService] overlay base URL resolved:", url);
    }).catch((err) => {
      console.warn("[lmDockService] overlay base URL resolve FAILED:", err);
    });

    // Do NOT push idle state at init — the dock should only show content
    // after the user explicitly starts listening via SpeechToScripturePage.
    // The "ping" handler below covers late-connecting docks.

    this.unsubscribeDock = dockBridge.onCommand((cmd) => {
      console.log("[lmDockService] 📡 dockBridge command:", cmd.type);
      if (cmd.type === "lm:start") {
        const payload = cmd.payload as { micId?: string } | undefined;
        console.log("[lmDockService] 🎤 dockBridge lm:start → startListening()");
        void this.startListening(payload?.micId);
      } else if (cmd.type === "lm:stop") {
        this.stopListening();
      } else if (cmd.type === "ping") {
        // Dock just connected — push current state so it updates immediately
        this.pushStatus();
        this.pushCandidates();
      }
    });

    // HTTP command polling — cross-process fallback for OBS CEF dock
    // BroadcastChannel only works within the same browser process.
    // In OBS, the dock runs in CEF (separate process), so we need HTTP relay.
    this.commandPollTimer = setInterval(async () => {
      try {
        const url = await relayUrl("/api/lm-command");
        const res = await fetch(url);
        const raw = (await res.json()) as unknown;
        // Rust returns Vec<String> (raw JSON strings), not Vec<Value>
        const commands: Array<{ type: string; payload?: unknown }> = Array.isArray(raw)
          ? raw.map((item) =>
            typeof item === "string"
              ? (JSON.parse(item) as { type: string; payload?: unknown })
              : (item as { type: string; payload?: unknown }),
          )
          : [];
        for (const cmd of commands) {
          if (cmd.type === "lm:start") {
            const payload = cmd.payload as { micId?: string } | undefined;
            console.log("[lmDockService] 🎤 HTTP lm:start → startListening()");
            void this.startListening(payload?.micId);
          } else if (cmd.type === "lm:stop") {
            this.stopListening();
          } else if (cmd.type === "lm:navigate") {
            // Forward to dockBridge for main app handlers
            dockBridge.sendState({ type: "state:lm-status", payload: { ...this.snapshot }, timestamp: Date.now() });
          }
        }
      } catch (err) {
        // Only log occasionally to avoid spam
        if (Math.random() < 0.05) {
          console.warn("[lmDockService] ⚠️ commandPoll failed:", err);
        }
      }
    }, 500);

    return () => {
      this.unsubscribeDock?.();
      this.unsubscribeDock = null;
      if (this.commandPollTimer) {
        clearInterval(this.commandPollTimer);
        this.commandPollTimer = null;
      }
      this.stopListening();
      this.initialized = false;
    };
  }

  // ── Snapshot helpers ─────────────────────────────────────────────────────

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private pushStatus(): void {
    this.notifyListeners();
    dockBridge.sendState({
      type: "state:lm-status",
      payload: { ...this.snapshot },
      timestamp: Date.now(),
    });
    this.postToRelay();
  }

  private pushCandidates(): void {
    this.notifyListeners();
    dockBridge.sendState({
      type: "state:lm-candidates",
      payload: {
        transcript: this.getPlainText(),
        candidates: this.snapshot.candidates,
        queue: this.snapshot.queue,
        suggestions: this.snapshot.suggestions,
      },
      timestamp: Date.now(),
    });
    this.postToRelay();
  }

  private pushTranscript(): void {
    this.notifyListeners();
    dockBridge.sendState({
      type: "state:lm-transcript",
      payload: {
        entries: this.snapshot.entries,
      },
      timestamp: Date.now(),
    });
    this.postToRelay();
  }

  /** POST snapshot to overlay server relay for cross-process LM Dock communication */
  private postToRelay(): void {
    try {
      const payload = {
        status: this.snapshot.status,
        entries: this.snapshot.entries,
        candidates: this.snapshot.candidates,
        queue: this.snapshot.queue,
        suggestions: this.snapshot.suggestions,
        matching: this.snapshot.matching,
        error: this.snapshot.error,
      };

      // Use the eagerly-resolved overlay URL (http://127.0.0.1:<port>).
      // Falls back to async getOverlayBaseUrl() if cache hasn't resolved yet.
      // Must NOT use window.location.origin (Vite dev server or tauri://) —
      // that would hit the Vite proxy which forwards to the wrong port.
      const base = this.overlayBaseUrl;
      if (!base) {
        // URL not yet resolved — wait for it (first few posts after init)
        void getOverlayBaseUrl().then((resolved) => {
          this.overlayBaseUrl = resolved;
          this._postToRelayDirect(resolved, payload);
        }).catch((err) => {
          console.warn("[lmDockService] postToRelay: overlay URL resolve failed:", err);
        });
        return;
      }

      this._postToRelayDirect(base, payload);
    } catch (err) {
      console.warn("[lmDockService] postToRelay error:", err);
    }
  }

  private _postToRelayDirect(baseUrl: string, payload: Record<string, unknown>): void {
    const url = `${baseUrl}/api/lm-state`;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => {
      if (!r.ok) console.warn("[lmDockService] postToRelay HTTP", r.status, r.statusText);
    }).catch((err) => {
      console.warn("[lmDockService] postToRelay fetch FAILED:", url, err);
    });
  }

  /** Get all finalized text joined for Bible matching */
  private getPlainText(): string {
    return this.snapshot.entries
      .filter((e) => e.finalized)
      .map((e) => e.text)
      .join("\n");
  }

  // ── Transcript entry management ──────────────────────────────────────────

  /** Update or create the active (interim) entry */
  private upsertInterim(text: string, audioStartMs?: number, audioEndMs?: number): void {
    const activeIndex = this.snapshot.entries.findIndex((e) => !e.finalized);
    const active = activeIndex >= 0 ? this.snapshot.entries[activeIndex] : null;
    const nextEntry = {
      id: active?.id ?? nextEntryId(),
      text,
      finalized: false,
      startTime: audioStartMs != null ? audioStartMs / 1000 : active?.startTime,
      endTime: audioEndMs != null ? audioEndMs / 1000 : active?.endTime,
    };

    if (activeIndex >= 0) {
      const nextEntries = this.snapshot.entries.map((entry, index) =>
        index === activeIndex ? nextEntry : entry,
      );
      this.snapshot = { ...this.snapshot, entries: nextEntries };
    } else {
      this.snapshot = { ...this.snapshot, entries: [...this.snapshot.entries, nextEntry] };
    }
  }

  /** Finalize the active entry and replace its text with the final version */
  private finalizeCurrent(finalText: string, audioStartMs?: number, audioEndMs?: number): void {
    const activeIndex = this.snapshot.entries.findIndex((e) => !e.finalized);
    const active = activeIndex >= 0 ? this.snapshot.entries[activeIndex] : null;
    const finalizedEntry = {
      id: active?.id ?? nextEntryId(),
      text: finalText,
      finalized: true,
      startTime: audioStartMs != null ? audioStartMs / 1000 : active?.startTime,
      endTime: audioEndMs != null ? audioEndMs / 1000 : active?.endTime,
    };

    if (activeIndex >= 0) {
      const nextEntries = this.snapshot.entries.map((entry, index) =>
        index === activeIndex ? finalizedEntry : entry,
      );
      this.snapshot = { ...this.snapshot, entries: nextEntries };
    } else {
      this.snapshot = { ...this.snapshot, entries: [...this.snapshot.entries, finalizedEntry] };
    }
  }

  // ── Bible matching (incremental) ────────────────────────────────────────

  /**
   * Process a transcript chunk through the Scripture Detection Engine.
   * Uses async queue — chunks are processed in order, but never block transcript.
   */
  private async processChunk(text: string, isFinal: boolean): Promise<void> {
    if (!text.trim()) return;
    if (this.snapshot.status === "idle") return;

    // Queue the chunk behind any in-flight processing
    this.matchingQueue = this.matchingQueue.then(async () => {
      // Re-check idle inside the queue — status may have changed since enqueue
      const s: LmServiceStatus = this.snapshot.status;
      if (s === "idle") return;
      try {
        const result = await this.scriptureEngine.processChunk(text, isFinal);
        // Re-check — stop may have been called while awaiting
        if (this.snapshot.status === "idle") return;
        this.handleMatchResult(result);
      } catch (err) {
        console.warn("[LmDockService] processChunk error:", err);
      }
    });
  }

  private handleMatchResult(
    result: { matches: Array<{ candidate: VoiceBibleCandidate; source: string; confidence: number; navigationOnly?: boolean }> },
  ): void {
    if (result.matches.length > 0) {
      const newCandidates = result.matches.map((m) => m.candidate);

      // Confidence routing:
      // - source=reference OR confidence >= 0.90 → auto-push (queue)
      // - navigationOnly (chapter-only open) → suggestions only (no auto-push)
      // - confidence >= 0.75 → suggestion
      // - confidence < 0.75 → low-confidence suggestion
      const isReferenceCommand = result.matches.some((m) => m.source === "reference");
      const highConfidence = result.matches.some((m) => m.confidence >= 0.90);
      const isNavigationOnly = result.matches.some((m) => m.navigationOnly === true);

      if ((isReferenceCommand || highConfidence) && !isNavigationOnly) {
        const existingQueueKeys = new Set(this.snapshot.queue.map((c) => `${c.book}:${c.chapter}:${c.verse}`));
        const uniqueNew = newCandidates.filter((c) => !existingQueueKeys.has(`${c.book}:${c.chapter}:${c.verse}`));

        // Always place the newest match at the front so auto-push targets the
        // most recent navigation result, even if the verse already existed in
        // the queue (e.g. navigating back then forward again).
        const queue = [...uniqueNew, ...this.snapshot.queue].slice(0, 20);
        // Remove duplicates that snuck in via the old queue
        const dedupedQueue = queue.filter(
          (c, i, arr) => arr.findIndex((x) => `${x.book}:${x.chapter}:${x.verse}` === `${c.book}:${c.chapter}:${c.verse}`) === i,
        );
        // Move the newest candidate to the front even if it was already queued
        const primary = newCandidates[0];
        if (primary) {
          const idx = dedupedQueue.findIndex((c) => `${c.book}:${c.chapter}:${c.verse}` === `${primary.book}:${primary.chapter}:${primary.verse}`);
          if (idx > 0) {
            dedupedQueue.splice(idx, 1);
            dedupedQueue.unshift(primary);
          }
        }
        this.snapshot = { ...this.snapshot, queue: dedupedQueue.slice(0, 20) };


        // Only auto-push when a NEW verse was added to the queue
        if (uniqueNew.length > 0) {
          void this.autoPushToObs(this.snapshot.queue[0]);
        }
      } else {
        // REPLACE suggestions — same principle as runQuoteSearchWithText.
        // Each new match result represents the latest detection, not an
        // addition to historical matches.
        const suggestions = newCandidates.slice(0, 20);
        this.snapshot = { ...this.snapshot, suggestions };
      }

      const candidates = [...this.snapshot.queue, ...this.snapshot.suggestions].slice(0, 20);
      this.snapshot = { ...this.snapshot, candidates };
      this.pushCandidates();
      return;
    }
  }

  // ── Sentence detection ────────────────────────────────────────────────────

  /**
   * Called on EVERY ASR final. Accumulates text, detects sentence boundaries,
   * and immediately triggers verse search. This is the primary search trigger.
   *
   * Triggers on:
   *   - end_of_turn = true (every final)
   *   - sentence-ending punctuation (. ? !)
   *   - pause > 1s (via flushSentenceBuffer)
   */
  private onTranscriptFinal(text: string): void {
    const now = Date.now();

    // Record speech timestamp for telemetry
    this.telemetry.lastSpeechAt = now;

    // Skip quote search for Bible references — processChunk handles these.
    // Running quote search on reference text (e.g. "1 corinthians 1:1") would
    // always return 0 results and clear suggestions, making the reference appear
    // to show "nothing" even though processChunk already detected it.
    const ref = resolveScriptureSpeech(text, this.scriptureSpeechState, now);
    if (ref) {
      return;
    }

    // Accumulate into sentence buffer
    this.sentenceBuffer += (this.sentenceBuffer ? " " : "") + text;

    // Check for sentence boundary — split into individual sentences
    if (/[.?!]/.test(this.sentenceBuffer)) {
      // Split on sentence-ending punctuation followed by whitespace or end-of-string
      const parts = this.sentenceBuffer.split(/(?<=[.?!])(?:\s+|$)/).filter(Boolean);

      // Classify: parts ending with punctuation are complete sentences
      const complete: string[] = [];
      let trailing = "";
      for (const part of parts) {
        if (/[.?!]$/.test(part)) {
          complete.push(part);
        } else {
          trailing = part;
        }
      }

      // Keep any trailing incomplete text in buffer
      this.sentenceBuffer = trailing;

      // Queue each complete sentence for independent, sequential search.
      // Using matchingQueue ensures earlier searches aren't cancelled by
      // later ones — each sentence gets its own results.
      for (const sentence of complete) {
        const s = sentence.trim();
        if (s.length < 10) continue;
        this.matchingQueue = this.matchingQueue.then(() =>
          this.runQuoteSearchWithText(s, Date.now()),
        );
      }
    } else {
      // No punctuation yet — search the accumulated buffer anyway
      const trimmed = this.sentenceBuffer.trim();
      if (trimmed.length >= 10) {
        this.matchingQueue = this.matchingQueue.then(() =>
          this.runQuoteSearchWithText(trimmed, now),
        );
      }
    }
  }

  /**
   * Called when a sentence is complete (boundary detected or pause timeout).
   * Queues the search through matchingQueue so concurrent calls don't cancel
   * each other — each sentence gets its own independent search.
   */
  private onSentenceComplete(sentence: string): void {
    const trimmed = sentence.trim();
    if (!trimmed || trimmed.length < 10) return;

    const now = Date.now();
    this.matchingQueue = this.matchingQueue.then(() =>
      this.runQuoteSearchWithText(trimmed, now),
    );
  }

  /**
   * Flush the sentence buffer on silence timeout — treat as sentence boundary.
   */
  private flushSentenceBuffer(): void {
    if (this.sentenceBuffer.trim().length >= 10) {
      this.onSentenceComplete(this.sentenceBuffer);
    }
    this.sentenceBuffer = "";
  }

  /**
   * Run verse search with freshness protection.
   * Cancels any in-flight search. Results are discarded if a newer search
   * has started by the time they arrive.
   */
  private async runQuoteSearchWithText(text: string, _transcriptTimestamp: number): Promise<void> {
    if (this.snapshot.status === "idle") return;

    // Cancel any in-flight search — we only care about the latest
    this.scriptureEngine.cancelQuoteSearchPublic();

    const searchId = ++this.latestSearchId;
    const boundBook = this.scriptureEngine.getBoundBook();
    const searchStartedAt = Date.now();
    this.telemetry.lastSearchAt = searchStartedAt;
    this.telemetry.speechToSearchMs = this.lastSpeechReceivedAt > 0
      ? searchStartedAt - this.lastSpeechReceivedAt
      : this.telemetry.speechToSearchMs;


    this.snapshot = { ...this.snapshot, matching: true };
    this.pushStatus();

    try {
      const quoteMatches = await this.scriptureEngine.searchQuotesWithText(text, boundBook);

      // Freshness guard: discard if a newer search has started
      if (searchId !== this.latestSearchId) {
        return;
      }

      // Record telemetry — search completed
      const searchCompletedAt = Date.now();
      this.telemetry.searchToResultsMs = searchCompletedAt - this.telemetry.lastSearchAt;
      this.telemetry.searchCount++;
      this.latencySum += this.telemetry.searchToResultsMs;
      this.telemetry.avgLatencyMs = Math.round(this.latencySum / this.telemetry.searchCount);

      if (quoteMatches.length > 0) {
        // REPLACE suggestions — every new search represents the latest quote.
        const suggestions = quoteMatches.map((m) => m.candidate).slice(0, 20);
        const candidates = [...this.snapshot.queue, ...suggestions].slice(0, 20);
        this.snapshot = { ...this.snapshot, suggestions, candidates };
        this.telemetry.lastResultsAt = Date.now();
        this.telemetry.totalLatencyMs = this.lastSpeechReceivedAt > 0
          ? searchCompletedAt - this.lastSpeechReceivedAt
          : this.telemetry.searchToResultsMs;
        this.pushCandidates();
      } else {
        // Clear stale suggestions — the new query found nothing, so the
        // previous match is no longer relevant. Without this, a verse from
        // a prior search persists on screen even after the topic changes.
        if (this.snapshot.suggestions.length > 0) {
          this.snapshot = { ...this.snapshot, suggestions: [], candidates: [...this.snapshot.queue] };
          this.pushCandidates();
        }
      }
    } catch (err) {
      console.warn("[LmDockService] Sentence quote search failed:", err);
    } finally {
      this.snapshot = { ...this.snapshot, matching: false };
      // Don't push status after stop — the stop handler already pushed idle
      if (this.snapshot.status !== "idle") {
        this.pushStatus();
      }
    }
  }

  // ── Auto-push to OBS ─────────────────────────────────────────────────────

  /**
   * Auto-push a verse to OBS when a reference command is detected.
   * Loads the full chapter and pushes surrounding context (up to 10 preceding
   * verses + the target verse) so the broadcast shows passage context, not
   * just the single target verse.
   */
  private async autoPushToObs(candidate: VoiceBibleCandidate): Promise<void> {
    // Don't push to OBS if listening has stopped
    if (this.snapshot.status !== "listening") {
      return;
    }

    // One-shot: only auto-push once per listening session
    if (this.hasAutoPushed) {
      return;
    }

    // Cooldown — prevent continuous pushing when ASR detects rapid-fire verses
    const now = Date.now();
    if (now - this.lastAutoPushTime < LmDockService.AUTO_PUSH_COOLDOWN_MS) {
      return;
    }
    this.lastAutoPushTime = now;

    try {
      const { bibleObsService } = await import("../bible/bibleObsService");
      const { getChapter } = await import("../bible/bibleData");

      // Load the full chapter to get surrounding verse context
      const passage = await getChapter(candidate.book, candidate.chapter, candidate.translation);
      const targetVerse = candidate.verse;

      // Select a window: up to 10 preceding verses + target verse
      const targetIdx = passage.verses.findIndex((v) => v.verse === targetVerse);
      const startIdx = Math.max(0, targetIdx - 10);
      const selectedVerses = passage.verses.slice(startIdx, targetIdx + 1);

      const verseText = selectedVerses
        .map((v) => `${candidate.book} ${candidate.chapter}:${v.verse}  ${v.text}`)
        .join("\n\n");

      const slide = {
        id: `speech-${candidate.book}-${candidate.chapter}-${candidate.verse}`,
        text: verseText || candidate.snippet || `${candidate.book} ${candidate.chapter}:${candidate.verse}`,
        reference: `${candidate.label} (${candidate.translation})`,
        verseRange: selectedVerses.length > 1
          ? `${selectedVerses[0].verse}-${selectedVerses[selectedVerses.length - 1].verse}`
          : String(targetVerse),
        index: 0,
        total: selectedVerses.length,
      };

      await bibleObsService.pushSlide(slide, null, true, false, "fullscreen");
      this.hasAutoPushed = true;
    } catch (err) {
      console.warn("[LmDockService] Auto-push to OBS failed:", err);
    }
  }

  // ── Start / Stop ────────────────────────────────────────────────────────

  async startListening(micId?: string): Promise<void> {
    console.log("[lmDockService] 🎤 startListening() called, micId:", micId, "currentStatus:", this.snapshot.status);
    if (
      this.startInFlight ||
      this.snapshot.status === "listening" ||
      this.snapshot.status === "connecting" ||
      this.snapshot.status === "requesting-mic"
    ) {
      return;
    }

    this.startInFlight = true;
    const token = ++this.sessionToken;

    // Load detection speed from settings
    try {
      const settings = await getVoiceBibleSettings();
      this.detectionSpeed = settings.detectionSpeed;
    } catch {
      // Use default "balanced" if settings load fails
    }

    // Reset telemetry for new session
    this.telemetry = {
      lastSpeechAt: 0,
      lastSearchAt: 0,
      lastResultsAt: 0,
      speechToSearchMs: 0,
      searchToResultsMs: 0,
      totalLatencyMs: 0,
      searchCount: 0,
      avgLatencyMs: 0,
    };
    this.latencySum = 0;

    this.snapshot = {
      status: "requesting-mic",
      candidates: [],
      queue: [],
      suggestions: [],
      matching: false,
      inputLevel: 0,
      startedAt: Date.now(),
      entries: this.snapshot.entries,
      detectionSpeed: this.detectionSpeed,
    };
    this.scriptureEngine.reset();
    this.scriptureSpeechState = createScriptureSpeechState();
    this.hasAutoPushed = false;
    this.pushStatus();

    try {
      if (token !== this.sessionToken) return;

      // Preload Bible data to avoid first-call latency
      await this.scriptureEngine.preload();
      if (token !== this.sessionToken) {
        await this.cleanup();
        return;
      }

      // Check if offline - try to load Whisper model
      if (!navigator.onLine) {
        const { loadWhisperModel } = await import("./whisperService");
        await loadWhisperModel();
        if (token !== this.sessionToken) {
          await this.cleanup();
          return;
        }
      }

      // Start Rust-side AssemblyAI realtime STT — captures mic + streams turns from backend.
      // Immune to WebView throttling, AudioContext suspension, and App Nap.
      this.snapshot = { ...this.snapshot, status: "connecting" };
      this.pushStatus();

      if (token !== this.sessionToken) {
        await this.cleanup();
        return;
      }

      const apiKey = getAssemblyAiKey();
      if (!apiKey) {
        throw new Error("No speech service API key configured");
      }

      // Listen for transcript events from Rust backend
      this.transcriptUnlisten = await listen<{
        text: string;
        end_of_turn: boolean;
        audio_start: number;
        audio_end: number;
      }>("assemblyai-transcript", (event) => {
        if (token !== this.sessionToken) return;
        const { text, end_of_turn, audio_start, audio_end } = event.payload;
        this.lastSpeechReceivedAt = Date.now();

        // Filter hallucinated transcripts (non-Latin script garbage)
        if (isHallucinated(text)) {
          console.warn("[Transcript] Hallucinated entry discarded:", text.substring(0, 60));
          return;
        }

        if (end_of_turn) {
          this.finalizeCurrent(text, audio_start, audio_end);
          this.pushTranscript();

          // Process final text through scripture engine (reference parsing)
          // Only process the final text — the speechBuffer may overlap with
          // the final and cause intents like "next verse" to fire multiple times
          this.speechBuffer = "";
          void this.processChunk(text, true);

          // Sentence detection: accumulate finals, detect boundaries, trigger verse search
          this.onTranscriptFinal(text);
        } else {
          // Interim — update buffer, track timestamp, and run live matching
          this.upsertInterim(text, audio_start, audio_end);
          this.pushTranscript();
          this.speechBuffer = text;
          this.lastSpeechTime = Date.now();

          const interimRef = resolveScriptureSpeech(text, this.scriptureSpeechState, Date.now());

          // Run scripture engine on interim text for live suggestions.
          // Accurate mode waits for final/sentence text unless this is a
          // direct reference command like "John three sixteen".
          if (interimRef || (!this.speedConfig.requireSentenceBoundary && text.length >= 15)) {
            void this.processChunk(text, false);
          }

          // Provisional quote search on interim text — surfaces Bible
          // matches before the sentence is finalized by AssemblyAI.
          // Uses a throttle so updates can happen during speech instead of
          // waiting for a full pause.
          //
          // Word minimum and throttle window are controlled by detection speed mode:
          //   fast:      3 words, 250ms throttle
          //   balanced:  5 words, 300ms throttle
          //   accurate:  8 words, 400ms throttle
          const interimWordCount = text.split(/\s+/).filter(Boolean).length;
          const minWords = this.speedConfig.minWords;
          if (
            !this.speedConfig.requireSentenceBoundary &&
            !interimRef &&
            interimWordCount >= minWords &&
            text !== this.lastInterimSearched
          ) {
            this.scheduleLiveQuoteSearch(text);
          }
        }
      });
      if (token !== this.sessionToken) {
        await this.cleanup();
        return;
      }

      // Listen for status events from Rust backend
      this.statusUnlisten = await listen<{ status: string }>(
        "assemblyai-status",
        (event) => {
          if (token !== this.sessionToken) return;
          const { status } = event.payload;
          if (status === "connected") {
            this.snapshot = { ...this.snapshot, status: "listening" };
            this.pushStatus();
          } else if (status.startsWith("error")) {
            this.snapshot = { ...this.snapshot, status: "error", error: status };
            this.pushStatus();
            this.cleanup();
          } else if (status === "stopped") {
            this.snapshot = { ...this.snapshot, status: "idle" };
            this.pushStatus();
          }
        },
      );
      if (token !== this.sessionToken) {
        await this.cleanup();
        return;
      }

      // Listen for audio level events from Rust backend
      this.levelUnlisten = await listen<{ level: number }>(
        "assemblyai-audio-level",
        (event) => {
          if (token !== this.sessionToken) return;
          const level = event.payload.level;
          this.snapshot = { ...this.snapshot, inputLevel: level };

          // The meter updates frequently; throttle notifications so the page
          // does not re-render the transcript list on every chunk.
          const now = Date.now();
          const shouldNotify =
            now - this.lastLevelNotifyAt >= 250 ||
            Math.abs(level - this.lastLevelValue) >= 0.08 ||
            level === 0;

          if (shouldNotify) {
            this.lastLevelNotifyAt = now;
            this.lastLevelValue = level;
            this.notifyListeners();
          }
        },
      );
      if (token !== this.sessionToken) {
        await this.cleanup();
        return;
      }

      // Start pause detection timer — checks every 100ms for silence
      this.pauseCheckTimer = setInterval(() => {
        if (this.speechBuffer.length > 0 && this.lastSpeechTime > 0) {
          const silenceMs = Date.now() - this.lastSpeechTime;
          const wordCount = this.speechBuffer.split(/\s+/).filter(Boolean).length;

          // Trigger search after 500ms silence with enough content
          if (silenceMs > 500 && (this.speechBuffer.length > 20 || wordCount > 4)) {
            const phrase = this.speechBuffer.trim();
            this.speechBuffer = "";
            void this.processChunk(phrase, false);
          }
        }

        // Sentence boundary on silence: flush accumulated sentence buffer
        if (this.sentenceBuffer.length > 0 && this.lastSpeechTime > 0) {
          const silenceMs = Date.now() - this.lastSpeechTime;
          if (silenceMs > LmDockService.PAUSE_THRESHOLD_MS) {
            this.flushSentenceBuffer();
          }
        }
      }, 100);

      // Invoke the Rust backend to start mic capture + AssemblyAI realtime STT.
      // Pass the current user gain so the Rust pipeline applies it from the start.
      const mvSettings = getMvSettings();
      const gainMultiplier = (mvSettings.inputGain ?? 100) / 100;
      await invoke("start_assemblyai_stream", {
        apiKey,
        deviceId: micId || null,
        detectionSpeed: this.detectionSpeed,
      });
      if (token !== this.sessionToken) {
        await this.cleanup();
        return;
      }
      // Apply current gain (separate call so it's live-updatable)
      await invoke("set_microphone_gain", { gain: gainMultiplier }).catch(() => { });
    } catch (err) {
      if (token !== this.sessionToken) {
        return;
      }
      console.warn("[LmDockService] Failed to start listening:", err);
      const msg = err instanceof Error ? err.message : String(err);
      this.snapshot = { ...this.snapshot, status: "error", error: msg };
      this.pushStatus();
      this.cleanup();
    } finally {
      if (token === this.sessionToken) {
        this.startInFlight = false;
      }
    }
  }

  stopListening(): void {
    this.sessionToken++;
    this.startInFlight = false;
    if (this.pauseCheckTimer) {
      clearInterval(this.pauseCheckTimer);
      this.pauseCheckTimer = null;
    }
    if (this.liveQuoteSearchTimer) {
      clearTimeout(this.liveQuoteSearchTimer);
      this.liveQuoteSearchTimer = null;
    }
    if (this.interimSearchTimer) {
      clearTimeout(this.interimSearchTimer);
      this.interimSearchTimer = null;
    }
    this.speechBuffer = "";
    this.lastSpeechTime = 0;
    this.lastSpeechReceivedAt = 0;
    this.sentenceBuffer = "";
    this.lastInterimSearched = "";
    this.latestSearchId++;
    this.liveQuoteSearchPendingText = "";
    this.lastLevelNotifyAt = 0;
    this.lastLevelValue = 0;

    this.cleanup();

    this.snapshot = {
      ...this.snapshot,
      status: "idle",
      inputLevel: 0,
      startedAt: undefined,
      entries: [],
      candidates: [],
      queue: [],
      suggestions: [],
      matching: false,
    };
    this.pushStatus();
    this.pushCandidates();
  }

  /**
   * Update the microphone input gain at runtime (0–300 → 0.0–3.0 multiplier).
   * Calls the Rust-side set_microphone_gain command — no stream restart needed.
   */
  async setInputGain(gainPercent: number): Promise<void> {
    const gain = Math.max(0, Math.min(3, gainPercent / 100));
    await invoke("set_microphone_gain", { gain }).catch(() => { });
  }

  private cleanup(): void {
    // Unlisten Tauri event listeners
    this.transcriptUnlisten?.();
    this.transcriptUnlisten = null;
    this.statusUnlisten?.();
    this.statusUnlisten = null;
    this.levelUnlisten?.();
    this.levelUnlisten = null;

    // Cancel pending timers
    if (this.liveQuoteSearchTimer) {
      clearTimeout(this.liveQuoteSearchTimer);
      this.liveQuoteSearchTimer = null;
    }
    this.liveQuoteSearchPendingText = "";
    this.lastLiveQuoteSearchAt = 0;
    if (this.interimSearchTimer) {
      clearTimeout(this.interimSearchTimer);
      this.interimSearchTimer = null;
    }

    // Remove focus/visibility handlers
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.blurHandler) {
      window.removeEventListener("blur", this.blurHandler);
      this.blurHandler = null;
    }
    if (this.focusHandler) {
      window.removeEventListener("focus", this.focusHandler);
      this.focusHandler = null;
    }

    // Stop Rust-side AssemblyAI realtime STT (mic capture + transcription task)
    invoke("stop_assemblyai_stream").catch((err) => {
      console.warn("[LmDockService] Failed to stop voice stream:", err);
    });
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async getMics(): Promise<Array<{ id: string; label: string }>> {
    // Always use Rust cpal — the entire audio pipeline runs in the Tauri backend.
    // Browser navigator.mediaDevices returns macOS Core Audio UIDs which don't
    // match cpal device names, so we must not mix the two.
    try {
      const devices = await invoke<Array<{ id: string; name: string; is_default: boolean }>>(
        "list_audio_devices",
      );
      return devices.map((d) => ({ id: d.id, label: d.name }));
    } catch (err) {
      console.warn("[LmDockService] Failed to list audio devices:", err);
      return [];
    }
  }

  getSnapshot(): LmDockSnapshot {
    return {
      ...this.snapshot,
      detectionSpeed: this.detectionSpeed,
      telemetry: { ...this.telemetry },
    };
  }

  getDiagnostics(): {
    status: LmServiceStatus;
    sessionToken: number;
    startInFlight: boolean;
    activeTimers: number;
    listenerCount: number;
    transcriptListenerActive: boolean;
    statusListenerActive: boolean;
    levelListenerActive: boolean;
    commandPollTimerActive: boolean;
    pauseCheckTimerActive: boolean;
    liveQuoteSearchTimerActive: boolean;
    interimSearchTimerActive: boolean;
    finalizedChunkCount: number;
    recentEmissionCount: number;
    verseHistoryCount: number;
    entryCount: number;
    candidateCount: number;
    queueCount: number;
    suggestionCount: number;
    audioLevel: number;
  } {
    const scriptureCounts = this.scriptureEngine.getDiagnosticCounts();
    return {
      status: this.snapshot.status,
      sessionToken: this.sessionToken,
      startInFlight: this.startInFlight,
      activeTimers: [
        this.pauseCheckTimer,
        this.commandPollTimer,
        this.liveQuoteSearchTimer,
        this.interimSearchTimer,
      ].filter(Boolean).length,
      listenerCount: this.listeners.size,
      transcriptListenerActive: this.transcriptUnlisten != null,
      statusListenerActive: this.statusUnlisten != null,
      levelListenerActive: this.levelUnlisten != null,
      commandPollTimerActive: this.commandPollTimer != null,
      pauseCheckTimerActive: this.pauseCheckTimer != null,
      liveQuoteSearchTimerActive: this.liveQuoteSearchTimer != null,
      interimSearchTimerActive: this.interimSearchTimer != null,
      finalizedChunkCount: scriptureCounts.finalizedChunkCount,
      recentEmissionCount: scriptureCounts.recentEmissionCount,
      verseHistoryCount: scriptureCounts.verseHistoryCount,
      entryCount: this.snapshot.entries.length,
      candidateCount: this.snapshot.candidates.length,
      queueCount: this.snapshot.queue.length,
      suggestionCount: this.snapshot.suggestions.length,
      audioLevel: this.snapshot.inputLevel,
    };
  }

  /**
   * Change detection speed mode at runtime.
   * Takes effect immediately — no restart needed.
   */
  setDetectionSpeed(speed: DetectionSpeed): void {
    this.detectionSpeed = speed;
    this.snapshot = { ...this.snapshot, detectionSpeed: speed };
    this.pushStatus();
    invoke("set_assemblyai_stream_speed", { detectionSpeed: speed }).catch((err) => {
      console.warn("[LmDockService] Failed to update AssemblyAI stream speed:", err);
    });
  }

  /**
   * Get current detection speed.
   */
  getDetectionSpeed(): DetectionSpeed {
    return this.detectionSpeed;
  }
}

export const lmDockService = new LmDockService();
