import { invoke } from "@tauri-apps/api/core";
import { deductCreditsWithSync, fetchCreditsFromBackend } from "../services/credits";
import { parseCccHymnDrafts } from "./cccHymnImport";
import { detectSongs } from "./legacy/songDetector";
import { parseWorshipLyricSections } from "./slideEngine";
import { buildFallbackDraft } from "./smartImportService";
import type {
  AiProcessResult,
  BulkImportChunkRequest,
  SmartImportSectionType,
  SmartImportSongDraft,
  TextChunk,
} from "./smartImportTypes";

const API_BASE =
  import.meta.env?.VITE_AUTH_API_URL ||
  "https://api.creatorstudioslabs.stream";

const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const CHUNK_SIZE = 60_000;
const CHUNK_BREAK_WINDOW = 10_000;
const CHUNK_OVERLAP = 500;
const MAX_CONCURRENT_CHUNKS = 4;
const MAX_RETRIES = 2;
const CCC_HYMN_FAST_PATH_MIN_DRAFTS = 20;
const LARGE_NUMBERED_HYMNAL_MIN_CHARS = 12_000;
const LARGE_NUMBERED_HYMNAL_MIN_SONGS = 25;
const LARGE_NUMBERED_HYMNAL_MIN_CONFIDENCE = 55;
const LOCAL_SETUP_TIMEOUT_MS = 5_000;
const WORSHIP_IMPORT_CREDIT_CHECK_TIMEOUT_MS = 7_000;
const WORSHIP_IMPORT_CREDIT_DEDUCT_TIMEOUT_MS = 7_000;
const CHUNK_STRUCTURE_TIMEOUT_MS = 30_000;

// ── Provider abstraction ──

export interface DocumentStructureProvider {
  readonly name: string;
  structureChunk(request: BulkImportChunkRequest): Promise<{ songs: SmartImportSongDraft[] }>;
}

export type ImportAiProgressCallback = (progress: {
  completed: number;
  total: number;
  label: string;
}) => void;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

class NonRetryableChunkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableChunkError";
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  createError: (message: string) => Error = (message) => new Error(message),
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;

  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(createError(timeoutMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

// ── Chunking ──

function chunkText(text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  if (!text) return chunks;

  let startOffset = 0;
  let index = 0;

  while (startOffset < text.length) {
    const idealEnd = Math.min(startOffset + CHUNK_SIZE, text.length);
    const endOffset = findChunkBreak(text, startOffset, idealEnd);
    const chunkText = text.slice(startOffset, endOffset);
    chunks.push({ index, total: 0, text: chunkText, startOffset, endOffset });
    if (endOffset >= text.length) {
      startOffset = text.length;
    } else {
      startOffset = Math.max(endOffset - CHUNK_OVERLAP, startOffset + 1);
    }
    index++;
  }

  for (const chunk of chunks) {
    chunk.total = chunks.length;
  }

  return chunks;
}

function findChunkBreak(text: string, startOffset: number, idealEnd: number): number {
  if (idealEnd >= text.length) return text.length;

  const minSearch = Math.max(startOffset + Math.floor(CHUNK_SIZE * 0.6), idealEnd - CHUNK_BREAK_WINDOW);
  const maxSearch = Math.min(text.length, idealEnd + CHUNK_BREAK_WINDOW);

  const paragraphBreak = text.lastIndexOf("\n\n", maxSearch);
  if (paragraphBreak >= minSearch) {
    return paragraphBreak;
  }

  const lineBreak = text.lastIndexOf("\n", maxSearch);
  if (lineBreak >= minSearch) {
    return lineBreak;
  }

  return idealEnd;
}

async function processChunksWithLimit(
  chunks: TextChunk[],
  provider: DocumentStructureProvider,
  fileName: string,
  onProgress?: ImportAiProgressCallback,
): Promise<ChunkResult[]> {
  const results: ChunkResult[] = new Array(chunks.length);
  let nextIndex = 0;
  const workerCount = Math.min(MAX_CONCURRENT_CHUNKS, chunks.length);
  let completed = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < chunks.length) {
      const currentIndex = nextIndex++;
      const chunk = chunks[currentIndex];
      onProgress?.({
        completed,
        total: chunks.length,
        label: `Structuring songs locally (${completed + 1} of ${chunks.length})...`,
      });
      await yieldToUi();
      results[currentIndex] = await processChunk(chunk, provider, fileName);
      completed += 1;
      onProgress?.({
        completed,
        total: chunks.length,
        label: `Structured ${completed} of ${chunks.length} section${chunks.length === 1 ? "" : "s"}...`,
      });
      await yieldToUi();
    }
  }));

  return results;
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
      const response = await withTimeout(
        provider.structureChunk({
          chunkIndex: chunk.index,
          totalChunks: chunk.total,
          text: chunk.text,
        }),
        CHUNK_STRUCTURE_TIMEOUT_MS,
        `Local song structuring timed out after ${Math.round(CHUNK_STRUCTURE_TIMEOUT_MS / 1000)} seconds.`,
        (message) => new NonRetryableChunkError(message),
      );
      return { songs: response.songs, fallback: false };
    } catch (err) {
      if (err instanceof NonRetryableChunkError) {
        const fallback = buildFallbackDraft(chunk.text, `${fileName} (chunk ${chunk.index + 1})`);
        return {
          songs: fallback,
          fallback: true,
          error: err.message,
        };
      }

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
  onProgress?: ImportAiProgressCallback,
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
  onProgress?.({
    completed: 0,
    total: chunks.length,
    label: chunks.length > 1
      ? `Split document into ${chunks.length} batches.`
      : "Preparing document batch.",
  });
  await yieldToUi();

  if (chunks.length === 0) {
    return {
      songs: buildFallbackDraft(text, fileName),
      warnings: [],
      aiUsed: false,
      needsReview: false,
      stats: { totalChunks: 0, aiChunks: 0, fallbackChunks: 0, provider: provider.name, durationMs: Date.now() - startTime },
    };
  }

  const results = await processChunksWithLimit(chunks, provider, fileName, onProgress);

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
  const status = await withTimeout(
    invoke<LocalWorshipImportAiStatus>("get_worship_import_ai_status"),
    LOCAL_SETUP_TIMEOUT_MS,
    "Local worship import setup check timed out.",
  );
  if (!status.aiConfigured) {
    throw new Error("Local worship import AI is not configured. Set OPENCODE_API_KEY for the desktop app.");
  }
}

