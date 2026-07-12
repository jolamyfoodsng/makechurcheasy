import type { Slide } from "./types";

export type SmartImportMethod = "layout" | "ccc" | "numbered" | "titled" | "ai-reviewed";
export type SmartImportMode = "offline" | "online";
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
  confidence: number;
  method: SmartImportMethod;
  sections: SmartImportSectionDraft[];
  warnings: string[];
  reviewNotes: string[];
  rawExcerpt: string;
}

export interface SmartImportAnalysis {
  songs: SmartImportSongDraft[];
  warnings: string[];
  method: Exclude<SmartImportMethod, "ai-reviewed">;
  confidence: number;
  counts: {
    songs: number;
    sections: number;
    lines: number;
  };
}

export interface SmartImportAiReviewStatus {
  attempted: boolean;
  applied: boolean;
  error: string;
  mode: SmartImportMode;
}

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
