import { invoke } from "@tauri-apps/api/core";
import { getOverlayBaseUrlSync } from "./overlayUrl";

export interface ReceiverFile {
  pendingId: string;
  fileName: string;
  storedFileName: string;
  fileSize: number;
  fileType: string;
  sha256: string;
  receivedAt: string;
}

export interface ReceiverFileActionResult {
  pendingId: string;
  fileName: string;
  storedFileName: string;
  fileSize: number;
  fileType: string;
  filePath: string;
}

function receiverUrl(path: string): string {
  return `${getOverlayBaseUrlSync()}${path}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error || `Receiver request failed (${response.status})`);
  }
  return payload as T;
}

export async function getPendingReceiverFiles(): Promise<ReceiverFile[]> {
  const response = await fetch(receiverUrl("/api/receiver/pending"), {
    cache: "no-store",
  });
  const payload = await parseResponse<{ files?: ReceiverFile[] }>(response);
  return Array.isArray(payload.files) ? payload.files : [];
}

export function getReceiverDownloadUrl(file: ReceiverFile): string {
  return receiverUrl(`/api/receiver/download?pendingId=${encodeURIComponent(file.pendingId)}`);
}

export async function downloadReceiverFile(file: ReceiverFile): Promise<Blob> {
  const response = await fetch(getReceiverDownloadUrl(file), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not read ${file.fileName} from the Receiver.`);
  }
  return response.blob();
}

export async function saveReceiverFileToFolder(
  file: ReceiverFile,
  folderPath: string,
): Promise<ReceiverFileActionResult> {
  return invoke<ReceiverFileActionResult>("save_received_file_to_folder", {
    pendingId: file.pendingId,
    folderPath,
  });
}

export async function completeReceiverFile(file: ReceiverFile): Promise<void> {
  const response = await fetch(
    receiverUrl(`/api/receiver/complete?pendingId=${encodeURIComponent(file.pendingId)}`),
    { method: "POST" },
  );
  await parseResponse<{ ok?: boolean }>(response);
}

export function formatReceiverFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatReceiverFileTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Just now";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
