import { invoke } from "@tauri-apps/api/core";
import { applyAiReviewToSongs } from "../smartImportService";
import type {
  SmartImportReviewBatchResponse,
  SmartImportRuntimeStatus,
  SmartImportSongDraft,
} from "../smartImportTypes";

const MAX_BATCH_SONGS = 6;
const MAX_BATCH_CHARS = 18_000;

function createBatches(songs: SmartImportSongDraft[]): SmartImportSongDraft[][] {
  const batches: SmartImportSongDraft[][] = [];
  let current: SmartImportSongDraft[] = [];
  let currentChars = 0;

  for (const song of songs) {
    const nextChars = song.rawExcerpt.length + song.sections.reduce((sum, section) => sum + section.content.length, 0);
    const exceedsBatchCount = current.length >= MAX_BATCH_SONGS;
    const exceedsBatchChars = current.length > 0 && currentChars + nextChars > MAX_BATCH_CHARS;

    if (exceedsBatchCount || exceedsBatchChars) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(song);
    currentChars += nextChars;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

export async function getSmartImportRuntimeStatus(): Promise<SmartImportRuntimeStatus> {
  const status = await invoke<{ aiConfigured: boolean; model: string }>("get_worship_import_ai_status");
  const aiConfigured = Boolean(status.aiConfigured);

  return {
    // Desktop webviews can incorrectly report offline via navigator.onLine.
    // Attempt AI whenever it is configured and fall back only on real failures.
    online: true,
    aiConfigured,
    aiReady: aiConfigured,
  };
}

export async function reviewSmartImportSongs(
  songs: SmartImportSongDraft[],
): Promise<SmartImportSongDraft[]> {
  const reviewedSongs: SmartImportReviewBatchResponse["songs"] = [];

  for (const batch of createBatches(songs)) {
    const response = await invoke<SmartImportReviewBatchResponse>("review_worship_import_batch", {
      request: {
        songs: batch.map((song) => ({
          id: song.id,
          title: song.title,
          hymnNumber: song.hymnNumber,
          language: song.language,
          confidence: song.confidence,
          rawText: song.rawExcerpt,
          warnings: song.warnings,
          sectionHints: song.sections.map((section) => ({
            label: section.label,
            type: section.type,
            content: section.content,
          })),
        })),
      },
    });

    if (Array.isArray(response.songs)) {
      reviewedSongs.push(...response.songs);
    }
  }

  return applyAiReviewToSongs(songs, { songs: reviewedSongs });
}
