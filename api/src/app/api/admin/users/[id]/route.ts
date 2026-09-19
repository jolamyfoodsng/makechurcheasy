import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { calculateUserCredits } from "@/lib/credits";
import { getTrialForUser } from "@/lib/trialRecords";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import { getEffectivePlan } from "@/lib/trial";
import { logAuditEvent } from "@/lib/auditLog";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const { id } = await params;
    const paymentPage = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("paymentsPage") || "1", 10) || 1);
    const paymentPageSize = 50;
    const activityPage = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("activityPage") || "1", 10) || 1);
    const activityPageSize = Math.max(1, Math.min(100, Number.parseInt(req.nextUrl.searchParams.get("activityLimit") || "15", 10) || 15));
    const client = await clientPromise;
    const db = client.db();
    const { ObjectId } = await import("mongodb");

    let objectId: InstanceType<typeof ObjectId>;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    let user: any = await db
      .collection("users")
      .findOne({ _id: objectId }, { projection: { password: 0 } });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    user = await checkAndExpireAdminTemporaryPlan(id, user);

    // Aggregate usage stats from activity_events
    const eventsCol = db.collection("activity_events");
    const activityMatch = {
      $or: [
        { userId: id },
        { userId: objectId },
        { userId: objectId.toString() },
      ],
    };

    const [usageAgg, userUsageDoc, dbTranscriptsCount] = await Promise.all([
      eventsCol
        .aggregate([
          { $match: activityMatch },
          { $group: { _id: "$event", count: { $sum: 1 } } },
        ])
        .toArray(),
      db.collection("user_usage").findOne({ $or: [{ userId: id }, { userId: objectId }] }).catch(() => null),
      db.collection("transcripts").countDocuments({ $or: [{ ownerId: id }, { ownerId: objectId }] }).catch(() => 0),
    ]);

    const eventCounts: Record<string, number> = {};
    for (const doc of usageAgg) {
      eventCounts[doc._id] = doc.count;
    }

    const voiceSessions = (eventCounts["voice_session_started"] || 0) + (eventCounts["voice_session_completed"] || 0);

    const [activity, activityCount, devices, payments, paymentTotals, paymentCount] = await Promise.all([
      eventsCol
        .find(
          activityMatch,
          { projection: { event: 1, properties: 1, timestamp: 1, createdAt: 1 } },
        )
        .sort({ timestamp: -1, createdAt: -1 })
        .skip((activityPage - 1) * activityPageSize)
        .limit(activityPageSize)
        .toArray(),
      eventsCol.countDocuments(activityMatch),
      db
        .collection("devices")
        .find(
          { userId: id, $or: [{ status: "active" }, { status: { $exists: false } }] },
          { projection: { deviceId: 1, deviceName: 1, appVersion: 1, appPlatform: 1, lastSeen: 1, createdAt: 1, status: 1 } },
        )
        .sort({ lastSeen: -1 })
        .toArray(),
      db
        .collection("billing_transactions")
        .find(
          { userId: id },
          { projection: { plan: 1, planName: 1, amount: 1, currency: 1, paymentProvider: 1, providerReference: 1, paystackReference: 1, type: 1, status: 1, paidAt: 1, createdAt: 1 } },
        )
        .sort({ paidAt: -1, createdAt: -1 })
        .skip((paymentPage - 1) * paymentPageSize)
        .limit(paymentPageSize)
        .toArray(),
      db
        .collection("billing_transactions")
        .aggregate([
          { $match: { userId: id, status: "success" } },
          {
            $group: {
              _id: { $toUpper: { $ifNull: ["$currency", "NGN"] } },
              amount: { $sum: { $convert: { input: "$amount", to: "double", onError: 0, onNull: 0 } } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      db.collection("billing_transactions").countDocuments({ userId: id }),
    ]);

    const creditResult = await calculateUserCredits(id, user);
    const effectivePlan = getEffectivePlan(user);
    const subscription = await db
      .collection("subscriptions")
      .findOne({ userId: id }, { sort: { createdAt: -1 } });

    // Read trial from trials collection (single source of truth)
    const trialRecord = await getTrialForUser(id);
    const hasEffectiveTrial = getEffectivePlan(user) === "trial";
    const trialResponse = trialRecord
      ? {
        active:
          hasEffectiveTrial &&
          trialRecord.status === "active" &&
          new Date(trialRecord.endsAt).getTime() > Date.now(),
        status: hasEffectiveTrial ? trialRecord.status : "stopped",
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
      : user.trial
        ? {
          ...user.trial,
          active: hasEffectiveTrial && user.trial.active === true,
          status: hasEffectiveTrial ? user.trial.status : "stopped",
        }
        : null;

    return NextResponse.json({
      id: user._id.toString(),
      name: user.name || "",
      email: user.email || "",
      avatar: user.avatar || "",
      phone: user.phone || "",
      country: user.country || "",
      language: user.language || "",
      city: user.city || "",
      state: user.state || "",
      churchName: user.churchName || "",
      churchRole: user.churchRole || user.roleInChurch || "",
      denomination: user.denomination || "",
      churchSize: user.churchSize || "",
      appVersion: user.appVersion || devices[0]?.appVersion || "",
      appPlatform: user.appPlatform || devices[0]?.appPlatform || "",
      authProvider: user.provider || "credentials",
      emailVerified: Boolean(user.emailVerified),
      twoFactorEnabled: Boolean(user.twoFactorEnabled || user.twoFactorSecret),
      referralCode: user.referralCode || "",
      referredBy: user.referredBy || "",
      lastIp: user.lastIp || user.ipAddress || user.signupIp || user.lastLoginIp || "",
      role: user.role || "user",
      accountStatus: user.isActive === false ? "suspended" : "active",
      credits: creditResult.credits,
      // Keep the admin detail view aligned with actual entitlement when the
      // stored plan has not yet been reconciled by the daily lifecycle job.
      plan: effectivePlan === "trial" ? "free" : effectivePlan,
      signupDate: user.createdAt?.toISOString?.() || user.createdAt || null,
      createdAt: user.createdAt?.toISOString?.() || user.createdAt || null,
      lastLogin: user.lastLogin?.toISOString?.() || user.lastLogin || null,
      lastActive: user.lastActive?.toISOString?.() || user.lastActive || user.lastLogin?.toISOString?.() || user.lastLogin || null,
      appId: user.appId || "",
      trialId: user.trialId || null,
      trial: trialResponse,
      activationMilestones: user.activationMilestones || null,
      ambassador: user.ambassador || null,
      adminTemporaryPlan: user.adminTemporaryPlan || null,
      adminManagedSubscription: user.adminManagedSubscription || null,
      subscriptionExpiresAt: effectivePlan === "free" ? null : (user.subscriptionExpiresAt || null),
      scheduledDowngradeAt: user.scheduledDowngradeAt || null,
      subscription: subscription
        ? {
          plan: subscription.plan || user.plan || "free",
          status: subscription.status || null,
          billingCycle: subscription.billingCycle || null,
          currentPeriodEnd: effectivePlan === "free" ? null : (subscription.currentPeriodEnd || null),
          nextBillingDate: effectivePlan === "free" ? null : (subscription.nextBillingDate || null),
          autoRenew: subscription.autoRenew ?? false,
          adminManaged: subscription.adminManaged || false,
          paymentProvider: subscription.paymentProvider || null,
        }
        : null,
      usage: {
        bibleSearches: (eventCounts["bible_search"] || 0) + (eventCounts["bible_search_version"] || 0),
        songsCreated: Math.max(eventCounts["worship_song_created"] || 0, userUsageDoc?.songs || 0),
        mediaUploaded: Math.max(eventCounts["media_uploaded"] || 0, (userUsageDoc?.images || 0) + (userUsageDoc?.videos || 0)),
        aiHoursUsed: +(voiceSessions * 0.025).toFixed(1),
        transcriptCount: Math.max(
          (eventCounts["transcript_created"] || 0) + (eventCounts["transcript_exported"] || 0),
          dbTranscriptsCount || 0,
        ),
      },
      activity: activity.map((event) => ({
        event: String(event.event || "activity"),
        properties: event.properties && typeof event.properties === "object"
          ? event.properties
          : {},
        timestamp: event.timestamp || event.createdAt || null,
      })),
      activityPage,
      activityPageCount: Math.max(1, Math.ceil(activityCount / activityPageSize)),
      activityCount,
      devices: devices.map((device) => ({
        deviceId: String(device.deviceId || ""),
        deviceName: String(device.deviceName || ""),
        appVersion: String(device.appVersion || ""),
        appPlatform: String(device.appPlatform || ""),
        lastSeen: device.lastSeen || null,
        createdAt: device.createdAt || null,
        status: String(device.status || "active"),
      })),
      payments: payments.map((payment) => ({
        plan: String(payment.planName || payment.plan || payment.type || "Payment"),
        amount: Number(payment.amount) || 0,
        currency: String(payment.currency || "NGN").toUpperCase(),
        provider: String(payment.paymentProvider || "unknown"),
        reference: String(payment.providerReference || payment.paystackReference || ""),
        status: String(payment.status || "unknown"),
        paidAt: payment.paidAt || payment.createdAt || null,
      })),
      paymentTotals: paymentTotals.map((total) => ({
        currency: String(total._id || "NGN"),
        amount: Number(total.amount) || 0,
        count: Number(total.count) || 0,
      })),
      paymentPage,
      paymentPageCount: Math.max(1, Math.ceil(paymentCount / paymentPageSize)),
      paymentCount,
    });
  } catch (error) {
    console.error("Admin get user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const { id } = await params;
    const body = await req.json().catch(() => null) as { action?: unknown } | null;
    const action = body?.action;
    if (action !== "suspend" && action !== "unsuspend") {
      return NextResponse.json({ error: "Unsupported account action" }, { status: 400 });
    }

    const { ObjectId } = await import("mongodb");
    let objectId: InstanceType<typeof ObjectId>;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    const targetUser = await db.collection("users").findOne({ _id: objectId });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (targetUser.role === "admin" && action === "suspend") {
      return NextResponse.json({ error: "Admin users cannot be blocked" }, { status: 400 });
    }

    const isActive = action === "unsuspend";
    await db.collection("users").updateOne(
      { _id: objectId },
      { $set: { isActive, updatedAt: new Date() } },
    );

    await logAuditEvent({
      adminId: authResult.adminUserId,
      action: "account_suspend",
      targetUserId: id,
      details: { suspended: !isActive, source: "admin_user_profile" },
      timestamp: new Date(),
    });

    return NextResponse.json({ accountStatus: isActive ? "active" : "suspended" });
  } catch (error) {
    console.error("Admin update user account status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
