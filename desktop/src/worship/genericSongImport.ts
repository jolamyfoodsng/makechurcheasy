/**
 * genericSongImport.ts — turn any song document into songs and sections, on this computer,
 * without the AI structurer.
 *
 * Works on the text the extractors produce (bulkImportService.ts):
 * - "# Title" lines (Word / OpenDocument / HTML headings, Markdown) start a song;
 * - otherwise a short title-like line standing on its own starts one;
 * - in a slide deck (PowerPoint / Impress), a slide holding only a title starts one;
 * - inside a song, labels ("Verse 1", "[Chorus]", "2.") start sections, unlabelled verses are
 *   numbered, and a verse that comes back word for word is the chorus;
 * - chord lines and credit lines (CCLI, ©, "Words and Music by …") are kept off the slides;
 *   the writer becomes the song's artist.
 */
import { removeChords } from "./lyricTools";
import { parseWorshipSectionLabelLine } from "./slideEngine";
import type { SmartImportSectionDraft, SmartImportSongDraft } from "./smartImportTypes";

export interface GenericImportResult {
  songs: SmartImportSongDraft[];
  /** The file's own layout said where songs and sections are (headings, labels, title slides). */
  confident: boolean;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const HEADING_RE = /^#{1,6}\s+(.+?)\s*#*$/;
const TITLE_FIELD_RE = /^(?:title|song(?:\s+title)?)\s*:\s*(.+)$/i;
const CREDIT_RE = /^(?:ccli\b|©|\(c\)\s|copyright\b|words\s+(?:and|&)\s+music\b|words\s+by\b|music\s+by\b|lyrics\s+by\b|written\s+by\b|composed\s+by\b|arr(?:anged|\.)\s+by\b|used\s+by\s+permission|all\s+rights\s+reserved|admin(?:istered)?\.?\s+by\b|(?:author|artist|composer|writer|key|tempo|time|bpm)\s*:)/i;
const WRITER_RE = /^(?:words\s+(?:and|&)\s+music|words|lyrics|music|written|composed)\s+by\s*:?\s*(.+)$/i;
const ARTIST_FIELD_RE = /^(?:author|artist|composer|writer)\s*:\s*(.+)$/i;
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is", "my", "of", "on", "or", "our", "the", "to", "unto", "with", "your", "you", "me", "we", "o"]);

function isLabelLine(line: string): boolean {
  return Boolean(parseWorshipSectionLabelLine(line));
}

/** "Morning Light", "RIVER OF GRACE", "How Great Is Our God": short, no sentence punctuation, mostly capitalised. */
export function looksLikeTitle(line: string): boolean {
  const text = line.trim();
  if (!text || text.length > 48 || isLabelLine(text) || CREDIT_RE.test(text)) return false;
  if (/[,;:.!?]$/.test(text) && !/\b(?:Mr|Mrs|St|Dr)\.$/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length > 7) return false;
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 3) return false;
  const first = letters[0] ?? "";
  if (first !== first.toLocaleUpperCase()) return false;
  const big = words.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  const capitalised = big.filter((w) => /^\P{L}*\p{Lu}/u.test(w)).length;
  return big.length === 0 || capitalised / big.length >= 0.6;
}

interface RawSong {
  title: string;
  lines: string[];
  /** Started by a heading, a title field or a title slide (not just guessed from a short line). */
  marked: boolean;
}

function blocksOf(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim()) current.push(line);
    else if (current.length) { blocks.push(current); current = []; }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

