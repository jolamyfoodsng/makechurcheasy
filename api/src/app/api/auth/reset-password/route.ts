import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";
import { rateLimit } from "@/lib/rateLimit";
import { sendEmail, passwordChangedEmail } from "@/lib/emailTemplates";

const limiter = rateLimit({ windowMs: 60_000, max: 5 });

export async function POST(req: NextRequest) {
  try {
    const rateResult = limiter.check(req);
    if (!rateResult.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { token, newPassword } = (await req.json()) as { token?: string; newPassword?: string };

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Find and validate token
    const resetDoc = await db.collection("passwordResets").findOne({
      token,
      expiresAt: { $gt: new Date() },
    });

    if (!resetDoc) {
      return NextResponse.json({ error: "This password reset link is invalid or has expired." }, { status: 400 });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user's password in MongoDB
    const result = await db.collection("users").updateOne(
      { email: resetDoc.email },
      { $set: { password: hashedPassword } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete the used token (and any other tokens for this email)
    await db.collection("passwordResets").deleteMany({ email: resetDoc.email });

    // Send password-changed confirmation email (fire-and-forget)
    const user = await db.collection("users").findOne({ email: resetDoc.email });
    if (user) {
      sendEmail(
        passwordChangedEmail({
          userName: user.name || "User",
          userEmail: resetDoc.email,
          changedBy: "reset",
        })
      ).catch(() => { });
    }

    return NextResponse.json({ success: true, message: "Password has been reset" });
  } catch (err: any) {
    console.error("[reset-password] Unexpected error:", err?.message || err);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
