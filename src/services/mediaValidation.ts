/**
 * mediaValidation.ts — Shared file-type validation for media uploads.
 *
 * Validates both MIME type and file extension to catch cases where
 * the browser reports an incorrect or missing MIME type.
 *
 * Used by: MediaTab, DockMediaTab, uploadFileToDock, saveLibraryMediaFile
 */

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg",
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "flv",
]);

const SUPPORTED_MIME_PREFIXES = ["image/", "video/"];

/**
 * Check if a file is a supported media file (image or video).
 * Validates by MIME type prefix AND by file extension as fallback.
 */
export function isSupportedMediaFile(file: File): boolean {
  // Check MIME type first
  if (SUPPORTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
    return true;
  }
  // Fallback: check file extension (handles cases where MIME is missing or wrong)
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}

/**
 * Check if a file is a supported image type.
 */
export function isSupportedImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Check if a file is a supported video type.
 */
export function isSupportedVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Get the media kind from a file (by MIME or extension).
 */
export function getMediaKind(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(file.name.split(".").pop()?.toLowerCase() ?? "")) {
    return "image";
  }
  if (file.type.startsWith("video/") || VIDEO_EXTENSIONS.has(file.name.split(".").pop()?.toLowerCase() ?? "")) {
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

/** Re-export extension sets for use in accept attributes */
export { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS };
