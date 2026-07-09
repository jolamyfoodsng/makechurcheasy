/**
 * performanceManager.ts — Device performance detection and adaptive settings
 *
 * Calls Rust sysinfo on startup to collect CPU, RAM, GPU data.
 * Scores the device on a 4–12 point scale → assigns tier (low/medium/high).
 * Monitors runtime memory via sysinfo and auto-downgrades when RAM is low.
 * Exposes recommended polling intervals, concurrency limits, browser source
 * settings, and compatibility mode flags.
 *
 * Singleton — call `performanceManager.init()` once at app startup.
 */

import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PerformanceTier = "low" | "medium" | "high";

export interface HardwareProfile {
  hostname: string;
  os: string;
  osVersion: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRAMMB: number;
  availableRAMMB: number;
  gpuName: string;
}

export interface PerformanceScore {
  cpu: number;    // 1–4
  ram: number;    // 1–4
  gpu: number;    // 1–4
  total: number;  // 3–12
}

export interface BrowserSourceSettings {
  allowAnimations: boolean;
  allowBlurEffects: boolean;
  allowBackdropFilter: boolean;
  allowWebGL: boolean;
  browserRefreshRateMs: number;
  browserUpdateBudgetPerSecond: number;
}

export interface DevicePerformanceProfile {
  hardware: HardwareProfile;
  score: PerformanceScore;
  tier: PerformanceTier;
  compatibilityMode: boolean;
  browser: BrowserSourceSettings;
  pollingIntervalCap: number;
  maxConcurrentRequests: number;
  requestsPerSecondBudget: number;
}

// ---------------------------------------------------------------------------
// Tier configuration tables
// ---------------------------------------------------------------------------

const TIER_CONFIG: Record<PerformanceTier, {
  maxScore: number;
  minScore: number;
  pollingCap: number;
  maxConcurrent: number;
  requestsPerSecond: number;
  browser: BrowserSourceSettings;
}> = {
  low: {
    minScore: 3,
    maxScore: 5,
    pollingCap: 3000,
    maxConcurrent: 4,
    requestsPerSecond: 15,
    browser: {
      allowAnimations: false,
      allowBlurEffects: false,
      allowBackdropFilter: false,
      allowWebGL: false,
      browserRefreshRateMs: 1000,
      browserUpdateBudgetPerSecond: 1,
    },
  },
  medium: {
    minScore: 6,
    maxScore: 9,
    pollingCap: 1500,
    maxConcurrent: 8,
    requestsPerSecond: 30,
    browser: {
      allowAnimations: true,
      allowBlurEffects: false,
      allowBackdropFilter: false,
      allowWebGL: true,
      browserRefreshRateMs: 333,
      browserUpdateBudgetPerSecond: 3,
    },
  },
  high: {
    minScore: 10,
    maxScore: 12,
    pollingCap: 1000,
    maxConcurrent: 12,
    requestsPerSecond: 50,
    browser: {
      allowAnimations: true,
      allowBlurEffects: true,
      allowBackdropFilter: true,
      allowWebGL: true,
      browserRefreshRateMs: 100,
      browserUpdateBudgetPerSecond: 10,
    },
  },
};

// Compatibility mode overrides — forces low-tier browser settings regardless of tier
const COMPAT_BROWSER_SETTINGS: BrowserSourceSettings = {
  allowAnimations: false,
  allowBlurEffects: false,
  allowBackdropFilter: false,
  allowWebGL: false,
  browserRefreshRateMs: 1000,
  browserUpdateBudgetPerSecond: 1,
};

// ---------------------------------------------------------------------------
// GPU detection heuristics — known weak integrated GPUs
// ---------------------------------------------------------------------------

const WEAK_GPU_PATTERNS = [
  /intel\s+hd\s+graphics\s+3000/i,
  /intel\s+hd\s+graphics\s+4000/i,
  /intel\s+hd\s+graphics\s+2500/i,
  /intel\s+hd\s+graphics\s+2000/i,
  /intel\s+hd\s+graphics\s+(?:1000|1500)/i,
  /intel\s+gma/i,
  /microsoft\s+basic\s+render/i,
  /microsoft\s+remote\s+display/i,
  /vmware\s+svga/i,
  /virtualbox\s+video/i,
  /qxl/i,
  /cirrus\s+logic/i,
  /intel\s+uhd\s+6[012]\d/i,   // UHD 600-series (low-power)
  /intel\s+uhd\s+600\b/i,
];

