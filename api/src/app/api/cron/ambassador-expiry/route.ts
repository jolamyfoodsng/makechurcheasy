/**
 * GET /api/cron/ambassador-expiry
 *
 * Vercel Cron job — runs daily to auto-expire ambassador access.
 *
 * Finds all users with `ambassador.active: true` and `ambassador.expiresAt`
 * in the past, then for each user:
 *   1. Reverts plan to previousPlan
 *   2. Revokes ambassador credits (capped at freePlanCredits)
 *   3. Records credit transaction
 *   4. Inserts audit log
 *   5. Syncs subscription collection
 *
 * Protected by CRON_SECRET — only Vercel cron or the secret bearer token can call this.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAllExpiredAmbassadors } from "@/lib/ambassadorExpiration";

const CRON_SECRET = process.env.CRON_SECRET || "";

function verifyAuth(req: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.error("[Ambassador Expiry] FATAL: CRON_SECRET not configured — rejecting request");
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
    const result = await checkAllExpiredAmbassadors();

    console.log(
      `[Ambassador Expiry] Processed: ${result.processed}, Expired: ${result.expired}, Errors: ${result.errors}`,
    );

    return NextResponse.json({
      success: true,
      processed: result.processed,
      expired: result.expired,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[Ambassador Expiry] Cron failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
