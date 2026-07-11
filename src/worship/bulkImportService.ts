/**
 * bulkImportService.ts — Unified text extraction and song import.
 *
 * Extracts text from PDF, TXT, and DOCX files, then saves detected
 * songs to IndexedDB using the existing worship storage system.
 */

import { invoke } from "@tauri-apps/api/core";
import mammoth from "mammoth";
import { saveSong } from "./worshipDb";
import type { Song } from "./types";
import type { DetectedSong } from "./songDetector";
import type { TextElement } from "./layoutParser";
import {
  extractPdfTextElementsWithPdfJs,
  extractPdfTextWithPdfJs,
} from "./pdfFallback";

// ── Text extraction ────────────────────────────────────────────────────────

/**
 * Extract plain text from a file based on its extension.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "pdf":
      return extractPdfText(file);

    case "txt":
      return file.text();

    case "docx":
      return extractDocxText(file);

    default:
      throw new Error(`Unsupported file type: .${ext}. Use PDF, TXT, or DOCX.`);
  }
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const data = Array.from(new Uint8Array(buffer));
  try {
    const raw = await invoke<string>("extract_text_from_pdf", { fileData: data });
    if (raw.trim()) {
      return reorderTwoColumnText(raw);
    }
  } catch {
    // Fall through to the in-browser repair/extraction path.
  }

  const fallback = await extractPdfTextWithPdfJs(file);
  return reorderTwoColumnText(fallback);
}

// ── Two-column text reordering ─────────────────────────────────────────────

/**
 * Detect two-column PDF layouts (from pdftotext -layout) and reorder text
 * into left-column-first, right-column-second reading order.
 *
 * pdftotext -layout outputs both columns on the same line separated by
 * whitespace. This function splits at the column gap and reorders so that
 * the left column reads top→bottom, then the right column top→bottom.
 *
 * Returns the original text unchanged if no consistent column gap is found.
 */
function reorderTwoColumnText(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 6) return text;

  // Step 1: Find the most common double-space gap region.
  // For each non-empty line, locate the first run of 2+ spaces and record
  // its start position. The dominant cluster of positions is the column gap.
  const gapPositions: number[] = [];
  for (const line of lines) {
    if (line.trim().length < 10) continue;
    for (let c = 0; c < line.length - 1; c++) {
      if (line[c] === " " && line[c + 1] === " ") {
        // Skip leading whitespace — only count interior gaps
        const leadingSpaces = line.length - line.trimStart().length;
        if (c >= leadingSpaces + 4) {
          gapPositions.push(c);
          break;
        }
      }
    }
  }

  if (gapPositions.length < 6) return text;

  // Cluster gap positions into bins of 8 characters
  const bins = new Map<number, number[]>();
  for (const pos of gapPositions) {
    const bin = Math.floor(pos / 8) * 8;
    bins.set(bin, (bins.get(bin) || []).concat(pos));
  }

  let bestBin = -1;
  let bestCount = 0;
  for (const [bin, positions] of bins) {
    if (positions.length > bestCount) {
      bestCount = positions.length;
      bestBin = bin;
    }
  }

  // Need at least 20% of lines to share a gap region
  if (bestCount < Math.ceil(lines.length * 0.2)) return text;

  const gapCenter = Math.round(
    gapPositions.filter((p) => Math.abs(p - bestBin) < 12)
      .reduce((a, b) => a + b, 0) / bestCount,
  );

  // Step 2: Split each line at the gap and assign to left or right column.
  const leftColumn: string[] = [];
  const rightColumn: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      leftColumn.push("");
      rightColumn.push("");
      continue;
    }

    // Find the whitespace gap nearest to gapCenter
    let bestBreak = -1;
    let bestDist = Infinity;
    for (let offset = 0; offset <= 20; offset++) {
      for (const c of [gapCenter + offset, gapCenter - offset]) {
        if (c >= 0 && c < line.length - 1 && line[c] === " " && line[c + 1] === " ") {
          const dist = Math.abs(c - gapCenter);
          if (dist < bestDist) { bestDist = dist; bestBreak = c; }
        }
      }
      if (bestBreak >= 0 && bestDist <= offset) break;
    }

    if (bestBreak >= 0) {
      const leftPart = line.substring(0, bestBreak).trimEnd();
      const rightPart = line.substring(bestBreak + 1).trimStart();
      const leftLen = leftPart.replace(/\s/g, "").length;
      const rightLen = rightPart.replace(/\s/g, "").length;

      // Both columns have content — split
      if (leftLen >= 3 && rightLen >= 3) {
        leftColumn.push(leftPart);
        rightColumn.push(rightPart);
        continue;
      }
    }

    // No valid split or one side empty — whole line goes to left column
    leftColumn.push(line);
    rightColumn.push("");
  }

  // Step 3: Validate — both columns must have meaningful content
  const leftContent = leftColumn.filter((l) => l.trim().length > 0).length;
  const rightContent = rightColumn.filter((l) => l.trim().length > 0).length;
  if (leftContent < 4 || rightContent < 4) return text;

  // Step 4: Reassemble — left column top→bottom, then right column top→bottom
  const result: string[] = [];

  for (const line of leftColumn) {
    result.push(line);
  }

  // Blank line separator between columns
  if (rightContent > 0) {
    result.push("");
    for (const line of rightColumn) {
      result.push(line);
    }
  }

  return result.join("\n");
}

async function extractDocxText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

// ── Layout-aware extraction (positioned text elements) ──────────────────────

/**
 * Extract positioned text elements from a PDF file.
 * Returns an array of `{ text, x, y, width, height, fontSize, isBold, page }`.
 * Only works for PDF files — throws for other types.
 */
export async function extractTextElementsFromFile(file: File): Promise<TextElement[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "pdf") {
    throw new Error("Layout extraction is only supported for PDF files.");
  }
  const buffer = await file.arrayBuffer();
  const data = Array.from(new Uint8Array(buffer));

  try {
    const elements = await invoke<TextElement[]>("extract_text_elements_from_pdf", { fileData: data });
    if (elements.length > 0) {
      return elements;
    }
  } catch {
    // Fall through to the in-browser repair/extraction path.
  }

  return extractPdfTextElementsWithPdfJs(file);
}

// ── Song import ────────────────────────────────────────────────────────────

/**
 * Save detected songs to IndexedDB.
 * Songs are saved with empty slides (generated on load, same as current behavior).
 */
export async function importDetectedSongs(
  songs: DetectedSong[],
  onProgress?: (imported: number, total: number) => void,
): Promise<Song[]> {
  const imported: Song[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < songs.length; i++) {
    const detected = songs[i];
    const song: Song = {
      id: `song-bulk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      metadata: {
        title: detected.title,
        artist: "",
        language: detected.language,
      },
      lyrics: detected.lyrics.startsWith(detected.title)
        ? detected.lyrics
        : `${detected.title}\n${detected.lyrics}`,
      slides: [],
      createdAt: now,
      updatedAt: now,
      importSourceType: "manual",
    };
    await saveSong(song);
    imported.push(song);
    onProgress?.(i + 1, songs.length);
  }

  return imported;
}

/**
 * Get a human-readable file type label.
 */
export function getFileTypeLabel(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "PDF";
    case "txt": return "Text";
    case "docx": return "DOCX";
    default: return ext?.toUpperCase() || "Unknown";
  }
}
