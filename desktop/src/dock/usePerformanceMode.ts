/**
 * usePerformanceMode.ts — React hook for manual performance mode settings
 *
 * Thin wrapper around useSyncExternalStore + the performanceManager manual settings store.
 * Returns the effective settings (master toggle applied) and setters.
 */

import { useSyncExternalStore, useCallback } from "react";
import {
  subscribeManualSettings,
  getManualSettingsSnapshot,
  getManualSettingsServerSnapshot,
  setManualSettings,
  toggleManualMode,
  type ManualPerformanceSettings,
} from "../services/performanceManager";

/** Alias for backward compatibility with DockPerformanceTab */
export type PerformanceModeSettings = ManualPerformanceSettings;

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

const DEFAULT_SETTINGS: PerformanceModeSettings = {
  enabled: false,
  animations: true,
  livePreviews: true,
  pollingMultiplier: 1,
};

export function usePerformanceMode(): UsePerformanceMode {
  const raw = useSyncExternalStore(
    subscribeManualSettings,
    getManualSettingsSnapshot,
    getManualSettingsServerSnapshot,
  );

  const update = useCallback((partial: Partial<PerformanceModeSettings>) => {
    setManualSettings(partial);
  }, []);

  const active = raw.enabled;

  // Compute effective settings inline (same logic as getEffectiveManualSettings)
  const settings: PerformanceModeSettings = raw.enabled
    ? raw
    : { ...DEFAULT_SETTINGS };

  return { settings, raw, active, update, toggle: toggleManualMode };
}
