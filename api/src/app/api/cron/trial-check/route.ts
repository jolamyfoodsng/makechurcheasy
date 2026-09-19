/**
 * GET /api/cron/trial-check
 *
 * Vercel Cron job — runs daily to:
 * 1. Send 3-day trial ending reminder
 * 2. Send 1-day trial ending reminder
 * 3. Process expired trials — downgrade to free + send expired email
 * 4. Paid subscription expiry/reconciliation is handled by subscription-lifecycle.
 *
 * Reads trial data from the `trials` collection (single source of truth).
 * Protected by CRON_SECRET — only Vercel cron or the secret bearer token can call this.
 */

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import {
  sendEmail,
  trialEndingSoonEmail,
  trial1DayRemainingEmail,
  trialExpiredEmail,
} from "@/lib/emailTemplates";
import { notifyTrialEndingSoon, notifyTrialExpired } from "@/lib/notifications";
import { insertCreditTransaction, getPlanConfig, upsertSubscription } from "@/lib/db";
import { logTrialAction } from "@/lib/trialAudit";
import { getPlatformSettings } from "@/lib/platformSettings";
import { updateTrialRecord } from "@/lib/trialRecords";
import type { TrialRecord } from "@/lib/trialRecords";
import { CreditTransactionType } from "@/types/schemas";

const CRON_SECRET = process.env.CRON_SECRET || "";

function verifyAuth(req: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.error("[Trial Check] FATAL: CRON_SECRET not configured — rejecting request");
    return false;
  }
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    const planConfig = await getPlanConfig();
    const freeCredits = planConfig.plans.free.credits;
    const platformSettings = await getPlatformSettings();
    const sendExtensionEmails = platformSettings.trial.sendExtensionEmails;
    const now = new Date();
    const nowIso = now.toISOString();
    const oneAndHalfDaysFromNow = new Date(now.getTime() + 1.5 * 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const results = { reminder3: 0, reminder1: 0, expired: 0, errors: 0 };

    // ── Trial processing: read from `trials` collection ──────────────────

    // 1. 3-day reminder: active trials ending within 3 days but more than 1.5 days
    const activeTrials = await db
      .collection<TrialRecord>("trials")
      .find({ status: "active" })
      .toArray();

    for (const trial of activeTrials) {
      try {
        const endsAtMs = new Date(trial.endsAt).getTime();
        if (endsAtMs <= now.getTime()) continue; // Already expired — handled below
        if (endsAtMs > threeDaysFromNow.getTime()) continue; // More than 3 days away
        if (endsAtMs <= oneAndHalfDaysFromNow.getTime()) continue; // Within 1.5 days — handled by reminder1

        // Check if user is on free plan and hasn't been notified
        const user = await db.collection("users").findOne({ trialId: trial._id?.toString() });
        if (!user || user.plan !== "free") continue;
        if (user.trialReminder3Sent) continue;
        if (user.lifecycleEmails?.trialEnding2DaysSent) continue;

        if (sendExtensionEmails) {
          await sendEmail(
            trialEndingSoonEmail({
              userName: user.name || "there",
              userEmail: user.email,
              trialDays: 3,
              trialEndsAt: trial.endsAt,
            })
          );
        }

        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { trialReminder3Sent: true } }
        );

        await notifyTrialEndingSoon(user._id.toString(), 3);
        results.reminder3++;
      } catch (err) {
        console.error(`[Trial Check] Failed to send 3-day reminder for trial ${trial._id}:`, err);
        results.errors++;
      }
    }

    // 2. 1-day reminder: active trials ending within 1.5 days
    for (const trial of activeTrials) {
      try {
        const endsAtMs = new Date(trial.endsAt).getTime();
        if (endsAtMs <= now.getTime()) continue;
        if (endsAtMs > oneAndHalfDaysFromNow.getTime()) continue;

        const user = await db.collection("users").findOne({ trialId: trial._id?.toString() });
        if (!user || user.plan !== "free") continue;
        if (user.trialReminder1Sent) continue;
        if (user.lifecycleEmails?.trialEndingTomorrowSent) continue;

        if (sendExtensionEmails) {
          await sendEmail(
            trial1DayRemainingEmail({
              userName: user.name || "there",
              userEmail: user.email,
              trialDays: 1,
              trialEndsAt: trial.endsAt,
            })
          );
        }

        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { trialReminder1Sent: true } }
        );

        await notifyTrialEndingSoon(user._id.toString(), 1);
        results.reminder1++;
      } catch (err) {
        console.error(`[Trial Check] Failed to send 1-day reminder for trial ${trial._id}:`, err);
        results.errors++;
      }
    }

    // 3. Process expired trials — downgrade to free
    for (const trial of activeTrials) {
      try {
        const endsAtMs = new Date(trial.endsAt).getTime();
        if (endsAtMs > now.getTime()) continue; // Not expired yet

        const user = await db.collection("users").findOne({ trialId: trial._id?.toString() });
        if (!user || user.plan !== "free") continue;
        if (user.trialExpiredSent) continue;
        if (user.lifecycleEmails?.trialExpiredSent) continue;

        // Send expired email
        await sendEmail(
          trialExpiredEmail({
            userName: user.name || "there",
            userEmail: user.email,
          })
        );

        const prevCredits = typeof user.credits === "number" ? user.credits : freeCredits;

        // Update trial record to expired
        await updateTrialRecord(trial._id!.toString(), {
          status: "expired",
          lastModifiedBy: "system",
        });

        // Downgrade user to free
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

        // Sync subscription collection
        await upsertSubscription(user._id.toString(), { plan: "free", status: "cancelled" }).catch(() => { });

        // Audit log
        await logTrialAction({
          userId: user._id.toString(),
          action: "expired",
          performedBy: "system",
          previousExpiry: trial.endsAt,
          newExpiry: trial.endsAt,
          notes: "Auto-expired by daily cron",
        }).catch(() => { });

        // Record credit transaction
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
          createdAt: new Date().toISOString(),
        });

        await notifyTrialExpired(user._id.toString());
        results.expired++;
      } catch (err) {
        console.error(`[Trial Check] Failed to process expired trial ${trial._id}:`, err);
        results.errors++;
      }
    }

    console.log(
      `[Trial Check] Done: ${results.reminder3} 3-day, ${results.reminder1} 1-day, ${results.expired} expired, ${results.errors} errors`
    );

    return NextResponse.json({ success: true, ...results, timestamp: nowIso });
  } catch (error) {
    console.error("[Trial Check] Error:", error);
    return NextResponse.json({ error: "Trial check failed" }, { status: 500 });
  }
}
