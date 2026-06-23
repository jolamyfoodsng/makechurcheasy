/**
 * pdfImportService.ts — Extract text from PDF and parse bilingual hymns
 *
 * Designed for CCC (Celestial Church of Christ) hymnals that contain
 * Yoruba lyrics followed by English translations.
 */

import { invoke } from "@tauri-apps/api/core";
import { saveSong } from "./worshipDb";
import type { Song, SongMetadata } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ParsedHymn {
  id: string;
  number: number;
  title: string;
  sectionLabel: string;
  yoruba: string;
  english: string;
}

export type LanguageMode =
  | "two-songs"
  | "single-both"
  | "side-by-side";

// ── PDF text extraction ────────────────────────────────────────────────────

export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const data = Array.from(new Uint8Array(buffer));
  return invoke<string>("extract_text_from_pdf", { fileData: data });
}

// ── Bilingual hymn parser ──────────────────────────────────────────────────

const ORIN_HEADER_RE = /^Orin\s+(\d+)\s*$/i;
const HYMN_HEADER_RE = /^Hymn\s+(\d+)\s*$/i;
const SECTION_HEADER_RE = /^(ORIN\s+[A-ZÀ-Ỹ][A-ZÀ-Ỹ\s]*?)$/;
const MUSICAL_NOTATION_RE = /^[m:s:d:f:l:r:t:\-\s]+$/i;

/**
 * Parse extracted PDF text into structured bilingual hymns.
 *
 * The CCC hymnal format is:
 *   - Optional section header (e.g., "ORIN AKOWOLE")
 *   - "Orin N" (Yoruba hymn number)
 *   - "Hymn N" (English hymn number)
 *   - Yoruba lyrics
 *   - English lyrics
 *   - "Amin" / "Amen"
 */
export function parseBilingualHymns(text: string): ParsedHymn[] {
  const lines = text.split("\n");
  const hymns: ParsedHymn[] = [];

  // Pass 1: find all "Orin N" header positions
  const orinHeaders: { lineIdx: number; number: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ORIN_HEADER_RE);
    if (m) {
      orinHeaders.push({ lineIdx: i, number: parseInt(m[1], 10) });
    }
  }

  // Pass 2: for each Orin header, find the next "Hymn N" and extract both blocks
  for (let h = 0; h < orinHeaders.length; h++) {
    const orin = orinHeaders[h];
    const nextOrinLine = h + 1 < orinHeaders.length ? orinHeaders[h + 1].lineIdx : lines.length;

    // Find the "Hymn N" header that follows this "Orin N"
    let hymnLineIdx = -1;
    let hymnNumber = orin.number;
    for (let i = orin.lineIdx + 1; i < Math.min(orin.lineIdx + 5, lines.length); i++) {
      const m = lines[i].match(HYMN_HEADER_RE);
      if (m) {
        hymnLineIdx = i;
        hymnNumber = parseInt(m[1], 10);
        break;
      }
    }

    if (hymnLineIdx === -1) {
      // No English header found — treat the whole block as Yoruba-only
      const yorubaLines = lines.slice(orin.lineIdx + 1, nextOrinLine);
      const yoruba = cleanLyricBlock(yorubaLines);
      if (!yoruba) continue;

      hymns.push({
        id: `hymn-${orin.number}`,
        number: orin.number,
        title: `Hymn ${orin.number}`,
        sectionLabel: "",
        yoruba,
        english: "",
      });
      continue;
    }

    // Extract Yoruba block: between Orin header and Hymn header
    const yorubaLines = lines.slice(orin.lineIdx + 1, hymnLineIdx);
    const yoruba = cleanLyricBlock(yorubaLines);

    // Extract English block: between Hymn header and next Orin header (or end)
    const englishLines = lines.slice(hymnLineIdx + 1, nextOrinLine);
    const english = cleanLyricBlock(englishLines);

    if (!yoruba && !english) continue;

    // Look for a section label above this Orin header
    const sectionLabel = findSectionLabel(lines, orin.lineIdx);

    hymns.push({
      id: `hymn-${orin.number}`,
      number: orin.number,
      title: `Hymn ${hymnNumber}`,
      sectionLabel,
      yoruba,
      english,
    });
  }

  return hymns;
}

