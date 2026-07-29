

import { invoke } from "@tauri-apps/api/core";
import mammoth from "mammoth";
import { extractPdfTextWithPdfJs } from "./pdfFallback";
import { normalizeNfc } from "./unicodeUtils";

export interface ExtractedTextQuality {
  usable: boolean;
  score: number;
  reasons: string[];
  stats: {
    chars: number;
    words: number;
    lines: number;
    readableLines: number;
    avgLineLength: number;
    singletonRatio: number;
    symbolRatio: number;
  };
}

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
      return normalizeExtractedLyricsText(reorderTwoColumnText(raw));
    }
  } catch {
    // Fall through to in-browser extraction.
  }
  const fallback = await extractPdfTextWithPdfJs(file);
  return normalizeExtractedLyricsText(reorderTwoColumnText(fallback));
}

interface ColumnGapCandidate {
  start: number;
  end: number;
  width: number;
}

function findColumnGapCandidates(line: string): ColumnGapCandidate[] {
  const candidates: ColumnGapCandidate[] = [];
  const re = / {4,}/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line))) {
    const start = match.index;
    const width = match[0].length;
    const end = start + width;
    const left = line.slice(0, start).trim();
    const right = line.slice(end).trim();

    if (!right) continue;
    if (!left && end < 12) continue;
    if (left || start === 0) {
      candidates.push({ start, end, width });
    }
  }

  return candidates;
}

function trimColumnLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && !next[0].trim()) next.shift();
  while (next.length > 0 && !next[next.length - 1].trim()) next.pop();
  if (next.length > 1 && /^\d{1,4}$/.test(next[next.length - 1].trim())) {
    next.pop();
  }
  return next;
}

function isColumnSplitContent(rightPart: string): boolean {
  const trimmed = rightPart.trim();
  if (trimmed.replace(/\s/g, "").length >= 2) return true;
  return /^\d$/.test(trimmed);
}

function reorderTwoColumnPage(pageText: string): string {
  const lines = pageText.split("\n");
  if (lines.length < 6) return pageText;

  const rightStarts: number[] = [];
  for (const line of lines) {
    if (line.trim().length < 3) continue;
    const widestGap = findColumnGapCandidates(line)
      .sort((a, b) => b.width - a.width)[0];
    if (widestGap) rightStarts.push(widestGap.end);
  }

  if (rightStarts.length < 6) return pageText;

  const bins = new Map<number, number[]>();
  for (const pos of rightStarts) {
    const bin = Math.floor(pos / 6) * 6;
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

  if (bestCount < Math.max(4, Math.ceil(lines.length * 0.08))) return pageText;

  const rightStart = Math.round(
    rightStarts.filter((p) => Math.abs(p - bestBin) < 10)
      .reduce((a, b) => a + b, 0) / bestCount,
  );

  const leftColumn: string[] = [];
  const rightColumn: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      leftColumn.push("");
      rightColumn.push("");
      continue;
    }

    const gaps = findColumnGapCandidates(line);
    let bestGap: ColumnGapCandidate | null = null;
    let bestDist = Infinity;

    for (const gap of gaps) {
      const dist = Math.abs(gap.end - rightStart);
      if (dist < bestDist) {
        bestDist = dist;
        bestGap = gap;
      }
    }

    if (bestGap && bestDist <= 14) {
      const leftPart = line.substring(0, bestGap.start).trimEnd();
      const rightPart = line.substring(bestGap.end).trimStart();
      const leftLen = leftPart.replace(/\s/g, "").length;

      if (isColumnSplitContent(rightPart) && (leftLen >= 1 || bestGap.start === 0)) {
        leftColumn.push(leftPart);
        rightColumn.push(rightPart);
        continue;
      }
    }

    leftColumn.push(line);
    rightColumn.push("");
  }

  const leftContent = leftColumn.filter((l) => l.trim().length > 0).length;
  const rightContent = rightColumn.filter((l) => l.trim().length > 0).length;
  if (leftContent < 4 || rightContent < 4) return pageText;

  const result: string[] = [];
  for (const line of trimColumnLines(leftColumn)) {
    result.push(line);
  }
  if (rightContent > 0) {
    result.push("");
    for (const line of trimColumnLines(rightColumn)) {
      result.push(line);
    }
  }
  return result.join("\n");
}

