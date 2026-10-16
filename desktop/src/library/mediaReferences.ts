/**
 * mediaReferences.ts — Reference-based media import for the Library.
 *
 * Instead of reading a file into memory and copying it into uploads/, the
 * library records a pointer to the user's original file. Rust gives each
 * reference a virtual upload name (`ref_<id>.<ext>`) that the overlay server
 * resolves, so every existing `/uploads/<name>` consumer keeps working.
 * Deleting an item drops the pointer; the original file is never touched.
 */

import { invoke } from "@tauri-apps/api/core";
import type { MediaItem } from "./libraryTypes";
import { isReferenceUploadName, patchMedia, saveMedia } from "./libraryDb";
import { getOverlayBaseUrl } from "../services/overlayUrl";
import {
  COMMON_AUDIO_EXTENSIONS,
  COMMON_IMAGE_EXTENSIONS,
  COMMON_VIDEO_EXTENSIONS,
} from "../services/mediaValidation";

const COPY_PREF_KEY = "mce.library.copyImportedMedia";

export const REFERENCE_MEDIA_EXTENSIONS = [
  ...COMMON_IMAGE_EXTENSIONS,
  ...COMMON_VIDEO_EXTENSIONS,
  ...COMMON_AUDIO_EXTENSIONS,
];

interface MediaReferenceInfo {
  id: string;
  virtualName: string;
  path: string;
  originalPath: string;
  fileName: string;
  size: number;
  modifiedMs: number;
  copied: boolean;
}

interface MediaReferenceRegistration {
  path: string;
  reference: MediaReferenceInfo | null;
  error: string | null;
}

interface MediaReferenceProbe {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  thumbnailDataUrl: string | null;
}

export interface ReferenceImportResult {
  saved: MediaItem[];
  failed: Array<{ path: string; error: string }>;
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isReferenceMediaItem(item: Pick<MediaItem, "source" | "diskFileName">): boolean {
  return item.source === "reference" || isReferenceUploadName(item.diskFileName);
}

function extensionOf(path: string): string {
  return path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? "";
}

export function mediaKindForPath(path: string): MediaItem["type"] | null {
  const ext = extensionOf(path);
  if (COMMON_IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (COMMON_VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (COMMON_AUDIO_EXTENSIONS.includes(ext)) return "audio";
  return null;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
  ts: "video/mp2t",
  m4v: "video/mp4",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

function mimeTypeForPath(path: string, kind: MediaItem["type"]): string {
  const ext = extensionOf(path);
  return MIME_BY_EXTENSION[ext] ?? `${kind}/${ext}`;
}

export function getCopyImportedMediaPreference(): boolean {
  try {
    return localStorage.getItem(COPY_PREF_KEY) === "true";
  } catch {
    return false;
  }
}

export function setCopyImportedMediaPreference(value: boolean): void {
  try {
    localStorage.setItem(COPY_PREF_KEY, value ? "true" : "false");
  } catch {
    // Preference is a convenience; ignore blocked storage.
  }
}

/** Open the native file picker and return real file paths. */
export async function pickMediaPaths(options: { multiple?: boolean; extensions?: string[] } = {}): Promise<string[]> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({
    multiple: options.multiple ?? true,
    directory: false,
    filters: [{ name: "Media", extensions: options.extensions ?? REFERENCE_MEDIA_EXTENSIONS }],
  });
  if (!selection) return [];
  return Array.isArray(selection) ? selection : [selection];
}

/**
 * Subscribe to native file drops on the current window. Native drops carry
 * real paths, which lets the library reference files instead of copying.
 */
export async function listenForNativeFileDrops(handlers: {
  onHover?: (hovering: boolean) => void;
  onDrop: (paths: string[]) => void;
}): Promise<() => void> {
  if (!isTauriRuntime()) return () => { };
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === "enter" || payload.type === "over") handlers.onHover?.(true);
    else if (payload.type === "leave") handlers.onHover?.(false);
    else if (payload.type === "drop") {
      handlers.onHover?.(false);
      if (payload.paths.length) handlers.onDrop(payload.paths);
    }
  });
}

function buildReferenceItem(reference: MediaReferenceInfo, kind: MediaItem["type"], overlayBaseUrl: string): MediaItem {
  const now = new Date().toISOString();
  return {
    id: `ref:${reference.id}`,
    name: reference.fileName,
    type: kind,
    url: `${overlayBaseUrl}/uploads/${encodeURIComponent(reference.virtualName)}`,
    filePath: reference.path,
    diskFileName: reference.virtualName,
    referenceId: reference.id,
    originalPath: reference.originalPath,
    storage: reference.copied ? "copy" : "reference",
    fileSize: reference.size,
    mimeType: mimeTypeForPath(reference.path, kind),
    createdAt: now,
    uploadedAt: now,
    source: "reference",
  };
}

