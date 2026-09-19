import { beforeEach, it, expect, vi } from 'vitest';
import { saveWorshipDocumentBatch } from './saveWorshipDocumentBatch';
import { getAllSongs, saveSongsBatch } from './worshipDb';
import { importSmartSongs } from './smartImportService';
vi.mock('./worshipDb', () => ({ getAllSongs: vi.fn(), saveSongsBatch: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getAllSongs).mockResolvedValue([]); });
const draft = { id: 'hymn-1', title: 'Praise', hymnNumber: '1', language: 'yoruba', sections: [{ id: 'verse-1', type: 'verse' as const, label: 'Verse 1', content: 'Ẹ jẹ́ ká kọrin\nAmen', warnings: [] }], method: 'fallback' as const, warnings: [], reviewNotes: [], rawExcerpt: '' };
it('routes the whole reviewed batch to the main app with number, Unicode, and slides intact', async () => {
  const saveBatch = vi.fn();
  const songs = await importSmartSongs([draft], { sourceName: 'hymns.pdf', saveBatch });
  expect(saveSongsBatch).not.toHaveBeenCalled();
  expect(saveBatch).toHaveBeenCalledWith(songs, expect.any(Object));
  await saveWorshipDocumentBatch(songs);
  const saved = vi.mocked(saveSongsBatch).mock.calls[0][0][0];
  expect(saved.metadata).toMatchObject({ hymnNumber: '1', language: 'yoruba' });
  expect(saved.slides.map((slide) => slide.content).join('\n')).toContain('Ẹ jẹ́ ká kọrin');
  expect(saved.importSourceType).toBe('document');
});
it('does not duplicate a batch when its acknowledgement is retried', async () => {
  const songs = await importSmartSongs([draft], { saveBatch: vi.fn() });
  vi.mocked(getAllSongs).mockResolvedValue(songs);
  await saveWorshipDocumentBatch(songs);
  expect(saveSongsBatch).toHaveBeenCalledWith([]);
});
it('validates the entire batch before saving anything', async () => {
  const songs = await importSmartSongs([draft], { saveBatch: vi.fn() });
  await expect(saveWorshipDocumentBatch([...songs, { ...songs[0], id: 'song-import-bad', lyrics: '' }])).rejects.toThrow('lyrics');
  expect(saveSongsBatch).not.toHaveBeenCalled();
});
