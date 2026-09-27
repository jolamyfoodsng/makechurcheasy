import clientPromise from "./mongodb";
import { getPlanConfig, upsertSubscription, insertCreditTransaction } from "./db";
import { getPlatformSettings } from "./platformSettings";
import {
  sendEmail,
  trialEndingSoonEmail,
  trial1DayRemainingEmail,
  trialExpiredEmail,
  subscriptionExpiringSoonEmail,
} from "./emailTemplates";
import {
  notifyTrialEndingSoon,
  notifyTrialExpired,
  notifySubscriptionExpiring,
  notifyLowCreditBalance,
} from "./notifications";
import { logTrialAction } from "./trialAudit";
import { updateTrialRecord, type TrialRecord } from "./trialRecords";
import { resetMonthlyIncludedSeconds, getTranscriptionBalanceSummary } from "./transcriptionCredits";
import { CreditTransactionType, type PlanTier } from "@/types/schemas";
import { ObjectId } from "mongodb";

export interface UserTrialPaymentCheckResult {
  trials: {
    reminder3Sent: number;
    reminder1Sent: number;
    expired: number;
    errors: number;
  };
  nearPayment: {
    remindersSent: number;
    warningsSent: number;
    errors: number;
  };
  lowCredit: {
    alertsSent: number;
    errors: number;
  };
  timestamp: string;
}

/**
 * Checks all active trials for upcoming expiration or past due status.
 * Downgrades expired trials immediately and triggers timely reminders.
 */
