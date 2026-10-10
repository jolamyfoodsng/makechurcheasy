/**
 * GET /api/cron/offer-journeys
 *
 * Daily win-back evaluation (04:15 UTC, after trials and temporary plans have
 * been expired for the day). Looks at everyone on an offer ladder, issues the
 * next offer to whoever is due, sends the offer email, and expires old offers.
 *
 * Does nothing unless the global switch in Admin > Offers is on. Protected by
 * CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { runOfferJourneys } from "@/lib/offerJourneys";

const CRON_SECRET = process.env.CRON_SECRET || "";

function verifyAuth(req: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.error("[Offer Journeys] FATAL: CRON_SECRET not configured, rejecting request");
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runOfferJourneys();
    // Samples carry email addresses and are only for the admin dry run.
    const { samples: _samples, ...safeReport } = report;
    void _samples;
    console.log(
      `[Offer Journeys] ran=${report.ran} evaluated=${report.evaluated} issued=${report.issued} emailed=${report.emailed} waiting=${report.waiting} errors=${report.errors}`,
    );
    return NextResponse.json({ success: true, ...safeReport });
  } catch (error) {
    console.error("[Offer Journeys] Failed:", error);
    return NextResponse.json({ error: "Offer journeys run failed" }, { status: 500 });
  }
}
