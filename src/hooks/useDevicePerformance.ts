/**
 * useDevicePerformance — React hook for device performance tier
 *
 * Subscribes to performanceManager tier changes and provides reactive
 * access to the current device profile, tier, compatibility mode,
 * and recommended settings.
 */

import { useState, useEffect, useCallback } from "react";
import * as perf from "../services/performanceManager";
import type { PerformanceTier, BrowserSourceSettings } from "../services/performanceManager";

export interface UseDevicePerformanceReturn {
  /** Current performance tier (Low | Medium | High) */
  tier: PerformanceTier;
  /** Full hardware profile from Rust sysinfo */
  profile: perf.HardwareProfile | null;
  /** Whether compatibility mode is active (weak GPU or low RAM) */
  compatibilityMode: boolean;
  /** Browser source settings for current tier */
  browserSettings: BrowserSourceSettings;
  /** Get recommended polling interval given a base interval */
  getRecommendedPollingInterval: (baseMs: number) => number;
  /** Max concurrent OBS requests */
  maxConcurrentRequests: number;
  /** Override tier manually (e.g., for debugging) */
  setTierOverride: (tier: PerformanceTier | null) => void;
}

export function useDevicePerformance(): UseDevicePerformanceReturn {
  const [tier, setTier] = useState<PerformanceTier>(() => perf.getPerformanceTier() ?? "medium");
  const [profile, setProfile] = useState<perf.HardwareProfile | null>(() => perf.getDeviceProfile()?.hardware ?? null);
  const [compatibilityMode, setCompatibilityMode] = useState<boolean>(() => perf.isCompatibilityMode());
  const [browserSettings, setBrowserSettings] = useState<BrowserSourceSettings>(() => perf.getBrowserSourceSettings());

  useEffect(() => {
    const unsub = perf.onPerformanceTierChange((p) => {
      setTier(p.tier);
      setProfile(p.hardware);
      setCompatibilityMode(p.compatibilityMode);
      setBrowserSettings(p.browser);
    });

    // Sync initial state in case it changed between useState initializer and effect mount
    const current = perf.getDeviceProfile();
    if (current) {
      setProfile(current.hardware);
      setCompatibilityMode(current.compatibilityMode);
      setBrowserSettings(current.browser);
    }

    return unsub;
  }, []);

  const getRecommendedPollingInterval = useCallback((baseMs: number) => {
    return perf.getRecommendedPollingInterval(baseMs);
  }, [tier]);

  const maxConcurrentRequests = perf.getMaxConcurrentRequests();

  const setTierOverride = useCallback((override: PerformanceTier | null) => {
    perf.setTierOverride(override);
  }, []);

  return {
    tier,
    profile,
    compatibilityMode,
    browserSettings,
    getRecommendedPollingInterval,
    maxConcurrentRequests,
    setTierOverride,
  };
}
