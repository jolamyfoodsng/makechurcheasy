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

export interface VoiceBibleSettings {
  audioSourceMode: VoiceBibleAudioSourceMode;
  audioDeviceId?: string;
  obsInputName?: string;
  sttModel: VoiceBibleModel;
  semanticMode: VoiceBibleSemanticMode;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  ollamaNormalizerModel?: string;
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
