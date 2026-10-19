

import { invoke } from "@tauri-apps/api/core";
import JSZip from "jszip";
import mammoth from "mammoth";
import { extractPdfTextWithPdfJs } from "./pdfFallback";
import { normalizeNfc } from "./unicodeUtils";
import { hasTauriInvoke } from "../services/tauriSafe";

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
    case "md":
    case "markdown":
      return file.text();
    case "html":
    case "htm":
      return structuredMarkupText(await file.text());
    case "rtf":
      return extractRtfText(await file.text());
    case "odt":
    case "odp":
      return extractOpenDocumentText(file);
    case "docx":
      return extractDocxText(file);
    case "pptx":
      return extractPptxText(file);
    case "doc":
    case "ppt":
    case "pages":
    case "key":
    case "wps":
      throw new Error(`.${ext} files can't be read directly. Open it and save it as ${ext === "ppt" || ext === "key" ? "PowerPoint (.pptx)" : "Word (.docx)"} or PDF, then import that file.`);
    default:
      throw new Error(`Unsupported file type: .${ext}. Use PDF, DOCX, PPTX, ODT, ODP, RTF, HTML, Markdown, or TXT.`);
  }
}

async function extractPdfText(file: File): Promise<string> {
  let raw = "";
  try {
    raw = await extractPdfTextWithPdfJs(file);
  } catch {
    if (hasTauriInvoke()) {
      const data = Array.from(new Uint8Array(await file.arrayBuffer()));
      raw = await invoke<string>("extract_text_from_pdf", { fileData: data });
      if (!isBilingualHymnTable(raw)) raw = reorderTwoColumnText(raw);
    }
  }
  if (!raw.trim()) throw new Error("This PDF contains no readable text. Scanned pages need OCR first; export a searchable PDF or paste the lyrics.");
  // Bilingual tables must reach their parser with both columns still aligned.
  // PDFs are the one source that wraps long lines, so only they get their halves joined back.
  return normalizeExtractedLyricsText(raw, { joinWrappedLines: true });
}

function isBilingualHymnTable(text: string): boolean {
  return /Orin\s+\d+[^\n]* {4,}Hymn\s+\d+/i.test(text);
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
  if (/\b\d{1,4}$/.test(trimmed)) return true;
  if (/^[ivxlcdm]{1,8}$/i.test(trimmed)) return true;
  if (SECTION_OR_SONG_LABEL_RE.test(trimmed)) return true;
  if (HYMN_MARKER_RE.test(trimmed)) return true;
  if (/^(?:#{1,6}\s*)?(?:hymn|song|orin)\s*\d+\b/i.test(trimmed)) return true;
  if (REFERENCE_MARKER_RE.test(trimmed)) return true;
  if (isAllCapsHeading(trimmed)) return true;
  return false;
}

function shouldJoinWrappedLine(previous: string, next: string, linesStartCapitalised = false): boolean {
  const prev = normalizeExtractedLine(previous);
  const curr = normalizeExtractedLine(next);
  if (!prev || !curr) return false;
  if (isProtectedImportLine(prev) || isProtectedImportLine(curr)) return false;

  if (/[\p{L}\p{M}]-$/u.test(prev) && startsWithLowercaseLetter(curr)) return true;
  if (/[.!?;]$/.test(prev)) return false;
  // When (nearly) every lyric line starts with a capital, a capitalised line is a new line, not
  // the tail of a wrapped one.
  if (linesStartCapitalised && !startsWithLowercaseLetter(curr)) return false;

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

/**
 * Tidy extracted text: line endings, spaces and page breaks. With `joinWrappedLines` (PDFs only),
 * a lyric line the page wrapped in two is joined back. Text from Word, PowerPoint, HTML or a text
 * file already has real line breaks, so its lines are kept exactly as written.
 */
export function normalizeExtractedLyricsText(text: string, options: { joinWrappedLines?: boolean } = {}): string {
  if (isBilingualHymnTable(text)) return normalizeNfc(text).replace(/\r\n?/g, "\n");
  const joinWrapped = options.joinWrappedLines === true;
  const pageBreakToken = "__MCE_PAGE_BREAK__";
  const normalized = normalizeNfc(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, `\n${pageBreakToken}\n`);

  const output: string[] = [];
  let pending = "";
  // How this file starts its lines, judged only on lines that surely are line starts (after a
  // blank line, a label or end punctuation), since wrapped tails would skew it.
  const allLines = normalized.split("\n").map(normalizeExtractedLine);
  const lineStarts = allLines.filter((line, i) => /^\P{L}*\p{L}/u.test(line)
    && (i === 0 || !allLines[i - 1] || /[.,;:!?]$/.test(allLines[i - 1]) || isProtectedImportLine(allLines[i - 1])));
  const capitalisedStarts = lineStarts.filter((line) => !startsWithLowercaseLetter(line)).length;
  const linesStartCapitalised = lineStarts.length >= 6 && capitalisedStarts / lineStarts.length >= 0.85;

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

    if (joinWrapped && shouldJoinWrappedLine(pending, line, linesStartCapitalised)) {
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
  // As HTML, so headings (song titles), empty paragraphs (verse breaks) and soft line breaks survive.
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ arrayBuffer: buffer }, { ignoreEmptyParagraphs: false })).value;
  } catch (error) {
    // The browser Mammoth build accepts ArrayBuffer; the Node build used by
    // tests and desktop tooling accepts Buffer. Support both entrypoints.
    if (typeof Buffer === "undefined") throw error;
    html = (await mammoth.convertToHtml({ buffer: Buffer.from(buffer) }, { ignoreEmptyParagraphs: false })).value;
  }
  return structuredMarkupText(html);
}

