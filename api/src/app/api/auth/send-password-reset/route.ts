import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import clientPromise from "@/lib/mongodb";
import { sendEmail, passwordResetEmail } from "@/lib/emailTemplates";
import { rateLimit } from "@/lib/rateLimit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheazy.com";
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

const limiter = rateLimit({ windowMs: 60_000, max: 3 });

export async function POST(req: NextRequest) {
  try {
    const rateResult = limiter.check(req);
    if (!rateResult.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { email } = (await req.json()) as { email?: string };

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Find user by email (case-insensitive)
    const user = await db.collection("users").findOne({
      email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true, message: "If that email exists, a reset link has been sent." });
    }

    // Invalidate any existing tokens for this email
    await db.collection("passwordResets").deleteMany({ email: user.email });

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    // Store token in DB
    await db.collection("passwordResets").insertOne({
      email: user.email,
      token,
      expiresAt,
      createdAt: new Date(),
    });

    // Build reset URL and send email
    const resetUrl = `${APP_URL}/auth/action?mode=resetPassword&token=${token}`;
    const emailOpts = passwordResetEmail(resetUrl);
    emailOpts.to = user.email;
    const sent = await sendEmail(emailOpts);

    if (!sent) {
      console.error("[send-password-reset] sendEmail failed for:", user.email);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Password reset email sent" });
  } catch (err: any) {
    console.error("[send-password-reset] Unexpected error:", err?.message || err);
    return NextResponse.json({ error: "Failed to send password reset email" }, { status: 500 });
  }
}
