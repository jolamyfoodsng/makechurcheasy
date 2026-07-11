/**
 * pdfImportService.ts — Extract text from PDF and parse bilingual hymns
 *
 * Designed for CCC (Celestial Church of Christ) hymnals that contain
 * Yoruba lyrics followed by English translations in a two-column layout.
 *
 * Layout produced by pdftotext -layout:
 *   ORIN AKOWOLE                                PROCESSIONAL HYMN
 *   Orin 1                                 Hymn 1
 *   Jerih mo yah mah,                      Jerih moh Yah mah
 *   ...
 *
 * Column split is at character position ~38 (detected dynamically).
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

// ── Constants ──────────────────────────────────────────────────────────────

/** Matches "Orin N" anywhere on a line (the Yoruba hymn header). */
const ORIN_RE = /Orin\s+(\d+)/i;
/** Matches a standalone "Orin N" line. */
const STANDALONE_ORIN_RE = /^\s*Orin\s+(\d+)\s*$/i;
/** Matches a standalone "Hymn N" line (right-column header when Orin is alone). */
const STANDALONE_HYMN_RE = /^\s*Hymn\s+(\d+)\s*$/i;
/** Musical notation lines — skip entirely. */
const MUSICAL_RE = /^[msdflrt:\-\s\.]+$/i;
/** Trailing Amin/Amen to strip from lyric lines. */
const AMEN_RE = /\s*\b(Amin|Amen)\b\.?\s*$/i;
/** Default column split position (chars). Overridden by dynamic detection. */
const DEFAULT_SPLIT_COL = 38;

// ── Column split detection ─────────────────────────────────────────────────

/**
 * Detect the column split position from same-line "Orin N  Hymn N" headers.
 * Returns the character index where the right column starts.
 */
function detectSplitCol(lines: string[]): number {
  const positions: number[] = [];
  const sameLineRe = /Orin\s+\d+\s+(Hymn\s+\d+)/i;
  for (const line of lines) {
    const m = sameLineRe.exec(line);
    if (m && m.index !== undefined) {
      // m.index is where 'Orin' starts; find where 'Hymn' starts
      const hymnIdx = line.indexOf(m[1]);
      if (hymnIdx > 0) positions.push(hymnIdx);
    }
  }
  if (positions.length === 0) return DEFAULT_SPLIT_COL;
  positions.sort((a, b) => a - b);
  return positions[Math.floor(positions.length / 2)]; // median
}

// ── Section header detection ───────────────────────────────────────────────

/**
 * Returns true if a line is an ALL-CAPS section header
 * (e.g. "ORIN AKOWOLE   PROCESSIONAL HYMN").
 */
function isSectionHeader(line: string): boolean {
  const s = line.trim();
  if (!s || ORIN_RE.test(s)) return false;
  const alpha = s.split("").filter((c) => /[a-zA-Z]/.test(c));
  if (alpha.length < 4) return false;
  const upperRatio = alpha.filter((c) => c === c.toUpperCase()).length / alpha.length;
  return upperRatio > 0.85;
}

/**
 * Extract the English section label from a section header line.
 * The right half (after the split column) is the English label.
 */
function parseSectionLabel(line: string, splitCol: number): string {
  if (line.length > splitCol) {
    const right = line.slice(splitCol).trim();
    if (right) return right;
  }
  return line.trim();
}

function stripTrailingAmen(line: string): string {
  return AMEN_RE.test(line) ? line.replace(AMEN_RE, "").trimEnd() : line;
}

function findSectionLabel(lines: string[], startI: number, splitCol: number): string {
  for (let j = startI - 1; j >= Math.max(0, startI - 5); j--) {
    const candidate = lines[j];
    if (!candidate.trim()) continue;
    if (isSectionHeader(candidate)) {
      return parseSectionLabel(candidate, splitCol);
    }
    break;
  }
  return "";
}