/** Read duration, dimensions and a poster frame after the item is visible. */
export async function enrichReferenceItem(item: MediaItem): Promise<MediaItem | null> {
  if (!item.referenceId) return null;
  try {
    const probe = await invoke<MediaReferenceProbe>("probe_media_reference", { id: item.referenceId });
    const patch: Partial<MediaItem> = {};
    if (probe.thumbnailDataUrl) patch.thumbnailUrl = probe.thumbnailDataUrl;
    if (probe.width) patch.width = probe.width;
    if (probe.height) patch.height = probe.height;
    if (probe.durationSec) patch.durationSec = Math.round(probe.durationSec);
    if (Object.keys(patch).length === 0) return null;
    return await patchMedia(item.id, patch);
  } catch (error) {
    console.warn("[MediaReferences] Could not read media details:", error);
    return null;
  }
}

/** Copy the referenced file into the library folder and point the item at it. */
export async function copyReferenceIntoLibrary(item: MediaItem): Promise<MediaItem | null> {
  if (!item.referenceId) return null;
  const reference = await invoke<MediaReferenceInfo>("copy_media_reference_into_library", { id: item.referenceId });
  return patchMedia(item.id, { filePath: reference.path, storage: "copy" });
}

/**
 * Register files by path and save them to the library straight away.
 * Details, thumbnails and optional library copies fill in afterwards and
 * report through `onItemUpdated`.
 */
export async function importMediaPaths(
  paths: string[],
  options: { copyIntoLibrary?: boolean; onItemUpdated?: (item: MediaItem) => void } = {},
): Promise<ReferenceImportResult> {
  const result: ReferenceImportResult = { saved: [], failed: [] };
  const supported = paths.filter((path) => {
    if (mediaKindForPath(path)) return true;
    result.failed.push({ path, error: "unsupported" });
    return false;
  });
  if (supported.length === 0) return result;

  const registrations = await invoke<MediaReferenceRegistration[]>("register_media_references", { paths: supported });
  const overlayBaseUrl = await getOverlayBaseUrl();
  for (const registration of registrations) {
    const reference = registration.reference;
    const kind = reference ? mediaKindForPath(reference.path) : null;
    if (!reference || !kind) {
      result.failed.push({ path: registration.path, error: registration.error || "unsupported" });
      continue;
    }
    const item = buildReferenceItem(reference, kind, overlayBaseUrl);
    await saveMedia(item);
    result.saved.push(item);
  }

  // Background work: never blocks the import itself.
  void (async () => {
    for (const item of result.saved) {
      const enriched = await enrichReferenceItem(item);
      if (enriched) options.onItemUpdated?.(enriched);
      if (options.copyIntoLibrary) {
        try {
          const copied = await copyReferenceIntoLibrary(item);
          if (copied) options.onItemUpdated?.(copied);
        } catch (error) {
          console.warn("[MediaReferences] Could not copy into the library:", error);
        }
      }
    }
  })();

  return result;
}

/** Return the ids of reference items whose files cannot be found. */
export async function findMissingReferenceItems(items: MediaItem[]): Promise<Set<string>> {
  const references = items.filter((item) => isReferenceMediaItem(item) && item.diskFileName);
  if (references.length === 0 || !isTauriRuntime()) return new Set();
  try {
    const missingNames = new Set(
      await invoke<string[]>("check_media_references", { names: references.map((item) => item.diskFileName) }),
    );
    return new Set(references.filter((item) => missingNames.has(item.diskFileName!)).map((item) => item.id));
  } catch (error) {
    console.warn("[MediaReferences] Could not check media files:", error);
    return new Set();
  }
}

/**
 * Ask the user to locate a missing file and point the reference at it. The
 * item keeps its id and URL, so schedules and OBS sources keep working.
 * Returns null when the user cancels.
 */
export async function relinkReferenceItem(item: MediaItem): Promise<MediaItem | null> {
  if (!item.referenceId || !item.diskFileName) return null;
  const extension = item.diskFileName.split(".").pop()!.toLowerCase();
  const [path] = await pickMediaPaths({ multiple: false, extensions: [extension] });
  if (!path) return null;
  const reference = await invoke<MediaReferenceInfo>("relink_media_reference", { id: item.referenceId, path });
  const updated = await patchMedia(item.id, {
    filePath: reference.path,
    originalPath: reference.originalPath,
    storage: "reference",
    fileSize: reference.size,
  });
  if (updated) {
    return (await enrichReferenceItem(updated)) ?? updated;
  }
  return updated;
}
