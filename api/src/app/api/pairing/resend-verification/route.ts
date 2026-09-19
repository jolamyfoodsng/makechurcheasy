import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import clientPromise from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { sendEmail, verificationEmail } from "@/lib/emailTemplates";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://makechurcheazy.com";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/pairing/resend-verification
 *
 * Resends the email verification link to the currently authenticated user.
 * Uses a custom crypto token (no Firebase dependency).
 */
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const user = await db
      .collection("users")
      .findOne(
        { _id: authUser.mongoUser._id },
        { projection: { email: 1, emailVerified: 1 } }
      );

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (user.emailVerified === true) {
      return NextResponse.json(
        { success: true, alreadyVerified: true },
        { headers: CORS_HEADERS }
      );
    }

    // Generate custom verification token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.collection("emailVerifications").updateOne(
      { email: user.email.trim().toLowerCase() },
      {
        $set: {
          token,
          expiresAt: expiresAt.toISOString(),
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    const actionUrl = `${APP_URL}/auth/action?mode=verifyEmail&token=${token}`;

    const emailOpts = verificationEmail(actionUrl);
    emailOpts.to = user.email;
    const sent = await sendEmail(emailOpts);

    if (!sent) {
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, message: "Verification email sent" },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[pairing/resend-verification] Error:", err);
    return NextResponse.json(
      { error: "Failed to resend verification email" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
