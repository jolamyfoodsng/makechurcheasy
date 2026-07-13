

import { invoke } from "@tauri-apps/api/core";
import mammoth from "mammoth";
import { extractPdfTextWithPdfJs } from "./pdfFallback";

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
    // Fall through to in-browser extraction.
  }
  const fallback = await extractPdfTextWithPdfJs(file);
  return reorderTwoColumnText(fallback);
}

export function reorderTwoColumnText(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 6) return text;

  const gapPositions: number[] = [];
  for (const line of lines) {
    if (line.trim().length < 10) continue;
    for (let c = 0; c < line.length - 1; c++) {
      if (line[c] === " " && line[c + 1] === " ") {
        const leadingSpaces = line.length - line.trimStart().length;
        if (c >= leadingSpaces + 4) {
          gapPositions.push(c);
          break;
        }
      }
    }
  }

  if (gapPositions.length < 6) return text;

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

  if (bestCount < Math.ceil(lines.length * 0.2)) return text;

  const gapCenter = Math.round(
    gapPositions.filter((p) => Math.abs(p - bestBin) < 12)
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

      if (leftLen >= 3 && rightLen >= 3) {
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
  if (leftContent < 4 || rightContent < 4) return text;

  const result: string[] = [];
  for (const line of leftColumn) {
    result.push(line);
  }
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

export function getFileTypeLabel(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "PDF";
    case "txt": return "Text";
    case "docx": return "DOCX";
    default: return ext?.toUpperCase() || "Unknown";
  }
}