function findSectionLabel(lines: string[], orinLineIdx: number): string {
  // Look backwards from the Orin header for an uppercase section label
  for (let i = orinLineIdx - 1; i >= Math.max(0, orinLineIdx - 6); i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = line.match(SECTION_HEADER_RE);
    if (m) return m[1].trim();
    // If we hit a non-empty, non-section line, stop
    if (line.length > 0 && !/^[A-ZÀ-Ỹ\s]+$/.test(line)) break;
  }
  return "";
}

function cleanLyricBlock(lines: string[]): string {
  const cleaned: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    // Skip empty lines at start
    if (!line.trim() && cleaned.length === 0) continue;
    // Skip musical notation lines
    if (MUSICAL_NOTATION_RE.test(line.trim())) continue;
    // Skip standalone "Amin" / "Amen" at the end (we'll add it back when building songs)
    if (/^Amin\.?\s*$/i.test(line.trim())) continue;
    if (/^Amen\.?\s*$/i.test(line.trim())) continue;
    cleaned.push(line);
  }
  // Trim trailing empty lines
  while (cleaned.length > 0 && !cleaned[cleaned.length - 1].trim()) {
    cleaned.pop();
  }
  return cleaned.join("\n").trim();
}

// ── Song creation ──────────────────────────────────────────────────────────

export function hymnsToSongs(
  hymns: ParsedHymn[],
  mode: LanguageMode,
): (SongMetadata & { lyrics: string })[] {
  const results: (SongMetadata & { lyrics: string })[] = [];

  for (const hymn of hymns) {
    const sectionPrefix = hymn.sectionLabel ? `${hymn.sectionLabel}\n` : "";

    switch (mode) {
      case "two-songs": {
        if (hymn.yoruba) {
          results.push({
            title: `${hymn.title} (Yoruba)`,
            artist: "CCC Hymnal",
            language: "yoruba",
            lyrics: `${sectionPrefix}${hymn.yoruba}`,
          });
        }
        if (hymn.english) {
          results.push({
            title: `${hymn.title} (English)`,
            artist: "CCC Hymnal",
            language: "english",
            lyrics: `${sectionPrefix}${hymn.english}`,
          });
        }
        break;
      }
      case "single-both": {
        const parts: string[] = [];
        if (hymn.yoruba) parts.push(`[Yoruba]\n${hymn.yoruba}`);
        if (hymn.english) parts.push(`[English]\n${hymn.english}`);
        if (parts.length === 0) continue;
        results.push({
          title: hymn.title,
          artist: "CCC Hymnal",
          language: "bilingual",
          lyrics: `${sectionPrefix}${parts.join("\n\n")}`,
        });
        break;
      }
      case "side-by-side": {
        const yorubaLines = hymn.yoruba.split("\n").filter((l) => l.trim());
        const englishLines = hymn.english.split("\n").filter((l) => l.trim());
        const maxLen = Math.max(yorubaLines.length, englishLines.length);
        const pairs: string[] = [];
        for (let i = 0; i < maxLen; i++) {
          const y = yorubaLines[i]?.trim() ?? "";
          const e = englishLines[i]?.trim() ?? "";
          if (y || e) {
            pairs.push(y && e ? `${y}\n${e}` : y || e);
          }
        }
        if (pairs.length === 0) continue;
        results.push({
          title: hymn.title,
          artist: "CCC Hymnal",
          language: "bilingual",
          lyrics: `${sectionPrefix}${pairs.join("\n\n")}`,
        });
        break;
      }
    }
  }

  return results;
}

export async function bulkImportHymns(
  hymns: ParsedHymn[],
  mode: LanguageMode,
  onProgress?: (imported: number, total: number) => void,
): Promise<Song[]> {
  const songData = hymnsToSongs(hymns, mode);
  const imported: Song[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < songData.length; i++) {
    const data = songData[i];
    const song: Song = {
      id: `song-bulk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      metadata: {
        title: data.title,
        artist: data.artist,
        language: data.language,
      },
      lyrics: data.lyrics,
      slides: [],
      createdAt: now,
      updatedAt: now,
      importSourceType: "manual",
    };
    await saveSong(song);
    imported.push(song);
    onProgress?.(i + 1, songData.length);
  }

  return imported;
}
