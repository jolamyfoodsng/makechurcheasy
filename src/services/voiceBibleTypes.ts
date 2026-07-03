export type VoiceBibleStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "matching"
  | "no-match"
  | "error";

export type VoiceBibleAudioSourceMode = "system-mic" | "obs-input";
export type VoiceBibleSemanticMode = "off" | "ollama" | "local";
export type VoiceBibleModel = "large-v3";

/**
 * Detection speed mode — controls how aggressively the system searches
 * for scripture matches during live speech.
 *
 * - "fast": 3-word minimum, no sentence gate, 250ms debounce (live services)
 * - "balanced": 5-word minimum, 300ms debounce (default)
 * - "accurate": 8-word minimum, sentence boundary preferred (recordings)
 */
export type DetectionSpeed = "fast" | "balanced" | "accurate";

export const DETECTION_SPEED_CONFIG: Record<DetectionSpeed, {
  minWords: number;
  debounceMs: number;
  requireSentenceBoundary: boolean;
  label: string;
  icon: string;
  description: string;
}> = {
  fast: {
    minWords: 3,
    debounceMs: 250,
    requireSentenceBoundary: false,
    label: "Fast",
    icon: "",
    description: "Live services — searches after 3 words",
  },
  balanced: {
    minWords: 5,
    debounceMs: 300,
    requireSentenceBoundary: false,
    label: " Balanced",
    icon: "",
    description: "Default — searches after 5 words",
  },
  accurate: {
    minWords: 8,
    debounceMs: 400,
    requireSentenceBoundary: true,
    label: " Accurate",
    icon: "",
    description: "Recordings — waits for complete sentences",
  },
};

export interface VoiceBibleSettings {
  audioSourceMode: VoiceBibleAudioSourceMode;
  audioDeviceId?: string;
  obsInputName?: string;
  sttModel: VoiceBibleModel;
  semanticMode: VoiceBibleSemanticMode;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  ollamaNormalizerModel?: string;
  detectionSpeed: DetectionSpeed;
}

export interface VoiceBibleRuntimeStatus {
  modelReady: boolean;
  modelName: string;
  modelPath?: string | null;
}

export interface VoiceBibleInputOption {
  id: string;
  label: string;
}

export interface VoiceBibleObsInputOption {
  inputName: string;
  inputKind: string;
  label: string;
  deviceId?: string;
  deviceLabel?: string;
}

export interface VoiceBibleContextPayload {
  selectedBook?: string | null;
  selectedChapter?: number | null;
  selectedVerse?: number | null;
  translation: string;
  availableTranslations: Array<{ value: string; label: string }>;
  liveInterim?: boolean;
}

export type MatchSource = "alias" | "keyword" | "embedding" | "fuzzy";

/** Human-readable label and color for each match source */
export const MATCH_SOURCE_LABEL: Record<MatchSource, { label: string; color: string }> = {
  alias: { label: "Alias Match", color: "#4caf50" },
  keyword: { label: "Keyword Match", color: "#2196f3" },
  embedding: { label: "Semantic Match", color: "#ff9800" },
  fuzzy: { label: "Possible Match", color: "#9e9e9e" },
};

export interface VoiceBibleCandidate {
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  label: string;
  snippet: string;
  confidence: number;
  /** How this verse was found — controls display label and validation */
  source: MatchSource;
}

export interface VoiceBibleResult {
  action: "stage-verse" | "set-chapter" | "set-translation";
  transcript: string;
  detail?: string;
  confidence?: number;
  book?: string;
  chapter?: number;
  verse?: number;
  translation?: string;
}

export interface LmDockTelemetry {
  /** Timestamp of last speech received */
  lastSpeechAt: number;
  /** Timestamp of last search triggered */
  lastSearchAt: number;
  /** Timestamp of last results displayed */
  lastResultsAt: number;
  /** Latency: speech → search trigger (ms) */
  speechToSearchMs: number;
  /** Latency: search → results (ms) */
  searchToResultsMs: number;
  /** Total: speech → display (ms) */
  totalLatencyMs: number;
  /** Number of searches performed this session */
  searchCount: number;
  /** Average total latency (rolling) */
  avgLatencyMs: number;
}

export interface VoiceBibleSnapshot {
  status: VoiceBibleStatus;
  inputLevel?: number;
  detail?: string;
  transcript?: string;
  matchDetail?: string;
  matching?: boolean;
  error?: string;
  modelReady: boolean;
  semanticReady: boolean;
  sourceLabel?: string;
  candidates: VoiceBibleCandidate[];
  lastResult?: VoiceBibleResult | null;
}

export interface TranscriptEntry {
  id: string;
  text: string;
  finalized: boolean;
  startTime?: number;
  endTime?: number;
}
