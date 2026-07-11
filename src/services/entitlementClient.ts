/**
 * entitlementClient.ts — Client for the local entitlement server
 *
 * Every UI action that depends on plan limits should go through this
 * service. It POSTs to the local Vite middleware (or Rust overlay server)
 * which returns { allowed, reason, limit }.
 *
 * Fetches DB-backed plan config from the overlay server (/api/plan-config)
 * so entitlements reflect the actual database state. Falls back to the
 * DEFAULT_PLAN_CONFIG if the overlay server is unreachable.
 *
 * FEATURE_REQUIRED_PLAN is derived at runtime from entitlements — never hardcoded.
 */

import {
  FEATURE_LABELS,
  type PlanTier,
  type EntitlementResult,
  type FeatureKey,
} from "./planConfigTypes";
import { getUserScopedKey } from "./userScopedStorage";
import {
  buildLegacyCompatiblePlanConfig,
  findRequiredPlanForLegacyFeature,
  getLegacyCompatibleEntitlementsForPlan,
  getEffectivePlan as resolveCanonicalPlan,
  normalizePlanId,
} from "../../../shared/subscription/sourceOfTruth";

export type { EntitlementResult, FeatureKey, PlanTier };

const LEGACY_PLAN_CONFIG = buildLegacyCompatiblePlanConfig({
  updatedAt: "2026-07-11T00:00:00.000Z",
});

/**
 * Clear cached derived plan. Call after config refresh.
 */
export function clearEntitlementCache(): void {
  // No-op: desktop gating now reads directly from sourceOfTruth helpers.
}

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Fetch the user's current plan from the local overlay server.
 * The overlay server stores the session in memory (set by Tauri via
 * POST /api/auth/session). Returns the plan tier string.
 */
export async function fetchPlanFromOverlayServer(): Promise<string> {
  try {
    const res = await fetch("/api/auth/status", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data.user?.plan) {
        const effectivePlan = normalizePlanId(
          data.user.effectivePlan || resolveCanonicalPlan(data.user as any)
        );
        try { localStorage.setItem(getUserScopedKey("ocs-dock-plan"), effectivePlan); } catch { }
        return effectivePlan;
      }
    }
  } catch { /* overlay server not reachable */ }
  try { return normalizePlanId(localStorage.getItem(getUserScopedKey("ocs-dock-plan")) || "free"); } catch { return "free"; }
}

/**
 * Check whether a feature action is allowed.
 *
 * Fetches the user's plan from the local overlay server (/api/auth/status),
 * then evaluates the feature against the plan's limits.
 *
 * @param feature      - The feature key (e.g. "songs", "multiview")
 * @param currentCount - Current usage count for resource features (default 0)
 */
export async function checkEntitlement(
  feature: FeatureKey,
  plan?: PlanTier | string,
  currentCount: number = 0,
): Promise<EntitlementResult> {
  const effectivePlan = plan || await fetchPlanFromOverlayServer();
  return checkEntitlementSync(feature, effectivePlan, currentCount);
}

/**
 * Synchronous entitlement check — no server call.
 *
 * @param feature  - The feature key
 * @param plan     - The user's effective plan tier
 * @param currentCount - Current usage count for resource features
 */
export function checkEntitlementSync(
  feature: FeatureKey,
  plan?: PlanTier | string,
  currentCount: number = 0,
): EntitlementResult {
  const planKey = normalizePlanId(plan || "free");
  const entitlements = getLegacyCompatibleEntitlementsForPlan(planKey);
  const limit = entitlements[feature];
  const label = FEATURE_LABELS[feature] || feature;
  const requiredPlan = findRequiredPlanForLegacyFeature(feature);

  // Boolean feature
  if (typeof limit === "boolean") {
    return {
      allowed: limit,
      limit: limit ? -1 : 0,
      reason: limit ? undefined : `${label} requires ${capitalize(requiredPlan)} plan or higher.`,
      requiredPlan: limit ? undefined : requiredPlan,
    };
  }

  // Numeric resource feature
  if (typeof limit === "number") {
    const isUnlimited = limit === -1 || limit === Infinity;
    const allowed = isUnlimited || currentCount < limit;
    const remaining = isUnlimited ? -1 : Math.max(0, limit - currentCount);
    return {
      allowed,
      limit,
      current: currentCount,
      remaining,
      reason: allowed ? undefined : `${label} limit reached (${currentCount}/${limit}). Upgrade to ${capitalize(requiredPlan)} for more.`,
      requiredPlan: allowed ? undefined : requiredPlan,
    };
  }

  // Unknown feature — deny by default
  return {
    allowed: false,
    limit: 0,
    reason: `Unknown feature: ${feature}`,
  };
}

/**
 * Get the full entitlement config as a record of tier → entitlements.
 */
export async function getEntitlementConfig(): Promise<Record<string, Record<string, number | boolean>>> {
  const result: Record<string, Record<string, number | boolean>> = {};
  for (const [tier, tierConfig] of Object.entries(LEGACY_PLAN_CONFIG.plans)) {
    result[tier] = tierConfig.entitlements as unknown as Record<string, number | boolean>;
  }
  return result;
}

// ── Convenience Helpers ──────────────────────────────────────────────────────

/**
 * Get the limit for a specific resource feature.
 * Returns -1 for unlimited, 0 for blocked, or the numeric cap.
 */
export function getFeatureLimit(
  feature: FeatureKey,
  plan?: PlanTier | string,
): number {
  const planKey = normalizePlanId(plan || "free");
  const val = getLegacyCompatibleEntitlementsForPlan(planKey)[feature];
  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val ? -1 : 0;
  return 0;
}

/**
 * Re-export getEffectivePlan for convenience — callers can use this
 * to resolve the plan from a user object before calling checkEntitlement.
 */
export { getEffectivePlan } from "./licenseService";

// ── Internal ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