function estimateWorshipImportAiCredits(text: string): number {
  return chunkText(text).length;
}

async function ensureWorshipImportCredits(creditsNeeded: number): Promise<void> {
  if (creditsNeeded <= 0) return;

  let availableCredits: number | null = null;
  try {
    availableCredits = await withTimeout(
      fetchCreditsFromBackend(),
      WORSHIP_IMPORT_CREDIT_CHECK_TIMEOUT_MS,
      "Credit check timed out.",
    );
  } catch (error) {
    console.warn("[WorshipImport] Credit check timed out/unavailable.", error);
    throw new Error("Could not verify AI credits. Check your connection and try again.");
  }

  if (availableCredits === null) {
    throw new Error("Could not verify AI credits. Check your connection and try again.");
  }

  // -1 represents unlimited/admin access from the backend.
  if (availableCredits >= 0 && availableCredits < creditsNeeded) {
    throw new Error(`Not enough AI credits for this import. Required: ${creditsNeeded}, available: ${availableCredits}.`);
  }
}

async function deductWorshipImportCredits(
  creditsUsed: number,
  fileName: string,
  stats: AiProcessResult["stats"],
): Promise<void> {
  if (creditsUsed <= 0) return;

  let ok = true;
  try {
    ok = await withTimeout(
      deductCreditsWithSync(
        "device",
        creditsUsed,
        "worship_import_ai",
        `Worship import AI: ${fileName}`,
        {
          fileName,
          provider: stats.provider,
          totalChunks: stats.totalChunks,
          aiChunks: stats.aiChunks,
          fallbackChunks: stats.fallbackChunks,
        },
        { allowOffline: false },
      ),
      WORSHIP_IMPORT_CREDIT_DEDUCT_TIMEOUT_MS,
      "Credit deduction timed out.",
    );
  } catch (error) {
    console.warn("[WorshipImport] Credit deduction timed out/unavailable after import.", error);
    throw new Error("Could not deduct AI credits. Check your connection and try again.");
  }

  if (!ok) {
    throw new Error(`Not enough AI credits for this import. Required: ${creditsUsed}.`);
  }
}

function looksLikeCccHymnal(text: string, fileName: string): boolean {
  const name = fileName.toLowerCase();
  const nameLooksSpecific = name.includes("ccc") && /hymn|orin/.test(name);
  const markerCount = (text.match(/\b(?:Orin|Hymn)\s+\d{1,4}\b/gi) ?? []).length;
  return nameLooksSpecific || markerCount >= CCC_HYMN_FAST_PATH_MIN_DRAFTS;
}

