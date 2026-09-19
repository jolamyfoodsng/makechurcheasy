import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { sendEmail, passwordChangedEmail } from "@/lib/emailTemplates";

const limiter = rateLimit({ windowMs: 60_000, max: 5 });

export async function POST(req: NextRequest) {
  try {
    const rateResult = limiter.check(req);
    if (!rateResult.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { newPassword } = (await req.json()) as { newPassword?: string };

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Authenticate via fb-token cookie
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Hash and update MongoDB password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.collection("users").updateOne(
      { _id: authUser.mongoUser._id },
      { $set: { password: hashedPassword } }
    );

    // Send password-changed confirmation email (fire-and-forget)
    sendEmail(
      passwordChangedEmail({
        userName: authUser.mongoUser.name || "User",
        userEmail: authUser.mongoUser.email,
        changedBy: "manual",
      })
    ).catch(() => { });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[change-password] Error:", err?.message || err);
    return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
  }
}
