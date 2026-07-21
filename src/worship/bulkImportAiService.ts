import { invoke } from "@tauri-apps/api/core";
import { buildFallbackDraft } from "./smartImportService";
import type {
  AiProcessResult,
  BulkImportChunkRequest,
  SmartImportSectionType,
  SmartImportSongDraft,
  TextChunk,
} from "./smartImportTypes";

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.creatorstudioslabs.stream";

const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const CHUNK_SIZE = 15_000;
const CHUNK_OVERLAP = 1_500;
const MAX_RETRIES = 2;

// ── Provider abstraction ──

export interface DocumentStructureProvider {
  readonly name: string;
  structureChunk(request: BulkImportChunkRequest): Promise<{ songs: SmartImportSongDraft[] }>;
}

// ── Chunking ──

function chunkText(text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  if (!text) return chunks;

  let startOffset = 0;
  let index = 0;

  while (startOffset < text.length) {
    const endOffset = Math.min(startOffset + CHUNK_SIZE, text.length);
    const chunkText = text.slice(startOffset, endOffset);
    chunks.push({ index, total: 0, text: chunkText, startOffset, endOffset });
    startOffset += CHUNK_SIZE - CHUNK_OVERLAP;
    index++;
  }

  for (const chunk of chunks) {
    chunk.total = chunks.length;
  }

  return chunks;
}

// ── Simple overlap dedup ──

function isDuplicate(a: SmartImportSongDraft, b: SmartImportSongDraft): boolean {
  const aTitle = a.title.trim().toLowerCase();
  const bTitle = b.title.trim().toLowerCase();
  if (!aTitle || !bTitle) return false;
  if (aTitle !== bTitle) return false;

  if (a.hymnNumber && b.hymnNumber && a.hymnNumber !== b.hymnNumber) return false;

  const aFirst = a.sections[0]?.content.trim().slice(0, 100);
  const bFirst = b.sections[0]?.content.trim().slice(0, 100);
  if (aFirst && bFirst && aFirst !== bFirst) return false;

  return true;
}

function mergeChunkResults(chunks: ChunkResult[]): SmartImportSongDraft[] {
  const merged: SmartImportSongDraft[] = [];

  for (const result of chunks) {
    for (const song of result.songs) {
      const last = merged[merged.length - 1];
      if (last && isDuplicate(last, song)) {
        continue;
      }
      merged.push(song);
    }
  }

  return merged;
}

// ── Per-chunk retry ──

interface ChunkResult {
  songs: SmartImportSongDraft[];
  fallback: boolean;
  error?: string;
}

function isRateLimitFallback(error?: string): boolean {
  if (!error) return false;
  return /returned 429|freeusagelimiterror|rate limit exceeded/i.test(error);
}

async function processChunk(
  chunk: TextChunk,
  provider: DocumentStructureProvider,
  fileName: string,
): Promise<ChunkResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await provider.structureChunk({
        chunkIndex: chunk.index,
        totalChunks: chunk.total,
        text: chunk.text,
      });
      return { songs: response.songs, fallback: false };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      const fallback = buildFallbackDraft(chunk.text, `${fileName} (chunk ${chunk.index + 1})`);
      return {
        songs: fallback,
        fallback: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const fallback = buildFallbackDraft(chunk.text, `${fileName} (chunk ${chunk.index + 1})`);
  return { songs: fallback, fallback: true, error: "Max retries exceeded" };
}

// ── Main entry point ──

export async function processDocumentWithAi(
  rawText: string,
  fileName: string,
  providerOverride?: DocumentStructureProvider,
): Promise<AiProcessResult> {
  const startTime = Date.now();

  const provider: DocumentStructureProvider = providerOverride ?? new NoopProvider();

  const text = rawText.trim();
  if (!text) {
    return {
      songs: [],
      warnings: ["No text content to process."],
      aiUsed: false,
      needsReview: false,
      stats: { totalChunks: 0, aiChunks: 0, fallbackChunks: 0, provider: provider.name, durationMs: 0 },
    };
  }

  const chunks = chunkText(text);

  if (chunks.length === 0) {
    return {
      songs: buildFallbackDraft(text, fileName),
      warnings: [],
      aiUsed: false,
      needsReview: false,
      stats: { totalChunks: 0, aiChunks: 0, fallbackChunks: 0, provider: provider.name, durationMs: Date.now() - startTime },
    };
  }

  const results: ChunkResult[] = [];
  for (const chunk of chunks) {
    const result = await processChunk(chunk, provider, fileName);
    results.push(result);
  }

  const songs = mergeChunkResults(results);
  const aiChunks = results.filter((r) => !r.fallback).length;
  const fallbackChunks = results.filter((r) => r.fallback).length;

  const warnings: string[] = [];
  if (fallbackChunks > 0) {
    const rateLimitedChunks = results.filter((result) => result.fallback && isRateLimitFallback(result.error)).length;
    const manualReviewChunks = fallbackChunks - rateLimitedChunks;

    if (rateLimitedChunks > 0) {
      warnings.push(
        `${rateLimitedChunks} section${rateLimitedChunks === 1 ? "" : "s"} fell back because the AI provider rate limit was exceeded. Retry later.`,
      );
    }
    if (manualReviewChunks > 0) {
      warnings.push(
        `${manualReviewChunks} section${manualReviewChunks === 1 ? "" : "s"} require${manualReviewChunks === 1 ? "s" : ""} manual review`,
      );
    }
    for (const result of results) {
      if (result.fallback && result.error) {
        warnings.push(`Chunk ${results.indexOf(result) + 1}: ${result.error}`);
      }
    }
  }

  return {
    songs,
    warnings,
    aiUsed: aiChunks > 0,
    needsReview: fallbackChunks > 0,
    stats: {
      totalChunks: chunks.length,
      aiChunks,
      fallbackChunks,
      provider: provider.name,
      durationMs: Date.now() - startTime,
    },
  };
}

