/**
 * useDockUpload.ts — Reusable file upload handler for the dock.
 *
 * Processes dropped files: validates types, saves to disk, generates
 * thumbnails, registers in the media library. Exposes progress state
 * and toast notifications.
 */

import { useState, useCallback, useRef } from "react";
import {
  uploadFileToDock,
  dedupeMediaItems,
  loadLocalLibrary,
  saveLocalLibrary,
  syncMediaToApp,
} from "./dockUploadService";

export type UploadToastTone = "info" | "success" | "error";

export interface UploadToast {
  id: string;
  message: string;
  tone: UploadToastTone;
}

export interface UseDockUploadReturn {
  uploading: boolean;
  uploadProgress: { current: number; total: number } | null;
  toasts: UploadToast[];
  handleFiles: (files: File[]) => Promise<void>;
  dismissToast: (id: string) => void;
}

function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isAcceptedFile(file: File): boolean {
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "mov", "webm", "mkv"].includes(ext);
}

export function useDockUpload(): UseDockUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [toasts, setToasts] = useState<UploadToast[]>([]);
  const processingRef = useRef(false);

  const addToast = useCallback((message: string, tone: UploadToastTone = "info") => {
    const id = uid();
    setToasts((prev) => [...prev.slice(-4), { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    if (processingRef.current) return;
    processingRef.current = true;

    const valid = files.filter(isAcceptedFile);
    const invalid = files.length - valid.length;

    if (invalid > 0) {
      addToast(`${invalid} file${invalid > 1 ? "s" : ""} skipped (unsupported type)`, "error");
    }

    if (valid.length === 0) {
      processingRef.current = false;
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: valid.length });

    let successCount = 0;
    let failCount = 0;
    const newItems: import("../library/libraryTypes").MediaItem[] = [];

    for (let i = 0; i < valid.length; i++) {
      setUploadProgress({ current: i + 1, total: valid.length });
      try {
        const { item } = await uploadFileToDock(valid[i]);
        newItems.push(item);
        syncMediaToApp(item);
        successCount++;
      } catch (err) {
        console.error("[useDockUpload] Failed to save file:", valid[i].name, err);
        failCount++;
      }
    }

    if (newItems.length > 0) {
      const current = loadLocalLibrary();
      saveLocalLibrary(dedupeMediaItems([...newItems, ...current]));
    }

    setUploading(false);
    setUploadProgress(null);
    processingRef.current = false;

    if (successCount > 0) {
      const label = valid.length === 1
        ? `"${valid[0].name}"`
        : `${successCount} file${successCount > 1 ? "s" : ""}`;
      addToast(`${label} uploaded`, "success");
    }
    if (failCount > 0) {
      addToast(`${failCount} upload${failCount > 1 ? "s" : ""} failed`, "error");
    }
  }, [addToast]);

  return { uploading, uploadProgress, toasts, handleFiles, dismissToast };
}
