import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import clientPromise from "@/lib/mongodb";
import { signSessionToken } from "@/lib/jwt";
import { setAuthCookieOnResponse } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { sendEmail, passwordChangedEmail } from "@/lib/emailTemplates";

const limiter = rateLimit({ windowMs: 60_000, max: 5 });

export async function POST(req: NextRequest) {
  const rl = limiter.check(req);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { email, password, token } = await req.json();

    if (!email || !password || !token) {
      return NextResponse.json(
        { error: "Email, password, and token are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    // Validate migration token
    const migration = await db.collection("accountMigrations").findOne({
      email: email.trim().toLowerCase(),
      token,
    });

    if (!migration) {
      return NextResponse.json(
        { error: "Invalid or expired migration link" },
        { status: 400 }
      );
    }

    if (new Date(migration.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "Migration link has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Find the user
    const user = await db.collection("users").findOne(
      { email: email.trim().toLowerCase() },
      { collation: { locale: "en", strength: 2 } }
    );

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (user.isActive === false) {
      return NextResponse.json(
        { error: "This account is unavailable. Contact support for help." },
        { status: 403 },
      );
    }

    // Hash the new password and update the user
    const hashedPassword = await bcrypt.hash(password, 12);

    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          password: hashedPassword,
          provider: user.provider === "firebase" ? "credentials" : user.provider,
        },
        $unset: {
          firebaseUid: "",
        },
      }
    );

    // Delete the migration token
    await db.collection("accountMigrations").deleteOne({ _id: migration._id });

    // Sign JWT and set cookie
    const tokenVersion = user.tokenVersion ?? 0;
    const jwt = await signSessionToken(user._id.toString(), tokenVersion);

    // Update lastLogin
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date().toISOString() } }
    );

    const response = NextResponse.json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    });

    // Send password-changed confirmation email (fire-and-forget)
    sendEmail(
      passwordChangedEmail({
        userName: user.name,
        userEmail: user.email,
        changedBy: "migration",
      })
    ).catch(() => { });

    return setAuthCookieOnResponse(response, jwt);
  } catch (err) {
    console.error("[migrate-account] Error:", err);
    return NextResponse.json(
      { error: "Migration failed. Please try again." },
      { status: 500 }
    );
  }
}
