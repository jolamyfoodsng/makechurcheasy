/**
 * dockUploadService.ts — Shared upload utilities for the MakeChurchEasy Dock.
 *
 * The dock runs as a standalone browser page in OBS and cannot use Tauri's
 * invoke directly. This service handles the Tauri-first-with-HTTP-fallback
 * pattern, thumbnail generation, and local library persistence.
 */

import type { MediaItem } from "../library/libraryTypes";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import { dockClient } from "../services/dockBridge";
import { compressImage, compressVideo } from "./mediaCompression";
import { isSupportedMediaFile } from "../services/mediaValidation";
import { getUserScopedKey } from "../services/userScopedStorage";

const LOCAL_LIBRARY_KEY = "ocs-dock-media-library-v1";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getSafeFileName(name: string): string {
  const trimmed = name.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  const base = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  const ext = dotIndex > 0 ? trimmed.slice(dotIndex + 1).toLowerCase() : "";
  const safeBase = base
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "media";
  return ext ? `${safeBase}.${ext}` : safeBase;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

/* ── Thumbnail generation ────────────────────────────────────────────────── */

export function getVideoDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
      video.src = "";
    };
    video.onerror = () => {
      resolve(0);
      video.src = "";
    };
    video.src = src;
  });
}

export function generateVideoThumbnail(src: string): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const finalize = () => {
      resolve("");
      video.src = "";
    };

    video.onloadeddata = () => {
      try {
        const canvas = document.createElement("canvas");
        const width = video.videoWidth || 480;
        const height = video.videoHeight || 270;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { finalize(); return; }
        ctx.drawImage(video, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      } catch {
        resolve("");
      } finally {
        video.src = "";
      }
    };

    video.onerror = finalize;
    video.src = src;
  });
}

export function generateImageThumbnail(src: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const width = image.naturalWidth || 480;
        const height = image.naturalHeight || 270;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(""); return; }
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve("");
      }
    };
    image.onerror = () => resolve("");
    image.src = src;
  });
}

/* ── Disk save (Tauri-first, HTTP fallback) ──────────────────────────────── */

export async function saveToDisk(file: File, safeName: string): Promise<string> {
  // Try Tauri first
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    console.log("[UPLOAD] saveToDisk: Tauri module loaded, converting to bytes…");
    const bytes = new Uint8Array(await file.arrayBuffer());
    console.log("[UPLOAD] saveToDisk: Tauri invoke save_upload_file…");
    const result = await invoke<string>("save_upload_file", {
      fileName: safeName,
      fileData: Array.from(bytes),
    });
    console.log("[UPLOAD] saveToDisk: Tauri save OK →", result);
    return result;
  } catch (tauriErr) {
    console.log("[UPLOAD] saveToDisk: Tauri failed, using HTTP fallback →", tauriErr);
    // HTTP fallback
    console.log("[UPLOAD] saveToDisk: Reading file as data URL…");
    const dataUrl = await readDataUrl(file);
    console.log("[UPLOAD] saveToDisk: POST /api/save-media …", { safeName, dataUrlLen: dataUrl.length });
    const response = await fetch("/api/save-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: safeName, dataUrl }),
    });
    console.log("[UPLOAD] saveToDisk: HTTP response", { status: response.status, ok: response.ok });
    if (!response.ok) {
      throw new Error(`Upload failed with ${response.status}`);
    }
    const data = await response.json();
    if (!data.path) {
      throw new Error("Upload path was not returned.");
    }
    console.log("[UPLOAD] saveToDisk: HTTP save OK →", data.path);
    return String(data.path);
  }
}

/* ── Local library persistence ───────────────────────────────────────────── */

export function loadLocalLibrary(): MediaItem[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(LOCAL_LIBRARY_KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as MediaItem[] : [];
  } catch {
    return [];
  }
}

export function saveLocalLibrary(items: MediaItem[]): void {
  localStorage.setItem(getUserScopedKey(LOCAL_LIBRARY_KEY), JSON.stringify(items));
}

export function dedupeMediaItems(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/* ── Sync to main app ────────────────────────────────────────────────────── */

export function syncMediaToApp(item: MediaItem): void {
  dockClient.sendCommand({
    type: "media:save",
    payload: item,
    timestamp: Date.now(),
    commandId: `dock-media-save-${item.id}`,
  });
  dockClient.sendCommand({ type: "request-library-data", timestamp: Date.now() });
}

/* ── Full upload pipeline ────────────────────────────────────────────────── */

export interface UploadResult {
  item: MediaItem;
  error?: string;
}

export async function uploadFileToDock(
  file: File,
  onProgress?: (status: string) => void,
): Promise<UploadResult> {
  console.log("[UPLOAD] uploadFileToDock: start", { name: file.name, size: file.size, type: file.type });
  if (!isSupportedMediaFile(file)) {
    console.warn("[UPLOAD] uploadFileToDock: unsupported file type", file.type);
    return { item: null as unknown as MediaItem, error: `Unsupported file type. Only image and video files are allowed.` };
  }
  const category = file.type.startsWith("video/") ? "video" : "image";

  // Compress before saving
  let processedFile: File = file;
  try {
    if (category === "image") {
      if (file.size > 1024 * 1024) {
        console.log("[UPLOAD] Compressing image…");
        onProgress?.("Compressing image…");
        processedFile = await compressImage(file);
        console.log("[UPLOAD] Image compressed:", processedFile.size);
      }
    } else {
      if (file.size > 1024 * 1024) {
        console.log("[UPLOAD] Compressing video…");
        onProgress?.("Compressing video…");
        processedFile = await compressVideo(file);
        console.log("[UPLOAD] Video compressed:", processedFile.size);
      }
    }
  } catch (err) {
    console.warn("[UPLOAD] Compression failed, using original:", err);
  }

  const safeName = `media_${Date.now()}_${getSafeFileName(processedFile.name)}`;
  const overlayBaseUrl = getOverlayBaseUrlSync();
  const previewUrl = `${overlayBaseUrl}/uploads/${encodeURIComponent(safeName)}`;
  const objectUrl = URL.createObjectURL(processedFile);

  let thumbnailUrl = "";
  let durationSec: number | undefined;

  try {
    if (category === "video") {
      console.log("[UPLOAD] Generating video thumbnail…");
      durationSec = await getVideoDuration(objectUrl);
      thumbnailUrl = await generateVideoThumbnail(objectUrl);
    } else {
      console.log("[UPLOAD] Generating image thumbnail…");
      thumbnailUrl = await generateImageThumbnail(objectUrl);
    }
    console.log("[UPLOAD] Thumbnail done:", { hasThumb: !!thumbnailUrl, durationSec });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  console.log("[UPLOAD] Saving to disk:", { safeName });
  const diskPath = await saveToDisk(processedFile, safeName);
  console.log("[UPLOAD] Disk save returned:", diskPath);

  const item: MediaItem = {
    id: uid(),
    name: file.name,
    type: category,
    url: previewUrl,
    filePath: diskPath,
    diskFileName: safeName,
    thumbnailUrl: thumbnailUrl || undefined,
    durationSec: durationSec ? Math.round(durationSec) : undefined,
    fileSize: processedFile.size,
    mimeType: processedFile.type,
    createdAt: new Date().toISOString(),
  };

  console.log("[UPLOAD] uploadFileToDisk: returning item", { id: item.id, name: item.name, filePath: item.filePath });
  return { item };
}
