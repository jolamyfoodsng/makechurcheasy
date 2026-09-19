/**
 * GET /api/v1/subscription
 *
 * Returns the authenticated user's subscription details.
 *
 * Auth: Bearer API key (mce_live_...)
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, logApiRequest } from "@/lib/apiKeyAuth";
import { getActiveSubscription, getPlanConfig } from "@/lib/db";
import { calculateUserCredits } from "@/lib/credits";

export async function GET(req: NextRequest) {
  let ctx = null;
  try {
    const auth = await authenticateApiKey(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }
    ctx = auth.ctx;

    const { userId, mongoUser } = ctx;

    const subscription = await getActiveSubscription(userId);
    const creditResult = await calculateUserCredits(userId, mongoUser);
    const planTier = creditResult.effectivePlan;

    const planConfig = await getPlanConfig();
    const tierConfig = planConfig.plans[planTier] || planConfig.plans.free;

    return NextResponse.json({
      plan: planTier,
      planLabel: tierConfig.label,
      status: subscription?.status || "free",
      entitlements: tierConfig.entitlements,
      billingCycle: subscription?.billingCycle || null,
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
      autoRenew: subscription?.autoRenew ?? true,
    });
  } catch (error) {
    console.error("GET /api/v1/subscription error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    logApiRequest(ctx, req, 200).catch(() => { });
  }
}
