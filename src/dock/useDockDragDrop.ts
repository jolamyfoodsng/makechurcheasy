/**
 * useDockDragDrop.ts — Window-level drag-and-drop detection for the dock.
 *
 * Uses the dragCounter pattern to reliably track nested dragenter/dragleave
 * events. Returns a boolean indicating whether valid files are being dragged
 * over the dock window.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { isSupportedMediaFile } from "../services/mediaValidation";

function hasAcceptedFiles(dataTransfer: DataTransfer): boolean {
  if (dataTransfer.types.includes("Files")) {
    for (const item of Array.from(dataTransfer.items)) {
      if (item.kind === "file" && isSupportedMediaFile(item.getAsFile() || new File([], ""))) {
        return true;
      }
    }
  }
  return false;
}

export interface DockDragDropState {
  isDragging: boolean;
  onDrop: (handler: (files: File[]) => void) => () => void;
}

export function useDockDragDrop(): DockDragDropState {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const handlersRef = useRef<Set<(files: File[]) => void>>(new Set());

  const onDrop = useCallback((handler: (files: File[]) => void) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  useEffect(() => {
    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current++;
      if (dragCounterRef.current === 1 && e.dataTransfer && hasAcceptedFiles(e.dataTransfer)) {
        setIsDragging(true);
      }
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    }

    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    }

    function handleDrop(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);

      if (e.dataTransfer?.files?.length) {
        const files = Array.from(e.dataTransfer.files).filter((f) => isSupportedMediaFile(f));
        if (files.length > 0) {
          for (const handler of handlersRef.current) {
            handler(files);
          }
        }
      }
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return { isDragging, onDrop };
}
