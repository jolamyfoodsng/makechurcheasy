import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface LocalShareDevice {
  alias: string;
  version: string;
  deviceModel: string;
  deviceType: string;
  fingerprint: string;
  host: string;
  port: number;
  protocol: string;
  download: boolean;
  transferToken: string;
  baseUrl: string;
}

export interface LocalShareFileMetadata {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
}

export interface LocalShareFileInput {
  filePath: string;
  fileName: string;
  fileType?: string;
  temporary?: boolean;
}

export interface LocalShareProgress {
  fileId: string;
  fileName: string;
  bytesSent: number;
  totalBytes: number;
  completedFiles: number;
  totalFiles: number;
  status: "sending" | "complete";
}

export interface LocalShareSentFile {
  fileId: string;
  fileName: string;
  fileSize: number;
  displayPath: string;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function requireTauriRuntime(): void {
  if (!isTauriRuntime()) {
    throw new Error("Open the MakeChurchEasy desktop app to share files between computers.");
  }
}

export function formatLocalShareFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, bytes || 0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export async function getLocalShareInfo(): Promise<LocalShareDevice> {
  requireTauriRuntime();
  return invoke<LocalShareDevice>("get_local_share_info");
}

export async function discoverLocalShareDevices(): Promise<LocalShareDevice[]> {
  requireTauriRuntime();
  return invoke<LocalShareDevice[]>("discover_local_share_devices");
}

export async function getLocalShareFileMetadata(filePaths: string[]): Promise<LocalShareFileMetadata[]> {
  requireTauriRuntime();
  return invoke<LocalShareFileMetadata[]>("get_local_share_file_metadata", { filePaths });
}

export async function saveLocalShareTempFile(file: File): Promise<string> {
  requireTauriRuntime();
  const data = Array.from(new Uint8Array(await file.arrayBuffer()));
  return invoke<string>("save_share_temp_file", {
    fileName: file.name,
    fileData: data,
  });
}

export async function sendLocalShareFiles(
  peer: LocalShareDevice,
  files: LocalShareFileInput[],
  onProgress?: (progress: LocalShareProgress) => void,
): Promise<LocalShareSentFile[]> {
  requireTauriRuntime();
  const unlisten = onProgress
    ? await listen<LocalShareProgress>("local-share-progress", (event) => onProgress(event.payload))
    : null;

  try {
    return await invoke<LocalShareSentFile[]>("send_local_share_files", {
      peerBaseUrl: peer.baseUrl,
      peerToken: peer.transferToken,
      files,
    });
  } finally {
    unlisten?.();
  }
}
