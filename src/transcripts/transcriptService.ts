// ────────────────────────────────────────────────────────────────────────────
// Transcript Library – Data Service
//
// MongoDB is the source of truth. IndexedDB is the offline read cache.
// Writes always go to the MongoDB API; on success the local cache is updated.
// On network failure, reads fall back to IndexedDB.
// ────────────────────────────────────────────────────────────────────────────

import type {
  Transcript,
  TranscriptScripture,
  TranscriptTranslation,
  TranscriptLibraryStats,
} from "./transcriptTypes";
import { STORES, getAll, putRecord, deleteRecord } from "../services/db";
import { getDeviceId } from "../services/authService";

// ── Config ───────────────────────────────────────────────────────────────────

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.makechurcheasy.creatorstudioslabs.stream";

// ── UUID helper ──────────────────────────────────────────────────────────────
function uid(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

// ── API helper ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const deviceId = getDeviceId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(deviceId ? { "X-Device-Id": deviceId } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API ${res.status}`);
  }

  return res.json();
}

// ── IndexedDB cache helpers ──────────────────────────────────────────────────

async function cacheAll(transcripts: Transcript[]): Promise<void> {
  for (const t of transcripts) {
    await putRecord(STORES.TRANSCRIPTS, t, t.id);
  }
}

async function cacheOne(transcript: Transcript): Promise<void> {
  await putRecord(STORES.TRANSCRIPTS, transcript, transcript.id);
}

async function removeCached(id: string): Promise<void> {
  await deleteRecord(STORES.TRANSCRIPTS, id);
}

async function getCachedAll(): Promise<Transcript[]> {
  return getAll<Transcript>(STORES.TRANSCRIPTS);
}

// ── Duration formatting ──────────────────────────────────────────────────────
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function formatDurationLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

// ── Backend commands ─────────────────────────────────────────────────────────

export async function loadTranscripts(): Promise<Transcript[]> {
  try {
    const data = await apiFetch<{ transcripts: Transcript[] }>("/api/transcripts");
    const transcripts = data.transcripts || [];
    // Update local cache in background
    cacheAll(transcripts).catch(() => { });
    return transcripts;
  } catch (err) {
    console.warn("[TranscriptService] API fetch failed, falling back to IndexedDB:", err);
    return getCachedAll();
  }
}

export async function saveTranscript(transcript: Transcript): Promise<{ ok: boolean; error?: string }> {
  const updated = { ...transcript, updatedAt: new Date().toISOString() };

  try {
    await apiFetch("/api/transcripts", {
      method: "POST",
      body: JSON.stringify({ transcript: updated }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[TranscriptService] API save failed, caching locally:", msg);
    // Always update local cache even on API failure
    await cacheOne(updated);
    return { ok: false, error: msg };
  }

  await cacheOne(updated);
  return { ok: true };
}

export async function deleteTranscript(id: string): Promise<void> {
  try {
    await apiFetch(`/api/transcripts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch (err) {
    console.warn("[TranscriptService] API delete failed, removing locally:", err);
  }

  await removeCached(id);
}

export async function getTranscriptStats(): Promise<TranscriptLibraryStats> {
  try {
    const transcripts = await loadTranscripts();
    const totalDuration = transcripts.reduce((sum, t) => sum + (t.durationSeconds || 0), 0);
    const totalScriptures = transcripts.reduce((sum, t) => sum + (t.scriptures?.length || 0), 0);
    return {
      totalSessions: transcripts.length,
      totalDurationFormatted: formatDuration(totalDuration),
      totalScriptures,
      usedThisMonth: formatDuration(totalDuration),
    };
  } catch {
    return { totalSessions: 0, totalDurationFormatted: "0m", totalScriptures: 0, usedThisMonth: "0m" };
  }
}

// ── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Estimate duration in seconds for imported transcripts without audio duration.
 * Assumes 150 words ≈ 1 minute of speech.
 */
export function estimateDurationSeconds(wordCount: number): number {
  return Math.ceil(wordCount / 150) * 60;
}

export function createTranscript(partial: Partial<Transcript> & { title: string }): Transcript {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: partial.title,
    church: partial.church ?? "",
    language: partial.language ?? "English",
    durationSeconds: partial.durationSeconds ?? 0,
    transcriptText: partial.transcriptText ?? "",
    sourceType: partial.sourceType ?? "uploaded",
    scriptures: partial.scriptures ?? [],
    translations: partial.translations ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addScriptureToTranscript(
  transcript: Transcript,
  reference: string,
  verseText: string,
  confidence: number,
): Transcript {
  const scripture: TranscriptScripture = {
    id: uid(),
    transcriptId: transcript.id,
    reference,
    verseText,
    confidence,
  };
  return { ...transcript, scriptures: [...transcript.scriptures, scripture] };
}

export function addTranslationToTranscript(
  transcript: Transcript,
  language: string,
  translatedText: string,
): Transcript {
  const translation: TranscriptTranslation = {
    id: uid(),
    transcriptId: transcript.id,
    language,
    translatedText,
    createdAt: new Date().toISOString(),
  };
  return { ...transcript, translations: [...transcript.translations, translation] };
}