function inferSectionNumber(label: string): string | undefined {
  const match = label.match(/\b(\d+|[ivxlcdm]+)\b/i);
  return match?.[1];
}

function mapSectionHeaderType(raw: string): SmartImportSectionType | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("verse")) return "verse";
  if (normalized.startsWith("chorus")) return "chorus";
  if (normalized.startsWith("refrain")) return "refrain";
  if (normalized.startsWith("bridge")) return "bridge";
  if (normalized.startsWith("pre-chorus") || normalized.startsWith("prechorus")) return "pre-chorus";
  if (normalized.startsWith("tag") || normalized.startsWith("hook") || normalized.startsWith("vamp")) return "tag";
  if (normalized.startsWith("intro")) return "intro";
  if (normalized.startsWith("outro") || normalized.startsWith("ending")) return "outro";
  return null;
}

function buildFastLocalSections(lyrics: string): SmartImportSongDraft["sections"] {
  const normalized = lyrics.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  type FastLocalSection = {
    type: SmartImportSectionType;
    label: string;
    number?: string;
    lines: string[];
  };

  const sections: FastLocalSection[] = [];
  const lines = normalized.split("\n").map((line) => line.trimEnd());
  const state: { current: FastLocalSection | null } = { current: null };
  let verseCount = 0;

  const pushCurrent = () => {
    if (!state.current) return;
    const content = state.current.lines.join("\n").trim();
    if (!content) return;
    sections.push({ ...state.current, lines: content.split("\n") });
  };

  const startSection = (
    type: SmartImportSectionType,
    label: string,
    number?: string,
    initialLine?: string,
  ) => {
    pushCurrent();
    state.current = {
      type,
      label,
      number,
      lines: initialLine?.trim() ? [initialLine.trim()] : [],
    };
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (state.current && state.current.lines[state.current.lines.length - 1] !== "") {
        state.current.lines.push("");
      }
      continue;
    }

    const sectionHeaderMatch = trimmed.match(
      /^(verse|chorus|refrain|bridge|pre-chorus|prechorus|tag|hook|vamp|intro|outro|ending)\s*(\d+|[ivxlcdm]+)?[:.)-]?\s*(.*)$/i,
    );
    if (sectionHeaderMatch) {
      const type = mapSectionHeaderType(sectionHeaderMatch[1]);
      if (type) {
        const number = sectionHeaderMatch[2]?.trim() || undefined;
        const label = type === "pre-chorus"
          ? `Pre-Chorus${number ? ` ${number}` : ""}`
          : `${capitalize(type)}${number ? ` ${number}` : ""}`;
        startSection(type, label, number, sectionHeaderMatch[3]);
        continue;
      }
    }

    const numberedVerseMatch = trimmed.match(/^(\d+|[ivxlcdm]+)[.)]\s+(.*)$/i);
    if (numberedVerseMatch) {
      const number = numberedVerseMatch[1].trim().toUpperCase();
      startSection("verse", `Verse ${number}`, number, numberedVerseMatch[2]);
      continue;
    }

    if (!state.current) {
      verseCount += 1;
      startSection("verse", `Verse ${verseCount}`, String(verseCount));
    }

    state.current?.lines.push(trimmed);
  }

  pushCurrent();

  const mapped: SmartImportSongDraft["sections"] = sections.map((section) => ({
    id: generateId(),
    type: section.type,
    label: section.label,
    number: section.number ?? inferSectionNumber(section.label),
    content: section.lines.join("\n").trim(),
    warnings: [],
  })).filter((section) => section.content.length > 0);

  if (mapped.length > 1) {
    return mapped;
  }

  const parsedSections: SmartImportSongDraft["sections"] = parseWorshipLyricSections(normalized, 2)
    .map((section) => ({
      id: generateId(),
      type: section.type,
      label: section.label,
      number: inferSectionNumber(section.label),
      content: section.lines.join("\n").trim(),
      warnings: [],
    }))
    .filter((section) => section.content.length > 0);

  if (parsedSections.length > 1) {
    return parsedSections;
  }

  return mapped.length > 0
    ? mapped
    : [{
      id: generateId(),
      type: "verse",
      label: "Verse 1",
      number: "1",
      content: normalized,
      warnings: [],
    }];
}

type HymnPage = {
  pageNumber: number;
  text: string;
};

type NumberedHymnalBlock = {
  contentPages: HymnPage[];
  indexPages: HymnPage[];
  indexTitles: Map<string, string>;
};

