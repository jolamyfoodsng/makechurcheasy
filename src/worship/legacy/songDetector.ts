/**
 * songDetector.ts — Detect and split songs from raw text.
 *
 * Supports three detection patterns:
 *   A. Numbered songs (1. Title / lyrics...)
 *   B. Titled songs (Title / blank line / lyrics)
 *   C. CCC hymnal (Orin N / Hymn N headers)
 */

import { parseBilingualHymns, type ParsedHymn } from "./pdfImportService";
import { parseWorshipLyricSections } from "./slideEngine";

// ── Types ──────────────────────────────────────────────────────────────────

export interface DetectedSong {
  title: string;
  lyrics: string;
  lineCount: number;
  language?: string;
}

export interface DetectionResult {
  pattern: "numbered" | "titled" | "ccc";
  confidence: number;
  songs: DetectedSong[];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run all detectors and return the highest-confidence result.
 */
export function detectSongs(text: string): DetectionResult {
  const ccc = detectCCC(text);
  if (ccc.songs.length > 0) return ccc;

  const numbered = detectNumbered(text);
  const titled = detectTitled(text);

  return pickBest([numbered, titled]);
}

/**
 * Estimate how many slides a song would generate.
 */
export function estimateSlideCount(lyrics: string, linesPerSlide = 2): number {
  const sections = parseWorshipLyricSections(lyrics, linesPerSlide);
  return sections.reduce((sum, s) => sum + s.slideCount, 0) || 1;
}

/**
 * Heuristic language detection for a lyric block.
 */
export function detectLanguage(text: string): string | undefined {
  if (!text.trim()) return undefined;

  // Yoruba diacritics: ẹ, ọ, ṣ, ń, á, é, í, ó, ú + combining marks
  const yorubaRe = /[ẹọṣ\u0301\u0300\u0304\u030C]/i;
  const hasYoruba = yorubaRe.test(text);

  // Mostly ASCII letters → English
  const asciiLetters = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  const isMostlyAscii = totalChars > 0 && asciiLetters / totalChars > 0.85;

  if (hasYoruba && isMostlyAscii) return "bilingual";
  if (hasYoruba) return "yoruba";
  if (isMostlyAscii) return "english";
  return undefined;
}

// ── Attribution detection ─────────────────────────────────────────────────

const ATTRIBUTION_RE: RegExp[] = [
  /^\s*[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\s*$/,
  /^\s*(?:MHB|PH|CH|TH|THC|CB|GBP|CWS|PPP|CP|TPH|TCH|SGT|SOS|HCB|BB|KB)\s*\.?\s*\d+\s*$/i,
];

function isAttributionLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return ATTRIBUTION_RE.some((re) => re.test(trimmed));
}

type LineType = "hymn-header" | "verse-number" | "attribution" | "lyric" | "blank";

function classifyLine(line: string): LineType {
  const trimmed = line.trim();
  if (!trimmed) return "blank";
  if (isAttributionLine(trimmed)) return "attribution";
  if (/^\d+$/.test(trimmed)) return "hymn-header";
  if (/^\d+\./.test(trimmed)) return "verse-number";
  if (/^\d+\)/.test(trimmed)) return "verse-number";
  return "lyric";
}

// ── Pattern A: Numbered songs ──────────────────────────────────────────────

function detectNumbered(text: string): DetectionResult {
  const lines = text.split("\n");
  const types = lines.map(classifyLine);

  const boundaries: { lineIdx: number; num: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (types[i] === "hymn-header") {
      const m = lines[i].match(/^\s*(\d+)\s*$/);
      if (m) {
        boundaries.push({ lineIdx: i, num: parseInt(m[1], 10) });
      }
    }
  }

  if (boundaries.length < 2) return { pattern: "numbered", confidence: 0, songs: [] };

  const songs: DetectedSong[] = [];

  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b].lineIdx;
    const end = b + 1 < boundaries.length ? boundaries[b + 1].lineIdx : lines.length;

    const title = `Hymn ${boundaries[b].num}`;
    let titleEndLine = start + 1;
    for (let j = start + 1; j < end; j++) {
      if (types[j] === "lyric") {
        titleEndLine = j;
        break;
      }
      if (types[j] === "verse-number") break;
      titleEndLine = j + 1;
    }

    const lyricsLines: string[] = [];
    let leadingSkipped = false;
    for (let j = titleEndLine; j < end; j++) {
      if (types[j] === "attribution") continue;
      const line = lines[j];
      if (!leadingSkipped) {
        if (!line.trim()) continue;
        leadingSkipped = true;
      }
      lyricsLines.push(line);
    }

    const lyrics = lyricsLines.join("\n").trim();
    if (!lyrics) continue;

    songs.push({
      title: title.replace(/\s+/g, " ").trim(),
      lyrics,
      lineCount: lyricsLines.filter((l) => l.trim()).length,
      language: detectLanguage(lyrics),
    });
  }

  validateVerseNumbering(songs);

  const confidence = scoreDetection(songs, lines.length);
  return { pattern: "numbered", confidence, songs };
}

// ── Validation: verse numbering continuity ────────────────────────────────