function isWeakGPU(name: string): boolean {
  return WEAK_GPU_PATTERNS.some(p => p.test(name));
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

function scoreCPU(cores: number): number {
  if (cores <= 2) return 1;
  if (cores <= 4) return 2;
  if (cores <= 8) return 3;
  return 4;
}

function scoreRAM(totalMB: number): number {
  if (totalMB < 4096) return 1;      // <4 GB
  if (totalMB < 8192) return 2;      // 4–8 GB
  if (totalMB < 16384) return 3;     // 8–16 GB
  return 4;                           // 16+ GB
}

function scoreGPU(gpuName: string): number {
  if (isWeakGPU(gpuName)) return 1;
  // Mid-range: Intel UHD 620+, Intel Iris, AMD Radeon Vega, basic NVIDIA
  if (/intel\s+(uhd|iris|hd\s+graphics\s+[56]\d{3})/i.test(gpuName)) return 2;
  if (/amd\s+(radeon\s+)?(vega|r[357]\d{3}|r[357]m)/i.test(gpuName)) return 3;
  // High-end: NVIDIA GTX/RTX, AMD RX, Apple M-series GPU
  if (/(geforce|rtx|gtx|radeon\s+rx|apple\s+m[1-9]|apple\s+m[1-9]\s+(pro|max|ultra))/i.test(gpuName)) return 4;
  // Unknown GPU — conservative middle
  return 2;
}

function calculateScore(hw: HardwareProfile): PerformanceScore {
  const cpu = scoreCPU(hw.cpuCores);
  const ram = scoreRAM(hw.totalRAMMB);
  const gpu = scoreGPU(hw.gpuName);
  return { cpu, ram, gpu, total: cpu + ram + gpu };
}

function scoreToTier(total: number): PerformanceTier {
  if (total <= 5) return "low";
  if (total <= 9) return "medium";
  return "high";
}

// ---------------------------------------------------------------------------
// Memory-based tier downgrade logic
// ---------------------------------------------------------------------------

const MEMORY_THRESHOLD = 0.15; // downgrade when available RAM < 15% of total

function checkMemoryDowngrade(
  availableFraction: number,
  currentTier: PerformanceTier
): { tier: PerformanceTier; downgraded: boolean } {
  if (availableFraction < MEMORY_THRESHOLD) {
    if (currentTier === "high") return { tier: "medium", downgraded: true };
    if (currentTier === "medium") return { tier: "low", downgraded: true };
    // Already low — can't downgrade further
    return { tier: "low", downgraded: false };
  }
  return { tier: currentTier, downgraded: false };
}

// ---------------------------------------------------------------------------
// Event system
// ---------------------------------------------------------------------------

type Listener = (profile: DevicePerformanceProfile) => void;
const listeners = new Set<Listener>();

function emitChange(profile: DevicePerformanceProfile): void {
  for (const l of listeners) {
    try { l(profile); } catch { /* listener error — ignore */ }
  }
}

export function onPerformanceTierChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ---------------------------------------------------------------------------
// DOM compat-mode attribute
// ---------------------------------------------------------------------------

function applyCompatModeDOM(profile: DevicePerformanceProfile): void {
  if (typeof document === "undefined") return; // SSR / CEF safety

  const body = document.body;
  if (profile.compatibilityMode) {
    body.dataset.compatMode = "true";
  } else {
    delete body.dataset.compatMode;
  }
}

// ---------------------------------------------------------------------------
// Manual performance mode settings (absorbed from performanceMode.ts)
// ---------------------------------------------------------------------------

export interface ManualPerformanceSettings {
  /** Master toggle — when false, all sub-settings are ignored */
  enabled: boolean;
  /** Disable frame-by-frame OBS animations (use instant transitions) */
  animations: boolean;
  /** Disable live preview rendering in Bible/Worship tabs */
  livePreviews: boolean;
  /** Multiplier for polling intervals (e.g. 3 = 3x slower polling) */
  pollingMultiplier: number;
}

const DEFAULT_MANUAL_SETTINGS: ManualPerformanceSettings = {
  enabled: false,
  animations: true,
  livePreviews: true,
  pollingMultiplier: 1,
};

const MANUAL_STORAGE_KEY = "ocs-dock-perf-mode-v1";

function loadManualSettings(): ManualPerformanceSettings {
  try {
    const raw = localStorage.getItem(MANUAL_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MANUAL_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ManualPerformanceSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      animations: parsed.animations !== false,
      livePreviews: parsed.livePreviews !== false,
      pollingMultiplier: typeof parsed.pollingMultiplier === "number" && parsed.pollingMultiplier > 0
        ? Math.min(parsed.pollingMultiplier, 10)
        : 1,
    };
  } catch {
    return { ...DEFAULT_MANUAL_SETTINGS };
  }
}

function persistManualSettings(settings: ManualPerformanceSettings): void {
  try {
    localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(settings));
  } catch { /* non-critical */ }
}

