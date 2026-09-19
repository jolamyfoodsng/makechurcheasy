import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { checkVersionGate } from "@/lib/versionGate";
import { checkDeviceLimit } from "@/lib/deviceLimits";
import { resolveEffectivePlan, isInTrialRaw } from "@/lib/trial";
import { getTrialForUser } from "@/lib/trialRecords";
import { extractDeviceInfo } from "@/lib/deviceInfo";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import { normalizePairingCode } from "@/lib/pairingUtils";
import { TRIAL_ALREADY_CLAIMED_MESSAGE } from "@/lib/trialAbuse";
import {
  findMatchingDesktopDevice,
  registerDesktopDeviceForPairing,
} from "@/lib/desktopDeviceRegistration";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Version, X-Device-Id",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  // Block old desktop app versions
  const blocked = await checkVersionGate(req);
  if (blocked) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) blocked.headers.set(k, v);
    return blocked;
  }

  try {
    const rawCode = req.nextUrl.searchParams.get("code");
    if (!rawCode) {
      return NextResponse.json({ error: "Code required" }, { status: 400, headers: CORS_HEADERS });
    }

    const code = normalizePairingCode(rawCode);

    // OS name sent by the desktop app during polling
    const clientOS = req.nextUrl.searchParams.get("os") || "";

    const client = await clientPromise;
    const db = client.db();

    // Match both normalized (ABCD1234) and legacy hyphenated (ABCD-1234) forms
    const codeWithHyphen = `${code.slice(0, 4)}-${code.slice(4)}`;
    const pairing = await db.collection("pairingCodes").findOne({
      $or: [{ code }, { code: codeWithHyphen }],
    });

    // Check redeemed FIRST — desktop manual-code flow sets redeemed: true
    if (pairing?.redeemed) {
      // Device was already created by the redeem endpoint — just clean up and notify dashboard
      await db.collection("pairingCodes").deleteOne({ _id: pairing._id });
      return NextResponse.json({ status: "redeemed" }, { headers: CORS_HEADERS });
    }

    // Check used SECOND — a code can have been rejected earlier then
    // later authorized after the user verified their email.
    if (pairing?.used) {
      // Pairing was authorized — get user data
      let user: any = await db.collection("users").findOne(
        { _id: new ObjectId(pairing.userId) },
        { projection: { password: 0 } }
      );

      // Delete the pairing code
      await db.collection("pairingCodes").deleteOne({ _id: pairing._id });

      if (!user) {
        return NextResponse.json({ status: "error", error: "User not found" }, { headers: CORS_HEADERS });
      }
      user = await checkAndExpireAdminTemporaryPlan(user._id.toString(), user);

      // Check device limit before creating the device (safety net — authorize should have already blocked).
      // Only a matching installation/fingerprint is an existing device.
      const effectivePlan = resolveEffectivePlan(user);
      const isOnTrial = isInTrialRaw(user);
      const existingDevice = await findMatchingDesktopDevice(
        db,
        user._id.toString(),
        pairing.installationId,
        pairing.fingerprintHash,
      );
      const limitResult = await checkDeviceLimit(
        user._id.toString(),
        existingDevice?.deviceId || null,
        effectivePlan,
        isOnTrial,
      );
      if (!limitResult.allowed) {
        return NextResponse.json({
          status: "device_limit_reached",
          currentCount: limitResult.currentCount,
          limit: limitResult.limit,
          plan: effectivePlan,
        }, { headers: CORS_HEADERS });
      }

      const deviceName = clientOS || pairing.deviceName || "MakeChurchEasy";
      const { appVersion, appPlatform } = extractDeviceInfo(req);
      let registeredDevice: { deviceId: string; deviceSecret: string };

      try {
        registeredDevice = await registerDesktopDeviceForPairing({
          db,
          userId: user._id.toString(),
          userObjectId: user._id,
          deviceName,
          appVersion,
          appPlatform,
          fingerprintHash: pairing.fingerprintHash || null,
          installationId: pairing.installationId || null,
        });
      } catch (deviceErr) {
        console.error("[pairing/poll] Device creation failed:", deviceErr);
        return NextResponse.json({ error: "Failed to register device. Please try again." }, { status: 500, headers: CORS_HEADERS });
      }

      // Read trial from trials collection (single source of truth)
      const trialRecord = await getTrialForUser(user._id.toString());
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

      return NextResponse.json({
        status: "authorized",
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          avatar: user.avatar || "",
          appId: user.appId || "",
          churchName: user.churchName || "",
          createdAt: user.createdAt || "",
          plan: user.plan || "free",
          ambassador: user.ambassador || null,
          adminTemporaryPlan: user.adminTemporaryPlan || null,
          adminManagedSubscription: user.adminManagedSubscription || null,
          subscriptionExpiresAt: user.subscriptionExpiresAt || null,
          trial: trialResponse,
        },
        deviceId: registeredDevice.deviceId,
        deviceSecret: registeredDevice.deviceSecret,
      }, { headers: CORS_HEADERS });
    }

    if (pairing?.rejected) {
      if (pairing.rejectReason === "trial_already_claimed") {
        return NextResponse.json({
          status: "error",
          error: "trial_already_claimed",
          message: TRIAL_ALREADY_CLAIMED_MESSAGE,
        }, { headers: CORS_HEADERS });
      }

      // Email not verified — notify desktop app
      let authorizerEmail = "";
      let authorizerName = "";
      if (pairing.userId) {
        const authorizer = await db.collection("users").findOne(
          { _id: new ObjectId(pairing.userId) },
          { projection: { email: 1, name: 1 } }
        );
        authorizerEmail = authorizer?.email || "";
        authorizerName = authorizer?.name || "";
      }
      // Don't delete the pairing code — the user needs it to check
      // verification status via the dashboard "Check Again" button.
      return NextResponse.json({
        status: "verification_required",
        message: "Please verify your email address before authorizing a device.",
        reason: pairing.rejectReason || "email_not_verified",
        email: authorizerEmail,
        name: authorizerName,
      }, { headers: CORS_HEADERS });
    }

    // Check if expired
    const expired = await db.collection("pairingCodes").findOne({
      $or: [{ code }, { code: codeWithHyphen }],
      used: false,
      expiresAt: { $lt: new Date() },
    });
    if (expired) {
      await db.collection("pairingCodes").deleteOne({ _id: expired._id });
      return NextResponse.json({ status: "expired" }, { headers: CORS_HEADERS });
    }

    // Still waiting
    return NextResponse.json({ status: "pending" }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("Pairing poll error:", err);
    return NextResponse.json({ error: "Failed to poll pairing status" }, { status: 500, headers: CORS_HEADERS });
  }
}
