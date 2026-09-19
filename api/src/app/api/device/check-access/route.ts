import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { checkVersionGate } from "@/lib/versionGate";
import { getSubscription } from "@/lib/db";
import { getEffectivePlan, isInTrial, isTrialExpired, type TrialUser } from "@/lib/trial";
import { calculateUserCredits } from "@/lib/credits";
import { verifyDeviceSecret } from "@/lib/deviceAuth";
import { getPlatformSettings } from "@/lib/platformSettings";
import { extractDeviceInfo } from "@/lib/deviceInfo";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import { getLocalDevPlanOverride } from "@/lib/localDevPlanOverride";
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
 * Map of features to their required plan entitlement key and whether
 * they consume credits.
 */
const FEATURE_CONFIG: Record<
  string,
  { entitlementKey: string; requiresCredits: boolean }
> = {
  translation: { entitlementKey: "translation", requiresCredits: true },
  transcriptExport: { entitlementKey: "transcriptExport", requiresCredits: false },
  translationExport: { entitlementKey: "translationExport", requiresCredits: false },
  speechToScripture: { entitlementKey: "speechToScripture", requiresCredits: true },
  aiSummary: { entitlementKey: "aiFeatures", requiresCredits: true },
  sermonNotes: { entitlementKey: "aiFeatures", requiresCredits: true },
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/device/check-access?deviceId=xxx
 *
 * Generalized pre-action access check. The desktop MUST call this before
 * performing any premium action (translation, export, etc.).
 *
 * Body: { feature: string, requiredCredits?: number }
 *
 * The backend is the single source of truth for whether the user is
 * allowed to perform the requested action.
 */
export async function POST(req: NextRequest) {
  const blocked = await checkVersionGate(req);
  if (blocked) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) blocked.headers.set(k, v);
    return blocked;
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json(
      { allowed: false, reason: "device_not_found" },
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

  let body: { feature?: string; requiredCredits?: number } = {};
  try {
    body = (await req.json()) as { feature?: string; requiredCredits?: number };
  } catch {
    // Empty body is fine — feature is required
  }

  const { feature, requiredCredits } = body;
  if (!feature || !(feature in FEATURE_CONFIG)) {
    return NextResponse.json(
      {
        allowed: false,
        reason: "invalid_feature",
        validFeatures: Object.keys(FEATURE_CONFIG),
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const featureConfig = FEATURE_CONFIG[feature];

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
    const localDevPlan = getLocalDevPlanOverride(user._id || device.userId);

    // 3. Update lastSeen
    const { appVersion, appPlatform } = extractDeviceInfo(req);
    await db.collection("devices").updateOne(
      { deviceId },
      { $set: { lastSeen: new Date(), appVersion, appPlatform } }
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
          { allowed: false, reason: "maintenance" },
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

    if (!localDevPlan && subscriptionExpired && (user.plan || "free") !== "free") {
      return NextResponse.json(
        { allowed: false, reason: "subscription_expired" },
        { headers: CORS_HEADERS }
      );
    }

    // 7. Trial status. A paid plan suppresses an older trial record.
    const effectivePlan = getEffectivePlan(user as unknown as TrialUser);
    const trialActive = isInTrial(user as unknown as TrialUser);
    const trialExpired = isTrialExpired(user as unknown as TrialUser);
    const exposeTrial = effectivePlan === "trial";

    if (exposeTrial && trialExpired && (!subscription || subscription.status !== "active")) {
      return NextResponse.json(
        { allowed: false, reason: "trial_expired" },
        { headers: CORS_HEADERS }
      );
    }

    // 8. Feature entitlement
    const planConfig = await import("@/lib/db").then((m) => m.getPlanConfig());
    const tierConfig = planConfig.plans[effectivePlan] || planConfig.plans.free;

    // Check if the feature entitlement is explicitly disabled
    const entitlementValue =
      tierConfig.entitlements[
      featureConfig.entitlementKey as keyof typeof tierConfig.entitlements
      ];
    if (entitlementValue === false) {
      // Find the cheapest plan that has this entitlement enabled
      let requiredPlan = "basic";
      for (const [planName, planCfg] of Object.entries(planConfig.plans)) {
        const ent =
          planCfg.entitlements[
          featureConfig.entitlementKey as keyof typeof planCfg.entitlements
          ];
        if (ent !== false && planName !== "free") {
          requiredPlan = planName;
          break;
        }
      }
      return NextResponse.json(
        { allowed: false, reason: "feature_not_available", requiredPlan },
        { headers: CORS_HEADERS }
      );
    }

    let dailySpeechAllowance: { limitMinutes: number; usedMinutes: number; remainingMinutes: number } | null = null;
    if (feature === "speechToScripture" && effectivePlan === "free" && user.role !== "admin") {
      const transcriptionCost = planConfig.creditCosts.find((cost) => cost.name === "Speech-to-Scripture")?.cost || 1;
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

    // 9. Credits check (if feature requires credits)
    if (featureConfig.requiresCredits) {
      const credits = await calculateUserCredits(user._id.toString(), user);

      // Admin and unlimited plans bypass credit checks
      if (!credits.unlimited && !credits.isAdmin) {
        const available = credits.credits;
        const needed = requiredCredits ?? 1;

        if (available <= 0) {
          return NextResponse.json(
            {
              allowed: false,
              reason: "insufficient_credits",
              credits: available,
              requiredCredits: needed,
            },
            { headers: CORS_HEADERS }
          );
        }

        if (needed > 0 && available < needed) {
          return NextResponse.json(
            {
              allowed: false,
              reason: "insufficient_credits",
              credits: available,
              requiredCredits: needed,
            },
            { headers: CORS_HEADERS }
          );
        }

        return NextResponse.json(
          {
            allowed: true,
            credits: available,
            plan: effectivePlan,
            trialActive: exposeTrial && trialActive,
            trialEndsAt: exposeTrial ? user.trial?.endsAt || null : null,
            dailyLimitMinutes: dailySpeechAllowance?.limitMinutes ?? null,
            dailyUsedMinutes: dailySpeechAllowance?.usedMinutes ?? null,
            dailyRemainingSeconds: dailySpeechAllowance ? Math.floor(dailySpeechAllowance.remainingMinutes * 60) : null,
          },
          { headers: CORS_HEADERS }
        );
      }
    }

    // 10. All checks passed
    return NextResponse.json(
      {
        allowed: true,
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
    console.error("[check-access] Error:", err);
    return NextResponse.json(
      { allowed: false, reason: "server_error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