export function reorderTwoColumnText(text: string): string {
  return text
    .split("\f")
    .map((page) => reorderTwoColumnPage(page))
    .join("\f");
}

const SECTION_OR_SONG_LABEL_RE =
  /^(?:\[(?:verse|v|chorus|c|refrain|bridge|tag|intro|outro|pre[-\s]?chorus)\s*\d*\]|(?:verse|v|chorus|c|refrain|bridge|tag|intro|outro|pre[-\s]?chorus)\s*\d*[:.-]?)$/i;

const HYMN_MARKER_RE =
  /^(?:hymn|orin|song|psalm|canticle|ph|mhb|rh|ch)\.?\s*\d+[a-z]?\.?$/i;

const REFERENCE_MARKER_RE =
  /^(?:ph|mhb|rh|hf|ch)\.?\s*\d+(?:\s*,?\s*[a-z][\w.'’() -]+)?$/i;

const OPEN_TRAILING_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "my",
  "nor",
  "of",
  "on",
  "or",
  "our",
  "shall",
  "that",
  "the",
  "their",
  "thy",
  "to",
  "unto",
  "very",
  "with",
  "your",
]);

function countWords(text: string): number {
  return (text.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? []).length;
}

function normalizeExtractedLine(line: string): string {
  return line
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .trim();
}

