// ────────────────────────────────────────────────────────────────────────────
// Transcript Library – Types
//
// Completely separate from the Live Speech-to-Scripture feature.
// These types define the Transcript Library data model.
// ────────────────────────────────────────────────────────────────────────────

export interface Transcript {
  id: string;
  title: string;
  church: string;
  language: string;
  durationSeconds: number;
  transcriptText: string;
  sourceType: "imported-audio" | "imported-video" | "uploaded" | "transcription";
  scriptures: TranscriptScripture[];
  translations: TranscriptTranslation[];
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptScripture {
  id: string;
  transcriptId: string;
  reference: string;
  verseText: string;
  confidence: number;
}

export interface TranscriptTranslation {
  id: string;
  transcriptId: string;
  language: string;
  translatedText: string;
  createdAt: string;
}

export interface TranscriptLibraryStats {
  totalSessions: number;
  totalDurationFormatted: string;
  totalScriptures: number;
  usedThisMonth: string;
}

export type TranscriptSortField = "title" | "createdAt" | "durationSeconds" | "church";
export type TranscriptSortDir = "asc" | "desc";

export interface TranscriptFilters {
  search: string;
  language: string;
  sourceType: string;
  sortBy: TranscriptSortField;
  sortDir: TranscriptSortDir;
}
