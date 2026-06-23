/**
 * dockEntitlement.ts — Entitlement guard for OBS Browser Dock tabs
 *
 * Every action that depends on plan limits should call `requireEntitlement()`
 * before proceeding. It reads the plan tier and entitlements from the overlay
 * server's /api/auth/status (which includes the full session with limits).
 * Falls back to hardcoded FALLBACK_LIMITS when the overlay server hasn't been
 * seeded yet.
 *
 * The plan tier and entitlements are bridged from the desktop app via
 * the overlay server's auth session.
 */

import {
  checkEntitlementSync,
  type EntitlementResult,
  type FeatureKey,
} from "../services/entitlementClient";
import {
  DEFAULT_PLAN_CONFIG,
  FEATURE_LABELS,
  deriveFeatureRequiredPlan,
} from "../services/planConfigTypes";
import { getUserScopedKey } from "../services/userScopedStorage";

const PLAN_KEY = "ocs-dock-plan";
const ENTITLEMENTS_KEY = "ocs-dock-entitlements";

/**
 * If the user has an active trial, return pro-tier entitlements
 * and plan regardless of what the server sent. Trial = unlimited access.
 */
function resolveTrialUpgrade(
  plan: string,
  entitlements: Record<string, number | boolean> | null,
  trial?: { active?: boolean; endsAt?: string },
): { plan: string; entitlements: Record<string, number | boolean> | null } {
  if (trial?.active && trial?.endsAt && Date.now() < new Date(trial.endsAt).getTime()) {
    const proTier = DEFAULT_PLAN_CONFIG.plans.pro;
    return {
      plan: "pro",
      entitlements: (proTier?.entitlements as unknown as Record<string, number | boolean>) || entitlements,
    };
  }
  return { plan, entitlements };
}

/** Module-level callback set by DockPage to show the upgrade modal. */
let _showUpgrade: ((message: string) => void) | null = null;

/** Cached entitlements from the overlay server (server-provided limits). */
let _serverEntitlements: Record<string, number | boolean> | null = null;

/**
 * Register the upgrade modal trigger. Called once by DockPage on mount.
 */
export function registerUpgradeModal(trigger: (message: string) => void): void {
  _showUpgrade = trigger;
}

/**
 * Read the plan tier bridged from the main app.
 */
function getDockPlan(): string {
  try {
    return localStorage.getItem(getUserScopedKey(PLAN_KEY)) || "free";
  } catch {
    return "free";
  }
}

/**
 * Read cached entitlements from localStorage.
 */
function getStoredEntitlements(): Record<string, number | boolean> | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(ENTITLEMENTS_KEY));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Check entitlement using server-provided limits when available,
 * falling back to the hardcoded FALLBACK_LIMITS.
 */
function checkWithServerLimits(
  feature: FeatureKey,
  plan: string,
  currentCount: number,
): EntitlementResult {
  // If we have server-provided entitlements, use them directly
  const serverLimits = _serverEntitlements || getStoredEntitlements();
  const source = _serverEntitlements ? "server" : getStoredEntitlements() ? "localStorage" : "defaultConfig";

  if (serverLimits) {
    const limit = serverLimits[feature];
    if (limit !== undefined) {
      // Boolean feature
      if (typeof limit === "boolean") {
        const requiredPlan = getRequiredPlan(feature);
        const result: EntitlementResult = {
          allowed: limit,
          limit: limit ? -1 : 0,
          reason: limit ? undefined : `${getFeatureLabel(feature)} requires ${capitalize(requiredPlan)} plan or higher.`,
          requiredPlan: limit ? undefined : requiredPlan,
        };
        console.log("[Dock Entitlements]", { feature, current: currentCount, limit, allowed: limit, source, plan, result });
        return result;
      }
      // Numeric resource feature
      if (typeof limit === "number") {
        const isUnlimited = limit === -1 || limit === Infinity;
        const allowed = isUnlimited || currentCount < limit;
        const remaining = isUnlimited ? -1 : Math.max(0, limit - currentCount);
        const requiredPlan = getRequiredPlan(feature);
        const result: EntitlementResult = {
          allowed,
          limit,
          current: currentCount,
          remaining,
          reason: allowed ? undefined : `${getFeatureLabel(feature)} limit reached (${currentCount}/${limit}). Upgrade to ${capitalize(requiredPlan)} for more.`,
          requiredPlan: allowed ? undefined : requiredPlan,
        };
        console.log("[Dock Entitlements]", { feature, current: currentCount, limit, allowed, source, plan, remaining, result });
        return result;
      }
    }
  }
  // Fall back to the client-side check (uses FALLBACK_LIMITS)
  const result = checkEntitlementSync(feature, plan, currentCount);
  console.log("[Dock Entitlements]", { feature, current: currentCount, limit: result.limit, allowed: result.allowed, source: "fallback", plan, result });
  return result;
}