type IndexedCollectedHymn = {
  hymnNumber: string;
  lines: string[];
  recovery: "parsed" | "recovered" | "placeholder";
  recoveryNote?: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeIndexHeader(value: string): boolean {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  return compact.includes("INDEXOFIRSTLINES") || compact.includes("INDEXOFFIRSTLINES");
}

function looksLikeIndexEntry(value: string): boolean {
  return /^.{6,}\s+\d{1,4}$/.test(normalizeWhitespace(value));
}

function isLikelyIndexPage(pageText: string): boolean {
  const lines = pageText.split("\n").map((line) => line.trim()).filter(Boolean);
  const entryLike = lines.filter((line) => looksLikeIndexEntry(line)).length;
  const verseLike = lines.filter((line) => /^\d+[.)]\s+/.test(line)).length;
  const standaloneNumbers = lines.filter((line) => /^\d{1,4}$/.test(line)).length;
  const longTitles = lines.filter((line) => !/^\d{1,4}$/.test(line) && line.length >= 6).length;
  let maxStandaloneRun = 0;
  let currentStandaloneRun = 0;

  for (const line of lines) {
    if (/^\d{1,4}$/.test(line)) {
      currentStandaloneRun += 1;
      maxStandaloneRun = Math.max(maxStandaloneRun, currentStandaloneRun);
    } else {
      currentStandaloneRun = 0;
    }
  }

  return looksLikeIndexHeader(pageText) ||
    (entryLike >= 18 && verseLike <= 1) ||
    (standaloneNumbers >= 10 && longTitles >= 18 && verseLike <= 1 && maxStandaloneRun >= 8);
}

function stripTrailingPageNumber(lines: string[], pageNumber: number): string[] {
  const next = [...lines];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const trimmed = next[index].trim();
    if (!trimmed) continue;
    if (trimmed === String(pageNumber)) {
      next[index] = "";
    }
    break;
  }
  return next;
}

function extractIndexTitleMap(indexPages: HymnPage[]): Map<string, string> {
  const titles = new Map<string, string>();

  for (const page of indexPages) {
    const looseTitles: string[] = [];
    const standaloneNumbers: string[] = [];

    for (const rawLine of page.text.split("\n")) {
      const line = normalizeWhitespace(rawLine);
      if (!line || looksLikeIndexHeader(line)) continue;

      if (/^\d{1,4}$/.test(line)) {
        standaloneNumbers.push(line);
        continue;
      }

      const match = line.match(/^(.+?)\s+(\d{1,4})$/);
      if (!match) {
        looseTitles.push(line);
        continue;
      }

      const title = normalizeWhitespace(match[1]);
      const hymnNumber = match[2];
      if (title.length < 3) continue;
      if (!titles.has(hymnNumber)) {
        titles.set(hymnNumber, title);
      }
    }

    if (looseTitles.length > 0 && standaloneNumbers.length > 0) {
      const pairCount = Math.min(looseTitles.length, standaloneNumbers.length);
      for (let index = 0; index < pairCount; index += 1) {
        const hymnNumber = standaloneNumbers[index];
        const title = looseTitles[index];
        if (title.length < 3) continue;
        if (!titles.has(hymnNumber)) {
          titles.set(hymnNumber, title);
        }
      }
    }
  }

  return titles;
}

function splitNumberedHymnalBlocks(text: string): NumberedHymnalBlock[] {
  const pages: HymnPage[] = text.split("\f").map((pageText, index) => ({
    pageNumber: index + 1,
    text: pageText,
  }));

  const blocks: NumberedHymnalBlock[] = [];
  let currentContent: HymnPage[] = [];
  let currentIndex: HymnPage[] = [];

  for (const page of pages) {
    if (isLikelyIndexPage(page.text)) {
      currentIndex.push(page);
      continue;
    }

    if (currentIndex.length > 0 && currentContent.length > 0) {
      blocks.push({
        contentPages: currentContent,
        indexPages: currentIndex,
        indexTitles: extractIndexTitleMap(currentIndex),
      });
      currentContent = [];
      currentIndex = [];
    } else if (currentIndex.length > 0) {
      currentIndex = [];
    }

    currentContent.push(page);
  }

  if (currentContent.length > 0) {
    blocks.push({
      contentPages: currentContent,
      indexPages: currentIndex,
      indexTitles: extractIndexTitleMap(currentIndex),
    });
  }

  return blocks.filter((block) => block.contentPages.length > 0);
}

