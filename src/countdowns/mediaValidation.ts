/**
 * mediaValidation.ts — File type and size validation for countdown background uploads
 */

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

const IMAGE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const VIDEO_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export type MediaType = "image" | "video";

export interface ValidationResult {
  valid: boolean;
  mediaType?: MediaType;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

/**
 * Validate a file for upload as a countdown background.
 * Returns the detected media type if valid, or an error message if not.
 */
export function validateMediaFile(file: File): ValidationResult {
  const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
  const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type || "unknown"}. Accepted: PNG, JPG, WEBP, MP4, WEBM, MOV.`,
    };
  }

  if (isImage && file.size > IMAGE_MAX_BYTES) {
    return {
      valid: false,
      error: `Image is too large (${formatSize(file.size)}). Maximum is 20MB.`,
    };
  }

  if (isVideo && file.size > VIDEO_MAX_BYTES) {
    return {
      valid: false,
      error: `Video is too large (${formatSize(file.size)}). Maximum is 500MB.`,
    };
  }

  return {
    valid: true,
    mediaType: isImage ? "image" : "video",
  };
}

/**
 * Build the accept attribute string for file inputs.
 */
export function backgroundFileAccept(): string {
  return [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(",");
}
