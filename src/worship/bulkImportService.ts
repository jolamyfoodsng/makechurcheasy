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
  return invoke<string>("extract_text_from_pdf", { fileData: data });
}

async function extractDocxText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
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
      lyrics: detected.lyrics,
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
