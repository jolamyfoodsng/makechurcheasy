import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import clientPromise from "@/lib/mongodb";
import { signSessionToken } from "@/lib/jwt";
import { setAuthCookieOnResponse } from "@/lib/auth";
import { sendEmail, verificationCodeEmail } from "@/lib/emailTemplates";
import { rateLimit } from "@/lib/rateLimit";
import { extractRequestLocation, buildLoginLocationUpdates } from "@/lib/userLocation";

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generateCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

const loginLimiter = rateLimit({ windowMs: 60_000, max: 10 });

export async function POST(req: NextRequest) {
  const rl = loginLimiter.check(req);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { email, password, twoFactorCode } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
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
        { status: 401 }
      );
    }

    if (user.isActive === false) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Migration: user signed up via Firebase, has no password yet
    if (!user.password && user.firebaseUid) {
      return NextResponse.json(
        {
          needsMigration: true,
          email: user.email,
          message: "This account was created with Google Sign-In. Please set a password to continue.",
        },
        { status: 200 }
      );
    }

    // Account created via Google OAuth (no password, no firebaseUid)
    if (!user.password) {
      const provider = user.provider || "google";
      return NextResponse.json(
        {
          code: "ACCOUNT_USES_PROVIDER",
          provider,
          error: `This account was created using ${provider === "google" ? "Google Sign-In" : provider}. Please use that method to sign in.`,
        },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Two-factor authentication check if enabled on account
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!twoFactorCode || typeof twoFactorCode !== "string" || !twoFactorCode.trim()) {
        return NextResponse.json({
          requiresTwoFactor: true,
          email: user.email,
          message: "Please enter your two-factor authentication code.",
        });
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
          { status: 401 }
        );
      }
    }

    // Email not verified — generate new PIN and redirect to verification
    if (!user.emailVerified) {
      const code = generateCode();
      const hashedCode = await bcrypt.hash(code, 12);
      const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $set: {
            emailVerificationCode: hashedCode,
            emailVerificationExpiresAt: expiresAt.toISOString(),
            emailVerificationAttempts: 0,
          },
        }
      );

      // Send verification email (best-effort)
      const emailOpts = verificationCodeEmail(code);
      emailOpts.to = user.email;
      sendEmail(emailOpts).catch((err) =>
        console.error("[login] Failed to send verification email:", err)
      );

      return NextResponse.json({
        emailNotVerified: true,
        email: user.email,
        message: "Your email address has not yet been verified. A new verification code has been sent to your email.",
      });
    }

    // Sign JWT
    const tokenVersion = user.tokenVersion ?? 0;
    const jwt = await signSessionToken(user._id.toString(), tokenVersion);

    // Detect edge location from Cloudflare
    const location = await extractRequestLocation(req.headers);
    const now = new Date().toISOString();
    const { set: loginUpdates, push: loginPush } = buildLoginLocationUpdates(user, location, now);

    const updateDoc: Record<string, any> = { $set: loginUpdates };
    if (loginPush) {
      updateDoc.$push = loginPush;
    }

    await db.collection("users").updateOne(
      { _id: user._id },
      updateDoc
    );

    const activeCountry = user.signupCountry || user.country || location.country || "";

    const response = NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
        appId: user.appId,
        churchName: user.churchName || "",
        country: activeCountry,
        phone: user.phone || "",
        role: user.role || "user",
        plan: user.plan || "free",
        emailVerified: user.emailVerified ?? false,
        onboardingCompleted: user.onboardingCompleted || false,
      },
    });

    return setAuthCookieOnResponse(response, jwt);
  } catch (err) {
    console.error("[login] Error:", err);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}
