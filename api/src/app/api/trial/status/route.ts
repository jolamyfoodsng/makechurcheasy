import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getTrialForUser, migrateEmbeddedTrial } from "@/lib/trialRecords";
import clientPromise from "@/lib/mongodb";

/**
 * GET /api/trial/status
 *
 * Authenticated endpoint (not admin-only) for the desktop app.
 * Returns the server-determined trial state from the `trials` collection.
 *
 * Response:
 * {
 *   trialActive: boolean,
 *   status: "active" | "expired" | "stopped" | "cancelled" | null,
 *   daysRemaining: number,
 *   expiresAt: string | null,
 *   durationDays: number | null,
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();

    // Auto-migrate if user has legacy embedded trial but no trialId
    if (authUser.mongoUser.trial && !authUser.mongoUser.trialId) {
      try {
        await migrateEmbeddedTrial(authUser.mongoUser);
      } catch {
        // Best effort — fall back to embedded data
      }
    }

    // Read from trials collection
    let trialRecord = await getTrialForUser(userId);

    // Fallback: if no trial record exists, check legacy embedded trial
    if (!trialRecord && authUser.mongoUser.trial) {
      const trial = authUser.mongoUser.trial;
      const status = trial.status || (trial.active ? "active" : "expired");
      const now = Date.now();
      const endsAtMs = trial.endsAt ? new Date(trial.endsAt).getTime() : 0;
      const trialActive = status === "active" && endsAtMs > now;
      const daysRemaining = trialActive
        ? Math.max(0, Math.ceil((endsAtMs - now) / (1000 * 60 * 60 * 24)))
        : 0;

      return NextResponse.json({
        trialActive,
        status,
        daysRemaining,
        expiresAt: trial.endsAt || null,
        durationDays: trial.durationDays || null,
      });
    }

    if (!trialRecord) {
      return NextResponse.json({
        trialActive: false,
        status: null,
        daysRemaining: 0,
        expiresAt: null,
        durationDays: null,
      });
    }

    // Determine status from the trial record
    const now = Date.now();
    const endsAtMs = new Date(trialRecord.endsAt).getTime();
    const trialActive = trialRecord.status === "active" && endsAtMs > now;
    const daysRemaining = trialActive
      ? Math.max(0, Math.ceil((endsAtMs - now) / (1000 * 60 * 60 * 24)))
      : 0;

    return NextResponse.json({
      trialActive,
      status: trialRecord.status,
      daysRemaining,
      expiresAt: trialRecord.endsAt,
      durationDays: trialRecord.durationDays,
    });
  } catch (error) {
    console.error("Get trial status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
