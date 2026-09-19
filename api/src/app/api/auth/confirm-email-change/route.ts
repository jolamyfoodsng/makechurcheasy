import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { COLLECTIONS } from "@/lib/db";
import {
  sendEmail,
  emailChangeNotificationEmail,
  emailChangeConfirmedEmail,
} from "@/lib/emailTemplates";

const COOLDOWN_DAYS = 30;

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Verification token is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection("users").findOne({ _id: authUser.mongoUser._id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.pendingEmail || !user.emailChangeToken) {
      return NextResponse.json(
        { error: "No pending email change found. Please request a new one." },
        { status: 400 }
      );
    }

    // ── Token validation ──────────────────────────────────────────────────
    if (user.emailChangeToken !== token) {
      return NextResponse.json({ error: "Invalid verification token" }, { status: 400 });
    }

    // ── Token expiry check ────────────────────────────────────────────────
    if (user.emailChangeTokenExpires && new Date(user.emailChangeTokenExpires) < new Date()) {
      return NextResponse.json(
        { error: "Verification token has expired. Please request a new email change." },
        { status: 400 }
      );
    }

    // ── Re-check cooldown (in case time passed since request) ─────────────
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

    // ── Check new email is still available ─────────────────────────────────
    const existing = await db.collection("users").findOne({
      email: user.pendingEmail,
      _id: { $ne: authUser.mongoUser._id },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This email is now in use by another account. Please start over." },
        { status: 409 }
      );
    }

    // ── Check new email is not reserved ───────────────────────────────────
    const reserved = await db.collection(COLLECTIONS.RESERVED_EMAILS).findOne({
      email: user.pendingEmail,
    });
    if (reserved) {
      return NextResponse.json(
        { error: "This email address cannot be used. Please choose a different one." },
        { status: 409 }
      );
    }

    // ── Apply the change ──────────────────────────────────────────────────
    const oldEmail = user.email;
    const newEmail = user.pendingEmail;
    const nextChangeDate = new Date(now);
    nextChangeDate.setDate(nextChangeDate.getDate() + COOLDOWN_DAYS);

    // Reserve the old email permanently
    await db.collection(COLLECTIONS.RESERVED_EMAILS).updateOne(
      { email: oldEmail },
      {
        $setOnInsert: {
          userId: authUser.mongoUser._id.toString(),
          email: oldEmail,
          reservedAt: now.toISOString(),
          reason: "email_change" as const,
        },
      },
      { upsert: true }
    );

    await db.collection("users").updateOne(
      { _id: authUser.mongoUser._id },
      {
        $set: {
          email: newEmail,
          emailChangedAt: now.toISOString(),
          nextEmailChangeAt: nextChangeDate.toISOString(),
        },
        $unset: {
          pendingEmail: "",
          emailChangeToken: "",
          emailChangeTokenExpires: "",
        },
        $push: {
          emailHistory: { email: oldEmail, changedAt: now.toISOString() } as any,
        },
        $inc: { tokenVersion: 1 },
      } as any
    );

    // ── Notify both addresses ─────────────────────────────────────────────
    await sendEmail(emailChangeNotificationEmail(oldEmail, newEmail));
    await sendEmail(emailChangeConfirmedEmail(newEmail));

    // ── Audit log ─────────────────────────────────────────────────────────
    await db.collection("audit_logs").insertOne({
      userId: authUser.mongoUser._id,
      action: "email_change_completed",
      details: {
        oldEmail,
        newEmail,
        nextEmailChangeAt: nextChangeDate.toISOString(),
      },
      ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
      userAgent: req.headers.get("user-agent") || null,
      timestamp: now.toISOString(),
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      message: "Email address has been updated successfully.",
      nextEmailChangeAt: nextChangeDate.toISOString(),
    });
  } catch (err) {
    console.error("Confirm email change error:", err);
    return NextResponse.json({ error: "Failed to confirm email change" }, { status: 500 });
  }
}