function findNextNonEmptyLine(lines: string[], startIndex: number): string | null {
  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function isLikelyMetadataLine(line: string): boolean {
  const trimmed = normalizeWhitespace(line);
  if (!trimmed) return false;

  return /^(?:PAN|PANT|CAN|PH|MHB|RH|BBC|CB|GBP|CWS|PPP|CP|TPH|TCH|SGT|SOS|HCB|KB)\b/i.test(trimmed) ||
    /^(?:Songs of Fellowship|Translation of|Apostolic Twi Hymnal|Christian As4r Ndwom Fofor|Presby As4re Dwom Nhoma)\b/i.test(trimmed);
}

function shouldStartIndexedHymn(
  lines: string[],
  index: number,
  allowedNumbers: Set<string>,
): boolean {
  const hymnNumber = lines[index].trim();
  if (!/^\d{1,4}$/.test(hymnNumber)) return false;
  if (!allowedNumbers.has(hymnNumber)) return false;

  const nextLine = findNextNonEmptyLine(lines, index + 1);
  if (!nextLine) return false;
  if (/^\d{1,4}$/.test(nextLine)) return false;
  if (looksLikeIndexHeader(nextLine) || looksLikeIndexEntry(nextLine)) return false;
  if (isLikelyMetadataLine(nextLine)) return false;

  return true;
}

function shouldStartLooseNumberedHymn(lines: string[], index: number): boolean {
  const hymnNumber = lines[index].trim();
  if (!/^\d{1,4}$/.test(hymnNumber)) return false;

  const nextLine = findNextNonEmptyLine(lines, index + 1);
  if (!nextLine) return false;
  if (/^\d{1,4}$/.test(nextLine)) return false;
  if (looksLikeIndexHeader(nextLine) || looksLikeIndexEntry(nextLine)) return false;
  if (isLikelyMetadataLine(nextLine)) return false;

  return true;
}

function normalizeCollectedLyrics(lines: string[]): string {
  const normalized: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== "") {
        normalized.push("");
      }
      continue;
    }
    normalized.push(line.trim());
  }

  while (normalized.length > 0 && !normalized[0]) normalized.shift();
  while (normalized.length > 0 && !normalized[normalized.length - 1]) normalized.pop();

  return normalized.join("\n").trim();
}

function normalizeForLooseMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sortHymnNumbers(a: string, b: string): number {
  return Number(a) - Number(b);
}

function flattenBlockContentLines(block: NumberedHymnalBlock): string[] {
  const lines: string[] = [];

  for (const page of block.contentPages) {
    lines.push(...stripTrailingPageNumber(page.text.split("\n"), page.pageNumber));
    lines.push("");
  }

  return lines;
}

function looksLikeUsefulRecoveryLyrics(lines: string[]): boolean {
  const lyrics = normalizeCollectedLyrics(lines);
  if (!lyrics) return false;

  const nonEmptyLines = lyrics.split("\n").filter((line) => line.trim().length > 0).length;
  return nonEmptyLines >= 2 || lyrics.length >= 48;
}

function extractRecoverySlice(
  flatLines: string[],
  startIndex: number,
  allowedNumbers: Set<string>,
): string[] {
  const collected: string[] = [];
  let sawContent = false;

  for (let index = startIndex; index < flatLines.length; index += 1) {
    const rawLine = flatLines[index];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (sawContent && collected[collected.length - 1] !== "") {
        collected.push("");
      }
      continue;
    }

    if (/^\d{1,4}$/.test(trimmed) && allowedNumbers.has(trimmed)) {
      if (sawContent) break;
      return [];
    }

    sawContent = true;
    collected.push(rawLine.trimEnd());
  }

  return collected;
}

function recoverIndexedHymnByNumber(
  hymnNumber: string,
  title: string,
  flatLines: string[],
  allowedNumbers: Set<string>,
): IndexedCollectedHymn | null {
  const titleMatch = normalizeForLooseMatch(title);

  for (let index = 0; index < flatLines.length; index += 1) {
    if (flatLines[index].trim() !== hymnNumber) continue;

    const candidateLines = extractRecoverySlice(flatLines, index + 1, allowedNumbers);
    if (!looksLikeUsefulRecoveryLyrics(candidateLines)) continue;

    const candidateText = normalizeForLooseMatch(candidateLines.slice(0, 6).join(" "));
    const reviewNote = candidateText.includes(titleMatch)
      ? "Recovered this hymn body from the local PDF text using its hymn number and title."
      : "Recovered this hymn body from the local PDF text using its hymn number. Review the opening lines.";

    return {
      hymnNumber,
      lines: candidateLines,
      recovery: "recovered",
      recoveryNote: reviewNote,
    };
  }

  return null;
}