function collectPlainBlock(lines: string[], startI: number, endI: number): string {
  const block: string[] = [];
  for (let j = startI; j < endI; j++) {
    const line = lines[j];
    if (!line.trim()) continue;
    if (isSectionHeader(line)) continue;
    if (MUSICAL_RE.test(line.trim())) continue;
    if (STANDALONE_ORIN_RE.test(line) || STANDALONE_HYMN_RE.test(line)) continue;
    block.push(stripTrailingAmen(line));
  }
  return cleanLyricLines(block);
}

function getOrCreateHymn(
  hymns: ParsedHymn[],
  byNumber: Map<number, ParsedHymn>,
  hymnNum: number,
): ParsedHymn {
  const existing = byNumber.get(hymnNum);
  if (existing) return existing;

  const created: ParsedHymn = {
    id: `hymn-${hymnNum}`,
    number: hymnNum,
    title: `Hymn ${hymnNum}`,
    sectionLabel: "",
    yoruba: "",
    english: "",
  };
  byNumber.set(hymnNum, created);
  hymns.push(created);
  return created;
}

// ── Line splitting ─────────────────────────────────────────────────────────

/** Split a two-column line at splitCol into [left, right]. */
function splitLine(line: string, splitCol: number): [string, string] {
  if (line.length <= splitCol) return [line.trimEnd(), ""];
  return [line.slice(0, splitCol).trimEnd(), line.slice(splitCol).trim()];
}

// ── Lyric block cleanup ────────────────────────────────────────────────────

function cleanLyricLines(lines: string[]): string {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim() && out.length === 0) continue; // skip leading blanks
    if (MUSICAL_RE.test(line.trim())) continue;
    if (/^Amin\.?\s*$/i.test(line.trim())) continue;
    if (/^Amen\.?\s*$/i.test(line.trim())) continue;
    out.push(line);
  }
  while (out.length > 0 && !out[out.length - 1].trim()) out.pop();
  return out.join("\n").trim();
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse pdftotext -layout output of a CCC bilingual hymnal into structured hymns.
 *
 * Handles:
 *   - Two-column layout (Yoruba left, English right)
 *   - Same-line "Orin N  Hymn N" headers
 *   - Standalone "Orin N" with "Hymn N" on the next line
 *   - ALL-CAPS section headers above hymn groups
 *   - Musical notation lines (m:s:d:f:...)
 *   - Trailing Amin/Amen stripping
 */