export async function runTrialChecks(): Promise<UserTrialPaymentCheckResult["trials"]> {
  const client = await clientPromise;
  const db = client.db();
  const planConfig = await getPlanConfig();
  const freeCredits = planConfig.plans.free.credits;
  const platformSettings = await getPlatformSettings();
  const sendExtensionEmails = platformSettings.trial.sendExtensionEmails;
  const now = new Date();
  const nowTime = now.getTime();
  const oneAndHalfDaysFromNow = new Date(nowTime + 1.5 * 24 * 60 * 60 * 1000);
  const threeDaysFromNow = new Date(nowTime + 3 * 24 * 60 * 60 * 1000);

  const stats = { reminder3Sent: 0, reminder1Sent: 0, expired: 0, errors: 0 };

  try {
    const activeTrials = await db
      .collection<TrialRecord>("trials")
      .find({ status: "active" })
      .toArray();

    for (const trial of activeTrials) {
      try {
        const endsAtMs = new Date(trial.endsAt).getTime();
        const user = await db
          .collection("users")
          .findOne({ trialId: trial._id?.toString() });

        if (!user || user.plan !== "free") continue;

        // 1. Check if trial has expired
        if (endsAtMs <= nowTime) {
          if (user.trialExpiredSent || user.lifecycleEmails?.trialExpiredSent) {
            continue;
          }

          // Send expired email
          await sendEmail(
            trialExpiredEmail({
              userName: user.name || "there",
              userEmail: user.email,
            })
          ).catch((e) => console.warn("[runTrialChecks] Expired email send error:", e));

          const prevCredits = typeof user.credits === "number" ? user.credits : freeCredits;

          await updateTrialRecord(trial._id!.toString(), {
            status: "expired",
            lastModifiedBy: "system_cron",
          });

          await db.collection("users").updateOne(
            { _id: user._id },
            {
              $set: {
                plan: "free",
                trialExpiredSent: true,
                credits: freeCredits,
              },
              $unset: {
                trialStartedAt: "",
                trialEndsAt: "",
                trialDurationDays: "",
              },
            }
          );

          await upsertSubscription(user._id.toString(), { plan: "free", status: "cancelled" }).catch(() => {});

          await logTrialAction({
            userId: user._id.toString(),
            action: "expired",
            performedBy: "system",
            previousExpiry: trial.endsAt,
            newExpiry: trial.endsAt,
            notes: "Auto-expired by Cloudflare trial checker",
          }).catch(() => {});

          await insertCreditTransaction({
            userId: user._id.toString(),
            type: CreditTransactionType.ALLOCATION,
            source: "trial_expired",
            amount: freeCredits,
            balanceAfter: freeCredits,
            description: "Trial Expired — Plan Downgraded to Free",
            metadata: {
              previousCredits: prevCredits,
              previousPlan: user.plan || "free",
            },
            createdAt: now.toISOString(),
          }).catch(() => {});

          // Reset monthly transcription allowance to free tier
          await resetMonthlyIncludedSeconds(user._id.toString(), "free", {
            reason: "Trial expired downgrade",
          }).catch(() => {});

          await notifyTrialExpired(user._id.toString());
          stats.expired++;
          continue;
        }

        // 2. Check 1-day reminder (within 1.5 days)
        if (endsAtMs <= oneAndHalfDaysFromNow.getTime()) {
          if (user.trialReminder1Sent || user.lifecycleEmails?.trialEndingTomorrowSent) {
            continue;
          }

          if (sendExtensionEmails) {
            await sendEmail(
              trial1DayRemainingEmail({
                userName: user.name || "there",
                userEmail: user.email,
                trialDays: 1,
                trialEndsAt: trial.endsAt,
              })
            ).catch((e) => console.warn("[runTrialChecks] 1-day email error:", e));
          }

          await db.collection("users").updateOne(
            { _id: user._id },
            { $set: { trialReminder1Sent: true } }
          );

          await notifyTrialEndingSoon(user._id.toString(), 1);
          stats.reminder1Sent++;
          continue;
        }

        // 3. Check 3-day reminder (within 3 days)
        if (endsAtMs <= threeDaysFromNow.getTime()) {
          if (user.trialReminder3Sent || user.lifecycleEmails?.trialEnding2DaysSent) {
            continue;
          }

          if (sendExtensionEmails) {
            await sendEmail(
              trialEndingSoonEmail({
                userName: user.name || "there",
                userEmail: user.email,
                trialDays: 3,
                trialEndsAt: trial.endsAt,
              })
            ).catch((e) => console.warn("[runTrialChecks] 3-day email error:", e));
          }

          await db.collection("users").updateOne(
            { _id: user._id },
            { $set: { trialReminder3Sent: true } }
          );

          await notifyTrialEndingSoon(user._id.toString(), 3);
          stats.reminder3Sent++;
        }
      } catch (err) {
        console.error(`[runTrialChecks] Error on trial ${trial._id}:`, err);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error("[runTrialChecks] Fatal error:", error);
    stats.errors++;
  }

  return stats;
}

/**
 * Checks paid subscriptions approaching renewal or expiration (3 days and 1 day).
 * Sends advance renewal reminders or expiry warnings.
 */
export async function runNearPaymentChecks(): Promise<UserTrialPaymentCheckResult["nearPayment"]> {
  const client = await clientPromise;
  const db = client.db();
  const now = new Date();
  const nowTime = now.getTime();
  const stats = { remindersSent: 0, warningsSent: 0, errors: 0 };

  try {
    const candidateSubs = await db
      .collection("subscriptions")
      .find({
        plan: { $in: ["basic", "growth", "pro"] },
        status: { $in: ["active", "cancelled", "trialing"] },
        currentPeriodEnd: { $exists: true, $nin: [null, ""] },
      })
      .limit(500)
      .toArray();

    for (const sub of candidateSubs) {
      try {
        const periodEndMs = new Date(sub.currentPeriodEnd).getTime();
        if (isNaN(periodEndMs) || periodEndMs <= nowTime) continue;

        const msRemaining = periodEndMs - nowTime;
        const daysLeft = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

        // We target 3-day and 1-day windows
        if (daysLeft > 3) continue;

        const reminderKey = `reminder_${daysLeft}d_${sub.currentPeriodEnd}`;
        if (sub.lastNearPaymentReminderKey === reminderKey) continue;

        const userId = String(sub.userId || "");
        if (!userId) continue;

        let user;
        try {
          user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
        } catch {
          user = await db.collection("users").findOne({ _id: userId as any });
        }

        if (!user || !user.email) continue;

        const planName = String(sub.plan || "Paid").toUpperCase();
        const hasReusableAuth = Boolean(sub.paystackAuthorization?.reusable && sub.paystackAuthorization?.authorization_code);

        if (hasReusableAuth && sub.autoRenew !== false) {
          // Normal auto-renewal coming up
          await sendEmail(
            subscriptionExpiringSoonEmail({
              userName: user.name || "there",
              userEmail: user.email,
              planName,
              expiresAt: new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
              daysLeft,
            })
          ).catch((e) => console.warn("[runNearPaymentChecks] Send renewal reminder error:", e));

          await notifySubscriptionExpiring(userId, planName, daysLeft);
          stats.remindersSent++;
        } else {
          // Manual payment needed or autoRenew disabled — warn user access will revert to Free
          await sendEmail(
            subscriptionExpiringSoonEmail({
              userName: user.name || "there",
              userEmail: user.email,
              planName,
              expiresAt: new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
              daysLeft,
            })
          ).catch((e) => console.warn("[runNearPaymentChecks] Send expiry warning error:", e));

          await notifySubscriptionExpiring(userId, planName, daysLeft);
          stats.warningsSent++;
        }

        await db.collection("subscriptions").updateOne(
          { _id: sub._id },
          { $set: { lastNearPaymentReminderKey: reminderKey, updatedAt: now.toISOString() } }
        );
      } catch (err) {
        console.error(`[runNearPaymentChecks] Error on subscription ${sub._id}:`, err);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error("[runNearPaymentChecks] Fatal error:", error);
    stats.errors++;
  }

  return stats;
}

/**
 * Checks for users whose credits or transcription time is critically low (< 15 mins).
 * Throttles notifications to at most once every 7 days per user.
 */
export async function runLowCreditChecks(): Promise<UserTrialPaymentCheckResult["lowCredit"]> {
  const client = await clientPromise;
  const db = client.db();
  const settings = await getPlatformSettings();
  const stats = { alertsSent: 0, errors: 0 };

  if (!settings.notifications.creditLowBalance) {
    return stats;
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const candidateUsers = await db
      .collection("users")
      .find({
        role: { $ne: "admin" },
        $or: [
          { lastLowCreditAlertAt: { $exists: false } },
          { lastLowCreditAlertAt: { $lt: sevenDaysAgo } },
        ],
      })
      .limit(200)
      .toArray();

    for (const user of candidateUsers) {
      try {
        const userId = user._id.toString();
        const summary = await getTranscriptionBalanceSummary(userId, user);

        if (summary.isAdmin || summary.unlimited) continue;

        // Low threshold: available hours < 0.25 (15 mins) AND credits < 15
        const isLow = summary.totalAvailableHours < 0.25 || summary.totalAvailableCredits < 15;

        if (isLow) {
          const remainingDesc = summary.formattedRemaining || `${Math.round(summary.totalAvailableCredits)} credits`;
          await notifyLowCreditBalance(userId, remainingDesc);

          await db.collection("users").updateOne(
            { _id: user._id },
            { $set: { lastLowCreditAlertAt: now.toISOString() } }
          );
          stats.alertsSent++;
        }
      } catch (err) {
        console.error(`[runLowCreditChecks] Error checking user ${user._id}:`, err);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error("[runLowCreditChecks] Fatal error:", error);
    stats.errors++;
  }

  return stats;
}

/**
 * Unified execution function called by Cloudflare scheduled worker or manual dispatcher
 */
export async function runAllUserTrialAndPaymentChecks(): Promise<UserTrialPaymentCheckResult> {
  const [trials, nearPayment, lowCredit] = await Promise.all([
    runTrialChecks(),
    runNearPaymentChecks(),
    runLowCreditChecks(),
  ]);

  return {
    trials,
    nearPayment,
    lowCredit,
    timestamp: new Date().toISOString(),
  };
}
