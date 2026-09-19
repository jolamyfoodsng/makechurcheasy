import { getPlanConfig, upsertSubscription } from "./db";
import {
  sendEmail,
  subscriptionCancelledEmail,
} from "./emailTemplates";
import clientPromise from "./mongodb";

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  growth: "Growth",
};

export async function checkAndApplyScheduledDowngrade(userId: string, user: any): Promise<any> {
  const scheduledAt =
    user?.scheduledDowngradeAt ||
    (user?.adminManagedSubscription?.active ? user.adminManagedSubscription.expiresAt : null);
  if (!scheduledAt || (user?.plan || "free") === "free") return user;

  const scheduledMs = new Date(String(scheduledAt)).getTime();
  if (!Number.isFinite(scheduledMs) || scheduledMs > Date.now()) return user;

  const now = new Date().toISOString();
  const planName = PLAN_NAMES[user.plan] || user.plan || "Paid";
  const planConfig = await getPlanConfig();
  const freeCredits = planConfig.plans.free.credits;
  const client = await clientPromise;
  const db = client.db();
  const { ObjectId } = await import("mongodb");

  let objectId: InstanceType<typeof ObjectId>;
  try {
    objectId = new ObjectId(userId);
  } catch {
    return user;
  }

  await db.collection("users").updateOne(
    { _id: objectId },
    {
      $set: {
        plan: "free",
        credits: freeCredits,
        "adminManagedSubscription.active": false,
        "adminManagedSubscription.endedAt": now,
        "adminManagedSubscription.endedBy": "system",
        "adminManagedSubscription.endedReason": "expired",
      },
      $unset: {
        scheduledDowngradeAt: "",
        currentSubscriptionId: "",
        subscriptionExpiresAt: "",
      },
    },
  );

  await upsertSubscription(userId, {
    plan: "free",
    status: "cancelled",
    autoRenew: false,
    cancelledAt: now,
  }).catch(() => {});

  if (user.email) {
    sendEmail(
      subscriptionCancelledEmail({
        userName: user.name || "there",
        userEmail: user.email,
        planName,
        expiresAt: String(scheduledAt),
      }),
    ).catch((err) => console.error("[ScheduledDowngrade] Email failed:", err));
  }

  return {
    ...user,
    plan: "free",
    credits: freeCredits,
    scheduledDowngradeAt: undefined,
    currentSubscriptionId: undefined,
    subscriptionExpiresAt: undefined,
    adminManagedSubscription: {
      ...(user.adminManagedSubscription || {}),
      active: false,
      endedAt: now,
      endedBy: "system",
      endedReason: "expired",
    },
  };
}
