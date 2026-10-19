/**
 * easyWorshipBackgroundImporter.ts — imports the songs from an EasyWorship 6 / 7 library.
 *
 * EasyWorship keeps each profile's songs in Songs.db and SongWords.db (see read_easyworship_db_folder
 * in src-tauri/src/lib.rs, which reads them read-only). This runs in the background, so the operator can
 * close the window and keep working. Songs already in the library are skipped, and the plan's song limit
 * is kept. Only songs and lyrics are imported: EasyWorship's pictures, videos and themes are not.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  convertEasyWorshipRecordsToDrafts,
  type EasyWorshipRawRecord,
} from "./easyWorshipImportService";
import { importSmartSongs } from "./smartImportService";
import type { SmartImportSongDraft } from "./smartImportTypes";
import type { Song } from "./types";
import { getAllSongs, getArchivedSongs, saveSongsBatch } from "./worshipDb";

/** An EasyWorship song library on this computer (from find_easyworship_libraries / inspect_easyworship_folder). */
export interface EWLibrary {
  /** "Default", or the folder's name. */
  name: string;
  /** The folder that holds Songs.db and SongWords.db. */
  dataDir: string;
  songCount: number;
}

export interface EWImportProgress {
  stage: string;
  percent: number;
}

export interface EWImportSummary {
  /** Songs with lyrics found in the EasyWorship library. */
  foundCount: number;
  /** Songs added to the MakeChurchEazy library. */
  importedCount: number;
  /** Songs skipped because a song with the same title and artist is already in the library. */
  alreadyInLibraryCount: number;
  /** Songs not imported because the plan's song limit was reached. */
  overLimitCount: number;
  libraryName: string;
  dataDir: string;
}

export type EWImportStatus = "idle" | "importing" | "completed" | "error";

export const EW_IMPORT_PROGRESS_EVENT = "mce-ew-import-progress";
export const EW_IMPORT_COMPLETE_EVENT = "mce-ew-import-complete";
export const EW_IMPORT_ERROR_EVENT = "mce-ew-import-error";

/** The EasyWorship libraries found on this computer (none outside the desktop app). */
export async function findEasyWorshipLibraries(): Promise<EWLibrary[]> {
  try {
    return await invoke<EWLibrary[]>("find_easyworship_libraries");
  } catch {
    return [];
  }
}

/** Checks a folder the operator picked. Rejects with a message the operator can read. */
export function inspectEasyWorshipFolder(folderPath: string): Promise<EWLibrary> {
  return invoke<EWLibrary>("inspect_easyworship_folder", { folderPath });
}

const songKey = (title: string, artist?: string) =>
  `${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}|${(artist ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`;

/**
 * Which drafts to import: not already in the library (same title and artist, archived songs included),
 * not twice from EasyWorship itself, and no more than the plan allows.
 */
export function selectEasyWorshipDrafts(
  drafts: SmartImportSongDraft[],
  existing: Pick<Song, "metadata">[],
  remainingSlots: number,
): { toImport: SmartImportSongDraft[]; alreadyInLibrary: number; overLimit: number } {
  const seen = new Set(existing.map((s) => songKey(s.metadata.title, s.metadata.artist)));
  const fresh: SmartImportSongDraft[] = [];
  let alreadyInLibrary = 0;
  for (const draft of drafts) {
    const key = songKey(draft.title, draft.artist);
    if (seen.has(key)) { alreadyInLibrary += 1; continue; }
    seen.add(key);
    fresh.push(draft);
  }
  const slots = Number.isFinite(remainingSlots) ? Math.max(0, Math.floor(remainingSlots)) : fresh.length;
  return { toImport: fresh.slice(0, slots), alreadyInLibrary, overLimit: Math.max(0, fresh.length - slots) };
}

class EasyWorshipBackgroundImporter {
  private status: EWImportStatus = "idle";
  private progress: EWImportProgress = { stage: "", percent: 0 };
  private lastSummary: EWImportSummary | null = null;
  private errorMessage = "";

  getStatus(): EWImportStatus {
    return this.status;
  }

  getProgress(): EWImportProgress {
    return this.progress;
  }

  getLastSummary(): EWImportSummary | null {
    return this.lastSummary;
  }

  getErrorMessage(): string {
    return this.errorMessage;
  }

  private notifyProgress(stage: string, percent: number) {
    this.progress = { stage, percent };
    try {
      window.dispatchEvent(new CustomEvent(EW_IMPORT_PROGRESS_EVENT, { detail: this.progress }));
    } catch {}
  }

  /**
   * Imports the songs from `library`. `remainingSlots` is how many more songs the plan allows
   * (Infinity for no limit).
   */
  async startImport(library: EWLibrary, remainingSlots: number): Promise<EWImportSummary> {
    if (this.status === "importing") throw new Error("An EasyWorship import is already running.");
    this.status = "importing";
    this.errorMessage = "";
    try {
      this.notifyProgress(`Reading songs from “${library.name}”…`, 10);
      const records = await invoke<EasyWorshipRawRecord[]>("read_easyworship_db_folder", { folderPath: library.dataDir });

      this.notifyProgress(`Preparing ${records.length} songs…`, 40);
      const drafts = convertEasyWorshipRecordsToDrafts(records).filter((d) => d.sections.length > 0);

      this.notifyProgress("Checking your library for songs you already have…", 55);
      const [active, archived] = await Promise.all([getAllSongs(), getArchivedSongs()]);
      const { toImport, alreadyInLibrary, overLimit } = selectEasyWorshipDrafts(drafts, [...active, ...archived], remainingSlots);

      this.notifyProgress(`Adding ${toImport.length} songs to your library…`, 70);
      const imported = toImport.length
        ? await importSmartSongs(toImport, {
          sourceName: `EasyWorship (${library.name})`,
          saveBatch: saveSongsBatch,
        }, (saved, total) => this.notifyProgress(`Adding songs… ${saved} of ${total}`, 70 + Math.round((saved / Math.max(1, total)) * 28)))
        : [];

      const summary: EWImportSummary = {
        foundCount: drafts.length,
        importedCount: imported.length,
        alreadyInLibraryCount: alreadyInLibrary,
        overLimitCount: overLimit,
        libraryName: library.name,
        dataDir: library.dataDir,
      };
      this.status = "completed";
      this.lastSummary = summary;
      this.notifyProgress("Done", 100);
      try {
        window.dispatchEvent(new CustomEvent(EW_IMPORT_COMPLETE_EVENT, { detail: summary }));
      } catch {}
      return summary;
    } catch (err) {
      this.status = "error";
      this.errorMessage = err instanceof Error ? err.message : String(err);
      try {
        window.dispatchEvent(new CustomEvent(EW_IMPORT_ERROR_EVENT, { detail: this.errorMessage }));
      } catch {}
      throw err instanceof Error ? err : new Error(this.errorMessage);
    }
  }

  reset() {
    this.status = "idle";
    this.progress = { stage: "", percent: 0 };
    this.lastSummary = null;
    this.errorMessage = "";
  }
}

export const ewBackgroundImporter = new EasyWorshipBackgroundImporter();