// ── Feature metadata ─────────────────────────────────────────────────────────

// FEATURE_LABELS imported from planConfigTypes.ts (single source of truth)

// Derive feature→tier mapping from the default config (runtime, not hardcoded).
const _featureRequiredPlan = deriveFeatureRequiredPlan(DEFAULT_PLAN_CONFIG);

function getFeatureLabel(feature: string): string {
  return FEATURE_LABELS[feature] || feature;
}

function getRequiredPlan(feature: string): string {
  return _featureRequiredPlan[feature] || "basic";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Plan refresh from overlay server ─────────────────────────────────────────

/**
 * Poll the overlay server for plan and entitlements updates.
 * Called on a 60-second interval so plan upgrades on the web
 * are reflected in the dock without requiring a page reload.
 */
async function refreshPlanFromOverlayServer(): Promise<void> {
  try {
    const res = await fetch("/api/auth/status", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data.user?.plan) {
        const { plan: effectivePlan, entitlements: effectiveEntitlements } = resolveTrialUpgrade(
          data.user.plan,
          data.user?.entitlements ?? null,
          data.user?.trial,
        );
        const current = getDockPlan();
        if (effectivePlan !== current) {
          localStorage.setItem(getUserScopedKey(PLAN_KEY), effectivePlan);
        }
        // Store server-provided entitlements (upgraded for trial users)
        if (effectiveEntitlements) {
          _serverEntitlements = effectiveEntitlements;
          console.log("[Dock Entitlements] Loaded from /api/auth/status:", { plan: effectivePlan, entitlements: effectiveEntitlements });
          try {
            localStorage.setItem(getUserScopedKey(ENTITLEMENTS_KEY), JSON.stringify(effectiveEntitlements));
          } catch { /* storage full */ }
        }
      }
    }
  } catch {
    // Overlay server not reachable — not critical
  }
}

// Start periodic plan refresh when module loads
let _refreshInterval: ReturnType<typeof setInterval> | null = null;
export function startPlanRefresh(): void {
  if (_refreshInterval) return;
  // Initial fetch
  void refreshPlanFromOverlayServer();
  // Poll every 60 seconds
  _refreshInterval = setInterval(() => {
    void refreshPlanFromOverlayServer();
  }, 60_000);
}

/**
 * Check whether an action is allowed under the current plan.
 *
 * Uses the overlay server's /api/auth/status to get the plan and entitlements.
 * Returns the full EntitlementResult including `remaining` counts.
 *
 * @param feature      - The feature key (e.g. "songs", "images", "tickers")
 * @param currentCount - How many items the user currently has (caller provides this)
 * @returns EntitlementResult — check `.allowed` before proceeding
 */
export async function dockEntitlementGuard(
  feature: FeatureKey,
  currentCount: number = 0,
): Promise<EntitlementResult> {
  const plan = getDockPlan();
  // Use server-provided limits when available
  return checkWithServerLimits(feature, plan, currentCount);
}

/**
 * Convenience: check entitlement and block with upgrade modal if not allowed.
 * Returns true if allowed, false if blocked (modal shown automatically).
 *
 * Usage in action handlers:
 *   if (!(await requireEntitlement("songs", songs.length))) return;
 */
export async function requireEntitlement(
  feature: FeatureKey,
  currentCount: number = 0,
): Promise<boolean> {
  const result = await dockEntitlementGuard(feature, currentCount);
  if (result.allowed) return true;

  const msg = result.reason || "Upgrade to access this feature.";
  _showUpgrade?.(msg);
  return false;
}

/**
 * Show the upgrade modal directly with a custom message.
 * Use this when you need to show an upgrade prompt without going through
 * the standard entitlement check (e.g., per-file-type quota rejection).
 */
export function showUpgradeModal(message: string): void {
  _showUpgrade?.(message);
}