/**
 * HTML (from Word, OpenDocument or a saved web page) as lyric text that keeps its shape:
 * - a heading becomes "# Title", which the importer reads as the start of a song;
 * - a line break inside a paragraph stays a line break;
 * - when each paragraph is one line (how most people type songs in Word), paragraphs are the lines
 *   of a verse and an empty paragraph is the gap between verses;
 * - when paragraphs hold several lines each (a verse per paragraph), each paragraph is a verse.
 */
export function structuredMarkupText(markup: string): string {
  const cleaned = markup
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[^]*?-->/g, "");
  type Block = { kind: "heading" | "para"; lines: string[] };
  const blocks: Block[] = [];
  const blockRe = /<(h[1-6]|p|li|div|tr)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/gi;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = blockRe.exec(cleaned))) {
    found = true;
    const inner = (match[2] ?? "").replace(/<(?:br|line-break)\b[^>]*\/?>/gi, "\n");
    const text = decodeXmlText(inner.replace(/<[^>]*>/g, "")).replace(/&nbsp;/g, " ").replace(/\u00a0/g, " ");
    const lines = text.split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim());
    const kind = /^h/i.test(match[1]) ? "heading" : "para";
    if (kind === "heading" && lines.join(" ").trim()) blocks.push({ kind, lines: [lines.join(" ").trim()] });
    else if (kind === "para") blocks.push({ kind, lines: lines.filter((line, i) => line || i > 0) });
  }
  if (!found) return extractMarkupText(markup);
  const paras = blocks.filter((b) => b.kind === "para" && b.lines.some(Boolean));
  const versePerParagraph = paras.length > 0 && paras.filter((b) => b.lines.filter(Boolean).length > 1).length / paras.length >= 0.3;
  const out: string[] = [];
  const gap = () => { if (out.length && out[out.length - 1] !== "") out.push(""); };
  for (const block of blocks) {
    if (block.kind === "heading") {
      gap();
      out.push(`# ${block.lines[0]}`, "");
      continue;
    }
    const lines = block.lines.filter(Boolean);
    if (lines.length === 0) { gap(); continue; }
    if (versePerParagraph) gap();
    out.push(...lines);
    if (versePerParagraph) gap();
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Removes RTF groups that hold no text (font and colour tables, styles, pictures, {\\* …}), braces balanced. */
function stripRtfGroups(rtf: string): string {
  const skip = /^\{\\(?:\*|fonttbl|colortbl|stylesheet|info|pict|header|footer|listtable|listoverridetable|generator)\b/;
  let out = "";
  for (let i = 0; i < rtf.length; i += 1) {
    if (rtf[i] === "{" && rtf[i - 1] !== "\\" && skip.test(rtf.slice(i, i + 24))) {
      let depth = 0;
      for (; i < rtf.length; i += 1) {
        if (rtf[i] === "\\") { i += 1; continue; }
        if (rtf[i] === "{") depth += 1;
        else if (rtf[i] === "}" && --depth === 0) break;
      }
      continue;
    }
    out += rtf[i];
  }
  return out;
}

/** Plain text out of an RTF file (WordPad, TextEdit and older Word save these). */
export function extractRtfText(rtf: string): string {
  let text = stripRtfGroups(rtf)
    .replace(/\\par[d]?\b ?/g, (m) => (m.startsWith("\\pard") ? "" : "\n"))
    .replace(/\\line\b ?/g, "\n")
    .replace(/\\tab\b ?/g, " ")
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, code: string) => String.fromCharCode((Number(code) + 65536) % 65536))
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/\\([{}\\])/g, "$1")
    .replace(/[{}]/g, "");
  text = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).join("\n");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractMarkupText(markup: string): string {
  return decodeXmlText(markup
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<(?:[\w.-]+:)?(?:br|line-break)\b[^>]*\/?>/gi, "\n")
    .replace(/<\/(?:[\w.-]+:)?(?:p|h[1-6]|h|div|li|tr)>/gi, "\n\n")
    .replace(/<[^>]*>/g, ""))
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n").trim();
}

