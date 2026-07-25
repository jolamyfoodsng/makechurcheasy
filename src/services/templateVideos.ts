import { getAllMedia, saveMedia } from "../library/libraryDb";
import type { MediaItem } from "../library/libraryTypes";
import { getOverlayBaseUrl } from "./overlayUrl";

const TEMPLATE_VIDEO_API_BASE =
  ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_OBS_BACKEND_API_BASE?.trim() ||
    "https://versecast-bible-api.solitary-credit-34b2.workers.dev") + "/api";

const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

export type TemplateVideoAsset = {
  id: string;
  fileName: string;
  videoUrl: string;
  cloudflareKey: string;
  size?: number;
  modified?: string;
};

type SaveBackgroundVideoResult = {
  filePath: string;
  relativeUrl: string;
};

type DownloadProgressHandler = (fraction: number | null) => void;

function uid(): string {
  return crypto.randomUUID?.() ?? `template-video-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function versionHeaders(): Record<string, string> {
  return { "X-App-Version": APP_VERSION };
}

/**
 * Unwrap the v2 API envelope: { data: <payload>, apiVersion: 2 } → <payload>
 * Old clients (v4.28) crash because they receive the envelope instead of raw data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapEnvelope<T = any>(json: any): T {
  if (json && typeof json === "object" && "apiVersion" in json && "data" in json) {
    return json.data as T;
  }
  return json as T;
}

async function universalFetch(input: string, extraHeaders?: Record<string, string>): Promise<Response> {
  const headers = { ...versionHeaders(), ...extraHeaders };
  try {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return await tauriFetch(input, { headers });
  } catch {
    // If browser fetch fails (CORS), try the overlay server proxy
    try {
      const resp = await fetch(input);
      if (resp.ok) return resp;
      // CORS failure — try proxy
      if (resp.status === 0 || resp.type === "opaque") {
        const { getOverlayBaseUrl } = await import("./overlayUrl");
        const proxyUrl = `${await getOverlayBaseUrl()}/api/proxy?url=${encodeURIComponent(input)}`;
        const proxyResp = await fetch(proxyUrl);
        if (proxyResp.ok) return proxyResp;
      }
      return resp;
    } catch {
      // Last resort: try proxy
      try {
        const { getOverlayBaseUrl } = await import("./overlayUrl");
        const proxyUrl = `${await getOverlayBaseUrl()}/api/proxy?url=${encodeURIComponent(input)}`;
        return await fetch(proxyUrl);
      } catch {
        throw new Error(`Failed to fetch ${input}`);
      }
    }
  }
}

async function invokeSaveBackgroundVideo(
  fileName: string,
  fileData: Uint8Array,
): Promise<SaveBackgroundVideoResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SaveBackgroundVideoResult>("save_background_video_file", {
    fileName,
    fileData: Array.from(fileData),
  });
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to encode file as data URL."));
    // Cast to any to satisfy BlobPart typing across different TS lib versions
    reader.readAsDataURL(new Blob([bytes as any], { type: mimeType }));
  });
}

function getVideoDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => resolve(0);
    video.src = src;
  });
}

function generateVideoThumbnail(src: string): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    let resolved = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finalize = (result: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(result);
    };
    timeout = setTimeout(() => finalize(""), 10000);
    video.onerror = () => finalize("");
    video.onloadeddata = () => {
      const seekTime = Math.min(1, video.duration / 4 || 0);
      video.currentTime = seekTime;
    };
    video.onseeked = () => {
      if (video.readyState < 2) {
        finalize("");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        finalize("");
        return;
      }
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        finalize(dataUrl);
      } catch {
        finalize("");
      }
    };
    video.src = src;
  });
}

async function findExistingTemplateVideo(asset: TemplateVideoAsset): Promise<MediaItem | undefined> {
  const items = await getAllMedia();
  return items.find((item) => (
    item.type === "video" &&
    (item.sourceAssetId === asset.id ||
      item.cloudflareKey === asset.cloudflareKey ||
      (item.source === "template-cloudflare" && item.name === asset.fileName))
  ));
}

async function readResponseBytes(
  url: string,
  onProgress?: DownloadProgressHandler
): Promise<Uint8Array> {
  const response = await universalFetch(url);
  if (!response.ok) {
    const error = new Error(`Download failed with status ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress?.(1);
    return bytes;
  }

  const total = Number(response.headers.get("content-length") || 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(total > 0 ? Math.min(received / total, 1) : null);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress?.(1);
  return bytes;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload && typeof payload === "object" && "error" in payload) {
      const message = payload.error;
      if (typeof message === "string" && message.trim()) return message;
    }
  } catch {
    // Ignore JSON parse failures and fall through to text.
  }

  try {
    const text = await response.text();
    if (text.trim()) return text;
  } catch {
    // Ignore text parse failures and fall back to status.
  }

  return `Template videos request failed (${response.status})`;
}

