/**
 * cloudBackupFiles.ts — Pictures and videos in the cloud backup.
 *
 * The backup JSON stays small. Files (pictures by default, videos only when the user
 * turns them on) are uploaded to private cloud file storage and listed by the server.
 * Everything here is best-effort: a file that cannot be sent never stops the text backup.
 */

import { getDeviceApiBaseCandidates, getDeviceId, getDeviceSecret } from "./authService";
import { getAllMedia } from "../library/libraryDb";
import type { MediaItem } from "../library/libraryTypes";
import { loadSavedBroadcastGraphics } from "./broadcastGraphicsStorage";
import { getOverlayBaseUrl } from "./overlayUrl";
import { getUserScopedKey } from "./userScopedStorage";

const UPLOADED_KEY = "mce_cloud_sync_uploaded_files";

export interface CloudFileCandidate {
  /** Stable id of the file for the cloud: `<kind>:<name>:<size>` (size is filled in once known). */
  fileKey: string;
  name: string;
  kind: "image" | "video";
  sizeBytes: number;
  contentType: string;
  /** Local address the file can be read from. */
  url: string;
}

export interface FileBackupResult {
  uploaded: number;
  alreadyThere: number;
  failed: number;
  storageFull: boolean;
  /** Why the first file failed (for the settings message). */
  firstError?: string;
}

export interface CloudStorageUsage {
  backupBytes: number;
  imageBytes: number;
  videoBytes: number;
  fileBytes: number;
  usedBytes: number;
  limitBytes: number;
}

// ── API client ──────────────────────────────────────────────────────────────

export function cloudHeaders(): Record<string, string> {
  const deviceId = getDeviceId();
  const secret = getDeviceSecret();
  return {
    "Content-Type": "application/json",
    ...(deviceId ? { "X-Device-Id": deviceId } : {}),
    ...(secret ? { "X-Device-Secret": secret } : {}),
  };
}

