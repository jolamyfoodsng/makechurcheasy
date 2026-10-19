/**
 * GET|POST /api/cron/update-campaign-prune
 *
 * Takes users who have already updated the desktop app off the Zoho Campaigns
 * "Update - Windows" / "Update - Mac" lists, so the remaining update emails only
 * reach people who still need them. Returns counts only, never addresses.
 *
 * Dry run by default. Add ?apply=true to actually remove people.
 */

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { pruneUpdatedUsersFromUpdateLists } from "@/lib/updateCampaignPrune";

export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET || "";

function verifyAuth(req: NextRequest): boolean {
  return Boolean(CRON_SECRET)
    && req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

async function handle(req: NextRequest) {
  if (!verifyAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const apply = req.nextUrl.searchParams.get("apply") === "true";
    const result = await pruneUpdatedUsersFromUpdateLists(client.db(), { apply });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Update Campaign] Prune failed:", error instanceof Error ? error.name : "unknown_error");
    return NextResponse.json({ error: "Update campaign prune failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
