/**
 * easyWorshipImportService.ts — EasyWorship 6/7 Database Importer
 *
 * Reads EasyWorship SQLite database tables (`Songs.db` and `SongWords.db`)
 * or RTF lyric payloads and converts them into structured `SmartImportSongDraft`
 * records for MakeChurchEasy's worship library.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  SmartImportSectionDraft,
  SmartImportSectionType,
  SmartImportSongDraft,
} from "./smartImportTypes";

export interface EasyWorshipRawRecord {
  rowid: number;
  title: string;
  author?: string;
  copyright?: string;
  administrator?: string;
  referenceNumber?: string;
  tags?: string;
  wordsRtf: string;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parses RTF formatting control codes from EasyWorship `word.words` column
 * into clean plain text with preserved section markers and line breaks.
 */
export function parseEasyWorshipRtf(rtf: string): string {
  if (!rtf || typeof rtf !== "string") return "";

  // 1. Remove RTF group headers like {\*\...}
  let text = rtf.replace(/\{\\\*[\s\S]*?\}/g, "");

  // 2. Replace RTF line break and page break tokens
  text = text.replace(/\\par\b/gi, "\n");
  text = text.replace(/\\line\b/gi, "\n");
  text = text.replace(/\\page\b/gi, "\n\f\n");

  // 3. Remove all formatting tags (\plain, \f1, \pard, \sb0, etc.)
  text = text.replace(/\\[a-z0-9]+\s?/gi, "");

  // 4. Remove group braces
  text = text.replace(/[{}]/g, "");

  // 5. Decode hex escapes like \'a9 -> ©, \'92 -> ’
  text = text.replace(/\\'([0-9a-f]{2})/gi, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return "";
    }
  });

  // 6. Clean up extra spacing
  const lines = text.split("\n").map((line) => line.trim());
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Parses cleaned EasyWorship lyrics into structured section drafts
 * (Verse 1, Chorus 1, Bridge, Pre-Chorus, etc.)
 */
export function parseEasyWorshipSongSections(cleanLyrics: string): SmartImportSectionDraft[] {
  const lines = cleanLyrics.split("\n");
  const sections: SmartImportSectionDraft[] = [];
  let currentLabel = "Verse 1";
  let currentType: SmartImportSectionType = "verse";
  let currentNumber = "1";
  let currentLines: string[] = [];

  const SECTION_HEADER_RE =
    /^(verse|chorus|bridge|tag|pre-chorus|prechorus|refrain|intro|outro|vamp|hook)\s*(\d*)$/i;

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (content) {
      sections.push({
        id: uid("ew-sec"),
        type: currentType,
        label: currentLabel,
        number: currentNumber || undefined,
        content,
        warnings: [],
      });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const match = line.match(SECTION_HEADER_RE);
    if (match) {
      flush();
      const rawType = match[1].toLowerCase();
      const num = match[2] || "";
      if (rawType.startsWith("chorus") || rawType.startsWith("refrain")) {
        currentType = "chorus";
        currentLabel = num ? `Chorus ${num}` : "Chorus";
      } else if (rawType.startsWith("bridge")) {
        currentType = "bridge";
        currentLabel = num ? `Bridge ${num}` : "Bridge";
      } else if (
        rawType.startsWith("tag") ||
        rawType.startsWith("vamp") ||
        rawType.startsWith("hook")
      ) {
        currentType = "tag";
        currentLabel = num ? `Tag ${num}` : "Tag";
      } else if (rawType.startsWith("pre")) {
        currentType = "pre-chorus";
        currentLabel = num ? `Pre-Chorus ${num}` : "Pre-Chorus";
      } else if (rawType.startsWith("intro")) {
        currentType = "intro";
        currentLabel = num ? `Intro ${num}` : "Intro";
      } else if (rawType.startsWith("outro")) {
        currentType = "outro";
        currentLabel = num ? `Outro ${num}` : "Outro";
      } else {
        currentType = "verse";
        currentLabel = num ? `Verse ${num}` : "Verse";
      }
      currentNumber = num;
    } else {
      currentLines.push(line);
    }
  }

  flush();

  if (sections.length === 0 && cleanLyrics.trim()) {
    sections.push({
      id: uid("ew-sec"),
      type: "verse",
      label: "Verse 1",
      number: "1",
      content: cleanLyrics.trim(),
      warnings: [],
    });
  }

  return sections;
}

/**
 * Converts raw EasyWorship records into `SmartImportSongDraft` items
 */
export function convertEasyWorshipRecordsToDrafts(
  records: EasyWorshipRawRecord[],
): SmartImportSongDraft[] {
  return records.map((rec) => {
    const cleaned = parseEasyWorshipRtf(rec.wordsRtf);
    const sections = parseEasyWorshipSongSections(cleaned);

    return {
      id: uid(`ew-${rec.rowid}`),
      title: rec.title.trim() || `EasyWorship Song ${rec.rowid}`,
      artist: rec.author?.trim() || "",
      copyright: rec.copyright?.trim() || undefined,
      ccliNumber: rec.referenceNumber?.trim() || undefined,
      sections,
      warnings: [],
      reviewNotes: ["Imported from EasyWorship profile database."],
      method: "easyworship",
      rawExcerpt: cleaned.slice(0, 500),
    };
  });
}

/**
 * Invokes Tauri backend command to read EasyWorship SQLite database from folder path
 */
export async function importEasyWorshipFolder(folderPath: string): Promise<SmartImportSongDraft[]> {
  const records = await invoke<EasyWorshipRawRecord[]>("read_easyworship_db_folder", {
    folderPath,
  });
  return convertEasyWorshipRecordsToDrafts(records);
}
