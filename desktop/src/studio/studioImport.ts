/**
 * studioImport.ts — "Import Media" / "Import Document" in the Studio. Same files, same storage and
 * the same plan limits as the Media page (pictures and videos count against the plan; PDF, Word
 * and PowerPoint files are turned into one picture per page).
 */
import { getAllMedia } from "../library/libraryDb";
import {
  expandLibraryMediaImportFiles,
  isSupportedLibraryImportFile,
  saveLibraryMediaItem,
} from "../library/MediaTab";
import { checkEntitlementSync } from "../services/entitlementClient";
import { getMediaKind } from "../services/mediaValidation";
import { checkImportFile } from "../services/importSafety";
import { isSupportedDocumentFile } from "../dock/documentConversion";
import type { PlanTier } from "../services/licenseService";

export interface ImportResult {
  imported: number;
  /** Files the plan has no room for. */
  overLimit: number;
  /** Files that aren't pictures, videos, sound or documents. */
  unsupported: string[];
  /** Files stopped by the safety check or that could not be read, each with the reason in plain words. */
  rejected: string[];
}

export async function importToLibrary(
  files: FileList | File[],
  plan: PlanTier,
  onProgress?: (status: string) => void,
): Promise<ImportResult> {
  const all = Array.from(files);
  const unsupported: string[] = [];
  const rejected: string[] = [];
  const queue: Awaited<ReturnType<typeof expandLibraryMediaImportFiles>> = [];

  for (const file of all) {
    // Programs, scripts and renamed files are stopped by what is inside, not by the name.
    const check = await checkImportFile(file, isSupportedDocumentFile(file) ? "document" : "media");
    if (!check.ok) {
      rejected.push(check.reason ?? `“${file.name}” cannot be imported.`);
      continue;
    }
    if (!isSupportedLibraryImportFile(file)) {
      unsupported.push(file.name);
      continue;
    }
    try {
      queue.push(...await expandLibraryMediaImportFiles([file], onProgress));
    } catch (error) {
      rejected.push(`“${file.name}” could not be read${error instanceof Error && error.message ? `: ${error.message}` : "."}`);
    }
  }
  if (queue.length === 0) return { imported: 0, overLimit: 0, unsupported, rejected };

  const { limit: imageLimit } = checkEntitlementSync("images", plan);
  const { limit: videoLimit } = checkEntitlementSync("videos", plan);
  const current = await getAllMedia();
  let images = current.filter((m) => m.type === "image").length;
  let videos = current.filter((m) => m.type === "video").length;

  let imported = 0;
  let overLimit = 0;
  for (const item of queue) {
    const kind = getMediaKind(item.file);
    if (kind === "image" && imageLimit !== -1 && images >= imageLimit) { overLimit += 1; continue; }
    if (kind === "video" && videoLimit !== -1 && videos >= videoLimit) { overLimit += 1; continue; }
    onProgress?.(`Saving ${item.file.name}…`);
    await saveLibraryMediaItem(item);
    imported += 1;
    if (kind === "image") images += 1;
    if (kind === "video") videos += 1;
  }
  return { imported, overLimit, unsupported, rejected };
}
