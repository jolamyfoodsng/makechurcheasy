import { parseWorshipLyricSections } from './slideEngine';
import type { SmartImportSongDraft } from './smartImportTypes';

/** Split song headings, leaving verse numbers inside each song. */
export function parseNumberedSongDrafts(text: string): SmartImportSongDraft[] {
  const lines = text.replace(/\f/g, '\n\n').split('\n');
  type Heading = { index: number; number: string; title: string };
  const explicit: Heading[] = [];
  const bare: Heading[] = [];
  const titled: Heading[] = [];
  lines.forEach((line, index) => {
    const value = line.trim();
    const match = value.match(/^(?:#{1,6}\s*)?(?:hymn|song|orin)\s*(?:no\.?\s*)?(\d+)[.\s:–—-]*(.*)$/i);
    if (match) explicit.push({ index, number: match[1], title: match[2] || `Hymn ${match[1]}` });
    if (/^\d{1,4}$/.test(value)) bare.push({ index, number: value, title: `Hymn ${value}` });
    const title = value.match(/^(?:#{1,6}\s*)?(\d{1,4})[.)]\s+(.+)$/);
    if (title && !lines[index + 1]?.trim()) titled.push({ index, number: title[1], title: title[2] });
  });
  const headings = explicit.length ? explicit : bare.length >= 2 ? bare : titled;
  if (!explicit.length && headings.length < 2) return [];
  // A named song followed by numbered stanzas is still one song.
  if (!explicit.length && lines.slice(0, headings[0]?.index).some((line) => line.trim())) return [];
  if (!explicit.length && headings.some((heading, i) => i > 0 && Number(heading.number) <= Number(headings[i - 1].number))) return [];
  return headings.flatMap((heading, index) => {
    const lyrics = lines.slice(heading.index + 1, headings[index + 1]?.index ?? lines.length).join('\n').trim();
    if (!lyrics) return [];
    const sections = parseWorshipLyricSections(lyrics, 2).map((section) => ({
      id: crypto.randomUUID(), type: section.type, label: section.label,
      content: section.lines.join('\n'), warnings: [],
    }));
    if (!sections.length) return [];
    return [{
      id: crypto.randomUUID(), title: heading.title, hymnNumber: heading.number,
      sections, method: 'fallback' as const, warnings: [],
      reviewNotes: ['Each numbered heading is a separate song. Check the lyrics before importing.'], rawExcerpt: lyrics.slice(0, 2400),
    }];
  });
}