/** Splits the text into songs at headings, title fields, or title lines standing on their own. */
function splitSongs(text: string, fallbackTitle: string): RawSong[] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\f/g, "\n\n").split("\n").map((line) => line.trimEnd());
  const hasHeadings = lines.some((line) => HEADING_RE.test(line.trim()) || TITLE_FIELD_RE.test(line.trim()));
  const songs: RawSong[] = [];
  let current: RawSong = { title: "", lines: [], marked: false };
  const start = (title: string, marked: boolean) => {
    if (current.title || current.lines.some((line) => line.trim())) songs.push(current);
    current = { title, lines: [], marked };
  };

  if (hasHeadings) {
    for (const line of lines) {
      const heading = line.trim().match(HEADING_RE) ?? line.trim().match(TITLE_FIELD_RE);
      if (heading && !isLabelLine(heading[1])) start(heading[1].trim(), true);
      else current.lines.push(line);
    }
  } else {
    // A title is a short title-like line with a blank line after it (or credits / a label right
    // under it), at the start of the file or after a blank line.
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      const before = i === 0 || !lines[i - 1].trim();
      const next = lines.slice(i + 1).find((l) => l.trim())?.trim() ?? "";
      const after = !lines[i + 1]?.trim() || CREDIT_RE.test(lines[i + 1].trim()) || isLabelLine(lines[i + 1].trim());
      // A song never starts at "Verse 2": a line right before a later verse is part of the song.
      const nextLabel = parseWorshipSectionLabelLine(next);
      const continuesSong = Boolean(nextLabel && Number(nextLabel.label.match(/\d+/)?.[0] ?? 1) > 1);
      const isTitle = before && after && next && !continuesSong && looksLikeTitle(line) && !looksLikeTitle(next)
        && (line.split(/\s+/).length >= 2 || isLabelLine(next) || CREDIT_RE.test(next) || i === 0);
      if (isTitle) start(line, false);
      else current.lines.push(lines[i]);
    }
  }
  if (current.title || current.lines.some((line) => line.trim())) songs.push(current);
  return songs
    .map((song) => ({ ...song, title: song.title || fallbackTitle }))
    .filter((song) => song.lines.some((line) => line.trim()));
}

/** Credits off, the writer kept; chord lines and inline [G] chords off. */
function cleanSongLines(lines: string[]): { lines: string[]; artist: string } {
  let artist = "";
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line && CREDIT_RE.test(line)) {
      const writer = line.match(WRITER_RE) ?? line.match(ARTIST_FIELD_RE);
      if (writer && !artist) artist = writer[1].replace(/\s*[|·].*$/, "").trim();
      continue;
    }
    kept.push(raw);
  }
  return { lines: removeChords(kept.join("\n")).split("\n"), artist };
}

function sectionsOf(lines: string[]): { sections: SmartImportSectionDraft[]; labelled: boolean } {
  const blocks = blocksOf(lines);
  const labelled = blocks.some((block) => block.some((line) => isLabelLine(line)));
  const sections: SmartImportSectionDraft[] = [];
  let verse = 0;
  // Without labels, a verse that comes back word for word is the chorus.
  const seen = new Map<string, number>();
  if (!labelled) for (const block of blocks) {
    const key = block.join("\n").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const block of blocks) {
    if (labelled) {
      let current: SmartImportSectionDraft | null = null;
      for (const line of block) {
        const label = parseWorshipSectionLabelLine(line);
        if (label) {
          current = { id: uid("import-section"), type: label.type, label: label.label, content: label.rest, warnings: [] };
          sections.push(current);
          continue;
        }
        if (!current) {
          verse += 1;
          current = { id: uid("import-section"), type: "verse", label: `Verse ${verse}`, content: "", warnings: [] };
          sections.push(current);
        }
        current.content = current.content ? `${current.content}\n${line.trim()}` : line.trim();
      }
      continue;
    }
    const key = block.join("\n").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const isChorus = (seen.get(key) ?? 0) > 1;
    if (!isChorus) verse += 1;
    sections.push({
      id: uid("import-section"),
      type: isChorus ? "chorus" : "verse",
      label: isChorus ? "Chorus" : `Verse ${verse}`,
      number: isChorus ? undefined : String(verse),
      content: block.map((line) => line.trim()).join("\n"),
      warnings: [],
    });
  }
  return { sections: sections.filter((section) => section.content.trim()), labelled };
}

