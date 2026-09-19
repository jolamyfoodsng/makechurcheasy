import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { COLLECTIONS } from "@/lib/db";
import { sendEmail, emailChangeVerificationEmail } from "@/lib/emailTemplates";
import crypto from "crypto";

const COOLDOWN_DAYS = 30;
const TOKEN_EXPIRY_HOURS = 24;

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { newEmail } = await req.json();

    if (!newEmail || typeof newEmail !== "string" || !newEmail.includes("@")) {
      return NextResponse.json({ error: "A valid new email is required" }, { status: 400 });
    }

    const normalizedNewEmail = newEmail.trim().toLowerCase();

    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection("users").findOne({ _id: authUser.mongoUser._id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ── Cooldown check ────────────────────────────────────────────────────
    const now = new Date();
    if (user.nextEmailChangeAt && now < new Date(user.nextEmailChangeAt)) {
      const formatted = new Date(user.nextEmailChangeAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return NextResponse.json(
        {
          error: `For security reasons, email addresses can only be changed once every 30 days. You can change it again on ${formatted}.`,
          cooldown: true,
          nextEmailChangeAt: user.nextEmailChangeAt,
        },
        { status: 429 }
      );
    }

    // ── Same email check ──────────────────────────────────────────────────
    if (user.email === normalizedNewEmail) {
      return NextResponse.json(
        { error: "New email must be different from current email" },
        { status: 400 }
      );
    }

    // ── Already pending check ─────────────────────────────────────────────
    if (user.pendingEmail === normalizedNewEmail && user.emailChangeToken) {
      return NextResponse.json(
        {
          error: "A verification email was already sent to this address. Check your inbox.",
          alreadyPending: true,
          emailChangeTokenExpires: user.emailChangeTokenExpires || null,
        },
        { status: 409 }
      );
    }

    // ── Email taken check ─────────────────────────────────────────────────
    const existing = await db.collection("users").findOne({
      email: normalizedNewEmail,
      _id: { $ne: authUser.mongoUser._id },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This email is already in use by another account" },
        { status: 409 }
      );
    }

    // ── Email reserved check ──────────────────────────────────────────────
    const reserved = await db.collection(COLLECTIONS.RESERVED_EMAILS).findOne({
      email: normalizedNewEmail,
    });
    if (reserved) {
      return NextResponse.json(
        { error: "This email address cannot be used" },
        { status: 409 }
      );
    }

    // ── Generate verification token ───────────────────────────────────────
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    await db.collection("users").updateOne(
      { _id: authUser.mongoUser._id },
      {
        $set: {
          pendingEmail: normalizedNewEmail,
          emailChangeToken: token,
          emailChangeTokenExpires: expiresAt.toISOString(),
        },
      }
    );

    // ── Send verification email ───────────────────────────────────────────
    const emailOptions = emailChangeVerificationEmail(normalizedNewEmail, token);
    await sendEmail(emailOptions);

    // ── Audit log ─────────────────────────────────────────────────────────
    await db.collection("audit_logs").insertOne({
      userId: authUser.mongoUser._id,
      action: "email_change_requested",
      details: {
        oldEmail: user.email,
        newEmail: normalizedNewEmail,
      },
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: "A verification link has been sent to your new email address.",
    });
  } catch (err) {
    console.error("Change email error:", err);
    return NextResponse.json({ error: "Failed to process email change" }, { status: 500 });
  }
}

// GET: Return cooldown status for the current user
export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection("users").findOne(
      { _id: authUser.mongoUser._id },
      { projection: { emailChangedAt: 1, nextEmailChangeAt: 1, pendingEmail: 1, emailChangeTokenExpires: 1 } }
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    const inCooldown = !!(user.nextEmailChangeAt && now < new Date(user.nextEmailChangeAt));

    return NextResponse.json({
      email: user.email,
      emailChangedAt: user.emailChangedAt || null,
      nextEmailChangeAt: user.nextEmailChangeAt || null,
      pendingEmail: user.pendingEmail || null,
      emailChangeTokenExpires: user.emailChangeTokenExpires || null,
      inCooldown,
    });
  } catch (err) {
    console.error("Email cooldown status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
