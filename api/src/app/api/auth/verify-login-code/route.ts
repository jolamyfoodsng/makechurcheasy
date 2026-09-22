import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { rateLimit } from "@/lib/rateLimit";
import { checkVersionGate } from "@/lib/versionGate";
import { checkDeviceLimit } from "@/lib/deviceLimits";
import { isInTrialRaw, resolveEffectivePlan } from "@/lib/trial";
import { extractDeviceInfo } from "@/lib/deviceInfo";
import {
  claimTrialForUserIfEligible,
} from "@/lib/trialAbuse";
import { findMatchingDesktopDevice } from "@/lib/desktopDeviceRegistration";

const verifyLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const MAX_ATTEMPTS = 5;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Version, X-Device-Id",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const blocked = await checkVersionGate(req);
  if (blocked) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) blocked.headers.set(k, v);
    return blocked;
  }

  const rl = verifyLimiter.check(req);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  try {
    const { email, code, deviceId, deviceName } = (await req.json()) as {
      email?: string;
      code?: string;
      deviceId?: string;
      deviceName?: string;
    };

    if (!email || !code || !deviceId) {
      return NextResponse.json(
        { error: "Email, code, and deviceId are required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const loginCode = await db.collection("loginCodes").findOne({
      email: email.trim().toLowerCase(),
      deviceId,
    });

    if (!loginCode) {
      return NextResponse.json(
        { error: "No verification code found. Please request a new one." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Check expiry
    if (new Date(loginCode.expiresAt) <= new Date()) {
      await db.collection("loginCodes").deleteOne({ _id: loginCode._id });
      return NextResponse.json(
        { error: "Code expired. Please try logging in again." },
        { status: 410, headers: CORS_HEADERS }
      );
    }

    // Check attempts
    if (loginCode.attempts >= MAX_ATTEMPTS) {
      await db.collection("loginCodes").deleteOne({ _id: loginCode._id });
      return NextResponse.json(
        { error: "Too many failed attempts. Please try logging in again." },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    // Verify code
    if (loginCode.code !== code.trim()) {
      await db.collection("loginCodes").updateOne(
        { _id: loginCode._id },
        { $inc: { attempts: 1 } }
      );
      return NextResponse.json(
        { error: "Invalid code. Please try again." },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // Code valid — check device limit before creating device record
    const { ObjectId } = await import("mongodb");
    let user = await db.collection("users").findOne({ _id: new ObjectId(loginCode.userId) });
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (user.isActive === false) {
      return NextResponse.json(
        { error: "This account is unavailable. Contact support for help." },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    // P0-6: Check if 2FA is enabled — desktop login must respect it
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        {
          error: "two_factor_required",
          message: "Two-factor authentication is enabled. Please verify via the web dashboard.",
        },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Only free users participate in trial claiming. The claim helper also
    // binds an existing trial to this device, which closes the old gap where
    // the first desktop login never recorded its hardware identity.
    if (!user.plan || user.plan === "free") {
      // Require email verification before granting trial
      // Google OAuth users have email pre-verified by Google
      const isGoogleUser = user.provider === "google" || user.provider === "google.com";
      if (user.emailVerified !== true && !isGoogleUser) {
        return NextResponse.json(
          {
            error: "email_not_verified",
            message: "Please verify your email address before using the desktop app.",
          },
          { status: 403, headers: CORS_HEADERS }
        );
      }

      try {
        const trialClaim = await claimTrialForUserIfEligible({
          userId: user._id.toString(),
          email: user.email,
          req,
          source: "verify_login_code",
          deviceId,
          deviceFingerprintHash: loginCode.fingerprintHash,
          installationId: loginCode.installationId,
        });
        if (trialClaim.trialRecord) {
          user = await db.collection("users").findOne({ _id: user._id }) || user;
        } else if (!trialClaim.eligible) {
          console.warn("[verify-login-code] Trial not granted:", {
            userId: user._id.toString(),
            reason: trialClaim.reason,
            matchedSignalTypes: trialClaim.matchedSignalTypes,
          });
          // A trial conflict is an entitlement outcome, not an auth failure.
          // Finish the login and let the account use the Free plan.
          if (trialClaim.reason === "trial_already_claimed") {
            console.warn("[verify-login-code] Trial already claimed; continuing on Free plan", {
              userId: user._id.toString(),
              matchedSignalTypes: trialClaim.matchedSignalTypes,
            });
          }
        }
      } catch (err) {
        console.error("[verify-login-code] Failed to auto-provision trial:", err);
      }
    }

    // Treat a new local deviceId as the same registered device only when its
    // durable installation or hardware fingerprint matches. This preserves a
    // legitimate re-login after local session loss without allowing a new
    // laptop to bypass the account's device cap.
    const matchingDevice = await findMatchingDesktopDevice(
      db,
      loginCode.userId,
      loginCode.installationId,
      loginCode.fingerprintHash,
    );
    const deviceRegisteredById = await db.collection("devices").findOne({
      deviceId,
      userId: loginCode.userId,
      status: { $ne: "deleted" },
    });
    const existingDevice = matchingDevice || deviceRegisteredById;
    const registeredDeviceId = String(existingDevice?.deviceId || deviceId);

    const deviceCheck = await checkDeviceLimit(
      loginCode.userId,
      existingDevice?.deviceId || null,
      resolveEffectivePlan(user as any),
      isInTrialRaw(user as any)
    );
    if (!deviceCheck.allowed) {
      await db.collection("loginCodes").deleteOne({ _id: loginCode._id });
      return NextResponse.json(
        {
          error: "device_limit_reached",
          message: `Your ${user.plan || "free"} plan allows ${deviceCheck.limit} device(s). Upgrade to add more.`,
          currentCount: deviceCheck.currentCount,
          limit: deviceCheck.limit,
        },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Create device record
    const userId = loginCode.userId;
    const { generateDeviceSecret } = await import("@/lib/deviceAuth");
    const deviceSecret = generateDeviceSecret();
    const { appVersion, appPlatform } = extractDeviceInfo(req);

    // Upsert the matching device or create a new device registration.
    await db.collection("devices").updateOne(
      { deviceId: registeredDeviceId },
      {
        $set: {
          userId,
          deviceName: deviceName || existingDevice?.deviceName || "MakeChurchEasy",
          deviceSecret,
          lastSeen: new Date(),
          pairedAt: new Date(),
          loginMethod: "email",
          appVersion,
          appPlatform,
          fingerprintHash: loginCode.fingerprintHash || existingDevice?.fingerprintHash || null,
          installationId: loginCode.installationId || existingDevice?.installationId || null,
          status: "active",
        },
        $unset: { deletedAt: "" },
      },
      { upsert: true }
    );

    // Delete used code
    await db.collection("loginCodes").deleteOne({ _id: loginCode._id });

    // Update last login
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date().toISOString() } }
    );

    return NextResponse.json(
      {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          avatar: user.avatar || "",
          appId: user.appId,
          churchName: user.churchName || "",
          createdAt: user.createdAt,
          role: user.role,
          plan: user.plan || "free",
          trial: user.trial || null,
        },
        deviceId: registeredDeviceId,
        deviceSecret,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[verify-login-code] Error:", err);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