function songDraft(title: string, lines: string[], marked: boolean): { draft: SmartImportSongDraft | null; labelled: boolean } {
  const cleaned = cleanSongLines(lines);
  const { sections, labelled } = sectionsOf(cleaned.lines);
  if (sections.length === 0) return { draft: null, labelled };
  const number = title.match(/^(?:hymn|song|orin)\s*(\d{1,4})\b/i)?.[1];
  return {
    labelled,
    draft: {
      id: uid("import-song"),
      title,
      artist: cleaned.artist,
      hymnNumber: number,
      sections,
      method: "fallback",
      warnings: [],
      reviewNotes: marked ? [] : ["Songs were split by their layout. Check titles and sections before importing."],
      rawExcerpt: lines.join("\n").slice(0, 2400),
    },
  };
}

/** Any song document (Word, PDF, text, HTML, OpenDocument) as songs and sections. */
export function parseGenericSongDrafts(text: string, fileName: string): GenericImportResult {
  const fallbackTitle = fileName.replace(/\.[^.]+$/, "").trim() || "Imported Song";
  const raw = splitSongs(text, fallbackTitle);
  let labelled = false;
  const songs: SmartImportSongDraft[] = [];
  for (const song of raw) {
    const { draft, labelled: hasLabels } = songDraft(song.title, song.lines, song.marked);
    labelled ||= hasLabels;
    if (draft) songs.push(draft);
  }
  const marked = raw.some((song) => song.marked);
  return { songs, confident: songs.length > 0 && (marked || labelled || songs.length >= 2) };
}

/**
 * A slide deck as songs: a slide that holds only a title starts a song, every other slide is one
 * section (its boundaries are kept). A slide that starts with a label uses it; a slide that comes
 * back word for word is the chorus.
 */
export function parseSlideDeckDrafts(text: string, fileName: string): SmartImportSongDraft[] {
  const fallbackTitle = fileName.replace(/\.[^.]+$/, "").trim() || "Imported Presentation";
  const slides = text.split(/\f+/).map((slide) => slide.split("\n").map((line) => line.trim()).filter(Boolean));
  type Deck = { title: string; slides: string[][] };
  const decks: Deck[] = [];
  let current: Deck = { title: "", slides: [] };
  for (const slide of slides) {
    if (slide.length === 0) continue;
    const titleSlide = slide.length === 1 && looksLikeTitle(slide[0])
      || (slide.length === 2 && looksLikeTitle(slide[0]) && CREDIT_RE.test(slide[1]));
    if (titleSlide) {
      if (current.slides.length || current.title) decks.push(current);
      current = { title: slide[0], slides: [] };
      continue;
    }
    current.slides.push(slide);
  }
  if (current.slides.length || current.title) decks.push(current);

  return decks.filter((deck) => deck.slides.length > 0).map((deck) => {
    const counts = new Map<string, number>();
    for (const slide of deck.slides) counts.set(slide.join("\n").toLowerCase(), (counts.get(slide.join("\n").toLowerCase()) ?? 0) + 1);
    let artist = "";
    const sections: SmartImportSectionDraft[] = [];
    deck.slides.forEach((slide, index) => {
      const cleaned = cleanSongLines(slide);
      if (!artist && cleaned.artist) artist = cleaned.artist;
      const body = cleaned.lines.filter(Boolean);
      if (body.length === 0) return;
      const label = parseWorshipSectionLabelLine(body[0]);
      const repeated = (counts.get(slide.join("\n").toLowerCase()) ?? 0) > 1;
      const content = label ? [label.rest, ...body.slice(1)].filter(Boolean).join("\n") : body.join("\n");
      if (!content) return;
      sections.push({
        id: uid("import-section"),
        type: label ? label.type : repeated ? "chorus" : "other",
        label: label ? label.label : repeated ? "Chorus" : `Slide ${index + 1}`,
        content,
        warnings: [],
      });
    });
    return {
      id: uid("import-song"),
      title: deck.title || (decks.length === 1 ? fallbackTitle : `${fallbackTitle} ${decks.indexOf(deck) + 1}`),
      artist,
      sections,
      method: "fallback" as const,
      warnings: [],
      reviewNotes: ["PowerPoint slide boundaries were kept. A slide with only a title starts a new song."],
      rawExcerpt: deck.slides.map((slide) => slide.join("\n")).join("\n\n").slice(0, 2400),
    };
  }).filter((draft) => draft.sections.length > 0);
}
