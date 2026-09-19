/**
 * GET /api/cron/temporary-plan-expiry
 *
 * Daily cron to expire admin-granted temporary plans and return users to Free.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAllExpiredAdminTemporaryPlans } from "@/lib/adminTemporaryPlan";

const CRON_SECRET = process.env.CRON_SECRET || "";

function verifyAuth(req: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.error("[Temporary Plan Expiry] FATAL: CRON_SECRET not configured");
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkAllExpiredAdminTemporaryPlans();
    console.log(
      `[Temporary Plan Expiry] Processed: ${result.processed}, Expired: ${result.expired}, Errors: ${result.errors}`,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Temporary Plan Expiry] Cron failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
