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

// ── Pattern A: Numbered songs ──────────────────────────────────────────────

const NUMBERED_RE = /^\s*(\d+)[.\)]\s*(.*)$/;

function detectNumbered(text: string): DetectionResult {
  const lines = text.split("\n");
  const boundaries: { lineIdx: number; num: number; trailing: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(NUMBERED_RE);
    if (m) {
      boundaries.push({ lineIdx: i, num: parseInt(m[1], 10), trailing: m[2].trim() });
    }
  }

  if (boundaries.length < 2) return { pattern: "numbered", confidence: 0, songs: [] };

  const songs: DetectedSong[] = [];

  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b].lineIdx;
    const end = b + 1 < boundaries.length ? boundaries[b + 1].lineIdx : lines.length;

    // Title: trailing text after number, or next non-empty line
    let title = boundaries[b].trailing;
    if (!title) {
      for (let j = start + 1; j < end; j++) {
        const trimmed = lines[j].trim();
        if (trimmed) { title = trimmed; break; }
      }
    }
    if (!title) title = `Song ${boundaries[b].num}`;

    // Lyrics: everything after the title line(s), skipping blank leading lines
    const titleEnd = boundaries[b].trailing ? start + 1 : start + 2;
    const lyricsLines: string[] = [];
    let leadingSkipped = false;
    for (let j = titleEnd; j < end; j++) {
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

  const confidence = scoreDetection(songs, lines.length);
  return { pattern: "numbered", confidence, songs };
}

// ── Pattern B: Titled songs ───────────────────────────────────────────────

function detectTitled(text: string): DetectionResult {
  const lines = text.split("\n");
  const songs: DetectedSong[] = [];

  // Strategy: find short non-empty lines followed by a blank line,
  // where the blank line is followed by longer content.
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // A potential title: short, non-empty, not a section label like "Verse 1:"
    if (line && line.length < 80 && !isSectionLabel(line) && !/^\d+[.\)]/.test(line)) {
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";

      // Title must be followed by blank line (or end of file)
      if (nextLine === "" || i + 1 >= lines.length) {
        // Collect lyrics: from first non-empty line after the blank until next title candidate
        const lyricsStart = i + 2;
        const lyricsLines: string[] = [];
        let j = lyricsStart;

        // Find the next title candidate
        let nextTitleIdx = lines.length;
        for (let k = lyricsStart; k < lines.length; k++) {
          const kLine = lines[k].trim();
          if (kLine && kLine.length < 80 && !isSectionLabel(kLine) && !/^\d+[.\)]/.test(kLine)) {
            const kNext = k + 1 < lines.length ? lines[k + 1].trim() : "";
            if (kNext === "" || k + 1 >= lines.length) {
              // Check if this looks like a title (short line followed by blank)
              // Only split if we have enough lyrics before it
              const lyricsSoFar = lyricsLines.filter((l) => l.trim()).length;
              if (lyricsSoFar >= 2) {
                nextTitleIdx = k;
                break;
              }
            }
          }
        }

        // Collect lyrics up to next title
        j = lyricsStart;
        let leadingSkipped = false;
        while (j < nextTitleIdx) {
          const lLine = lines[j];
          if (!leadingSkipped) {
            if (!lLine.trim()) { j++; continue; }
            leadingSkipped = true;
          }
          lyricsLines.push(lLine);
          j++;
        }

        const lyrics = lyricsLines.join("\n").trim();
        if (lyrics && lyricsLines.filter((l) => l.trim()).length >= 2) {
          songs.push({
            title: line,
            lyrics,
            lineCount: lyricsLines.filter((l) => l.trim()).length,
            language: detectLanguage(lyrics),
          });
          i = nextTitleIdx;
          continue;
        }
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
