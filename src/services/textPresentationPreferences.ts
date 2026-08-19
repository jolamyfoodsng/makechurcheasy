export interface DockLinePresentationStorage {
  lineCountKey: string;
  lineModeKey: string | null;
}

export function applyDockLinePresentationControls(
  storage: DockLinePresentationStorage,
  lineCount?: number,
  lineMode?: "count" | "original",
): Record<string, unknown> {
  const next: Record<string, unknown> = {};

  // Original changes only the mode. Never overwrite the remembered count,
  // even if an older client includes a stale line_count in the same packet.
  if (lineMode === "original") {
    if (storage.lineModeKey) next[storage.lineModeKey] = false;
    return next;
  }

  if (typeof lineCount === "number" && Number.isFinite(lineCount)) {
    next[storage.lineCountKey] = Math.max(1, Math.min(12, Math.trunc(lineCount)));
  }
  if (storage.lineModeKey && lineMode === "count") {
    next[storage.lineModeKey] = true;
  }

  return next;
}
