import { describe, it, expect } from 'vitest';
import { parseNumberedSongDrafts } from './numberedSongImport';
import { processDocumentLocally } from './bulkImportAiService';

describe('numbered document songs', () => {
  it('keeps numbered verses inside separately numbered songs without AI setup', async () => {
    const result = await processDocumentLocally('1\n1. First verse\nPraise the Lord\n2. Second verse\nSing again\n\n2\n1. Another song\nSing together\n\n3\nFinal song\nAmen', 'songs.txt');
    expect(result.aiUsed).toBe(false);
    expect(result.songs.map((song) => song.hymnNumber)).toEqual(['1', '2', '3']);
    expect(result.songs[0].sections.map((section) => section.content).join('\n')).toContain('Second verse');
    expect(result.songs[0].sections.map((section) => section.content).join('\n')).not.toContain('Another song');
  });
  it('supports named hymn headings and preserves missing numbers', () => {
    const songs = parseNumberedSongDrafts('Hymn 1: Praise\nẸ jẹ́ ká kọrin\nAmen\n\nHymn 3 - Worship\nAnother lyric\nAmen');
    expect(songs.map((song) => [song.hymnNumber, song.title])).toEqual([['1', 'Praise'], ['3', 'Worship']]);
    expect(songs[0].sections[0].content).toContain('Ẹ jẹ́ ká kọrin');
  });
  it('does not split the numbered stanzas of a named song', () => {
    expect(parseNumberedSongDrafts('Amazing Grace\n\n1\nFirst stanza\n\n2\nSecond stanza')).toEqual([]);
  });
  it('supports numbered titles separated from their lyrics', () => {
    expect(parseNumberedSongDrafts('1. Praise\n\nFirst lyric\nSecond lyric\n\n2. Worship\n\nThird lyric\nFourth lyric').map((song) => song.title)).toEqual(['Praise', 'Worship']);
  });
});

it('separates numbered songs in a presentation while leaving verses with each song', async () => {
  const result = await processDocumentLocally('Hymn 1\nFirst lyric\nAmen\fHymn 2\nSecond lyric\nAmen', 'hymns.pptx');
  expect(result.songs.map((song) => song.hymnNumber)).toEqual(['1', '2']);
});
