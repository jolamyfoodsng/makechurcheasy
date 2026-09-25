import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAuthUserFromRequest } from "@/lib/auth";
import { calculateUserCredits } from "@/lib/credits";
import { getActiveSubscription, getPlanConfig } from "@/lib/db";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";
import { checkAndExpireAmbassador } from "@/lib/ambassadorExpiration";

export async function GET(req: NextRequest) {
  const authUser = await getAuthUserFromRequest(req);

  if (!authUser?.mongoUser?._id) {
    return NextResponse.json({ authenticated: false });
  }

  let mongoUser = await checkAndApplyScheduledDowngrade(
    authUser.mongoUser._id.toString(),
    authUser.mongoUser,
  );
  mongoUser = (await checkAndExpireAmbassador(mongoUser._id.toString(), mongoUser)) as any;
  const creditsResult = await calculateUserCredits(mongoUser._id.toString(), mongoUser);
  const activeSubscription = await getActiveSubscription(mongoUser._id.toString()).catch(() => null);
  const planConfig = await getPlanConfig();
  const entitlementPlan = creditsResult.effectivePlan === "admin" ? "growth" : creditsResult.effectivePlan;
  const entitlements = planConfig.plans[entitlementPlan]?.entitlements || planConfig.plans.free.entitlements;
  const clientPlan =
    creditsResult.effectivePlan === "trial"
      ? "free"
      : creditsResult.effectivePlan === "admin"
        ? "growth"
        : creditsResult.effectivePlan;
  const trial =
    creditsResult.effectivePlan === "trial"
      ? mongoUser.trial || null
      : mongoUser.trial
        ? { ...mongoUser.trial, active: false }
        : null;

  return NextResponse.json({
    authenticated: true,
    user: {
      _id: mongoUser._id?.toString(),
      name: mongoUser.name,
      email: mongoUser.email,
      role: mongoUser.role || "user",
      appId: mongoUser.appId,
      churchName: mongoUser.churchName || "",
      country: mongoUser.country || "",
      phone: mongoUser.phone || "",
      avatar: mongoUser.avatar || "",
      emailVerified: mongoUser.emailVerified === true,
      provider: mongoUser.provider || "email",
      credits: creditsResult.credits,
      planAllocation: creditsResult.planAllocation,
      adminGranted: creditsResult.adminGranted,
      totalConsumed: creditsResult.totalConsumed,
      totalAvailable: creditsResult.totalAvailable,
      plan: clientPlan,
      storedPlan: mongoUser.plan || "free",
      effectivePlan: creditsResult.effectivePlan,
      entitlements,
      adminTemporaryPlan: mongoUser.adminTemporaryPlan || null,
      adminManagedSubscription: mongoUser.adminManagedSubscription || null,
      subscriptionExpiresAt: mongoUser.subscriptionExpiresAt || null,
      ambassador: mongoUser.ambassador || null,
      purchaseKind: activeSubscription?.purchaseKind || "subscription",
      oneTimeOfferId: activeSubscription?.oneTimeOfferId || null,
      oneTimeOfferName: activeSubscription?.oneTimeOfferName || null,
      tokenVersion: mongoUser.tokenVersion ?? 0,
      trial,
      onboardingCompleted: mongoUser.onboardingCompleted || false,
      onboarding: mongoUser.onboarding || null,
      password: !!mongoUser.password,
      language: mongoUser.language || "",
    },
  });
}
