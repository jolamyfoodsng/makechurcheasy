/**
 * GET /api/user/entitlements
 *
 * Single Source of Truth for all subscription, plan, billing,
 * credits, usage, and device data across the dashboard.
 *
 * Returns:
 * - plan tier (resolved: active subscription > user doc > free)
 * - trial status
 * - subscription status & billing
 * - credits (dynamically calculated: plan + admin grants − usage)
 * - isAdmin, unlimited flags
 * - entitlements (from plan_config)
 * - usage counts (from user_usage)
 * - effective limits (entitlements merged with usage)
 * - device count
 * - user profile (name, email, churchName, appId)
 *
 * Auth: fb-token cookie (web) OR X-Device-Id header (desktop app).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getActiveSubscription, getUserUsage } from "@/lib/db";
import clientPromise from "@/lib/mongodb";
import { calculateUserCredits } from "@/lib/credits";
import { checkAndExpireAmbassador } from "@/lib/ambassadorExpiration";
import { getPlatformSettings } from "@/lib/platformSettings";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();
    let mongoUser = authUser.mongoUser;

    // Auto-expire ambassador access if enabled
    const platformSettings = await getPlatformSettings();
    if (platformSettings.ambassador.autoExpiry) {
      mongoUser = await checkAndExpireAmbassador(userId, mongoUser);
    }
    mongoUser = await checkAndExpireAdminTemporaryPlan(userId, mongoUser);
    mongoUser = await checkAndApplyScheduledDowngrade(userId, mongoUser);

    // Resolve subscription billing details; plan/limits come from the shared
    // effective-plan resolver inside calculateUserCredits().
    const subscription = await getActiveSubscription(userId);

    // Calculate credits dynamically (admin bypass built-in)
    const creditResult = await calculateUserCredits(userId, mongoUser);

    // Get entitlements from the effective plan (not planTier — use creditResult.effectivePlan for admin handling)
    const { getPlanConfig } = await import("@/lib/db");
    const planConfig = await getPlanConfig();
    const tierConfig = planConfig.plans[creditResult.effectivePlan] || planConfig.plans.free;
    const entitlements = tierConfig.entitlements;

    // Get usage counts
    const usage = await getUserUsage(userId);

    // Get trial info
    const trial = mongoUser.trial || null;
    const trialStartedAt = trial?.startedAt || null;
    const trialEndsAt = trial?.endsAt || null;
    const trialDurationDays = trial?.durationDays || null;
    const now = new Date().toISOString();
    const trialLooksActive =
      (trial?.active ?? false) || (!!(trialStartedAt && trialEndsAt && now <= trialEndsAt));
    const isTrialing = creditResult.effectivePlan === "trial" && trialLooksActive;

    // Device count
    let deviceCount = 0;
    try {
      const client = await clientPromise;
      const db = client.db();
      deviceCount = await db.collection("devices").countDocuments({ userId, status: { $ne: "deleted" } });
    } catch {
      // Non-fatal
    }

    // Ambassador status
    const ambassador = mongoUser.ambassador as Record<string, unknown> | null | undefined;
    const isAmbassador = !!(ambassador?.active);
    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~180 days
    let ambassadorExceedsSixMonths = false;
    if (isAmbassador && ambassador?.grantedAt) {
      const grantedAtMs = new Date(ambassador.grantedAt as string).getTime();
      if (Date.now() - grantedAtMs > SIX_MONTHS_MS) {
        ambassadorExceedsSixMonths = true;
      }
    }
    const ambassadorData = isAmbassador
      ? {
        active: true,
        expiresAt: ambassador!.expiresAt || null,
        grantedAt: ambassador!.grantedAt || null,
        grantedBy: ambassador!.grantedBy || null,
        creditsGranted: ambassador!.creditsGranted || 0,
        badgeText: platformSettings.ambassador.badgeText || "Ambassador",
        exceedsSixMonths: ambassadorExceedsSixMonths,
      }
      : null;

    return NextResponse.json({
      plan: creditResult.effectivePlan,
      trial: {
        active: isTrialing,
        startedAt: trialStartedAt,
        endsAt: trialEndsAt,
        durationDays: trialDurationDays,
      },

      ambassador: ambassadorData,
      adminTemporaryPlan: mongoUser.adminTemporaryPlan || null,
      adminManagedSubscription: mongoUser.adminManagedSubscription || null,
      subscriptionExpiresAt: mongoUser.subscriptionExpiresAt || null,

      status: subscription?.status || "none",
      billingCycle: subscription?.billingCycle || "monthly",
      purchaseKind: subscription?.purchaseKind || "subscription",
      oneTimeOfferId: subscription?.oneTimeOfferId || null,
      oneTimeOfferName: subscription?.oneTimeOfferName || null,
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
      autoRenew: subscription?.autoRenew ?? false,
      cancelledAt: subscription?.cancelledAt || null,
      price: subscription?.price ?? 0,

      // Dynamic credits
      credits: creditResult.credits,
      isAdmin: creditResult.isAdmin,
      unlimited: creditResult.unlimited,

      entitlements,
      usage: usage || {
        songs: 0,
        images: 0,
        videos: 0,
        themes: 0,
        lowerThirds: 0,
        devices: 0,
        bibleVersions: 0,
        lastSyncedAt: null,
      },
      remaining: buildRemaining(entitlements as unknown as Record<string, number | boolean>, usage as unknown as { [key: string]: number } | null),

      deviceCount,

      name: mongoUser.name || null,
      email: mongoUser.email || null,
      churchName: mongoUser.churchName || null,
      appId: mongoUser.appId || null,
    });
  } catch (error) {
    console.error("GET /api/user/entitlements error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Build remaining counts: -1 = unlimited, null = unknown */
function buildRemaining(
  entitlements: Record<string, number | boolean>,
  usage: { [key: string]: number } | null
): Record<string, number | null> {
  const resourceKeys = ["songs", "images", "videos", "themes", "lowerThirds", "devices", "bibleVersions", "multiviewTemplates", "tickerThemes", "themePresets", "cloudStorageGB"];
  const remaining: Record<string, number | null> = {};

  for (const key of resourceKeys) {
    const limit = entitlements[key];
    if (typeof limit !== "number") {
      remaining[key] = null;
      continue;
    }
    if (limit === -1) {
      remaining[key] = -1;
      continue;
    }
    const used = usage?.[key] ?? 0;
    remaining[key] = Math.max(0, limit - used);
  }

  return remaining;
}