/** Call the cloud API, trying each known server address until one answers. */
export async function cloudFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown = null;
  for (const base of getDeviceApiBaseCandidates()) {
    try {
      return await fetch(`${base}${path}`, {
        ...init,
        headers: { ...cloudHeaders(), ...(init.headers as Record<string, string> | undefined) },
        credentials: "omit",
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not reach the cloud.");
}

export async function fetchCloudStorageUsage(): Promise<{
  usage: CloudStorageUsage | null;
  backup: { exists: boolean; updatedAt?: string; deviceId?: string | null; deviceName?: string | null; sizeBytes?: number } | null;
}> {
  try {
    const res = await cloudFetch("/api/cloud-sync/status?limit=1", { method: "GET" });
    if (!res.ok) return { usage: null, backup: null };
    const json = await res.json();
    return { usage: (json?.storage as CloudStorageUsage) || null, backup: json?.backup || null };
  } catch {
    return { usage: null, backup: null };
  }
}

// ── What gets backed up ─────────────────────────────────────────────────────

function uploadedMap(): Record<string, true> {
  try {
    const raw = localStorage.getItem(getUserScopedKey(UPLOADED_KEY));
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

function rememberUploaded(fileKey: string): void {
  try {
    const map = uploadedMap();
    map[fileKey] = true;
    localStorage.setItem(getUserScopedKey(UPLOADED_KEY), JSON.stringify(map));
  } catch {
    // ignore
  }
}

function uploadsPathOf(url: string): string | null {
  const match = /\/uploads\/([^?#]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

function guessContentType(name: string, kind: "image" | "video"): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4",
  };
  return map[ext] || (kind === "video" ? "video/mp4" : "image/png");
}

/** Pictures used by saved graphics that live in the app folder. */
function graphicImageNames(): string[] {
  const names = new Set<string>();
  for (const graphic of loadSavedBroadcastGraphics()) {
    for (const value of Object.values(graphic.variables || {})) {
      if (typeof value === "string" && /^https?:\/\/[^/]+\/uploads\//i.test(value)) {
        const name = uploadsPathOf(value);
        if (name) names.add(name);
      }
    }
  }
  return [...names];
}

/** Everything the current settings say should go to the cloud as a file. */
export async function collectBackupFiles(options: {
  includeImages: boolean;
  includeVideos: boolean;
}): Promise<CloudFileCandidate[]> {
  const base = await getOverlayBaseUrl();
  const out = new Map<string, CloudFileCandidate>();
  const add = (name: string, kind: "image" | "video", size: number) => {
    const key = `${kind}:${name}`;
    if (out.has(key)) return;
    out.set(key, {
      fileKey: key,
      name,
      kind,
      sizeBytes: size,
      contentType: guessContentType(name, kind),
      url: `${base}/uploads/${encodeURIComponent(name)}`,
    });
  };

  if (options.includeImages) {
    for (const name of graphicImageNames()) add(name, "image", 0);
  }

  let media: MediaItem[] = [];
  try {
    media = await getAllMedia();
  } catch {
    media = [];
  }
  for (const item of media) {
    if (!item.diskFileName) continue;
    if (item.type === "image" && options.includeImages) add(item.diskFileName, "image", item.fileSize || 0);
    if (item.type === "video" && options.includeVideos) add(item.diskFileName, "video", item.fileSize || 0);
  }
  return [...out.values()];
}

/**
 * Fetch for the cloud file storage. In the desktop app it goes through Tauri's HTTP plugin,
 * which is not blocked by the browser's cross-origin rules (the storage host is allowed in the app's capabilities).
 */
async function storageFetch(url: string, init: RequestInit): Promise<Response> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      return await tauriFetch(url, init);
    } catch (err) {
      console.warn("[CloudSync] Tauri HTTP failed, trying the browser:", err);
    }
  }
  return fetch(url, init);
}

/** What the cloud already holds: fileKey -> size. Null when it cannot be read. */
export async function fetchCloudFileIndex(): Promise<Map<string, number> | null> {
  try {
    const res = await cloudFetch("/api/cloud-sync/files", { method: "GET" });
    if (!res.ok) return null;
    const list = ((await res.json())?.files || []) as Array<{ fileKey: string; sizeBytes: number }>;
    return new Map(list.map((f) => [f.fileKey, f.sizeBytes]));
  } catch {
    return null;
  }
}

// ── Upload ──────────────────────────────────────────────────────────────────

async function readLocalFile(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Send the files that are not in the cloud yet. Stops quietly when the storage is full.
 * `onProgress(done, total)` is called after each file.
 */
export async function uploadBackupFiles(
  files: CloudFileCandidate[],
  onProgress?: (done: number, total: number) => void,
): Promise<FileBackupResult> {
  const result: FileBackupResult = { uploaded: 0, alreadyThere: 0, failed: 0, storageFull: false };
  const known = uploadedMap();
  // One list from the server tells us what is already there, so a second backup only sends what is new.
  const index = await fetchCloudFileIndex();
  let done = 0;

  for (const file of files) {
    try {
      // Already in the cloud (same name, and same size when we know it).
      const inCloud = index?.get(file.fileKey);
      if (inCloud !== undefined && (file.sizeBytes === 0 || inCloud === file.sizeBytes)) {
        result.alreadyThere += 1;
        continue;
      }

      // Cheap skip: sent before with the same name and size.
      if (file.sizeBytes > 0 && known[`${file.fileKey}:${file.sizeBytes}`]) {
        result.alreadyThere += 1;
        continue;
      }

      const blob = await readLocalFile(file.url);
      if (!blob || blob.size === 0) {
        result.failed += 1;
        result.firstError ??= `Could not read ${file.name} on this computer`;
        continue;
      }
      const sizedKey = `${file.fileKey}:${blob.size}`;
      if (known[sizedKey]) {
        result.alreadyThere += 1;
        continue;
      }

      const presign = await cloudFetch("/api/cloud-sync/files", {
        method: "POST",
        body: JSON.stringify({
          action: "presign",
          fileKey: file.fileKey,
          name: file.name,
          kind: file.kind,
          sizeBytes: blob.size,
          contentType: file.contentType,
        }),
      });
      if (presign.status === 413) {
        const body = await presign.json().catch(() => ({}));
        if (body?.code === "storage_full") {
          result.storageFull = true;
          break;
        }
        result.failed += 1; // that one file is too large
        result.firstError ??= `${file.name} is too large to back up`;
        continue;
      }
      if (!presign.ok) {
        result.failed += 1;
        const body = await presign.json().catch(() => ({}));
        result.firstError ??= `Server said ${presign.status}${body?.error ? `: ${body.error}` : ""}`;
        continue;
      }
      const info = await presign.json();
      if (info.exists) {
        rememberUploaded(sizedKey);
        result.alreadyThere += 1;
        continue;
      }

      const put = await storageFetch(info.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.contentType },
        body: blob,
      });
      if (!put.ok) {
        result.failed += 1;
        result.firstError ??= `Storage refused the upload (${put.status})`;
        continue;
      }
      const complete = await cloudFetch("/api/cloud-sync/files", {
        method: "POST",
        body: JSON.stringify({ action: "complete", fileKey: file.fileKey }),
      });
      if (!complete.ok) {
        result.failed += 1;
        const body = await complete.json().catch(() => ({}));
        result.firstError ??= `Could not confirm the upload (${complete.status}${body?.error ? `: ${body.error}` : ""})`;
        continue;
      }
      rememberUploaded(sizedKey);
      result.uploaded += 1;
    } catch (err) {
      console.warn("[CloudSync] File upload failed:", file.name, err);
      result.failed += 1;
      result.firstError ??= err instanceof Error ? err.message : String(err);
    } finally {
      done += 1;
      onProgress?.(done, files.length);
    }
  }
  return result;
}

// ── Download (restore) ──────────────────────────────────────────────────────

export interface RestoredFile {
  name: string;
  kind: "image" | "video";
  filePath: string;
}

/** Download the backed-up files into the app folder. Returns the files that arrived. */
export async function downloadBackupFiles(
  onProgress?: (done: number, total: number) => void,
): Promise<RestoredFile[]> {
  const restored: RestoredFile[] = [];
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return restored;

  const res = await cloudFetch("/api/cloud-sync/files?download=1", { method: "GET" });
  if (!res.ok) return restored;
  const list = ((await res.json())?.files || []) as Array<{
    name: string;
    kind: "image" | "video";
    downloadUrl?: string;
  }>;

  const { invoke } = await import("@tauri-apps/api/core");
  let done = 0;
  for (const file of list) {
    try {
      if (file.downloadUrl) {
        const data = await storageFetch(file.downloadUrl, { method: "GET" });
        if (data.ok) {
          const bytes = new Uint8Array(await data.arrayBuffer());
          const filePath = await invoke<string>("save_upload_file", {
            fileName: file.name,
            fileData: Array.from(bytes),
          });
          restored.push({ name: file.name, kind: file.kind, filePath });
        }
      }
    } catch (err) {
      console.warn("[CloudSync] File download failed:", file.name, err);
    } finally {
      done += 1;
      onProgress?.(done, list.length);
    }
  }
  return restored;
}

/** Point a `/uploads/...` address from another computer at this computer's app folder. */
export function rebaseUploadUrl(url: string, base: string): string {
  const match = /^https?:\/\/[^/]+(\/uploads\/.+)$/i.exec(url);
  return match ? `${base}${match[1]}` : url;
}
