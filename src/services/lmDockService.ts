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

import { dockBridge } from "./dockBridge";
import { ScriptureDetectionEngine } from "./scriptureEngine";
import {
  createScriptureSpeechState,
  isLikelyScriptureReferenceAttempt,
  resolveScriptureSpeech,
  type ScriptureSpeechState,
} from "./scriptureParser";
import { getOverlayBaseUrl } from "./overlayUrl";
import { getSettings as getMvSettings } from "../multiview/mvStore";
import type { VoiceBibleCandidate, TranscriptEntry, DetectionSpeed, LmDockTelemetry } from "./voiceBibleTypes";
import { DETECTION_SPEED_CONFIG } from "./voiceBibleTypes";
import { hasTauriInvoke, safeTauriInvoke, safeTauriListen, type TauriUnlisten } from "./tauriSafe";

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
  queue: VoiceBibleCandidate[];      // High-confidence detections waiting for explicit user action
  suggestions: VoiceBibleCandidate[]; // Manual push only (quote matches)
  matching: boolean;
  error?: string;
  inputLevel: number;
  startedAt?: number;
  detectionSpeed: DetectionSpeed;
  telemetry?: LmDockTelemetry;
}

/** Suggestions are provisional and must be materially stronger than noise. */
const MIN_LIVE_QUOTE_CONFIDENCE = 0.55;
const MIN_SILENCE_QUOTE_CONFIDENCE = 0.08;

type QuoteSearchMode = "strict" | "closest";

interface QueueQuoteSearchOptions {
  mode?: QuoteSearchMode;
}

/**
 * A live quote search is provisional. An empty result can be caused by the
 * next few spoken words not being enough to match yet, so it must not erase a
 * suggestion that is still waiting for the operator to click it. Suggestions
 * are replaced by the next positive result and explicitly cleared when the
 * listening session stops.
 */
export function retainSuggestionsUntilReplacement(
  current: VoiceBibleCandidate[],
  next: VoiceBibleCandidate[],
): VoiceBibleCandidate[] {
  return next.length > 0 ? next.slice(0, 20) : current;
}

type SnapshotListener = (snapshot: LmDockSnapshot) => void;

class LmStartupTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LmStartupTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new LmStartupTimeoutError(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function isLocalStartupFailure(message: string): boolean {
  return /microphone|mic|audio stream|input device|permission|timed out|timeout|default input|enumerate devices/i.test(message);
}

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
    detectionSpeed: "sharp",
  };

  // Audio refs — Rust-side AssemblyAI realtime STT (via Tauri commands)
  private transcriptUnlisten: TauriUnlisten | null = null;
  private statusUnlisten: TauriUnlisten | null = null;
  private levelUnlisten: TauriUnlisten | null = null;
  private trayStopUnlisten: TauriUnlisten | null = null;
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
  /** Resolved overlay base URL (http://127.0.0.1:<port>) — set once at init */
  private overlayBaseUrl: string | null = null;
  /** The relay only needs the newest snapshot; serialize writes to prevent stale posts winning. */
  private relayPostInFlight = false;
  private relayPendingPayload: Record<string, unknown> | null = null;

  /** User intent survives an unexpected native stream close, but never a manual stop. */
  private shouldKeepListening = false;
  private activeMicId: string | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private nativeStopPromise: Promise<void> | null = null;

  // ── Sentence detection state ──────────────────────────────────────────────
  /** Accumulated text for the current sentence (across ASR finals) */
  private sentenceBuffer = "";
  /** Monotonically increasing search ID — discards stale results */
  private latestSearchId = 0;
  private static readonly PAUSE_THRESHOLD_MS = 450;
  private static readonly LIVE_QUOTE_SEARCH_WINDOW_WORDS = 18;
  /** The dock only renders recent lines; never serialize an entire service into each live relay packet. */
  private static readonly MAX_RELAY_TRANSCRIPT_ENTRIES = 60;
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly RECONNECT_DELAYS_MS = [750, 1_500, 3_000, 5_000, 8_000];
  private static readonly MIC_START_TIMEOUT_MS = 12_000;
  private lastQueuedQuoteSearchKey = "";
  private lastQueuedQuoteSearchAt = 0;

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

  // ── Detection profile ─────────────────────────────────────────────────────
  /** Fixed sharp detection mode. Kept as a typed field for Rust/settings compatibility. */
  private detectionSpeed: DetectionSpeed = "sharp";
  /** Cached sharp-profile config */
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

      this.queueQuoteSearch(pending);
    }, delay);
  }

  private queueQuoteSearch(text: string, options: QueueQuoteSearchOptions = {}): void {
    const trimmed = text.trim();
    if (trimmed.length < 10) return;

    const mode = options.mode ?? "strict";
    const now = Date.now();
    const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
    const key = `${mode}:${normalized}`;
    if (key === this.lastQueuedQuoteSearchKey && now - this.lastQueuedQuoteSearchAt < 1_000) {
      return;
    }

    this.lastQueuedQuoteSearchKey = key;
    this.lastQueuedQuoteSearchAt = now;
    this.matchingQueue = this.matchingQueue.then(() =>
      this.runQuoteSearchWithText(trimmed, now, { mode }),
    );
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

    // The macOS menu-bar VoiceAI action must use the same stop path as the
    // in-app button so reconnection, timers, listeners, and native capture are
    // all shut down together.
    void safeTauriListen("voiceai-tray-stop", () => {
      this.stopListening();
    }).then((unlisten) => {
      if (!this.initialized) {
        unlisten();
        return;
      }
      this.trayStopUnlisten = unlisten;
    }).catch(() => {
      // Browser/dock contexts do not expose Tauri events.
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
      this.trayStopUnlisten?.();
      this.trayStopUnlisten = null;
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
        entries: this.snapshot.entries.slice(-LmDockService.MAX_RELAY_TRANSCRIPT_ENTRIES),
      },
      timestamp: Date.now(),
    });
    this.postToRelay();
  }

  /** POST snapshot to overlay server relay for cross-process LM Dock communication */
  private postToRelay(): void {
    this.relayPendingPayload = {
      status: this.snapshot.status,
      entries: this.snapshot.entries.slice(-LmDockService.MAX_RELAY_TRANSCRIPT_ENTRIES),
      candidates: this.snapshot.candidates,
      queue: this.snapshot.queue,
      suggestions: this.snapshot.suggestions,
      matching: this.snapshot.matching,
      error: this.snapshot.error,
    };
    void this.flushRelaySnapshot();
  }

  private async flushRelaySnapshot(): Promise<void> {
    if (this.relayPostInFlight) return;
    this.relayPostInFlight = true;

    try {
      while (this.relayPendingPayload) {
        const payload = this.relayPendingPayload;
        this.relayPendingPayload = null;
        const baseUrl = this.overlayBaseUrl || await getOverlayBaseUrl();
        this.overlayBaseUrl = baseUrl;

        const response = await fetch(`${baseUrl}/api/lm-state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          console.warn("[lmDockService] postToRelay HTTP", response.status, response.statusText);
        }
      }
    } catch (err) {
      console.warn("[lmDockService] postToRelay failed:", err);
    } finally {
      this.relayPostInFlight = false;
      // A snapshot may arrive between the final loop check and clearing the lock.
      if (this.relayPendingPayload) void this.flushRelaySnapshot();
    }
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
        // - source=reference OR confidence >= 0.90 → queue for explicit push
        // - navigationOnly (chapter-only open) → suggestions only (no auto-push)
        // - confidence >= 0.75 → suggestion
        // - confidence < 0.75 → low-confidence suggestion
      const isReferenceCommand = result.matches.some((m) => m.source === "reference");
      const highConfidence = result.matches.some((m) => m.confidence >= 0.90);
      const isNavigationOnly = result.matches.some((m) => m.navigationOnly === true);

      if ((isReferenceCommand || highConfidence) && !isNavigationOnly) {
        const existingQueueKeys = new Set(this.snapshot.queue.map((c) => `${c.book}:${c.chapter}:${c.verse}`));
        const uniqueNew = newCandidates.filter((c) => !existingQueueKeys.has(`${c.book}:${c.chapter}:${c.verse}`));

        // Always place the newest match at the front so the user's Push click
        // targets the most recent navigation result, even if the verse already
        // existed in the queue (e.g. navigating back then forward again).
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
    if (ref || isLikelyScriptureReferenceAttempt(text)) {
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

      for (const sentence of complete) {
        this.queueQuoteSearch(sentence, { mode: "closest" });
      }

      if (trailing.trim().length >= 10) {
        this.queueQuoteSearch(trailing, { mode: "closest" });
        this.sentenceBuffer = "";
      }
    } else {
      // AssemblyAI marks end_of_turn after silence, so even an incomplete
      // phrase should search once the speaker pauses.
      const trimmed = this.sentenceBuffer.trim();
      if (trimmed.length >= 10) {
        this.queueQuoteSearch(trimmed, { mode: "closest" });
        this.sentenceBuffer = "";
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

    this.queueQuoteSearch(trimmed, { mode: "closest" });
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
  private async runQuoteSearchWithText(
    text: string,
    _transcriptTimestamp: number,
    options: QueueQuoteSearchOptions = {},
  ): Promise<void> {
    if (this.snapshot.status === "idle") return;

    // Cancel any in-flight search — we only care about the latest
    this.scriptureEngine.cancelQuoteSearchPublic();

    const searchId = ++this.latestSearchId;
    const boundPassage = this.scriptureEngine.getBoundPassage();
    const searchStartedAt = Date.now();
    this.telemetry.lastSearchAt = searchStartedAt;
    this.telemetry.speechToSearchMs = this.lastSpeechReceivedAt > 0
      ? searchStartedAt - this.lastSpeechReceivedAt
      : this.telemetry.speechToSearchMs;


    this.snapshot = { ...this.snapshot, matching: true };
    this.pushStatus();

    try {
      const quoteMatches = await this.scriptureEngine.searchQuotesWithText(
        text,
        boundPassage,
        { mode: options.mode ?? "strict" },
      );

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

      const minConfidence = options.mode === "closest"
        ? MIN_SILENCE_QUOTE_CONFIDENCE
        : MIN_LIVE_QUOTE_CONFIDENCE;
      const usableQuoteMatches = quoteMatches.filter((match) => match.confidence >= minConfidence);

      if (usableQuoteMatches.length > 0) {
        // Replace suggestions only when a newer search has a real match.
        // Empty interim searches must not remove a clickable suggestion.
        const suggestions = retainSuggestionsUntilReplacement(
          this.snapshot.suggestions,
          usableQuoteMatches.map((m) => m.candidate),
        );
        const candidates = [...this.snapshot.queue, ...suggestions].slice(0, 20);
        this.snapshot = { ...this.snapshot, suggestions, candidates };
        this.telemetry.lastResultsAt = Date.now();
        this.telemetry.totalLatencyMs = this.lastSpeechReceivedAt > 0
          ? searchCompletedAt - this.lastSpeechReceivedAt
          : this.telemetry.searchToResultsMs;
        this.pushCandidates();
      } else {
        // Keep the previous suggestion visible. The dock owns its configured
        // suggestion lifetime, and the next partial search may simply be too
        // short to match while the pastor is still speaking.
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

  // ── Start / Stop ────────────────────────────────────────────────────────

  private recoverFromUnexpectedStreamEnd(reason: string): void {
    if (!this.shouldKeepListening || this.reconnectTimer) return;

    const isConfigurationFailure = /api key|unauthori[sz]ed|forbidden|invalid.*key/i.test(reason);
    if (isConfigurationFailure) {
      this.shouldKeepListening = false;
      void this.cleanup();
      return;
    }

    const nextAttempt = this.reconnectAttempts + 1;
    if (nextAttempt > LmDockService.MAX_RECONNECT_ATTEMPTS) {
      this.shouldKeepListening = false;
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        error: "Speech connection stopped. Start listening again to retry.",
      };
      this.pushStatus();
      void this.cleanup();
      return;
    }

    this.reconnectAttempts = nextAttempt;
    void this.cleanup().finally(() => {
      if (!this.shouldKeepListening || this.reconnectTimer) return;

      const delay = LmDockService.RECONNECT_DELAYS_MS[nextAttempt - 1] ?? 8_000;
      this.snapshot = {
        ...this.snapshot,
        status: "connecting",
        error: `Reconnecting speech service (${nextAttempt}/${LmDockService.MAX_RECONNECT_ATTEMPTS})…`,
      };
      this.pushStatus();

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.shouldKeepListening) return;
        void this.startListening(this.activeMicId, { reconnect: true });
      }, delay);
    });
  }

  async startListening(micId?: string, options: { reconnect?: boolean } = {}): Promise<void> {
    if (!options.reconnect) {
      this.shouldKeepListening = true;
      this.reconnectAttempts = 0;
    }
    this.activeMicId = micId;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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

    this.detectionSpeed = "sharp";

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
    this.lastQueuedQuoteSearchKey = "";
    this.lastQueuedQuoteSearchAt = 0;
    this.pushStatus();

    try {
      if (!hasTauriInvoke()) {
        throw new Error("Speech listening must run inside the desktop app so the microphone engine can start.");
      }
      if (token !== this.sessionToken) return;

      // Heavy scripture data must not block microphone startup. The first
      // transcript can still trigger lazy loading if this has not finished yet.
      void this.scriptureEngine.preload().catch((err) => {
        console.warn("[LmDockService] Scripture preload failed:", err);
      });

      // Check if offline - warm the Whisper model without blocking mic startup.
      if (!navigator.onLine) {
        void import("./whisperService")
          .then(({ loadWhisperModel }) => loadWhisperModel())
          .catch((err) => {
            console.warn("[LmDockService] Whisper preload failed:", err);
          });
      }

      const apiKey = getAssemblyAiKey();
      if (!apiKey) {
        throw new Error("No speech service API key configured");
      }

      // Listen for transcript events from Rust backend
      this.transcriptUnlisten = await safeTauriListen<{
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
          this.lastSpeechTime = Date.now();

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

          // Run scripture engine on interim text for live reference commands
          // such as "John three sixteen" while quote search continues below.
          if (interimRef || (!this.speedConfig.requireSentenceBoundary && text.length >= 8)) {
            void this.processChunk(text, false);
          }

          // Provisional quote search on interim text — surfaces Bible
          // matches before the sentence is finalized by AssemblyAI.
          // Uses a throttle so updates can happen during speech instead of
          // waiting for a full pause.
          //
          // The fixed best profile searches after enough words are present
          // and throttles updates so live speech stays responsive.
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
      this.statusUnlisten = await safeTauriListen<{ status: string }>(
        "assemblyai-status",
        (event) => {
          if (token !== this.sessionToken) return;
          const { status } = event.payload;
          if (status === "connected") {
            this.reconnectAttempts = 0;
            this.snapshot = { ...this.snapshot, status: "listening" };
            this.pushStatus();
          } else if (status.startsWith("error")) {
            this.snapshot = { ...this.snapshot, status: "error", error: status };
            this.pushStatus();
            this.recoverFromUnexpectedStreamEnd(status);
          } else if (status === "stopped") {
            this.snapshot = { ...this.snapshot, status: "idle" };
            this.pushStatus();
            this.recoverFromUnexpectedStreamEnd("The speech connection closed unexpectedly.");
          }
        },
      );
      if (token !== this.sessionToken) {
        await this.cleanup();
        return;
      }

      // Listen for audio level events from Rust backend
      this.levelUnlisten = await safeTauriListen<{ level: number }>(
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

          // Trigger search quickly after a short pause with enough content.
          if (silenceMs > 180 && (this.speechBuffer.length > 8 || wordCount >= this.speedConfig.minWords)) {
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
      const nativeStartPromise = safeTauriInvoke("start_assemblyai_stream", {
        apiKey,
        deviceId: micId || null,
        detectionSpeed: this.detectionSpeed,
      });
      void nativeStartPromise
        .then(() => {
          if (token !== this.sessionToken) {
            void this.cleanup();
          }
        })
        .catch(() => {
          // The awaited path below owns visible errors.
        });
      await withTimeout(
        nativeStartPromise,
        LmDockService.MIC_START_TIMEOUT_MS,
        "Microphone start timed out. Check macOS microphone permission or choose another input.",
      );
      if (token !== this.sessionToken) {
        await this.cleanup();
        return;
      }
      if (this.snapshot.status === "requesting-mic") {
        this.snapshot = { ...this.snapshot, status: "connecting" };
        this.pushStatus();
      }
      // Apply current gain (separate call so it's live-updatable)
      await safeTauriInvoke("set_microphone_gain", { gain: gainMultiplier }).catch(() => { });
    } catch (err) {
      if (token !== this.sessionToken) {
        return;
      }
      console.warn("[LmDockService] Failed to start listening:", err);
      const msg = err instanceof Error ? err.message : String(err);
      const stopStartup = err instanceof LmStartupTimeoutError || isLocalStartupFailure(msg);
      if (stopStartup) {
        this.shouldKeepListening = false;
        this.startInFlight = false;
        if (err instanceof LmStartupTimeoutError) {
          this.sessionToken++;
        }
        void this.cleanup();
      }
      this.snapshot = { ...this.snapshot, status: "error", error: msg };
      this.pushStatus();
      if (!stopStartup) {
        this.recoverFromUnexpectedStreamEnd(msg);
      }
    } finally {
      if (token === this.sessionToken) {
        this.startInFlight = false;
      }
    }
  }

  stopListening(): void {
    this.shouldKeepListening = false;
    this.activeMicId = undefined;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
    this.lastQueuedQuoteSearchKey = "";
    this.lastQueuedQuoteSearchAt = 0;
    this.latestSearchId++;
    this.liveQuoteSearchPendingText = "";
    this.lastLevelNotifyAt = 0;
    this.lastLevelValue = 0;

    void this.cleanup();

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
    await safeTauriInvoke("set_microphone_gain", { gain }).catch(() => { });
  }

  private cleanup(): Promise<void> {
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

    // Stop Rust-side AssemblyAI realtime STT (mic capture + transcription task).
    // Keep one shared promise so a reconnect never races a previous shutdown.
    if (!this.nativeStopPromise) {
      this.nativeStopPromise = safeTauriInvoke("stop_assemblyai_stream")
        .then(() => undefined)
        .catch((err) => {
          console.warn("[LmDockService] Failed to stop voice stream:", err);
        })
        .finally(() => {
          this.nativeStopPromise = null;
        });
    }
    return this.nativeStopPromise;
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
      if (!hasTauriInvoke()) {
        return [{ id: "", label: "Default microphone" }];
      }
      const devices = await safeTauriInvoke<Array<{ id: string; name: string; is_default: boolean }>>(
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
   * Compatibility shim for older UI/settings callers. The runtime always uses
   * the fixed sharp profile.
   */
  setDetectionSpeed(_speed: DetectionSpeed): void {
    const speed: DetectionSpeed = "sharp";
    this.detectionSpeed = speed;
    this.snapshot = { ...this.snapshot, detectionSpeed: speed };
    this.pushStatus();
    safeTauriInvoke("set_assemblyai_stream_speed", { detectionSpeed: speed }).catch((err) => {
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
