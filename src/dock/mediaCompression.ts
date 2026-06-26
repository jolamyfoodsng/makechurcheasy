/**
 * mediaCompression.ts — Client-side image and video compression.
 *
 * Images: Canvas-based downscale + JPEG recomposition.
 * Videos: ffmpeg.wasm single-thread transcode to H.264 with aggressive compression.
 *
 * Both target < 1 MB output (configurable via platform settings).
 */

import {
  getDefaultImageTargetBytes,
  getDefaultImageMaxDimension,
  getDefaultVideoTargetBytes,
  getDefaultVideoMaxWidth,
} from "../services/desktopConfig";

/* ── Image compression ───────────────────────────────────────────────────── */

const IMAGE_INITIAL_QUALITY = 0.72;
const IMAGE_MIN_QUALITY = 0.35;

export async function compressImage(file: File): Promise<File> {
  const targetBytes = getDefaultImageTargetBytes();
  const maxDim = getDefaultImageMaxDimension();
  if (file.size <= targetBytes) return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = scaleDimensions(bitmap.width, bitmap.height, maxDim);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = IMAGE_INITIAL_QUALITY;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > targetBytes && quality > IMAGE_MIN_QUALITY) {
    quality = Math.max(IMAGE_MIN_QUALITY, quality - 0.08);
    blob = await canvasToBlob(canvas, quality);
  }

  if (blob.size > targetBytes) {
    const webpBlob = await canvasToBlob(canvas, quality, "image/webp");
    if (webpBlob.size < blob.size) {
      blob = webpBlob;
    }
  }

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const name = replaceExtension(file.name, ext);
  return new File([blob], name, { type: blob.type });
}

/* ── Video compression ───────────────────────────────────────────────────── */

const VIDEO_CRF_INITIAL = 32;
const VIDEO_CRF_AGGRESSIVE = 40;

let ffmpegLoaded = false;

export async function compressVideo(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  const targetBytes = getDefaultVideoTargetBytes();
  const maxWidth = getDefaultVideoMaxWidth();
  if (file.size <= targetBytes) return file;

  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

  const ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.(Math.round(progress * 100));
  });

  if (!ffmpegLoaded) {
    await ffmpeg.load({
      coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
      wasmURL: await toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
    });
    ffmpegLoaded = true;
  }

  const inputName = "input" + getExtension(file.name);
  const outputName = "output.mp4";

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // First pass: moderate compression
  await ffmpeg.exec([
    "-i", inputName,
    "-vf", `scale='min(${maxWidth},iw)':-2`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", String(VIDEO_CRF_INITIAL),
    "-an",
    "-movflags", "+faststart",
    "-y", outputName,
  ]);

  let data = await ffmpeg.readFile(outputName);

  // Second pass: more aggressive if still too large
  if ((data as Uint8Array).byteLength > targetBytes) {
    await ffmpeg.deleteFile(outputName);
    await ffmpeg.exec([
      "-i", inputName,
      "-vf", `scale='min(${maxWidth},iw)':-2`,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", String(VIDEO_CRF_AGGRESSIVE),
      "-an",
      "-movflags", "+faststart",
      "-y", outputName,
    ]);
    data = await ffmpeg.readFile(outputName);
  }

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  const outputData = data as Uint8Array;
  return new File([outputData], replaceExtension(file.name, "mp4"), {
    type: "video/mp4",
  });
}

/* ── Shared helpers ──────────────────────────────────────────────────────── */

function scaleDimensions(
  srcW: number,
  srcH: number,
  maxDim: number,
): { width: number; height: number } {
  if (srcW <= maxDim && srcH <= maxDim) return { width: srcW, height: srcH };
  const ratio = Math.min(maxDim / srcW, maxDim / srcH);
  return {
    width: Math.round(srcW * ratio),
    height: Math.round(srcH * ratio),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
  type = "image/jpeg",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      type,
      quality,
    );
  });
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

function replaceExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}