function recoverIndexedHymnByTitle(
  hymnNumber: string,
  title: string,
  flatLines: string[],
  allowedNumbers: Set<string>,
): IndexedCollectedHymn | null {
  const titleMatch = normalizeForLooseMatch(title);
  if (!titleMatch) return null;

  for (let index = 0; index < flatLines.length; index += 1) {
    const current = normalizeForLooseMatch(flatLines[index]);
    const next = normalizeForLooseMatch(flatLines[index + 1] ?? "");
    const combined = normalizeWhitespace([current, next].filter(Boolean).join(" "));

    if (!combined) continue;
    if (!titleMatch.includes(combined) && !combined.includes(titleMatch)) continue;

    const candidateLines = extractRecoverySlice(flatLines, index, allowedNumbers);
    if (!looksLikeUsefulRecoveryLyrics(candidateLines)) continue;

    return {
      hymnNumber,
      lines: candidateLines,
      recovery: "recovered",
      recoveryNote: "Recovered this hymn body from the local PDF text using the printed index title.",
    };
  }

  return null;
}

function collectNumberedHymnsFromBlock(
  block: NumberedHymnalBlock,
  allowedNumbers?: Set<string>,
): IndexedCollectedHymn[] {
  const collected: IndexedCollectedHymn[] = [];
  let current: { hymnNumber: string; lines: string[] } | null = null;

  const flushCurrent = () => {
    if (!current) return;
    const lyrics = normalizeCollectedLyrics(current.lines);
    if (lyrics) {
      collected.push({
        hymnNumber: current.hymnNumber,
        lines: lyrics.split("\n"),
        recovery: "parsed",
      });
    }
    current = null;
  };

  for (const page of block.contentPages) {
    const lines = stripTrailingPageNumber(page.text.split("\n"), page.pageNumber);

    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        if (current && current.lines[current.lines.length - 1] !== "") {
          current.lines.push("");
        }
        continue;
      }

      const startsIndexedHymn = allowedNumbers
        ? shouldStartIndexedHymn(lines, index, allowedNumbers)
        : shouldStartLooseNumberedHymn(lines, index);

      if (startsIndexedHymn) {
        flushCurrent();
        current = {
          hymnNumber: trimmed,
          lines: [],
        };
        continue;
      }

      if (!current) continue;
      current.lines.push(rawLine.trimEnd());
    }
  }

  flushCurrent();

  return collected;
}

function recoverMissingIndexedHymns(
  block: NumberedHymnalBlock,
  parsedHymns: IndexedCollectedHymn[],
): IndexedCollectedHymn[] {
  const flatLines = flattenBlockContentLines(block);
  const allowedNumbers = new Set(block.indexTitles.keys());
  const parsedNumbers = new Set(parsedHymns.map((entry) => entry.hymnNumber));
  const recovered: IndexedCollectedHymn[] = [];

  for (const [hymnNumber, title] of [...block.indexTitles.entries()].sort(([left], [right]) => sortHymnNumbers(left, right))) {
    if (parsedNumbers.has(hymnNumber)) continue;

    const byNumber = recoverIndexedHymnByNumber(hymnNumber, title, flatLines, allowedNumbers);
    if (byNumber) {
      recovered.push(byNumber);
      continue;
    }

    const byTitle = recoverIndexedHymnByTitle(hymnNumber, title, flatLines, allowedNumbers);
    if (byTitle) {
      recovered.push(byTitle);
      continue;
    }

    recovered.push({
      hymnNumber,
      lines: [title],
      recovery: "placeholder",
      recoveryNote: "Lyrics were not fully recovered from the PDF text. Review this hymn manually before importing.",
    });
  }

  return recovered;
}

function inferMissingSequenceHymns(
  block: NumberedHymnalBlock,
  hymnsByNumber: Map<string, IndexedCollectedHymn>,
): IndexedCollectedHymn[] {
  const detectedNumbers = [...hymnsByNumber.keys()]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  const maxDetectedNumber = detectedNumbers[detectedNumbers.length - 1] ?? 0;
  if (maxDetectedNumber < LARGE_NUMBERED_HYMNAL_MIN_SONGS) return [];
  if (detectedNumbers[0] !== 1) return [];

  const density = detectedNumbers.length / maxDetectedNumber;
  if (density < 0.96) return [];

  const inferred: IndexedCollectedHymn[] = [];

  for (let hymnNumber = 1; hymnNumber <= maxDetectedNumber; hymnNumber += 1) {
    const key = String(hymnNumber);
    if (hymnsByNumber.has(key)) continue;

    inferred.push({
      hymnNumber: key,
      lines: [block.indexTitles.get(key) ?? `Hymn ${key}`],
      recovery: "placeholder",
      recoveryNote: "This hymn number was inferred from the surrounding hymn sequence. Review this hymn manually before importing.",
    });
  }

  return inferred;
}