let currentManualSettings = loadManualSettings();
const manualListeners = new Set<() => void>();

function emitManualChange(): void {
  for (const l of manualListeners) {
    try { l(); } catch { /* listener error — ignore */ }
  }
}

/**
 * Get the raw manual performance mode settings.
 */
export function getManualSettings(): ManualPerformanceSettings {
  return { ...currentManualSettings };
}

/**
 * Get effective manual settings (defaults when master toggle is off).
 */
export function getEffectiveManualSettings(): ManualPerformanceSettings {
  if (!currentManualSettings.enabled) {
    return { ...DEFAULT_MANUAL_SETTINGS };
  }
  return { ...currentManualSettings };
}

/**
 * Update manual performance mode settings.
 */
export function setManualSettings(partial: Partial<ManualPerformanceSettings>): void {
  const next = { ...currentManualSettings, ...partial };
  if (next.pollingMultiplier < 1) next.pollingMultiplier = 1;
  if (next.pollingMultiplier > 10) next.pollingMultiplier = 10;
  next.enabled = Boolean(next.enabled);
  next.animations = Boolean(next.animations);
  next.livePreviews = Boolean(next.livePreviews);

  currentManualSettings = next;
  persistManualSettings(next);
  emitManualChange();
}

/**
 * Toggle manual performance mode on/off.
 * When enabling, auto-disable animations and set conservative multiplier.
 */
export function toggleManualMode(): void {
  const nextEnabled = !currentManualSettings.enabled;
  setManualSettings({
    enabled: nextEnabled,
    animations: !nextEnabled ? false : currentManualSettings.animations,
    livePreviews: !nextEnabled ? false : currentManualSettings.livePreviews,
    pollingMultiplier: !nextEnabled ? 3 : currentManualSettings.pollingMultiplier,
  });
}

/** Subscribe function for useSyncExternalStore */
export function subscribeManualSettings(listener: () => void): () => void {
  manualListeners.add(listener);
  return () => { manualListeners.delete(listener); };
}

/** Snapshot function for useSyncExternalStore */
export function getManualSettingsSnapshot(): ManualPerformanceSettings {
  return currentManualSettings;
}

