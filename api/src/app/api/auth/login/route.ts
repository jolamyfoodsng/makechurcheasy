import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";
import { signSessionToken } from "@/lib/jwt";
import { setAuthCookieOnResponse } from "@/lib/auth";
import { sendEmail, verificationCodeEmail } from "@/lib/emailTemplates";
import { rateLimit } from "@/lib/rateLimit";

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
    const { email, password } = await req.json();

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

    // Update lastLogin
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date().toISOString() } }
    );

    const response = NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
        appId: user.appId,
        churchName: user.churchName || "",
        country: user.country || "",
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
