import type { DetectionResult } from "./songDetector";
import { detectLanguage } from "./songDetector";
import {
  hymnsToSongs,
  parseBilingualHymns,
  type LanguageMode,
} from "./pdfImportService";
import type { LayoutParseResult } from "./layoutParser";
import {
  formatLyricsFromSections,
  generateSlides,
  parseWorshipLyricSections,
} from "./slideEngine";
import type { Song } from "./types";
import { saveSongsBatch } from "./worshipDb";
import type {
  SmartImportReviewBatchResponse,
  SmartImportAnalysis,
  SmartImportSectionDraft,
  SmartImportSectionType,
  SmartImportSongDraft,
} from "./smartImportTypes";

const DEFAULT_IMPORT_LINES_PER_SLIDE = 2;
const DEFAULT_IMPORT_AUTO_SPLIT = true;
const IMPORT_YIELD_INTERVAL = 8;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeLineBreaks(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function normalizeImportedLyrics(title: string, lyrics: string): string {
  const normalized = sanitizeLineBreaks(lyrics).trim();
  if (!normalized) return "";

  const lines = normalized.split("\n");
  if (lines.length === 0) return normalized;

  const firstLine = lines[0].trim();
  if (firstLine.localeCompare(title.trim(), undefined, { sensitivity: "accent" }) === 0) {
    return lines.slice(1).join("\n").trim();
  }

  return normalized;
}

function extractHymnNumber(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/\b(?:hymn|orin|song)\s*(\d{1,4})\b/i) ?? value.match(/^\s*(\d{1,4})\b/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function sectionTypeToLabel(type: SmartImportSectionType, number?: string): string {
  const suffix = number?.trim() ? ` ${number.trim()}` : "";
  switch (type) {
    case "chorus":
      return `Chorus${suffix}`;
    case "refrain":
      return `Refrain${suffix}`;
    case "bridge":
      return `Bridge${suffix}`;
    case "tag":
      return `Tag${suffix}`;
    case "pre-chorus":
      return `Pre-Chorus${suffix}`;
    case "intro":
      return `Intro${suffix}`;
    case "outro":
      return `Outro${suffix}`;
    case "other":
      return number?.trim() ? `Section ${number.trim()}` : "Section";
    default:
      return `Verse${suffix}`;
  }
}

function slideTypeFromImportType(type: SmartImportSectionType): Song["slides"][number]["type"] {
  return type === "refrain" ? "chorus" : type;
}

function inferSectionNumber(label: string): string | undefined {
  const match = label.match(/\b(\d+|[ivxlcdm]+)\b/i);
  return match?.[1];
}

function inferSectionType(label: string, fallback: SmartImportSectionType = "verse"): SmartImportSectionType {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized.startsWith("chorus")) return "chorus";
  if (normalized.startsWith("refrain")) return "refrain";
  if (normalized.startsWith("bridge")) return "bridge";
  if (normalized.startsWith("tag") || normalized.startsWith("vamp") || normalized.startsWith("hook")) return "tag";
  if (normalized.startsWith("pre-chorus") || normalized.startsWith("prechorus")) return "pre-chorus";
  if (normalized.startsWith("intro")) return "intro";
  if (normalized.startsWith("outro") || normalized.startsWith("ending")) return "outro";
  if (normalized.startsWith("verse")) return "verse";
  return fallback;
}

function buildSectionsFromLyrics(lyrics: string): SmartImportSectionDraft[] {
  const parsed = parseWorshipLyricSections(lyrics, DEFAULT_IMPORT_LINES_PER_SLIDE);
  if (parsed.length === 0) {
    return [{
      id: uid("import-section"),
      type: "verse",
      label: "Verse 1",
      number: "1",
      content: lyrics.trim(),
      warnings: [],
    }];
  }

  return parsed.map((section) => ({
    id: uid("import-section"),
    type: section.type,
    label: section.label,
    number: inferSectionNumber(section.label),
    content: section.lines.join("\n").trim(),
    warnings: [],
  }));
}

function sanitizeSectionDraft(section: Partial<SmartImportSectionDraft>, fallbackIndex: number): SmartImportSectionDraft | null {
  const content = sanitizeLineBreaks(section.content ?? "").trim();
  if (!content) return null;

  const type = inferSectionType(section.label ?? "", section.type ?? "verse");
  const number = section.number?.trim() || inferSectionNumber(section.label ?? "");
  const label = (section.label?.trim() || sectionTypeToLabel(type, number)).replace(/\s+/g, " ").trim();

  return {
    id: section.id?.trim() || uid(`import-section-${fallbackIndex}`),
    type,
    label,
    number: number || undefined,
    content,
    warnings: Array.isArray(section.warnings)
      ? section.warnings.map((warning) => String(warning).trim()).filter(Boolean)
      : [],
  };
}

function createDraft(input: {
  id?: string;
  title: string;
  lyrics: string;
  confidence: number;
  method: SmartImportSongDraft["method"];
  artist?: string;
  language?: string;
  hymnNumber?: string;
  warnings?: string[];
  reviewNotes?: string[];
  rawExcerpt?: string;
}): SmartImportSongDraft {
  const normalizedTitle = input.title.trim() || "Untitled Song";
  const normalizedLyrics = normalizeImportedLyrics(normalizedTitle, input.lyrics);
  const sections = buildSectionsFromLyrics(normalizedLyrics);

  return {
    id: input.id ?? uid("import-song"),
    title: normalizedTitle,
    hymnNumber: input.hymnNumber?.trim() || extractHymnNumber(input.hymnNumber, normalizedTitle, normalizedLyrics),
    artist: input.artist?.trim() || "",
    language: input.language?.trim() || detectLanguage(normalizedLyrics),
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
    method: input.method,
    sections,
    warnings: (input.warnings ?? []).map((warning) => warning.trim()).filter(Boolean),
    reviewNotes: (input.reviewNotes ?? []).map((note) => note.trim()).filter(Boolean),
    rawExcerpt: (input.rawExcerpt?.trim() || normalizedLyrics).slice(0, 2400),
  };
}

export function formatDraftLyrics(song: SmartImportSongDraft): string {
  const sections = song.sections
    .map((section) => sanitizeSectionDraft(section, 0))
    .filter((section): section is SmartImportSectionDraft => Boolean(section))
    .map((section) => ({
      label: section.label || sectionTypeToLabel(section.type, section.number),
      lines: sanitizeLineBreaks(section.content).split("\n").map((line) => line.trim()).filter(Boolean),
    }))
    .filter((section) => section.lines.length > 0);

  return formatLyricsFromSections(sections);
}

export function estimateDraftSlideCount(
  song: SmartImportSongDraft,
  options: { linesPerSlide?: number; autoSplit?: boolean } = {},
): number {
  const lyrics = formatDraftLyrics(song);
  if (!lyrics.trim()) return 0;
  return generateSlides(
    lyrics,
    options.linesPerSlide ?? DEFAULT_IMPORT_LINES_PER_SLIDE,
    options.autoSplit ?? DEFAULT_IMPORT_AUTO_SPLIT,
  ).length;
}

export function analyzeLocalWorshipImport(input: {
  rawText: string;
  detection: DetectionResult;
  layoutResult: LayoutParseResult | null;
  usedLayoutParser: boolean;
  languageMode: LanguageMode;
}): SmartImportAnalysis {
  const warnings: string[] = [];
  let songs: SmartImportSongDraft[] = [];
  let method: SmartImportAnalysis["method"];
  let confidence = input.detection.confidence;

  if (input.usedLayoutParser && input.layoutResult && input.layoutResult.songs.length > 0) {
    method = "layout";
    confidence = Math.round(input.layoutResult.overallConfidence);
    warnings.push(...input.layoutResult.warnings);
    songs = input.layoutResult.songs.map((song) =>
      createDraft({
        title: song.title,
        lyrics: song.lyrics,
        confidence: song.confidence,
        method,
        artist: song.author,
        hymnNumber: extractHymnNumber(song.hymnRef, song.title, song.lyrics),
        warnings: song.warnings,
        rawExcerpt: song.lyrics,
      }),
    );
  } else if (input.detection.pattern === "ccc") {
    method = "ccc";
    const hymns = parseBilingualHymns(input.rawText);
    songs = hymnsToSongs(hymns, input.languageMode).map((song) =>
      createDraft({
        title: song.title,
        lyrics: song.lyrics,
        confidence: input.detection.confidence,
        method,
        artist: song.artist,
        language: song.language,
        hymnNumber: extractHymnNumber(song.title, song.lyrics),
        rawExcerpt: song.lyrics,
      }),
    );
  } else {
    method = input.detection.pattern;
    songs = input.detection.songs.map((song) =>
      createDraft({
        title: song.title,
        lyrics: song.lyrics,
        confidence: input.detection.confidence,
        method,
        language: song.language,
        hymnNumber: extractHymnNumber(song.title, song.lyrics),
        rawExcerpt: song.lyrics,
      }),
    );
  }

  if (songs.length === 0 && input.rawText.trim()) {
    warnings.push("No distinct songs were detected. Review the extracted text carefully.");
  }

  return {
    songs,
    warnings,
    method,
    confidence,
    counts: {
      songs: songs.length,
      sections: songs.reduce((sum, song) => sum + song.sections.length, 0),
      lines: songs.reduce(
        (sum, song) => sum + song.sections.reduce((sectionSum, section) => sectionSum + section.content.split("\n").filter((line) => line.trim()).length, 0),
        0,
      ),
    },
  };
}

export function applyAiReviewToSongs(
  baseSongs: SmartImportSongDraft[],
  review: SmartImportReviewBatchResponse,
): SmartImportSongDraft[] {
  if (!Array.isArray(review.songs) || review.songs.length === 0) {
    return baseSongs;
  }

  const byId = new Map<string, SmartImportReviewBatchResponse["songs"][number]>(
    review.songs.map((song) => [song.id, song]),
  );

  return baseSongs.map((song) => {
    const reviewed = byId.get(song.id);
    if (!reviewed) return song;

    const nextSections = (reviewed.sections ?? [])
      .map((section, index) => sanitizeSectionDraft({
        id: `${song.id}-ai-${index}`,
        type: section.type,
        label: section.label,
        number: section.number,
        content: section.content,
        warnings: section.warnings,
      }, index))
      .filter((section): section is SmartImportSectionDraft => Boolean(section));

    return {
      ...song,
      title: reviewed.title?.trim() || song.title,
      hymnNumber: reviewed.hymnNumber?.trim() || song.hymnNumber,
      confidence: Number.isFinite(reviewed.confidence) ? Math.max(0, Math.min(100, Math.round(reviewed.confidence as number))) : song.confidence,
      method: nextSections.length > 0 ? "ai-reviewed" : song.method,
      sections: nextSections.length > 0 ? nextSections : song.sections,
      warnings: [
        ...song.warnings,
        ...((reviewed.warnings ?? []).map((warning) => String(warning).trim()).filter(Boolean)),
      ],
      reviewNotes: (reviewed.reviewNotes ?? []).map((note) => String(note).trim()).filter(Boolean),
    };
  });
}

export function createEmptyImportSection(type: SmartImportSectionType = "verse"): SmartImportSectionDraft {
  const number = type === "verse" ? "1" : undefined;
  return {
    id: uid("import-section"),
    type,
    label: sectionTypeToLabel(type, number),
    number,
    content: "",
    warnings: [],
  };
}

export async function importSmartSongs(
  songs: SmartImportSongDraft[],
  options: {
    sourceName?: string;
    linesPerSlide?: number;
    autoSplit?: boolean;
  } = {},
  onProgress?: (imported: number, total: number) => void,
): Promise<Song[]> {
  const imported: Song[] = [];
  const now = new Date().toISOString();
  const linesPerSlide = options.linesPerSlide ?? DEFAULT_IMPORT_LINES_PER_SLIDE;
  const autoSplit = options.autoSplit ?? DEFAULT_IMPORT_AUTO_SPLIT;

  for (let i = 0; i < songs.length; i += 1) {
    const draft = songs[i];
    const lyrics = formatDraftLyrics(draft);
    const song: Song = {
      id: uid("song-import"),
      metadata: {
        title: draft.title.trim() || "Untitled Song",
        artist: draft.artist?.trim() || "",
        language: draft.language,
        hymnNumber: draft.hymnNumber?.trim() || undefined,
      },
      lyrics,
      slides: generateSlides(lyrics, linesPerSlide, autoSplit).map((slide) => ({
        ...slide,
        type: slideTypeFromImportType(slide.type),
      })),
      createdAt: now,
      updatedAt: now,
      importSourceName: options.sourceName?.trim() || undefined,
      importSourceType: "document",
      autoSplit,
      linesPerSlide,
    };

    imported.push(song);

    if ((i + 1) % IMPORT_YIELD_INTERVAL === 0) {
      await yieldToMainThread();
    }
  }

  await saveSongsBatch(imported, { onProgress });

  return imported;
}
