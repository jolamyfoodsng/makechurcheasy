import type { BibleTheme } from "../bible/types";

function canPersistDockAssets(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function fileExtensionFromDataUrl(dataUrl: string): string {
  const mimeMatch = dataUrl.match(/^data:([^;,]+)/i);
  const mime = mimeMatch?.[1]?.toLowerCase() ?? "";
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "video/x-matroska":
      return "mkv";
    case "video/x-msvideo":
      return "avi";
    default:
      return "png";
  }
}

function bytesFromDataUrl(dataUrl: string): Uint8Array | null {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return null;

  const header = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);

  if (/;base64/i.test(header)) {
    const binaryStr = atob(payload);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  return new TextEncoder().encode(decodeURIComponent(payload));
}

async function saveDataUrlToUploads(dataUrl: string, prefix: string): Promise<string> {
  if (!canPersistDockAssets() || !dataUrl.startsWith("data:")) return dataUrl;

  const bytes = bytesFromDataUrl(dataUrl);
  if (!bytes) return dataUrl;

  const ext = fileExtensionFromDataUrl(dataUrl);
  const fileName = `${prefix}_${simpleHash(dataUrl)}.${ext}`;

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<string>("save_upload_file", {
    fileName,
    fileData: Array.from(bytes),
  });

  return `/uploads/${encodeURIComponent(fileName)}`;
}

async function normalizeThemeAssets(theme: BibleTheme): Promise<BibleTheme> {
  const settings = { ...theme.settings };
  settings.backgroundImage = await saveDataUrlToUploads(settings.backgroundImage || "", "dock_theme_bg");
  settings.backgroundVideo = await saveDataUrlToUploads(settings.backgroundVideo || "", "dock_theme_bg_video");
  settings.boxBackgroundImage = await saveDataUrlToUploads(settings.boxBackgroundImage || "", "dock_theme_box_bg");
  settings.logoUrl = await saveDataUrlToUploads(settings.logoUrl || "", "dock_theme_logo");
  return { ...theme, settings };
}

export async function serializeBibleThemesForDock(themes: BibleTheme[]): Promise<BibleTheme[]> {
  return Promise.all(themes.map(normalizeThemeAssets));
}
