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
import { COMMON_DOCUMENT_EXTENSIONS, getMediaKind } from "../services/mediaValidation";
import type { MediaItem } from "../library/libraryTypes";
import { getCopyImportedMediaPreference, importMediaPaths, mediaKindForPath } from "../library/mediaReferences";
import type { PlanTier } from "../services/licenseService";

function isSupportedDocumentPath(path: string): boolean {
  return COMMON_DOCUMENT_EXTENSIONS.includes(path.split(".").pop()?.toLowerCase() ?? "");
}

export interface ImportResult {
  imported: number;
  /** Files the plan has no room for. */
  overLimit: number;
  /** Files that aren't pictures, videos, sound or documents. */
  unsupported: string[];
}

export async function importToLibrary(
  files: FileList | File[],
  plan: PlanTier,
  onProgress?: (status: string) => void,
): Promise<ImportResult> {
  const all = Array.from(files);
  const unsupported = all.filter((f) => !isSupportedLibraryImportFile(f)).map((f) => f.name);
  const supported = all.filter((f) => isSupportedLibraryImportFile(f));
  if (supported.length === 0) return { imported: 0, overLimit: 0, unsupported };

  const queue = await expandLibraryMediaImportFiles(supported, onProgress);
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
  return { imported, overLimit, unsupported };
}

function fileNameFromPath(path: string): string {
  return path.split(/[\/]/).pop() || path;
}

/**
 * Import by file path (native picker or drag-and-drop in the desktop app). Pictures, videos and
 * sound are referenced where they are, so a large video shows at once; details and thumbnails
 * fill in through `onItemUpdated`. Documents are still read and turned into page pictures.
 */
export async function importPathsToLibrary(
  paths: string[],
  plan: PlanTier,
  options: { onProgress?: (status: string) => void; onItemUpdated?: (item: MediaItem) => void } = {},
): Promise<ImportResult> {
  const mediaPaths = paths.filter((path) => mediaKindForPath(path));
  const documentPaths = paths.filter((path) => !mediaKindForPath(path) && isSupportedDocumentPath(path));
  const unsupported = paths
    .filter((path) => !mediaKindForPath(path) && !isSupportedDocumentPath(path))
    .map(fileNameFromPath);

  const { limit: imageLimit } = checkEntitlementSync("images", plan);
  const { limit: videoLimit } = checkEntitlementSync("videos", plan);
  const current = await getAllMedia();
  let images = current.filter((m) => m.type === "image").length;
  let videos = current.filter((m) => m.type === "video").length;
  let overLimit = 0;
  const allowed = mediaPaths.filter((path) => {
    const kind = mediaKindForPath(path);
    if (kind === "image") {
      if (imageLimit !== -1 && images >= imageLimit) { overLimit += 1; return false; }
      images += 1;
    } else if (kind === "video") {
      if (videoLimit !== -1 && videos >= videoLimit) { overLimit += 1; return false; }
      videos += 1;
    }
    return true;
  });

  let imported = 0;
  if (allowed.length > 0) {
    options.onProgress?.(`Adding ${allowed.length === 1 ? fileNameFromPath(allowed[0]) : `${allowed.length} files`}…`);
    const result = await importMediaPaths(allowed, {
      copyIntoLibrary: getCopyImportedMediaPreference(),
      onItemUpdated: options.onItemUpdated,
    });
    imported += result.saved.length;
    unsupported.push(...result.failed.map((failure) => fileNameFromPath(failure.path)));
  }

  if (documentPaths.length > 0) {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const files = await Promise.all(documentPaths.map(async (path) => new File([await readFile(path)], fileNameFromPath(path))));
    const result = await importToLibrary(files, plan, options.onProgress);
    imported += result.imported;
    overLimit += result.overLimit;
    unsupported.push(...result.unsupported);
  }

  return { imported, overLimit, unsupported };
}
