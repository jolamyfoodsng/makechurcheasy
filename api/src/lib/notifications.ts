/**
 * notifications.ts — Helper to create in-app notifications.
 *
 * Used by webhook handlers, cron jobs, and API routes to notify users
 * of important account events.
 */

import clientPromise from "./mongodb";

export type NotificationType =
  | "trial_started"
  | "trial_ending_soon"
  | "trial_expired"
  | "subscription_activated"
  | "subscription_renewed"
  | "subscription_cancelled"
  | "subscription_expiring"
  | "payment_failed"
  | "payment_receipt"
  | "plan_upgraded"
  | "new_device_login"
  | "security_alert";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
}

/**
 * Create an in-app notification for a user.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const client = await clientPromise;
    const db = client.db();

    await db.collection("notifications").insertOne({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Notification] Failed to create:", err);
  }
}

/**
 * Convenience helpers for common notification scenarios
 */

export async function notifyTrialStarted(userId: string, trialDays: number, endsAt: string): Promise<void> {
  const endDate = new Date(endsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  await createNotification({
    userId,
    type: "trial_started",
    title: "Your trial has started",
    message: `Your ${trialDays}-day Growth trial is active until ${endDate}. Enjoy full access to all Growth features!`,
  });
}

export async function notifyTrialEndingSoon(userId: string, daysLeft: number): Promise<void> {
  await createNotification({
    userId,
    type: "trial_ending_soon",
    title: "Trial ending soon",
    message: `Your Growth trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Upgrade now to keep your access.`,
  });
}

export async function notifyTrialExpired(userId: string): Promise<void> {
  await createNotification({
    userId,
    type: "trial_expired",
    title: "Trial ended",
    message: "Your Growth trial has ended. Your account has been returned to the Free plan. Upgrade anytime to restore access.",
  });
}

export async function notifySubscriptionActivated(userId: string, planName: string): Promise<void> {
  await createNotification({
    userId,
    type: "subscription_activated",
    title: "Subscription active",
    message: `Your ${planName} subscription is now active. Your desktop app will pick up the changes automatically.`,
  });
}

export async function notifySubscriptionRenewed(userId: string, planName: string): Promise<void> {
  await createNotification({
    userId,
    type: "subscription_renewed",
    title: "Subscription renewed",
    message: `Your ${planName} subscription has been renewed successfully.`,
  });
}

export async function notifySubscriptionCancelled(userId: string, planName: string): Promise<void> {
  await createNotification({
    userId,
    type: "subscription_cancelled",
    title: "Subscription cancelled",
    message: `Your ${planName} subscription has been cancelled. You'll retain access until your current period ends.`,
  });
}

export async function notifyPaymentFailed(userId: string, planName: string): Promise<void> {
  await createNotification({
    userId,
    type: "payment_failed",
    title: "Payment failed",
    message: `We couldn't process your payment for the ${planName} subscription. Please update your payment method.`,
  });
}

export async function notifyPlanUpgraded(userId: string, fromPlan: string, toPlan: string): Promise<void> {
  await createNotification({
    userId,
    type: "plan_upgraded",
    title: "Plan upgraded",
    message: `You've upgraded from ${fromPlan} to ${toPlan}. New features are now available!`,
  });
}

export async function notifyNewDeviceLogin(userId: string, deviceName: string, deviceOs: string): Promise<void> {
  await createNotification({
    userId,
    type: "new_device_login",
    title: "New device connected",
    message: `A new ${deviceOs} device "${deviceName}" was connected to your account.`,
  });
}
