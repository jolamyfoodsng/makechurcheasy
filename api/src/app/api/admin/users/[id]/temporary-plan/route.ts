/**
 * POST   /api/admin/users/[id]/temporary-plan
 * DELETE /api/admin/users/[id]/temporary-plan
 *
 * Admin-only timed plan override. The selected plan is active until expiresAt,
 * then the account returns to Free automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { getPlanConfig, upsertSubscription } from "@/lib/db";
import { logAuditEvent } from "@/lib/auditLog";
import {
  adminTemporaryPlanGrantedEmail,
  sendEmail,
} from "@/lib/emailTemplates";
import {
  expireAdminTemporaryPlan,
  formatPlanName,
  normalizeAdminPlan,
  VALID_ADMIN_TEMPORARY_PLANS,
} from "@/lib/adminTemporaryPlan";
import type { PlanTier } from "@/types/schemas";

function resolveExpiry(body: { durationDays?: unknown; expiresAt?: unknown }): {
  expiresAt: string;
  durationDays: number;
} | { error: string } {
  if (body.expiresAt) {
    const expiresAt = new Date(String(body.expiresAt));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return { error: "expiresAt must be a valid future date" };
    }
    const durationDays = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return { expiresAt: expiresAt.toISOString(), durationDays };
  }

  const durationDays = Number(body.durationDays ?? 30);
  if (!Number.isInteger(durationDays) || durationDays <= 0 || durationDays > 3650) {
    return { error: "durationDays must be a whole number between 1 and 3650" };
  }
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  return { expiresAt: expiresAt.toISOString(), durationDays };
}

async function getUserById(id: string) {
  const { ObjectId } = await import("mongodb");
  let objectId: InstanceType<typeof ObjectId>;
  try {
    objectId = new ObjectId(id);
  } catch {
    return { error: NextResponse.json({ error: "Invalid user ID" }, { status: 400 }) };
  }

  const client = await clientPromise;
  const db = client.db();
  const user = await db.collection("users").findOne({ _id: objectId });
  if (!user) {
    return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }

  return { client, db, objectId, user };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      plan?: unknown;
      durationDays?: unknown;
      expiresAt?: unknown;
      reason?: unknown;
    };
    const plan = normalizeAdminPlan(body.plan);
    if (!plan) {
      return NextResponse.json(
        { error: `plan must be one of: ${VALID_ADMIN_TEMPORARY_PLANS.join(", ")}` },
        { status: 400 },
      );
    }

    const expiry = resolveExpiry(body);
    if ("error" in expiry) {
      return NextResponse.json({ error: expiry.error }, { status: 400 });
    }

    const loaded = await getUserById(id);
    if ("error" in loaded) return loaded.error;
    const { db, objectId, user } = loaded;

    const now = new Date().toISOString();
    const previousPlan = (user.plan as PlanTier) || "free";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    const planConfig = await getPlanConfig();
    const updateFields: Record<string, unknown> = {
      plan,
      "adminTemporaryPlan.active": true,
      "adminTemporaryPlan.plan": plan,
      "adminTemporaryPlan.previousPlan": previousPlan,
      "adminTemporaryPlan.returnPlan": "free",
      "adminTemporaryPlan.grantedBy": auth.adminUserId,
      "adminTemporaryPlan.grantedAt": now,
      "adminTemporaryPlan.startedAt": now,
      "adminTemporaryPlan.expiresAt": expiry.expiresAt,
      "adminTemporaryPlan.durationDays": expiry.durationDays,
      "adminTemporaryPlan.reason": reason,
      "adminTemporaryPlan.endedAt": null,
      "adminTemporaryPlan.endedBy": null,
      "adminTemporaryPlan.endedReason": null,
      "adminTemporaryPlan.expiredAt": null,
    };

    let credits = user.credits as number | undefined;
    if (plan === "free") {
      credits = planConfig.plans.free.credits;
      updateFields.credits = credits;
    }

    await db.collection("users").updateOne(
      { _id: objectId },
      { $set: updateFields },
    );

    const subscriptionUpdate: Record<string, unknown> = {
      plan,
      autoRenew: false,
    };
    if (plan === "free") {
      subscriptionUpdate.status = "cancelled";
    } else {
      subscriptionUpdate.status = "active";
      subscriptionUpdate.currentPeriodEnd = expiry.expiresAt;
    }
    await upsertSubscription(id, subscriptionUpdate as any);

    await logAuditEvent({
      adminId: auth.adminUserId,
      action: "temporary_plan_grant",
      targetUserId: id,
      details: {
        previousPlan,
        newPlan: plan,
        returnPlan: "free",
        expiresAt: expiry.expiresAt,
        durationDays: expiry.durationDays,
        reason,
      },
      timestamp: new Date(),
    });

    let emailSent = false;
    if (user.email) {
      emailSent = await sendEmail(
        adminTemporaryPlanGrantedEmail({
          userName: user.name || "there",
          userEmail: user.email,
          previousPlan: formatPlanName(previousPlan),
          newPlan: formatPlanName(plan),
          expiresAt: expiry.expiresAt,
          reason,
        }),
      ).catch((err) => {
        console.error("[AdminTemporaryPlan] Failed to send granted email:", err);
        return false;
      });
      if (emailSent) {
        await db.collection("users").updateOne(
          { _id: objectId },
          { $set: { "adminTemporaryPlan.emailSentAt": new Date().toISOString() } },
        );
      }
    }

    return NextResponse.json({
      success: true,
      previousPlan,
      plan,
      credits,
      emailSent,
      adminTemporaryPlan: {
        active: true,
        plan,
        previousPlan,
        returnPlan: "free",
        grantedBy: auth.adminUserId,
        grantedAt: now,
        startedAt: now,
        expiresAt: expiry.expiresAt,
        durationDays: expiry.durationDays,
        reason,
        ...(emailSent ? { emailSentAt: new Date().toISOString() } : {}),
      },
    });
  } catch (error) {
    console.error("Temporary plan grant error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const loaded = await getUserById(id);
    if ("error" in loaded) return loaded.error;
    const { user } = loaded;

    if (!user.adminTemporaryPlan?.active) {
      return NextResponse.json(
        { error: "User does not have an active temporary plan" },
        { status: 400 },
      );
    }

    const updatedUser = await expireAdminTemporaryPlan(
      id,
      user as Record<string, unknown>,
      "ended_by_admin",
      auth.adminUserId,
    );

    return NextResponse.json({
      success: true,
      plan: "free",
      credits: updatedUser.credits,
      adminTemporaryPlan: updatedUser.adminTemporaryPlan,
    });
  } catch (error) {
    console.error("Temporary plan revoke error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
