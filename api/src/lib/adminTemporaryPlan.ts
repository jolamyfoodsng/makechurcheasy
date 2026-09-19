import clientPromise from "./mongodb";
import { getPlanConfig, upsertSubscription } from "./db";
import { logAuditEvent } from "./auditLog";
import {
  adminTemporaryPlanEndedEmail,
  sendEmail,
} from "./emailTemplates";
import { checkAndApplyScheduledDowngrade } from "./scheduledDowngrade";
import type { PlanTier } from "@/types/schemas";

export type AdminTemporaryPlanState = {
  active?: boolean;
  plan?: PlanTier;
  previousPlan?: PlanTier;
  returnPlan?: "free";
  grantedBy?: string;
  grantedAt?: string;
  startedAt?: string;
  expiresAt?: string;
  durationDays?: number;
  reason?: string;
  emailSentAt?: string;
  endedAt?: string;
  endedBy?: string;
  endedReason?: "expired" | "ended_by_admin";
  expiredAt?: string;
};

type UserLike = Record<string, any>;

export const VALID_ADMIN_TEMPORARY_PLANS: PlanTier[] = ["free", "basic", "growth"];

export function normalizeAdminPlan(plan: unknown): PlanTier | null {
  const normalized = String(plan || "").trim().toLowerCase();
  if (normalized === "pro") return "growth";
  return (VALID_ADMIN_TEMPORARY_PLANS as string[]).includes(normalized)
    ? (normalized as PlanTier)
    : null;
}

export function formatPlanName(plan: string | null | undefined): string {
  const normalized = String(plan || "free").trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getExpiryMs(tempPlan: AdminTemporaryPlanState | null | undefined): number | null {
  if (!tempPlan?.expiresAt) return null;
  const ms = new Date(tempPlan.expiresAt).getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function sendTemporaryPlanEndedEmail(
  user: UserLike,
  endedPlan: PlanTier,
  reason: "expired" | "ended_by_admin",
): Promise<boolean> {
  const userEmail = String(user.email || "");
  if (!userEmail) return false;

  try {
    return await sendEmail(
      adminTemporaryPlanEndedEmail({
        userName: String(user.name || "there"),
        userEmail,
        endedPlan: formatPlanName(endedPlan),
        reason,
      }),
    );
  } catch (err) {
    console.error("[AdminTemporaryPlan] Failed to send ended email:", err);
    return false;
  }
}

export async function expireAdminTemporaryPlan(
  userId: string,
  user: UserLike,
  reason: "expired" | "ended_by_admin" = "expired",
  endedBy: string = "system",
): Promise<UserLike> {
  const tempPlan = user.adminTemporaryPlan as AdminTemporaryPlanState | null | undefined;
  const endedPlan = normalizeAdminPlan(tempPlan?.plan) || "free";
  const previousPlan = normalizeAdminPlan(tempPlan?.previousPlan) || normalizeAdminPlan(user.plan) || "free";
  const now = new Date().toISOString();
  const planConfig = await getPlanConfig();
  const freeCredits = planConfig.plans.free.credits;

  const { ObjectId } = await import("mongodb");
  const client = await clientPromise;
  const db = client.db();

  await db.collection("users").updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        plan: "free",
        credits: freeCredits,
        "adminTemporaryPlan.active": false,
        "adminTemporaryPlan.returnPlan": "free",
        "adminTemporaryPlan.endedAt": now,
        "adminTemporaryPlan.endedBy": endedBy,
        "adminTemporaryPlan.endedReason": reason,
        ...(reason === "expired" ? { "adminTemporaryPlan.expiredAt": now } : {}),
      },
    },
  );

  await upsertSubscription(userId, {
    plan: "free",
    status: "cancelled",
    autoRenew: false,
  });

  await logAuditEvent({
    adminId: endedBy,
    action: reason === "expired" ? "temporary_plan_expired" : "temporary_plan_revoke",
    targetUserId: userId,
    details: {
      previousPlan,
      temporaryPlan: endedPlan,
      restoredPlan: "free",
      expiresAt: tempPlan?.expiresAt || null,
    },
    timestamp: new Date(),
  });

  const emailSent = await sendTemporaryPlanEndedEmail(user, endedPlan, reason);
  if (emailSent) {
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: { "adminTemporaryPlan.endedEmailSentAt": new Date().toISOString() } },
    );
  }

  return {
    ...user,
    plan: "free",
    credits: freeCredits,
    adminTemporaryPlan: {
      ...(tempPlan || {}),
      active: false,
      returnPlan: "free",
      endedAt: now,
      endedBy,
      endedReason: reason,
      ...(reason === "expired" ? { expiredAt: now } : {}),
    },
  };
}

export async function checkAndExpireAdminTemporaryPlan(
  userId: string,
  user: UserLike,
): Promise<UserLike> {
  user = await checkAndApplyScheduledDowngrade(userId, user);
  const tempPlan = user.adminTemporaryPlan as AdminTemporaryPlanState | null | undefined;
  if (!tempPlan?.active) return user;

  const expiresAtMs = getExpiryMs(tempPlan);
  if (!expiresAtMs || expiresAtMs > Date.now()) return user;

  try {
    return await expireAdminTemporaryPlan(userId, user, "expired", "system");
  } catch (err) {
    console.error("[AdminTemporaryPlan] Failed to expire temporary plan:", err);
    return user;
  }
}

export async function checkAllExpiredAdminTemporaryPlans(): Promise<{
  processed: number;
  expired: number;
  errors: number;
}> {
  const client = await clientPromise;
  const db = client.db();
  const now = new Date().toISOString();
  const expiredUsers = await db
    .collection("users")
    .find({
      "adminTemporaryPlan.active": true,
      "adminTemporaryPlan.expiresAt": { $lte: now },
    })
    .toArray();

  let expired = 0;
  let errors = 0;

  for (const user of expiredUsers) {
    try {
      const result = await expireAdminTemporaryPlan(
        user._id.toString(),
        user as UserLike,
        "expired",
        "system",
      );
      if (!(result.adminTemporaryPlan as AdminTemporaryPlanState | undefined)?.active) {
        expired++;
      }
    } catch {
      errors++;
    }
  }

  return { processed: expiredUsers.length, expired, errors };
}
