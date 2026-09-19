import { getAllSongs, saveSongsBatch } from './worshipDb';
import { generateSlides } from './slideEngine';
import { DEFAULT_WORSHIP_LINES_PER_SLIDE } from './slideLayout';
import type { Song } from './types';

/** Persist in the main app's user-scoped library, never the Dock's separate IndexedDB. */
export async function saveWorshipDocumentBatch(batch: Song[]): Promise<{ song: Song; songs: Song[] }> {
  if (!Array.isArray(batch) || !batch.length) throw new Error('No songs were supplied.');
  const existing = await getAllSongs();
  const existingIds = new Set(existing.map((song) => song.id));
  const ids = new Set<string>();
  const songs = batch.map((draft): Song => {
    if (!draft?.id?.startsWith('song-import-') || !draft.metadata?.title?.trim() || !draft.lyrics?.trim() || ids.has(draft.id)) {
      throw new Error('Each imported song needs a unique ID, title, and lyrics.');
    }
    ids.add(draft.id);
    const linesPerSlide = Math.max(1, Math.min(12, draft.linesPerSlide || DEFAULT_WORSHIP_LINES_PER_SLIDE));
    const autoSplit = draft.autoSplit ?? true;
    return { ...draft, importSourceType: 'document', autoSplit, linesPerSlide,
      slides: generateSlides(draft.lyrics, linesPerSlide, autoSplit),
    };
  });
  // Stable draft IDs make retries after a lost acknowledgement safe.
  await saveSongsBatch(songs.filter((song) => !existingIds.has(song.id)));
  return { song: songs[0], songs: await getAllSongs() };
}
