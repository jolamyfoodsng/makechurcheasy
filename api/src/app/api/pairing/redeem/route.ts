import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { rateLimit } from "@/lib/rateLimit";
import { checkDeviceLimit } from "@/lib/deviceLimits";
import { resolveEffectivePlan, isInTrialRaw } from "@/lib/trial";
import { getTrialForUser } from "@/lib/trialRecords";
import { extractDeviceInfo } from "@/lib/deviceInfo";
import { checkAndExpireAdminTemporaryPlan } from "@/lib/adminTemporaryPlan";
import { normalizePairingCode } from "@/lib/pairingUtils";
import {
  findMatchingDesktopDevice,
  registerDesktopDeviceForPairing,
} from "@/lib/desktopDeviceRegistration";
import {
  claimTrialForUserIfEligible,
} from "@/lib/trialAbuse";

/**
 * Unauthenticated pairing code redemption.
 *
 * The desktop app calls this after the user enters a code that was
 * generated on the dashboard (which pre-binds it to a userId).
 *
 * POST /api/pairing/redeem
 * Body: { code: string, deviceName?: string, installationId?: string, fingerprintHash?: string }
 *
 * Returns user data + device credentials on success.
 */
const redeemLimiter = rateLimit({ windowMs: 60_000, max: 10 });

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Version, X-Device-Id",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const rl = redeemLimiter.check(req);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  try {
    const {
      code,
      deviceName: clientDeviceName,
      installationId: clientInstallationId,
      fingerprintHash: clientFingerprintHash,
    } = (await req.json()) as {
      code?: string;
      deviceName?: string;
      installationId?: string;
      fingerprintHash?: string;
    };

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Code required" }, { status: 400, headers: CORS_HEADERS });
    }

    const normalizedCode = normalizePairingCode(code);
    if (normalizedCode.length !== 8) {
      return NextResponse.json({ error: "Invalid code format" }, { status: 400, headers: CORS_HEADERS });
    }

    const client = await clientPromise;
    const db = client.db();

    // Match both normalized (ABCD1234) and legacy hyphenated (ABCD-1234) forms
    const codeWithHyphen = `${normalizedCode.slice(0, 4)}-${normalizedCode.slice(4)}`;
    const pairing = await db.collection("pairingCodes").findOne({
      $or: [{ code: normalizedCode }, { code: codeWithHyphen }],
    });

    if (!pairing) {
      return NextResponse.json({ error: "Invalid code" }, { status: 404, headers: CORS_HEADERS });
    }

    if (pairing.used || pairing.redeemed) {
      return NextResponse.json({ error: "Code already used" }, { status: 410, headers: CORS_HEADERS });
    }

    if (new Date(pairing.expiresAt) <= new Date()) {
      await db.collection("pairingCodes").deleteOne({ _id: pairing._id });
      return NextResponse.json({ error: "Code expired" }, { status: 410, headers: CORS_HEADERS });
    }

    if (!pairing.userId) {
      return NextResponse.json(
        { error: "This code was not generated from the dashboard. Please generate a new code from your account settings." },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Look up the user
    let user: any = await db.collection("users").findOne(
      { _id: new ObjectId(pairing.userId) },
      { projection: { password: 0 } },
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404, headers: CORS_HEADERS });
    }
    user = await checkAndExpireAdminTemporaryPlan(user._id.toString(), user);

    // Prefer the identity reported by the current desktop. The pairing code
    // may also contain one from the code-creation flow, so keep that as a
    // backward-compatible fallback.
    const fingerprintHash = typeof clientFingerprintHash === "string" && clientFingerprintHash.trim()
      ? clientFingerprintHash.trim()
      : (typeof pairing.fingerprintHash === "string" ? pairing.fingerprintHash.trim() : null);
    const installationId = typeof clientInstallationId === "string" && clientInstallationId.trim()
      ? clientInstallationId.trim()
      : (typeof pairing.installationId === "string" ? pairing.installationId.trim() : null);

    // Email must be verified before device pairing
    if (user.emailVerified !== true) {
      // Mark as rejected so the dashboard can show the status
      await db.collection("pairingCodes").updateOne(
        { _id: pairing._id },
        { $set: { rejected: true, rejectReason: "email_not_verified" } },
      );
      return NextResponse.json(
        {
          error: "email_not_verified",
          message: "Please verify your email address before pairing a device.",
        },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    // A dashboard-generated code is also a trial-claim entry point. Bind an
    // existing trial to this machine or start the one allowed trial before
    // evaluating the plan/device limit.
    if (!user.plan || user.plan === "free") {
      try {
        const trialClaim = await claimTrialForUserIfEligible({
          userId: user._id.toString(),
          email: user.email,
          req,
          source: "pairing_redeem",
          deviceFingerprintHash: fingerprintHash,
          installationId,
        });
        if (trialClaim.trialRecord) {
          user = await db.collection("users").findOne(
            { _id: user._id },
            { projection: { password: 0 } },
          ) || user;
        } else if (!trialClaim.eligible) {
          console.warn("[pairing/redeem] Trial not granted:", {
            userId: user._id.toString(),
            reason: trialClaim.reason,
            matchedSignalTypes: trialClaim.matchedSignalTypes,
          });
          // Trial eligibility is separate from authentication. If another
          // account already used this device's trial, pair this account on
          // the Free plan instead of blocking its login.
          if (trialClaim.reason === "trial_already_claimed") {
            console.warn("[pairing/redeem] Trial already claimed; continuing on Free plan", {
              userId: user._id.toString(),
              matchedSignalTypes: trialClaim.matchedSignalTypes,
            });
          }
        }
      } catch (trialErr) {
        console.error("[pairing/redeem] Failed to auto-provision trial:", trialErr);
      }
    }

    // Check device limit
    const effectivePlan = resolveEffectivePlan(user as any);
    const isOnTrial = isInTrialRaw(user as any);
    // Only an installation/fingerprint match is an existing device. A new
    // laptop must consume a fresh plan slot instead of taking over the most
    // recently used device record.
    const existingDevice = await findMatchingDesktopDevice(
      db,
      user._id.toString(),
      installationId,
      fingerprintHash,
    );
    const limitResult = await checkDeviceLimit(
      user._id.toString(),
      existingDevice?.deviceId || null,
      effectivePlan,
      isOnTrial,
    );
    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          error: "device_limit_reached",
          message: `Your ${effectivePlan} plan allows ${limitResult.limit} device${limitResult.limit === 1 ? "" : "s"}. You currently have ${limitResult.currentCount}/${limitResult.limit}.`,
          currentCount: limitResult.currentCount,
          limit: limitResult.limit,
        },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    // Mark code as redeemed immediately — prevents reuse
    await db.collection("pairingCodes").updateOne(
      { _id: pairing._id },
      { $set: { redeemed: true, redeemedAt: new Date() } },
    );

    const resolvedDeviceName = clientDeviceName || pairing.deviceName || "MakeChurchEasy";
    const { appVersion, appPlatform } = extractDeviceInfo(req);
    let registeredDevice: { deviceId: string; deviceSecret: string };

    try {
      registeredDevice = await registerDesktopDeviceForPairing({
        db,
        userId: user._id.toString(),
        userObjectId: user._id,
        deviceName: resolvedDeviceName,
        appVersion,
        appPlatform,
        fingerprintHash,
        installationId,
      });
    } catch (deviceErr) {
      console.error("[pairing/redeem] Device creation failed:", deviceErr);
      // Un-redeem so the user can retry
      await db.collection("pairingCodes").updateOne(
        { _id: pairing._id },
        { $set: { redeemed: false }, $unset: { redeemedAt: "" } },
      );
      return NextResponse.json(
        { error: "Failed to register device. Please try again." },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // Do NOT delete the pairing code here — the dashboard polls for it
    // to detect redemption. It will be cleaned up by the poll endpoint.

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
      : (user as any).trial || null;

    // Send device login notification email (fire and forget)
    try {
      const { getPlatformSettings } = await import("@/lib/platformSettings");
      const platformSettings = await getPlatformSettings();
      if (platformSettings.notifications.securityAlerts) {
        const { sendEmail, newDeviceLoginEmail } = await import("@/lib/emailTemplates");
        const osName = clientDeviceName || "Unknown";
        sendEmail(
          newDeviceLoginEmail({
            userName: user.name || "there",
            userEmail: user.email,
            deviceName: resolvedDeviceName,
            deviceOs: osName,
            loginTime: new Date().toLocaleString("en-US", {
              dateStyle: "full",
              timeStyle: "short",
            }),
          }),
        ).catch(() => { });
      }
    } catch { /* email not critical */ }

    return NextResponse.json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
        appId: user.appId || "",
        churchName: user.churchName || "",
        createdAt: user.createdAt || "",
        role: user.role || "user",
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
  } catch (err) {
    console.error("Pairing redeem error:", err);
    return NextResponse.json(
      { error: "Failed to redeem pairing code" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