function validateVerseNumbering(songs: DetectedSong[]): void {
  for (let i = 1; i < songs.length; i++) {
    const prevVerses = extractVerseNumbers(songs[i - 1].lyrics);
    const currVerses = extractVerseNumbers(songs[i].lyrics);

    if (prevVerses.length === 0 || currVerses.length === 0) continue;

    const prevMax = Math.max(...prevVerses);
    const currMin = Math.min(...currVerses);

    if (currMin === 1) continue;

    if (currMin === prevMax + 1) {
      songs[i - 1].lyrics += "\n" + songs[i].lyrics;
      songs[i - 1].lineCount += songs[i].lineCount;
      songs.splice(i, 1);
      i--;
    }
  }
}

function extractVerseNumbers(lyrics: string): number[] {
  const numbers: number[] = [];
  for (const line of lyrics.split("\n")) {
    const m = line.match(/^\s*(\d+)\.\s/);
    if (m) numbers.push(parseInt(m[1], 10));
  }
  return numbers;
}

// ── Pattern B: Titled songs ───────────────────────────────────────────────

function detectTitled(text: string): DetectionResult {
  const lines = text.split("\n");
  const songs: DetectedSong[] = [];

  // Strategy: scan once for short non-empty lines followed by a blank line.
  // This avoids the quadratic look-ahead path that can stall large hymn books.
  const isTitleCandidate = (index: number): boolean => {
    const line = lines[index]?.trim() ?? "";
    if (!line || line.length >= 80 || isSectionLabel(line) || /^\d+[.\)]/.test(line)) {
      return false;
    }
    const nextLine = index + 1 < lines.length ? lines[index + 1].trim() : "";
    return nextLine === "" || index + 1 >= lines.length;
  };

  let i = 0;
  while (i < lines.length) {
    if (isTitleCandidate(i)) {
      const title = lines[i].trim();
      const lyricsStart = i + 2;
      const lyricsLines: string[] = [];
      let lyricCount = 0;
      let leadingSkipped = false;
      let j = lyricsStart;

      while (j < lines.length) {
        if (isTitleCandidate(j) && lyricCount >= 2) {
          break;
        }

        const currentLine = lines[j];
        if (!leadingSkipped) {
          if (!currentLine.trim()) {
            j += 1;
            continue;
          }
          leadingSkipped = true;
        }

        lyricsLines.push(currentLine);
        if (currentLine.trim()) {
          lyricCount += 1;
        }
        j += 1;
      }

      const lyrics = lyricsLines.join("\n").trim();
      if (lyrics && lyricCount >= 2) {
        songs.push({
          title,
          lyrics,
          lineCount: lyricCount,
          language: detectLanguage(lyrics),
        });
        i = j;
        continue;
      }
    }
    i++;
  }

  const confidence = scoreDetection(songs, lines.length);
  return { pattern: "titled", confidence, songs };
}

// ── Pattern C: CCC Hymnal ─────────────────────────────────────────────────

function detectCCC(text: string): DetectionResult {
  const parsed: ParsedHymn[] = parseBilingualHymns(text);
  if (parsed.length === 0) return { pattern: "ccc", confidence: 0, songs: [] };

  const songs: DetectedSong[] = parsed.map((h) => {
    const parts: string[] = [];
    if (h.yoruba) parts.push(h.yoruba);
    if (h.english) parts.push(h.english);
    const combined = parts.join("\n\n");

    return {
      title: h.title,
      lyrics: combined,
      lineCount: combined.split("\n").filter((l) => l.trim()).length,
      language: h.yoruba && h.english ? "bilingual" : h.yoruba ? "yoruba" : "english",
    };
  });

  // CCC format is highly specific — high confidence when detected
  const confidence = Math.min(100, 70 + songs.length * 2);
  return { pattern: "ccc", confidence, songs };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isSectionLabel(line: string): boolean {
  return /^(verse|chorus|bridge|pre-chorus|tag|intro|outro|refrain|vamp|hook)\b/i.test(line);
}

function scoreDetection(songs: DetectedSong[], totalLines: number): number {
  if (songs.length === 0) return 0;

  const avgLines = songs.reduce((sum, s) => sum + s.lineCount, 0) / songs.length;
  const nonEmptyRatio = songs.filter((s) => s.lyrics.trim().length > 0).length / songs.length;
  const totalLyricsLines = songs.reduce((sum, s) => sum + s.lineCount, 0);
  const coverage = totalLines > 0 ? Math.min(1, totalLyricsLines / totalLines) : 0;

  const score =
    (Math.min(songs.length, 10) / 10) * 40 +
    (Math.min(avgLines, 15) / 15) * 30 +
    nonEmptyRatio * 20 +
    coverage * 10;

  return Math.round(Math.min(100, score));
}

function pickBest(results: DetectionResult[]): DetectionResult {
  const valid = results.filter((r) => r.songs.length >= 2);
  if (valid.length === 0) {
    // Fall back to any result with songs
    const any = results.filter((r) => r.songs.length > 0);
    return any.length > 0 ? any[0] : results[0];
  }
  return valid.reduce((best, r) => (r.confidence > best.confidence ? r : best));
}
