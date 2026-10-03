import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAuthUserFromRequest } from "@/lib/auth";
import { calculateUserCredits } from "@/lib/credits";
import { getActiveSubscription, getPlanConfig } from "@/lib/db";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";
import { checkAndExpireAmbassador } from "@/lib/ambassadorExpiration";
import { extractRequestLocation } from "@/lib/userLocation";
import { getTrialForUser } from "@/lib/trialRecords";
import clientPromise from "@/lib/mongodb";

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

  if (!mongoUser.country || !mongoUser.signupCountry) {
    const location = await extractRequestLocation(req.headers);
    const countryToPersist = mongoUser.country || mongoUser.signupCountry || location.country;
    if (countryToPersist) {
      const client = await clientPromise;
      const setDoc: Record<string, any> = {};
      if (!mongoUser.country) {
        setDoc.country = countryToPersist;
        mongoUser.country = countryToPersist;
      }
      if (!mongoUser.signupCountry) {
        setDoc.signupCountry = countryToPersist;
        mongoUser.signupCountry = countryToPersist;
      }
      if (location.country) {
        setDoc.lastLoginCountry = location.country;
      }
      if (location.city) {
        setDoc.lastLoginCity = location.city;
      }
      if (location.ip) {
        setDoc.lastLoginIp = location.ip;
      }
      await client.db().collection("users").updateOne(
        { _id: mongoUser._id },
        { $set: setDoc },
      );
    }
  }

  const creditsResult = await calculateUserCredits(mongoUser._id.toString(), mongoUser);
  const activeSubscription = await getActiveSubscription(mongoUser._id.toString()).catch(() => null);
  const planConfig = await getPlanConfig();
  const trialRecord = await getTrialForUser(mongoUser._id.toString()).catch(() => null);
  const nowMs = Date.now();
  const trialEndsAtMs = trialRecord?.endsAt ? new Date(trialRecord.endsAt).getTime() : 0;
  const canonicalTrialActive = trialRecord?.status === "active" && Number.isFinite(trialEndsAtMs) && trialEndsAtMs > nowMs;
  const subscriptionEndsAtMs = mongoUser.subscriptionExpiresAt ? new Date(mongoUser.subscriptionExpiresAt).getTime() : 0;
  const hasCurrentPaidSubscription = Boolean(activeSubscription) ||
    (Number.isFinite(subscriptionEndsAtMs) && subscriptionEndsAtMs > nowMs);
  const isGrantActive = (grant: { active?: boolean; expiresAt?: string | null } | null | undefined) => {
    if (!grant?.active) return false;
    if (!grant.expiresAt) return true;
    const expiresAtMs = new Date(grant.expiresAt).getTime();
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  };
  const hasManagedAccess = mongoUser.role === "admin" ||
    Boolean(mongoUser.ambassador?.active) ||
    isGrantActive(mongoUser.adminTemporaryPlan) ||
    isGrantActive(mongoUser.adminManagedSubscription);
  // Older trial-extension flows wrote "growth" into users.plan. Use the
  // canonical trial record to keep those users eligible to upgrade, unless
  // they also have a current paid or managed plan.
  const isTrialAccess = !hasCurrentPaidSubscription && !hasManagedAccess &&
    (creditsResult.effectivePlan === "trial" || canonicalTrialActive);
  const entitlementPlan = creditsResult.effectivePlan === "admin" ? "growth" : creditsResult.effectivePlan;
  const entitlements = planConfig.plans[entitlementPlan]?.entitlements || planConfig.plans.free.entitlements;
  const clientPlan =
    isTrialAccess
      ? "free"
      : creditsResult.effectivePlan === "admin"
        ? "growth"
        : creditsResult.effectivePlan;
  const trial =
    isTrialAccess
      ? {
          ...(mongoUser.trial || {}),
          active: true,
          status: "active",
          startedAt: trialRecord?.startedAt || mongoUser.trial?.startedAt,
          endsAt: trialRecord?.endsAt || mongoUser.trial?.endsAt,
          durationDays: trialRecord?.durationDays || mongoUser.trial?.durationDays,
        }
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