function buildIndexedHymnDraft(
  block: NumberedHymnalBlock,
  entry: IndexedCollectedHymn,
): SmartImportSongDraft {
  const lyrics = entry.lines.join("\n").trim();
  const firstUsefulLine = entry.lines.find((line) => normalizeWhitespace(line).length > 0);
  const title = block.indexTitles.get(entry.hymnNumber)
    ?? normalizeWhitespace(firstUsefulLine ?? "")
    ?? `Hymn ${entry.hymnNumber}`;
  const warnings: string[] = [];
  const reviewNotes = block.indexTitles.has(entry.hymnNumber)
    ? ["Fast hymn-book mode used the printed index to recover titles and keep wrapped first lines stable."]
    : ["Fast hymn-book mode recovered this hymn from numbered body pages because its printed index entry was not extracted reliably."];

  if (!block.indexTitles.has(entry.hymnNumber)) {
    warnings.push("This hymn was recovered without a printed index title. Review the title and first lines before importing.");
  }

  if (entry.recovery === "recovered" && entry.recoveryNote) {
    reviewNotes.push(entry.recoveryNote);
  }

  if (entry.recovery === "placeholder") {
    reviewNotes.push(entry.recoveryNote ?? "Lyrics were not fully recovered from the PDF text. Review this hymn manually before importing.");
    warnings.push("Lyrics were not fully recovered from the PDF text.");
  }

  return {
    id: generateId(),
    title,
    artist: "",
    language: undefined,
    hymnNumber: entry.hymnNumber,
    method: "fallback" as const,
    sections: buildFastLocalSections(lyrics),
    warnings,
    reviewNotes,
    rawExcerpt: lyrics.slice(0, 2400),
  };
}

function parseIndexedNumberedHymnalBlock(block: NumberedHymnalBlock): SmartImportSongDraft[] {
  const parsedHymns = collectNumberedHymnsFromBlock(block, new Set(block.indexTitles.keys()));
  const recoveredHymns = recoverMissingIndexedHymns(block, parsedHymns);
  const extraHymns = collectNumberedHymnsFromBlock(block);
  const hymnsByNumber = new Map<string, IndexedCollectedHymn>();

  for (const hymn of [...parsedHymns, ...recoveredHymns, ...extraHymns]) {
    if (!hymnsByNumber.has(hymn.hymnNumber)) {
      hymnsByNumber.set(hymn.hymnNumber, hymn);
    }
  }

  for (const hymn of inferMissingSequenceHymns(block, hymnsByNumber)) {
    if (!hymnsByNumber.has(hymn.hymnNumber)) {
      hymnsByNumber.set(hymn.hymnNumber, hymn);
    }
  }

  return [...hymnsByNumber.keys()]
    .sort(sortHymnNumbers)
    .map((hymnNumber) => hymnsByNumber.get(hymnNumber))
    .filter((entry): entry is IndexedCollectedHymn => Boolean(entry))
    .map((entry) => buildIndexedHymnDraft(block, entry))
    .filter((song) => song.sections.length > 0);
}

