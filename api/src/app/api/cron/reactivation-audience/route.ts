/**
 * GET /api/cron/reactivation-audience
 *
 * Daily, internal-only refresh of the June-August 2026 Growth reactivation
 * audience. It records eligibility and suppression reasons in MongoDB; it
 * never sends email or syncs contact data to Zoho Campaigns.
 */

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { refreshReactivationAudience } from "@/lib/reactivationAudience";

const CRON_SECRET = process.env.CRON_SECRET || "";

function verifyAuth(req: NextRequest): boolean {
  return Boolean(CRON_SECRET)
    && req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const result = await refreshReactivationAudience(client.db());
    return NextResponse.json({ success: true, sendsEmail: false, ...result });
  } catch (error) {
    console.error("[Reactivation Audience] Daily refresh failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
