import { lmDockService } from "./lmDockService";

const ACTIVE_LISTENING_STATUSES = new Set([
  "requesting-mic",
  "connecting",
  "listening",
]);

export function isPresentationPath(path: string): boolean {
  return path === "/presentation" || path.startsWith("/presentation/") || path.startsWith("/presentation?");
}

export function confirmStopVoiceBibleForPresentation(path: string): boolean {
  if (!isPresentationPath(path)) return true;

  const snapshot = lmDockService.getSnapshot();
  if (!ACTIVE_LISTENING_STATUSES.has(snapshot.status)) return true;

  const shouldContinue = window.confirm(
    "Speech to Scripture is listening. Opening Presentation will stop listening. Continue?",
  );
  if (!shouldContinue) return false;

  lmDockService.stopListening();
  return true;
}
