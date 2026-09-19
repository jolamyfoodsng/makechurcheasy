/**
 * POST   /api/admin/users/[id]/ambassador — Grant ambassador access
 * PATCH  /api/admin/users/[id]/ambassador — Extend ambassador access
 * DELETE /api/admin/users/[id]/ambassador — Revoke ambassador access
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { logAuditEvent } from "@/lib/auditLog";
import { sendEmail } from "@/lib/emailTemplates";
import { ambassadorWelcomeEmail } from "@/lib/emailTemplates";
import { upsertSubscription, getPlanConfig } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";
import type { PlanTier } from "@/types/schemas";

const DURATION_MS: Record<number, number> = {
  1: 30 * 24 * 60 * 60 * 1000,
  3: 90 * 24 * 60 * 60 * 1000,
  6: 180 * 24 * 60 * 60 * 1000,
  12: 365 * 24 * 60 * 60 * 1000,
};

/**
 * POST — Grant ambassador access to a user.
 * Body: { durationMonths: 1|3|6|12, credits: number, notes?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();
    const { durationMonths, credits, notes } = body as {
      durationMonths?: number;
      credits?: number;
      notes?: string;
    };

    const platformSettings = await getPlatformSettings();
    // Admin grants must still work when the public/self-serve ambassador program is disabled.

    // Use platform default if credits not provided
    const finalCredits = credits ?? platformSettings.ambassador.creditsPerAmbassador;

    // Resolve duration: explicit months > defaultAmbassadorDurationDays > fallback 30 days
    let durationMs: number;
    if (durationMonths && DURATION_MS[durationMonths]) {
      durationMs = DURATION_MS[durationMonths];
    } else if (platformSettings.ambassador.defaultAmbassadorDurationDays > 0) {
      durationMs = platformSettings.ambassador.defaultAmbassadorDurationDays * 24 * 60 * 60 * 1000;
    } else {
      durationMs = DURATION_MS[1]; // 30 days fallback
    }

    if (typeof finalCredits !== "number" || finalCredits <= 0 || !Number.isFinite(finalCredits)) {
      return NextResponse.json(
        { error: "credits must be a positive number" },
        { status: 400 },
      );
    }

    const { ObjectId } = await import("mongodb");
    const client = await clientPromise;
    const db = client.db();

    let objectId: InstanceType<typeof ObjectId>;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const user = await db.collection("users").findOne({ _id: objectId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);
    const previousPlan = (user.plan as PlanTier) || "free";

    // Update user: set ambassador, upgrade plan to growth, add credits
    await db.collection("users").updateOne(
      { _id: objectId },
      {
        $set: {
          plan: "growth",
          credits: finalCredits,
          "ambassador.active": true,
          "ambassador.grantedBy": auth.adminUserId,
          "ambassador.grantedAt": now.toISOString(),
          "ambassador.expiresAt": expiresAt.toISOString(),
          "ambassador.creditsGranted": finalCredits,
          "ambassador.previousPlan": previousPlan,
          "ambassador.notes": notes || "",
        },
      },
    );

    // Sync subscription collection to keep plan consistent
    await upsertSubscription(id, { plan: "growth", status: "active" });

    // Audit log
    await logAuditEvent({
      adminId: auth.adminUserId,
      action: "ambassador_grant",
      targetUserId: id,
      details: {
        durationMonths: durationMonths ?? `defaultAmbassadorDurationDays(${platformSettings.ambassador.defaultAmbassadorDurationDays})`,
        durationMs,
        credits: finalCredits,
        previousPlan,
        expiresAt: expiresAt.toISOString(),
        notes,
      },
      timestamp: now,
    });

    // Send welcome email (fire-and-forget) — respects admin setting
    if (platformSettings.ambassador.sendWelcomeEmail) {
      const userEmail = user.email as string;
      const userName = (user.name as string) || "Church Leader";
      if (userEmail) {
        const emailOpts = ambassadorWelcomeEmail({
          name: userName,
          credits: finalCredits,
          expiresAt: expiresAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        });
        sendEmail({ ...emailOpts, to: userEmail }).catch((err) => {
          console.error("[Ambassador] Failed to send welcome email:", err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      ambassador: {
        active: true,
        grantedBy: auth.adminUserId,
        grantedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        creditsGranted: finalCredits,
        previousPlan,
        notes,
      },
    });
  } catch (error) {
    console.error("Ambassador grant error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH — Extend ambassador access (extend expiry and/or add credits).
 * Body: { durationMonths: 1|3|6|12, credits?: number }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();
    const { durationMonths, credits } = body as {
      durationMonths?: number;
      credits?: number;
    };

    if (!durationMonths || !DURATION_MS[durationMonths]) {
      return NextResponse.json(
        { error: "durationMonths must be 1, 3, 6, or 12" },
        { status: 400 },
      );
    }

    const { ObjectId } = await import("mongodb");
    const client = await clientPromise;
    const db = client.db();

    let objectId: InstanceType<typeof ObjectId>;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const user = await db.collection("users").findOne({ _id: objectId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const ambassador = user.ambassador as Record<string, unknown> | null;
    if (!ambassador?.active) {
      return NextResponse.json(
        { error: "User is not an active ambassador" },
        { status: 400 },
      );
    }

    const durationMs = DURATION_MS[durationMonths];
    const now = new Date();

    // Extend from current expiry if still active, otherwise from now
    const currentExpiry = ambassador.expiresAt
      ? new Date(ambassador.expiresAt as string)
      : now;
    const baseDate = currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
    const newExpiry = new Date(baseDate.getTime() + durationMs);

    const updateFields: Record<string, unknown> = {
      "ambassador.expiresAt": newExpiry.toISOString(),
      "ambassador.active": true,
    };

    if (typeof credits === "number" && credits > 0) {
      const currentCredits = (ambassador.creditsGranted as number) || 0;
      updateFields["ambassador.creditsGranted"] = currentCredits + credits;
    }

    await db.collection("users").updateOne(
      { _id: objectId },
      { $set: updateFields },
    );

    await logAuditEvent({
      adminId: auth.adminUserId,
      action: "ambassador_grant",
      targetUserId: id,
      details: {
        extend: true,
        durationMonths,
        additionalCredits: credits ?? 0,
        newExpiry: newExpiry.toISOString(),
      },
      timestamp: now,
    });

    return NextResponse.json({
      success: true,
      ambassador: {
        active: true,
        expiresAt: newExpiry.toISOString(),
        creditsGranted: (ambassador.creditsGranted as number) + (credits ?? 0),
      },
    });
  } catch (error) {
    console.error("Ambassador extend error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE — Revoke ambassador access and revert to previous plan.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const { ObjectId } = await import("mongodb");
    const client = await clientPromise;
    const db = client.db();

    let objectId: InstanceType<typeof ObjectId>;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const user = await db.collection("users").findOne({ _id: objectId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const ambassador = user.ambassador as Record<string, unknown> | null;
    const previousPlan = ((ambassador?.previousPlan as string) || "free") as PlanTier;

    // When reverting to free, reset credits to free plan allocation
    const updateFields: Record<string, unknown> = {
      plan: previousPlan,
    };
    let credits = user.credits as number;
    if (previousPlan === "free") {
      const planConfig = await getPlanConfig();
      credits = planConfig.plans.free.credits;
      updateFields.credits = credits;
    }

    await db.collection("users").updateOne(
      { _id: objectId },
      {
        $set: updateFields,
        $unset: { ambassador: "" },
      },
    );

    // Sync subscription collection to keep plan consistent
    const revokeStatus = previousPlan === "free" ? "cancelled" : "active";
    await upsertSubscription(id, { plan: previousPlan, status: revokeStatus });

    await logAuditEvent({
      adminId: auth.adminUserId,
      action: "ambassador_revoke",
      targetUserId: id,
      details: { revertedPlan: previousPlan },
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      revertedPlan: previousPlan,
      credits,
    });
  } catch (error) {
    console.error("Ambassador revoke error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
