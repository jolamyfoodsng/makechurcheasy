import { it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { extractTextFromFile } from './bulkImportService';
import { processDocumentLocally } from './bulkImportAiService';

it('imports every numbered CCC hymn with language columns kept separate', { timeout: 30000 }, async () => {
  const file = new File([readFileSync(new URL('../CCC-Hymns.pdf', import.meta.url))], 'CCC-Hymns.pdf');
  const result = await processDocumentLocally(await extractTextFromFile(file), file.name);
  expect(result.songs).toHaveLength(455);
  expect(new Set(result.songs.map((song) => song.hymnNumber)).size).toBe(455);
  expect(result.songs[0].sections.map((section) => section.label)).toEqual(['Yoruba', 'English']);
  expect(result.songs[0].sections[0].content).not.toContain('The host of Angels');
  expect(result.songs.find((song) => song.hymnNumber === '473')).toBeDefined();
  expect(result.songs.find((song) => song.hymnNumber === '977')).toBeDefined();
  expect(result.songs.find((song) => song.hymnNumber === '4')).toBeUndefined();
  expect(result.songs.every((song) => song.sections.every((section) => !/are Reserved/i.test(section.content)))).toBe(true);
});

// Optional user-supplied full book; CI still runs the committed CCC fixture above.
const exportPath = new URL('../../../F3A8E1F6-3C53-462D-B9B5-05E89E66E030-export.pdf', import.meta.url);
it.skipIf(!existsSync(exportPath))('keeps both numbered books, all verses, and the original first page', { timeout: 60000 }, async () => {
  const file = new File([readFileSync(exportPath)], 'numbered-hymns.pdf');
  const result = await processDocumentLocally(await extractTextFromFile(file), file.name);
  expect(result.songs).toHaveLength(1242);
  expect(result.songs.slice(0, 445).map((song) => Number(song.hymnNumber))).toEqual(Array.from({ length: 445 }, (_, i) => i + 1));
  expect(result.songs.slice(445).map((song) => Number(song.hymnNumber))).toEqual(Array.from({ length: 797 }, (_, i) => i + 1));
  expect(result.songs[0].sections).toHaveLength(4);
  expect(result.songs[0].sections[3].content).toContain('Help me to watch and pray');
  expect(result.songs[1].sections.map((section) => section.content).join('\n')).toContain('I see the signs are all around');
  expect(result.songs[445 + 367].sections.map((section) => section.content).join('\n')).toContain('M1hyehy1');
  expect(result.songs.some((song) => song.warnings.some((warning) => warning.includes('not fully recovered')))).toBe(false);
});
