/**
 * GET /api/cron/lifecycle-emails
 *
 * Vercel Cron job — runs every 5 minutes to send onboarding lifecycle emails:
 *
 *   Email 3: Trial Activated       — 5–10 min after email verification
 *   Email 4: Day 1 Activation      — 24 hours after email verification
 *   Email 5: Day 3 Feature Discovery — 3 days after email verification
 *   Email 6: Day 5 Value Email      — 5 days after email verification
 *   Email 7: Trial Ends in 2 Days   — 48 hours before trial expiry
 *   Email 8: Trial Ends Tomorrow    — 24 hours before trial expiry
 *   Email 9: Trial Expired          — at trial expiry
 *   Email 10: Re-engagement         — 7 days after trial expiry
 *
 * Protected by CRON_SECRET — only Vercel cron or the secret bearer token can call this.
 */

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import {
  sendEmail,
  trialActivatedEmail,
  trialDay1ActivationEmail,
  activationNudgeEmail,
  trialDay3FeatureDiscoveryEmail,
  trialDay5FeatureDrivingEmail,
  trialEndingSoonEmail,
  trial1DayRemainingEmail,
  trialExpiredEmail,
  reEngagementEmail,
} from "@/lib/emailTemplates";
import { getPlatformSettings } from "@/lib/platformSettings";
import { getPlanConfig, upsertSubscription, insertCreditTransaction } from "@/lib/db";
import { logTrialAction } from "@/lib/trialAudit";
import { notifyTrialEndingSoon, notifyTrialExpired } from "@/lib/notifications";
import { getTrialForUser, updateTrialRecord } from "@/lib/trialRecords";
import { CreditTransactionType } from "@/types/schemas";

const CRON_SECRET = process.env.CRON_SECRET || "";