export function parseBilingualHymns(text: string): ParsedHymn[] {
  // Strip form-feed characters (page breaks from pdftotext)
  const lines = text.replace(/\f/g, "").split("\n");
  const hymns: ParsedHymn[] = [];
  const byNumber = new Map<number, ParsedHymn>();

  const splitCol = detectSplitCol(lines);

  // Pass 1: locate all "Orin N" header line indices for merged two-column text.
  const orinHeaders: { lineIdx: number; number: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = ORIN_RE.exec(lines[i]);
    if (m) orinHeaders.push({ lineIdx: i, number: parseInt(m[1], 10) });
  }

  if (orinHeaders.length === 0) return [];

  // Pass 2: for each Orin header, extract Yoruba (left) and English (right)
  // from raw two-column text where both languages still share the same rows.
  for (let h = 0; h < orinHeaders.length; h++) {
    const { lineIdx: startI, number: hymnNum } = orinHeaders[h];
    const endI = h + 1 < orinHeaders.length ? orinHeaders[h + 1].lineIdx : lines.length;
    const hymn = getOrCreateHymn(hymns, byNumber, hymnNum);
    const sectionLabel = findSectionLabel(lines, startI, splitCol);
    if (!hymn.sectionLabel && sectionLabel) hymn.sectionLabel = sectionLabel;

    const yorubaLines: string[] = [];
    const englishLines: string[] = [];

    for (let j = startI + 1; j < endI; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      if (isSectionHeader(line)) continue;
      if (MUSICAL_RE.test(line.trim())) continue;
      if (STANDALONE_HYMN_RE.test(line)) continue; // skip right-col "Hymn N" header

      const [left, right] = splitLine(line, splitCol);
      const cleanLeft = stripTrailingAmen(left);
      const cleanRight = stripTrailingAmen(right);

      if (cleanLeft) yorubaLines.push(cleanLeft);
      if (cleanRight) englishLines.push(cleanRight);
    }

    const yoruba = cleanLyricLines(yorubaLines);
    const english = cleanLyricLines(englishLines);
    if (yoruba) hymn.yoruba = yoruba;
    if (english) hymn.english = english;
  }

  // Pass 3: standalone Orin blocks. This covers text that has already been
  // reordered into single-column reading order before reaching this parser.
  const standaloneOrinHeaders = lines.flatMap((line, lineIdx) => {
    const match = STANDALONE_ORIN_RE.exec(line);
    return match ? [{ lineIdx, number: parseInt(match[1], 10) }] : [];
  });

  const standaloneHymnHeaders = lines.flatMap((line, lineIdx) => {
    const match = STANDALONE_HYMN_RE.exec(line);
    return match ? [{ lineIdx, number: parseInt(match[1], 10) }] : [];
  });

  for (let i = 0; i < standaloneOrinHeaders.length; i++) {
    const { lineIdx: startI, number: hymnNum } = standaloneOrinHeaders[i];
    const nextOrinI = i + 1 < standaloneOrinHeaders.length
      ? standaloneOrinHeaders[i + 1].lineIdx
      : lines.length;
    const pairedHymn = standaloneHymnHeaders.find(
      (header) => header.number === hymnNum && header.lineIdx > startI && header.lineIdx < nextOrinI,
    );
    const endI = pairedHymn?.lineIdx ?? nextOrinI;

    const hymn = getOrCreateHymn(hymns, byNumber, hymnNum);
    const sectionLabel = findSectionLabel(lines, startI, splitCol);
    if (!hymn.sectionLabel && sectionLabel) hymn.sectionLabel = sectionLabel;

    const yoruba = collectPlainBlock(lines, startI + 1, endI);
    if (yoruba) hymn.yoruba = yoruba;
  }

  // Pass 4: standalone Hymn blocks for reordered right-column text and for
  // alternating Orin/Hymn text where English follows its header directly.
  for (let i = 0; i < standaloneHymnHeaders.length; i++) {
    const { lineIdx: startI, number: hymnNum } = standaloneHymnHeaders[i];
    const nextHymnI = i + 1 < standaloneHymnHeaders.length
      ? standaloneHymnHeaders[i + 1].lineIdx
      : lines.length;
    const nextOrinI = standaloneOrinHeaders.find((header) => header.lineIdx > startI)?.lineIdx ?? lines.length;
    const endI = Math.min(nextHymnI, nextOrinI);

    const english = collectPlainBlock(lines, startI + 1, endI);
    if (!english) continue;

    const hymn = getOrCreateHymn(hymns, byNumber, hymnNum);
    hymn.english = english;
  }

  return hymns;
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
          const yTitle = `${hymn.title} (Yoruba)`;
          results.push({
            title: yTitle,
            artist: "CCC Hymnal",
            language: "yoruba",
            lyrics: `${sectionPrefix}${yTitle}\n${hymn.yoruba}`,
          });
        }
        if (hymn.english) {
          const eTitle = `${hymn.title} (English)`;
          results.push({
            title: eTitle,
            artist: "CCC Hymnal",
            language: "english",
            lyrics: `${sectionPrefix}${eTitle}\n${hymn.english}`,
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
          lyrics: `${sectionPrefix}${hymn.title}\n${parts.join("\n\n")}`,
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
          lyrics: `${sectionPrefix}${hymn.title}\n${pairs.join("\n\n")}`,
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
