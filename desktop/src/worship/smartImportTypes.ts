import type { Slide } from "./types";

export type SmartImportMethod = "ai" | "fallback";
export type SmartImportSectionType =
  | Slide["type"]
  | "refrain";

export interface SmartImportSectionDraft {
  id: string;
  type: SmartImportSectionType;
  label: string;
  number?: string;
  content: string;
  warnings: string[];
}

export interface SmartImportSongDraft {
  id: string;
  title: string;
  hymnNumber?: string;
  artist?: string;
  language?: string;
  method: SmartImportMethod;
  sections: SmartImportSectionDraft[];
  warnings: string[];
  reviewNotes: string[];
  rawExcerpt: string;
}

// ── Legacy review types (still referenced by legacy/ files) ──

export interface SmartImportRuntimeStatus {
  online: boolean;
  aiConfigured: boolean;
  aiReady: boolean;
}

export interface SmartImportReviewBatchRequest {
  songs: Array<{
    id: string;
    title: string;
    hymnNumber?: string;
    language?: string;
    confidence: number;
    rawText: string;
    warnings: string[];
    sectionHints: Array<{
      label: string;
      type: SmartImportSectionType;
      content: string;
    }>;
  }>;
}

export interface SmartImportReviewBatchResponse {
  songs: Array<{
    id: string;
    title?: string;
    hymnNumber?: string;
    confidence?: number;
    warnings?: string[];
    reviewNotes?: string[];
    sections?: Array<{
      type?: SmartImportSectionType;
      label?: string;
      number?: string;
      content?: string;
      warnings?: string[];
    }>;
  }>;
}

// ── AI-first processing types ──

export interface BulkImportChunkRequest {
  chunkIndex: number;
  totalChunks: number;
  text: string;
}

export interface TextChunk {
  index: number;
  total: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface AiProcessResult {
  songs: SmartImportSongDraft[];
  warnings: string[];
  aiUsed: boolean;
  needsReview: boolean;
  stats: {
    totalChunks: number;
    aiChunks: number;
    fallbackChunks: number;
    provider: string;
    durationMs: number;
  };
}

export interface ImportSession {
  id: string;
  fileName: string;
  fileType: string;
  extractedText: string;
  completedChunks: number[];
  pendingChunks: number[];
  timestamp: number;
  status: "in_progress" | "completed" | "abandoned";
}
