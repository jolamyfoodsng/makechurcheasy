import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import clientPromise from "@/lib/mongodb";
import { sendEmail, migrationEmail } from "@/lib/emailTemplates";
import { rateLimit } from "@/lib/rateLimit";

const limiter = rateLimit({ windowMs: 60_000, max: 3 });

export async function POST(req: NextRequest) {
  const rl = limiter.check(req);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const user = await db.collection("users").findOne(
      { email: email.trim().toLowerCase() },
      { collation: { locale: "en", strength: 2 } }
    );

    // Always return success to prevent email enumeration
    if (!user || !user.firebaseUid || user.password) {
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a migration link has been sent.",
      });
    }

    // Generate migration token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.collection("accountMigrations").updateOne(
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheazy.com";
    const migrationUrl = `${appUrl}/auth/action?mode=migrateAccount&token=${token}`;

    const sent = await sendEmail({
      ...migrationEmail(migrationUrl),
      to: user.email,
    });

    if (!sent) {
      console.error("[send-migration-link] Failed to send email to", user.email);
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, a migration link has been sent.",
    });
  } catch (err) {
    console.error("[send-migration-link] Error:", err);
    return NextResponse.json(
      { error: "Failed to process request. Please try again." },
      { status: 500 }
    );
  }
}
