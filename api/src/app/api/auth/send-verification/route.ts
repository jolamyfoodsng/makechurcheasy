import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getAuthUserFromRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { sendEmail, verificationCodeEmail } from "@/lib/emailTemplates";
import { rateLimit } from "@/lib/rateLimit";

const limiter = rateLimit({ windowMs: 60_000, max: 1 });
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generateCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function POST(req: NextRequest) {
  const rl = limiter.check(req);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Please wait before requesting a new code." },
      { status: 429 }
    );
  }

  try {
    // Try to identify user from session cookie first
    const authUser = await getAuthUserFromRequest(req);
    let email = authUser?.mongoUser?.email;

    // Fallback: accept email from request body
    if (!email) {
      try {
        const body = await req.json();
        email = body?.email;
      } catch {
        // No body or invalid JSON
      }
    }

    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const client = await clientPromise;
    const db = client.db();

    const user = await db.collection("users").findOne(
      { email: normalizedEmail },
      { collation: { locale: "en", strength: 2 } }
    );

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true, message: "If an account exists with this email, a verification code has been sent." });
    }

    // Already verified
    if (user.emailVerified) {
      return NextResponse.json({ success: true, message: "Email already verified" });
    }

    // Generate 6-digit PIN code
    const code = generateCode();
    const hashedCode = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

    // Store hashed code and expiry on user document
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

    // Send email with PIN code
    const emailOpts = verificationCodeEmail(code);
    emailOpts.to = normalizedEmail;
    const sent = await sendEmail(emailOpts);

    if (!sent) {
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Verification code sent" });
  } catch (err) {
    console.error("[send-verification] Error:", err);
    return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 });
  }
}
