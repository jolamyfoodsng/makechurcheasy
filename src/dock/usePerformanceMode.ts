/**
 * usePerformanceMode.ts — React hook for performance mode settings
 *
 * Thin wrapper around useSyncExternalStore + the performanceMode store.
 * Returns the effective settings (master toggle applied) and setters.
 */

import { useSyncExternalStore, useCallback } from "react";
import {
  subscribePerformanceMode,
  getPerformanceModeSnapshot,
  getPerformanceModeServerSnapshot,
  setPerformanceMode,
  togglePerformanceMode,
  type PerformanceModeSettings,
} from "./performanceMode";

export interface UsePerformanceMode {
  /** Effective settings (false defaults when master toggle is off) */
  settings: PerformanceModeSettings;
  /** Raw settings (master toggle may be false) */
  raw: PerformanceModeSettings;
  /** Whether performance mode is active (master toggle ON) */
  active: boolean;
  /** Set partial settings */
  update: (partial: Partial<PerformanceModeSettings>) => void;
  /** Toggle master switch */
  toggle: () => void;
}

export function usePerformanceMode(): UsePerformanceMode {
  const raw = useSyncExternalStore(
    subscribePerformanceMode,
    getPerformanceModeSnapshot,
    getPerformanceModeServerSnapshot,
  );

  const update = useCallback((partial: Partial<PerformanceModeSettings>) => {
    setPerformanceMode(partial);
  }, []);

  const active = raw.enabled;

  // Compute effective settings inline (same logic as getEffectivePerformanceMode)
  const settings: PerformanceModeSettings = raw.enabled
    ? raw
    : { enabled: false, animations: true, livePreviews: true, pollingMultiplier: 1 };

  return { settings, raw, active, update, toggle: togglePerformanceMode };
}
