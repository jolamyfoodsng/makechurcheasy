import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  assessExtractedTextQuality,
  normalizeExtractedLyricsText,
  reorderTwoColumnText,
} from "../desktop/src/worship/bulkImportService";
import { processDocument } from "../api/src/lib/worship/structureProvider";

type TimedStep<T> = {
  value: T;
  durationMs: number;
};

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const DEFAULT_PDF = path.join(ROOT_DIR, "F3A8E1F6-3C53-462D-B9B5-05E89E66E030-export.pdf");
const PDF_PATH = path.resolve(process.argv[2] || DEFAULT_PDF);
const FILE_NAME = path.basename(PDF_PATH);
const REPORT_DIR = path.join(ROOT_DIR, "reports");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const REPORT_BASENAME = `worship-import-live-${path.parse(FILE_NAME).name}-${TIMESTAMP}`;
const MARKDOWN_LOG = path.join(REPORT_DIR, `${REPORT_BASENAME}.md`);
const JSON_LOG = path.join(REPORT_DIR, `${REPORT_BASENAME}.json`);

function loadApiEnv(): void {
  const envPath = path.join(ROOT_DIR, "api", ".env.local");
  if (!existsSync(envPath)) return;

  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function findBinary(name: string, candidates: string[]): string {
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-v"], { stdio: "ignore" });
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(`${name} not found`);
}

function getPageCount(pdfPath: string): number {
  const pdfinfo = findBinary("pdfinfo", [
    "pdfinfo",
    "/opt/homebrew/bin/pdfinfo",
    "/usr/local/bin/pdfinfo",
    "/usr/bin/pdfinfo",
    "/snap/bin/pdfinfo",
  ]);
  const output = execFileSync(pdfinfo, [pdfPath], { encoding: "utf8" });
  const match = output.match(/Pages:\s*(\d+)/i);
  if (!match) throw new Error("Could not read PDF page count");
  return Number(match[1]);
}

function extractPdfWithPdftotext(pdfPath: string): string {
  const pdftotext = findBinary("pdftotext", [
    "pdftotext",
    "/opt/homebrew/bin/pdftotext",
    "/usr/local/bin/pdftotext",
    "/usr/bin/pdftotext",
    "/snap/bin/pdftotext",
  ]);
  return execFileSync(
    pdftotext,
    ["-layout", "-enc", "UTF-8", pdfPath, "-"],
    { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 },
  );
}

async function timed<T>(fn: () => Promise<T> | T): Promise<TimedStep<T>> {
  const started = performance.now();
  const value = await fn();
  return { value, durationMs: Math.round(performance.now() - started) };
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${minutes}m ${String(rem).padStart(2, "0")}s`;
}

function wordCount(text: string): number {
  return (text.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? []).length;
}

function sampleSongs(songs: Awaited<ReturnType<typeof processDocument>>["songs"]) {
  return songs.slice(0, 12).map((song, index) => ({
    index: index + 1,
    title: song.title,
    hymnNumber: song.hymnNumber,
    sections: song.sections.length,
    firstSectionType: song.sections[0]?.type,
    firstSectionPreview: song.sections[0]?.content.slice(0, 220),
    warnings: song.warnings ?? [],
  }));
}

function containsChecks(text: string) {
  const checks = [
    "I see the signs are all around",
    "A greater rain is coming very soon",
    "The sons of God with a word in their mouth",
  ];
  return checks.map((phrase) => ({ phrase, present: text.includes(phrase) }));
}

function appendLog(line = ""): void {
  writeFileSync(MARKDOWN_LOG, `${line}\n`, { flag: "a" });
}

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(MARKDOWN_LOG, "");
  loadApiEnv();
  process.env.OPENCODE_MODEL = process.env.OPENCODE_MODEL?.trim() || "mimo-v2.5-free";

  const consoleLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    const line = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
    appendLog(line);
    consoleLog(...args);
  };

  if (!existsSync(PDF_PATH)) {
    throw new Error(`PDF not found: ${PDF_PATH}`);
  }
  if (!process.env.OPENCODE_API_KEY?.trim()) {
    throw new Error("OPENCODE_API_KEY is not configured in api/.env.local or the environment");
  }

  appendLog("# Worship Import Live Test");
  appendLog("");
  appendLog(`- File: \`${PDF_PATH}\``);
  appendLog(`- Started: ${new Date().toISOString()}`);
  appendLog(`- Model: \`${process.env.OPENCODE_MODEL}\``);
  appendLog(`- Success target: total runtime <= 8m, no fallback chunks, usable extraction, structured songs returned`);
  appendLog("");

  const totalStarted = performance.now();
  const pageCountStep = await timed(() => getPageCount(PDF_PATH));
  appendLog(`- Page count: ${pageCountStep.value} (${formatDuration(pageCountStep.durationMs)})`);

  const rawExtractionStep = await timed(() => extractPdfWithPdftotext(PDF_PATH));
  const normalizedStep = await timed(() =>
    normalizeExtractedLyricsText(reorderTwoColumnText(rawExtractionStep.value)),
  );
  const quality = assessExtractedTextQuality(normalizedStep.value);
  const extractionTotalMs = rawExtractionStep.durationMs + normalizedStep.durationMs;

  appendLog("");
  appendLog("## Extraction");
  appendLog("");
  appendLog(`- Raw chars: ${rawExtractionStep.value.length.toLocaleString()}`);
  appendLog(`- Normalized chars: ${normalizedStep.value.length.toLocaleString()}`);
  appendLog(`- Normalized words: ${wordCount(normalizedStep.value).toLocaleString()}`);
  appendLog(`- Extraction time: ${formatDuration(rawExtractionStep.durationMs)}`);
  appendLog(`- Normalization time: ${formatDuration(normalizedStep.durationMs)}`);
  appendLog(`- Extraction + normalization total: ${formatDuration(extractionTotalMs)}`);
  appendLog(`- Quality usable: ${quality.usable}`);
  appendLog(`- Quality score: ${quality.score}`);
  appendLog(`- Quality reasons: ${quality.reasons.length ? quality.reasons.join("; ") : "none"}`);
  appendLog(`- Quality stats: \`${JSON.stringify(quality.stats)}\``);
  appendLog("");
  appendLog("### Wrapped-Line Checks In Extracted Text");
  appendLog("");
  for (const check of containsChecks(normalizedStep.value)) {
    appendLog(`- ${check.present ? "PASS" : "FAIL"}: \`${check.phrase}\``);
  }

  appendLog("");
  appendLog("## AI Structuring");
  appendLog("");

  const aiStep = await timed(() => processDocument(normalizedStep.value, FILE_NAME));
  const result = aiStep.value;
  const totalMs = Math.round(performance.now() - totalStarted);
  const importedText = result.songs
    .flatMap((song) => [song.title, ...song.sections.map((section) => section.content)])
    .join("\n");
  const importedCharCount = importedText.length;
  const normalizedCharCount = normalizedStep.value.length;
  const outputRatio = normalizedCharCount > 0 ? importedCharCount / normalizedCharCount : 0;

  const severeIssues = [
    quality.usable ? "" : "extraction was not usable",
    result.success ? "" : "AI process returned success=false",
    result.fallbackChunks === 0 ? "" : `${result.fallbackChunks} fallback chunks`,
    result.songs.length > 0 ? "" : "no songs returned",
    totalMs <= 8 * 60_000 ? "" : `runtime exceeded 8 minutes (${formatDuration(totalMs)})`,
  ].filter(Boolean);

  const passed = severeIssues.length === 0;

  appendLog(`- Provider: ${result.provider}`);
  appendLog(`- AI processing time: ${formatDuration(result.processingTimeMs)}`);
  appendLog(`- Measured AI step time: ${formatDuration(aiStep.durationMs)}`);
  appendLog(`- Total runtime: ${formatDuration(totalMs)}`);
  appendLog(`- Chunks processed: ${result.chunksProcessed}`);
  appendLog(`- AI chunks: ${result.diagnostics.aiChunks}`);
  appendLog(`- Fallback chunks: ${result.fallbackChunks}`);
  appendLog(`- Songs detected: ${result.songs.length}`);
  appendLog(`- Needs review: ${result.needsReview}`);
  appendLog(`- Warnings: ${result.warnings.length ? result.warnings.join("; ") : "none"}`);
  appendLog(`- Imported text chars: ${importedCharCount.toLocaleString()}`);
  appendLog(`- Imported/extracted char ratio: ${outputRatio.toFixed(3)}`);
  appendLog(`- Average chunk duration: ${formatDuration(result.diagnostics.averageChunkDurationMs)}`);
  appendLog(`- Slowest chunk duration: ${formatDuration(result.diagnostics.slowestChunkDurationMs)}`);
  appendLog(`- Concurrency limit: ${result.diagnostics.concurrencyLimit}`);
  appendLog("");
  appendLog("### Wrapped-Line Checks In AI Output");
  appendLog("");
  for (const check of containsChecks(importedText)) {
    appendLog(`- ${check.present ? "PASS" : "FAIL"}: \`${check.phrase}\``);
  }

  appendLog("");
  appendLog("## Verdict");
  appendLog("");
  appendLog(`- ${passed ? "PASS" : "FAIL"}`);
  if (severeIssues.length) {
    for (const issue of severeIssues) appendLog(`- Issue: ${issue}`);
  }

  appendLog("");
  appendLog("## Sample Songs");
  appendLog("");
  for (const song of sampleSongs(result.songs)) {
    appendLog(`### ${song.index}. ${song.title}${song.hymnNumber ? ` (Hymn ${song.hymnNumber})` : ""}`);
    appendLog(`- Sections: ${song.sections}`);
    appendLog(`- First section: ${song.firstSectionType ?? "none"}`);
    appendLog(`- Preview: ${JSON.stringify(song.firstSectionPreview ?? "")}`);
    if (song.warnings.length) appendLog(`- Warnings: ${song.warnings.join("; ")}`);
    appendLog("");
  }

  const json = {
    file: PDF_PATH,
    startedAt: TIMESTAMP,
    model: process.env.OPENCODE_MODEL,
    target: {
      maxTotalRuntimeMs: 8 * 60_000,
      requireNoFallbackChunks: true,
      requireUsableExtraction: true,
      requireSongs: true,
    },
    verdict: {
      passed,
      severeIssues,
    },
    timing: {
      pageCountMs: pageCountStep.durationMs,
      extractionMs: rawExtractionStep.durationMs,
      normalizationMs: normalizedStep.durationMs,
      extractionTotalMs,
      aiMeasuredMs: aiStep.durationMs,
      aiReportedMs: result.processingTimeMs,
      totalMs,
      totalHuman: formatDuration(totalMs),
    },
    extraction: {
      pageCount: pageCountStep.value,
      rawChars: rawExtractionStep.value.length,
      normalizedChars: normalizedStep.value.length,
      normalizedWords: wordCount(normalizedStep.value),
      quality,
      wrappedLineChecks: containsChecks(normalizedStep.value),
      preview: normalizedStep.value.slice(0, 4000),
    },
    ai: {
      success: result.success,
      provider: result.provider,
      chunksProcessed: result.chunksProcessed,
      fallbackChunks: result.fallbackChunks,
      needsReview: result.needsReview,
      warnings: result.warnings,
      diagnostics: result.diagnostics,
      songsDetected: result.songs.length,
      importedCharCount,
      importedToExtractedCharRatio: outputRatio,
      wrappedLineChecks: containsChecks(importedText),
      sampleSongs: sampleSongs(result.songs),
      songs: result.songs,
    },
  };

  writeFileSync(JSON_LOG, JSON.stringify(json, null, 2));
  appendLog("");
  appendLog(`JSON result: \`${JSON_LOG}\``);
  appendLog(`Finished: ${new Date().toISOString()}`);

  consoleLog(`MARKDOWN_LOG=${MARKDOWN_LOG}`);
  consoleLog(`JSON_LOG=${JSON_LOG}`);
  consoleLog(`VERDICT=${passed ? "PASS" : "FAIL"}`);
  consoleLog(`TOTAL=${formatDuration(totalMs)}`);
  consoleLog(`SONGS=${result.songs.length}`);
  consoleLog(`FALLBACK_CHUNKS=${result.fallbackChunks}`);
}

main().catch((error) => {
  mkdirSync(REPORT_DIR, { recursive: true });
  appendLog("");
  appendLog("## Fatal Error");
  appendLog("");
  appendLog(error instanceof Error ? error.stack || error.message : String(error));
  console.error(error);
  process.exitCode = 1;
});