// ── Noop provider (fallback) ──

class NoopProvider implements DocumentStructureProvider {
  readonly name = "noop";

  async structureChunk(_request: BulkImportChunkRequest): Promise<{ songs: SmartImportSongDraft[] }> {
    throw new Error("No AI provider configured");
  }
}

interface LocalWorshipImportAiStatus {
  aiConfigured: boolean;
  model: string;
}

interface LocalStructuredSongResponse {
  title: string;
  hymnNumber?: string;
  warnings?: string[];
  sections: Array<{
    type: string;
    label?: string;
    number?: string;
    content: string;
  }>;
}

interface LocalWorshipImportStructureResponse {
  songs: LocalStructuredSongResponse[];
}

class TauriOpenCodeProvider implements DocumentStructureProvider {
  readonly name = "opencode-local";

  async structureChunk(request: BulkImportChunkRequest): Promise<{ songs: SmartImportSongDraft[] }> {
    const response = await invoke<LocalWorshipImportStructureResponse>("structure_worship_import_chunk", {
      request,
    });

    return {
      songs: response.songs.map((song) => ({
        id: generateId(),
        title: song.title,
        hymnNumber: song.hymnNumber,
        sections: song.sections.map((section) => ({
          id: generateId(),
          type: normalizeSectionType(section.type),
          label: section.label ?? capitalize(section.type),
          number: section.number,
          content: section.content,
          warnings: [],
        })),
        method: "ai" as const,
        warnings: song.warnings ?? [],
        reviewNotes: [],
        rawExcerpt: request.text.slice(0, 2400),
      })),
    };
  }
}

async function ensureLocalWorshipImportAiConfigured(): Promise<void> {
  const status = await invoke<LocalWorshipImportAiStatus>("get_worship_import_ai_status");
  if (!status.aiConfigured) {
    throw new Error("Local worship import AI is not configured. Set OPENCODE_API_KEY for the desktop app.");
  }
}

export async function processDocumentLocally(
  text: string,
  fileName: string,
): Promise<AiProcessResult> {
  await ensureLocalWorshipImportAiConfigured();
  return processDocumentWithAi(text, fileName, new TauriOpenCodeProvider());
}

// ── API-based processing (desktop → backend API → AI provider) ──

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeSectionType(raw: string): SmartImportSectionType {
  const type = raw.trim().toLowerCase();
  if (
    [
      "verse", "chorus", "bridge", "tag", "pre-chorus", "intro", "outro",
      "other", "refrain", "stanza", "response", "solo", "congregation",
      "men", "women", "all", "leader", "choir",
    ].includes(type)
  ) {
    return type as SmartImportSectionType;
  }
  if (["c", "ch", "hook"].includes(type)) return "chorus";
  if (["v", "v1", "v2", "v3", "v4", "v5"].includes(type)) return "verse";
  if (["pre", "build"].includes(type)) return "pre-chorus";
  return "other";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface WorshipApiResponse {
  success: boolean;
  provider: string;
  processingTimeMs: number;
  chunksProcessed: number;
  fallbackChunks: number;
  needsReview: boolean;
  songs: Array<{
    title: string;
    hymnNumber?: string;
    sections: Array<{
      type: string;
      label?: string;
      number?: string;
      content: string;
    }>;
    warnings?: string[];
  }>;
  warnings: string[];
  stats?: {
    fileSizeBytes: number;
    pageCount: number;
    extractedCharCount: number;
    pageGroups: number;
    ocrPageCount: number;
  };
}

function mapApiSongsToDrafts(
  data: WorshipApiResponse,
  rawExcerpt: string,
): SmartImportSongDraft[] {
  return data.songs.map((song) => ({
    id: generateId(),
    title: song.title,
    hymnNumber: song.hymnNumber,
    sections: song.sections.map((section) => ({
      id: generateId(),
      type: normalizeSectionType(section.type),
      label: section.label ?? capitalize(section.type),
      number: section.number,
      content: section.content,
      warnings: [],
    })),
    method: "ai" as const,
    warnings: song.warnings ?? [],
    reviewNotes: [],
    rawExcerpt,
  }));
}

function resultFromApi(data: WorshipApiResponse, rawExcerpt: string): AiProcessResult {
  return {
    songs: mapApiSongsToDrafts(data, rawExcerpt),
    warnings: data.warnings,
    aiUsed: data.chunksProcessed > 0 && data.fallbackChunks < data.chunksProcessed,
    needsReview: data.needsReview,
    stats: {
      totalChunks: data.chunksProcessed,
      aiChunks: data.chunksProcessed - data.fallbackChunks,
      fallbackChunks: data.fallbackChunks,
      provider: data.provider,
      durationMs: data.processingTimeMs ?? 0,
    },
  };
}

async function getDeviceAuth(): Promise<{ deviceId: string; deviceSecret: string }> {
  const { getDeviceId, getDeviceSecret } = await import("../services/authService");
  const deviceId = getDeviceId();
  if (!deviceId) {
    throw new Error("Device not paired. Please pair your device first.");
  }
  return { deviceId, deviceSecret: getDeviceSecret() || "" };
}

/** Upload the original file to the API for server-side extraction + AI processing. */
export async function processFileViaUpload(
  file: File,
  onProgress?: (progress: number, label: string) => void,
): Promise<AiProcessResult> {
  const { deviceId, deviceSecret } = await getDeviceAuth();

  const url = `${API_BASE}/api/v1/worship/import?deviceId=${encodeURIComponent(deviceId)}`;
  const formData = new FormData();
  formData.set("file", file);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-App-Version": APP_VERSION,
      "X-Device-Secret": deviceSecret,
    },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as Record<string, unknown>).error
        ? String((data as Record<string, unknown>).error)
        : `API returned ${res.status}`,
    );
  }

  const body = (await res.json()) as WorshipApiResponse & { sessionId?: string; status?: string };

  // Handle background processing (202 Accepted)
  if (body.sessionId && body.status === "processing") {
    return pollImportSession(body.sessionId, deviceId, deviceSecret, onProgress);
  }

  return resultFromApi(body as WorshipApiResponse, "");
}

async function pollImportSession(
  sessionId: string,
  deviceId: string,
  deviceSecret: string,
  onProgress?: (progress: number, label: string) => void,
): Promise<AiProcessResult> {
  const url = `${API_BASE}/api/v1/worship/import/session/${encodeURIComponent(sessionId)}?deviceId=${encodeURIComponent(deviceId)}`;

  // Poll every 3 seconds until complete
  while (true) {
    const res = await fetch(url, {
      headers: { "X-Device-Secret": deviceSecret, "X-App-Version": APP_VERSION },
    });

    if (!res.ok) {
      throw new Error(`Failed to poll import session: ${res.status}`);
    }

    const session = (await res.json()) as {
      status: string;
      progress: number;
      progressLabel: string;
      songs?: WorshipApiResponse["songs"];
      warnings?: string[];
      error?: string;
      totalChunks?: number;
      completedChunks?: number;
      failedChunks?: number;
    };

    onProgress?.(session.progress, session.progressLabel);

    if (session.status === "completed") {
      return {
        songs: (session.songs ?? []).map((song) => ({
          id: generateId(),
          title: song.title,
          hymnNumber: song.hymnNumber,
          sections: song.sections.map((section) => ({
            id: generateId(),
            type: normalizeSectionType(section.type),
            label: section.label ?? capitalize(section.type),
            number: section.number,
            content: section.content,
            warnings: [],
          })),
          method: "ai" as const,
          warnings: song.warnings ?? [],
          reviewNotes: [],
          rawExcerpt: "",
        })),
        warnings: session.warnings ?? [],
        aiUsed: true,
        needsReview: (session.failedChunks ?? 0) > 0,
        stats: {
          totalChunks: session.totalChunks ?? 0,
          aiChunks: (session.totalChunks ?? 0) - (session.failedChunks ?? 0),
          fallbackChunks: session.failedChunks ?? 0,
          provider: "opencode",
          durationMs: 0,
        },
      };
    }

    if (session.status === "failed") {
      throw new Error(session.error ?? "Import failed");
    }

    if (session.status === "cancelled") {
      throw new Error("Import was cancelled");
    }

    // Wait 3 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

/** Send pre-extracted text to the API for AI processing (paste workflow). */
export async function processDocumentViaApi(
  text: string,
  fileName: string,
): Promise<AiProcessResult> {
  const raw = text.trim();
  if (!raw) {
    return {
      songs: [],
      warnings: ["No text content to process."],
      aiUsed: false,
      needsReview: false,
      stats: { totalChunks: 0, aiChunks: 0, fallbackChunks: 0, provider: "api", durationMs: 0 },
    };
  }

  const { deviceId, deviceSecret } = await getDeviceAuth();

  const url = `${API_BASE}/api/worship/import/structure?deviceId=${encodeURIComponent(deviceId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Version": APP_VERSION,
      "X-Device-Secret": deviceSecret,
    },
    body: JSON.stringify({ text: raw, fileName }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as Record<string, unknown>).error
        ? String((data as Record<string, unknown>).error)
        : `API returned ${res.status}`,
    );
  }

  const data = (await res.json()) as WorshipApiResponse;
  return resultFromApi(data, raw.slice(0, 2400));
}
