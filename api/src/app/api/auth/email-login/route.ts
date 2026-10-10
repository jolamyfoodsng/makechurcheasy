import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import * as OTPAuth from "otpauth";
import clientPromise from "@/lib/mongodb";
import { sendEmail, loginCodeEmail } from "@/lib/emailTemplates";
import { rateLimit } from "@/lib/rateLimit";
import { checkVersionGate } from "@/lib/versionGate";
import {
  claimTrialForUserIfEligible,
  getClientTrialEligibility,
} from "@/lib/trialAbuse";

const loginLimiter = rateLimit({ windowMs: 60_000, max: 10 });

function generateLoginCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

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

  const rl = loginLimiter.check(req);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  try {
    const { email, password, deviceId, installationId, fingerprintHash, twoFactorCode } = (await req.json()) as {
      email?: string;
      password?: string;
      deviceId?: string;
      installationId?: string;
      fingerprintHash?: string;
      twoFactorCode?: string;
    };

    if (!email || !password || !deviceId) {
      return NextResponse.json(
        { error: "Email, password, and deviceId are required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const user = await db.collection("users").findOne(
      { email: email.trim().toLowerCase() },
      { collation: { locale: "en", strength: 2 } }
    );
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    if (!user.password) {
      const provider = user.provider || "google";
      return NextResponse.json(
        {
          code: "ACCOUNT_USES_PROVIDER",
          provider,
          error: `This account was created using ${provider === "google" ? "Google Sign-In" : provider}. Please use that method to sign in.`,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // Two-factor authentication check if enabled on account
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!twoFactorCode || typeof twoFactorCode !== "string" || !twoFactorCode.trim()) {
        return NextResponse.json(
          {
            requiresTwoFactor: true,
            email: user.email,
            message: "Please enter your two-factor authentication code.",
          },
          { status: 200, headers: CORS_HEADERS }
        );
      }

      const cleanToken = twoFactorCode.trim();
      const totp = new OTPAuth.TOTP({
        issuer: "MakeChurchEasy",
        label: user.email || "user",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
      });

      const delta = totp.validate({ token: cleanToken, window: 1 });
      let isValid2FA = delta !== null;

      // Check recovery codes if TOTP validation failed
      if (!isValid2FA && Array.isArray(user.twoFactorRecoveryCodes)) {
        const normalized = cleanToken.replace(/[\s-]/g, "").toUpperCase();
        const codeIndex = user.twoFactorRecoveryCodes.findIndex(
          (rc: string) => rc.replace(/[\s-]/g, "").toUpperCase() === normalized
        );
        if (codeIndex !== -1) {
          isValid2FA = true;
          // Consume the used recovery code
          const updatedCodes = [...user.twoFactorRecoveryCodes];
          updatedCodes.splice(codeIndex, 1);
          await db.collection("users").updateOne(
            { _id: user._id },
            { $set: { twoFactorRecoveryCodes: updatedCodes } }
          );
        }
      }

      if (!isValid2FA) {
        return NextResponse.json(
          { error: "Invalid two-factor authentication code. Please try again." },
          { status: 401, headers: CORS_HEADERS }
        );
      }
    }

    // Check if this device is already trusted for this user (exclude soft-deleted)
    const existingDevice = await db.collection("devices").findOne({
      deviceId,
      userId: user._id.toString(),
      status: { $ne: "deleted" },
    });

    if (existingDevice) {
      // Trusted — update lastSeen and reactivate if previously deleted
      await db.collection("devices").updateOne(
        { deviceId },
        { $set: { lastSeen: new Date(), status: "active" }, $unset: { deletedAt: "" } }
      );

      // Legacy trusted devices may predate the trial registry. Bind this
      // desktop and grant the one allowed trial only when it has no trial yet.
      let trustedUser: any = user;
      if ((!user.plan || user.plan === "free") && !user.trialId && !user.trial) {
        try {
          const trialClaim = await claimTrialForUserIfEligible({
            userId: user._id.toString(),
            email: user.email,
            req,
            source: "email_login",
            deviceId,
            deviceFingerprintHash: existingDevice.fingerprintHash,
            installationId: existingDevice.installationId,
          });
          // A trial conflict must not block authentication. The account is
          // still valid; it simply remains on the Free plan without a new
          // trial on this device.
          if (trialClaim.reason === "trial_already_claimed") {
            console.warn("[email-login] Trial already claimed; continuing on Free plan", {
              userId: user._id.toString(),
              matchedSignalTypes: trialClaim.matchedSignalTypes,
            });
          }
          if (trialClaim.trialRecord) {
            trustedUser = await db.collection("users").findOne({ _id: user._id }) || user;
          }
        } catch (trialErr) {
          console.error("[email-login] Failed to auto-provision trial:", trialErr);
        }
      }

      return NextResponse.json(
        {
          trusted: true,
          user: {
            id: trustedUser._id.toString(),
            name: trustedUser.name,
            email: trustedUser.email,
            avatar: trustedUser.avatar || "",
            appId: trustedUser.appId,
            churchName: trustedUser.churchName || "",
            createdAt: trustedUser.createdAt,
            role: trustedUser.role,
            plan: trustedUser.plan || "free",
            trial: trustedUser.trial || null,
            trialEligibility: await getClientTrialEligibility(
              trustedUser._id.toString(),
              Boolean(trustedUser.trial || trustedUser.trialId),
            ),
          },
          deviceId,
          deviceSecret: existingDevice.deviceSecret || null,
        },
        { headers: CORS_HEADERS }
      );
    }

    // Not trusted — send verification code
    const code = generateLoginCode();
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // 1 minute

    await db.collection("loginCodes").updateOne(
      { email: user.email.trim().toLowerCase(), deviceId },
      {
        $set: {
          code,
          userId: user._id.toString(),
          deviceId,
          installationId: typeof installationId === "string" ? installationId : null,
          fingerprintHash: typeof fingerprintHash === "string" ? fingerprintHash : null,
          expiresAt: expiresAt.toISOString(),
          attempts: 0,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Send code via email
    const sent = await sendEmail({
      ...loginCodeEmail(code),
      to: user.email,
    });

    if (!sent) {
      return NextResponse.json(
        { error: "Failed to send verification email. Please try again." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { needsVerification: true, email: user.email },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[email-login] Error:", err);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
