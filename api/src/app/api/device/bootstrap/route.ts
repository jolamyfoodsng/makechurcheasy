import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { checkVersionGate } from "@/lib/versionGate";
import { getTrialForUser } from "@/lib/trialRecords";
import { calculateUserCredits } from "@/lib/credits";
import { getActiveSubscription, getPlanConfig } from "@/lib/db";
import { getEffectivePlan, type TrialUser } from "@/lib/trial";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import { checkAndExpireAmbassador } from "@/lib/ambassadorExpiration";
import { checkAndApplyScheduledDowngrade } from "@/lib/scheduledDowngrade";
import { getPlatformSettings } from "@/lib/platformSettings";
import { extractDeviceInfo } from "@/lib/deviceInfo";
import { resolveDeviceContext } from "@/lib/deviceRequest";
import { getLocalDevPlanOverride } from "@/lib/localDevPlanOverride";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-MCE-Device-Id, X-Device-Secret, X-App-Version",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const blocked = await checkVersionGate(req);
  if (blocked) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) blocked.headers.set(k, v);
    return blocked;
  }

  try {
    const resolved = await resolveDeviceContext(req, CORS_HEADERS, {
      transientOnDeviceAuthFailure: true,
    });
    if ("error" in resolved) return resolved.error;

    const client = await clientPromise;
    const db = client.db();
    const { ObjectId } = await import("mongodb");
    const { deviceId, userId } = resolved;

    let user: any = await db.collection("users").findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } },
    );
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404, headers: CORS_HEADERS });
    }

    const platformSettings = await getPlatformSettings();
    user = platformSettings.ambassador.autoExpiry
      ? await checkAndExpireAmbassador(userId, user)
      : user;
    user = await checkAndExpireAdminTemporaryPlan(userId, user);
    // Do not depend solely on the nightly cron for a cancelled or expired
    // subscription. The next authenticated desktop refresh must return Free.
    user = await checkAndApplyScheduledDowngrade(userId, user);

    const { appVersion, appPlatform } = extractDeviceInfo(req);
    await db.collection("devices").updateOne(
      { deviceId },
      { $set: { lastSeen: new Date(), appVersion, appPlatform } },
    );

    const trialRecord = await getTrialForUser(userId);
    const trialResponse = trialRecord
      ? {
        active: trialRecord.status === "active" && new Date(trialRecord.endsAt).getTime() > Date.now(),
        status: trialRecord.status,
        startedAt: trialRecord.startedAt,
        endsAt: trialRecord.endsAt,
        durationDays: trialRecord.durationDays,
        extendedDays: trialRecord.extendedDays,
        extensionCount: trialRecord.extensionCount,
        stoppedAt: trialRecord.stoppedAt,
        stoppedReason: trialRecord.stoppedReason,
        restartedAt: trialRecord.restartedAt,
        grantedBy: trialRecord.grantedBy,
        lastModifiedBy: trialRecord.lastModifiedBy,
        welcomeShown: trialRecord.welcomeShown,
      }
      : user.trial || null;

    const userForPlan = { ...user, trial: trialResponse };
    const effectivePlan = getEffectivePlan(userForPlan as TrialUser);
    const localDevPlan = getLocalDevPlanOverride(user._id);
    const displayedPlan = localDevPlan || user.plan || "free";
    const planConfig = await getPlanConfig();
    const entitlements = planConfig.plans[effectivePlan]?.entitlements || planConfig.plans.free.entitlements;
    const credits = await calculateUserCredits(userId, userForPlan);
    const activeSubscription = await getActiveSubscription(userId).catch(() => null);

    return NextResponse.json(
      {
        account: {
          deviceId,
          verifiedAt: new Date().toISOString(),
          user: {
            id: user._id.toString(),
            name: user.name || "",
            email: user.email || "",
            avatar: user.avatar || "",
            appId: user.appId || "",
            churchName: user.churchName || "",
            country: user.country || "",
            createdAt: user.createdAt || "",
            role: user.role || "user",
            // In local development, expose the simulated plan consistently in
            // both plan fields. The stored MongoDB plan remains untouched.
            plan: displayedPlan,
            effectivePlan,
            entitlements,
            trial: trialResponse,
            ambassador: user.ambassador || null,
            adminTemporaryPlan: user.adminTemporaryPlan || null,
            adminManagedSubscription: user.adminManagedSubscription || null,
            subscriptionExpiresAt: user.subscriptionExpiresAt || null,
            purchaseKind: activeSubscription?.purchaseKind || "subscription",
            oneTimeOfferId: activeSubscription?.oneTimeOfferId || null,
            oneTimeOfferName: activeSubscription?.oneTimeOfferName || null,
          },
          credits: {
            remaining: credits.credits,
            totalConsumed: credits.totalConsumed,
            planAllocation: credits.planAllocation,
            adminGranted: credits.adminGranted,
            isAdmin: credits.isAdmin,
            unlimited: credits.unlimited,
          },
        },
      },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("[device/bootstrap] Error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const databaseUnavailable = /Mongo(ServerSelection|Network|Topology|Parse|Compatibility)|TLS|socket disconnected|MONGODB_URI/i.test(message);
    return NextResponse.json(
      { error: databaseUnavailable ? "Database temporarily unavailable. Please retry." : "Failed to bootstrap device" },
      { status: databaseUnavailable ? 503 : 500, headers: CORS_HEADERS },
    );
  }
}
