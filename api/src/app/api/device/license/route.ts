import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { checkVersionGate, isBelowMinimum, shouldDeferDesktopUpdate } from "@/lib/versionGate";
import { getEffectivePlan, isInTrial, isTrialExpired, type TrialUser } from "@/lib/trial";
import { getPlatformSettings } from "@/lib/platformSettings";
import { getTrialForUser } from "@/lib/trialRecords";
import { extractDeviceInfo } from "@/lib/deviceInfo";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import { resolveDeviceContext } from "@/lib/deviceRequest";
import { getDeviceLimitForPlan } from "@/lib/deviceLimits";
import { isDeviceLimitExceeded } from "@/lib/deviceLimitPolicy";
import { getDesktopConfig } from "@/lib/configService";
import { getNextAnnouncementForUser } from "@/lib/announcements";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-MCE-Device-Id, X-Device-Secret, X-App-Version, X-MCE-Update-Policy, X-MCE-Skip-Update-Gate",
  "Cache-Control": "no-store",
};

/**
 * Central license verification endpoint for the desktop app.
 * GET /api/device/license?deviceId=xxx
 *
 * Returns a LicensePayload that the desktop's licenseGuard.ts uses to
 * determine whether the app is allowed to run. This is the single
 * source of truth for subscription, trial, account, and payment status.
 *
 * The desktop bootstrap fields are opt-in via ?bootstrap=1 so older desktop
 * releases continue to receive the original { license } response shape.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const includeDesktopBootstrap = req.nextUrl.searchParams.get("bootstrap") === "1";
  try {
    const blocked = await checkVersionGate(req);
    if (blocked) {
      for (const [k, v] of Object.entries(CORS_HEADERS)) blocked.headers.set(k, v);
      return blocked;
    }

    const resolved = await resolveDeviceContext(req, CORS_HEADERS, {
      transientOnDeviceAuthFailure: true,
    });
    if ("error" in resolved) return resolved.error;

    const client = await clientPromise;
    const db = client.db();
    const { ObjectId } = await import("mongodb");

    // 1. Use verified or safely recovered device context
    const { deviceId, userId } = resolved;

    // 2. Fetch user
    let user: any = await db.collection("users").findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404, headers: CORS_HEADERS });
    }
    user = await checkAndExpireAdminTemporaryPlan(userId, user);

    // 3. Update lastSeen
    const { appVersion, appPlatform } = extractDeviceInfo(req);
    await db.collection("devices").updateOne(
      { deviceId },
      { $set: { lastSeen: new Date(), appVersion, appPlatform } }
    );

    // 4. Determine account status
    const accountStatus: "active" | "suspended" =
      user.isActive === false ? "suspended" : "active";

    // 5. Fetch subscription
    const subscription = await db
      .collection("subscriptions")
      .findOne({ userId: user._id.toString() }, { sort: { createdAt: -1 } });

    // 6. Determine subscription status
    let subscriptionStatus: "active" | "cancelled" | "expired" | "none" = "none";
    let subscriptionEndsAt: string | null = null;
    let renewalDate: string | null = null;

    if (subscription) {
      subscriptionEndsAt =
        subscription.status === "past_due"
          ? subscription.gracePeriodEndsAt || subscription.currentPeriodEnd || null
          : subscription.currentPeriodEnd || null;
      renewalDate = subscription.nextBillingDate || null;

      // Handle "active", missing/undefined status, and "trialing" uniformly.
      // Missing status occurs when admin plan route creates/updates a subscription
      // without explicitly setting status (legacy data). Treat as active since
      // admin-granted subscriptions have no billing cycle to expire.
      if (
        subscription.status === "active" ||
        subscription.status === "trialing" ||
        !subscription.status
      ) {
        // Check if active subscription has actually expired
        if (subscription.currentPeriodEnd) {
          const periodEnd = new Date(subscription.currentPeriodEnd).getTime();
          if (periodEnd < Date.now()) {
            subscriptionStatus = "expired";
          } else {
            subscriptionStatus = "active";
          }
        } else {
          subscriptionStatus = "active";
        }
      } else if (subscription.status === "cancelled") {
        subscriptionStatus = "cancelled";
      } else if (subscription.status === "past_due") {
        // Past due keeps access only during the grace period.
        const graceEnd = subscription.gracePeriodEndsAt || subscription.currentPeriodEnd;
        if (graceEnd) {
          const graceEndMs = new Date(graceEnd).getTime();
          subscriptionStatus = graceEndMs >= Date.now() ? "active" : "expired";
        } else {
          subscriptionStatus = "expired";
        }
      }
    }

    // 7. Determine trial status — read from trials collection (single source of truth)
    const trialRecord = await getTrialForUser(user._id.toString());
    const nowMs = Date.now();
    let trialActive = false;
    let trialExpired = false;
    let trialEndsAt: string | null = null;

    if (trialRecord) {
      const endsAtMs = trialRecord.endsAt ? new Date(trialRecord.endsAt).getTime() : 0;
      trialActive = trialRecord.status === "active" && endsAtMs > nowMs;
      trialExpired = trialRecord.status === "expired" || (trialRecord.status === "active" && endsAtMs <= nowMs);
      trialEndsAt = trialRecord.endsAt || null;
    } else {
      // Fallback to legacy embedded trial
      trialActive = isInTrial(user as TrialUser);
      trialExpired = isTrialExpired(user as TrialUser);
      if (user.trial?.endsAt) {
        trialEndsAt = user.trial.endsAt;
      }
    }

    // 8. Determine payment status
    let paymentStatus: "paid" | "expired" | "failed" | "refunded" = "paid";

    if (subscription) {
      // Check latest billing transaction for payment issues
      const latestBilling = await db
        .collection("billing_transactions")
        .findOne(
          { userId: user._id.toString() },
          { sort: { createdAt: -1 } }
        );

      if (latestBilling) {
        if (latestBilling.status === "failed") {
          if (subscription.status === "past_due") {
            const graceEnd = subscription.gracePeriodEndsAt
              ? new Date(subscription.gracePeriodEndsAt).getTime()
              : 0;
            paymentStatus = graceEnd && graceEnd > Date.now() ? "paid" : "failed";
          } else {
            paymentStatus = "paid";
          }
        } else if (latestBilling.status === "refunded") {
          paymentStatus = "refunded";
        } else if (latestBilling.status === "success" || latestBilling.status === "paid") {
          paymentStatus = "paid";
        } else if (latestBilling.status === "expired") {
          paymentStatus = "expired";
        } else {
          // Default to paid if subscription is active
          paymentStatus = subscriptionStatus === "active" ? "paid" : "expired";
        }
      } else {
        // No billing transactions — default to paid if subscription is active
        paymentStatus = subscriptionStatus === "active" ? "paid" : "expired";
      }
    }

    // 9. Paid access takes precedence over any historical trial record.
    const resolvedPlan = getEffectivePlan(user as TrialUser);
    const isTrialPlan = resolvedPlan === "trial";
    const effectivePlan = isTrialPlan ? "growth" : resolvedPlan;
    trialActive = isTrialPlan && trialActive;
    if (!isTrialPlan) {
      trialExpired = false;
      trialEndsAt = null;
    }

    // Free plan users have no payment obligation — override paymentStatus so
    // the desktop licenseGuard doesn't flag them for payment issues.
    const isFreePlan = effectivePlan === "free";
    if (isFreePlan) {
      paymentStatus = "paid";
    }

    // 10. Check platform settings for emergency lock / force upgrade / verification
    let maintenanceMode = false;
    let forceUpgradeRequired = false;
    let forceUpgradeVersion: string | undefined;
    let internetVerificationDays = 14;
    let verificationIntervalHours = 6;

    try {
      const ps = await getPlatformSettings();
      if (ps.appUpdates.emergencyLock || ps.security.maintenanceMode) {
        maintenanceMode = true;
      }
      const minimumVersion = ps.appUpdates.minimumSupportedVersion || "";
      if (
        ps.appUpdates.forceUpdatesEnabled &&
        !shouldDeferDesktopUpdate(req) &&
        appVersion &&
        minimumVersion &&
        isBelowMinimum(appVersion, minimumVersion)
      ) {
        forceUpgradeRequired = true;
        forceUpgradeVersion = minimumVersion;
      }
      internetVerificationDays = ps.security.maxOfflineDays ?? 14;
      verificationIntervalHours = ps.security.verificationIntervalHours ?? 6;
    } catch {
      // If settings unavailable, proceed with defaults
    }

    // 11. Determine lock reason (mirrors licenseGuard.ts evaluateLicense logic)
    // Security/compliance locks apply to ALL users. Payment/subscription/trial
    // locks only apply to paid plan users — free plan users are never locked
    // for these reasons since they have no payment obligation.
    let lockReason: string | null = null;

    // Backend-forced maintenance lock
    if (maintenanceMode) {
      lockReason = "maintenance";
    }
    // Force upgrade
    else if (forceUpgradeRequired) {
      lockReason = "forced_upgrade";
    }
    // Account suspended
    else if (accountStatus === "suspended") {
      lockReason = "account_suspended";
    }
    // Payment/subscription/trial locks — only for paid plan users
    else if (!isFreePlan) {
      if (paymentStatus === "failed" || paymentStatus === "refunded") {
        lockReason = "payment_expired";
      } else if (subscriptionStatus === "cancelled") {
        lockReason = "subscription_expired";
      } else if (subscriptionStatus === "expired") {
        lockReason = "subscription_expired";
      } else if (paymentStatus === "expired" && subscriptionStatus === "active") {
        lockReason = "payment_expired";
      } else if (trialExpired && subscriptionStatus !== "active") {
        lockReason = "trial_expired";
      }
    }

    // 11b. Device count check — use the user's plan entitlement.
    // Registration already uses plan_config; the license check must use the
    // same source so a Growth user is not locked by the global free-tier cap.
    const maxDevices = await getDeviceLimitForPlan(effectivePlan);
    const deviceCount = await db.collection("devices").countDocuments({
      userId: user._id.toString(),
      status: { $ne: "deleted" },
    });
    const tooManyDevices = isDeviceLimitExceeded(deviceCount, maxDevices);

    if (tooManyDevices && !lockReason) {
      lockReason = "too_many_devices";
    }

    // 12. Build LicensePayload
    const now = new Date().toISOString();

    const license = {
      accountStatus,
      subscriptionStatus,
      plan: effectivePlan,
      trialActive,
      trialEndsAt,
      subscriptionEndsAt,
      renewalDate,
      paymentStatus,
      internetVerificationDays,
      verificationIntervalHours,
      lastVerifiedAt: now,
      serverTime: now,
      lockReason,
      tooManyDevices: tooManyDevices || undefined,
      ...(maintenanceMode && { maintenanceMode: true }),
      ...(forceUpgradeRequired && {
        forceUpgradeRequired: true,
        forceUpgradeVersion,
      }),
    };

    // Preserve the legacy response for older desktop releases. New releases
    // explicitly opt into the combined heartbeat payload below.
    if (!includeDesktopBootstrap) {
      return NextResponse.json({ license }, { headers: CORS_HEADERS });
    }

    // The authenticated desktop already calls this endpoint as its heartbeat.
    // Include the public desktop config and the next eligible announcement in
    // the same response so the client does not need separate health, config,
    // announcement, and streaming requests.
    let config = null;
    let announcement = null;
    let nextAvailableAt: string | null | undefined;
    try {
      const [desktopConfig, nextAnnouncement] = await Promise.all([
        getDesktopConfig(),
        getNextAnnouncementForUser(user, "desktop"),
      ]);
      config = desktopConfig;
      announcement = nextAnnouncement.announcement;
      nextAvailableAt = nextAnnouncement.nextAvailableAt;
    } catch (error) {
      console.warn("[device/license] Desktop bootstrap data unavailable:", error);
    }

    return NextResponse.json(
      {
        health: { status: "ok" },
        license,
        config,
        announcement,
        nextAvailableAt: nextAvailableAt ?? null,
      },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const databaseUnavailable = /Mongo(?:ServerSelection|Network|NetworkTimeout|Topology|Parse|Compatibility)|ECONNREFUSED|ETIMEDOUT|TLS|socket disconnected|MONGODB_URI/i.test(message);

    if (databaseUnavailable) {
      console.warn("[device/license] Database temporarily unavailable:", message);
      return NextResponse.json(
        { error: "Database temporarily unavailable. Please retry." },
        {
          status: 503,
          headers: {
            ...CORS_HEADERS,
            "Retry-After": "5",
          },
        },
      );
    }

    console.error("[device/license] Error:", err);
    return NextResponse.json({ error: "Failed to verify license" }, { status: 500, headers: CORS_HEADERS });
  }
}