export async function fetchTemplateVideos(): Promise<TemplateVideoAsset[]> {
  const requestUrls = [`${TEMPLATE_VIDEO_API_BASE}/template-videos?_=${Date.now()}`];

  const overlayBaseUrl = await getOverlayBaseUrl();
  const localFallbackUrl = `${overlayBaseUrl}/api/template-videos?_=${Date.now()}`;
  if (!requestUrls.includes(localFallbackUrl)) {
    requestUrls.push(localFallbackUrl);
  }

  let lastError: Error | null = null;

  for (const requestUrl of requestUrls) {
    try {
      const response = await universalFetch(requestUrl);
      if (!response.ok) {
        lastError = new Error(await readErrorMessage(response));
        continue;
      }

      const raw = await response.json();
      const data = unwrapEnvelope<TemplateVideoAsset[]>(raw);
      if (!Array.isArray(data)) {
        throw new Error("Template videos response was not an array.");
      }

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Template videos request failed.");
}

async function saveTemplateVideoBytes(
  asset: TemplateVideoAsset,
  bytes: Uint8Array,
): Promise<SaveBackgroundVideoResult> {
  try {
    return await invokeSaveBackgroundVideo(asset.fileName, bytes);
  } catch {
    const dataUrl = await bytesToDataUrl(bytes, "video/mp4");
    const response = await fetch("/api/save-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: asset.fileName,
        dataUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const payload = await response.json() as { path?: string };
    if (!payload.path) {
      throw new Error("Template video save path was not returned.");
    }

    return {
      filePath: payload.path,
      relativeUrl: `/uploads/${encodeURIComponent(asset.fileName)}`,
    };
  }
}

export async function downloadTemplateVideoToLibrary(
  asset: TemplateVideoAsset,
  onProgress?: DownloadProgressHandler
): Promise<MediaItem> {
  const existing = await findExistingTemplateVideo(asset);
  if (existing?.filePath) {
    onProgress?.(1);
    return existing;
  }

  const downloadOnce = async (resolvedAsset: TemplateVideoAsset) => {
    // Ensure progress is reset for fresh download
    const progressCallback = onProgress ? (fraction: number | null) => {
      // Make sure we're not getting invalid progress values
      if (fraction !== null && (fraction < 0 || fraction > 1)) {
        return;
      }
      onProgress(fraction);
    } : undefined;

    const bytes = await readResponseBytes(resolvedAsset.videoUrl, progressCallback);
    const saved = await saveTemplateVideoBytes(resolvedAsset, bytes);

    const overlayBaseUrl = await getOverlayBaseUrl();
    const overlayUrl = `${overlayBaseUrl}${saved.relativeUrl}`;
    const [durationSec, thumbnailUrl] = await Promise.all([
      getVideoDuration(overlayUrl),
      generateVideoThumbnail(overlayUrl),
    ]);

    const item: MediaItem = {
      id: existing?.id || uid(),
      name: resolvedAsset.fileName,
      type: "video",
      url: overlayUrl,
      filePath: saved.filePath,
      thumbnailUrl: thumbnailUrl || existing?.thumbnailUrl,
      durationSec: durationSec ? Math.round(durationSec) : existing?.durationSec,
      fileSize: bytes.byteLength || resolvedAsset.size || existing?.fileSize,
      mimeType: "video/mp4",
      createdAt: existing?.createdAt || new Date().toISOString(),
      downloadedAt: new Date().toISOString(),
      source: "template-cloudflare",
      remoteUrl: resolvedAsset.videoUrl,
      sourceAssetId: resolvedAsset.id,
      cloudflareKey: resolvedAsset.cloudflareKey,
    };

    await saveMedia(item);
    return item;
  };

  try {
    return await downloadOnce(asset);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 401 || status === 403) {
      const refreshed = await fetchTemplateVideos();
      const nextAsset = refreshed.find((entry) => entry.cloudflareKey === asset.cloudflareKey);
      if (nextAsset) {
        return downloadOnce(nextAsset);
      }
    }
    throw error;
  }
}
