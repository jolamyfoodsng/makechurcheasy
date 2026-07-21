import { parseBilingualHymns, type ParsedHymn } from "./legacy/pdfImportService";
import type { SmartImportSectionDraft, SmartImportSongDraft } from "./smartImportTypes";

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isReservedBlock(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, " ");
  return /^[-–]\s*\d{1,4}\s+are\s+reserved\b/i.test(normalized) ||
    /^hymn\s*s?\s+\d{1,4}\s*(?:[-–]|\s+)\s*\d{1,4}\s+(?:is|are)\s+reserved\b/i.test(normalized);
}

function hasImportableLyrics(hymn: ParsedHymn): boolean {
  const blocks = [hymn.yoruba, hymn.english].map((part) => part.trim()).filter(Boolean);
  if (blocks.length === 0) return false;
  return blocks.some((block) => !isReservedBlock(block));
}

function cleanReservedFragments(content: string): string {
  return content
    .split("\n")
    .map((line) =>
      line
        .replace(/\bHymn\s*s?\s+\d{1,4}\s*(?:[-–]|\s+)\s*\d{1,4}\s+(?:is|are)\s+Reserved\b.*$/i, "")
        .replace(/^[-–]\s*\d{1,4}\s+are\s+Reserved\b.*$/i, "")
        .trimEnd(),
    )
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

function sectionDraft(label: string, content: string, index: number): SmartImportSectionDraft {
  return {
    id: uid(`ccc-section-${index + 1}`),
    type: "verse",
    label,
    content: cleanReservedFragments(content),
    warnings: [],
  };
}

export function cccHymnsToSmartDrafts(hymns: ParsedHymn[]): SmartImportSongDraft[] {
  return hymns
    .filter(hasImportableLyrics)
    .map((hymn) => {
      const sections: SmartImportSectionDraft[] = [];
      if (hymn.yoruba.trim() && !isReservedBlock(hymn.yoruba)) {
        sections.push(sectionDraft("Yoruba", hymn.yoruba, sections.length));
      }
      if (hymn.english.trim() && !isReservedBlock(hymn.english)) {
        sections.push(sectionDraft("English", hymn.english, sections.length));
      }
      const cleanedSections = sections.filter((section) => section.content.trim().length > 0);

      const rawExcerpt = [
        hymn.sectionLabel,
        hymn.yoruba,
        hymn.english,
      ].filter(Boolean).join("\n\n").slice(0, 2400);

      return {
        id: uid(`ccc-hymn-${hymn.number}`),
        title: hymn.title,
        artist: "CCC Hymnal",
        hymnNumber: String(hymn.number),
        language: hymn.yoruba && hymn.english ? "bilingual" : hymn.yoruba ? "yoruba" : "english",
        method: "fallback" as const,
        sections: cleanedSections,
        warnings: [],
        reviewNotes: hymn.sectionLabel
          ? [`PDF section: ${hymn.sectionLabel}`]
          : [],
        rawExcerpt,
      };
    })
    .filter((draft) => draft.sections.length > 0);
}

export function parseCccHymnDrafts(text: string): SmartImportSongDraft[] {
  const hymns = parseBilingualHymns(text);
  return cccHymnsToSmartDrafts(hymns);
}
