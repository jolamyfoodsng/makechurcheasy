const DEFAULT_BYPASS_MS = 5000;

let closeBypassUntil = 0;
let closeBypassTimer: ReturnType<typeof setTimeout> | null = null;

export function armConfirmedAppClose(durationMs: number = DEFAULT_BYPASS_MS): void {
  closeBypassUntil = Date.now() + durationMs;
  if (closeBypassTimer) {
    clearTimeout(closeBypassTimer);
  }
  closeBypassTimer = setTimeout(() => {
    closeBypassUntil = 0;
    closeBypassTimer = null;
  }, durationMs);
}

export function clearConfirmedAppClose(): void {
  closeBypassUntil = 0;
  if (closeBypassTimer) {
    clearTimeout(closeBypassTimer);
    closeBypassTimer = null;
  }
}

export function isConfirmedAppClose(): boolean {
  return closeBypassUntil > Date.now();
}