function verifyAuth(req: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.error("[Lifecycle Emails] FATAL: CRON_SECRET not configured — rejecting request");
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
    const now = new Date();
    const platformSettings = await getPlatformSettings();
    const sendExtensionEmails = platformSettings.trial.sendExtensionEmails;
    const sendTrialExpiryEmails = platformSettings.notifications.trialExpiryReminder;
    const planConfig = await getPlanConfig();
    const freeCredits = planConfig.plans.free.credits;

    const results = {
      trialActivated: 0,
      day1: 0,
      activationNudge: 0,
      day3: 0,
      day5: 0,
      trialEnding2Days: 0,
      trialEndingTomorrow: 0,
      trialExpired: 0,
      reEngagement: 0,
      errors: 0,
    };

    // ───────────────────────────────────────────────────────────────────────
    // Helper: common trial-active query filter
    // ───────────────────────────────────────────────────────────────────────
    const activeTrialFilter = {
      $or: [
        { "trial.status": "active", "trial.endsAt": { $exists: true, $nin: [null, ""] } },
        { "trial.active": true, "trial.endsAt": { $exists: true, $nin: [null, ""] }, "trial.status": { $exists: false } },
        { trialEndsAt: { $exists: true, $nin: [null, ""] }, trialStartedAt: { $exists: true, $ne: null } },
      ],
    };

    // ───────────────────────────────────────────────────────────────────────
    // Email 3: Trial Activated — 5–10 minutes after emailVerifiedAt
    // ───────────────────────────────────────────────────────────────────────
    const fiveMinsAgo = new Date(now.getTime() - 10 * 60 * 1000); // 10 min window
    const tenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000); // 15 min window

    const trialActivatedUsers = await db
      .collection("users")
      .find({
        emailVerified: true,
        emailVerifiedAt: { $exists: true, $nin: [null, ""] },
        ...activeTrialFilter,
        "lifecycleEmails.trialActivatedSent": { $ne: true },
        $expr: {
          $and: [
            { $lte: [{ $toDate: "$emailVerifiedAt" }, fiveMinsAgo.toISOString()] },
            { $gt: [{ $toDate: "$emailVerifiedAt" }, tenMinsAgo.toISOString()] },
          ],
        },
      })
      .toArray();

    for (const user of trialActivatedUsers) {
      try {
        const userTrial = user.trial;
        const trialEndsAt = userTrial?.endsAt || user.trialEndsAt;
        const trialDays = userTrial?.durationDays || 14;

        if (sendExtensionEmails && trialEndsAt) {
          await sendEmail(
            trialActivatedEmail({
              userName: user.name || "there",
              userEmail: user.email,
              trialDays,
              trialEndsAt,
            })
          );
        }

        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { "lifecycleEmails.trialActivatedSent": true } }
        );
        results.trialActivated++;
      } catch (err) {
        console.error(`[Lifecycle Emails] Failed to send trial activated email to ${user.email}:`, err);
        results.errors++;
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Email 4: Day 1 Activation — ~24 hours after emailVerifiedAt
    // ───────────────────────────────────────────────────────────────────────
    const twentyFourHoursAgo = new Date(now.getTime() - 26 * 60 * 60 * 1000);
    const twentyTwoHoursAgo = new Date(now.getTime() - 22 * 60 * 60 * 1000);

    const day1Users = await db
      .collection("users")
      .find({
        emailVerified: true,
        emailVerifiedAt: { $exists: true, $nin: [null, ""] },
        ...activeTrialFilter,
        "lifecycleEmails.day1ActivationSent": { $ne: true },
        $expr: {
          $and: [
            { $lte: [{ $toDate: "$emailVerifiedAt" }, twentyTwoHoursAgo.toISOString()] },
            { $gt: [{ $toDate: "$emailVerifiedAt" }, twentyFourHoursAgo.toISOString()] },
          ],
        },
      })
      .toArray();

    for (const user of day1Users) {
      try {
        const userTrial = user.trial;
        const trialEndsAt = userTrial?.endsAt || user.trialEndsAt;
        const trialDays = userTrial?.durationDays || 14;

        if (sendExtensionEmails && trialEndsAt) {
          await sendEmail(
            trialDay1ActivationEmail({
              userName: user.name || "there",
              userEmail: user.email,
              trialDays,
              trialEndsAt,
            })
          );
        }

        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { "lifecycleEmails.day1ActivationSent": true } }
        );
        results.day1++;
      } catch (err) {
        console.error(`[Lifecycle Emails] Failed to send day 1 email to ${user.email}:`, err);
        results.errors++;
      }
    }

    // Activated-trial users do not have an active trial until they connect
    // OBS. Give them one focused reminder instead of pretending the trial is
    // already running.
    const activationNudgeStart = new Date(now.getTime() - 30 * 60 * 60 * 1000);
    const activationNudgeEnd = new Date(now.getTime() - 20 * 60 * 60 * 1000);
    const activationNudgeUsers = await db
      .collection("users")
      .find({
        emailVerified: true,
        "trialExperiment.variant": "activated_7d",
        "trialExperiment.activationRequired": true,
        "lifecycleEmails.activationNudgeSent": { $ne: true },
        "activationMilestones.obsConnected": { $ne: true },
        emailVerifiedAt: { $exists: true, $nin: [null, ""] },
        $expr: {
          $and: [
            { $lte: [{ $toDate: "$emailVerifiedAt" }, activationNudgeStart.toISOString()] },
            { $gt: [{ $toDate: "$emailVerifiedAt" }, activationNudgeEnd.toISOString()] },
          ],
        },
      })
      .toArray();

    for (const user of activationNudgeUsers) {
      try {
        if (sendExtensionEmails) {
          await sendEmail(
            activationNudgeEmail({
              userName: user.name || "there",
              userEmail: user.email,
              trialDays: user.trialExperiment?.durationDays || 7,
              activationRequired: true,
            }),
          );
        }
        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { "lifecycleEmails.activationNudgeSent": true } },
        );
        results.activationNudge++;
      } catch (err) {
        console.error(`[Lifecycle Emails] Failed to send activation reminder to ${user.email}:`, err);
        results.errors++;
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Email 5: Day 3 Feature Discovery — ~3 days after emailVerifiedAt
    // ───────────────────────────────────────────────────────────────────────
    const threeDaysAgo = new Date(now.getTime() - 3.2 * 24 * 60 * 60 * 1000);
    const twoAndHalfDaysAgo = new Date(now.getTime() - 2.5 * 24 * 60 * 60 * 1000);

    const day3Users = await db
      .collection("users")
      .find({
        emailVerified: true,
        emailVerifiedAt: { $exists: true, $nin: [null, ""] },
        ...activeTrialFilter,
        "lifecycleEmails.day3FeatureDiscoverySent": { $ne: true },
        $expr: {
          $and: [
            { $lte: [{ $toDate: "$emailVerifiedAt" }, twoAndHalfDaysAgo.toISOString()] },
            { $gt: [{ $toDate: "$emailVerifiedAt" }, threeDaysAgo.toISOString()] },
          ],
        },
      })
      .toArray();

    for (const user of day3Users) {
      try {
        const userTrial = user.trial;
        const trialEndsAt = userTrial?.endsAt || user.trialEndsAt;
        const trialDays = userTrial?.durationDays || 14;

        if (sendExtensionEmails && trialEndsAt) {
          await sendEmail(
            trialDay3FeatureDiscoveryEmail({
              userName: user.name || "there",
              userEmail: user.email,
              trialDays,
              trialEndsAt,
            })
          );
        }

        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { "lifecycleEmails.day3FeatureDiscoverySent": true } }
        );
        results.day3++;
      } catch (err) {
        console.error(`[Lifecycle Emails] Failed to send day 3 email to ${user.email}:`, err);
        results.errors++;
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Email 6: Day 5 Value Email — ~5 days after emailVerifiedAt
    // ───────────────────────────────────────────────────────────────────────
    const fiveDaysAgo = new Date(now.getTime() - 5.2 * 24 * 60 * 60 * 1000);
    const fourAndHalfDaysAgo = new Date(now.getTime() - 4.5 * 24 * 60 * 60 * 1000);

    const day5Users = await db
      .collection("users")
      .find({
        emailVerified: true,
        emailVerifiedAt: { $exists: true, $nin: [null, ""] },
        ...activeTrialFilter,
        "lifecycleEmails.day5ValueSent": { $ne: true },
        $expr: {
          $and: [
            { $lte: [{ $toDate: "$emailVerifiedAt" }, fourAndHalfDaysAgo.toISOString()] },
            { $gt: [{ $toDate: "$emailVerifiedAt" }, fiveDaysAgo.toISOString()] },
          ],
        },
      })
      .toArray();

    for (const user of day5Users) {
      try {
        const userTrial = user.trial;
        const trialEndsAt = userTrial?.endsAt || user.trialEndsAt;
        const trialDays = userTrial?.durationDays || 14;

        if (sendExtensionEmails && trialEndsAt) {
          await sendEmail(
            trialDay5FeatureDrivingEmail({
              userName: user.name || "there",
              userEmail: user.email,
              trialDays,
              trialEndsAt,
            })
          );
        }

        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { "lifecycleEmails.day5ValueSent": true } }
        );
        results.day5++;
      } catch (err) {
        console.error(`[Lifecycle Emails] Failed to send day 5 email to ${user.email}:`, err);
        results.errors++;
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Email 7: Trial Ends in 2 Days — 48 hours before trial expiry
    // ───────────────────────────────────────────────────────────────────────
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const oneAndHalfDaysFromNow = new Date(now.getTime() + 1.5 * 24 * 60 * 60 * 1000);

    const trialEnding2Users = await db
      .collection("users")
      .find({
        ...activeTrialFilter,
        "lifecycleEmails.trialEnding2DaysSent": { $ne: true },
        $and: [
          {
            $expr: {
              $gt: [
                { $toDate: { $ifNull: ["$trial.endsAt", "$trialEndsAt"] } },
                now.toISOString(),
              ],
            },
          },
          {
            $expr: {
              $lte: [
                { $toDate: { $ifNull: ["$trial.endsAt", "$trialEndsAt"] } },
                twoDaysFromNow.toISOString(),
              ],
            },
          },
          {
            $expr: {
              $gt: [
                { $toDate: { $ifNull: ["$trial.endsAt", "$trialEndsAt"] } },
                oneAndHalfDaysFromNow.toISOString(),
              ],
            },
          },
        ],
      })
      .toArray();

    for (const user of trialEnding2Users) {
      try {
        const userTrialEndsAt = user.trial?.endsAt || user.trialEndsAt;
        const trialDays = user.trial?.durationDays || 14;

        if (sendExtensionEmails && sendTrialExpiryEmails && userTrialEndsAt) {
          await sendEmail(
            trialEndingSoonEmail({
              userName: user.name || "there",
              userEmail: user.email,
              trialDays: 2,
              trialEndsAt: userTrialEndsAt,
            })
          );
        }

        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { "lifecycleEmails.trialEnding2DaysSent": true } }
        );
        await notifyTrialEndingSoon(user._id.toString(), 2).catch(() => { });
        results.trialEnding2Days++;
      } catch (err) {
        console.error(`[Lifecycle Emails] Failed to send 2-day trial ending email to ${user.email}:`, err);
        results.errors++;
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Email 8: Trial Ends Tomorrow — 24 hours before trial expiry
    // ───────────────────────────────────────────────────────────────────────
    const tomorrow = new Date(now.getTime() + 1.5 * 24 * 60 * 60 * 1000);

    const trialEndingTomorrowUsers = await db
      .collection("users")
      .find({
        ...activeTrialFilter,
        "lifecycleEmails.trialEndingTomorrowSent": { $ne: true },
        $and: [
          {
            $expr: {
              $gt: [
                { $toDate: { $ifNull: ["$trial.endsAt", "$trialEndsAt"] } },
                now.toISOString(),
              ],
            },
          },
          {
            $expr: {
              $lte: [
                { $toDate: { $ifNull: ["$trial.endsAt", "$trialEndsAt"] } },
                tomorrow.toISOString(),
              ],
            },
          },
        ],
      })
      .toArray();

    for (const user of trialEndingTomorrowUsers) {
      try {
        const userTrialEndsAt = user.trial?.endsAt || user.trialEndsAt;
        const trialDays = user.trial?.durationDays || 14;

        if (sendExtensionEmails && sendTrialExpiryEmails && userTrialEndsAt) {
          await sendEmail(
            trial1DayRemainingEmail({
              userName: user.name || "there",
              userEmail: user.email,
              trialDays: 1,
              trialEndsAt: userTrialEndsAt,
            })
          );
        }

        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { "lifecycleEmails.trialEndingTomorrowSent": true } }
        );
        await notifyTrialEndingSoon(user._id.toString(), 1).catch(() => { });
        results.trialEndingTomorrow++;
      } catch (err) {
        console.error(`[Lifecycle Emails] Failed to send tomorrow trial ending email to ${user.email}:`, err);
        results.errors++;
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Email 9: Trial Expired — trial has ended
    // ───────────────────────────────────────────────────────────────────────
    const expiredUsers = await db
      .collection("users")
      .find({
        ...activeTrialFilter,
        "lifecycleEmails.trialExpiredSent": { $ne: true },
        $expr: {
          $lte: [
            { $toDate: { $ifNull: ["$trial.endsAt", "$trialEndsAt"] } },
            now.toISOString(),
          ],
        },
      })
      .toArray();

    for (const user of expiredUsers) {
      try {
        const userTrialEndsAt = user.trial?.endsAt || user.trialEndsAt;
        const prevCredits = typeof user.credits === "number" ? user.credits : freeCredits;

        // Send trial expired email
        if (sendExtensionEmails && sendTrialExpiryEmails) {
          await sendEmail(
            trialExpiredEmail({
              userName: user.name || "there",
              userEmail: user.email,
            })
          );
        }

        // Update trial record in trials collection (source of truth) AND
        // sync back to user doc via updateTrialRecord.
        const trialRecord = await getTrialForUser(user._id.toString());
        if (trialRecord?._id) {
          await updateTrialRecord(trialRecord._id.toString(), { status: "expired" }).catch(() => { });
        }

        // Downgrade plan, clear legacy fields, and update lifecycle flags
        await db.collection("users").updateOne(
          { _id: user._id },
          {
            $set: {
              plan: "free",
              "lifecycleEmails.trialExpiredSent": true,
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
          previousExpiry: userTrialEndsAt,
          newExpiry: userTrialEndsAt,
          notes: "Auto-expired by lifecycle cron",
        }).catch(() => { });

        // Credit transaction
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

        await notifyTrialExpired(user._id.toString()).catch(() => { });
        results.trialExpired++;
      } catch (err) {
        console.error(`[Lifecycle Emails] Failed to process expired trial for ${user.email}:`, err);
        results.errors++;
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Email 10: Re-engagement — 7 days after trial expiry
    // ───────────────────────────────────────────────────────────────────────
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const reEngagementUsers = await db
      .collection("users")
      .find({
        plan: "free",
        emailVerified: true,
        "lifecycleEmails.trialExpiredSent": true,
        "lifecycleEmails.reEngagementSent": { $ne: true },
        "trial.status": "expired",
        $or: [
          { "trial.stoppedAt": { $exists: false } },
          { "trial.stoppedAt": null },
          { "trial.stoppedAt": "" },
        ],
        $expr: {
          $and: [
            {
              $lte: [
                { $toDate: { $ifNull: ["$trial.stoppedAt", "$trial.stoppedAt"] } },
                sevenDaysAgo.toISOString(),
              ],
            },
          ],
        },
      })
      .toArray();

    // Also find users where the trial ended 7+ days ago but we don't have a stoppedAt
    // Use emailVerifiedAt + trial duration as a fallback
    const reEngagementUsersAlt = await db
      .collection("users")
      .find({
        plan: "free",
        emailVerified: true,
        "lifecycleEmails.trialExpiredSent": true,
        "lifecycleEmails.reEngagementSent": { $ne: true },
        "trial.status": "expired",
        "trial.endsAt": { $exists: true, $nin: [null, ""] },
        $expr: {
          $lte: [
            { $toDate: "$trial.endsAt" },
            sevenDaysAgo.toISOString(),
          ],
        },
      })
      .toArray();

    // Merge both result sets (deduplicate by _id)
    const reEngagementMap = new Map<string, any>();
    for (const u of [...reEngagementUsers, ...reEngagementUsersAlt]) {
      reEngagementMap.set(u._id.toString(), u);
    }
    const allReEngagementUsers = Array.from(reEngagementMap.values());

    for (const user of allReEngagementUsers) {
      try {
        await sendEmail(
          reEngagementEmail({
            userName: user.name || "there",
            userEmail: user.email,
          })
        );

        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { "lifecycleEmails.reEngagementSent": true } }
        );
        results.reEngagement++;
      } catch (err) {
        console.error(`[Lifecycle Emails] Failed to send re-engagement email to ${user.email}:`, err);
        results.errors++;
      }
    }

    console.log(
      `[Lifecycle Emails] Done: ${results.trialActivated} trial-activated, ${results.day1} day-1, ${results.activationNudge} activation reminders, ${results.day3} day-3, ${results.day5} day-5, ${results.trialEnding2Days} ending-2d, ${results.trialEndingTomorrow} ending-tmrw, ${results.trialExpired} expired, ${results.reEngagement} re-engagement, ${results.errors} errors`
    );

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[Lifecycle Emails] Error:", error);
    return NextResponse.json({ error: "Lifecycle email check failed" }, { status: 500 });
  }
}