async function extractOpenDocumentText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const content = zip.file("content.xml");
  if (!content) throw new Error("This OpenDocument file is missing its text content.");
  const xml = await content.async("string");
  if (/\.odp$/i.test(file.name)) {
    return Array.from(xml.matchAll(/<draw:page\b[^>]*>([\s\S]*?)<\/draw:page>/g))
      .map((page) => extractMarkupText(page[1])).join("\f");
  }
  // OpenDocument tags as HTML ones: text:h = heading, text:p = paragraph, text:line-break = <br>.
  const html = xml
    .replace(/<text:h\b[^>]*\/>/g, "")
    .replace(/<text:h\b[^>]*>/g, "<h2>").replace(/<\/text:h>/g, "</h2>")
    .replace(/<text:p\b[^>]*\/>/g, "<p></p>")
    .replace(/<text:p\b[^>]*>/g, "<p>").replace(/<\/text:p>/g, "</p>")
    .replace(/<text:line-break\b[^>]*\/>/g, "<br>");
  return structuredMarkupText(html);
}

function readXmlAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}\\s*=\\s*([\"'])(.*?)\\1`, "i"));
  return match?.[2] ? decodeXmlText(match[2]) : "";
}

function readXmlRelationshipId(tag: string): string {
  const namespaced = tag.match(/\b[\w.-]+:id\s*=\s*([\"'])(.*?)\1/i);
  return namespaced?.[2] ? decodeXmlText(namespaced[2]) : readXmlAttribute(tag, "id");
}

function resolveZipPath(basePath: string, target: string): string {
  const parts = [
    ...basePath.split("/").slice(0, -1),
    ...decodeXmlText(target).replace(/\\/g, "/").split("/"),
  ];
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  return normalized.join("/");
}

async function extractPptxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const presentationPath = "ppt/presentation.xml";
  const presentationEntry = zip.file(presentationPath);
  const relationshipEntry = zip.file("ppt/_rels/presentation.xml.rels");
  if (!presentationEntry || !relationshipEntry) {
    throw new Error("The PowerPoint file is missing its presentation metadata.");
  }

  const presentationXml = await presentationEntry.async("string");
  const relationshipXml = await relationshipEntry.async("string");
  const relationships = new Map<string, string>();

  for (const match of relationshipXml.matchAll(/<Relationship\b[^>]*>/gi)) {
    const id = readXmlAttribute(match[0], "Id");
    const target = readXmlAttribute(match[0], "Target");
    if (id && target) relationships.set(id, target);
  }

  const slidePaths = Array.from(
    presentationXml.matchAll(/<(?:[\w.-]+:)?sldId\b[^>]*>/gi),
  )
    .map((match) => relationships.get(readXmlRelationshipId(match[0])) ?? "")
    .filter(Boolean)
    .map((target) => resolveZipPath(presentationPath, target));

  if (slidePaths.length === 0) {
    throw new Error("The PowerPoint file does not contain any slides.");
  }

  const slideTexts: string[] = [];
  for (const slidePath of slidePaths) {
    const slideEntry = zip.file(slidePath);
    if (!slideEntry) continue;
    const slideXml = await slideEntry.async("string");
    const paragraphs = Array.from(
      slideXml.matchAll(/<(?:[\w.-]+:)?p\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?p>/gi),
    )
      // Text runs, with a soft line break (Shift+Enter, <a:br/>) kept as a new line.
      .map((paragraph) => Array.from(
        paragraph[0].matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>|<(?:[\w.-]+:)?br\b[^>]*\/?>/gi),
      )
        .map((text) => (text[1] === undefined ? "\n" : decodeXmlText(text[1])))
        .join(""))
      .flatMap((paragraph) => paragraph.split("\n").map((line) => line.trim()))
      .filter(Boolean);

    slideTexts.push(paragraphs.join("\n"));
  }

  return slideTexts.join("\f");
}

export function getFileTypeLabel(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "PDF";
    case "txt": return "Text";
    case "docx": return "DOCX";
    case "pptx": return "PPTX";
    case "rtf": return "RTF";
    default: return ext?.toUpperCase() || "Unknown";
  }
}
