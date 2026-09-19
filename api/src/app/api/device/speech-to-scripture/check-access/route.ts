import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { checkVersionGate } from "@/lib/versionGate";
import { getSubscription } from "@/lib/db";
import { getEffectivePlan, isInTrial, isTrialExpired, type TrialUser } from "@/lib/trial";
import { calculateUserCredits } from "@/lib/credits";
import { verifyDeviceSecret } from "@/lib/deviceAuth";
import { getPlatformSettings } from "@/lib/platformSettings";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import {
  getFreeSpeechToScriptureLimitMinutes,
  getFreeSpeechToScriptureUsage,
} from "@/lib/speechToScriptureUsage";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret, X-App-Version, X-MCE-Update-Policy, X-MCE-Skip-Update-Gate",
};

/**
 * Pre-session access check for Speech to Scripture.
 * POST /api/device/speech-to-scripture/check-access
 *
 * The backend is the single source of truth for whether the user is
 * allowed to start a transcription session. The desktop MUST NOT call
 * lmDockService.startListening() until this endpoint returns allowed: true.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const blocked = await checkVersionGate(req);
  if (blocked) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) blocked.headers.set(k, v);
    return blocked;
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json(
      { allowed: false, reason: "internet_verification_required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Verify device secret to prevent deviceId enumeration
  const deviceAuth = await verifyDeviceSecret(req, deviceId);
  if ("error" in deviceAuth) {
    const errResp = deviceAuth.error;
    const errBody = await errResp.clone().json().catch(() => ({})) as { error?: string };
    const reason = errBody.error === "Device not found"
      ? "device_not_found"
      : "device_revoked";
    return NextResponse.json(
      { allowed: false, reason },
      { status: errResp.status, headers: CORS_HEADERS }
    );
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    const { ObjectId } = await import("mongodb");

    // 1. Use verified device
    const device = deviceAuth.device;

    // 2. Fetch user
    let user: any = await db.collection("users").findOne(
      { _id: new ObjectId(device.userId as string) },
      { projection: { password: 0 } }
    );
    if (!user) {
      return NextResponse.json(
        { allowed: false, reason: "account_suspended" },
        { status: 404, headers: CORS_HEADERS }
      );
    }
    user = await checkAndExpireAdminTemporaryPlan(device.userId as string, user);

    // 3. Update lastSeen
    await db.collection("devices").updateOne(
      { deviceId },
      { $set: { lastSeen: new Date() } }
    );

    // 4. Account status
    if (user.isActive === false) {
      return NextResponse.json(
        { allowed: false, reason: "account_suspended" },
        { headers: CORS_HEADERS }
      );
    }

    // 5. Check platform settings for emergency lock / maintenance
    try {
      const ps = await getPlatformSettings();
      if (ps.appUpdates.emergencyLock || ps.security.maintenanceMode) {
        return NextResponse.json(
          { allowed: false, reason: "internet_verification_required" },
          { headers: CORS_HEADERS }
        );
      }
    } catch {
      // If settings unavailable, proceed
    }

    // 6. Subscription status
    const subscription = await getSubscription(user._id.toString());

    let subscriptionExpired = false;
    if (subscription) {
      if (subscription.status === "cancelled") {
        subscriptionExpired = true;
      } else if (subscription.status === "active" && subscription.currentPeriodEnd) {
        subscriptionExpired = new Date(subscription.currentPeriodEnd).getTime() < Date.now();
      } else if (subscription.status === "past_due" && subscription.currentPeriodEnd) {
        subscriptionExpired = new Date(subscription.currentPeriodEnd).getTime() < Date.now();
      }
    }

    if (subscriptionExpired && (user.plan || "free") !== "free") {
      return NextResponse.json(
        { allowed: false, reason: "subscription_expired" },
        { headers: CORS_HEADERS }
      );
    }

    // 7. Trial status. A paid plan suppresses an older trial record.
    const effectivePlan = getEffectivePlan(user as TrialUser);
    const trialActive = isInTrial(user as TrialUser);
    const trialExpired = isTrialExpired(user as TrialUser);
    const exposeTrial = effectivePlan === "trial";

    if (exposeTrial && trialExpired && (!subscription || subscription.status !== "active")) {
      return NextResponse.json(
        { allowed: false, reason: "trial_expired" },
        { headers: CORS_HEADERS }
      );
    }

    // 8. Feature entitlement — free users receive a daily allowance; paid
    // tiers are controlled by the plan configuration.
    const planConfig = await import("@/lib/db").then((m) => m.getPlanConfig());
    const tierConfig = planConfig.plans[effectivePlan] || planConfig.plans.free;

    if (tierConfig.entitlements.speechToScripture === false) {
      return NextResponse.json(
        { allowed: false, reason: "feature_not_available", requiredPlan: "basic" },
        { headers: CORS_HEADERS }
      );
    }

    const transcriptionCost = planConfig.creditCosts.find((cost) => cost.name === "Speech-to-Scripture")?.cost || 1;
    let dailySpeechAllowance: { limitMinutes: number; usedMinutes: number; remainingMinutes: number } | null = null;
    if (effectivePlan === "free" && user.role !== "admin") {
      const limitMinutes = getFreeSpeechToScriptureLimitMinutes();
      const usage = await getFreeSpeechToScriptureUsage(db, user._id.toString(), transcriptionCost);
      const remainingMinutes = Math.max(0, limitMinutes - usage.usedMinutes);
      dailySpeechAllowance = { limitMinutes, usedMinutes: usage.usedMinutes, remainingMinutes };
      if (remainingMinutes <= 0) {
        return NextResponse.json(
          {
            allowed: false,
            reason: "daily_speech_limit",
            dailyLimitMinutes: limitMinutes,
            dailyUsedMinutes: usage.usedMinutes,
            dailyRemainingSeconds: 0,
          },
          { headers: CORS_HEADERS },
        );
      }
    }

    // 9. Credits check — admin (-1) is unlimited
    const credits = await calculateUserCredits(user._id.toString(), user);

    if (!credits.unlimited && !credits.isAdmin && credits.credits <= 0) {
      return NextResponse.json(
        {
          allowed: false,
          reason: "insufficient_credits",
          credits: credits.credits,
        },
        { headers: CORS_HEADERS }
      );
    }

    // 10. All checks passed
    return NextResponse.json(
      {
        allowed: true,
        credits: credits.credits,
        plan: effectivePlan,
        trialActive: exposeTrial && trialActive,
        trialEndsAt: exposeTrial ? user.trial?.endsAt || null : null,
        dailyLimitMinutes: dailySpeechAllowance?.limitMinutes ?? null,
        dailyUsedMinutes: dailySpeechAllowance?.usedMinutes ?? null,
        dailyRemainingSeconds: dailySpeechAllowance ? Math.floor(dailySpeechAllowance.remainingMinutes * 60) : null,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[speech-to-scripture/check-access] Error:", err);
    return NextResponse.json(
      { allowed: false, reason: "server_error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