function getLastWord(line: string): string {
  const match = line.toLowerCase().match(/[\p{L}\p{M}'’-]+(?=[^\p{L}\p{M}]*$)/u);
  return match?.[0].replace(/^['’-]+|['’-]+$/g, "") ?? "";
}

function startsWithLowercaseLetter(line: string): boolean {
  const firstLetter = line.match(/\p{L}/u)?.[0] ?? "";
  return Boolean(firstLetter) && firstLetter === firstLetter.toLocaleLowerCase() && firstLetter !== firstLetter.toLocaleUpperCase();
}

function isAllCapsHeading(line: string): boolean {
  const letters = line.match(/\p{L}/gu) ?? [];
  if (letters.length < 6 || line.length > 80) return false;
  const upper = letters.filter((letter) => letter === letter.toLocaleUpperCase() && letter !== letter.toLocaleLowerCase()).length;
  return upper / letters.length >= 0.8 && countWords(line) >= 2;
}

function isProtectedImportLine(line: string): boolean {
  const trimmed = normalizeExtractedLine(line);
  if (!trimmed) return true;
  if (/^\d{1,4}$/.test(trimmed)) return true;
  if (/^[ivxlcdm]{1,8}$/i.test(trimmed)) return true;
  if (SECTION_OR_SONG_LABEL_RE.test(trimmed)) return true;
  if (HYMN_MARKER_RE.test(trimmed)) return true;
  if (REFERENCE_MARKER_RE.test(trimmed)) return true;
  if (isAllCapsHeading(trimmed)) return true;
  return false;
}

function shouldJoinWrappedLine(previous: string, next: string): boolean {
  const prev = normalizeExtractedLine(previous);
  const curr = normalizeExtractedLine(next);
  if (!prev || !curr) return false;
  if (isProtectedImportLine(prev) || isProtectedImportLine(curr)) return false;

  if (/[\p{L}\p{M}]-$/u.test(prev) && startsWithLowercaseLetter(curr)) return true;
  if (/[.!?;]$/.test(prev)) return false;

  const nextWords = countWords(curr);
  const prevLastWord = getLastWord(prev);
  const nextStartsLower = startsWithLowercaseLetter(curr);
  const previousEndsSoftPunctuation = /[,:"'’”)]$/.test(prev);

  if (nextStartsLower) {
    return prev.length >= 8 || curr.length <= 28;
  }

  if (previousEndsSoftPunctuation) return false;
  if (OPEN_TRAILING_WORDS.has(prevLastWord) && curr.length <= 42 && nextWords <= 6) return true;
  if (prev.length >= 34 && curr.length <= 24 && nextWords <= 4) return true;

  return false;
}

function appendJoinedLine(previous: string, next: string): string {
  const prev = normalizeExtractedLine(previous);
  const curr = normalizeExtractedLine(next);
  if (/[\p{L}\p{M}]-$/u.test(prev) && startsWithLowercaseLetter(curr)) {
    return `${prev.slice(0, -1)}${curr}`;
  }
  return `${prev} ${curr}`;
}

export function normalizeExtractedLyricsText(text: string): string {
  const pageBreakToken = "__MCE_PAGE_BREAK__";
  const normalized = normalizeNfc(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, `\n${pageBreakToken}\n`);

  const output: string[] = [];
  let pending = "";

  const flushPending = () => {
    if (!pending) return;
    output.push(pending);
    pending = "";
  };

  for (const rawLine of normalized.split("\n")) {
    if (rawLine === pageBreakToken) {
      flushPending();
      while (output.length > 0 && output[output.length - 1] === "") {
        output.pop();
      }
      output.push("\f");
      continue;
    }

    const line = normalizeExtractedLine(rawLine);

    if (!line) {
      flushPending();
      if (output[output.length - 1] !== "") output.push("");
      continue;
    }

    if (!pending) {
      pending = line;
      continue;
    }

    if (shouldJoinWrappedLine(pending, line)) {
      pending = appendJoinedLine(pending, line);
      continue;
    }

    flushPending();
    pending = line;
  }

  flushPending();

  return output
    .join("\n")
    .replace(/\n*\f\n*/g, "\n\f\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function assessExtractedTextQuality(text: string): ExtractedTextQuality {
  const trimmed = text.trim();
  const lines = trimmed ? trimmed.split("\n") : [];
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  const words = countWords(trimmed);
  const readableLines = nonEmptyLines.filter((line) => countWords(line) >= 2 || line.length >= 12).length;
  const singletonWords = trimmed.match(/\b\p{L}\b/gu)?.length ?? 0;
  const nonWhitespaceChars = trimmed.replace(/\s/g, "").length;
  const symbolChars = trimmed.match(/[^\p{L}\p{N}\s.,;:'"’‘!?()[\]\-]/gu)?.length ?? 0;
  const avgLineLength = nonEmptyLines.length > 0
    ? Math.round(nonEmptyLines.reduce((sum, line) => sum + line.length, 0) / nonEmptyLines.length)
    : 0;
  const singletonRatio = words > 0 ? singletonWords / words : 1;
  const symbolRatio = nonWhitespaceChars > 0 ? symbolChars / nonWhitespaceChars : 1;

  let score = 100;
  const reasons: string[] = [];

  if (trimmed.length < 120) {
    score -= 35;
    reasons.push("Very little text was extracted.");
  }
  if (words < 20) {
    score -= 35;
    reasons.push("Too few readable words were extracted.");
  }
  if (nonEmptyLines.length > 0 && readableLines / nonEmptyLines.length < 0.35) {
    score -= 20;
    reasons.push("Most extracted lines are too short to be useful.");
  }
  if (avgLineLength > 0 && avgLineLength < 5) {
    score -= 15;
    reasons.push("Average extracted line length is suspiciously short.");
  }
  if (singletonRatio > 0.35) {
    score -= 20;
    reasons.push("The extracted text appears to contain many broken single-letter tokens.");
  }
  if (symbolRatio > 0.25) {
    score -= 20;
    reasons.push("The extracted text contains too much symbol noise.");
  }

  const usable = score >= 50 && trimmed.length >= 80 && words >= 10;

  return {
    usable,
    score: Math.max(0, Math.min(100, score)),
    reasons,
    stats: {
      chars: trimmed.length,
      words,
      lines: nonEmptyLines.length,
      readableLines,
      avgLineLength,
      singletonRatio,
      symbolRatio,
    },
  };
}

async function extractDocxText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

export function getFileTypeLabel(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "PDF";
    case "txt": return "Text";
    case "docx": return "DOCX";
    default: return ext?.toUpperCase() || "Unknown";
  }
}