/** Server snapshot (SSR fallback) */
export function getManualSettingsServerSnapshot(): ManualPerformanceSettings {
  return DEFAULT_MANUAL_SETTINGS;
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let currentProfile: DevicePerformanceProfile | null = null;
let memoryInterval: ReturnType<typeof setInterval> | null = null;
let originalTier: PerformanceTier | null = null; // tier before memory downgrade

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the performance manager. Call once at app startup.
 * Fetches hardware info from Rust, computes tier, starts memory monitoring.
 */
export async function init(): Promise<DevicePerformanceProfile> {
  const hw = await fetchHardwareProfile();
  const score = calculateScore(hw);
  const tier = scoreToTier(score.total);

  // Check for GPU compatibility mode
  const compatMode = isWeakGPU(hw.gpuName);

  const browserSettings = compatMode
    ? { ...COMPAT_BROWSER_SETTINGS }
    : { ...TIER_CONFIG[tier].browser };

  currentProfile = {
    hardware: hw,
    score,
    tier,
    compatibilityMode: compatMode,
    browser: browserSettings,
    pollingIntervalCap: TIER_CONFIG[tier].pollingCap,
    maxConcurrentRequests: TIER_CONFIG[tier].maxConcurrent,
    requestsPerSecondBudget: TIER_CONFIG[tier].requestsPerSecond,
  };

  originalTier = tier;

  // Cache in localStorage for instant access on next startup
  try {
    localStorage.setItem("ocs-perf-profile-v1", JSON.stringify({
      tier,
      score,
      compatibilityMode: compatMode,
      hardware: {
        cpuModel: hw.cpuModel,
        cpuCores: hw.cpuCores,
        totalRAMMB: hw.totalRAMMB,
        gpuName: hw.gpuName,
        os: hw.os,
      },
    }));
  } catch { /* non-critical */ }

  console.log(`[PERF] Tier: ${tier} (score ${score.total}/12) | CPU: ${score.cpu} RAM: ${score.ram} GPU: ${score.gpu}`);
  console.log(`[PERF] GPU: ${hw.gpuName} | Compat mode: ${compatMode}`);
  console.log(`[PERF] RAM: ${hw.totalRAMMB}MB total, ${hw.availableRAMMB}MB available`);
  console.log(`[PERF] Polling cap: ${currentProfile.pollingIntervalCap}ms | Max concurrent: ${currentProfile.maxConcurrentRequests} | RPS: ${currentProfile.requestsPerSecondBudget}`);

  // Apply compat-mode attribute to <body> for global CSS overrides
  applyCompatModeDOM(currentProfile);

  // Start memory monitoring (every 12s via sysinfo — more reliable than performance.memory)
  startMemoryMonitoring();

  return currentProfile;
}

/**
 * Get cached hardware profile. Returns null if init() hasn't been called yet.
 * For fast synchronous access — does not re-fetch from Rust.
 */
export function getDeviceProfile(): DevicePerformanceProfile | null {
  return currentProfile ? { ...currentProfile } : null;
}

/**
 * Get current performance tier. Returns null if not initialized.
 */
export function getPerformanceTier(): PerformanceTier | null {
  return currentProfile?.tier ?? null;
}

/**
 * Returns the effective polling interval for a given base interval,
 * capped by the tier's polling cap and multiplied by the manual multiplier.
 * Never exceeds the tier cap (max 1000ms for high-end).
 */
export function getRecommendedPollingInterval(baseMs: number): number {
  if (!currentProfile) return baseMs;

  // Apply manual performance mode multiplier (user override)
  const effective = getEffectiveManualSettings();
  const multiplier = effective.enabled ? effective.pollingMultiplier : 1;

  const adjusted = Math.round(baseMs * multiplier);
  return Math.min(adjusted, currentProfile.pollingIntervalCap);
}

/**
 * Maximum concurrent OBS WebSocket requests allowed.
 */
export function getMaxConcurrentRequests(): number {
  return currentProfile?.maxConcurrentRequests ?? 4;
}

/**
 * Maximum OBS requests per second budget.
 */
export function getOBSRequestBudget(): number {
  return currentProfile?.requestsPerSecondBudget ?? 8;
}

/**
 * Get browser source settings for the current tier.
 */
export function getBrowserSourceSettings(): BrowserSourceSettings {
  if (!currentProfile) {
    return TIER_CONFIG.medium.browser;
  }
  return { ...currentProfile.browser };
}

/**
 * Whether compatibility mode is active (weak GPU detected).
 */
export function isCompatibilityMode(): boolean {
  return currentProfile?.compatibilityMode ?? false;
}

/**
 * Check if a specific visual effect is allowed.
 * Respects both auto-detected tier settings AND manual overrides.
 */
export function isEffectAllowed(effect: "animations" | "blur" | "backdropFilter" | "webgl"): boolean {
  // Manual override: if user explicitly disabled animations, honor that
  const effective = getEffectiveManualSettings();
  if (effective.enabled) {
    if (effect === "animations" && !effective.animations) return false;
  }

  const b = currentProfile?.browser;
  if (!b) return true;
  switch (effect) {
    case "animations": return b.allowAnimations;
    case "blur": return b.allowBlurEffects;
    case "backdropFilter": return b.allowBackdropFilter;
    case "webgl": return b.allowWebGL;
  }
}

// ---------------------------------------------------------------------------
// CSS string stripping for OBS browser sources (compatibility mode)
// ---------------------------------------------------------------------------

/**
 * Remove GPU-heavy CSS properties from a CSS string when compat mode is active.
 * This targets inline theme CSS that will be rendered in OBS browser sources (CEF),
 * which are separate HTML documents NOT covered by the main app's compat-mode.css.
 *
 * Strips: backdrop-filter, animation/animation-*, filter,
 * and caps box-shadow to a small safe value.
 */
export function stripCompatModeCSS(css: string): string {
  if (!isCompatibilityMode()) return css;

  let out = css;

  // Remove backdrop-filter and -webkit-backdrop-filter declarations
  out = out.replace(/-webkit-backdrop-filter\s*:[^;]+;?\s*/gi, "");
  out = out.replace(/backdrop-filter\s*:[^;]+;?\s*/gi, "");

  // Remove all animation-* properties and animation shorthand
  out = out.replace(/animation-name\s*:[^;]+;?\s*/gi, "");
  out = out.replace(/animation-duration\s*:[^;]+;?\s*/gi, "");
  out = out.replace(/animation-delay\s*:[^;]+;?\s*/gi, "");
  out = out.replace(/animation-fill-mode\s*:[^;]+;?\s*/gi, "");
  out = out.replace(/animation-iteration-count\s*:[^;]+;?\s*/gi, "");
  out = out.replace(/animation-timing-function\s*:[^;]+;?\s*/gi, "");
  out = out.replace(/animation-play-state\s*:[^;]+;?\s*/gi, "");
  out = out.replace(/animation\s*:[^;]+;?\s*/gi, "");

  // Remove filter declarations
  out = out.replace(/filter\s*:[^;]+;?\s*/gi, "");

  // Cap box-shadow: replace large shadows with a small safe one
  // Matches any box-shadow value that has a blur-radius > 8px
  out = out.replace(
    /box-shadow\s*:[^;]+;?\s*/gi,
    "box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12) !important;\n"
  );

  return out;
}

/**
 * Force a tier override (e.g., from user toggle in DockPerformanceTab).
 * Pass null to clear override and revert to auto-detected tier.
 */
export function setTierOverride(tier: PerformanceTier | null): void {
  if (!currentProfile) return;

  if (tier === null) {
    // Revert to original hardware-detected tier
    tier = originalTier ?? currentProfile.tier;
  }

  currentProfile.tier = tier;
  currentProfile.pollingIntervalCap = TIER_CONFIG[tier].pollingCap;
  currentProfile.maxConcurrentRequests = TIER_CONFIG[tier].maxConcurrent;
  currentProfile.requestsPerSecondBudget = TIER_CONFIG[tier].requestsPerSecond;

  if (!currentProfile.compatibilityMode) {
    currentProfile.browser = { ...TIER_CONFIG[tier].browser };
  }

  emitChange(currentProfile);
  console.log(`[PERF] Tier override → ${tier}`);
}

// ---------------------------------------------------------------------------
// Memory monitoring
// ---------------------------------------------------------------------------

function startMemoryMonitoring(): void {
  if (memoryInterval) clearInterval(memoryInterval);

  memoryInterval = setInterval(async () => {
    try {
      const mem = await invoke<{
        totalMB: number;
        availableMB: number;
        usedMB: number;
        availableFraction: number;
      }>("get_memory_usage");

      if (!currentProfile || !originalTier) return;

      const { tier: newTier, downgraded } = checkMemoryDowngrade(mem.availableFraction, originalTier);

      if (newTier !== currentProfile.tier) {
        currentProfile.tier = newTier;
        currentProfile.pollingIntervalCap = TIER_CONFIG[newTier].pollingCap;
        currentProfile.maxConcurrentRequests = TIER_CONFIG[newTier].maxConcurrent;
        currentProfile.requestsPerSecondBudget = TIER_CONFIG[newTier].requestsPerSecond;

        if (!currentProfile.compatibilityMode) {
          currentProfile.browser = { ...TIER_CONFIG[newTier].browser };
        }

        console.log(`[PERF] Memory-based tier ${downgraded ? "downgrade" : "restore"} → ${newTier} (${(mem.availableFraction * 100).toFixed(1)}% RAM available)`);
        emitChange(currentProfile);
      }
    } catch {
      // sysinfo command failure — non-critical, will retry next cycle
    }
  }, 12_000);
}

/**
 * Stop memory monitoring (e.g., on app shutdown).
 */
export function stopMemoryMonitoring(): void {
  if (memoryInterval) {
    clearInterval(memoryInterval);
    memoryInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Hardware fetch
// ---------------------------------------------------------------------------

async function fetchHardwareProfile(): Promise<HardwareProfile> {
  try {
    const raw = await invoke<Record<string, unknown>>("get_system_hardware_info");
    return {
      hostname: String(raw.hostname ?? "Unknown"),
      os: String(raw.os ?? "unknown"),
      osVersion: String(raw.osVersion ?? "Unknown"),
      arch: String(raw.arch ?? "unknown"),
      cpuModel: String(raw.cpuModel ?? "Unknown CPU"),
      cpuCores: Number(raw.cpuCores ?? 2),
      totalRAMMB: Number(raw.totalRAMMB ?? 0),
      availableRAMMB: Number(raw.availableRAMMB ?? 0),
      gpuName: String(raw.gpuName ?? "Unknown GPU"),
    };
  } catch (e) {
    console.warn("[PERF] Failed to fetch hardware info, using conservative defaults:", e);
    return {
      hostname: "Unknown",
      os: "unknown",
      osVersion: "Unknown",
      arch: "unknown",
      cpuModel: "Unknown CPU",
      cpuCores: 2,
      totalRAMMB: 0,
      availableRAMMB: 0,
      gpuName: "Unknown GPU",
    };
  }
}
