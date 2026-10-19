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

// ── Verses, chorus and the PDF's line wrapping ────────────────────────────

/** "1: Jesu l’onpe o tantan," / "2. When Jesus has come," starts a verse. */
const VERSE_MARK_RE = /^(\d{1,2})\s*[:.]\s*(.*)$/;
/** "Chorus: E foribale fun" / "cr: Dariji elese," starts the chorus. */
const CHORUS_MARK_RE = /^(?:chorus|refrain|cr)\s*[:.]\s*(.*)$/i;
const AMEN_ONLY_RE = /^(?:amen|amin)\s*\.?$/i;
const CLOSING_AMEN_RE = /\b(?:amen|amin)\s*\.?$/i;
/** A line ending like this is a finished lyric line, never the first half of a wrapped one. */
const LINE_END_RE = /[,.;:!?…"'’”)\]]$/;

function isMarkLine(line: string): boolean {
  return VERSE_MARK_RE.test(line) || CHORUS_MARK_RE.test(line);
}

/**
 * The hymnal is a narrow two-column table, so the PDF wraps long lines:
 * "Jesus Christ will descend into our" / "midst,". Join those halves back into one lyric line,
 * and keep a closing "Amen" on the last line instead of on a slide of its own.
 */
export function joinCccWrappedLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    let lastIndex = out.length - 1;
    while (lastIndex >= 0 && out[lastIndex] === "") lastIndex -= 1;
    if (AMEN_ONLY_RE.test(line) && lastIndex >= 0) {
      out[lastIndex] = `${out[lastIndex]} ${line}`;
      out.length = lastIndex + 1;
      continue;
    }
    const previous = out[out.length - 1];
    // After the closing Amen the hymn is over: what follows is never the rest of that line.
    if (previous && !LINE_END_RE.test(previous) && !CLOSING_AMEN_RE.test(previous) && !isMarkLine(line)) {
      const words = line.split(" ").length;
      const continues = (/^\p{Ll}/u.test(line) && previous.length >= 24) || (words <= 2 && previous.length >= 30);
      if (continues) {
        out[out.length - 1] = `${previous} ${line}`;
        continue;
      }
    }
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

interface CccSection {
  type: "verse" | "chorus";
  number?: string;
  lines: string[];
}

/**
 * One language of a hymn as sections: each "1:", "2:" … starts a verse and "Chorus:" / "cr:" the chorus.
 * Blank lines are not boundaries here: the PDF also leaves them at page breaks, in the middle of a verse.
 */
export function splitCccSections(block: string): CccSection[] {
  const sections: CccSection[] = [];
  let current: CccSection | null = null;
  for (const line of joinCccWrappedLines(cleanReservedFragments(block).split("\n"))) {
    if (!line) continue;
    const verse = line.match(VERSE_MARK_RE);
    const chorus = verse ? null : line.match(CHORUS_MARK_RE);
    if (verse || chorus) {
      let rest = (verse ? verse[2] : chorus![1]).trim();
      // "Chorus: Chorus: I will worship Christ," (the label printed twice).
      while (CHORUS_MARK_RE.test(rest)) rest = rest.replace(CHORUS_MARK_RE, "$1").trim();
      current = verse ? { type: "verse", number: String(Number(verse[1])), lines: [] } : { type: "chorus", lines: [] };
      if (rest) current.lines.push(rest);
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { type: "verse", lines: [] };
      sections.push(current);
    }
    current.lines.push(line);
  }
  // A short heading after the closing Amen ("Praises Songs", "Orin Ayo") names the next group of
  // hymns; it is not part of this one.
  const last = sections[sections.length - 1];
  if (last) {
    let amenAt = last.lines.length - 1;
    while (amenAt >= 0 && !CLOSING_AMEN_RE.test(last.lines[amenAt])) amenAt -= 1;
    const tail = amenAt >= 0 ? last.lines.slice(amenAt + 1) : [];
    if (tail.length > 0 && tail.length <= 2 && tail.every((line) => line.split(" ").length <= 4 && !LINE_END_RE.test(line))) {
      last.lines = last.lines.slice(0, amenAt + 1);
    }
  }
  const kept = sections.filter((section) => section.lines.length > 0);
  // Words before the first "N:" are the verse before it ("2:" follows an unnumbered first verse).
  const lead = kept[0];
  if (lead && lead.type === "verse" && !lead.number) {
    const next = kept.find((section) => section.number);
    const nextNumber = next?.number ? Number(next.number) : 0;
    if (!next) lead.number = "1";
    else if (nextNumber > 1) lead.number = String(nextNumber - 1);
  }
  return kept;
}

function sectionDrafts(block: string, language: string | null, start: number): SmartImportSectionDraft[] {
  const suffix = language ? ` (${language})` : "";
  return splitCccSections(block).map((section, index) => {
    const base = section.type === "chorus" ? "Chorus" : section.number ? `Verse ${section.number}` : "Verse";
    return {
      id: uid(`ccc-section-${start + index + 1}`),
      type: section.type,
      label: `${base}${suffix}`,
      number: section.number,
      content: section.lines.join("\n"),
      warnings: [],
    };
  });
}

export function cccHymnsToSmartDrafts(hymns: ParsedHymn[]): SmartImportSongDraft[] {
  return hymns
    .filter(hasImportableLyrics)
    .map((hymn) => {
      const sections: SmartImportSectionDraft[] = [];
      const hasYoruba = Boolean(hymn.yoruba.trim()) && !isReservedBlock(hymn.yoruba);
      const hasEnglish = Boolean(hymn.english.trim()) && !isReservedBlock(hymn.english);
      // Both languages in one song: each section says which one it is ("Verse 1 (Yoruba)").
      const bilingual = hasYoruba && hasEnglish;
      if (hasYoruba) sections.push(...sectionDrafts(hymn.yoruba, bilingual ? "Yoruba" : null, sections.length));
      if (hasEnglish) sections.push(...sectionDrafts(hymn.english, bilingual ? "English" : null, sections.length));
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
