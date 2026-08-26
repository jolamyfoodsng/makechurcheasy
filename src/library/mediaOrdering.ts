/**
 * Shared ordering helpers for media created by the desktop library and the
 * standalone OBS Dock. Uploads can be read from IndexedDB, localStorage, the
 * shared uploads folder, or the overlay server, so the list must not depend
 * on whichever source finishes loading first.
 */

export interface MediaOrderMetadata {
  createdAt?: string | null;
  uploadedAt?: string | null;
  downloadedAt?: string | null;
  diskFileName?: string | null;
  filePath?: string | null;
  id?: string | null;
  name?: string | null;
  type?: string | null;
}

const UPLOAD_FILENAME_PATTERN = /^media_(\d{10,13})_/i;

function parseTimestamp(value: string | null | undefined): number {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return Number.NEGATIVE_INFINITY;

  const timestamp = Date.parse(normalized);
  // "0001-01-01..." is the sentinel used by older discovered records, not
  // a real upload date. Treat it as missing so it cannot sort to the front.
  return Number.isFinite(timestamp) && timestamp > 0
    ? timestamp
    : Number.NEGATIVE_INFINITY;
}

/** Return the ISO upload time encoded in a generated media filename. */
export function getUploadTimestampFromFileName(fileName: string | null | undefined): string {
  const normalized = String(fileName || "").split(/[\\/]/).pop() || "";
  const match = normalized.match(UPLOAD_FILENAME_PATTERN);
  if (!match) return "";

  const raw = Number(match[1]);
  const milliseconds = match[1].length <= 10 ? raw * 1000 : raw;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

/**
 * Get the timestamp used by Newly Uploaded ordering.
 *
 * The explicit uploadedAt marker wins for user uploads. Template media uses
 * downloadedAt, while older records fall back to the generated disk-name
 * timestamp and then createdAt.
 */
export function getMediaSortTimestamp(item: MediaOrderMetadata): number {
  const explicitUploadTime = parseTimestamp(item.uploadedAt);
  if (explicitUploadTime !== Number.NEGATIVE_INFINITY) return explicitUploadTime;

  const explicitDownloadTime = parseTimestamp(item.downloadedAt);
  if (explicitDownloadTime !== Number.NEGATIVE_INFINITY) return explicitDownloadTime;

  const fileUploadTime = parseTimestamp(
    getUploadTimestampFromFileName(item.diskFileName || item.filePath),
  );
  if (fileUploadTime !== Number.NEGATIVE_INFINITY) return fileUploadTime;

  return parseTimestamp(item.createdAt);
}

/** Stable identity used for deduplication and timestamp tie-breaking. */
export function getMediaStableKey(item: MediaOrderMetadata): string {
  return item.diskFileName?.trim()
    || item.filePath?.trim()
    || item.id?.trim()
    || `${item.type || "media"}:${item.name || ""}`;
}

/** Compare two media records from newest to oldest. */
export function compareMediaItemsNewest(
  first: MediaOrderMetadata,
  second: MediaOrderMetadata,
): number {
  const firstTime = getMediaSortTimestamp(first);
  const secondTime = getMediaSortTimestamp(second);
  if (firstTime !== secondTime) return secondTime - firstTime;

  return getMediaStableKey(first).localeCompare(getMediaStableKey(second), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
