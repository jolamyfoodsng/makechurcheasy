import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { logTrialAction, type TrialAction as AuditTrialAction } from "@/lib/trialAudit";
import { createTrialNotification } from "@/lib/trialNotifications";
import { getTrialSettings } from "@/lib/trialSettings";
import { getPlatformSettings } from "@/lib/platformSettings";
import {
  getTrialForUser,
  createTrialRecord,
  updateTrialRecord,
} from "@/lib/trialRecords";
import { getPlanConfig, upsertSubscription, insertCreditTransaction } from "@/lib/db";
import { CreditTransactionType } from "@/types/schemas";

type TrialAction = "start" | "restart" | "extend" | "reduce" | "stop" | "expire" | "reactivate";

/** Map route-level action to audit log action */
const AUDIT_ACTION_MAP: Record<TrialAction, AuditTrialAction> = {
  start: "started",
  restart: "restarted",
  extend: "extended",
  reduce: "extended",
  stop: "stopped",
  expire: "expired",
  reactivate: "reactivated",
};

/**
 * POST /api/admin/users/[id]/trial
 *
 * Admin-only endpoint to perform trial actions on a specific user.
 * All operations go through the `trials` collection.
 * Body: { action: TrialAction, days?: number, reason?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();
    const { action: rawAction, days, reason } = body as { action: string; days?: number; reason?: string };

    if (!rawAction) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const action = ((rawAction as string) === "grant" ? "start" : rawAction) as TrialAction;

    const validActions: TrialAction[] = ["start", "restart", "extend", "reduce", "stop", "expire", "reactivate"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` }, { status: 400 });
    }

    const { ObjectId } = await import("mongodb");
    const client = await clientPromise;
    const db = client.db();

    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (user.role === "admin") {
      return NextResponse.json({ error: "Admin users have full access and cannot have trials modified" }, { status: 400 });
    }

    // Read trial from the trials collection (single source of truth)
    const currentTrial = await getTrialForUser(id);
    const previousExpiry = currentTrial?.endsAt || null;
    const settings = await getTrialSettings();
    const platformSettings = await getPlatformSettings();
    // Prefer platform_settings.trial (admin UI source of truth), fall back to trial_settings
    const durationDays = days ?? platformSettings.trial.defaultDurationDays ?? settings.defaultDurationDays;

    // Validate durationDays for actions that create/restart trials
    if (["start", "restart", "reactivate"].includes(action)) {
      if (!Number.isInteger(durationDays) || durationDays <= 0 || durationDays > 365) {
        return NextResponse.json(
          { error: `durationDays must be an integer between 1 and 365, got ${durationDays}` },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();
    let updatedTrial = currentTrial;
    let notificationType: "trial_started" | "trial_extended" | "trial_restarted" | "trial_stopped" | "trial_expired" | null = null;

    switch (action) {
      case "start": {
        if (currentTrial?.status === "active" && currentTrial.endsAt && new Date(currentTrial.endsAt).getTime() > Date.now()) {
          return NextResponse.json({ error: "User already has an active trial" }, { status: 400 });
        }
        // Create a new trial record
        updatedTrial = await createTrialRecord(id, {
          durationDays,
          grantedBy: auth.adminUserId,
        });
        notificationType = "trial_started";
        break;
      }

      case "restart": {
        const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
        if (currentTrial) {
          updatedTrial = await updateTrialRecord(currentTrial._id!.toString(), {
            status: "active",
            startedAt: now,
            endsAt,
            durationDays,
            extendedDays: 0,
            extensionCount: 0,
            restartedAt: now,
            lastModifiedBy: auth.adminUserId,
          });
        } else {
          updatedTrial = await createTrialRecord(id, {
            durationDays,
            grantedBy: auth.adminUserId,
          });
        }
        notificationType = "trial_restarted";
        break;
      }

      case "extend": {
        if (!currentTrial || currentTrial.status !== "active" || !currentTrial.endsAt) {
          return NextResponse.json({ error: "User has no active trial to extend" }, { status: 400 });
        }
        const addDays = days ?? 7;
        const currentEnd = new Date(currentTrial.endsAt).getTime();
        const newEnd = new Date(currentEnd + addDays * 24 * 60 * 60 * 1000).toISOString();
        updatedTrial = await updateTrialRecord(currentTrial._id!.toString(), {
          endsAt: newEnd,
          extendedDays: (currentTrial.extendedDays || 0) + addDays,
          extensionCount: (currentTrial.extensionCount || 0) + 1,
          lastModifiedBy: auth.adminUserId,
        });
        notificationType = "trial_extended";
        break;
      }

      case "reduce": {
        if (!currentTrial || currentTrial.status !== "active" || !currentTrial.endsAt) {
          return NextResponse.json({ error: "User has no active trial to reduce" }, { status: 400 });
        }
        const removeDays = days ?? 7;
        const currentEnd = new Date(currentTrial.endsAt).getTime();
        const newEndMs = currentEnd - removeDays * 24 * 60 * 60 * 1000;
        const newEnd = new Date(Math.max(newEndMs, Date.now())).toISOString();
        updatedTrial = await updateTrialRecord(currentTrial._id!.toString(), {
          endsAt: newEnd,
          extendedDays: (currentTrial.extendedDays || 0) - removeDays,
          lastModifiedBy: auth.adminUserId,
        });
        notificationType = "trial_extended";
        break;
      }

      case "stop": {
        if (!currentTrial || currentTrial.status !== "active") {
          return NextResponse.json({ error: "User has no active trial to stop" }, { status: 400 });
        }

        // Update trial record to stopped
        updatedTrial = await updateTrialRecord(currentTrial._id!.toString(), {
          status: "stopped",
          stoppedAt: now,
          stoppedReason: reason || "Stopped by admin",
          lastModifiedBy: auth.adminUserId,
        });

        // Downgrade user to free plan with immediate effect
        const planConfig = await getPlanConfig();
        const freeCredits = planConfig.plans.free.credits;
        const prevCredits = typeof user.credits === "number" ? user.credits : freeCredits;

        await db.collection("users").updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              plan: "free",
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
        await upsertSubscription(id, { plan: "free", status: "cancelled" }).catch(() => { });

        // Record credit transaction for audit trail
        await insertCreditTransaction({
          userId: id,
          type: CreditTransactionType.ALLOCATION,
          source: "trial_cancelled",
          amount: freeCredits,
          balanceAfter: freeCredits,
          description: "Trial Cancelled by Admin — Plan Downgraded to Free",
          metadata: {
            previousCredits: prevCredits,
            previousPlan: user.plan || "free",
          },
          createdAt: now,
        });

        notificationType = "trial_stopped";
        break;
      }

      case "expire": {
        if (currentTrial?.status === "expired") {
          return NextResponse.json({ error: "Trial is already expired" }, { status: 400 });
        }
        if (currentTrial) {
          updatedTrial = await updateTrialRecord(currentTrial._id!.toString(), {
            status: "expired",
            lastModifiedBy: auth.adminUserId,
          });
        }

        // Downgrade user to free plan with immediate effect
        const expirePlanConfig = await getPlanConfig();
        const expireFreeCredits = expirePlanConfig.plans.free.credits;
        const expirePrevCredits = typeof user.credits === "number" ? user.credits : expireFreeCredits;

        await db.collection("users").updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              plan: "free",
              credits: expireFreeCredits,
            },
            $unset: {
              trialStartedAt: "",
              trialEndsAt: "",
              trialDurationDays: "",
            },
          }
        );

        await upsertSubscription(id, { plan: "free", status: "cancelled" }).catch(() => { });

        await insertCreditTransaction({
          userId: id,
          type: CreditTransactionType.ALLOCATION,
          source: "trial_expired",
          amount: expireFreeCredits,
          balanceAfter: expireFreeCredits,
          description: "Trial Expired by Admin — Plan Downgraded to Free",
          metadata: {
            previousCredits: expirePrevCredits,
            previousPlan: user.plan || "free",
          },
          createdAt: now,
        });

        notificationType = "trial_expired";
        break;
      }

      case "reactivate": {
        if (currentTrial?.status === "active" && currentTrial.endsAt && new Date(currentTrial.endsAt).getTime() > Date.now()) {
          return NextResponse.json({ error: "User already has an active trial" }, { status: 400 });
        }
        if (currentTrial) {
          const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
          updatedTrial = await updateTrialRecord(currentTrial._id!.toString(), {
            status: "active",
            startedAt: now,
            endsAt,
            durationDays,
            extendedDays: 0,
            extensionCount: 0,
            stoppedAt: null,
            stoppedReason: null,
            lastModifiedBy: auth.adminUserId,
          });
        } else {
          updatedTrial = await createTrialRecord(id, {
            durationDays,
            grantedBy: auth.adminUserId,
          });
        }
        notificationType = "trial_started";
        break;
      }
    }

    // Audit log
    await logTrialAction({
      userId: id,
      action: AUDIT_ACTION_MAP[action],
      performedBy: auth.adminUserId,
      previousExpiry: previousExpiry ?? undefined,
      newExpiry: (updatedTrial?.endsAt || previousExpiry) ?? undefined,
      notes: reason,
    }).catch(() => { });

    // Notification — respect email flags from platform settings
    if (notificationType) {
      const shouldNotify =
        notificationType === "trial_restarted"
          ? platformSettings.trial.sendRestartEmails
          : notificationType === "trial_stopped"
            ? platformSettings.trial.sendStopEmails
            : true;
      if (shouldNotify) {
        await createTrialNotification(id, notificationType).catch(() => { });
      }
    }

    // Return the trial shape expected by the dashboard frontend
    const trialResponse = updatedTrial
      ? {
        active: updatedTrial.status === "active",
        status: updatedTrial.status,
        startedAt: updatedTrial.startedAt,
        endsAt: updatedTrial.endsAt,
        durationDays: updatedTrial.durationDays,
        extendedDays: updatedTrial.extendedDays,
        extensionCount: updatedTrial.extensionCount,
        stoppedAt: updatedTrial.stoppedAt,
        stoppedReason: updatedTrial.stoppedReason,
        restartedAt: updatedTrial.restartedAt,
        grantedBy: updatedTrial.grantedBy,
        lastModifiedBy: updatedTrial.lastModifiedBy,
        welcomeShown: updatedTrial.welcomeShown,
      }
      : null;

    // Include credits when downgrading to free (stop/expire actions)
    let credits: number | undefined;
    if (action === "stop" || action === "expire") {
      const cfg = await getPlanConfig();
      credits = cfg.plans.free.credits;
    }

    return NextResponse.json({ success: true, trial: trialResponse, credits });
  } catch (error) {
    console.error("Trial action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