export function parseLargeNumberedHymnalDrafts(text: string): SmartImportSongDraft[] {
  const trimmed = text.trim();
  if (trimmed.length < LARGE_NUMBERED_HYMNAL_MIN_CHARS) return [];

  const indexedCandidates = splitNumberedHymnalBlocks(trimmed)
    .filter((block) => block.indexTitles.size >= LARGE_NUMBERED_HYMNAL_MIN_SONGS)
    .map((block) => ({
      block,
      drafts: parseIndexedNumberedHymnalBlock(block),
      maxNumber: Math.max(...[...block.indexTitles.keys()].map(Number)),
    }))
    .sort((left, right) => {
      if (right.drafts.length !== left.drafts.length) {
        return right.drafts.length - left.drafts.length;
      }
      if (right.maxNumber !== left.maxNumber) {
        return right.maxNumber - left.maxNumber;
      }
      return right.block.indexTitles.size - left.block.indexTitles.size;
    });

  const bestIndexedCandidate = indexedCandidates[0];
  if (bestIndexedCandidate) {
    const indexedDrafts = bestIndexedCandidate.drafts;
    if (indexedDrafts.length >= LARGE_NUMBERED_HYMNAL_MIN_SONGS) {
      return indexedDrafts;
    }
  }

  const detection = detectSongs(trimmed);
  if (detection.pattern !== "numbered") return [];
  if (detection.confidence < LARGE_NUMBERED_HYMNAL_MIN_CONFIDENCE) return [];
  if (detection.songs.length < LARGE_NUMBERED_HYMNAL_MIN_SONGS) return [];

  return detection.songs.map((song) => ({
    id: generateId(),
    title: song.title,
    artist: "",
    language: song.language,
    hymnNumber: song.title.match(/\b(\d+)\b/)?.[1],
    method: "fallback" as const,
    sections: buildFastLocalSections(song.lyrics),
    warnings: [],
    reviewNotes: [
      "Fast hymn-book mode was used to keep this import under a few minutes. Review section breaks before importing.",
    ],
    rawExcerpt: song.lyrics.slice(0, 2400),
  })).filter((song) => song.sections.length > 0);
}

export function parseKnownHymnalDrafts(text: string, fileName: string): SmartImportSongDraft[] {
  if (!looksLikeCccHymnal(text, fileName)) return [];

  const drafts = parseCccHymnDrafts(text);
  if (drafts.length >= CCC_HYMN_FAST_PATH_MIN_DRAFTS) return drafts;

  const name = fileName.toLowerCase();
  const nameLooksSpecific = name.includes("ccc") && /hymn|orin/.test(name);
  return nameLooksSpecific && drafts.length > 0 ? drafts : [];
}

export async function processDocumentLocally(
  text: string,
  fileName: string,
  onProgress?: ImportAiProgressCallback,
): Promise<AiProcessResult> {
  const startedAt = Date.now();
  const trimmed = text.trim();
  const knownHymnalDrafts = parseKnownHymnalDrafts(text, fileName);
  if (knownHymnalDrafts.length > 0) {
    onProgress?.({
      completed: knownHymnalDrafts.length,
      total: knownHymnalDrafts.length,
      label: `Detected ${knownHymnalDrafts.length} hymn${knownHymnalDrafts.length === 1 ? "" : "s"} locally.`,
    });
    return {
      songs: knownHymnalDrafts,
      warnings: [],
      aiUsed: false,
      needsReview: false,
      stats: {
        totalChunks: 0,
        aiChunks: 0,
        fallbackChunks: 0,
        provider: "ccc-local",
        durationMs: Date.now() - startedAt,
      },
    };
  }

  const numberedHymnalDrafts = parseLargeNumberedHymnalDrafts(trimmed);
  if (numberedHymnalDrafts.length > 0) {
    onProgress?.({
      completed: numberedHymnalDrafts.length,
      total: numberedHymnalDrafts.length,
      label: `Fast-parsed ${numberedHymnalDrafts.length} hymn${numberedHymnalDrafts.length === 1 ? "" : "s"} locally.`,
    });
    return {
      songs: numberedHymnalDrafts,
      warnings: [
        `Large numbered hymn book detected. Used fast local parsing for ${numberedHymnalDrafts.length} hymns to avoid slow AI imports.`,
      ],
      aiUsed: false,
      needsReview: true,
      stats: {
        totalChunks: 0,
        aiChunks: 0,
        fallbackChunks: 0,
        provider: "numbered-local",
        durationMs: Date.now() - startedAt,
      },
    };
  }

  const creditsNeeded = estimateWorshipImportAiCredits(trimmed);
  onProgress?.({
    completed: 0,
    total: Math.max(creditsNeeded, 1),
    label: "Checking local import setup...",
  });
  await yieldToUi();

  await ensureLocalWorshipImportAiConfigured();

  onProgress?.({
    completed: 0,
    total: Math.max(creditsNeeded, 1),
    label: "Checking import credits...",
  });
  await yieldToUi();

  await ensureWorshipImportCredits(creditsNeeded);
  const result = await processDocumentWithAi(trimmed, fileName, new TauriOpenCodeProvider(), onProgress);
  onProgress?.({
    completed: result.stats.totalChunks,
    total: result.stats.totalChunks,
    label: "Finalizing structured songs...",
  });
  await yieldToUi();
  await deductWorshipImportCredits(result.stats.aiChunks, fileName, result.stats);
  return result;
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
