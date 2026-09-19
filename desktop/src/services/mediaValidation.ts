/**
 * mediaValidation.ts — Shared file-type validation for media uploads.
 *
 * Validates both MIME type and file extension to catch cases where
 * the browser reports an incorrect or missing MIME type.
 *
 * Used by: MediaTab, DockMediaTab, uploadFileToDock, saveLibraryMediaFile
 */

import { getDefaultImageExtensions, getDefaultVideoExtensions } from "./desktopConfig";

export const COMMON_IMAGE_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tif", "tiff", "avif", "heic", "heif",
];

export const COMMON_VIDEO_EXTENSIONS = [
  "mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "flv", "ts", "mts", "m2ts", "3gp", "3g2", "ogv", "vob", "mpeg", "mpg",
];

export const COMMON_AUDIO_EXTENSIONS = [
  "mp3", "wav", "ogg", "oga", "flac", "aac", "m4a", "m4b", "wma", "opus", "aiff", "aif", "alac", "weba", "amr", "mid", "midi", "ac3", "caf",
];

export const COMMON_DOCUMENT_EXTENSIONS = [
  "pdf", "docx", "pptx", "doc", "ppt",
];

/**
 * Combined accept string for HTML file inputs.
 * Lists both broad MIME types and specific file extensions so operating system
 * file dialogs (especially macOS Finder and Windows Explorer) do not grey out
 * valid audio, video, image, or document formats.
 */
export const DOCK_MEDIA_ACCEPT = [
  "image/*",
  "video/*",
  "audio/*",
  ...COMMON_IMAGE_EXTENSIONS.map((ext) => `.${ext}`),
  ...COMMON_VIDEO_EXTENSIONS.map((ext) => `.${ext}`),
  ...COMMON_AUDIO_EXTENSIONS.map((ext) => `.${ext}`),
  ...COMMON_DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

const SUPPORTED_MIME_PREFIXES = ["image/", "video/", "audio/"];
const IMAGE_EXTENSIONS = new Set(COMMON_IMAGE_EXTENSIONS);
const VIDEO_EXTENSIONS = new Set(COMMON_VIDEO_EXTENSIONS);
const AUDIO_EXTENSIONS = new Set(COMMON_AUDIO_EXTENSIONS);

/**
 * Check if a file is a supported media file (image, video, or audio).
 * Validates by MIME type prefix AND by file extension as fallback.
 */
export function isSupportedMediaFile(file: File): boolean {
  if (SUPPORTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
    return true;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return getDefaultImageExtensions().includes(ext)
    || IMAGE_EXTENSIONS.has(ext)
    || getDefaultVideoExtensions().includes(ext)
    || VIDEO_EXTENSIONS.has(ext)
    || AUDIO_EXTENSIONS.has(ext);
}

/**
 * Check if a file is a supported image type.
 */
export function isSupportedImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return getDefaultImageExtensions().includes(ext) || IMAGE_EXTENSIONS.has(ext);
}

/**
 * Check if a file is a supported video type.
 */
export function isSupportedVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return getDefaultVideoExtensions().includes(ext) || VIDEO_EXTENSIONS.has(ext);
}

/**
 * Get the media kind from a file (by MIME or extension).
 */
export function getMediaKind(file: File): "image" | "video" | "audio" | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type.startsWith("image/") || getDefaultImageExtensions().includes(ext) || IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (file.type.startsWith("video/") || getDefaultVideoExtensions().includes(ext) || VIDEO_EXTENSIONS.has(ext)) {
    return "video";
  }
  if (file.type.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext)) {
    return "audio";
  }
  return null;
}

/**
 * Validate a file and return an error message if unsupported.
 * Returns null if the file is valid.
 */
export function validateMediaFile(file: File): string | null {
  if (isSupportedMediaFile(file)) return null;
  return `Unsupported file type: "${file.name}". Please upload an image, video, or audio file.`;
}
