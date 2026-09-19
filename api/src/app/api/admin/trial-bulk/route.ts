import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { logTrialAction } from "@/lib/trialAudit";
import { getTrialSettings } from "@/lib/trialSettings";
import { getPlatformSettings } from "@/lib/platformSettings";
import {
  getTrialForUser,
  createTrialRecord,
  updateTrialRecord,
} from "@/lib/trialRecords";

type BulkAction = "extend" | "restart" | "stop";

/** Map BulkAction to TrialAuditLog.action */
const ACTION_MAP: Record<BulkAction, "extended" | "restarted" | "stopped"> = {
  extend: "extended",
  restart: "restarted",
  stop: "stopped",
};

/**
 * POST /api/admin/trial-bulk
 *
 * Admin-only endpoint to perform bulk trial actions.
 * All operations go through the `trials` collection.
 * Body: { action: BulkAction, userIds: string[], days?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { action, userIds, days } = body as { action: BulkAction; userIds: string[]; days?: number };

    if (!action || !userIds?.length) {
      return NextResponse.json({ error: "action and userIds are required" }, { status: 400 });
    }

    const validActions: BulkAction[] = ["extend", "restart", "stop"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` }, { status: 400 });
    }

    // Validate days parameter for actions that create/restart trials
    if (days != null && (action === "restart" || action === "extend")) {
      if (!Number.isInteger(days) || days <= 0) {
        return NextResponse.json(
          { error: `days must be a positive integer, got ${days}` },
          { status: 400 }
        );
      }
    }

    const { ObjectId } = await import("mongodb");
    const client = await clientPromise;
    const db = client.db();
    const settings = await getTrialSettings();
    const platformSettings = await getPlatformSettings();
    const now = new Date().toISOString();
    const results: { success: number; failed: number; errors: string[] } = { success: 0, failed: 0, errors: [] };

    for (const userId of userIds) {
      try {
        const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
        if (!user) {
          results.failed++;
          results.errors.push(`${userId}: User not found`);
          continue;
        }

        // Read trial from trials collection
        const currentTrial = await getTrialForUser(userId);
        const previousExpiry = currentTrial?.endsAt || null;

        switch (action) {
          case "extend": {
            if (!currentTrial || currentTrial.status !== "active" || !currentTrial.endsAt) {
              results.failed++;
              results.errors.push(`${userId}: No active trial`);
              continue;
            }
            const addDays = days ?? 7;
            const currentEnd = new Date(currentTrial.endsAt).getTime();
            const newEnd = new Date(currentEnd + addDays * 24 * 60 * 60 * 1000).toISOString();
            await updateTrialRecord(currentTrial._id!.toString(), {
              endsAt: newEnd,
              extendedDays: (currentTrial.extendedDays || 0) + addDays,
              extensionCount: (currentTrial.extensionCount || 0) + 1,
              lastModifiedBy: auth.adminUserId,
            });
            break;
          }

          case "restart": {
            const durationDays = days ?? platformSettings.trial.defaultDurationDays ?? settings.defaultDurationDays;
            if (currentTrial) {
              const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
              await updateTrialRecord(currentTrial._id!.toString(), {
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
              await createTrialRecord(userId, {
                durationDays,
                grantedBy: auth.adminUserId,
              });
            }
            break;
          }

          case "stop": {
            if (!currentTrial || currentTrial.status !== "active") {
              results.failed++;
              results.errors.push(`${userId}: No active trial`);
              continue;
            }
            await updateTrialRecord(currentTrial._id!.toString(), {
              status: "stopped",
              stoppedAt: now,
              stoppedReason: "Bulk stopped by admin",
              lastModifiedBy: auth.adminUserId,
            });
            break;
          }
        }

        // Re-fetch for audit log
        const updatedTrial = await getTrialForUser(userId);

        await logTrialAction({
          userId,
          action: ACTION_MAP[action],
          performedBy: auth.adminUserId,
          previousExpiry: previousExpiry ?? undefined,
          newExpiry: (updatedTrial?.endsAt || previousExpiry) ?? undefined,
          notes: `Bulk ${action}`,
        }).catch(() => { });

        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${userId}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({ ...results });
  } catch (error) {
    console.error("Bulk trial action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
