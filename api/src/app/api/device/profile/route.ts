import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { checkVersionGate } from "@/lib/versionGate";
import { calculateUserCredits } from "@/lib/credits";
import { verifyDeviceSecret } from "@/lib/deviceAuth";
import { checkAndExpireAmbassador } from "@/lib/ambassadorExpiration";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import { getPlatformSettings } from "@/lib/platformSettings";
import { getTrialForUser } from "@/lib/trialRecords";
import { extractDeviceInfo } from "@/lib/deviceInfo";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret",
};

/**
 * Fetch the current user's plan profile for the desktop app.
 * GET /api/device/profile?deviceId=xxx
 *
 * Returns the user's plan, trial status, and credits — the fields
 * that may change on the server and need periodic refresh.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const blocked = await checkVersionGate(req);
  if (blocked) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) blocked.headers.set(k, v);
    return blocked;
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400, headers: CORS_HEADERS });
  }

  // Verify device secret to prevent deviceId enumeration
  const deviceAuth = await verifyDeviceSecret(req, deviceId);
  if ("error" in deviceAuth) return deviceAuth.error;

  try {
    const client = await clientPromise;
    const db = client.db();

    const device = deviceAuth.device;
    const userId = String(device.userId || "");
    if (!userId) {
      return NextResponse.json({ error: "Device not paired" }, { status: 404, headers: CORS_HEADERS });
    }
    const { ObjectId } = await import("mongodb");
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404, headers: CORS_HEADERS });
    }

    // Auto-expire ambassador access if enabled
    const platformSettings = await getPlatformSettings();
    let effectiveUser = platformSettings.ambassador.autoExpiry
      ? await checkAndExpireAmbassador(userId, user as unknown as Record<string, unknown>)
      : user;
    effectiveUser = await checkAndExpireAdminTemporaryPlan(userId, effectiveUser);

    // Update lastSeen
    const { appVersion, appPlatform } = extractDeviceInfo(req);
    await db.collection("devices").updateOne(
      { deviceId },
      { $set: { lastSeen: new Date(), appVersion, appPlatform } }
    );

    // Read trial from trials collection (single source of truth)
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
      : effectiveUser.trial || null;

    return NextResponse.json(
      {
        user: {
          id: String(effectiveUser._id),
          name: effectiveUser.name,
          email: effectiveUser.email,
          avatar: effectiveUser.avatar || "",
          appId: effectiveUser.appId || "",
          churchName: effectiveUser.churchName || "",
          country: effectiveUser.country || "",
          createdAt: effectiveUser.createdAt || "",
          role: effectiveUser.role,
          plan: effectiveUser.plan || "free",
          adminTemporaryPlan: effectiveUser.adminTemporaryPlan || null,
          adminManagedSubscription: effectiveUser.adminManagedSubscription || null,
          subscriptionExpiresAt: effectiveUser.subscriptionExpiresAt || null,
          trial: trialResponse,
          ambassador: effectiveUser.ambassador || null,
          credits: (await calculateUserCredits(userId, effectiveUser)).credits,
        },
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[device/profile] Error:", err);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500, headers: CORS_HEADERS });
  }
}
