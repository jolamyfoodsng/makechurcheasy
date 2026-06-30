/**
 * performanceMode.ts — Performance mode store for low-end hardware
 *
 * Uses useSyncExternalStore pattern for React integration and
 * direct getter for non-React consumers (OBS CEF, animation engine, etc.).
 *
 * Settings persist in localStorage so they survive dock reloads.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerformanceModeSettings {
  /** Master toggle — when false, all other settings are ignored */
  enabled: boolean;
  /** Disable frame-by-frame OBS animations (use instant transitions) */
  animations: boolean;
  /** Disable live preview rendering in Bible/Worship tabs */
  livePreviews: boolean;
  /** Multiplier for polling intervals (e.g. 3 = 3x slower polling) */
  pollingMultiplier: number;
}

export const DEFAULT_PERF_SETTINGS: PerformanceModeSettings = {
  enabled: false,
  animations: true,
  livePreviews: true,
  pollingMultiplier: 1,
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "ocs-dock-perf-mode-v1";

function loadSettings(): PerformanceModeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PERF_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PerformanceModeSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      animations: parsed.animations !== false,
      livePreviews: parsed.livePreviews !== false,
      pollingMultiplier: typeof parsed.pollingMultiplier === "number" && parsed.pollingMultiplier > 0
        ? Math.min(parsed.pollingMultiplier, 10)
        : 1,
    };
  } catch {
    return { ...DEFAULT_PERF_SETTINGS };
  }
}

function persistSettings(settings: PerformanceModeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // OBS CEF storage failures are non-critical
  }
}

// ---------------------------------------------------------------------------
// Store — useSyncExternalStore pattern
// ---------------------------------------------------------------------------

let currentSettings = loadSettings();
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

export function getPerformanceMode(): PerformanceModeSettings {
  return { ...currentSettings };
}

/**
 * Derived value: effective settings with master toggle applied.
 * When `enabled` is false, all sub-settings revert to defaults (everything ON).
 */
export function getEffectivePerformanceMode(): PerformanceModeSettings {
  if (!currentSettings.enabled) {
    return { ...DEFAULT_PERF_SETTINGS };
  }
  return { ...currentSettings };
}

export function setPerformanceMode(partial: Partial<PerformanceModeSettings>): void {
  const next = { ...currentSettings, ...partial };
  // Clamp pollingMultiplier
  if (next.pollingMultiplier < 1) next.pollingMultiplier = 1;
  if (next.pollingMultiplier > 10) next.pollingMultiplier = 10;
  // Snap booleans
  next.enabled = Boolean(next.enabled);
  next.animations = Boolean(next.animations);
  next.livePreviews = Boolean(next.livePreviews);

  currentSettings = next;
  persistSettings(next);
  emitChange();
}

/**
 * Toggle the master performance mode on/off.
 * When turning on, auto-disable animations for immediate benefit.
 */
export function togglePerformanceMode(): void {
  const nextEnabled = !currentSettings.enabled;
  setPerformanceMode({
    enabled: nextEnabled,
    // When enabling for the first time, suggest conservative defaults
    animations: !nextEnabled ? false : currentSettings.animations,
    livePreviews: !nextEnabled ? false : currentSettings.livePreviews,
    pollingMultiplier: !nextEnabled ? 3 : currentSettings.pollingMultiplier,
  });
}

// ---------------------------------------------------------------------------
// useSyncExternalStore compatibility
// ---------------------------------------------------------------------------

/** Subscribe function for React.useSyncExternalStore */
export function subscribePerformanceMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Snapshot function for React.useSyncExternalStore */
export function getPerformanceModeSnapshot(): PerformanceModeSettings {
  return currentSettings;
}

/** Server snapshot (never changes during SSR — not applicable here, but required) */
export function getPerformanceModeServerSnapshot(): PerformanceModeSettings {
  return DEFAULT_PERF_SETTINGS;
}

// ---------------------------------------------------------------------------
// Convenience getters for non-React code
// ---------------------------------------------------------------------------

/** Returns true when animations should be skipped entirely */
export function shouldSkipAnimations(): boolean {
  const s = getEffectivePerformanceMode();
  return !s.animations;
}

/** Returns true when live previews should be suppressed */
export function shouldSuppressLivePreviews(): boolean {
  const s = getEffectivePerformanceMode();
  return !s.livePreviews;
}

/**
 * Returns the effective polling interval, applying the perf mode multiplier.
 * Example: pollInterval(30_000) → 90_000 when multiplier is 3.
 */
export function pollInterval(baseMs: number): number {
  const s = getEffectivePerformanceMode();
  return Math.round(baseMs * s.pollingMultiplier);
}
