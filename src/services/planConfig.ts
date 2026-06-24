/**
 * planConfig.ts — Fetches plan configuration from the backend.
 *
 * Caches in localStorage so UI can render instantly on load.
 * Stale-while-revalidate: serves cache immediately, refreshes in background.
 *
 * Types and constants are imported from planConfigTypes.ts (single source of truth).
 */

import {
  DEFAULT_PLAN_CONFIG,
  type PlanConfig,
  type PlanEntitlements,
  type PlanTierConfig,
  type CreditCostConfig,
} from "./planConfigTypes";

// Re-export types for backward compatibility (consumers import from here)
export type { PlanConfig, PlanEntitlements, PlanTierConfig, CreditCostConfig };
export { DEFAULT_PLAN_CONFIG };

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";
const CACHE_KEY = "mce_plan_config";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Cache helpers ────────────────────────────────────────────────────────────

interface CacheEntry {
  config: PlanConfig;
  fetchedAt: number;
}

function readCache(): PlanConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS * 10) return null; // expired after 50 min
    return entry.config;
  } catch {
    return null;
  }
}

/**
 * Synchronous cache reader. Returns the cached plan config from localStorage,
 * or null if nothing cached / expired. Used by licenseService.ts for sync
 * access to plan entitlements without an async call.
 */
export function readPlanConfigCache(): PlanConfig | null {
  return readCache();
}

function writeCache(config: PlanConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ config, fetchedAt: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

// ── Fetch with cache ─────────────────────────────────────────────────────────

let inflight: Promise<PlanConfig> | null = null;

/**
 * Returns the plan config. Serves from cache if fresh, otherwise fetches.
 * Concurrent calls are deduplicated via a shared promise.
 */
export async function getPlanConfig(): Promise<PlanConfig> {
  const cached = readCache();
  if (cached) {
    // Serve cache, refresh in background
    refreshInBackground();
    return cached;
  }
  return fetchConfig();
}

async function fetchConfig(): Promise<PlanConfig> {
  if (inflight) return inflight;
  inflight = doFetch().finally(() => { inflight = null; });
  return inflight;
}

async function doFetch(): Promise<PlanConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/plan-config`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.plans) {
        writeCache(data);
        return data;
      }
    }
  } catch { /* fall through to default */ }
  return DEFAULT_PLAN_CONFIG;
}

function refreshInBackground(): void {
  if (inflight) return;
  inflight = doFetch().finally(() => { inflight = null; });
}

/**
 * Force-refresh: clears cache and fetches fresh data.
 */
export async function refreshPlanConfig(): Promise<PlanConfig> {
  localStorage.removeItem(CACHE_KEY);
  return fetchConfig();
}

// ── Helper functions ─────────────────────────────────────────────────────────

export function getPlanCredits(config: PlanConfig, plan: string): number {
  const key = plan?.toLowerCase();
  return config.plans[key as keyof typeof config.plans]?.credits ?? config.plans.free?.credits ?? 1000;
}

export function getPlanLabel(config: PlanConfig, plan: string): string {
  const key = plan?.toLowerCase();
  return config.plans[key as keyof typeof config.plans]?.label ?? config.plans.free?.label ?? "Free";
}

export function isUnlimitedPlan(config: PlanConfig, plan: string): boolean {
  return getPlanCredits(config, plan) === -1;
}

export function formatCredits(amount: number): string {
  if (amount === -1) return "Unlimited";
  return amount.toLocaleString();
}
