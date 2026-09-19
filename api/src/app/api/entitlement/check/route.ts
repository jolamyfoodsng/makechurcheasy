/**
 * POST /api/entitlement/check
 *
 * Server-side entitlement check. Reads the user's plan from the database
 * and checks the requested feature against the plan_config collection.
 *
 * Request body: { feature: string, currentCount?: number }
 * Response:     { allowed, reason?, limit, current?, remaining?, requiredPlan?, plan }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getPlanConfig } from "@/lib/db";
import { resolveEffectivePlan } from "@/lib/trial";

// ── Features not in plan_config but gated by plan tier ───────────────────────
// These boolean features aren't stored in entitlements but require a minimum plan.

const TIER_HIERARCHY = ["free", "trial", "basic", "growth"];
const PURCHASED_PLAN_HIERARCHY = ["free", "basic", "growth"];

const TIER_GATED_FEATURES: Record<string, { minPlan: string; label: string }> = {
  slideshow: { minPlan: "basic", label: "Slideshow" },
};

function tierIndex(tier: string): number {
  const i = TIER_HIERARCHY.indexOf(tier.toLowerCase());
  return i === -1 ? 0 : i;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function findRequiredPlan(
  planConfig: Awaited<ReturnType<typeof getPlanConfig>>,
  feature: string,
  currentCount: number,
): string | undefined {
  for (const tier of PURCHASED_PLAN_HIERARCHY) {
    const tierCfg = planConfig.plans[tier as keyof typeof planConfig.plans];
    const tierLimit = tierCfg?.entitlements?.[feature as keyof typeof tierCfg.entitlements];
    if (typeof tierLimit === "boolean" && tierLimit) return tier;
    if (typeof tierLimit === "number" && (tierLimit === -1 || currentCount < tierLimit)) {
      return tier;
    }
  }
  return undefined;
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { feature, currentCount = 0 } = await req.json();

    if (!feature || typeof feature !== "string") {
      return NextResponse.json({ error: "Missing feature" }, { status: 400 });
    }

    // 1. Get the user's plan from DB
    const { default: clientPromise } = await import("@/lib/mongodb");
    const client = await clientPromise;
    const db = client.db();
    const mongoUser = await db.collection("users").findOne({ firebaseUid: user.decoded.uid });
    if (!mongoUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const rawPlan = (mongoUser.plan as string) || "free";

    // 2. Resolve effective plan (trial → trial tier)
    const effectivePlan = resolveEffectivePlan(mongoUser);

    // 3. Check tier-gated features (not in plan_config entitlements)
    const tierGate = TIER_GATED_FEATURES[feature];
    if (tierGate) {
      const allowed = tierIndex(effectivePlan) >= tierIndex(tierGate.minPlan);
      return NextResponse.json({
        allowed,
        limit: allowed ? -1 : 0,
        reason: allowed ? undefined : `${tierGate.label} requires ${capitalize(tierGate.minPlan)} plan or higher.`,
        requiredPlan: allowed ? undefined : tierGate.minPlan,
        plan: effectivePlan,
      });
    }

    // 4. Look up feature in plan_config from DB
    const planConfig = await getPlanConfig();
    const planTier = planConfig.plans[effectivePlan as keyof typeof planConfig.plans];
    const entitlements = planTier?.entitlements;

    if (!entitlements) {
      return NextResponse.json({
        allowed: false,
        limit: 0,
        reason: `Unknown plan: ${effectivePlan}`,
        plan: effectivePlan,
      });
    }

    const limit = (entitlements as unknown as Record<string, unknown>)[feature];

    // Unknown feature
    if (limit === undefined) {
      return NextResponse.json({
        allowed: false,
        limit: 0,
        reason: `Unknown feature: ${feature}`,
        plan: effectivePlan,
      });
    }

    // Boolean feature
    if (typeof limit === "boolean") {
      const requiredPlan = limit ? undefined : findRequiredPlan(planConfig, feature, currentCount);
      return NextResponse.json({
        allowed: limit,
        limit: limit ? -1 : 0,
        reason: limit ? undefined : `This feature requires a higher plan.`,
        requiredPlan,
        plan: effectivePlan,
      });
    }

    // Numeric resource feature
    if (typeof limit === "number") {
      const isUnlimited = limit === -1 || limit === Infinity;
      const allowed = isUnlimited || currentCount < limit;
      const remaining = isUnlimited ? -1 : Math.max(0, limit - currentCount);

      // Find minimum plan that allows this feature
      let requiredPlan: string | undefined;
      if (!allowed) {
        requiredPlan = findRequiredPlan(planConfig, feature, currentCount);
      }

      return NextResponse.json({
        allowed,
        limit,
        current: currentCount,
        remaining,
        reason: allowed ? undefined : `Limit reached (${currentCount}/${limit}). Upgrade for more.`,
        requiredPlan,
        plan: effectivePlan,
      });
    }

    return NextResponse.json({
      allowed: false,
      limit: 0,
      reason: `Unknown feature type: ${feature}`,
      plan: effectivePlan,
    });
  } catch (err) {
    console.error("[entitlement/check]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
