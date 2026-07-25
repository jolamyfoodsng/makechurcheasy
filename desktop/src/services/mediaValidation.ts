/**
 * mediaValidation.ts — Shared file-type validation for media uploads.
 *
 * Validates both MIME type and file extension to catch cases where
 * the browser reports an incorrect or missing MIME type.
 *
 * Used by: MediaTab, DockMediaTab, uploadFileToDock, saveLibraryMediaFile
 */

import { getDefaultImageExtensions, getDefaultVideoExtensions } from "./desktopConfig";

const SUPPORTED_MIME_PREFIXES = ["image/", "video/"];

/**
 * Check if a file is a supported media file (image or video).
 * Validates by MIME type prefix AND by file extension as fallback.
 */
export function isSupportedMediaFile(file: File): boolean {
  if (SUPPORTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
    return true;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return getDefaultImageExtensions().includes(ext) || getDefaultVideoExtensions().includes(ext);
}

/**
 * Check if a file is a supported image type.
 */
export function isSupportedImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return getDefaultImageExtensions().includes(ext);
}

/**
 * Check if a file is a supported video type.
 */
export function isSupportedVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return getDefaultVideoExtensions().includes(ext);
}

/**
 * Get the media kind from a file (by MIME or extension).
 */
export function getMediaKind(file: File): "image" | "video" | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type.startsWith("image/") || getDefaultImageExtensions().includes(ext)) {
    return "image";
  }
  if (file.type.startsWith("video/") || getDefaultVideoExtensions().includes(ext)) {
    return "video";
  }
  return null;
}

/**
 * Validate a file and return an error message if unsupported.
 * Returns null if the file is valid.
 */
export function validateMediaFile(file: File): string | null {
  if (isSupportedMediaFile(file)) return null;
  return `Unsupported file type: "${file.name}". Please upload an image or video file.`;
}
